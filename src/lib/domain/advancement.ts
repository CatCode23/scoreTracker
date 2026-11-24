import type { MatchParticipant, MatchResult } from '../types';

export type SlotCheck =
  | { kind: 'empty' }
  | { kind: 'same' }
  | { kind: 'occupied'; occupantParticipantId: string }
  | { kind: 'already_in_match'; existingSlot: string };

/**
 * Check what advancing `participantId` into `slot` of a destination match would do.
 * The UI must warn and require explicit confirmation for 'occupied'; the database RPC
 * refuses to overwrite unless p_overwrite is true.
 */
export function checkDestinationSlot(
  destination: Pick<MatchParticipant, 'slot' | 'participant_id'>[],
  slot: string,
  participantId: string,
): SlotCheck {
  const existing = destination.find((d) => d.slot === slot);
  if (existing?.participant_id === participantId) return { kind: 'same' };
  const elsewhere = destination.find((d) => d.participant_id === participantId && d.slot !== slot);
  if (elsewhere) return { kind: 'already_in_match', existingSlot: elsewhere.slot };
  if (existing?.participant_id)
    return { kind: 'occupied', occupantParticipantId: existing.participant_id };
  return { kind: 'empty' };
}

/** Winner and loser of an Official head-to-head result, if determinable. */
export function winnerAndLoser(
  result:
    | Pick<MatchResult, 'winner_participant_id' | 'loser_participant_id' | 'status'>
    | null
    | undefined,
  participantIds: string[],
): { winner: string | null; loser: string | null } {
  if (!result || result.status !== 'official' || !result.winner_participant_id) {
    return { winner: null, loser: null };
  }
  const winner = result.winner_participant_id;
  const loser =
    result.loser_participant_id ??
    (participantIds.length === 2 ? (participantIds.find((p) => p !== winner) ?? null) : null);
  return { winner, loser };
}

/** Next empty slot name for a destination (A, B, then Lane 3...). */
export function suggestSlot(
  destination: Pick<MatchParticipant, 'slot' | 'participant_id'>[],
  preferred?: string | null,
): string {
  if (preferred) return preferred;
  for (const s of ['A', 'B']) {
    const e = destination.find((d) => d.slot === s);
    if (!e || !e.participant_id) return s;
  }
  let i = 3;
  while (destination.some((d) => d.slot === `Lane ${i}`)) i++;
  return `Lane ${i}`;
}

/** Derive winner/loser from scores for convenience in the score-entry form. */
export function inferWinnerFromScores(
  values: { participant_id: string; score?: number | null }[],
): { winner: string | null; loser: string | null } {
  if (values.length !== 2) return { winner: null, loser: null };
  const [a, b] = values;
  if (a.score == null || b.score == null || a.score === b.score)
    return { winner: null, loser: null };
  return a.score > b.score
    ? { winner: a.participant_id, loser: b.participant_id }
    : { winner: b.participant_id, loser: a.participant_id };
}
