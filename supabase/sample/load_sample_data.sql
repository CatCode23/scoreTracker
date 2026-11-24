-- WOTB Tournament Tracker: SAMPLE DATA (for trying the app; remove before the event)
--
-- Run in the Supabase SQL Editor (as postgres). Needs seed.sql and migrations 1-6.
-- Everything created here is named with a "SAMPLE" prefix so remove_sample_data.sql can
-- delete exactly this and nothing else.
--
-- Creates:
--   * 4 sample units, each with a Soccer team and a Basketball team
--   * Soccer: a complete 4-team bracket (semifinals, 3rd place, final), all Official,
--     with published placements -> the public unit leaderboard shows points
--   * Basketball: one Official semifinal, one scheduled semifinal, a final waiting on it

create or replace function pg_temp.sample_match(
  p_event uuid, p_stage uuid, p_code text, p_round text, p_round_order int, p_number int,
  p_a uuid, p_b uuid, p_date date, p_time time, p_area text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.matches (event_id, stage_id, match_code, round_name, round_order, match_number,
                              match_date, start_time, venue_area, match_type, status)
  values (p_event, p_stage, p_code, p_round, p_round_order, p_number, p_date, p_time, p_area,
          'head_to_head', 'ready')
  returning id into v_id;
  if p_a is not null then
    insert into public.match_participants (match_id, participant_id, slot, source_type)
    values (v_id, p_a, 'A', 'seed');
  end if;
  if p_b is not null then
    insert into public.match_participants (match_id, participant_id, slot, source_type)
    values (v_id, p_b, 'B', 'seed');
  end if;
  return v_id;
end; $$;

-- Submit a result, then mark it Official (the same path the app uses).
create or replace function pg_temp.sample_result(p_match uuid, p_a uuid, p_score_a int, p_b uuid, p_score_b int)
returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into public.match_results (match_id, result_method, status, referee_confirmed,
                                    winner_participant_id, loser_participant_id, participant_values, notes)
  values (p_match, 'score', 'submitted', true,
          case when p_score_a > p_score_b then p_a else p_b end,
          case when p_score_a > p_score_b then p_b else p_a end,
          jsonb_build_array(jsonb_build_object('participant_id', p_a, 'score', p_score_a),
                            jsonb_build_object('participant_id', p_b, 'score', p_score_b)),
          'SAMPLE result')
  returning id into v_id;
  update public.match_results set status = 'official' where id = v_id;
end; $$;

-- Put a team into a later match (what "Advance winner" / "Route loser" does in the app).
create or replace function pg_temp.sample_advance(p_from uuid, p_participant uuid, p_to uuid, p_slot text, p_kind text)
returns void language plpgsql as $$
begin
  insert into public.match_participants (match_id, participant_id, slot, source_type, source_match_id)
  values (p_to, p_participant, p_slot, p_kind, p_from);
  if p_kind = 'winner_of_match' then
    update public.match_participants set advanced = true
    where match_id = p_from and participant_id = p_participant;
  else
    update public.match_participants set eliminated = true
    where match_id = p_from and participant_id = p_participant;
  end if;
end; $$;

do $$
declare
  v_year int := coalesce((select numeric_value::int from public.scoring_settings
                          where setting_key = 'tournament_year'), extract(year from now())::int);
  d7 date := make_date(v_year, 12, 7);
  d8 date := make_date(v_year, 12, 8);
  soc uuid; bsk uuid; st_soc uuid; st_bsk uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;   -- soccer participants by seed
  b1 uuid; b2 uuid; b3 uuid; b4 uuid;   -- basketball participants by seed
  sf1 uuid; sf2 uuid; fin uuid; third uuid;
  bsf1 uuid; bsf2 uuid; bfin uuid;
begin
  select id into soc from public.events where event_code = 'SOC';
  select id into bsk from public.events where event_code = 'BSK';
  if soc is null or bsk is null then
    raise exception 'Soccer (SOC) or Basketball (BSK) event not found. Run seed.sql first.';
  end if;
  if exists (select 1 from public.units where name like 'SAMPLE %') then
    raise exception 'Sample data is already loaded. Run remove_sample_data.sql first.';
  end if;

  -- Units and teams
  insert into public.units (name) values
    ('SAMPLE 1-2 SBCT'), ('SAMPLE 2-2 SBCT'), ('SAMPLE 16th CAB'), ('SAMPLE 5-3 FA');
  insert into public.teams (team_name, unit, player_count)
  select u.name || ' ' || s.sport, u.name, s.players
  from public.units u
  cross join (values ('Soccer', 14), ('Basketball', 8)) as s(sport, players)
  where u.name like 'SAMPLE %';

  -- Registrations (seeds)
  insert into public.event_participants (event_id, team_id, seed, check_in_status)
  select case when t.team_name like '% Soccer' then soc else bsk end, t.id, x.seed, 'checked_in'
  from public.teams t
  join (values ('SAMPLE 1-2 SBCT', 1), ('SAMPLE 2-2 SBCT', 2), ('SAMPLE 16th CAB', 3), ('SAMPLE 5-3 FA', 4))
       as x(unit, seed) on x.unit = t.unit
  where t.team_name like 'SAMPLE %';

  select ep.id into s1 from public.event_participants ep where ep.event_id = soc and ep.seed = 1 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into s2 from public.event_participants ep where ep.event_id = soc and ep.seed = 2 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into s3 from public.event_participants ep where ep.event_id = soc and ep.seed = 3 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into s4 from public.event_participants ep where ep.event_id = soc and ep.seed = 4 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into b1 from public.event_participants ep where ep.event_id = bsk and ep.seed = 1 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into b2 from public.event_participants ep where ep.event_id = bsk and ep.seed = 2 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into b3 from public.event_participants ep where ep.event_id = bsk and ep.seed = 3 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');
  select ep.id into b4 from public.event_participants ep where ep.event_id = bsk and ep.seed = 4 and ep.team_id in (select id from public.teams where team_name like 'SAMPLE %');

  -- ---------------- Soccer: complete bracket ----------------
  insert into public.stages (event_id, stage_name, stage_order, stage_type, advancement_rule)
  values (soc, 'SAMPLE Championship', 901, 'elimination', 'Winners advance; semifinal losers play for 3rd')
  returning id into st_soc;

  sf1   := pg_temp.sample_match(soc, st_soc, 'SAMPLE-SOC-SF1', 'Semifinal', 1, 1, s1, s4, d7, '13:00', 'Field 1');
  sf2   := pg_temp.sample_match(soc, st_soc, 'SAMPLE-SOC-SF2', 'Semifinal', 1, 2, s2, s3, d7, '13:00', 'Field 2');
  third := pg_temp.sample_match(soc, st_soc, 'SAMPLE-SOC-3RD', '3rd Place', 2, 1, null, null, d8, '10:00', 'Field 2');
  fin   := pg_temp.sample_match(soc, st_soc, 'SAMPLE-SOC-F',   'Final',     2, 2, null, null, d8, '11:00', 'Field 1');
  update public.matches set next_winner_match_id = fin, next_winner_slot = 'A',
                            next_loser_match_id = third, next_loser_slot = 'A' where id = sf1;
  update public.matches set next_winner_match_id = fin, next_winner_slot = 'B',
                            next_loser_match_id = third, next_loser_slot = 'B' where id = sf2;

  perform pg_temp.sample_result(sf1, s1, 2, s4, 1);
  perform pg_temp.sample_result(sf2, s2, 3, s3, 0);
  perform pg_temp.sample_advance(sf1, s1, fin, 'A', 'winner_of_match');
  perform pg_temp.sample_advance(sf2, s2, fin, 'B', 'winner_of_match');
  perform pg_temp.sample_advance(sf1, s4, third, 'A', 'loser_of_match');
  perform pg_temp.sample_advance(sf2, s3, third, 'B', 'loser_of_match');
  perform pg_temp.sample_result(third, s4, 1, s3, 2);
  perform pg_temp.sample_result(fin, s1, 1, s2, 0);

  -- Final placements, approved and published (1st 8 pts, 2nd 7, 3rd 6, 4th 5)
  insert into public.event_placements (event_id, participant_id, final_place, ranking_method, notes)
  values (soc, s1, 1, 'bracket', 'SAMPLE'), (soc, s2, 2, 'bracket', 'SAMPLE'),
         (soc, s3, 3, 'bracket', 'SAMPLE'), (soc, s4, 4, 'bracket', 'SAMPLE');
  update public.event_placements set approved_at = now(), public_visible = true
  where event_id = soc and participant_id in (s1, s2, s3, s4);

  -- ---------------- Basketball: in progress ----------------
  insert into public.stages (event_id, stage_name, stage_order, stage_type)
  values (bsk, 'SAMPLE Championship', 901, 'elimination')
  returning id into st_bsk;

  bsf1 := pg_temp.sample_match(bsk, st_bsk, 'SAMPLE-BSK-SF1', 'Semifinal', 1, 1, b1, b4, d8, '09:00', 'Court 1');
  bsf2 := pg_temp.sample_match(bsk, st_bsk, 'SAMPLE-BSK-SF2', 'Semifinal', 1, 2, b2, b3, d8, '10:00', 'Court 1');
  bfin := pg_temp.sample_match(bsk, st_bsk, 'SAMPLE-BSK-F',   'Final',     2, 1, null, null, d8, '14:00', 'Court 1');
  update public.matches set next_winner_match_id = bfin, next_winner_slot = 'A' where id = bsf1;
  update public.matches set next_winner_match_id = bfin, next_winner_slot = 'B' where id = bsf2;

  perform pg_temp.sample_result(bsf1, b1, 54, b4, 48);
  perform pg_temp.sample_advance(bsf1, b1, bfin, 'A', 'winner_of_match');

  raise notice 'Sample data loaded: 4 units, 8 teams, Soccer complete, Basketball in progress.';
end;
$$;

-- Quick check: the public unit leaderboard
select rank, unit, total_points from public.public_overall_leaderboard order by rank;
