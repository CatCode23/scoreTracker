-- WOTB Tournament Tracker: helper functions, triggers, workflow RPCs
--
-- SECURITY DEFINER policy for this file:
--   * Every SECURITY DEFINER function sets `search_path = ''` and schema-qualifies
--     every object, so a caller cannot hijack name resolution.
--   * Each one carries a "SAFE BECAUSE" note explaining why elevated rights are needed
--     and why they cannot be abused.
--   * Workflow RPCs that change data are SECURITY INVOKER, so the caller's RLS policies
--     still apply to every row they touch.

-- ===========================================================================
-- 1. updated_at maintenance
-- ===========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'events', 'teams', 'event_participants', 'event_sessions', 'stages', 'pools',
    'pool_assignments', 'matches', 'match_participants', 'match_results', 'corrections',
    'event_placements', 'scoring_settings', 'point_adjustments', 'user_assignments']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ===========================================================================
-- 2. Authorization helpers (used by RLS policies and triggers)
-- ===========================================================================
-- SAFE BECAUSE: these read profiles/user_assignments, which are themselves protected
-- by RLS; invoker rights would make policies on those tables recurse. They only ever
-- answer questions about the *calling* user (auth.uid()), return booleans/text, and
-- accept no SQL fragments.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.is_ops_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'operations_admin'
           or exists (select 1 from public.user_assignments a
                      where a.profile_id = p.id and a.active
                        and a.assignment_role = 'operations_admin'))
  );
$$;

-- Operations admins and read_only users can see all operational (non-audit) data.
create or replace function public.has_global_read()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ops_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'read_only'
           or exists (select 1 from public.user_assignments a
                      where a.profile_id = p.id and a.active
                        and a.assignment_role = 'read_only' and a.event_id is null))
  );
$$;

-- Venue a match is played at: the session venue, else the event venue.
create or replace function public.match_venue(p_match_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(coalesce(s.venue, e.venue)))
  from public.matches m
  join public.events e on e.id = m.event_id
  left join public.event_sessions s on s.id = m.session_id
  where m.id = p_match_id;
$$;

