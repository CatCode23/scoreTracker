-- WOTB Tournament Tracker: Row Level Security
--
-- Principles
--   * RLS is enabled on EVERY table in the public schema.
--   * The anon (public) role gets NO access to raw tables. Public pages read only the
--     public_* views (next migration), which expose official, public-safe columns.
--   * Every authenticated permission is checked here, not only in the UI.
--   * New sign-ins are inactive until an operations_admin activates them, so an
--     inactive profile matches no policy below except reading its own profile.
--
-- Role groups used below:
--   scoped read : scorer, venue_lead, sport_manager, read_only (per assignment)
--   submit      : scorer, venue_lead, sport_manager  (per event + venue)
--   validate    : venue_lead, sport_manager          (per event + venue)
--   manage      : sport_manager                      (per event)
--   global      : operations_admin (everything), read_only profile (read everything but audit)

-- Small definer helpers to resolve an event id from child rows without RLS recursion.
-- SAFE BECAUSE: they return only a uuid foreign key for a given id, no row data.
create or replace function public.stage_event_id(p_stage_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.event_id from public.stages s where s.id = p_stage_id;
$$;

create or replace function public.pool_event_id(p_pool_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.event_id from public.pools p join public.stages s on s.id = p.stage_id where p.id = p_pool_id;
$$;

create or replace function public.result_submitted_by(p_result_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.submitted_by from public.match_results r where r.id = p_result_id;
$$;

create or replace function public.can_read_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_global_read()
      or public.has_event_role(p_event_id, array['scorer', 'venue_lead', 'sport_manager', 'read_only']);
$$;

create or replace function public.can_read_match(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_global_read()
      or public.has_event_role(public.match_event_id(p_match_id), array['sport_manager', 'read_only'])
      or public.has_match_role(p_match_id, array['scorer', 'venue_lead']);
$$;

-- Operations admins and any active sport manager may create/edit team master records.
create or replace function public.can_register_teams()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_ops_admin() or exists (
    select 1 from public.user_assignments a join public.profiles p on p.id = a.profile_id
    where p.id = auth.uid() and p.active and a.active and a.assignment_role = 'sport_manager');
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere and strip default anon privileges on raw tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'events', 'teams', 'event_participants', 'event_sessions', 'stages', 'pools',
    'pool_assignments', 'matches', 'match_participants', 'match_results', 'corrections',
    'event_placements', 'points_matrix', 'scoring_settings', 'point_adjustments',
    'user_assignments', 'audit_log', 'public_updates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end;
$$;

-- audit_log: append-only through triggers. No client writes at all.
revoke insert, update, delete, truncate on public.audit_log from authenticated;
-- public_updates: read-only feed.
revoke insert, update, delete, truncate on public.public_updates from authenticated;
grant select on public.public_updates to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_ops_admin());
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_ops_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- user_assignments
-- ---------------------------------------------------------------------------
create policy assignments_select_own on public.user_assignments
  for select to authenticated using (profile_id = auth.uid());
create policy assignments_select_admin on public.user_assignments
  for select to authenticated using (public.is_ops_admin());
create policy assignments_insert_admin on public.user_assignments
  for insert to authenticated with check (public.is_ops_admin());
create policy assignments_update_admin on public.user_assignments
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy assignments_delete_admin on public.user_assignments
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- events (any active user may read; ops admin manages)
-- ---------------------------------------------------------------------------
create policy events_select on public.events
  for select to authenticated using (public.is_active_user());
create policy events_insert on public.events
  for insert to authenticated with check (public.is_ops_admin());
create policy events_update on public.events
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy events_delete on public.events
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- teams (captain_name is restricted: readable only by active authorized users)
-- ---------------------------------------------------------------------------
create policy teams_select on public.teams
  for select to authenticated using (public.is_active_user());
create policy teams_insert on public.teams
  for insert to authenticated with check (public.can_register_teams());
create policy teams_update on public.teams
  for update to authenticated
  using (public.can_register_teams()) with check (public.can_register_teams());
create policy teams_delete on public.teams
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- event_participants
-- ---------------------------------------------------------------------------
create policy participants_select on public.event_participants
  for select to authenticated using (public.can_read_event(event_id));
create policy participants_insert on public.event_participants
  for insert to authenticated with check (public.has_event_role(event_id, array['sport_manager']));
create policy participants_update on public.event_participants
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy participants_delete on public.event_participants
  for delete to authenticated using (public.has_event_role(event_id, array['sport_manager']));

-- ---------------------------------------------------------------------------
-- event_sessions
-- ---------------------------------------------------------------------------
create policy sessions_select on public.event_sessions
  for select to authenticated using (public.can_read_event(event_id));
create policy sessions_insert on public.event_sessions
  for insert to authenticated with check (public.has_event_role(event_id, array['sport_manager']));
create policy sessions_update on public.event_sessions
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy sessions_delete on public.event_sessions
  for delete to authenticated using (public.has_event_role(event_id, array['sport_manager']));

-- ---------------------------------------------------------------------------
-- stages
-- ---------------------------------------------------------------------------
create policy stages_select on public.stages
  for select to authenticated using (public.can_read_event(event_id));
create policy stages_insert on public.stages
  for insert to authenticated with check (public.has_event_role(event_id, array['sport_manager']));
create policy stages_update on public.stages
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy stages_delete on public.stages
  for delete to authenticated using (public.has_event_role(event_id, array['sport_manager']));

-- ---------------------------------------------------------------------------
-- pools
-- ---------------------------------------------------------------------------
create policy pools_select on public.pools
  for select to authenticated using (public.can_read_event(public.stage_event_id(stage_id)));
create policy pools_insert on public.pools
  for insert to authenticated
  with check (public.has_event_role(public.stage_event_id(stage_id), array['sport_manager']));
create policy pools_update on public.pools
  for update to authenticated
  using (public.has_event_role(public.stage_event_id(stage_id), array['sport_manager']))
  with check (public.has_event_role(public.stage_event_id(stage_id), array['sport_manager']));
create policy pools_delete on public.pools
  for delete to authenticated
  using (public.has_event_role(public.stage_event_id(stage_id), array['sport_manager']));

-- ---------------------------------------------------------------------------
-- pool_assignments
-- ---------------------------------------------------------------------------
create policy pool_assignments_select on public.pool_assignments
  for select to authenticated using (public.can_read_event(public.pool_event_id(pool_id)));
create policy pool_assignments_insert on public.pool_assignments
  for insert to authenticated
  with check (public.has_event_role(public.pool_event_id(pool_id), array['sport_manager']));
create policy pool_assignments_update on public.pool_assignments
  for update to authenticated
  using (public.has_event_role(public.pool_event_id(pool_id), array['sport_manager']))
  with check (public.has_event_role(public.pool_event_id(pool_id), array['sport_manager']));
create policy pool_assignments_delete on public.pool_assignments
  for delete to authenticated
  using (public.has_event_role(public.pool_event_id(pool_id), array['sport_manager']));

-- ---------------------------------------------------------------------------
-- matches (scorers / venue leads see only their event + venue)
-- ---------------------------------------------------------------------------
create policy matches_select on public.matches
  for select to authenticated using (public.can_read_match(id));
create policy matches_insert on public.matches
  for insert to authenticated with check (public.has_event_role(event_id, array['sport_manager']));
create policy matches_update on public.matches
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy matches_delete on public.matches
  for delete to authenticated using (public.has_event_role(event_id, array['sport_manager']));

-- ---------------------------------------------------------------------------
-- match_participants
-- ---------------------------------------------------------------------------
create policy match_participants_select on public.match_participants
  for select to authenticated using (public.can_read_match(match_id));
create policy match_participants_insert on public.match_participants
  for insert to authenticated
  with check (public.has_event_role(public.match_event_id(match_id), array['sport_manager']));
create policy match_participants_update on public.match_participants
  for update to authenticated
  using (public.has_event_role(public.match_event_id(match_id), array['sport_manager']))
  with check (public.has_event_role(public.match_event_id(match_id), array['sport_manager']));
create policy match_participants_delete on public.match_participants
  for delete to authenticated
  using (public.has_event_role(public.match_event_id(match_id), array['sport_manager']));

-- ---------------------------------------------------------------------------
-- match_results
--   scorer:   INSERT for assigned event/venue only, as themselves; NO update/delete.
--   validate: UPDATE (workflow columns only; enforced by validate_match_result trigger).
--   Official results cannot be edited (trigger), only voided by a sport manager.
-- ---------------------------------------------------------------------------
create policy results_select on public.match_results
  for select to authenticated using (public.can_read_match(match_id));
create policy results_insert on public.match_results
  for insert to authenticated
  with check (
    public.has_match_role(match_id, array['scorer', 'venue_lead', 'sport_manager'])
    and submitted_by = auth.uid()
    and status in ('draft', 'submitted')
  );
create policy results_update on public.match_results
  for update to authenticated
  using (public.has_match_role(match_id, array['venue_lead', 'sport_manager']))
  with check (public.has_match_role(match_id, array['venue_lead', 'sport_manager']));
create policy results_delete on public.match_results
  for delete to authenticated using (public.is_ops_admin() and status <> 'official');

-- ---------------------------------------------------------------------------
-- corrections
-- ---------------------------------------------------------------------------
create policy corrections_select on public.corrections
  for select to authenticated
  using (requested_by = auth.uid()
         or public.has_global_read()
         or public.has_match_role(public.result_match_id(result_id), array['venue_lead', 'sport_manager']));
create policy corrections_insert on public.corrections
  for insert to authenticated
  with check (
    public.is_active_user()
    and requested_by = auth.uid()
    and (public.result_submitted_by(result_id) = auth.uid()
         or public.has_match_role(public.result_match_id(result_id), array['venue_lead', 'sport_manager']))
  );
create policy corrections_update on public.corrections
  for update to authenticated
  using (public.has_event_role(public.match_event_id(public.result_match_id(result_id)), array['sport_manager']))
  with check (public.has_event_role(public.match_event_id(public.result_match_id(result_id)), array['sport_manager']));
create policy corrections_delete on public.corrections
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- event_placements (approval/publication restricted to ops admin by trigger)
-- ---------------------------------------------------------------------------
create policy placements_select on public.event_placements
  for select to authenticated using (public.can_read_event(event_id));
create policy placements_insert on public.event_placements
  for insert to authenticated with check (public.has_event_role(event_id, array['sport_manager']));
create policy placements_update on public.event_placements
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy placements_delete on public.event_placements
  for delete to authenticated using (public.has_event_role(event_id, array['sport_manager']));

-- ---------------------------------------------------------------------------
-- point_adjustments
-- ---------------------------------------------------------------------------
create policy adjustments_select on public.point_adjustments
  for select to authenticated using (public.can_read_event(event_id));
create policy adjustments_insert on public.point_adjustments
  for insert to authenticated
  with check (public.has_event_role(event_id, array['sport_manager']) and applied_by = auth.uid());
create policy adjustments_update on public.point_adjustments
  for update to authenticated
  using (public.has_event_role(event_id, array['sport_manager']))
  with check (public.has_event_role(event_id, array['sport_manager']));
create policy adjustments_delete on public.point_adjustments
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- points_matrix & scoring_settings (read: active users; write: ops admin)
-- ---------------------------------------------------------------------------
create policy matrix_select on public.points_matrix
  for select to authenticated using (public.is_active_user());
create policy matrix_insert on public.points_matrix
  for insert to authenticated with check (public.is_ops_admin());
create policy matrix_update on public.points_matrix
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy matrix_delete on public.points_matrix
  for delete to authenticated using (public.is_ops_admin());

create policy settings_select on public.scoring_settings
  for select to authenticated using (public.is_active_user());
create policy settings_insert on public.scoring_settings
  for insert to authenticated with check (public.is_ops_admin());
create policy settings_update on public.scoring_settings
  for update to authenticated using (public.is_ops_admin()) with check (public.is_ops_admin());
create policy settings_delete on public.scoring_settings
  for delete to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- audit_log: operations admin read only. No INSERT/UPDATE/DELETE policies exist.
-- ---------------------------------------------------------------------------
create policy audit_select_admin on public.audit_log
  for select to authenticated using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- public_updates: anyone may read the (non-sensitive) change feed.
-- ---------------------------------------------------------------------------
create policy public_updates_select on public.public_updates
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Function execution: helpers are callable by authenticated users (they only
-- answer about the caller). Workflow RPCs are invoker-rights and RLS-checked.
-- ---------------------------------------------------------------------------
revoke execute on function public.advance_participant(uuid, uuid, uuid, text, text, boolean, text) from anon;
revoke execute on function public.apply_no_show_penalty(uuid, text) from anon;
revoke execute on function public.approve_event_placements(uuid, boolean) from anon;
revoke execute on function public.recompute_pool_standings(uuid) from anon;
revoke execute on function public.load_preliminary_schedule(integer, boolean) from anon;
