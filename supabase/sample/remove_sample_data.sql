-- WOTB Tournament Tracker: REMOVE SAMPLE DATA
--
-- Deletes only what load_sample_data.sql created (everything named "SAMPLE ...").
-- Run in the Supabase SQL Editor (as postgres). Safe to run more than once.
-- Audit-log entries for the sample rows are kept, because the audit log is append-only.

begin;

-- Matches first (their results and slots go with them), then the sample stages.
delete from public.matches where match_code like 'SAMPLE-%';
delete from public.stages  where stage_name like 'SAMPLE %';

-- Teams (their event registrations, placements and penalties go with them), then units.
delete from public.teams where team_name like 'SAMPLE %';
delete from public.units where name like 'SAMPLE %';

commit;

-- Check: all four counts should be 0
select
  (select count(*) from public.units   where name like 'SAMPLE %')        as sample_units,
  (select count(*) from public.teams   where team_name like 'SAMPLE %')   as sample_teams,
  (select count(*) from public.matches where match_code like 'SAMPLE-%')  as sample_matches,
  (select count(*) from public.stages  where stage_name like 'SAMPLE %')  as sample_stages;
