// Automatic match numbers and codes for Match Setup.

/** Rounds that normally have one match: the code is used without a number. */
const SINGLE: Record<string, string> = {
  final: 'F',
  'grand final': 'F',
  '3rd place': '3RD',
  'third place': '3RD',
  '5th place': '5TH',
  '7th place': '7TH',
};

const ABBR: [RegExp, string][] = [
  [/^opening( round)?$/, 'O'],
  [/^play-?in( round)?$/, 'O'],
  [/^round of (\d+)$/, 'R$1'],
  [/^quarter-?finals?$/, 'QF'],
  [/^semi-?finals?$/, 'SF'],
  [/^consolation semi-?finals?$/, 'CSF'],
  [/^consolation( round)?$/, 'C'],
];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Short form of a round name: "Quarterfinal" -> "QF", "Round of 16" -> "R16", "Heat 1" -> "HEAT1". */
export function roundAbbr(roundName: string | null | undefined, roundOrder: number): string {
  const n = norm(roundName);
  if (!n) return `R${roundOrder || 1}`;
  if (SINGLE[n]) return SINGLE[n];
  for (const [re, out] of ABBR) if (re.test(n)) return n.replace(re, out).toUpperCase();
  return (
    n
      .replace(/[^a-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8) || `R${roundOrder || 1}`
  );
}

/**
 * Suggested unique code, e.g. ("SOC", "Quarterfinal", 1, 3) -> "SOC-QF3",
 * ("SOC", "Final", 3, 1) -> "SOC-F", ("SOC", "Round of 16", 2, 4) -> "SOC-R16-4".
 * Adds "-2", "-3"... if the code is already taken.
 */
export function suggestMatchCode(
  eventCode: string,
  roundName: string | null | undefined,
  roundOrder: number,
  matchNumber: number | null,
  existingCodes: string[],
): string {
  const abbr = roundAbbr(roundName, roundOrder);
  const single = Boolean(SINGLE[norm(roundName)]);
  let base = `${eventCode}-${abbr}`;
  if (matchNumber != null && !(single && matchNumber === 1)) {
    base += /\d$/.test(abbr) ? `-${matchNumber}` : String(matchNumber);
  }
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  if (!taken.has(base.toUpperCase())) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`.toUpperCase())) i++;
  return `${base}-${i}`;
}

interface MatchLike {
  stage_id: string;
  round_name: string | null;
  round_order: number;
  match_number: number | null;
}

const sameRound = (m: MatchLike, stageId: string, roundName: string | null | undefined) =>
  m.stage_id === stageId && norm(m.round_name) === norm(roundName);

/** Next match number in a stage + round (1 for a new round). */
export function nextMatchNumber(
  matches: MatchLike[],
  stageId: string,
  roundName: string | null | undefined,
): number {
  const nums = matches
    .filter((m) => sameRound(m, stageId, roundName))
    .map((m) => m.match_number ?? 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/** Round order: the same round's order if it exists, else one after the stage's last round. */
export function suggestRoundOrder(
  matches: MatchLike[],
  stageId: string,
  roundName: string | null | undefined,
): number {
  const same = matches.find((m) => sameRound(m, stageId, roundName));
  if (same) return same.round_order;
  const inStage = matches.filter((m) => m.stage_id === stageId).map((m) => m.round_order);
  return inStage.length ? Math.max(...inStage) + 1 : 1;
}
