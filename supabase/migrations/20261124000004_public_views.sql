-- WOTB Tournament Tracker: public-safe views and Realtime publication
--
-- These views are the ONLY database objects the anon (public) role can read.
-- They intentionally run with the view owner's rights (security_invoker = false) so
-- that anon needs no access to the raw tables. They are safe because each view:
--   * selects an explicit, minimal column list (no captain_name, emails, profiles,
--     assignments, notes, audit data, correction details, or submitter/validator ids);
--   * filters to public_visible events/matches;
--   * shows scores/times ONLY for matches with an Official result;
--   * shows placements ONLY after approval + publication.
-- Supabase's linter flags "security definer views"; that is expected and reviewed here.

create or replace view public.public_events with (security_invoker = false) as
select e.id, e.event_code, e.event_name, e.format_type, e.venue, e.responsible_unit,
       e.start_date, e.end_date, e.status, e.counts_toward_overall, e.display_order,
       e.target_team_count,
       (select count(*) from public.event_participants ep
        where ep.event_id = e.id and ep.active and ep.check_in_status <> 'withdrawn')::integer
         as participant_count,
       e.updated_at
from public.events e
where e.public_visible;

create or replace view public.public_event_sessions with (security_invoker = false) as
select s.id, s.event_id, e.event_code, e.event_name, s.session_date, s.start_time, s.end_time,
       s.venue, s.venue_area, s.session_purpose, s.responsible_unit, s.status
from public.event_sessions s
join public.events e on e.id = s.event_id
where e.public_visible;

create or replace view public.public_matches with (security_invoker = false) as
select m.id, m.event_id, e.event_code, m.stage_id, st.stage_name, st.stage_order, st.stage_type,
       m.pool_id, p.pool_name, m.match_code, m.round_name, m.round_order, m.match_number,
       m.match_date, m.start_time, m.venue_area, m.match_type,
       case
         when m.status in ('official', 'complete') then 'official'
         when m.status = 'void' then 'void'
         when m.status = 'delayed' then 'delayed'
         when m.status in ('in_progress', 'submitted') then 'in_progress'
         else 'scheduled'
       end as public_status,
       (m.status in ('official', 'complete')) as is_official,
       m.next_winner_match_id, nw.match_code as next_winner_match_code, m.next_winner_slot,
       m.next_loser_match_id, nl.match_code as next_loser_match_code, m.next_loser_slot,
       m.updated_at
from public.matches m
join public.events e on e.id = m.event_id and e.public_visible
join public.stages st on st.id = m.stage_id
left join public.pools p on p.id = m.pool_id
left join public.matches nw on nw.id = m.next_winner_match_id and nw.public_visible
left join public.matches nl on nl.id = m.next_loser_match_id and nl.public_visible
where m.public_visible;

create or replace view public.public_match_participants with (security_invoker = false) as
select mp.id, mp.match_id, mp.slot, mp.participant_id, t.team_name, t.unit, ep.seed,
       mp.source_type, sm.match_code as source_match_code,
       case when off.is_official then mp.score end as score,
       case when off.is_official then mp.time_seconds end as time_seconds,
       case when off.is_official then mp.penalty_seconds end as penalty_seconds,
       case when off.is_official then mp.technical_score end as technical_score,
       case when off.is_official then mp.placement end as placement,
       mp.advanced, mp.eliminated,
       (off.is_official and r.winner_participant_id = mp.participant_id) as is_winner
from public.match_participants mp
join public.matches m on m.id = mp.match_id and m.public_visible
join public.events e on e.id = m.event_id and e.public_visible
left join public.event_participants ep on ep.id = mp.participant_id
left join public.teams t on t.id = ep.team_id
left join public.matches sm on sm.id = mp.source_match_id and sm.public_visible
left join public.match_results r on r.match_id = m.id and r.status = 'official'
cross join lateral (select m.status in ('official', 'complete') as is_official) off;

create or replace view public.public_match_results with (security_invoker = false) as
select r.id, r.match_id, m.event_id, m.match_code, r.result_method,
       r.winner_participant_id, tw.team_name as winner_team_name, tw.unit as winner_unit,
       r.loser_participant_id, tl.team_name as loser_team_name, tl.unit as loser_unit,
       r.validated_at as official_at
from public.match_results r
join public.matches m on m.id = r.match_id and m.public_visible
join public.events e on e.id = m.event_id and e.public_visible
left join public.event_participants ew on ew.id = r.winner_participant_id
left join public.teams tw on tw.id = ew.team_id
left join public.event_participants el on el.id = r.loser_participant_id
left join public.teams tl on tl.id = el.team_id
where r.status = 'official';

