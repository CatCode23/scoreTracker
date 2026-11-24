-- Placements filled in from placement matches (migration 10).
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
create or replace function pg_temp.p(n int) returns uuid language sql as $$
  select ('a2000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- Place of a participant (null if none)
create or replace function pg_temp.place_of(n int) returns int language sql as $$
  select final_place from public.event_placements where participant_id = pg_temp.p(n)
$$;
create or replace function pg_temp.win(p_code text, p_w uuid, p_l uuid) returns uuid language sql as $$
  insert into public.match_results (match_id, submitted_by, status, winner_participant_id, loser_participant_id)
  select id, auth.uid(), 'official', p_w, p_l from public.matches where match_code = p_code
  returning id;
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.events (id, event_code, event_name, format_type, venue)
values ('a0000000-0000-0000-0000-000000000001', 'PLC', 'Placement Test', 'single_elimination', 'P Field');
insert into public.units (name) values ('Place Unit') on conflict do nothing;
insert into public.teams (id, team_name, unit)
select ('a1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Place ' || n, 'Place Unit' from generate_series(1, 10) n;
insert into public.event_participants (id, event_id, team_id)
select pg_temp.p(n), 'a0000000-0000-0000-0000-000000000001',
       ('a1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 10) n;
insert into public.stages (id, event_id, stage_name, stage_order, stage_type)
values ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Bracket', 1, 'elimination');
insert into public.matches (event_id, stage_id, match_code, match_type, decides_place)
values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PL-F', 'head_to_head', 1),
       ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PL-3RD', 'head_to_head', 3),
       ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PL-SF', 'head_to_head', null),
       ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PL-HEAT', 'heat', 5),
       ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PL-TIE', 'pool_game', 9);
insert into public.match_participants (match_id, participant_id, slot)
select m.id, pg_temp.p(v.n), v.slot from public.matches m join (values
  ('PL-F', 1, 'A'), ('PL-F', 2, 'B'), ('PL-3RD', 3, 'A'), ('PL-3RD', 4, 'B'), ('PL-SF', 1, 'A'), ('PL-SF', 3, 'B'),
  ('PL-HEAT', 5, 'Lane 1'), ('PL-HEAT', 6, 'Lane 2'), ('PL-HEAT', 7, 'Lane 3'), ('PL-HEAT', 8, 'Lane 4'),
  ('PL-TIE', 9, 'A'), ('PL-TIE', 10, 'B')
) v(code, n, slot) on v.code = m.match_code;
reset role;

-- A match without "decides places" fills nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.win('PL-SF', pg_temp.p(1), pg_temp.p(3));
reset role;
select pg_temp.ok((select count(*) = 0 from public.event_placements where event_id = 'a0000000-0000-0000-0000-000000000001'),
  'ordinary match fills no placements');

-- Final: winner 1st, loser 2nd. 3rd place game: 3rd/4th.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.win('PL-F', pg_temp.p(2), pg_temp.p(1));
select pg_temp.win('PL-3RD', pg_temp.p(3), pg_temp.p(4));
reset role;
select pg_temp.ok(pg_temp.place_of(2) = 1 and pg_temp.place_of(1) = 2, 'final: winner 1st, loser 2nd');
select pg_temp.ok(pg_temp.place_of(3) = 3 and pg_temp.place_of(4) = 4, '3rd place game: 3rd and 4th');
select pg_temp.ok((select overall_points = 8 from public.event_placements where participant_id = pg_temp.p(2)), 'points from the matrix (1st = 8)');
select pg_temp.ok((select bool_and(approved_at is null and not public_visible) from public.event_placements
  where event_id = 'a0000000-0000-0000-0000-000000000001'), 'filled placements are NOT approved or public');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.public_event_placements where event_code = 'PLC'), 'nothing public until published');
reset role;

-- Heat: places start at 5 (5th..8th from the result's places)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.match_results (match_id, submitted_by, status, result_method, participant_values)
select id, auth.uid(), 'official', 'time', jsonb_build_array(
  jsonb_build_object('participant_id', pg_temp.p(5), 'time_seconds', 70, 'placement', 2),
  jsonb_build_object('participant_id', pg_temp.p(6), 'time_seconds', 65, 'placement', 1),
  jsonb_build_object('participant_id', pg_temp.p(7), 'time_seconds', 80, 'placement', 4),
  jsonb_build_object('participant_id', pg_temp.p(8), 'time_seconds', 75, 'placement', 3))
from public.matches where match_code = 'PL-HEAT';
reset role;
select pg_temp.ok(pg_temp.place_of(6) = 5 and pg_temp.place_of(5) = 6 and pg_temp.place_of(8) = 7 and pg_temp.place_of(7) = 8,
  'heat places offset from "decides places"');

-- A tie decides nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.match_results (match_id, submitted_by, status, participant_values)
select id, auth.uid(), 'official', jsonb_build_array(
  jsonb_build_object('participant_id', pg_temp.p(9), 'score', 1),
  jsonb_build_object('participant_id', pg_temp.p(10), 'score', 1))
from public.matches where match_code = 'PL-TIE';
reset role;
select pg_temp.ok(pg_temp.place_of(9) is null and pg_temp.place_of(10) is null, 'a tie fills no placements');

-- Publish, then edit the final: placements swap and publication is withdrawn
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_event_placements('a0000000-0000-0000-0000-000000000001', true);
select pg_temp.ok((select count(*) = 8 from public.public_event_placements where event_code = 'PLC'), 'admin publishes the filled placements');
select public.correct_match_result(
  (select r.id from public.match_results r join public.matches m on m.id = r.match_id where m.match_code = 'PL-F' and r.status = 'official'),
  'score', pg_temp.p(1), pg_temp.p(2), '[]', 'winner was entered wrong');
reset role;
select pg_temp.ok(pg_temp.place_of(1) = 1 and pg_temp.place_of(2) = 2, 'editing the final swaps 1st and 2nd');
select pg_temp.ok((select approved_at is null and not public_visible from public.event_placements where participant_id = pg_temp.p(1)),
  'corrected placements need publishing again');
select pg_temp.ok((select approved_at is not null from public.event_placements where participant_id = pg_temp.p(3)),
  'other places stay approved');

-- Voiding the 3rd place result removes the places it filled
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.match_results set status = 'void', status_reason = 'game replayed'
where status = 'official' and match_id = (select id from public.matches where match_code = 'PL-3RD');
reset role;
select pg_temp.ok(pg_temp.place_of(3) is null and pg_temp.place_of(4) is null, 'voiding removes the placements it filled');

-- Hand-entered placements for other places are kept
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.event_placements (event_id, participant_id, final_place, ranking_method)
values ('a0000000-0000-0000-0000-000000000001', pg_temp.p(9), 9, 'manual');
select pg_temp.win('PL-3RD', pg_temp.p(4), pg_temp.p(3));
reset role;
select pg_temp.ok(pg_temp.place_of(9) = 9 and pg_temp.place_of(4) = 3, 'manual places kept; replayed game refills 3rd/4th');

-- Clean up
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.events where id = 'a0000000-0000-0000-0000-000000000001';
reset role;
