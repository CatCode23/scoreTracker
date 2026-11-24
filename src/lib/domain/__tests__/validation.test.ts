import {
  defaultResultMethod,
  fieldsForMethod,
  headToHeadWarning,
  overlappingMatchWarnings,
  participantCountWarning,
  teamSchema,
  validateResult,
} from '../validation';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const MATCH = '44444444-4444-4444-8444-444444444444';

const base = {
  match_id: MATCH,
  result_method: 'score' as const,
  winner_participant_id: A,
  loser_participant_id: B,
  participant_values: [
    { participant_id: A, score: 2 },
    { participant_id: B, score: 1 },
  ],
  referee_confirmed: true,
  notes: null,
};

describe('validateResult', () => {
  it('accepts a valid 2-1 head-to-head result', () => {
    expect(validateResult(base, 'head_to_head', [A, B])).toEqual([]);
  });
  it('requires referee confirmation', () => {
    expect(validateResult({ ...base, referee_confirmed: false }, 'head_to_head', [A, B])).toContain(
      'Referee confirmation is required before submitting.',
    );
  });
  it('rejects a winner who is not assigned to the match', () => {
    expect(validateResult({ ...base, winner_participant_id: C }, 'head_to_head', [A, B])).toContain(
      'The winner must be a team assigned to this match.',
    );
  });
  it('rejects winner == loser', () => {
    expect(validateResult({ ...base, loser_participant_id: A }, 'head_to_head', [A, B])).toContain(
      'Winner and loser cannot be the same team.',
    );
  });
  it('rejects negative scores and times', () => {
    const errs = validateResult(
      {
        ...base,
        participant_values: [
          { participant_id: A, score: -1 },
          { participant_id: B, time_seconds: -3 },
        ],
      },
      'head_to_head',
      [A, B],
    );
    expect(errs).toContain('Scores, times and penalties cannot be negative.');
  });
  it('rejects negative or zero placements', () => {
    const errs = validateResult(
      {
        ...base,
        result_method: 'placement',
        winner_participant_id: null,
        participant_values: [{ participant_id: A, placement: 0 }],
      },
      'heat',
      [A, B],
    );
    expect(errs).toContain('Placements must be whole numbers starting at 1.');
  });
  it('flags a winner with the lower score', () => {
    const errs = validateResult(
      { ...base, winner_participant_id: B, loser_participant_id: A },
      'head_to_head',
      [A, B],
    );
    expect(errs.join(' ')).toMatch(/lower score/);
  });
  it('requires a winner for head-to-head unless scores tie', () => {
    expect(
      validateResult({ ...base, winner_participant_id: null }, 'head_to_head', [A, B]),
    ).toContain('Select the winner.');
    const tie = validateResult(
      {
        ...base,
        winner_participant_id: null,
        loser_participant_id: null,
        participant_values: [
          { participant_id: A, score: 1 },
          { participant_id: B, score: 1 },
        ],
      },
      'pool_game',
      [A, B],
    );
    expect(tie).toEqual([]);
  });
  it('requires two teams for head-to-head', () => {
    expect(
      validateResult(
        { ...base, loser_participant_id: null, participant_values: [] },
        'head_to_head',
        [A],
      ),
    ).toContain('This match needs two teams before a result can be entered.');
  });
  it('rejects duplicate placements in a heat', () => {
    const errs = validateResult(
      {
        ...base,
        result_method: 'time',
        winner_participant_id: null,
        loser_participant_id: null,
        participant_values: [
          { participant_id: A, time_seconds: 60, placement: 1 },
          { participant_id: B, time_seconds: 61, placement: 1 },
        ],
      },
      'heat',
      [A, B, C],
    );
    expect(errs).toContain('Two teams cannot share the same placement.');
  });
});

describe('form helpers', () => {
  it('picks sensible default result methods', () => {
    expect(defaultResultMethod('head_to_head')).toBe('score');
    expect(defaultResultMethod('heat')).toBe('time');
    expect(defaultResultMethod('multi_station')).toBe('placement');
  });
  it('shows the right fields per method', () => {
    expect(fieldsForMethod('score')).toEqual(['score']);
    expect(fieldsForMethod('time')).toContain('penalty_seconds');
    expect(fieldsForMethod('forfeit')).toEqual([]);
  });
});

describe('warnings', () => {
  it('warns when participant count differs from target', () => {
    expect(participantCountWarning(18, 20)).toMatch(/18 registered teams; the target is 20/);
    expect(participantCountWarning(20, 20)).toBeNull();
    expect(participantCountWarning(5, null)).toBeNull();
  });
  it('warns on head-to-head with fewer than two teams', () => {
    expect(headToHeadWarning('head_to_head', 1)).not.toBeNull();
    expect(headToHeadWarning('heat', 1)).toBeNull();
  });
  it('detects a team in overlapping matches', () => {
    const w = overlappingMatchWarnings([
      {
        match_id: '1',
        match_code: 'M1',
        match_date: '2026-12-08',
        start_time: '09:00:00',
        participant_ids: [A, B],
      },
      {
        match_id: '2',
        match_code: 'M2',
        match_date: '2026-12-08',
        start_time: '09:00',
        participant_ids: [A, C],
      },
      {
        match_id: '3',
        match_code: 'M3',
        match_date: '2026-12-08',
        start_time: '10:00',
        participant_ids: [A],
      },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('M1 and M2');
  });
});

describe('teamSchema', () => {
  const ok = {
    team_name: 'T',
    unit: '1-2 SBCT',
    player_count: 10,
    event_ids: ['e1'],
    active: true,
  };
  it('accepts a team with a unit and at least one event', () => {
    expect(teamSchema.safeParse(ok).success).toBe(true);
  });
  it('requires a name, a unit and an event; rejects negative player counts', () => {
    expect(teamSchema.safeParse({ ...ok, team_name: '' }).success).toBe(false);
    expect(teamSchema.safeParse({ ...ok, unit: '' }).success).toBe(false);
    expect(teamSchema.safeParse({ ...ok, event_ids: [] }).success).toBe(false);
    expect(teamSchema.safeParse({ ...ok, player_count: -1 }).success).toBe(false);
  });
});
