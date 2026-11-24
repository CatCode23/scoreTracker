import { ArrowRight, Crown } from 'lucide-react';
import { groupBracket } from '../lib/domain/bracket';
import { formatDate, formatSeconds, formatTime, humanize } from '../lib/domain/format';
import type { PublicMatch, PublicMatchParticipant } from '../lib/types';
import { PublicStatusBadge } from './status';
import { cx } from './ui';
import { Empty } from './states';

function valueFor(p: PublicMatchParticipant, m: PublicMatch): string {
  if (!m.is_official) return '';
  if (p.time_seconds != null) {
    const pen = p.penalty_seconds ? ` (+${formatSeconds(p.penalty_seconds)})` : '';
    return `${formatSeconds(p.time_seconds)}${pen}`;
  }
  if (p.score != null) return String(p.score);
  if (p.technical_score != null) return String(p.technical_score);
  if (p.placement != null) return `#${p.placement}`;
  return '';
}

export function MatchCard({
  match,
  participants,
}: {
  match: PublicMatch;
  participants: PublicMatchParticipant[];
}) {
  const ps = [...participants].sort((a, b) =>
    match.is_official && a.placement != null && b.placement != null
      ? a.placement - b.placement
      : a.slot.localeCompare(b.slot, undefined, { numeric: true }),
  );
  return (
    <article
      className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm"
      aria-label={`Match ${match.match_code}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-600">
            {match.match_code}
            {match.match_number != null && ` · Match ${match.match_number}`}
          </p>
          <p className="text-xs text-slate-600">
            {[formatDate(match.match_date), formatTime(match.start_time), match.venue_area]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <PublicStatusBadge status={match.public_status} />
      </div>
      {ps.length === 0 ? (
        <p className="text-sm italic text-slate-600">Teams to be determined</p>
      ) : (
        <ul className="space-y-1">
          {ps.map((p) => (
            <li
              key={p.id}
              className={cx(
                'flex min-h-[36px] items-center justify-between gap-2 rounded px-2',
                p.is_winner ? 'bg-green-100 font-bold text-green-950' : 'bg-slate-50',
              )}
            >
              <span className="flex min-w-0 items-center gap-1">
                {p.is_winner && (
                  <Crown className="h-4 w-4 shrink-0 text-green-800" aria-label="Winner" />
                )}
                <span className="truncate">
                  {p.team_name ?? (
                    <span className="italic text-slate-600">
                      {p.source_match_code
                        ? `${humanize(p.source_type)} ${p.source_match_code}`
                        : 'TBD'}
                    </span>
                  )}
                </span>
                {p.unit && (
                  <span className="hidden shrink-0 text-xs font-normal text-slate-600 sm:inline">
                    ({p.unit})
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{valueFor(p, match)}</span>
            </li>
          ))}
        </ul>
      )}
      {(match.next_winner_match_code || match.next_loser_match_code) && (
        <div className="mt-2 space-y-0.5 text-xs text-slate-700">
          {match.next_winner_match_code && (
            <p className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" aria-hidden /> Winner to{' '}
              {match.next_winner_match_code}
              {match.next_winner_slot && ` (${match.next_winner_slot})`}
            </p>
          )}
          {match.next_loser_match_code && (
            <p className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" aria-hidden /> Loser to {match.next_loser_match_code}
              {match.next_loser_slot && ` (${match.next_loser_slot})`}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** Stage -> Round -> Match card board. Stacks on phones, columns on wider screens. */
export function BracketBoard({
  matches,
  participants,
}: {
  matches: PublicMatch[];
  participants: PublicMatchParticipant[];
}) {
  if (matches.length === 0)
    return <Empty title="No bracket published yet">Check back once matches are scheduled.</Empty>;
  const byMatch = new Map<string, PublicMatchParticipant[]>();
  for (const p of participants) byMatch.set(p.match_id, [...(byMatch.get(p.match_id) ?? []), p]);
  const stages = groupBracket(matches);
  return (
    <div className="space-y-6">
      {stages.map((st) => (
        <section key={st.stage_id} aria-labelledby={`stage-${st.stage_id}`}>
          <h3 id={`stage-${st.stage_id}`} className="mb-2 text-lg font-bold">
            {st.stage_name}{' '}
            <span className="text-sm font-normal text-slate-600">· {humanize(st.stage_type)}</span>
          </h3>
          <div className="grid gap-4 md:auto-cols-[minmax(260px,1fr)] md:grid-flow-col md:overflow-x-auto md:pb-2">
            {st.rounds.map((r) => (
              <div key={r.key} className="space-y-2">
                <h4 className="sticky top-14 z-10 rounded bg-slate-200 px-2 py-1 text-sm font-bold uppercase tracking-wide text-slate-800 md:static">
                  {r.round_name}
                </h4>
                {r.matches.map((m) => (
                  <MatchCard key={m.id} match={m} participants={byMatch.get(m.id) ?? []} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
