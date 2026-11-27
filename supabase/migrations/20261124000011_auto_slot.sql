-- WOTB Tournament Tracker: automatic slot choice when advancing teams
--
-- Match Setup no longer asks for a destination slot. When a match has a "winner goes
-- to" / "loser goes to" match but no slot, the team goes into the first open slot of
-- that match: an existing empty slot, else A then B (head-to-head) or the next Lane n
-- (heats / stations). Matches that already have a slot keep using it.
-- Safe to run more than once.

-- SAFE BECAUSE: unchanged from migration 9 apart from choosing a slot when none is set;
-- only called from apply_match_result() after an authorized Official result.
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
  v_dest_type text;
  v_n int;
begin
  if p_participant is null or p_to is null then
    return 'skipped: no destination';
  end if;
  select status, match_type into v_dest_status, v_dest_type from public.matches where id = p_to;
  if v_dest_status in ('submitted', 'official', 'complete', 'void') then
    return 'skipped: next match already has a result';
  end if;
  if exists (select 1 from public.match_participants
             where match_id = p_to and participant_id = p_participant) then
    return 'already_there';
  end if;

  -- No slot configured: pick the first open one.
  if coalesce(trim(p_slot), '') = '' then
    select slot into p_slot from public.match_participants
    where match_id = p_to and participant_id is null
    order by slot limit 1;
    if p_slot is null then
      if v_dest_type in ('head_to_head', 'bout', 'pool_game') then
        select s into p_slot from unnest(array['A', 'B']) s
        where not exists (select 1 from public.match_participants
                          where match_id = p_to and slot = s)
        limit 1;
        if p_slot is null then
          return 'skipped: next match is full';
        end if;
      else
        v_n := 1;
        while exists (select 1 from public.match_participants
                      where match_id = p_to and slot = 'Lane ' || v_n) loop
          v_n := v_n + 1;
        end loop;
        p_slot := 'Lane ' || v_n;
      end if;
    end if;
  end if;

  select * into v_slot from public.match_participants where match_id = p_to and slot = p_slot;
  v_has_slot := found; -- save now: later PERFORM statements reset FOUND
  if v_has_slot and v_slot.participant_id is not null then
    return 'skipped: slot ' || p_slot || ' is taken';
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
