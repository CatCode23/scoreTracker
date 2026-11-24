import { z } from 'zod';
import type { MatchType, ParticipantValue, ResultMethod } from '../types';

const nonNegative = z
  .number({ invalid_type_error: 'Enter a number' })
  .min(0, 'Cannot be negative')
  .nullable()
  .optional();

export const teamSchema = z.object({
  team_name: z.string().trim().min(1, 'Team name is required').max(80),
  unit: z.string().trim().min(1, 'Choose the unit this team belongs to'),
  player_count: z
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole number')
    .min(0, 'Cannot be negative')
    .nullable(),
  event_ids: z.array(z.string()).min(1, 'Choose at least one event this team is playing in'),
  active: z.boolean(),
});
export type TeamInput = z.infer<typeof teamSchema>;

export const participantValueSchema = z.object({
  participant_id: z.string().uuid(),
  score: nonNegative,
  time_seconds: nonNegative,
  penalty_seconds: nonNegative,
  technical_score: nonNegative,
  placement: z.number().int('Whole number').min(1, 'Placement starts at 1').nullable().optional(),
});

export const resultSubmissionSchema = z.object({
  match_id: z.string().uuid(),
  result_method: z.enum([
    'score',
    'time',
    'placement',
    'technical_score',
    'forfeit',
    'disqualification',
  ]),
  winner_participant_id: z.string().uuid().nullable(),
  loser_participant_id: z.string().uuid().nullable(),
  participant_values: z.array(participantValueSchema),
  notes: z.string().max(500).nullable(),
});
export type ResultSubmission = z.infer<typeof resultSubmissionSchema>;

export const reasonSchema = z.string().trim().min(3, 'A reason is required');

export function isHeadToHead(t: MatchType): boolean {
  return t === 'head_to_head' || t === 'bout' || t === 'pool_game';
}

/** Default result method for a match type. */
export function defaultResultMethod(t: MatchType): ResultMethod {
  if (t === 'heat' || t === 'timed_event') return 'time';
  if (t === 'multi_station') return 'placement';
  return 'score';
}

/** Which value fields to show for a result method. */
export function fieldsForMethod(
  m: ResultMethod,
): Array<keyof Omit<ParticipantValue, 'participant_id'>> {
  switch (m) {
    case 'score':
      return ['score'];
    case 'time':
      return ['time_seconds', 'penalty_seconds', 'placement'];
    case 'placement':
      return ['placement'];
    case 'technical_score':
      return ['technical_score', 'placement'];
    case 'forfeit':
    case 'disqualification':
      return [];
  }
}

/**
 * Business-rule checks the database also enforces. Returns a list of plain-language
 * errors (empty = OK). The DB is the source of truth; this gives fast feedback.
 */
export function validateResult(
  input: ResultSubmission,
  matchType: MatchType,
  matchParticipantIds: string[],
): string[] {
  const errors: string[] = [];
  const inMatch = new Set(matchParticipantIds);
  if (input.winner_participant_id && !inMatch.has(input.winner_participant_id)) {
    errors.push('The winner must be a team assigned to this match.');
  }
  if (input.loser_participant_id && !inMatch.has(input.loser_participant_id)) {
    errors.push('The loser must be a team assigned to this match.');
  }
  if (input.winner_participant_id && input.winner_participant_id === input.loser_participant_id) {
    errors.push('Winner and loser cannot be the same team.');
  }
  for (const v of input.participant_values) {
    if (!inMatch.has(v.participant_id))
      errors.push('A result row references a team not in this match.');
    for (const k of ['score', 'time_seconds', 'penalty_seconds', 'technical_score'] as const) {
      const n = v[k];
      if (n != null && (Number.isNaN(n) || n < 0))
        errors.push('Scores, times and penalties cannot be negative.');
    }
    if (v.placement != null && (!Number.isInteger(v.placement) || v.placement < 1)) {
      errors.push('Placements must be whole numbers starting at 1.');
    }
  }
  if (isHeadToHead(matchType)) {
    if (matchParticipantIds.length < 2)
      errors.push('This match needs two teams before a result can be entered.');
    if (!input.winner_participant_id) {
      const tie =
        input.result_method === 'score' &&
        input.participant_values.length === 2 &&
        input.participant_values[0].score != null &&
        input.participant_values[0].score === input.participant_values[1].score;
      if (!tie) errors.push('Select the winner.');
    }
    if (input.result_method === 'score' && input.winner_participant_id) {
      const w = input.participant_values.find(
        (v) => v.participant_id === input.winner_participant_id,
      );
      const l = input.participant_values.find(
        (v) => v.participant_id !== input.winner_participant_id,
      );
      if (w?.score != null && l?.score != null && w.score < l.score) {
        errors.push('The selected winner has the lower score. Check the winner or the scores.');
      }
    }
  } else {
    const placements = input.participant_values.map((v) => v.placement).filter((p) => p != null);
    if (new Set(placements).size !== placements.length)
      errors.push('Two teams cannot share the same placement.');
  }
  return [...new Set(errors)];
}

/** Warning when registered team count differs from the configured target. */
export function participantCountWarning(
  count: number,
  target: number | null | undefined,
): string | null {
  if (target == null || target === count) return null;
  return `This event has ${count} registered team${count === 1 ? '' : 's'}; the target is ${target}.`;
}

export function headToHeadWarning(matchType: MatchType, participantCount: number): string | null {
  if (isHeadToHead(matchType) && participantCount < 2) {
    return 'Head-to-head match has fewer than two teams assigned.';
  }
  return null;
}

export interface ScheduledSlot {
  match_id: string;
  match_code: string;
  match_date: string | null;
  start_time: string | null;
  participant_ids: string[];
}

/**
 * Teams assigned to more than one match at the same date + start time in an event.
 * Returns human-readable warnings.
 */
export function overlappingMatchWarnings(
  matches: ScheduledSlot[],
  teamName: (participantId: string) => string = (id) => id,
): string[] {
  const byTime = new Map<string, ScheduledSlot[]>();
  for (const m of matches) {
    if (!m.match_date || !m.start_time) continue;
    const key = `${m.match_date} ${m.start_time.slice(0, 5)}`;
    byTime.set(key, [...(byTime.get(key) ?? []), m]);
  }
  const warnings: string[] = [];
  for (const [when, group] of byTime) {
    const seen = new Map<string, string>();
    for (const m of group) {
      for (const p of m.participant_ids) {
        const prev = seen.get(p);
        if (prev && prev !== m.match_code) {
          warnings.push(`${teamName(p)} is in ${prev} and ${m.match_code} at ${when}.`);
        } else seen.set(p, m.match_code);
      }
    }
  }
  return warnings;
}
