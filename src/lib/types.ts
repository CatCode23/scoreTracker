// Hand-maintained row types mirroring supabase/migrations. Regenerate with
// `supabase gen types typescript` as a follow-on if the schema grows.

export type Role = 'scorer' | 'venue_lead' | 'sport_manager' | 'operations_admin' | 'read_only';
export const ROLES: Role[] = ['scorer', 'venue_lead', 'sport_manager', 'operations_admin', 'read_only'];
export const ROLE_LABELS: Record<Role, string> = {
  scorer: 'Scorer',
  venue_lead: 'Venue Lead',
  sport_manager: 'Sport Manager',
  operations_admin: 'Operations Admin',
  read_only: 'Read Only',
};

export type FormatType =
  | 'single_elimination'
  | 'pool_then_playoff'
  | 'consolation_bracket'
  | 'heat_time'
  | 'multi_station'
  | 'weight_class';
export const FORMAT_LABELS: Record<FormatType, string> = {
  single_elimination: 'Single elimination',
  pool_then_playoff: 'Pool play, then playoff',
  consolation_bracket: 'Bracket with consolation',
  heat_time: 'Timed heats',
  multi_station: 'Multi-station',
  weight_class: 'Weight classes / bouts',
};

export type MatchType = 'head_to_head' | 'bout' | 'pool_game' | 'heat' | 'timed_event' | 'multi_station';
export const MATCH_TYPES: MatchType[] = ['head_to_head', 'bout', 'pool_game', 'heat', 'timed_event', 'multi_station'];
export type MatchStatus =
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'submitted'
  | 'official'
  | 'complete'
  | 'delayed'
  | 'void';
export const MATCH_STATUSES: MatchStatus[] = [
  'planned', 'ready', 'in_progress', 'submitted', 'official', 'complete', 'delayed', 'void',
];
export type ResultMethod = 'score' | 'time' | 'placement' | 'technical_score' | 'forfeit' | 'disqualification';
export const RESULT_METHODS: ResultMethod[] = ['score', 'time', 'placement', 'technical_score', 'forfeit', 'disqualification'];
export type ResultStatus = 'draft' | 'submitted' | 'official' | 'returned' | 'disputed' | 'void';
export type StageType = 'pool' | 'elimination' | 'consolation' | 'heat' | 'placement' | 'final';
export const STAGE_TYPES: StageType[] = ['pool', 'elimination', 'consolation', 'heat', 'placement', 'final'];
export type SourceType = 'seed' | 'pool_rank' | 'winner_of_match' | 'loser_of_match' | 'wild_card' | 'manual';
export type CheckInStatus = 'registered' | 'checked_in' | 'no_show' | 'withdrawn';

export interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  created_at: string;
}
export interface Assignment {
  id: string;
  profile_id: string;
  event_id: string | null;
  venue: string | null;
  assignment_role: Role;
  active: boolean;
}
export interface EventRow {
  id: string;
  event_code: string;
  event_name: string;
  format_type: FormatType;
  venue: string | null;
  responsible_unit: string | null;
  start_date: string | null;
  end_date: string | null;
  target_team_count: number | null;
  counts_toward_overall: boolean;
  status: 'planning' | 'active' | 'complete' | 'cancelled';
  public_visible: boolean;
  display_order: number;
  notes: string | null;
}
export interface Team {
  id: string;
  team_name: string;
  unit: string;
  player_count: number | null;
  captain_name: string | null;
  active: boolean;
}
export interface EventParticipant {
  id: string;
  event_id: string;
  team_id: string;
  seed: number | null;
  check_in_status: CheckInStatus;
  eligible_for_points: boolean;
  final_place: number | null;
  event_points: number;
  active: boolean;
  notes: string | null;
  teams?: Team;
}
export interface EventSession {
  id: string;
  event_id: string;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  venue_area: string | null;
  session_purpose: string | null;
  responsible_unit: string | null;
  status: 'planned' | 'active' | 'complete' | 'cancelled';
  notes: string | null;
}
export interface Stage {
  id: string;
  event_id: string;
  stage_name: string;
  stage_order: number;
  stage_type: StageType;
  advancement_rule: string | null;
  scheduled_date: string | null;
  status: 'planned' | 'active' | 'complete';
}
export interface Pool {
  id: string;
  stage_id: string;
  pool_name: string;
  venue_area: string | null;
  notes: string | null;
}
export interface PoolAssignment {
  id: string;
  pool_id: string;
  participant_id: string;
  pool_seed: number | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  point_differential: number;
  pool_rank: number | null;
  advanced: boolean;
  advancement_type: 'automatic' | 'wild_card' | 'did_not_advance' | null;
}
export interface Match {
  id: string;
  event_id: string;
  stage_id: string;
  pool_id: string | null;
  session_id: string | null;
  match_code: string;
  round_name: string | null;
  round_order: number;
  match_number: number | null;
  match_date: string | null;
  start_time: string | null;
  venue_area: string | null;
  match_type: MatchType;
  status: MatchStatus;
  next_winner_match_id: string | null;
  next_winner_slot: string | null;
  next_loser_match_id: string | null;
  next_loser_slot: string | null;
  public_visible: boolean;
  notes: string | null;
  updated_at: string;
}
export interface MatchParticipant {
  id: string;
  match_id: string;
  participant_id: string | null;
  slot: string;
  source_type: SourceType | null;
  source_match_id: string | null;
  score: number | null;
  time_seconds: number | null;
  penalty_seconds: number;
  technical_score: number | null;
  placement: number | null;
  advanced: boolean;
  eliminated: boolean;
  notes: string | null;
}
export interface ParticipantValue {
  participant_id: string;
  score?: number | null;
  time_seconds?: number | null;
  penalty_seconds?: number | null;
  technical_score?: number | null;
  placement?: number | null;
}
export interface MatchResult {
  id: string;
  match_id: string;
  result_method: ResultMethod;
  status: ResultStatus;
  winner_participant_id: string | null;
  loser_participant_id: string | null;
  participant_values: ParticipantValue[];
  referee_confirmed: boolean;
  submitted_by: string | null;
  submitted_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  status_reason: string | null;
  notes: string | null;
  created_at: string;
}
export interface Correction {
  id: string;
  result_id: string;
  requested_by: string | null;
  requested_at: string;
  correction_type:
    | 'score_correction'
    | 'winner_correction'
    | 'placement_correction'
    | 'forfeit'
    | 'dispute'
    | 'administrative';
  requested_change: unknown;
  reason: string;
  decision: 'pending' | 'approved' | 'denied';
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
}
export interface EventPlacement {
  id: string;
  event_id: string;
  participant_id: string;
  final_place: number;
  overall_points: number;
  points_override: boolean;
  ranking_method: string | null;
  tiebreak_metric: string | null;
  tiebreak_value: number | null;
  approved_by: string | null;
  approved_at: string | null;
  public_visible: boolean;
  notes: string | null;
}
export interface PointsMatrixRow {
  place: number;
  points: number;
  description: string | null;
}
export interface ScoringSetting {
  id: string;
  setting_key: string;
  numeric_value: number | null;
  text_value: string | null;
  enabled: boolean;
}
export interface PointAdjustment {
  id: string;
  event_id: string;
  participant_id: string;
  adjustment_type: 'no_show_penalty' | 'administrative';
  points: number;
  reason: string;
  applied_by: string | null;
  applied_at: string;
  active: boolean;
}
export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  event_id: string | null;
  action: string;
  actor_profile_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

