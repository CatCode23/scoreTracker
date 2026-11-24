import { computeLeaderboard, DEFAULT_POINTS_MATRIX, pointsForPlace } from '../points';

describe('pointsForPlace', () => {
  it('awards 8 through 1 for places 1 through 8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => pointsForPlace(p))).toEqual([
      8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });
  it('awards 0 for places above 8, invalid and missing places', () => {
    expect(pointsForPlace(9)).toBe(0);
    expect(pointsForPlace(20)).toBe(0);
    expect(pointsForPlace(0)).toBe(0);
    expect(pointsForPlace(-1)).toBe(0);
    expect(pointsForPlace(1.5)).toBe(0);
    expect(pointsForPlace(null)).toBe(0);
  });
  it('uses a custom matrix when provided', () => {
    const matrix = DEFAULT_POINTS_MATRIX.map((m) => (m.place === 1 ? { ...m, points: 10 } : m));
    expect(pointsForPlace(1, matrix)).toBe(10);
  });
});

describe('computeLeaderboard (by unit)', () => {
  const p = (unit: string, final_place: number) => ({
    unit,
    final_place,
    overall_points: pointsForPlace(final_place),
  });

  it('totals points for each unit across its teams in different sports', () => {
    // 1-2 SBCT: soccer 1st (8) + basketball 3rd (6) = 14 ; 16th CAB: soccer 2nd (7) + basketball 1st (8) = 15
    const rows = computeLeaderboard([
      p('1-2 SBCT', 1),
      p('16th CAB', 2),
      p('1-2 SBCT', 3),
      p('16th CAB', 1),
    ]);
    expect(rows.map((r) => [r.unit, r.total_points, r.events_placed])).toEqual([
      ['16th CAB', 15, 2],
      ['1-2 SBCT', 14, 2],
    ]);
  });

  it('applies no-show penalties to the unit', () => {
    const rows = computeLeaderboard([p('5-3 FA', 3)], [{ unit: '5-3 FA', points: -6 }]);
    expect(rows[0]).toMatchObject({ placement_points: 6, adjustment_points: -6, total_points: 0 });
  });

  it('breaks ties by number of 1st, then 2nd, then 3rd places', () => {
    // A: 1st (8) + 8th (1) = 9 ; B: 2nd (7) + 7th (2) = 9 -> A wins on firsts
    const rows = computeLeaderboard([p('A', 1), p('A', 8), p('B', 2), p('B', 7)]);
    expect(rows.map((r) => [r.unit, r.rank])).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('shares rank for exact ties (1,1,3)', () => {
    const rows = computeLeaderboard([p('A', 2), p('B', 2), p('C', 4)]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('includes penalty-only units', () => {
    const rows = computeLeaderboard([], [{ unit: 'X', points: -6 }]);
    expect(rows).toEqual([expect.objectContaining({ unit: 'X', total_points: -6, rank: 1 })]);
  });
});
