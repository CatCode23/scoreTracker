-- WOTB Tournament Tracker: core schema
-- All primary keys are UUIDs. Human-readable immutable codes (event_code, match_code)
-- are kept alongside where useful for URLs and paper scorecards.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- A. profiles: authorized users, keyed to auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text unique,
  role text not null default 'read_only'
    check (role in ('scorer', 'venue_lead', 'sport_manager', 'operations_admin', 'read_only')),
  -- New sign-ins start INACTIVE; an operations_admin must activate them.
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- B. events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text unique not null check (event_code ~ '^[A-Z0-9]{2,10}$'),
  event_name text not null,
  format_type text not null check (format_type in (
    'single_elimination', 'pool_then_playoff', 'consolation_bracket',
    'heat_time', 'multi_station', 'weight_class')),
  venue text,
  responsible_unit text,
  start_date date,
  end_date date,
  target_team_count integer check (target_team_count is null or target_team_count >= 0),
  counts_toward_overall boolean not null default true,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'complete', 'cancelled')),
  public_visible boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- C. teams (one master record per team; registered into events separately)
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (length(trim(team_name)) > 0),
  unit text not null check (length(trim(unit)) > 0),
  player_count integer check (player_count >= 0),
  captain_name text, -- RESTRICTED: never exposed through public views
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_name, unit)
);

-- ---------------------------------------------------------------------------
-- D. event_participants: a team registered into an event
-- ---------------------------------------------------------------------------
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  seed integer check (seed is null or seed >= 1),
  check_in_status text not null default 'registered'
    check (check_in_status in ('registered', 'checked_in', 'no_show', 'withdrawn')),
  eligible_for_points boolean not null default true,
  final_place integer check (final_place is null or final_place between 1 and 999),
  event_points numeric not null default 0,
  tiebreak_metric text,
  tiebreak_value numeric,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, team_id)
);
create index on public.event_participants (event_id);
create index on public.event_participants (team_id);

-- ---------------------------------------------------------------------------
-- E. event_sessions
-- ---------------------------------------------------------------------------
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  session_date date,
  start_time time,
  end_time time,
  venue text,
  venue_area text,
  session_purpose text,
  responsible_unit text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'complete', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.event_sessions (event_id);

-- ---------------------------------------------------------------------------
-- F. stages
-- ---------------------------------------------------------------------------
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  stage_name text not null,
  stage_order integer not null,
  stage_type text not null
    check (stage_type in ('pool', 'elimination', 'consolation', 'heat', 'placement', 'final')),
  advancement_rule text,
  scheduled_date date,
  status text not null default 'planned' check (status in ('planned', 'active', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, stage_order)
);

-- ---------------------------------------------------------------------------
-- G. pools
-- ---------------------------------------------------------------------------
create table public.pools (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  pool_name text not null,
  venue_area text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, pool_name)
);

-- ---------------------------------------------------------------------------
-- H. pool_assignments
-- ---------------------------------------------------------------------------
create table public.pool_assignments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  pool_seed integer,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  ties integer not null default 0 check (ties >= 0),
  points_for numeric not null default 0 check (points_for >= 0),
  points_against numeric not null default 0 check (points_against >= 0),
  point_differential numeric not null default 0,
  pool_rank integer check (pool_rank is null or pool_rank >= 1),
  advanced boolean not null default false,
  advancement_type text check (advancement_type in ('automatic', 'wild_card', 'did_not_advance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, participant_id)
);

-- ---------------------------------------------------------------------------
-- I. matches: one game, bout, heat, station, or competition sequence
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  pool_id uuid references public.pools (id) on delete set null,
  session_id uuid references public.event_sessions (id) on delete set null,
  match_code text unique not null check (length(trim(match_code)) > 0),
  round_name text,
  round_order integer not null default 1,
  match_number integer,
  match_date date,
  start_time time,
  venue_area text,
  match_type text not null default 'head_to_head'
    check (match_type in ('head_to_head', 'bout', 'pool_game', 'heat', 'timed_event', 'multi_station')),
  status text not null default 'planned'
    check (status in ('planned', 'ready', 'in_progress', 'submitted', 'official', 'complete', 'delayed', 'void')),
  next_winner_match_id uuid references public.matches (id) on delete set null,
  next_winner_slot text check (next_winner_slot is null or length(trim(next_winner_slot)) > 0),
  next_loser_match_id uuid references public.matches (id) on delete set null,
  next_loser_slot text check (next_loser_slot is null or length(trim(next_loser_slot)) > 0),
  public_visible boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_winner_match_id is null or next_winner_match_id <> id),
  check (next_loser_match_id is null or next_loser_match_id <> id)
);
create index on public.matches (event_id);
create index on public.matches (stage_id);
create index on public.matches (status);

-- ---------------------------------------------------------------------------
-- J. match_participants: slots in a match (supports head-to-head and heats)
-- ---------------------------------------------------------------------------
create table public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  participant_id uuid references public.event_participants (id) on delete restrict,
  slot text not null check (length(trim(slot)) > 0),
  source_type text check (source_type in
    ('seed', 'pool_rank', 'winner_of_match', 'loser_of_match', 'wild_card', 'manual')),
  source_match_id uuid references public.matches (id) on delete set null,
  score numeric check (score is null or score >= 0),
  time_seconds numeric check (time_seconds is null or time_seconds >= 0),
  penalty_seconds numeric not null default 0 check (penalty_seconds >= 0),
  technical_score numeric check (technical_score is null or technical_score >= 0),
  placement integer check (placement is null or placement >= 1),
  advanced boolean not null default false,
  eliminated boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, slot),
  unique (match_id, participant_id)
);
create index on public.match_participants (participant_id);

