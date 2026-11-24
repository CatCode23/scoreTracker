import {
  checkDestinationSlot,
  describeAutoAdvance,
  inferWinnerFromScores,
  suggestSlot,
  winnerAndLoser,
} from '../advancement';

describe('checkDestinationSlot', () => {
  const dest = [
    { slot: 'A', participant_id: 'x' },
    { slot: 'B', participant_id: null },
  ];
  it('reports an empty slot', () => {
    expect(checkDestinationSlot(dest, 'B', 'y')).toEqual({ kind: 'empty' });
    expect(checkDestinationSlot(dest, 'Lane 3', 'y')).toEqual({ kind: 'empty' });
  });
  it('warns when the slot is occupied by another team', () => {
    expect(checkDestinationSlot(dest, 'A', 'y')).toEqual({
      kind: 'occupied',
      occupantParticipantId: 'x',
    });
  });
  it('is a no-op when the team is already in that slot', () => {
    expect(checkDestinationSlot(dest, 'A', 'x')).toEqual({ kind: 'same' });
  });
  it('blocks placing a team twice in one match', () => {
    expect(checkDestinationSlot(dest, 'B', 'x')).toEqual({
      kind: 'already_in_match',
      existingSlot: 'A',
    });
  });
});

describe('winnerAndLoser', () => {
  it('returns nothing until a result is Official', () => {
    expect(
      winnerAndLoser(
        { status: 'submitted', winner_participant_id: 'a', loser_participant_id: 'b' },
        ['a', 'b'],
      ),
    ).toEqual({
      winner: null,
      loser: null,
    });
  });
  it('returns winner and loser for an Official result', () => {
    expect(
      winnerAndLoser(
        { status: 'official', winner_participant_id: 'a', loser_participant_id: 'b' },
        ['a', 'b'],
      ),
    ).toEqual({
      winner: 'a',
      loser: 'b',
    });
  });
  it('infers the loser in a two-team match', () => {
    expect(
      winnerAndLoser(
        { status: 'official', winner_participant_id: 'b', loser_participant_id: null },
        ['a', 'b'],
      ).loser,
    ).toBe('a');
  });
});

describe('suggestSlot / inferWinnerFromScores', () => {
  it('suggests the first open slot, honoring a preferred slot', () => {
    expect(suggestSlot([])).toBe('A');
    expect(suggestSlot([{ slot: 'A', participant_id: 'x' }])).toBe('B');
    expect(
      suggestSlot([
        { slot: 'A', participant_id: 'x' },
        { slot: 'B', participant_id: 'y' },
      ]),
    ).toBe('Lane 3');
    expect(suggestSlot([], 'B')).toBe('B');
  });
  it('infers a winner from scores, not from ties', () => {
    expect(
      inferWinnerFromScores([
        { participant_id: 'a', score: 2 },
        { participant_id: 'b', score: 1 },
      ]),
    ).toEqual({ winner: 'a', loser: 'b' });
    expect(
      inferWinnerFromScores([
        { participant_id: 'a', score: 1 },
        { participant_id: 'b', score: 1 },
      ]).winner,
    ).toBeNull();
  });
});

describe('describeAutoAdvance', () => {
  const routing = {
    auto_advance: true,
    next_winner_match_id: 'F',
    next_winner_slot: 'A',
    next_loser_match_id: 'T',
    next_loser_slot: 'A',
  };
  const code = (id: string) => ({ F: 'SOC-F', T: 'SOC-3RD' })[id] ?? id;
  const team = (id: string) => ({ w: 'Raptors', l: 'Lancers' })[id] ?? id;

  it('reports where the winner and loser went', () => {
    const notes = describeAutoAdvance(
      routing,
      'w',
      'l',
      [
        { match_id: 'F', participant_id: 'w', slot: 'A' },
        { match_id: 'T', participant_id: 'l', slot: 'A' },
      ],
      code,
      team,
    );
    expect(notes).toEqual([
      { tone: 'success', text: 'Winner Raptors moved to SOC-F (slot A).' },
      { tone: 'success', text: 'Loser Lancers moved to SOC-3RD (slot A).' },
    ]);
  });

  it('warns when a move was skipped', () => {
    const notes = describeAutoAdvance(
      routing,
      'w',
      'l',
      [{ match_id: 'F', participant_id: 'x', slot: 'A' }],
      code,
      team,
    );
    expect(notes[0].tone).toBe('warn');
    expect(notes[0].text).toMatch(/not moved to SOC-F.*Advance winner/);
    expect(notes[1].text).toMatch(/Route loser/);
  });

  it('says nothing when the match has no routing or auto-advance is off', () => {
    expect(
      describeAutoAdvance(
        { ...routing, next_winner_match_id: null, next_loser_match_id: null },
        'w',
        'l',
        [],
        code,
        team,
      ),
    ).toEqual([]);
    expect(
      describeAutoAdvance({ ...routing, auto_advance: false }, 'w', 'l', [], code, team),
    ).toEqual([]);
  });
});
