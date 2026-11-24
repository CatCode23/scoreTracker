-- Automatic advancement when a result becomes Official (migration 9).
\set ON_ERROR_STOP 1

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', label; end if;
  raise notice 'ok - %', label;
end; $$;
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  if p_uid is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end; $$;
-- Team in a slot of a match, by match code
create or replace function pg_temp.slot(p_code text, p_slot text) returns uuid language sql as $$
  select mp.participant_id from public.match_participants mp join public.matches m on m.id = mp.match_id
  where m.match_code = p_code and mp.slot = p_slot;
$$;
-- Enter an Official result as the current user: p_w beats p_l
create or replace function pg_temp.win(p_code text, p_w uuid, p_l uuid) returns uuid language sql as $$
  insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
  select id, auth.uid(), 'official', p_w, p_l from public.matches where match_code = p_code
  returning id;
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.events (id, event_code, event_name, format_type, venue)
values ('90000000-0000-0000-0000-000000000001', 'AUTO', 'Auto Test', 'single_elimination', 'Auto Field');
insert into public.units (name) values ('Auto Unit') on conflict do nothing;
insert into public.teams (id, team_name, unit)
select ('91000000-0000-0000-0000-00000000000' || n)::uuid, 'Auto ' || n, 'Auto Unit' from generate_series(1, 6) n;
insert into public.event_participants (id, event_id, team_id)
select ('92000000-0000-0000-0000-00000000000' || n)::uuid, '90000000-0000-0000-0000-000000000001',
       ('91000000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 6) n;
insert into public.stages (id, event_id, stage_name, stage_order, stage_type)
values ('93000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Bracket', 1, 'elimination');
insert into public.matches (event_id, stage_id, match_code)
select '90000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', c
from unnest(array['AU-SF1', 'AU-SF2', 'AU-F', 'AU-3RD', 'AU-X1', 'AU-X2', 'AU-OFF', 'AU-DST']) c;
-- SF1 / SF2 -> Final (A/B), losers -> 3rd (A/B)
update public.matches m set next_winner_match_id = f.id, next_winner_slot = 'A', next_loser_match_id = t.id, next_loser_slot = 'A'
from public.matches f, public.matches t where m.match_code = 'AU-SF1' and f.match_code = 'AU-F' and t.match_code = 'AU-3RD';
update public.matches m set next_winner_match_id = f.id, next_winner_slot = 'B', next_loser_match_id = t.id, next_loser_slot = 'B'
from public.matches f, public.matches t where m.match_code = 'AU-SF2' and f.match_code = 'AU-F' and t.match_code = 'AU-3RD';
-- X1 -> DST slot A (will be taken by someone else); X2 -> DST slot B (DST already played); OFF has auto-advance off
update public.matches m set next_winner_match_id = d.id, next_winner_slot = 'A'
from public.matches d where m.match_code = 'AU-X1' and d.match_code = 'AU-DST';
update public.matches m set next_winner_match_id = d.id, next_winner_slot = 'A', auto_advance = false
from public.matches d where m.match_code = 'AU-OFF' and d.match_code = 'AU-F';
insert into public.match_participants (match_id, participant_id, slot)
select m.id, v.p::uuid, v.slot from public.matches m join (values
  ('AU-SF1', '92000000-0000-0000-0000-000000000001', 'A'), ('AU-SF1', '92000000-0000-0000-0000-000000000002', 'B'),
  ('AU-SF2', '92000000-0000-0000-0000-000000000003', 'A'), ('AU-SF2', '92000000-0000-0000-0000-000000000004', 'B'),
  ('AU-X1',  '92000000-0000-0000-0000-000000000005', 'A'), ('AU-X1',  '92000000-0000-0000-0000-000000000006', 'B'),
  ('AU-DST', '92000000-0000-0000-0000-000000000003', 'A'),
  ('AU-OFF', '92000000-0000-0000-0000-000000000005', 'A'), ('AU-OFF', '92000000-0000-0000-0000-000000000006', 'B')
) v(code, p, slot) on v.code = m.match_code;
insert into public.user_assignments (profile_id, event_id, venue, assignment_role) values
  ('00000000-0000-0000-0000-00000000000b', '90000000-0000-0000-0000-000000000001', 'Auto Field', 'scorer'),
  ('00000000-0000-0000-0000-00000000000c', '90000000-0000-0000-0000-000000000001', 'Auto Field', 'venue_lead');
reset role;

-- 1. Winner and loser both move on when the admin saves an Official result
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.win('AU-SF1', '92000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.ok(pg_temp.slot('AU-F', 'A') = '92000000-0000-0000-0000-000000000002', 'winner auto-advanced to the final, slot A');
select pg_temp.ok(pg_temp.slot('AU-3RD', 'A') = '92000000-0000-0000-0000-000000000001', 'loser auto-routed to the 3rd place game, slot A');
select pg_temp.ok((select advanced from public.match_participants mp join public.matches m on m.id = mp.match_id
  where m.match_code = 'AU-SF1' and mp.participant_id = '92000000-0000-0000-0000-000000000002'), 'winner flagged advanced');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 1 from public.public_match_participants mp join public.public_matches m on m.id = mp.match_id
  where m.match_code = 'AU-F'), 'public bracket shows the advanced team');
