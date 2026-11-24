-- WOTB Tournament Tracker: let cascading deletes through the consistency checks
--
-- Problem: deleting matches that other rows point at (next-winner/loser links, a team's
-- "source match", a pool) makes Postgres clear those pointers on the remaining rows.
-- The consistency triggers then re-checked the whole row while its stage/match was
-- mid-delete, and refused, so deleting linked matches, a stage or an event could fail.
--
-- Fix: on UPDATE, only check the fields that actually changed to a new, non-null value.
-- Clearing a pointer (setting it to null) never needs checking. Inserts are checked
-- fully, as before. Safe to run more than once.

create or replace function public.check_match_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.participant_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.participant_id is not distinct from old.participant_id
     and new.match_id is not distinct from old.match_id then
    return new; -- only other columns changed (e.g. source_match_id cleared)
  end if;
  if not exists (
    select 1 from public.event_participants ep
    join public.matches m on m.event_id = ep.event_id
    where ep.id = new.participant_id and m.id = new.match_id
  ) then
    raise exception 'Participant is not registered in this match''s event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.check_match_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ins boolean := tg_op = 'INSERT';
begin
  if (v_ins or new.stage_id is distinct from old.stage_id or new.event_id is distinct from old.event_id)
     and not exists (select 1 from public.stages s where s.id = new.stage_id and s.event_id = new.event_id) then
    raise exception 'Stage does not belong to this event' using errcode = '23514';
  end if;
  if new.pool_id is not null
     and (v_ins or new.pool_id is distinct from old.pool_id or new.stage_id is distinct from old.stage_id)
     and not exists (select 1 from public.pools p where p.id = new.pool_id and p.stage_id = new.stage_id) then
    raise exception 'Pool does not belong to this stage' using errcode = '23514';
  end if;
  if new.session_id is not null
     and (v_ins or new.session_id is distinct from old.session_id or new.event_id is distinct from old.event_id)
     and not exists (select 1 from public.event_sessions s where s.id = new.session_id and s.event_id = new.event_id) then
    raise exception 'Session does not belong to this event' using errcode = '23514';
  end if;
  return new;
end;
$$;
