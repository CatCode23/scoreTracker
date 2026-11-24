-- WOTB Tournament Tracker: explicit table, view and function privileges
--
-- Earlier migrations relied on Supabase's default privileges (which historically granted
-- ALL on new public tables/views to anon and authenticated). Newer Supabase projects may
-- not grant those defaults, which breaks every staff page with "permission denied".
-- This migration states the privileges explicitly so the app works either way.
--
-- Rules:
--   * authenticated: SELECT/INSERT/UPDATE/DELETE on operational tables. Row Level Security
--     (enabled on every table) still decides which rows each user can touch.
--   * anon: NO privileges on any raw table.
--   * Views: SELECT only, for everyone they are meant for. Write privileges are revoked.
--     This matters because the public views run with the owner's rights: a simple,
--     auto-updatable view (e.g. public_events, operator_names) with a write grant would
--     let a client update the underlying table without RLS.
--   * audit_log and public_updates: never writable by clients.
--   * Functions: helpers used inside RLS policies and the workflow RPCs must be executable
--     by authenticated; bump_public_update stays internal.
--
-- Safe to re-run.

grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'events', 'teams', 'event_participants', 'event_sessions', 'stages', 'pools',
    'pool_assignments', 'matches', 'match_participants', 'match_results', 'corrections',
    'event_placements', 'points_matrix', 'scoring_settings', 'point_adjustments',
    'user_assignments', 'audit_log', 'public_updates']
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end;
$$;

-- Append-only / read-only tables
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.public_updates from authenticated;
grant select on public.public_updates to anon;

-- Views: read-only
do $$
declare v text;
begin
  foreach v in array array[
    'public_events', 'public_event_sessions', 'public_matches', 'public_match_participants',
    'public_match_results', 'public_pool_standings', 'public_event_placements',
    'public_overall_leaderboard', 'public_last_update']
  loop
    execute format('revoke all on public.%I from anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated', v);
  end loop;
end;
$$;
revoke all on public.operator_names from anon, authenticated;
grant select on public.operator_names to authenticated;

-- Functions: RLS helpers and workflow RPCs
grant execute on all functions in schema public to authenticated;
revoke execute on function public.bump_public_update(uuid, text) from public, anon, authenticated;
