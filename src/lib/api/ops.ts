import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { exec, rows } from './query';
import type {
  Assignment,
  AuditEntry,
  Correction,
  EventParticipant,
  EventPlacement,
  EventRow,
  EventSession,
  Match,
  MatchParticipant,
  MatchResult,
  PointAdjustment,
  PointsMatrixRow,
  Pool,
  PoolAssignment,
  Profile,
  ScoringSetting,
  Stage,
  Team,
} from '../types';

// Operations data. Every query goes straight to the tables; RLS decides what the
// signed-in user actually receives.

const live = { staleTime: 5_000, refetchInterval: 30_000 };

export function useEvents() {
  return useQuery({
    queryKey: ['ops', 'events'],
    queryFn: () => rows<EventRow>(supabase.from('events').select('*').order('display_order')),
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['ops', 'teams'],
    queryFn: () => rows<Team>(supabase.from('teams').select('*').order('team_name')),
  });
}

export function useParticipants(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'participants', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('event_participants').select('*, teams(*)');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<EventParticipant & { teams: Team }>(q.order('seed', { nullsFirst: false }));
    },
  });
}

export function useSessions(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'sessions', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('event_sessions').select('*');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<EventSession>(q.order('session_date').order('start_time'));
    },
  });
}

export function useStages(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'stages', eventId],
    enabled: Boolean(eventId),
    queryFn: () =>
      rows<Stage>(
        supabase.from('stages').select('*').eq('event_id', eventId!).order('stage_order'),
      ),
  });
}

export function usePools(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'pools', eventId],
    enabled: Boolean(eventId),
    queryFn: () =>
      rows<Pool & { stages: { event_id: string } }>(
        supabase
          .from('pools')
          .select('*, stages!inner(event_id)')
          .eq('stages.event_id', eventId!)
          .order('pool_name'),
      ),
  });
}

export function usePoolAssignments(poolIds: string[]) {
  return useQuery({
    queryKey: ['ops', 'pool-assignments', poolIds],
    enabled: poolIds.length > 0,
    queryFn: () =>
      rows<PoolAssignment>(supabase.from('pool_assignments').select('*').in('pool_id', poolIds)),
  });
}

export function useMatches(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'matches', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('matches').select('*');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<Match>(q.order('round_order').order('match_number', { nullsFirst: false }));
    },
    ...live,
  });
}

export function useMatchParticipants(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'match-participants', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('match_participants').select('*, matches!inner(event_id)');
      if (eventId) q = q.eq('matches.event_id', eventId);
      return rows<MatchParticipant>(q.order('slot'));
    },
    ...live,
  });
}

export function useResults(filter?: { eventId?: string; statuses?: MatchResult['status'][] }) {
  return useQuery({
    queryKey: ['ops', 'results', filter?.eventId ?? 'all', filter?.statuses ?? 'any'],
    queryFn: () => {
      let q = supabase.from('match_results').select('*, matches!inner(event_id)');
      if (filter?.eventId) q = q.eq('matches.event_id', filter.eventId);
      if (filter?.statuses) q = q.in('status', filter.statuses);
      return rows<MatchResult>(q.order('created_at', { ascending: false }).limit(500));
    },
    ...live,
  });
}

export function useCorrections(decision?: Correction['decision']) {
  return useQuery({
    queryKey: ['ops', 'corrections', decision ?? 'all'],
    queryFn: () => {
      let q = supabase.from('corrections').select('*');
      if (decision) q = q.eq('decision', decision);
      return rows<Correction>(q.order('requested_at', { ascending: false }).limit(200));
    },
    ...live,
  });
}

export function usePlacements(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'placements', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('event_placements').select('*');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<EventPlacement>(q.order('final_place'));
    },
  });
}

export function useAdjustments(eventId?: string) {
  return useQuery({
    queryKey: ['ops', 'adjustments', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('point_adjustments').select('*');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<PointAdjustment>(q.order('applied_at', { ascending: false }));
    },
  });
}

export function usePointsMatrix() {
  return useQuery({
    queryKey: ['ops', 'points-matrix'],
    queryFn: () => rows<PointsMatrixRow>(supabase.from('points_matrix').select('*').order('place')),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['ops', 'settings'],
    queryFn: () =>
      rows<ScoringSetting>(supabase.from('scoring_settings').select('*').order('setting_key')),
  });
}

export function useOperatorNames() {
  return useQuery({
    queryKey: ['ops', 'operator-names'],
    queryFn: async () => {
      const list = await rows<{ id: string; display_name: string | null }>(
        supabase.from('operator_names').select('*'),
      );
      return Object.fromEntries(
        list.map((p) => [p.id, p.display_name ?? 'Unnamed user']),
      ) as Record<string, string>;
    },
    staleTime: 60_000,
  });
}

export function useProfiles(enabled: boolean) {
  return useQuery({
    queryKey: ['ops', 'profiles'],
    enabled,
    queryFn: () =>
      rows<Profile>(
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      ),
  });
}

export function useAllAssignments(enabled: boolean) {
  return useQuery({
    queryKey: ['ops', 'assignments'],
    enabled,
    queryFn: () => rows<Assignment>(supabase.from('user_assignments').select('*')),
  });
}

export interface AuditFilter {
  eventId?: string;
  table?: string;
  action?: string;
  actor?: string;
  recordId?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(f: AuditFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['ops', 'audit', f],
    enabled,
    queryFn: () => {
      let q = supabase.from('audit_log').select('*');
      if (f.eventId) q = q.eq('event_id', f.eventId);
      if (f.table) q = q.eq('table_name', f.table);
      if (f.action) q = q.eq('action', f.action);
      if (f.actor) q = q.eq('actor_profile_id', f.actor);
      if (f.recordId) q = q.eq('record_id', f.recordId.trim());
      if (f.from) q = q.gte('created_at', new Date(f.from).toISOString());
      if (f.to) q = q.lte('created_at', new Date(f.to).toISOString());
      return rows<AuditEntry>(q.order('created_at', { ascending: false }).limit(300));
    },
  });
}

/** Generic mutation that refreshes all operations + public queries on success. */
export function useOpsMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops'] });
      void qc.invalidateQueries({ queryKey: ['public'] });
    },
  });
}

// ---- Common writes ----
export const db = {
  insert: (table: string, values: object | object[]) => exec(supabase.from(table).insert(values)),
  // RLS silently filters UPDATE/DELETE to zero rows when not permitted, so confirm a
  // row was actually affected instead of reporting false success.
  update: async (table: string, id: string, values: object) => {
    const { data, error } = await supabase.from(table).update(values).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length)
      throw new Error('Not saved: record not found or you are not authorized to change it.');
  },
  remove: async (table: string, id: string) => {
    const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length)
      throw new Error('Not deleted: record not found or you are not authorized to delete it.');
  },
  rpc: async <T = unknown>(fn: string, args: object): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data as T;
  },
};