reset role;

-- 2. A Scorer's result moves teams on only once it is approved
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
select id, auth.uid(), 'submitted', '92000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000004'
from public.matches where match_code = 'AU-SF2';
reset role;
select pg_temp.ok(pg_temp.slot('AU-F', 'B') is null, 'submitted (unapproved) result does not advance anyone');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
update public.match_results set status = 'official'
where match_id = (select id from public.matches where match_code = 'AU-SF2') and status = 'submitted';
reset role;
select pg_temp.ok(pg_temp.slot('AU-F', 'B') = '92000000-0000-0000-0000-000000000003', 'approved result auto-advances the winner');
select pg_temp.ok(pg_temp.slot('AU-3RD', 'B') = '92000000-0000-0000-0000-000000000004', 'approved result auto-routes the loser');

-- 3. Never overwrites a slot that holds another team
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.win('AU-X1', '92000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000006');
reset role;
select pg_temp.ok(pg_temp.slot('AU-DST', 'A') = '92000000-0000-0000-0000-000000000003', 'occupied slot is not overwritten');

-- 4. Auto-advance turned off for a match: nothing moves
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select status = 'official' from public.matches where match_code = 'AU-SF1'), 'setup check');
reset role;
select pg_temp.ok((select count(*) = 0 from public.match_participants mp join public.matches m on m.id = mp.source_match_id
  where m.match_code = 'AU-OFF'), 'before: nothing from AU-OFF');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- AU-OFF routes to the final's slot A, which is taken anyway; check the switch directly on an empty target:
update public.matches set next_winner_match_id = (select id from public.matches where match_code = 'AU-X2'), next_winner_slot = 'A'
where match_code = 'AU-OFF';
select pg_temp.win('AU-OFF', '92000000-0000-0000-0000-000000000006', '92000000-0000-0000-0000-000000000005');
reset role;
select pg_temp.ok(pg_temp.slot('AU-X2', 'A') is null, 'match with auto-advance off moves nobody');

-- 5. Destination already played: skipped
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.match_participants (match_id, participant_id, slot)
select id, '92000000-0000-0000-0000-000000000001', 'A' from public.matches where match_code = 'AU-X2';
insert into public.match_participants (match_id, participant_id, slot)
select id, '92000000-0000-0000-0000-000000000002', 'B' from public.matches where match_code = 'AU-X2';
select pg_temp.win('AU-X2', '92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002');
update public.matches set next_winner_match_id = (select id from public.matches where match_code = 'AU-X2'), next_winner_slot = 'C',
  auto_advance = true
where match_code = 'AU-DST';
insert into public.match_participants (match_id, participant_id, slot)
select id, '92000000-0000-0000-0000-000000000004', 'B' from public.matches where match_code = 'AU-DST';
select pg_temp.win('AU-DST', '92000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000003');
reset role;
select pg_temp.ok(pg_temp.slot('AU-X2', 'C') is null, 'no team is added to a match that already has a result');

-- 6. Editing a result afterwards swaps the corrected teams (correct_match_result)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.correct_match_result(
  (select r.id from public.match_results r join public.matches m on m.id = r.match_id
   where m.match_code = 'AU-SF1' and r.status = 'official'),
  'score', '92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '[]', 'wrong winner');
reset role;
select pg_temp.ok(pg_temp.slot('AU-F', 'A') = '92000000-0000-0000-0000-000000000001', 'edit swaps the corrected winner into the final');
select pg_temp.ok(pg_temp.slot('AU-3RD', 'A') = '92000000-0000-0000-0000-000000000002', 'edit swaps the corrected loser into 3rd place');

-- Clean up
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.events where id = '90000000-0000-0000-0000-000000000001';
reset role;
