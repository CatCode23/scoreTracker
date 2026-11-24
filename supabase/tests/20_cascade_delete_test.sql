-- Deleting linked matches, stages with pools, and whole events must succeed (as an admin).
\set ON_ERROR_STOP 1

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', label; end if;
  raise notice 'ok - %', label;
end; $$;
grant execute on all functions in schema pg_temp to authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;

insert into public.events (id, event_code, event_name, format_type)
values ('70000000-0000-0000-0000-000000000001', 'CASC', 'Cascade Test', 'pool_then_playoff');
insert into public.units (name) values ('Cascade Unit') on conflict do nothing;
insert into public.teams (id, team_name, unit) values
  ('71000000-0000-0000-0000-000000000001', 'Casc A', 'Cascade Unit'),
  ('71000000-0000-0000-0000-000000000002', 'Casc B', 'Cascade Unit');
insert into public.event_participants (id, event_id, team_id) values
  ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002');
insert into public.stages (id, event_id, stage_name, stage_order, stage_type) values
  ('73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Pools', 1, 'pool'),
  ('73000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'Playoff', 2, 'elimination');
insert into public.pools (id, stage_id, pool_name) values
  ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'A');
insert into public.matches (id, event_id, stage_id, pool_id, match_code, match_type) values
  ('75000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', 'CASC-P1', 'pool_game');
insert into public.matches (id, event_id, stage_id, match_code) values
  ('75000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002', 'CASC-F'),
  ('75000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002', 'CASC-3RD');
update public.matches set next_winner_match_id = '75000000-0000-0000-0000-000000000002', next_winner_slot = 'A',
  next_loser_match_id = '75000000-0000-0000-0000-000000000003', next_loser_slot = 'A'
where id = '75000000-0000-0000-0000-000000000001';
insert into public.match_participants (match_id, participant_id, slot, source_type, source_match_id) values
  ('75000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'A', 'seed', null),
  ('75000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 'B', 'seed', null),
  ('75000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 'A', 'winner_of_match', '75000000-0000-0000-0000-000000000001'),
  ('75000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000002', 'A', 'loser_of_match', '75000000-0000-0000-0000-000000000001');

-- Deleting the pool game that the later matches point at clears their pointers.
delete from public.matches where id = '75000000-0000-0000-0000-000000000001';
select pg_temp.ok((select source_match_id is null from public.match_participants
  where match_id = '75000000-0000-0000-0000-000000000002'), 'deleting a source match clears source pointers');

-- Re-link and delete a whole stage whose matches point at each other and use a pool.
update public.matches set next_winner_match_id = '75000000-0000-0000-0000-000000000002'
where id = '75000000-0000-0000-0000-000000000003';
update public.match_participants set source_match_id = '75000000-0000-0000-0000-000000000003'
where match_id = '75000000-0000-0000-0000-000000000002';
delete from public.stages where id = '73000000-0000-0000-0000-000000000002';
select pg_temp.ok(not exists (select 1 from public.matches where event_id = '70000000-0000-0000-0000-000000000001'),
  'deleting a stage with linked matches succeeds');

-- Whole event with pools, linked matches and an official result.
insert into public.stages (id, event_id, stage_name, stage_order, stage_type) values
  ('73000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'Playoff 2', 3, 'elimination');
insert into public.matches (id, event_id, stage_id, pool_id, match_code, match_type) values
  ('75000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', 'CASC-P2', 'pool_game');
insert into public.matches (id, event_id, stage_id, match_code, next_winner_match_id) values
  ('75000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000003', 'CASC-F2', null);
update public.matches set next_winner_match_id = '75000000-0000-0000-0000-000000000005' where id = '75000000-0000-0000-0000-000000000004';
insert into public.match_participants (match_id, participant_id, slot) values
  ('75000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', 'A'),
  ('75000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000002', 'B');
insert into public.match_results (id, match_id, submitted_by, referee_confirmed, winner_participant_id, loser_participant_id)
values ('76000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', true,
        '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002');
update public.match_results set status = 'official' where id = '76000000-0000-0000-0000-000000000001';
delete from public.events where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.ok(not exists (select 1 from public.events where event_code = 'CASC'), 'deleting an event with pools, links and official results succeeds');

reset role;