// ---- Public view rows ----
export interface PublicEvent {
  id: string;
  event_code: string;
  event_name: string;
  format_type: FormatType;
  venue: string | null;
  responsible_unit: string | null;
  start_date: string | null;
  end_date: string | null;
  status: EventRow['status'];
  counts_toward_overall: boolean;
  display_order: number;
  target_team_count: number | null;
  participant_count: number;
  updated_at: string;
}
export interface PublicSession {
  id: string;
  event_id: string;
  event_code: string;
  event_name: string;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  venue_area: string | null;
  session_purpose: string | null;
  responsible_unit: string | null;
  status: EventSession['status'];
}
export type PublicStatus = 'official' | 'void' | 'delayed' | 'in_progress' | 'scheduled';
export interface PublicMatch {
  id: string;
  event_id: string;
  event_code: string;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  stage_type: StageType;
  pool_id: string | null;
  pool_name: string | null;
  match_code: string;
  round_name: string | null;
  round_order: number;
  match_number: number | null;
  match_date: string | null;
  start_time: string | null;
  venue_area: string | null;
  match_type: MatchType;
  public_status: PublicStatus;
  is_official: boolean;
  next_winner_match_id: string | null;
  next_winner_match_code: string | null;
  next_winner_slot: string | null;
  next_loser_match_id: string | null;
  next_loser_match_code: string | null;
  next_loser_slot: string | null;
}
export interface PublicMatchParticipant {
  id: string;
  match_id: string;
  slot: string;
  participant_id: string | null;
  team_name: string | null;
  unit: string | null;
  seed: number | null;
  source_type: SourceType | null;
  source_match_code: string | null;
  score: number | null;
  time_seconds: number | null;
  penalty_seconds: number | null;
  technical_score: number | null;
  placement: number | null;
  advanced: boolean;
  eliminated: boolean;
  is_winner: boolean | null;
}
export interface PublicPoolStanding {
  id: string;
  event_id: string;
  stage_name: string;
  pool_id: string;
  pool_name: string;
  participant_id: string;
  team_name: string;
  unit: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  point_differential: number;
  pool_rank: number | null;
  advanced: boolean;
  advancement_type: string | null;
}
export interface PublicPlacement {
  id: string;
  event_id: string;
  event_code: string;
  event_name: string;
  participant_id: string;
  team_id: string;
  team_name: string;
  unit: string;
  final_place: number;
  overall_points: number;
  ranking_method: string | null;
  tiebreak_metric: string | null;
  tiebreak_value: number | null;
}
export interface LeaderboardRow {
  rank: number;
  team_id: string;
  team_name: string;
  unit: string;
  placement_points: number;
  adjustment_points: number;
  total_points: number;
  events_placed: number;
  firsts: number;
  seconds: number;
  thirds: number;
}
