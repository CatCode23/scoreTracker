import type { PointsMatrixRow } from '../types';

/** Default Commander's Cup matrix: 1st = 8 ... 8th = 1. */
export const DEFAULT_POINTS_MATRIX: PointsMatrixRow[] = [1, 2, 3, 4, 5, 6, 7, 8].map((place) => ({
  place,
  points: 9 - place,
  description: null,
}));

/** Points for a final place. Places not in the matrix (e.g. 9+) earn 0. */
export function pointsForPlace(
  place: number | null | undefined,
  matrix: PointsMatrixRow[] = DEFAULT_POINTS_MATRIX,
): number {
  if (place == null || !Number.isInteger(place) || place < 1) return 0;
  return Number(matrix.find((m) => m.place === place)?.points ?? 0);
}

export interface LeaderboardInputPlacement {
  team_id: string;
  team_name: string;
  unit: string;
  final_place: number;
  overall_points: number;
}
export interface LeaderboardInputAdjustment {
  team_id: string;
  points: number;
}
export interface ComputedLeaderboardRow {
  rank: number;
  team_id: string;
  team_name: string;
  unit: string;
  placement_points: number;
  adjustment_points: number;
  total_points: number;
  firsts: number;
  seconds: number;
  thirds: number;
}

/**
 * Overall leaderboard. Mirrors the public_overall_leaderboard view: total desc, then
 * count of 1sts, 2nds, 3rds. Ties share a rank (standard competition ranking 1,1,3).
 */
export function computeLeaderboard(
  placements: LeaderboardInputPlacement[],
  adjustments: LeaderboardInputAdjustment[] = [],
  teamNames: Record<string, { team_name: string; unit: string }> = {},
): ComputedLeaderboardRow[] {
  const rows = new Map<string, Omit<ComputedLeaderboardRow, 'rank'>>();
  const get = (id: string, name?: string, unit?: string) => {
    let r = rows.get(id);
    if (!r) {
      r = {
        team_id: id,
        team_name: name ?? teamNames[id]?.team_name ?? 'Unknown team',
        unit: unit ?? teamNames[id]?.unit ?? '',
        placement_points: 0,
        adjustment_points: 0,
        total_points: 0,
        firsts: 0,
        seconds: 0,
        thirds: 0,
      };
      rows.set(id, r);
    }
    return r;
  };
  for (const p of placements) {
    const r = get(p.team_id, p.team_name, p.unit);
    r.placement_points += Number(p.overall_points);
    if (p.final_place === 1) r.firsts++;
    if (p.final_place === 2) r.seconds++;
    if (p.final_place === 3) r.thirds++;
  }
  for (const a of adjustments) get(a.team_id).adjustment_points += Number(a.points);
  const list = [...rows.values()].map((r) => ({
    ...r,
    total_points: r.placement_points + r.adjustment_points,
  }));
  const cmp = (a: (typeof list)[number], b: (typeof list)[number]) =>
    b.total_points - a.total_points ||
    b.firsts - a.firsts ||
    b.seconds - a.seconds ||
    b.thirds - a.thirds;
  list.sort((a, b) => cmp(a, b) || a.team_name.localeCompare(b.team_name));
  let rank = 0;
  return list.map((r, i) => {
    if (i === 0 || cmp(list[i - 1], r) !== 0) rank = i + 1;
    return { rank, ...r };
  });
}
