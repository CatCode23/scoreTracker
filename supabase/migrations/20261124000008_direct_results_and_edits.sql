-- WOTB Tournament Tracker: direct-to-Official results, Edit result, no referee check
--
-- * Results entered by staff with validation authority (venue lead, sport manager,
--   operations admin) are Official immediately. Results entered by Scorer accounts still
--   wait for approval.
-- * Referee confirmation is no longer required (the column stays, unused).
-- * New RPC correct_match_result(): an operations admin or sport manager fixes an
--   Official result in one step. The old result is voided with the reason (kept in the
--   audit log) and the corrected result becomes Official. Optionally swaps the corrected
--   winner/loser into the next matches if they were already advanced.
-- Safe to run more than once.

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

  v_is_manager := v_is_system or public.has_match_role(new.match_id, array['sport_manager']);
  v_is_validator := v_is_manager or public.has_match_role(new.match_id, array['venue_lead']);

  if tg_op = 'INSERT' then
    select m.status into v_match_status from public.matches m where m.id = new.match_id;
    if v_match_status in ('void', 'official', 'complete') then
      raise exception 'This match is % and cannot accept a new result', v_match_status
        using errcode = '23514';
    end if;
    -- Staff with validation authority (venue lead, sport manager, operations admin) enter
    -- results that are Official immediately. Scorers' results wait for approval.
    if new.status = 'official' and not v_is_validator then
      raise exception 'Your results need approval; submit them instead of marking them Official'
        using errcode = '42501';
    end if;
    if new.status not in ('draft', 'submitted', 'official') then
      raise exception 'New results must be submitted or Official' using errcode = '23514';
    end if;
    if not v_is_system then
      new.submitted_by := v_uid;
    end if;
    new.submitted_at := case when new.status in ('submitted', 'official') then now() end;
    if new.status = 'official' then
      new.validated_by := case when v_is_system then null else v_uid end;
      new.validated_at := now();
    else
      new.validated_by := null;
      new.validated_at := null;
    end if;
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
       or new.submitted_by is distinct from old.submitted_by
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Only a sport manager or operations admin can change submitted values'
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
    raise exception 'An Official result cannot be edited directly; use Edit result' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.apply_match_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_event uuid;
  v_old_status text := case when tg_op = 'INSERT' then null else old.status end;
begin
  select m.event_id into v_event from public.matches m where m.id = new.match_id;

  if new.status is not distinct from v_old_status or new.status = 'draft' then
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
    if v_old_status = 'official' then
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

-- Allow Official inserts for staff with validation authority (the trigger also checks).
drop policy if exists results_insert on public.match_results;
create policy results_insert on public.match_results
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and (
      (status in ('draft', 'submitted')
       and public.has_match_role(match_id, array['scorer', 'venue_lead', 'sport_manager']))
      or (status = 'official'
          and public.has_match_role(match_id, array['venue_lead', 'sport_manager']))
    )
  );

-- Fix an Official result. SECURITY INVOKER: the caller's RLS and the result triggers apply.
create or replace function public.correct_match_result(
  p_result_id uuid,
  p_result_method text,
  p_winner uuid,
  p_loser uuid,
  p_values jsonb,
  p_reason text,
  p_update_advancement boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.match_results;
  v_new uuid;
  v_blocking text;
begin
  select * into r from public.match_results where id = p_result_id;
  if not found then
    raise exception 'Result not found' using errcode = 'P0002';
  end if;
  if r.status <> 'official' then
    raise exception 'Only an Official result can be edited this way' using errcode = '23514';
  end if;
  if not public.has_match_role(r.match_id, array['sport_manager']) then
    raise exception 'Only an operations admin or the event''s sport manager can edit results'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to edit a result' using errcode = '23514';
  end if;

  -- Winner/loser changed and already advanced? Check the next matches can still be updated.
  if p_update_advancement then
    select string_agg(distinct m2.match_code, ', ') into v_blocking
    from public.match_participants mp
    join public.matches m2 on m2.id = mp.match_id
    where mp.source_match_id = r.match_id
      and ((mp.source_type = 'winner_of_match' and mp.participant_id = r.winner_participant_id
            and r.winner_participant_id is distinct from p_winner)
        or (mp.source_type = 'loser_of_match' and mp.participant_id = r.loser_participant_id
            and r.loser_participant_id is distinct from p_loser))
      and m2.status in ('submitted', 'official', 'complete');
    if v_blocking is not null then
      raise exception 'The next match (%) already has a result. Edit that result first, or untick "update next matches" and move teams by hand.', v_blocking
        using errcode = '23514';
    end if;
  end if;

  perform set_config('app.audit_reason', 'Edited: ' || trim(p_reason), true);

  update public.match_results
  set status = 'void', status_reason = 'Edited: ' || trim(p_reason)
  where id = r.id;

  insert into public.match_results (match_id, result_method, status, winner_participant_id,
                                    loser_participant_id, participant_values, submitted_by, notes)
  values (r.match_id, p_result_method, 'official', p_winner, p_loser,
          coalesce(p_values, '[]'::jsonb), auth.uid(), r.notes)
  returning id into v_new;

  if p_update_advancement then
    if r.winner_participant_id is distinct from p_winner and p_winner is not null then
      update public.match_participants set participant_id = p_winner
      where source_match_id = r.match_id and source_type = 'winner_of_match'
        and participant_id = r.winner_participant_id;
      update public.match_participants set advanced = (participant_id = p_winner)
      where match_id = r.match_id and (advanced or participant_id = p_winner)
        and exists (select 1 from public.match_participants d
                    where d.source_match_id = r.match_id and d.source_type = 'winner_of_match');
    end if;
    if r.loser_participant_id is distinct from p_loser and p_loser is not null then
      update public.match_participants set participant_id = p_loser
      where source_match_id = r.match_id and source_type = 'loser_of_match'
        and participant_id = r.loser_participant_id;
    end if;
  end if;

  return v_new;
end;
$$;

revoke execute on function public.correct_match_result(uuid, text, uuid, uuid, jsonb, text, boolean) from anon;
grant execute on function public.correct_match_result(uuid, text, uuid, uuid, jsonb, text, boolean) to authenticated;
