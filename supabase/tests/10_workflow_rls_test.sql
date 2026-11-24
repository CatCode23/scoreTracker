-- Database workflow + RLS test (runs via scripts/test-db.sh against a throwaway DB).
-- Covers the manual E2E script in docs/TEST_PLAN.md at the database layer, plus
-- negative permission checks. Any failed assertion aborts with an error.

\set ON_ERROR_STOP 1

create function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', label; end if;
  raise notice 'ok - %', label;
end; $$;

-- Run SQL as a given user (null = anon) and expect it to fail.
create function pg_temp.fails(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (rejected: %)', label, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED (statement succeeded): %', label;
end; $$;

create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  if p_uid is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end; $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Users (created as postgres, i.e. "Supabase dashboard / SQL editor")
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'scorer@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'lead@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'manager@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'other-scorer@example.test'),
  ('00000000-0000-0000-0000-00000000000f', 'stranger@example.test');

select pg_temp.ok((select count(*) = 6 from public.profiles where not active), 'new auth users get inactive profiles');

-- Bootstrap first admin (documented in README)
update public.profiles set role = 'operations_admin', active = true where email = 'admin@example.test';

-- ---------------------------------------------------------------------------
-- 1-3. Admin: teams, registration, schedule, stage, matches, assignments
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

update public.profiles set active = true, role = 'scorer' where email in ('scorer@example.test', 'other-scorer@example.test');
update public.profiles set active = true, role = 'venue_lead' where email = 'lead@example.test';
update public.profiles set active = true, role = 'sport_manager' where email = 'manager@example.test';

select pg_temp.ok(public.load_preliminary_schedule(2026) = 20, 'preliminary schedule loads 20 sessions');
select pg_temp.ok(public.load_preliminary_schedule(2026) = 0, 'schedule loader does not duplicate');
select pg_temp.ok((select start_date = '2026-12-08' from public.events where event_code = 'BPT'), 'BPT dated Dec 8');

insert into public.teams (id, team_name, unit, player_count, captain_name) values
  ('10000000-0000-0000-0000-000000000001', 'Raptors', '1-2 SBCT', 12, 'CPT Restricted Name'),
  ('10000000-0000-0000-0000-000000000002', 'Lancers', '2-2 SBCT', 11, 'SFC Restricted Name'),
  ('10000000-0000-0000-0000-000000000003', 'Hawks', '16th CAB', 10, null);

insert into public.event_participants (id, event_id, team_id, seed)
select v.id, e.id, v.team_id, v.seed
from public.events e,
     (values ('20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 1),
             ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 2),
             ('20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 3))
       as v(id, team_id, seed)
where e.event_code = 'SOC';

select pg_temp.fails($$insert into public.event_participants (event_id, team_id)
  select id, '10000000-0000-0000-0000-000000000001' from public.events where event_code = 'SOC'$$,
  'duplicate team registration in same event');

insert into public.stages (id, event_id, stage_name, stage_order, stage_type)
select '30000000-0000-0000-0000-000000000001', id, 'Championship Bracket', 1, 'elimination'
from public.events where event_code = 'SOC';

insert into public.matches (id, event_id, stage_id, match_code, round_name, round_order, match_number, session_id)
select '40000000-0000-0000-0000-000000000001', e.id, '30000000-0000-0000-0000-000000000001', 'SOC-R1-M1', 'Round 1', 1, 1,
       (select id from public.event_sessions s where s.event_id = e.id order by session_date limit 1)
from public.events e where e.event_code = 'SOC';
insert into public.matches (id, event_id, stage_id, match_code, round_name, round_order, match_number)
select '40000000-0000-0000-0000-000000000002', e.id, '30000000-0000-0000-0000-000000000001', 'SOC-SF-M1', 'Semifinal', 2, 1
from public.events e where e.event_code = 'SOC';
update public.matches set next_winner_match_id = '40000000-0000-0000-0000-000000000002', next_winner_slot = 'A'
where id = '40000000-0000-0000-0000-000000000001';

insert into public.match_participants (match_id, participant_id, slot, source_type) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', 'seed'),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'B', 'seed'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'B', 'seed');

select pg_temp.fails($$insert into public.match_participants (match_id, participant_id, slot)
  values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'C')$$,
  'team cannot face itself (same participant twice in a match)');

-- Assignments: scorer + lead at the Soccer venue; manager for Soccer; other scorer at wrong venue
insert into public.user_assignments (profile_id, event_id, venue, assignment_role)
select '00000000-0000-0000-0000-00000000000b'::uuid, id, 'North Fort Athletic Complex'::text, 'scorer'::text from public.events where event_code = 'SOC'
union all
select '00000000-0000-0000-0000-00000000000c'::uuid, id, 'North Fort Athletic Complex', 'venue_lead' from public.events where event_code = 'SOC'
union all
select '00000000-0000-0000-0000-00000000000d'::uuid, id, null::text, 'sport_manager' from public.events where event_code = 'SOC'
union all
select '00000000-0000-0000-0000-00000000000e'::uuid, id, 'Some Other Field', 'scorer' from public.events where event_code = 'SOC';

reset role;

-- ---------------------------------------------------------------------------
-- Public (anon) cannot read raw tables or restricted data
-- ---------------------------------------------------------------------------
select pg_temp.as_user(null);
select pg_temp.fails('select * from public.teams', 'anon cannot read teams (captain names)');
select pg_temp.fails('select * from public.profiles', 'anon cannot read profiles');
select pg_temp.fails('select * from public.audit_log', 'anon cannot read audit log');
select pg_temp.fails('select * from public.match_results', 'anon cannot read raw results');
select pg_temp.fails('select * from public.user_assignments', 'anon cannot read assignments');
select pg_temp.fails('select * from public.operator_names', 'anon cannot read operator names');
select pg_temp.ok((select count(*) = 8 from public.public_events), 'anon sees 8 public events');
select pg_temp.ok((select count(*) = 20 from public.public_event_sessions), 'anon sees schedule');
select pg_temp.ok((select count(*) = 2 from public.public_matches where event_code = 'SOC'), 'anon sees scheduled matches');
select pg_temp.ok((select bool_and(score is null) from public.public_match_participants), 'no scores before Official');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Scorer submits a 2-1 result
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok((select count(*) = 0 from public.matches), 'scorer at another venue sees no matches');
select pg_temp.fails($$insert into public.match_results (match_id, submitted_by, referee_confirmed, winner_participant_id, loser_participant_id)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', true,
          '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')$$,
  'scorer cannot submit for an unassigned venue');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.ok((select count(*) = 0 from public.teams), 'inactive user cannot read teams');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) = 2 from public.matches), 'scorer sees matches at assigned venue');