-- Does the caller hold one of p_roles for this event (any venue)?
create or replace function public.has_event_role(p_event_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ops_admin() or exists (
    select 1
    from public.user_assignments a
    join public.profiles p on p.id = a.profile_id
    where p.id = auth.uid() and p.active and a.active
      and a.assignment_role = any (p_roles)
      and (a.event_id is null or a.event_id = p_event_id)
  );
$$;

-- Does the caller hold one of p_roles for this match's event AND venue?
-- A venue-scoped assignment matches only when the match venue equals it.
create or replace function public.has_match_role(p_match_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ops_admin() or exists (
    select 1
    from public.matches m
    join public.user_assignments a on (a.event_id is null or a.event_id = m.event_id)
    join public.profiles p on p.id = a.profile_id
    where m.id = p_match_id
      and p.id = auth.uid() and p.active and a.active
      and a.assignment_role = any (p_roles)
      and (a.venue is null or lower(trim(a.venue)) = public.match_venue(m.id))
  );
$$;

create or replace function public.match_event_id(p_match_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.event_id from public.matches m where m.id = p_match_id;
$$;

create or replace function public.result_match_id(p_result_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.match_id from public.match_results r where r.id = p_result_id;
$$;

-- Role groups (kept in one place so policies stay consistent)
-- submit:   scorer, venue_lead, sport_manager
-- validate: venue_lead, sport_manager
-- manage:   sport_manager
-- read:     every scoped role (scorer, venue_lead, sport_manager, read_only)

-- ===========================================================================
-- 3. New auth user -> inactive profile
-- ===========================================================================
-- SAFE BECAUSE: runs only on auth.users insert (Supabase-managed), creates a profile
-- that is INACTIVE with the least-privileged role. An operations_admin must activate it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    'read_only',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Users may edit their own display_name only. Role/active/email changes need ops admin.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_ops_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Only an operations admin can change role, active status, or email'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ===========================================================================
-- 4. Public change feed (Realtime)
-- ===========================================================================
-- SAFE BECAUSE: writes only (event_id, kind) to public_updates, which contains no
-- sensitive data. Anonymous users cannot write to that table themselves.
create or replace function public.bump_public_update(p_event_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.public_updates (event_id, kind) values (p_event_id, p_kind);
  -- keep the feed small
  delete from public.public_updates where created_at < now() - interval '2 days';
end;
$$;
revoke all on function public.bump_public_update(uuid, text) from public, anon, authenticated;

-- ===========================================================================
-- 5. Audit logging
-- ===========================================================================
-- SAFE BECAUSE: audit_log has no client INSERT/UPDATE/DELETE policy, so writes must
-- come from here. The function only records OLD/NEW of the row being changed and the
-- calling user; it cannot be invoked directly (trigger function).
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action text := lower(tg_op);
  v_reason text := nullif(current_setting('app.audit_reason', true), '');
  v_event uuid;
begin
  -- Derive a meaningful workflow action
  if tg_table_name = 'match_results' then
    if tg_op = 'INSERT' and v_new ->> 'status' = 'submitted' then
      v_action := 'submit';
    elsif tg_op = 'UPDATE' and (v_old ->> 'status') is distinct from (v_new ->> 'status') then
      v_action := case v_new ->> 'status'
        when 'official' then 'approve'
        when 'returned' then 'return'
        when 'disputed' then 'dispute'
        when 'void' then 'void'
        when 'submitted' then 'submit'
        else 'update' end;
    end if;
    v_reason := coalesce(v_reason, v_new ->> 'status_reason');
  elsif tg_table_name = 'event_placements' and tg_op = 'UPDATE' then
    if (v_new ->> 'public_visible')::boolean and not (v_old ->> 'public_visible')::boolean then
      v_action := 'publish';
    elsif v_new ->> 'approved_at' is not null and v_old ->> 'approved_at' is null then
      v_action := 'approve';
    end if;
  elsif tg_table_name = 'corrections' and tg_op = 'UPDATE'
        and (v_old ->> 'decision') is distinct from (v_new ->> 'decision') then
    v_action := case v_new ->> 'decision' when 'approved' then 'approve' else 'validate' end;
    v_reason := coalesce(v_reason, v_new ->> 'decision_notes');
  elsif tg_table_name = 'corrections' and tg_op = 'INSERT' then
    v_reason := coalesce(v_reason, v_new ->> 'reason');
  elsif tg_table_name = 'point_adjustments' then
    v_reason := coalesce(v_reason, v_row ->> 'reason');
  end if;

  -- Denormalized event id for filtering
  v_event := case
    when v_row ? 'event_id' then (v_row ->> 'event_id')::uuid
    when tg_table_name in ('match_participants', 'match_results') then
      (select m.event_id from public.matches m where m.id = (v_row ->> 'match_id')::uuid)
    when tg_table_name = 'corrections' then
      (select m.event_id from public.match_results r join public.matches m on m.id = r.match_id
       where r.id = (v_row ->> 'result_id')::uuid)
    else null end;

  insert into public.audit_log (table_name, record_id, event_id, action, actor_profile_id,
                                old_data, new_data, reason)
  values (tg_table_name, (v_row ->> 'id')::uuid, v_event, v_action,
          case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() end,
          v_old, v_new, v_reason);

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'matches', 'match_participants', 'match_results', 'corrections', 'event_placements',
    'point_adjustments', 'event_participants', 'teams', 'user_assignments', 'profiles',
    'scoring_settings', 'events']
  loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_trigger()', t);
  end loop;
end;
$$;

-- ===========================================================================
-- 6. Integrity triggers
-- ===========================================================================

-- match_participants: the participant must be registered in the match's event.
create or replace function public.check_match_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.participant_id is not null and not exists (
    select 1 from public.event_participants ep
    join public.matches m on m.event_id = ep.event_id
    where ep.id = new.participant_id and m.id = new.match_id
  ) then
    raise exception 'Participant is not registered in this match''s event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_match_participant before insert or update on public.match_participants
  for each row execute function public.check_match_participant();

-- matches: stage and pool must belong to the same event.
create or replace function public.check_match_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stages s where s.id = new.stage_id and s.event_id = new.event_id) then
    raise exception 'Stage does not belong to this event' using errcode = '23514';
  end if;
  if new.pool_id is not null and not exists (
    select 1 from public.pools p where p.id = new.pool_id and p.stage_id = new.stage_id) then
    raise exception 'Pool does not belong to this stage' using errcode = '23514';
  end if;
  if new.session_id is not null and not exists (
    select 1 from public.event_sessions s where s.id = new.session_id and s.event_id = new.event_id) then
    raise exception 'Session does not belong to this event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_match_consistency before insert or update on public.matches
  for each row execute function public.check_match_consistency();

-- pool_assignments: participant must be in the pool's event.
create or replace function public.check_pool_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pools p
    join public.stages s on s.id = p.stage_id
    join public.event_participants ep on ep.event_id = s.event_id
    where p.id = new.pool_id and ep.id = new.participant_id) then
    raise exception 'Participant is not registered in this pool''s event' using errcode = '23514';
  end if;
  new.point_differential := coalesce(new.points_for, 0) - coalesce(new.points_against, 0);
  return new;
end;
$$;

create trigger check_pool_assignment before insert or update on public.pool_assignments
  for each row execute function public.check_pool_assignment();

-- ===========================================================================
-- 7. Match result validation & workflow
-- ===========================================================================
create or replace function public.validate_match_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_system boolean := auth.uid() is null; -- SQL editor / migrations
  v_is_manager boolean;
  v_is_validator boolean;
  v_item jsonb;
  v_match_status text;
begin
  -- Winner / loser must be assigned to this match
  if new.winner_participant_id is not null and not exists (
      select 1 from public.match_participants mp
      where mp.match_id = new.match_id and mp.participant_id = new.winner_participant_id) then
    raise exception 'Winner is not assigned to this match' using errcode = '23514';
  end if;
  if new.loser_participant_id is not null and not exists (
      select 1 from public.match_participants mp
      where mp.match_id = new.match_id and mp.participant_id = new.loser_participant_id) then
    raise exception 'Loser is not assigned to this match' using errcode = '23514';
  end if;
  if new.winner_participant_id is not null
     and new.winner_participant_id = new.loser_participant_id then
    raise exception 'Winner and loser cannot be the same participant' using errcode = '23514';
  end if;

  -- Per-participant values: must reference match participants, never negative
  for v_item in select * from jsonb_array_elements(new.participant_values) loop
    if not exists (select 1 from public.match_participants mp
                   where mp.match_id = new.match_id
                     and mp.participant_id = (v_item ->> 'participant_id')::uuid) then
      raise exception 'Result references a team that is not in this match' using errcode = '23514';
    end if;
    if coalesce((v_item ->> 'score')::numeric, 0) < 0
       or coalesce((v_item ->> 'time_seconds')::numeric, 0) < 0
       or coalesce((v_item ->> 'penalty_seconds')::numeric, 0) < 0
       or coalesce((v_item ->> 'technical_score')::numeric, 0) < 0
       or coalesce((v_item ->> 'placement')::numeric, 1) < 1 then
      raise exception 'Scores, times, penalties and placements cannot be negative' using errcode = '23514';
    end if;
  end loop;

  if new.status = 'official' and not new.referee_confirmed then
    raise exception 'A result cannot be Official without referee confirmation' using errcode = '23514';
  end if;

  v_is_manager := v_is_system or public.has_match_role(new.match_id, array['sport_manager']);
  v_is_validator := v_is_manager or public.has_match_role(new.match_id, array['venue_lead']);

  if tg_op = 'INSERT' then
    select m.status into v_match_status from public.matches m where m.id = new.match_id;
    if v_match_status in ('void', 'official', 'complete') then
      raise exception 'This match is % and cannot accept a new result', v_match_status
        using errcode = '23514';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'New results must be submitted; they are made Official by validation'
        using errcode = '23514';
    end if;
    if not v_is_system then
      new.submitted_by := v_uid;
    end if;
    new.submitted_at := case when new.status = 'submitted' then now() end;
    new.validated_by := null;
    new.validated_at := null;
    return new;
  end if;

  -- UPDATE
  if not v_is_manager then
    -- Validators may change only the workflow fields.
    if new.match_id is distinct from old.match_id
       or new.result_method is distinct from old.result_method
       or new.winner_participant_id is distinct from old.winner_participant_id
       or new.loser_participant_id is distinct from old.loser_participant_id
       or new.participant_values is distinct from old.participant_values
       or new.referee_confirmed is distinct from old.referee_confirmed
       or new.submitted_by is distinct from old.submitted_by
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Only a sport manager can change submitted values; request a correction instead'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not v_is_validator then
      raise exception 'You do not have validation authority for this match' using errcode = '42501';
    end if;
    -- Allowed transitions
    if not (
      (old.status in ('draft') and new.status in ('submitted', 'void'))
      or (old.status = 'submitted' and new.status in ('official', 'returned', 'disputed', 'void'))
      or (old.status = 'disputed' and new.status in ('official', 'returned', 'void'))
      or (old.status = 'official' and new.status = 'void' and v_is_manager)
    ) then
      raise exception 'Cannot change a result from % to %', old.status, new.status
        using errcode = '23514';
    end if;
    if new.status in ('returned', 'disputed', 'void')
       and coalesce(trim(new.status_reason), '') = '' then
      raise exception 'A reason is required to % a result', new.status using errcode = '23514';
    end if;
    if new.status in ('official', 'returned', 'disputed', 'void') then
      new.validated_by := case when v_is_system then new.validated_by else v_uid end;
      new.validated_at := now();
    end if;
    if new.status = 'submitted' then
      new.submitted_at := now();
    end if;
  elsif old.status = 'official' and not v_is_system then
    raise exception 'An Official result cannot be edited; void it through a correction' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger validate_match_result before insert or update on public.match_results
  for each row execute function public.validate_match_result();

-- After a result changes: update match status, copy values when Official.
-- SAFE BECAUSE: fires only after validate_match_result() and RLS have authorized the
-- result change. It needs definer rights because venue leads (who mark results Official)
-- intentionally have no direct UPDATE access to matches / match_participants. It only
-- touches the match the result belongs to.
create or replace function public.apply_match_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_event uuid;
begin
  select m.event_id into v_event from public.matches m where m.id = new.match_id;

  if tg_op = 'INSERT' then
    if new.status = 'submitted' then
      update public.matches set status = 'submitted'
      where id = new.match_id and status not in ('official', 'complete', 'void');
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'submitted' then
    update public.matches set status = 'submitted'
    where id = new.match_id and status not in ('official', 'complete', 'void');

  elsif new.status = 'official' then
    -- Copy entered values onto the match participants
    for v_item in select * from jsonb_array_elements(new.participant_values) loop
      update public.match_participants mp set
        score = (v_item ->> 'score')::numeric,
        time_seconds = (v_item ->> 'time_seconds')::numeric,
        penalty_seconds = coalesce((v_item ->> 'penalty_seconds')::numeric, 0),
        technical_score = (v_item ->> 'technical_score')::numeric,
        placement = (v_item ->> 'placement')::integer
      where mp.match_id = new.match_id
        and mp.participant_id = (v_item ->> 'participant_id')::uuid;
    end loop;
    update public.matches set status = 'official' where id = new.match_id;
    perform public.bump_public_update(v_event, 'result_official');

  elsif new.status in ('returned', 'void', 'disputed') then
    if old.status = 'official' then
      -- An Official result was voided (correction). Clear the published values.
      update public.match_participants set
        score = null, time_seconds = null, penalty_seconds = 0,
        technical_score = null, placement = null
      where match_id = new.match_id;
      perform public.bump_public_update(v_event, 'result_voided');
    end if;
    -- Reopen the match unless another result is still pending / official
    if not exists (select 1 from public.match_results r
                   where r.match_id = new.match_id and r.id <> new.id
                     and r.status in ('submitted', 'disputed', 'official')) then
      update public.matches
      set status = case when new.status = 'disputed' then 'submitted' else 'ready' end
      where id = new.match_id and status <> 'void';
    end if;
  end if;

  return new;
end;
$$;

create trigger apply_match_result after insert or update on public.match_results
  for each row execute function public.apply_match_result();

-- Corrections: force requester / pending on insert; decision fields by managers only.
create or replace function public.guard_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.requested_by := auth.uid();
    end if;
    new.requested_at := now();
    new.decision := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    return new;
  end if;
  if new.decision is distinct from old.decision then
    if old.decision <> 'pending' then
      raise exception 'This correction has already been decided' using errcode = '23514';
    end if;
    if auth.uid() is not null then
      new.decided_by := auth.uid();
    end if;
    new.decided_at := now();
  end if;
  if auth.uid() is not null and (new.result_id is distinct from old.result_id
      or new.requested_by is distinct from old.requested_by
      or new.reason is distinct from old.reason) then
    raise exception 'Correction request details cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_correction before insert or update on public.corrections
  for each row execute function public.guard_correction();

-- ===========================================================================
-- 8. Event placement scoring
-- ===========================================================================
create or replace function public.compute_placement_points()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_admin boolean := auth.uid() is null or public.is_ops_admin();
  v_withdrawn boolean := false;
begin
  if not exists (select 1 from public.event_participants ep
                 where ep.id = new.participant_id and ep.event_id = new.event_id) then
    raise exception 'Participant is not registered in this event' using errcode = '23514';
  end if;

  if new.points_override and not v_is_admin
     and (tg_op = 'INSERT' or new.overall_points is distinct from old.overall_points
          or not old.points_override) then
    raise exception 'Only an operations admin can override placement points' using errcode = '42501';
  end if;

  if not new.points_override then
    new.overall_points := coalesce(
      (select pm.points from public.points_matrix pm where pm.place = new.final_place), 0);
  end if;

  if tg_op = 'UPDATE' then
    -- Changing the substance of an approved placement withdraws approval & publication.
    if new.final_place is distinct from old.final_place
       or new.overall_points is distinct from old.overall_points
       or new.participant_id is distinct from old.participant_id then
      if new.approved_at is not distinct from old.approved_at then
        new.approved_at := null;
        new.approved_by := null;
        new.public_visible := false;
        v_withdrawn := true;
      end if;
    end if;
    if not v_withdrawn and (new.approved_at is distinct from old.approved_at
        or new.public_visible is distinct from old.public_visible) and not v_is_admin then
      raise exception 'Only an operations admin can approve or publish placements' using errcode = '42501';
    end if;
  elsif (new.approved_at is not null or new.public_visible) and not v_is_admin then
    raise exception 'Only an operations admin can approve or publish placements' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger compute_placement_points before insert or update on public.event_placements
  for each row execute function public.compute_placement_points();

-- Recalculate points when the matrix changes (non-overridden rows only)
create or replace function public.recalculate_all_placement_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
-- SAFE BECAUSE: only operations admins can modify points_matrix (RLS). This re-applies
-- the matrix to non-overridden placements and does not change approval state.
begin
  update public.event_placements ep
  set overall_points = coalesce((select pm.points from public.points_matrix pm
                                 where pm.place = ep.final_place), 0)
  where not ep.points_override;
  perform public.bump_public_update(null, 'points_matrix');
  return null;
end;
$$;

create trigger recalculate_placement_points after insert or update or delete on public.points_matrix
  for each statement execute function public.recalculate_all_placement_points();

-- Keep event_participants.final_place / event_points in sync with placements
-- SAFE BECAUSE: mirrors the authorized placement row onto its own participant row only.
create or replace function public.sync_participant_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.event_participants set final_place = null, event_points = 0
    where id = old.participant_id;
    if old.public_visible then
      perform public.bump_public_update(old.event_id, 'placement');
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.participant_id <> new.participant_id then
    update public.event_participants set final_place = null, event_points = 0
    where id = old.participant_id;
  end if;
  update public.event_participants
  set final_place = new.final_place, event_points = new.overall_points
  where id = new.participant_id;
  if new.public_visible or (tg_op = 'UPDATE' and old.public_visible) then
    perform public.bump_public_update(new.event_id, 'placement');
  end if;
  return new;
end;
$$;

create trigger sync_participant_placement after insert or update or delete on public.event_placements
  for each row execute function public.sync_participant_placement();

-- ===========================================================================
-- 9. Public change notifications for other public-facing tables
-- ===========================================================================
-- SAFE BECAUSE: only emits (event_id, kind) for rows that are public-visible.
create or replace function public.notify_public_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_event uuid;
  v_public boolean;
begin
  if tg_table_name = 'events' then
    v_event := (v_row ->> 'id')::uuid;
    v_public := (v_row ->> 'public_visible')::boolean or coalesce((v_old ->> 'public_visible')::boolean, false);
  elsif tg_table_name = 'match_participants' then
    select m.event_id, m.public_visible into v_event, v_public
    from public.matches m where m.id = (v_row ->> 'match_id')::uuid;
  elsif tg_table_name = 'pool_assignments' then
    select s.event_id, true into v_event, v_public
    from public.pools p join public.stages s on s.id = p.stage_id
    where p.id = (v_row ->> 'pool_id')::uuid;
  elsif tg_table_name = 'point_adjustments' then
    v_event := (v_row ->> 'event_id')::uuid;
    v_public := (v_row ->> 'public_visible')::boolean or coalesce((v_old ->> 'public_visible')::boolean, false);
  else
    v_event := (v_row ->> 'event_id')::uuid;
    v_public := coalesce((v_row ->> 'public_visible')::boolean, true)
                or coalesce((v_old ->> 'public_visible')::boolean, false);
  end if;
  if coalesce(v_public, false) then
    perform public.bump_public_update(v_event, tg_table_name);
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['events', 'event_sessions', 'stages', 'matches', 'match_participants',
                           'pool_assignments', 'point_adjustments']
  loop
    execute format(
      'create trigger notify_public_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.notify_public_change()', t);
  end loop;
end;
$$;

-- ===========================================================================
-- 10. Workflow RPCs (SECURITY INVOKER: caller's RLS applies)
-- ===========================================================================

-- Manual winner/loser advancement into a destination match slot.
-- Returns 'placed', 'unchanged', or raises SLOT_OCCUPIED when p_overwrite is false.
create or replace function public.advance_participant(
  p_from_match_id uuid,
  p_participant_id uuid,
  p_to_match_id uuid,
  p_slot text,
  p_source_type text,      -- 'winner_of_match' | 'loser_of_match' | 'manual' | ...
  p_overwrite boolean default false,
  p_reason text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing record;
  v_from_event uuid;
  v_to_event uuid;
begin
  if not public.has_event_role(public.match_event_id(p_to_match_id), array['sport_manager']) then
    raise exception 'Only a sport manager for this event can advance teams' using errcode = '42501';
  end if;
  select event_id into v_from_event from public.matches where id = p_from_match_id;
  select event_id into v_to_event from public.matches where id = p_to_match_id;
  if v_to_event is null then
    raise exception 'Destination match not found' using errcode = 'P0002';
  end if;
  if p_from_match_id is not null and v_from_event is distinct from v_to_event then
    raise exception 'Source and destination matches must be in the same event' using errcode = '23514';
  end if;
  if p_from_match_id = p_to_match_id then
    raise exception 'A team cannot be advanced into the same match' using errcode = '23514';
  end if;
  if coalesce(trim(p_slot), '') = '' then
    raise exception 'A destination slot is required' using errcode = '23514';
  end if;

  perform set_config('app.audit_reason', coalesce(p_reason, 'Manual advancement'), true);

  select * into v_existing from public.match_participants
  where match_id = p_to_match_id and slot = p_slot;

  if found and v_existing.participant_id = p_participant_id then
    return 'unchanged';
  end if;
  if found and v_existing.participant_id is not null and not p_overwrite then
    raise exception 'SLOT_OCCUPIED: slot % of the destination match is already occupied', p_slot
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.match_participants
             where match_id = p_to_match_id and participant_id = p_participant_id and slot <> p_slot) then
    raise exception 'This team is already in another slot of the destination match' using errcode = '23514';
  end if;

  if found then
    update public.match_participants
    set participant_id = p_participant_id, source_type = p_source_type,
        source_match_id = p_from_match_id,
        score = null, time_seconds = null, penalty_seconds = 0, technical_score = null,
        placement = null, advanced = false, eliminated = false
    where id = v_existing.id;
  else
    insert into public.match_participants (match_id, participant_id, slot, source_type, source_match_id)
    values (p_to_match_id, p_participant_id, p_slot, p_source_type, p_from_match_id);
  end if;

  if p_from_match_id is not null and p_source_type = 'winner_of_match' then
    update public.match_participants set advanced = true
    where match_id = p_from_match_id and participant_id = p_participant_id;
  end if;

  return 'placed';
end;
$$;

-- Apply the configured no-show penalty. Requires explicit human confirmation in the UI;
-- never called automatically.
create or replace function public.apply_no_show_penalty(p_participant_id uuid, p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event uuid;
  v_points numeric;
  v_enabled boolean;
  v_id uuid;
begin
  select event_id into v_event from public.event_participants where id = p_participant_id;
  if v_event is null then
    raise exception 'Participant not found' using errcode = 'P0002';
  end if;
  if not public.has_event_role(v_event, array['sport_manager']) then
    raise exception 'Only a sport manager or operations admin can apply penalties' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '23514';
  end if;
  select numeric_value, enabled into v_points, v_enabled
  from public.scoring_settings where setting_key = 'no_show_penalty';
  if not coalesce(v_enabled, false) or v_points is null then
    raise exception 'The no-show penalty is disabled in scoring settings' using errcode = '23514';
  end if;

  update public.event_participants set check_in_status = 'no_show' where id = p_participant_id;
  insert into public.point_adjustments (event_id, participant_id, adjustment_type, points, reason, applied_by)
  values (v_event, p_participant_id, 'no_show_penalty', v_points, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Approve (and optionally publish) all placements for an event. Operations admin only.
create or replace function public.approve_event_placements(p_event_id uuid, p_publish boolean)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if not public.is_ops_admin() then
    raise exception 'Only an operations admin can approve placements' using errcode = '42501';
  end if;
  update public.event_placements
  set approved_at = coalesce(approved_at, now()),
      approved_by = coalesce(approved_by, auth.uid()),
      public_visible = p_publish
  where event_id = p_event_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Recompute pool standings from Official pool-game results. Ranking: standing points
-- (W=2, T=1) desc, point differential desc, points for desc. pool_rank is suggested;
-- managers may still override it and decide advancement manually.
create or replace function public.recompute_pool_standings(p_pool_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_event uuid;
begin
  select s.event_id into v_event from public.pools p join public.stages s on s.id = p.stage_id
  where p.id = p_pool_id;
  if not public.has_event_role(v_event, array['sport_manager']) then
    raise exception 'Only a sport manager can recompute standings' using errcode = '42501';
  end if;

  with games as (
    select mp.participant_id, mp.score as pf,
           (select max(o.score) from public.match_participants o
            where o.match_id = mp.match_id and o.id <> mp.id) as pa
    from public.matches m
    join public.match_participants mp on mp.match_id = m.id
    where m.pool_id = p_pool_id and m.status in ('official', 'complete')
      and mp.participant_id is not null
  ), agg as (
    select participant_id,
           count(*) filter (where pf > pa) as w,
           count(*) filter (where pf < pa) as l,
           count(*) filter (where pf = pa) as t,
           coalesce(sum(pf), 0) as pf, coalesce(sum(pa), 0) as pa
    from games group by participant_id
  )
  update public.pool_assignments pa set
    wins = coalesce(a.w, 0), losses = coalesce(a.l, 0), ties = coalesce(a.t, 0),
    points_for = coalesce(a.pf, 0), points_against = coalesce(a.pa, 0)
  from public.pool_assignments pa2
  left join agg a on a.participant_id = pa2.participant_id
  where pa.id = pa2.id and pa2.pool_id = p_pool_id;

  with ranked as (
    select id, rank() over (order by (wins * 2 + ties) desc, point_differential desc, points_for desc) as r
    from public.pool_assignments where pool_id = p_pool_id
  )
  update public.pool_assignments pa set pool_rank = ranked.r
  from ranked where ranked.id = pa.id;
end;
$$;

-- Load the preliminary (editable) schedule for a chosen tournament year.
-- Operations admin only. Refuses to duplicate an event's sessions unless p_replace.
create or replace function public.load_preliminary_schedule(p_year integer, p_replace boolean default false)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_ev record;
  d7 date := make_date(p_year, 12, 7);
  d8 date := make_date(p_year, 12, 8);
  d9 date := make_date(p_year, 12, 9);
begin
  if not (auth.uid() is null or public.is_ops_admin()) then
    raise exception 'Only an operations admin can load the schedule' using errcode = '42501';
  end if;
  if p_year < 2024 or p_year > 2100 then
    raise exception 'Tournament year % is out of range', p_year using errcode = '22023';
  end if;

  insert into public.scoring_settings (setting_key, numeric_value, enabled)
  values ('tournament_year', p_year, true)
  on conflict (setting_key) do update set numeric_value = excluded.numeric_value;

  for v_ev in
    select e.id, e.event_code, e.venue, e.responsible_unit from public.events e
    where e.event_code in ('SOC', 'CMB', 'ESP', 'DB', 'BSK', 'FFB', 'BPT', 'BIG7')
  loop
    if exists (select 1 from public.event_sessions s where s.event_id = v_ev.id) then
      if not p_replace then
        continue;
      end if;
      delete from public.event_sessions where event_id = v_ev.id;
    end if;

    if v_ev.event_code = 'BPT' then
      insert into public.event_sessions (event_id, session_date, start_time, end_time, venue,
                                         session_purpose, responsible_unit, notes)
      values (v_ev.id, d8, '07:30', '13:00', v_ev.venue, 'Competition', v_ev.responsible_unit,
              'Preliminary schedule - editable');
      update public.events set start_date = d8, end_date = d8 where id = v_ev.id;
      v_count := v_count + 1;
    elsif v_ev.event_code = 'BIG7' then
      insert into public.event_sessions (event_id, session_date, start_time, end_time, venue,
                                         session_purpose, responsible_unit, notes)
      values (v_ev.id, d8, '12:30', '14:30', v_ev.venue, 'Competition', v_ev.responsible_unit,
              'Preliminary schedule - editable');
      update public.events set start_date = d8, end_date = d8 where id = v_ev.id;
      v_count := v_count + 1;
    else
      insert into public.event_sessions (event_id, session_date, start_time, end_time, venue,
                                         session_purpose, responsible_unit, notes)
      values
        (v_ev.id, d7, '13:00', '17:00', v_ev.venue, 'Day 1', v_ev.responsible_unit, 'Preliminary schedule - editable'),
        (v_ev.id, d8, '09:00', '17:00', v_ev.venue, 'Day 2', v_ev.responsible_unit, 'Preliminary schedule - editable'),
        (v_ev.id, d9, '09:00', '17:00', v_ev.venue, 'Day 3', v_ev.responsible_unit, 'Preliminary schedule - editable');
      update public.events set start_date = d7, end_date = d9 where id = v_ev.id;
      v_count := v_count + 3;
    end if;
  end loop;
  return v_count;
end;
$$;
