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

describe('computeLeaderboard', () => {
  const p = (team_id: string, final_place: number) => ({
    team_id,
    team_name: team_id.toUpperCase(),
    unit: 'U',
    final_place,
    overall_points: pointsForPlace(final_place),
  });

  it('sums points across events and sorts descending', () => {
    const rows = computeLeaderboard([p('a', 1), p('b', 2), p('a', 3), p('b', 1)]);
    expect(rows.map((r) => [r.team_id, r.total_points])).toEqual([
      ['b', 15],
      ['a', 14],
    ]);
  });

  it('applies no-show penalties', () => {
    const rows = computeLeaderboard([p('a', 3)], [{ team_id: 'a', points: -6 }]);
    expect(rows[0]).toMatchObject({ placement_points: 6, adjustment_points: -6, total_points: 0 });
  });

  it('breaks ties by number of 1st, then 2nd, then 3rd places', () => {
    // a: 1st (8) + 8th (1) = 9 ; b: 2nd (7) + 7th (2) = 9 -> a wins on firsts
    const rows = computeLeaderboard([p('a', 1), p('a', 8), p('b', 2), p('b', 7)]);
    expect(rows.map((r) => [r.team_id, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('shares rank for exact ties (1,1,3)', () => {
    const rows = computeLeaderboard([p('a', 2), p('b', 2), p('c', 4)]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('includes penalty-only teams', () => {
    const rows = computeLeaderboard([], [{ team_id: 'x', points: -6 }], {
      x: { team_name: 'X', unit: 'U' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ team_name: 'X', total_points: -6, rank: 1 });
  });
});
