import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { one, rows } from './query';
import type {
  LeaderboardRow,
  PublicEvent,
  PublicMatch,
  PublicMatchParticipant,
  PublicPlacement,
  PublicPoolStanding,
  PublicSession,
} from '../types';

// Public pages read ONLY the public_* views. Polling is a fallback for Realtime.
const opts = { refetchInterval: 60_000, staleTime: 15_000 };

export function usePublicEvents() {
  return useQuery({
    queryKey: ['public', 'events'],
    queryFn: () => rows<PublicEvent>(supabase.from('public_events').select('*').order('display_order')),
    ...opts,
  });
}

export function usePublicSessions(eventId?: string) {
  return useQuery({
    queryKey: ['public', 'sessions', eventId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('public_event_sessions').select('*');
      if (eventId) q = q.eq('event_id', eventId);
      return rows<PublicSession>(q.order('session_date').order('start_time'));
    },
    ...opts,
  });
}

export function usePublicLeaderboard() {
  return useQuery({
    queryKey: ['public', 'leaderboard'],
    queryFn: () =>
      rows<LeaderboardRow>(supabase.from('public_overall_leaderboard').select('*').order('rank').order('team_name')),
    ...opts,
  });
}

export function usePublicLastUpdate() {
  return useQuery({
    queryKey: ['public', 'last-update'],
    queryFn: () =>
      one<{ last_updated_at: string | null }>(supabase.from('public_last_update').select('*').maybeSingle()),
    ...opts,
  });
}

export function usePublicEventDetail(eventId?: string) {
  return useQuery({
    queryKey: ['public', 'event-detail', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const [matches, standings, placements] = await Promise.all([
        rows<PublicMatch>(supabase.from('public_matches').select('*').eq('event_id', eventId!)),
        rows<PublicPoolStanding>(
          supabase.from('public_pool_standings').select('*').eq('event_id', eventId!).order('pool_name').order('pool_rank'),
        ),
        rows<PublicPlacement>(
          supabase.from('public_event_placements').select('*').eq('event_id', eventId!).order('final_place'),
        ),
      ]);
      const participants = await fetchParticipants(matches.map((m) => m.id));
      return { matches, participants, standings, placements };
    },
    ...opts,
  });
}

/** Fetch participants for many matches, chunked to keep URLs short. */
async function fetchParticipants(matchIds: string[]): Promise<PublicMatchParticipant[]> {
  const out: PublicMatchParticipant[] = [];
  for (let i = 0; i < matchIds.length; i += 60) {
    const chunk = matchIds.slice(i, i + 60);
    out.push(
      ...(await rows<PublicMatchParticipant>(
        supabase.from('public_match_participants').select('*').in('match_id', chunk),
      )),
    );
  }
  return out;
}

export function usePublicAllPlacements() {
  return useQuery({
    queryKey: ['public', 'placements'],
    queryFn: () => rows<PublicPlacement>(supabase.from('public_event_placements').select('*').order('final_place')),
    ...opts,
  });
}
