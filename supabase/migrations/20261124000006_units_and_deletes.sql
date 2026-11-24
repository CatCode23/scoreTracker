-- WOTB Tournament Tracker: units, unit leaderboard, safer deletes
--
-- 1. Units become a managed list. Teams belong to a unit, and the overall
--    Commander's Cup leaderboard totals points by UNIT (each unit fields teams in the
--    individual sports). A managed list prevents typos ("1-2 SBCT" vs "1/2 SBCT") from
--    splitting a unit's points.
-- 2. Deleting a team also deletes its event registrations, as long as the team has not
--    been placed in any match (then the delete is refused, and the team can be marked
--    inactive instead).
-- 3. Deleting an event removes everything under it in one statement.
-- Safe to run once after migrations 1-5.

-- ---------------------------------------------------------------------------
-- 1. Units
-- ---------------------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing team units become the starting list.
insert into public.units (name)
select distinct trim(unit) from public.teams
on conflict (name) do nothing;
update public.teams set unit = trim(unit) where unit <> trim(unit);

-- Teams must use a unit from the list. Renaming a unit renames it on its teams;
-- a unit that still has teams cannot be deleted.
alter table public.teams
  add constraint teams_unit_fkey foreign key (unit)
  references public.units (name) on update cascade on delete restrict;

create trigger set_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger audit_units after insert or update or delete on public.units
  for each row execute function public.audit_trigger();

alter table public.units enable row level security;
revoke all on table public.units from anon, authenticated;
grant select, insert, update, delete on table public.units to authenticated;

create policy units_select on public.units
  for select to authenticated using (public.is_active_user());
create policy units_insert on public.units
  for insert to authenticated with check (public.is_ops_admin());
create policy units_update on public.units
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy units_delete on public.units
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- 2/3. Delete behavior
-- ---------------------------------------------------------------------------
-- Deleting a team removes its registrations (and their pool slots/placements/penalties,
-- which already cascade from event_participants).
alter table public.event_participants drop constraint event_participants_team_id_fkey;
alter table public.event_participants
  add constraint event_participants_team_id_fkey foreign key (team_id)
  references public.teams (id) on delete cascade;

-- A registration that is in a match, or named as a result's winner/loser, still cannot be
-- deleted on its own: the delete is refused. These checks are deferred to the end of the
-- transaction so that deleting a whole event (which also deletes its matches and results)
-- succeeds once everything under it is gone.
alter table public.match_participants drop constraint match_participants_participant_id_fkey;
alter table public.match_participants
  add constraint match_participants_participant_id_fkey foreign key (participant_id)
  references public.event_participants (id) on delete no action deferrable initially deferred;
alter table public.match_results drop constraint match_results_winner_participant_id_fkey;
alter table public.match_results
  add constraint match_results_winner_participant_id_fkey foreign key (winner_participant_id)
  references public.event_participants (id) on delete no action deferrable initially deferred;
alter table public.match_results drop constraint match_results_loser_participant_id_fkey;
alter table public.match_results
  add constraint match_results_loser_participant_id_fkey foreign key (loser_participant_id)
  references public.event_participants (id) on delete no action deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Overall leaderboard by unit
-- ---------------------------------------------------------------------------
drop view public.public_overall_leaderboard;

create view public.public_overall_leaderboard with (security_invoker = false) as
with enabled as (
  select coalesce((select s.enabled and coalesce(s.text_value, 'true') <> 'false'
                   from public.scoring_settings s where s.setting_key = 'overall_scoring_enabled'),
                  true) as on_
),
placement_pts as (
  select t.unit, sum(pl.overall_points) as pts, count(*) as events_placed,
         count(*) filter (where pl.final_place = 1) as firsts,
         count(*) filter (where pl.final_place = 2) as seconds,
         count(*) filter (where pl.final_place = 3) as thirds
  from public.event_placements pl
  join public.events e on e.id = pl.event_id and e.counts_toward_overall and e.public_visible
  join public.event_participants ep on ep.id = pl.participant_id and ep.eligible_for_points
  join public.teams t on t.id = ep.team_id
  where pl.public_visible and pl.approved_at is not null
  group by t.unit
),
penalty_pts as (
  select t.unit, sum(pa.points) as pts
  from public.point_adjustments pa
  join public.events e on e.id = pa.event_id and e.counts_toward_overall and e.public_visible
  join public.event_participants ep on ep.id = pa.participant_id
  join public.teams t on t.id = ep.team_id
  where pa.active and pa.public_visible
  group by t.unit
),
totals as (
  select coalesce(pp.unit, pen.unit) as unit,
         coalesce(pp.pts, 0) as placement_points,
         coalesce(pen.pts, 0) as adjustment_points,
         coalesce(pp.pts, 0) + coalesce(pen.pts, 0) as total_points,
         coalesce(pp.events_placed, 0)::integer as events_placed,
         coalesce(pp.firsts, 0)::integer as firsts,
         coalesce(pp.seconds, 0)::integer as seconds,
         coalesce(pp.thirds, 0)::integer as thirds
  from placement_pts pp
  full join penalty_pts pen on pen.unit = pp.unit
)
select rank() over (order by total_points desc, firsts desc, seconds desc, thirds desc)::integer as rank,
       totals.*
from totals, enabled
where enabled.on_;

revoke all on public.public_overall_leaderboard from anon, authenticated;
grant select on public.public_overall_leaderboard to anon, authenticated;

-- Public pages refresh when units are renamed.
create trigger notify_public_units after update on public.units
  for each row execute function public.notify_public_change();
