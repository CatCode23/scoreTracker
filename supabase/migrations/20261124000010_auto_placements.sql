-- WOTB Tournament Tracker: fill in event placements from placement matches
--
-- A match can be marked as deciding final places (Match Setup → "Decides places"):
--   * head-to-head (Final, 3rd place, 5th place, ...): winner gets place N, loser N+1;
--   * multi-team (heat, timed event, multi-station): each team gets N - 1 + the place
--     entered in the result (so N = 1 means the result's places are the final places).
-- When that match's result becomes Official, its placements are written to
-- event_placements (points from the matrix), NOT approved and NOT public. An operations
-- admin still reviews and taps Approve & Publish on the Placements page.
-- Editing or voiding the result replaces / removes the placements it filled in.
-- Places no match decides are entered by hand, as before. Safe to run more than once.

alter table public.matches
  add column if not exists decides_place integer check (decides_place is null or decides_place >= 1);
alter table public.event_placements
  add column if not exists source_match_id uuid references public.matches (id) on delete set null;

-- SAFE BECAUSE: only called from apply_match_result() after an Official result has been
-- authorized by RLS and the result triggers. It writes unapproved, non-public placements
-- for the result's own teams in the result's own event. Not executable by clients.
create or replace function public.auto_fill_placements(p_match uuid, p_result uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  r public.match_results;
  v_place record;
begin
  select * into m from public.matches where id = p_match;
  if not found or m.decides_place is null then
    return;
  end if;
  select * into r from public.match_results where id = p_result;

  create temp table if not exists _auto_places (participant_id uuid, final_place int) on commit drop;
  truncate _auto_places;

  if m.match_type in ('head_to_head', 'bout', 'pool_game') then
    if r.winner_participant_id is null then
      return; -- a tie decides nothing
    end if;
    insert into _auto_places values (r.winner_participant_id, m.decides_place);
    if r.loser_participant_id is not null then
      insert into _auto_places values (r.loser_participant_id, m.decides_place + 1);
    end if;
  else
    insert into _auto_places
    select (v ->> 'participant_id')::uuid, m.decides_place - 1 + (v ->> 'placement')::int
    from jsonb_array_elements(r.participant_values) v
    where (v ->> 'placement') is not null;
  end if;

  perform set_config('app.audit_reason', 'Placements filled from ' || m.match_code, true);

  -- Clear what this match filled in before, and anything holding these places or teams.
  delete from public.event_placements ep
  where ep.event_id = m.event_id
    and (ep.source_match_id = m.id
         or ep.final_place in (select final_place from _auto_places)
         or ep.participant_id in (select participant_id from _auto_places));

  for v_place in select * from _auto_places order by final_place loop
    insert into public.event_placements (event_id, participant_id, final_place, ranking_method, source_match_id)
    values (m.event_id, v_place.participant_id, v_place.final_place, 'From ' || m.match_code, m.id);
  end loop;
end;
$$;
revoke execute on function public.auto_fill_placements(uuid, uuid) from public, anon, authenticated;

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
    perform public.auto_fill_placements(new.match_id, new.id);
    perform public.bump_public_update(v_event, 'result_official');

  elsif new.status in ('returned', 'void', 'disputed') then
    if v_old_status = 'official' then
      -- Remove placements that were filled in from this result.
      delete from public.event_placements where source_match_id = new.match_id;
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
