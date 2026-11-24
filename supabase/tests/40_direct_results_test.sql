-- Direct-to-Official results, no referee requirement, and Edit result (correct_match_result).
\set ON_ERROR_STOP 1

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', label; end if;
  raise notice 'ok - %', label;
end; $$;
create or replace function pg_temp.fails(sql text, label text) returns void language plpgsql as $$
begin
  begin
    set constraints all immediate;
    execute sql;
  exception when others then
    raise notice 'ok - % (rejected: %)', label, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED (statement succeeded): %', label;
end; $$;
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  if p_uid is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end; $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Setup as admin: event at a venue, 4 teams, SF -> Final + 3rd place
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.events (id, event_code, event_name, format_type, venue)
values ('80000000-0000-0000-0000-000000000001', 'DIR', 'Direct Test', 'single_elimination', 'Test Field');
insert into public.units (name) values ('Direct Unit') on conflict do nothing;
insert into public.teams (id, team_name, unit) values
  ('81000000-0000-0000-0000-000000000001', 'Dir A', 'Direct Unit'),
  ('81000000-0000-0000-0000-000000000002', 'Dir B', 'Direct Unit'),
  ('81000000-0000-0000-0000-000000000003', 'Dir C', 'Direct Unit');
insert into public.event_participants (id, event_id, team_id) values
  ('82000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002'),
  ('82000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003');
insert into public.stages (id, event_id, stage_name, stage_order, stage_type)
values ('83000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Bracket', 1, 'elimination');
insert into public.matches (id, event_id, stage_id, match_code) values
  ('84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'DIR-SF'),
  ('84000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'DIR-F'),
  ('84000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'DIR-3RD'),
  ('84000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'DIR-X');
insert into public.match_participants (match_id, participant_id, slot) values
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'A'),
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', 'B'),
  ('84000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000003', 'B'),
  ('84000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000001', 'A'),
  ('84000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000003', 'B');
insert into public.user_assignments (profile_id, event_id, venue, assignment_role) values
  ('00000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000001', 'Test Field', 'scorer'),
  ('00000000-0000-0000-0000-00000000000c', '80000000-0000-0000-0000-000000000001', 'Test Field', 'venue_lead'),
  ('00000000-0000-0000-0000-00000000000d', '80000000-0000-0000-0000-000000000001', null, 'sport_manager');
reset role;

-- Scorer: still needs approval
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
  values ('84000000-0000-0000-0000-000000000004', auth.uid(), 'official',
          '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000003')$$,
  'scorer cannot enter an Official result directly');
reset role;

-- Admin: Official immediately, no referee confirmation needed
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.match_results (id, match_id, submitted_by, status, winner_participant_id, loser_participant_id, participant_values)
values ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', auth.uid(), 'official',
        '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002',
        '[{"participant_id":"82000000-0000-0000-0000-000000000001","score":3},{"participant_id":"82000000-0000-0000-0000-000000000002","score":1}]');
reset role;
select pg_temp.ok((select status = 'official' from public.matches where id = '84000000-0000-0000-0000-000000000001'),
  'admin result is Official immediately (no referee confirmation)');
select pg_temp.ok((select validated_by = '00000000-0000-0000-0000-00000000000a' and referee_confirmed = false
  from public.match_results where id = '85000000-0000-0000-0000-000000000001'), 'Official insert records who entered it');
select pg_temp.as_user(null);
select pg_temp.ok((select score = 3 and is_winner from public.public_match_participants
  where match_id = '84000000-0000-0000-0000-000000000001' and slot = 'A'), 'public sees the direct Official result');
reset role;

-- Venue lead can also enter Official directly
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
values ('84000000-0000-0000-0000-000000000004', auth.uid(), 'official',
        '82000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.ok((select status = 'official' from public.matches where id = '84000000-0000-0000-0000-000000000004'),
  'venue lead result is Official immediately');

-- Advance SF winner (A) to the final, loser (B) to 3rd place
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.advance_participant('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
                                  '84000000-0000-0000-0000-000000000002', 'A', 'winner_of_match');
select public.advance_participant('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002',
                                  '84000000-0000-0000-0000-000000000003', 'A', 'loser_of_match');
reset role;

-- Edit result: scorer and venue lead may not
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.correct_match_result('85000000-0000-0000-0000-000000000001', 'score',
  '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '[]', 'typo')$$,
  'venue lead cannot edit an Official result');
reset role;

-- Sport manager: reason required
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.correct_match_result('85000000-0000-0000-0000-000000000001', 'score',
  '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '[]', '  ')$$,
  'editing requires a reason');

-- Flip the winner: B actually won 2-1. Next matches get updated.
select pg_temp.ok(public.correct_match_result('85000000-0000-0000-0000-000000000001', 'score',
  '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001',
  '[{"participant_id":"82000000-0000-0000-0000-000000000001","score":1},{"participant_id":"82000000-0000-0000-0000-000000000002","score":2}]',
  'Scores were entered the wrong way round') is not null, 'sport manager edits the result');
reset role;

select pg_temp.ok((select status = 'void' and status_reason like 'Edited: Scores were entered%'
  from public.match_results where id = '85000000-0000-0000-0000-000000000001'), 'old result kept as void with the reason');
select pg_temp.ok((select count(*) = 1 from public.match_results
  where match_id = '84000000-0000-0000-0000-000000000001' and status = 'official'), 'exactly one Official result after edit');
select pg_temp.ok((select status = 'official' from public.matches where id = '84000000-0000-0000-0000-000000000001'),
  'match stays Official after edit');
select pg_temp.ok((select participant_id = '82000000-0000-0000-0000-000000000002' from public.match_participants
  where match_id = '84000000-0000-0000-0000-000000000002' and slot = 'A'), 'corrected winner moved into the final');
select pg_temp.ok((select participant_id = '82000000-0000-0000-0000-000000000001' from public.match_participants
  where match_id = '84000000-0000-0000-0000-000000000003' and slot = 'A'), 'corrected loser moved into 3rd place');
select pg_temp.ok((select bool_and(advanced = (participant_id = '82000000-0000-0000-0000-000000000002'))
  from public.match_participants where match_id = '84000000-0000-0000-0000-000000000001'), 'advanced flag follows the corrected winner');
select pg_temp.as_user(null);
select pg_temp.ok((select score = 2 and is_winner from public.public_match_participants
  where match_id = '84000000-0000-0000-0000-000000000001' and slot = 'B'), 'public shows the corrected score and winner');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) >= 1 from public.audit_log where reason like 'Edited: Scores were entered%'), 'edit recorded in the audit log');
reset role;

-- Once the next match has a result, flipping the winner again is refused (unless not updating next matches)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
values ('84000000-0000-0000-0000-000000000002', auth.uid(), 'official',
        '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000003');
select pg_temp.fails($$select public.correct_match_result(
  (select id from public.match_results where match_id = '84000000-0000-0000-0000-000000000001' and status = 'official'),
  'score', '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', '[]', 'flip back')$$,
  'edit refused when the next match already has a result');
select pg_temp.ok(public.correct_match_result(
  (select id from public.match_results where match_id = '84000000-0000-0000-0000-000000000001' and status = 'official'),
  'score', '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001',
  '[{"participant_id":"82000000-0000-0000-0000-000000000001","score":1},{"participant_id":"82000000-0000-0000-0000-000000000002","score":4}]',
  'score typo, same winner', false) is not null, 'score-only edit allowed even after the next match is played');
reset role;

-- Clean up
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.events where id = '80000000-0000-0000-0000-000000000001';
reset role;
