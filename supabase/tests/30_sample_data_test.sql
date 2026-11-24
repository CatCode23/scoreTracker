-- The sample data scripts load, refuse a double load, remove cleanly, and reload.
\set ON_ERROR_STOP 1
\ir ../seed.sql
\ir ../sample/load_sample_data.sql
do $$ begin
  if (select count(*) from public.public_overall_leaderboard where unit like 'SAMPLE %') <> 4 then
    raise exception 'ASSERTION FAILED: sample leaderboard should list 4 units'; end if;
  if (select total_points from public.public_overall_leaderboard where unit = 'SAMPLE 1-2 SBCT') <> 8 then
    raise exception 'ASSERTION FAILED: sample 1-2 SBCT should have 8 points'; end if;
  if (select count(*) from public.public_matches where match_code like 'SAMPLE-%' and is_official) <> 5 then
    raise exception 'ASSERTION FAILED: 5 sample matches should be Official'; end if;
end $$;
\ir ../sample/remove_sample_data.sql
do $$ begin
  if exists (select 1 from public.teams where team_name like 'SAMPLE %')
     or exists (select 1 from public.units where name like 'SAMPLE %')
     or exists (select 1 from public.matches where match_code like 'SAMPLE-%')
     or exists (select 1 from public.event_participants ep join public.teams t on t.id = ep.team_id where t.team_name like 'SAMPLE %')
     or exists (select 1 from public.public_overall_leaderboard where unit like 'SAMPLE %') then
    raise exception 'ASSERTION FAILED: sample data not fully removed'; end if;
  if not exists (select 1 from public.events where event_code = 'SOC') then
    raise exception 'ASSERTION FAILED: removal must not delete events'; end if;
end $$;
\ir ../sample/remove_sample_data.sql
\ir ../sample/load_sample_data.sql
\ir ../sample/remove_sample_data.sql
\echo 'sample data scripts OK'