select pg_temp.fails('select * from public.audit_log limit 1 for update', 'scorer cannot lock audit rows');
select pg_temp.ok((select count(*) = 0 from public.audit_log), 'scorer cannot read audit log');
select pg_temp.fails($$insert into public.match_results (match_id, submitted_by, referee_confirmed, winner_participant_id, loser_participant_id)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', true,
          '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002')$$,
  'winner must be assigned to the match');
select pg_temp.fails($$insert into public.match_results (match_id, submitted_by, status, referee_confirmed)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'official', true)$$,
  'scorer cannot insert an Official result');
select pg_temp.fails($$insert into public.match_results (match_id, submitted_by, referee_confirmed, participant_values)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', true,
          '[{"participant_id":"20000000-0000-0000-0000-000000000001","score":-1}]')$$,
  'negative scores rejected');

insert into public.match_results (id, match_id, result_method, submitted_by, referee_confirmed,
                                  winner_participant_id, loser_participant_id, participant_values, notes)
values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'score',
        '00000000-0000-0000-0000-00000000000b', true,
        '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
        '[{"participant_id":"20000000-0000-0000-0000-000000000001","score":2},
          {"participant_id":"20000000-0000-0000-0000-000000000002","score":1}]', 'Clean game');

select pg_temp.ok((select status = 'submitted' from public.matches where id = '40000000-0000-0000-0000-000000000001'),
  'submission sets match status to submitted');
update public.match_results set status = 'official' where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.ok((select status = 'submitted' from public.match_results where id = '50000000-0000-0000-0000-000000000001'),
  'scorer update silently affects no rows (no UPDATE policy)');
reset role;

select pg_temp.as_user(null);
select pg_temp.ok((select bool_and(score is null) from public.public_match_participants), 'submitted (unofficial) scores hidden from public');
select pg_temp.ok((select count(*) = 0 from public.public_match_results), 'no public results while awaiting validation');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Venue lead marks it Official
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$update public.match_results set winner_participant_id = '20000000-0000-0000-0000-000000000002',
  loser_participant_id = '20000000-0000-0000-0000-000000000001' where id = '50000000-0000-0000-0000-000000000001'$$,
  'venue lead cannot change submitted values');
select pg_temp.fails($$update public.match_results set status = 'returned' where id = '50000000-0000-0000-0000-000000000001'$$,
  'return requires a reason');
update public.match_results set status = 'official' where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.ok((select validated_by = '00000000-0000-0000-0000-00000000000c' from public.match_results
  where id = '50000000-0000-0000-0000-000000000001'), 'validated_by recorded');
select pg_temp.fails($$update public.match_results set status = 'void', status_reason = 'x' where id = '50000000-0000-0000-0000-000000000001'$$,
  'venue lead cannot void an Official result');
update public.matches set status = 'planned' where id = '40000000-0000-0000-0000-000000000001';
reset role;

select pg_temp.ok((select status = 'official' from public.matches where id = '40000000-0000-0000-0000-000000000001'),
  'Official validation sets match status (and venue lead could not edit the match)');

-- ---------------------------------------------------------------------------
-- 6. Public sport page shows official score and winner
-- ---------------------------------------------------------------------------
select pg_temp.as_user(null);
select pg_temp.ok((select score = 2 and is_winner from public.public_match_participants
  where match_id = '40000000-0000-0000-0000-000000000001' and slot = 'A'), 'public sees 2 for winner');