create or replace view public.public_pool_standings with (security_invoker = false) as
select pa.id, s.event_id, e.event_code, s.id as stage_id, s.stage_name, p.id as pool_id, p.pool_name,
       pa.participant_id, t.team_name, t.unit, pa.pool_seed, pa.wins, pa.losses, pa.ties,
       pa.points_for, pa.points_against, pa.point_differential, pa.pool_rank, pa.advanced,
       pa.advancement_type
from public.pool_assignments pa
join public.pools p on p.id = pa.pool_id
join public.stages s on s.id = p.stage_id
join public.events e on e.id = s.event_id and e.public_visible
join public.event_participants ep on ep.id = pa.participant_id
join public.teams t on t.id = ep.team_id;

create or replace view public.public_event_placements with (security_invoker = false) as
select pl.id, pl.event_id, e.event_code, e.event_name, pl.participant_id, t.id as team_id,
       t.team_name, t.unit, pl.final_place, pl.overall_points, pl.ranking_method,
       pl.tiebreak_metric, pl.tiebreak_value, pl.approved_at as published_at
from public.event_placements pl
join public.events e on e.id = pl.event_id and e.public_visible
join public.event_participants ep on ep.id = pl.participant_id
join public.teams t on t.id = ep.team_id
where pl.public_visible and pl.approved_at is not null;

create or replace view public.public_overall_leaderboard with (security_invoker = false) as
with enabled as (
  select coalesce((select s.enabled and coalesce(s.text_value, 'true') <> 'false'
                   from public.scoring_settings s where s.setting_key = 'overall_scoring_enabled'),
                  true) as on_
),
placement_pts as (
  select ep.team_id, sum(pl.overall_points) as pts, count(*) as events_placed,
         count(*) filter (where pl.final_place = 1) as firsts,
         count(*) filter (where pl.final_place = 2) as seconds,
         count(*) filter (where pl.final_place = 3) as thirds
  from public.event_placements pl
  join public.events e on e.id = pl.event_id and e.counts_toward_overall and e.public_visible
  join public.event_participants ep on ep.id = pl.participant_id and ep.eligible_for_points
  where pl.public_visible and pl.approved_at is not null
  group by ep.team_id
),
penalty_pts as (
  select ep.team_id, sum(pa.points) as pts
  from public.point_adjustments pa
  join public.events e on e.id = pa.event_id and e.counts_toward_overall and e.public_visible
  join public.event_participants ep on ep.id = pa.participant_id
  where pa.active and pa.public_visible
  group by ep.team_id
),
totals as (
  select t.id as team_id, t.team_name, t.unit,
         coalesce(pp.pts, 0) as placement_points,
         coalesce(pen.pts, 0) as adjustment_points,
         coalesce(pp.pts, 0) + coalesce(pen.pts, 0) as total_points,
         coalesce(pp.events_placed, 0)::integer as events_placed,
         coalesce(pp.firsts, 0)::integer as firsts,
         coalesce(pp.seconds, 0)::integer as seconds,
         coalesce(pp.thirds, 0)::integer as thirds
  from public.teams t
  left join placement_pts pp on pp.team_id = t.id
  left join penalty_pts pen on pen.team_id = t.id
  where t.active and (pp.team_id is not null or pen.team_id is not null)
)
select rank() over (order by total_points desc, firsts desc, seconds desc, thirds desc)::integer as rank,
       totals.*
from totals, enabled
where enabled.on_;

-- Public last-updated indicator
create or replace view public.public_last_update with (security_invoker = false) as
select max(created_at) as last_updated_at from public.public_updates;

grant select on
  public.public_events, public.public_event_sessions, public.public_matches,
  public.public_match_participants, public.public_match_results, public.public_pool_standings,
  public.public_event_placements, public.public_overall_leaderboard, public.public_last_update
to anon, authenticated;

-- Operator display names (id + display_name only) for active staff, e.g. to show
-- "submitted by" on the validation screen. Never available to anon.
create or replace view public.operator_names with (security_invoker = false) as
select p.id, p.display_name from public.profiles p where public.is_active_user();
revoke all on public.operator_names from anon;
grant select on public.operator_names to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
--   * public_updates: anon-readable, non-sensitive change feed. Public pages subscribe
--     and refetch the public views when a row arrives.
--   * matches / match_results / corrections: for authenticated operations dashboards.
--     Supabase Realtime applies RLS to postgres_changes, and anon has no SELECT on these
--     tables, so anonymous clients receive nothing from them.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table
    public.public_updates, public.matches, public.match_results, public.corrections;
end;
$$;
