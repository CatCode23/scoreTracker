import { Link } from 'react-router-dom';
import { useCorrections, usePlacements, useResults } from '../../lib/api/ops';
import { useLookups } from '../../lib/api/lookups';
import { usePublicLeaderboard } from '../../lib/api/public';
import { formatDateTime, formatTime } from '../../lib/domain/format';
import type { Match, MatchResult } from '../../lib/types';
import { Card, PageHeader } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { MatchStatusBadge, ResultStatusBadge, UnofficialBadge } from '../../components/status';
import { Leaderboard } from '../../components/Leaderboard';
import { SyncButton } from '../../components/SyncButton';

function Stat({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number;
  to?: string;
  tone?: string;
}) {
  const body = (
    <div className={`rounded-xl border-2 p-3 ${tone ?? 'border-slate-300 bg-white'}`}>
      <p className="text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
  return to ? (
    <Link to={to} className="block min-h-touch">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Dashboard() {
  const L = useLookups();
  const results = useResults();
  const placements = usePlacements();
  const corrections = useCorrections('pending');
  const board = usePublicLeaderboard();

  if (L.loading || results.isLoading) return <Loading />;
  if (L.error || results.error) return <ErrorState error={L.error ?? results.error} />;

  const res = results.data ?? [];
  const latestByMatch = new Map<string, MatchResult>();
  for (const r of res) if (!latestByMatch.has(r.match_id)) latestByMatch.set(r.match_id, r);
  const awaiting = res.filter((r) => r.status === 'submitted');
  const problem = res
    .filter((r) => r.status === 'disputed' || r.status === 'returned' || r.status === 'void')
    .slice(0, 20);
  const active = L.matches.filter((m) => m.status === 'in_progress');
  const delayed = L.matches.filter((m) => m.status === 'delayed');

  const matchLine = (m: Match | undefined) =>
    m ? `${L.eventById.get(m.event_id)?.event_code ?? ''} · ${m.match_code}` : 'Unknown match';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live operational status. Items here may be unofficial."
        actions={<SyncButton />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Awaiting Validation"
          value={awaiting.length}
          to="/ops/validate"
          tone="border-amber-400 bg-amber-50"
        />
        <Stat
          label="Disputed / Returned"
          value={res.filter((r) => r.status === 'disputed' || r.status === 'returned').length}
          to="/ops/validate"
          tone="border-red-400 bg-red-50"
        />
        <Stat label="In Progress" value={active.length} to="/ops/matches" />
        <Stat
          label="Delayed"
          value={delayed.length}
          to="/ops/matches"
          tone="border-orange-400 bg-orange-50"
        />
        <Stat
          label="Pending corrections"
          value={corrections.data?.length ?? 0}
          to="/ops/validate"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              Awaiting Validation <UnofficialBadge />
            </span>
          }
        >
          {awaiting.length === 0 ? (
            <Empty title="Nothing waiting" />
          ) : (
            <ul className="space-y-2">
              {awaiting.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 p-2"
                >
                  <span>
                    <span className="block font-semibold">
                      {matchLine(L.matchById.get(r.match_id))}
                    </span>
                    <span className="text-sm text-slate-700">
                      Submitted {formatDateTime(r.submitted_at)}
                    </span>
                  </span>
                  <ResultStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Disputed / Returned / Void">
          {problem.length === 0 ? (
            <Empty title="None" />
          ) : (
            <ul className="space-y-2">
              {problem.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-300 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{matchLine(L.matchById.get(r.match_id))}</span>
                    <ResultStatusBadge status={r.status} />
                  </div>
                  {r.status_reason && (
                    <p className="text-sm text-slate-700">Reason: {r.status_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Active & Delayed Matches">
          {active.length + delayed.length === 0 ? (
            <Empty title="No active or delayed matches" />
          ) : (
            <ul className="space-y-2">
              {[...delayed, ...active].map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 p-2"
                >
                  <span>
                    <span className="block font-semibold">{matchLine(m)}</span>
                    <span className="text-sm text-slate-700">
                      {[m.round_name, formatTime(m.start_time), m.venue_area]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <MatchStatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Event Completion & Placements">
          <ul className="space-y-2">
            {L.events.map((e) => {
              const ms = L.matches.filter((m) => m.event_id === e.id && m.status !== 'void');
              const done = ms.filter(
                (m) => m.status === 'official' || m.status === 'complete',
              ).length;
              const pl = (placements.data ?? []).filter((p) => p.event_id === e.id);
              const approved = pl.filter((p) => p.approved_at).length;
              const published = pl.filter((p) => p.public_visible).length;
              const pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
              const regs = L.participants.filter((p) => p.event_id === e.id && p.active).length;
              return (
                <li key={e.id} className="rounded-lg border border-slate-300 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {e.event_name}{' '}
                      <span className="text-sm font-normal text-slate-600">({e.status})</span>
                    </span>
                    <span className="text-sm tabular-nums">
                      {done}/{ms.length} official
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200" aria-hidden>
                    <div className="h-full bg-green-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-700">
                    Teams {regs}
                    {e.target_team_count != null && ` / target ${e.target_team_count}`} · Placements{' '}
                    {pl.length} entered, {approved} approved, {published} published
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Overall Leaderboard (official, published)" className="lg:col-span-2">
          {board.isLoading ? (
            <Loading />
          ) : board.error ? (
            <ErrorState error={board.error} />
          ) : (
            <Leaderboard rows={board.data ?? []} />
          )}
          <p className="mt-3 text-sm text-slate-700">
            Pool standings are on each sport's public page and in{' '}
            <Link className="underline" to="/ops/matches">
              Match Management
            </Link>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
