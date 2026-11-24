import {
  checkDestinationSlot,
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
