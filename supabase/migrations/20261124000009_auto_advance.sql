-- WOTB Tournament Tracker: automatic advancement when a result becomes Official
--
-- When a result becomes Official, its winner (and loser, if the match routes losers to a
-- 3rd-place / consolation game) is placed into the next match set up in Match Setup
-- ("Winner goes to" / "Loser goes to" + slot).
--
-- Safety rules - a move is SKIPPED (never forced) when:
--   * the match has auto-advance turned off (matches.auto_advance = false);
--   * no next match or no slot is set;
--   * the destination slot already holds a different team (never overwrites);
--   * the team is already in another slot of the destination match;
--   * the destination match already has a result.
-- Skipped moves can still be made by hand in Match Management (Advance winner / Route loser).
-- Safe to run more than once.

alter table public.matches add column if not exists auto_advance boolean not null default true;

-- Place one team into a destination slot if it is safe to do so. Returns what happened:
-- 'placed', 'already_there', or 'skipped: <reason>'.
-- SAFE BECAUSE: only called from apply_match_result() after an Official result has been
-- authorized by RLS and the result triggers; it only fills empty slots along the routing
-- the event's managers configured. Not executable by clients.
create or replace function public.auto_place(
  p_from uuid, p_participant uuid, p_to uuid, p_slot text, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.match_participants;
  v_has_slot boolean;
  v_dest_status text;
begin
  if p_participant is null or p_to is null or coalesce(trim(p_slot), '') = '' then
    return 'skipped: no destination';
  end if;
  select status into v_dest_status from public.matches where id = p_to;
  if v_dest_status in ('submitted', 'official', 'complete', 'void') then
    return 'skipped: next match already has a result';
  end if;
  select * into v_slot from public.match_participants where match_id = p_to and slot = p_slot;
  v_has_slot := found; -- save now: later PERFORM statements reset FOUND
  if v_has_slot and v_slot.participant_id = p_participant then
    return 'already_there';
  end if;
  if v_has_slot and v_slot.participant_id is not null then
    return 'skipped: slot ' || p_slot || ' is taken';
  end if;
  if exists (select 1 from public.match_participants
             where match_id = p_to and participant_id = p_participant) then
    return 'skipped: team already in that match';
  end if;

  perform set_config('app.audit_reason', 'Auto-advanced (' || p_kind || ')', true);
  if v_has_slot then
    update public.match_participants
    set participant_id = p_participant, source_type = p_kind, source_match_id = p_from
    where id = v_slot.id;
  else
    insert into public.match_participants (match_id, participant_id, slot, source_type, source_match_id)
    values (p_to, p_participant, p_slot, p_kind, p_from);
  end if;
  if p_kind = 'winner_of_match' then
    update public.match_participants set advanced = true
    where match_id = p_from and participant_id = p_participant;
  end if;
  return 'placed';
end;
$$;
revoke execute on function public.auto_place(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- SAFE BECAUSE: same as auto_place; reads the match's own routing only.
create or replace function public.auto_advance_from(p_match uuid, p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if not found or not m.auto_advance then
    return;
  end if;
  if m.next_winner_match_id is not null then
    perform public.auto_place(p_match, p_winner, m.next_winner_match_id, m.next_winner_slot, 'winner_of_match');
  end if;
  if m.next_loser_match_id is not null then
    perform public.auto_place(p_match, p_loser, m.next_loser_match_id, m.next_loser_slot, 'loser_of_match');
  end if;
end;
$$;
revoke execute on function public.auto_advance_from(uuid, uuid, uuid) from public, anon, authenticated;

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
    perform public.auto_advance_from(new.match_id, new.winner_participant_id, new.loser_participant_id);
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
