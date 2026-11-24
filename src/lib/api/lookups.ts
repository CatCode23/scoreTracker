import { useMemo } from 'react';
import { useEvents, useMatches, useParticipants, useSessions } from './ops';
import type { EventRow, Match } from '../types';
import { matchVenue } from '../domain/permissions';

/** Common id -> label lookups for operations screens. */
export function useLookups() {
  const events = useEvents();
  const participants = useParticipants();
  const matches = useMatches();
  const sessions = useSessions();
  return useMemo(() => {
    const eventById = new Map<string, EventRow>((events.data ?? []).map((e) => [e.id, e]));
    const teamLabel = new Map<string, string>(
      (participants.data ?? []).map((p) => [p.id, `${p.teams?.team_name ?? 'Team'} (${p.teams?.unit ?? ''})`]),
    );
    const matchById = new Map<string, Match>((matches.data ?? []).map((m) => [m.id, m]));
    const sessionVenue = new Map<string, string | null>((sessions.data ?? []).map((s) => [s.id, s.venue]));
    return {
      loading: events.isLoading || participants.isLoading || matches.isLoading,
      error: events.error ?? participants.error ?? matches.error,
      events: events.data ?? [],
      participants: participants.data ?? [],
      matches: matches.data ?? [],
      eventById,
      matchById,
      team: (id: string | null | undefined) => (id ? teamLabel.get(id) ?? 'Unknown team' : 'TBD'),
      eventName: (id: string | null | undefined) => (id ? eventById.get(id)?.event_name ?? 'Unknown event' : 'All events'),
      venueOf: (m: Match) =>
        matchVenue(m, eventById.get(m.event_id), m.session_id ? sessionVenue.get(m.session_id) : null),
    };
  }, [events.data, participants.data, matches.data, sessions.data, events.isLoading, participants.isLoading, matches.isLoading, events.error, participants.error, matches.error]);
}