-- ---------------------------------------------------------------------------
-- K. match_results: submission / approval record
-- ---------------------------------------------------------------------------
create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  result_method text not null default 'score' check (result_method in
    ('score', 'time', 'placement', 'technical_score', 'forfeit', 'disqualification')),
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'official', 'returned', 'disputed', 'void')),
  winner_participant_id uuid references public.event_participants (id),
  loser_participant_id uuid references public.event_participants (id),
  -- Per-participant values entered by the scorer. Copied into match_participants
  -- only when the result becomes Official. Shape:
  -- [{"participant_id": uuid, "score": n, "time_seconds": n, "penalty_seconds": n,
  --   "technical_score": n, "placement": n}]
  participant_values jsonb not null default '[]'::jsonb
    check (jsonb_typeof(participant_values) = 'array'),
  referee_confirmed boolean not null default false,
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  validated_by uuid references public.profiles (id),
  validated_at timestamptz,
  status_reason text, -- required reason for return / dispute / void
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (winner_participant_id is null or loser_participant_id is null
         or winner_participant_id <> loser_participant_id)
);
create index on public.match_results (match_id);
create index on public.match_results (status);
-- At most one Official result per match.
create unique index match_results_one_official on public.match_results (match_id)
  where status = 'official';
-- At most one result awaiting action per match.
create unique index match_results_one_pending on public.match_results (match_id)
  where status in ('submitted', 'disputed');

-- ---------------------------------------------------------------------------
-- L. corrections
-- ---------------------------------------------------------------------------
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.match_results (id) on delete cascade,
  requested_by uuid references public.profiles (id),
  requested_at timestamptz not null default now(),
  correction_type text not null check (correction_type in (
    'score_correction', 'winner_correction', 'placement_correction', 'forfeit', 'dispute', 'administrative')),
  requested_change jsonb,
  reason text not null check (length(trim(reason)) > 0),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'denied')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- M. event_placements
-- ---------------------------------------------------------------------------
create table public.event_placements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  final_place integer not null check (final_place between 1 and 999),
  overall_points numeric not null default 0,
  -- When true, overall_points was set manually by an admin and is not recalculated.
  points_override boolean not null default false,
  ranking_method text,
  tiebreak_metric text,
  tiebreak_value numeric,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  public_visible boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id),
  unique (event_id, final_place),
  -- A placement may not be public until it has been approved.
  check (not public_visible or approved_at is not null)
);

-- ---------------------------------------------------------------------------
-- N. points_matrix
-- ---------------------------------------------------------------------------
create table public.points_matrix (
  place integer primary key check (place >= 1),
  points numeric not null,
  description text
);

-- ---------------------------------------------------------------------------
-- O. scoring_settings
-- ---------------------------------------------------------------------------
create table public.scoring_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  numeric_value numeric,
  text_value text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Point adjustments (e.g. no-show penalties). Applied only by explicit,
-- human-confirmed admin action; never automatically.
-- ---------------------------------------------------------------------------
create table public.point_adjustments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  adjustment_type text not null default 'no_show_penalty'
    check (adjustment_type in ('no_show_penalty', 'administrative')),
  points numeric not null,
  reason text not null check (length(trim(reason)) > 0),
  applied_by uuid references public.profiles (id),
  applied_at timestamptz not null default now(),
  active boolean not null default true,
  public_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index point_adjustments_one_no_show
  on public.point_adjustments (event_id, participant_id)
  where adjustment_type = 'no_show_penalty' and active;

-- ---------------------------------------------------------------------------
-- P. user_assignments
-- ---------------------------------------------------------------------------
create table public.user_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade, -- null = all events
  venue text, -- null = all venues of the event
  assignment_role text not null check (assignment_role in
    ('scorer', 'venue_lead', 'sport_manager', 'operations_admin', 'read_only')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- unique(profile_id, event_id, venue, assignment_role), treating NULLs as equal.
create unique index user_assignments_unique
  on public.user_assignments (profile_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid),
                              coalesce(venue, ''), assignment_role);

-- ---------------------------------------------------------------------------
-- Q. audit_log (append-only; written only by triggers / definer functions)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  event_id uuid, -- denormalized for filtering
  action text not null check (action in
    ('insert', 'update', 'delete', 'submit', 'validate', 'approve', 'return', 'dispute', 'void', 'publish')),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);
create index on public.audit_log (table_name, record_id);
create index on public.audit_log (event_id);

-- ---------------------------------------------------------------------------
-- Public change feed for Realtime. Contains NO sensitive data: only which event
-- had an official/public change and when. Public clients subscribe to this and
-- refetch the public views.
-- ---------------------------------------------------------------------------
create table public.public_updates (
  id bigint generated always as identity primary key,
  event_id uuid,
  kind text not null,
  created_at timestamptz not null default now()
);
