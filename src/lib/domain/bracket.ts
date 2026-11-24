export interface BracketMatchLike {
  id: string;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  stage_type: string;
  pool_name?: string | null;
  round_name: string | null;
  round_order: number;
  match_number: number | null;
  match_code: string;
}

export interface BracketRound<M> {
  key: string;
  round_name: string;
  round_order: number;
  matches: M[];
}
export interface BracketStage<M> {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  stage_type: string;
  rounds: BracketRound<M>[];
}

/** Group matches by Stage -> Round -> Match number (stable, mobile-friendly board). */
export function groupBracket<M extends BracketMatchLike>(matches: M[]): BracketStage<M>[] {
  const stages = new Map<string, BracketStage<M>>();
  for (const m of matches) {
    let st = stages.get(m.stage_id);
    if (!st) {
      st = {
        stage_id: m.stage_id,
        stage_name: m.stage_name,
        stage_order: m.stage_order,
        stage_type: m.stage_type,
        rounds: [],
      };
      stages.set(m.stage_id, st);
    }
    const roundName =
      m.round_name || (m.pool_name ? `Pool ${m.pool_name}` : `Round ${m.round_order}`);
    const key = `${m.round_order}|${roundName}`;
    let r = st.rounds.find((x) => x.key === key);
    if (!r) {
      r = { key, round_name: roundName, round_order: m.round_order, matches: [] };
      st.rounds.push(r);
    }
    r.matches.push(m);
  }
  const out = [...stages.values()].sort((a, b) => a.stage_order - b.stage_order);
  for (const st of out) {
    st.rounds.sort(
      (a, b) => a.round_order - b.round_order || a.round_name.localeCompare(b.round_name),
    );
    for (const r of st.rounds) {
      r.matches.sort(
        (a, b) =>
          (a.match_number ?? Number.MAX_SAFE_INTEGER) -
            (b.match_number ?? Number.MAX_SAFE_INTEGER) || a.match_code.localeCompare(b.match_code),
      );
    }
  }
  return out;
}