select pg_temp.ok((select score = 1 and not is_winner from public.public_match_participants
  where match_id = '40000000-0000-0000-0000-000000000001' and slot = 'B'), 'public sees 1 for loser');
select pg_temp.ok((select winner_team_name = 'Raptors' from public.public_match_results), 'public result names winner');
select pg_temp.ok((select count(*) > 0 from public.public_updates where kind = 'result_official'), 'realtime feed bumped');
select pg_temp.ok(not exists (select 1 from information_schema.columns
  where table_name like 'public\_%' escape '\' and column_name in ('captain_name', 'email', 'notes', 'submitted_by', 'validated_by')),
  'public views expose no restricted columns');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Sport manager advances the winner into the next match
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.advance_participant('40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'A', 'winner_of_match')$$,
  'scorer cannot advance teams');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.advance_participant('40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'B', 'winner_of_match')$$,
  'advancement refuses to overwrite an occupied slot without confirmation');
select pg_temp.ok(public.advance_participant('40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'A', 'winner_of_match') = 'placed',
  'winner advanced to semifinal slot A');
select pg_temp.ok((select advanced from public.match_participants where match_id = '40000000-0000-0000-0000-000000000001'
  and participant_id = '20000000-0000-0000-0000-000000000001'), 'source marked advanced');
-- Placements: manager records, cannot publish
insert into public.event_placements (event_id, participant_id, final_place)
select event_id, id, seed from public.event_participants where id in
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');
select pg_temp.ok((select overall_points = 8 from public.event_placements where final_place = 1), '1st = 8 points');
select pg_temp.ok((select overall_points = 6 from public.event_placements where final_place = 3), '3rd = 6 points');
select pg_temp.fails($$select public.approve_event_placements(id, true) from public.events where event_code = 'SOC'$$,
  'sport manager cannot publish placements');
select pg_temp.fails($$update public.event_placements set points_override = true, overall_points = 100 where final_place = 1$$,
  'sport manager cannot override points');
-- No-show penalty: explicit action only
select pg_temp.ok(public.apply_no_show_penalty('20000000-0000-0000-0000-000000000003', 'Failed to field a team') is not null,
  'no-show penalty applied by explicit action');
reset role;

select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.public_event_placements), 'unapproved placements not public');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok(public.approve_event_placements((select id from public.events where event_code = 'SOC'), true) = 3,
  'admin approves + publishes placements');
reset role;

select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 3 from public.public_event_placements), 'published placements are public');
select pg_temp.ok((select total_points = 8 and rank = 1 from public.public_overall_leaderboard where team_name = 'Raptors'),
  'leaderboard: Raptors 8 pts, rank 1');
select pg_temp.ok((select total_points = 0 from public.public_overall_leaderboard where team_name = 'Hawks'),
  'leaderboard: Hawks 6 - 6 penalty = 0');
reset role;

-- Changing an approved placement withdraws publication
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.event_placements set final_place = 9 where final_place = 3;
reset role;
select pg_temp.ok((select not public_visible and approved_at is null and overall_points = 0
  from public.event_placements where final_place = 9), 'edit withdraws approval; place 9 = 0 points');

-- ---------------------------------------------------------------------------
-- Corrections: scorer requests, manager approves -> Official result voided
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.corrections (id, result_id, requested_by, correction_type, reason, requested_change)
values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000b', 'score_correction', 'Score was 3-1', '{"A":3,"B":1}');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.corrections set decision = 'approved', decision_notes = 'Confirmed with referee'
where id = '60000000-0000-0000-0000-000000000001';
update public.match_results set status = 'void', status_reason = 'Correction approved'
where id = '50000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select status = 'ready' from public.matches where id = '40000000-0000-0000-0000-000000000001'),
  'voiding Official result reopens match');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.public_match_results), 'voided result removed from public');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Audit trail
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) > 0 from public.audit_log where action = 'submit'), 'audit: submit');
select pg_temp.ok((select count(*) > 0 from public.audit_log where action = 'approve' and table_name = 'match_results'), 'audit: approve');
select pg_temp.ok((select count(*) > 0 from public.audit_log where action = 'void'), 'audit: void');
select pg_temp.ok((select count(*) > 0 from public.audit_log where action = 'publish'), 'audit: publish');
select pg_temp.ok((select count(*) = 2 from public.audit_log
  where table_name = 'match_participants' and reason = 'Manual advancement'), 'audit: advancement insert + source update with reason');
select pg_temp.fails($$insert into public.audit_log (table_name, record_id, action) values ('x', gen_random_uuid(), 'insert')$$,
  'admin cannot write audit log directly');
select pg_temp.fails($$delete from public.audit_log$$, 'admin cannot delete audit log');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$update public.profiles set role = 'operations_admin' where id = auth.uid()$$,
  'user cannot elevate own role');
reset role;

\echo 'workflow + RLS tests complete'
