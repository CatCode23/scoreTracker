import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePublicEventDetail, usePublicEvents, usePublicSessions } from '../../lib/api/public';
import { formatDate, formatTime, humanize, ordinal } from '../../lib/domain/format';
import {
  FORMAT_LABELS,
  type PublicMatch,
  type PublicMatchParticipant,
  type PublicPoolStanding,
} from '../../lib/types';
import { Card, PageHeader, Tabs } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { BracketBoard, MatchCard } from '../../components/BracketBoard';
import { SyncButton } from '../../components/SyncButton';
import { LiveIndicator } from './PublicHome';

type Tab = 'bracket' | 'schedule' | 'results' | 'pools' | 'placements';

export function SportDetail() {
  const { code } = useParams();
  const events = usePublicEvents();
  const event = events.data?.find((e) => e.event_code === code?.toUpperCase());
  const detail = usePublicEventDetail(event?.id);
  const sessions = usePublicSessions(event?.id);
  const [tab, setTab] = useState<Tab>('bracket');

  if (events.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} onRetry={() => events.refetch()} />;
  if (!event) {
    return (
      <div className="space-y-3">
        <Empty title={`No public event found for "${code}"`} />
        <Link to="/public" className="font-semibold underline">
          Back to all sports
        </Link>
      </div>
    );
  }

  const d = detail.data;
  const hasPools = (d?.standings.length ?? 0) > 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'bracket', label: 'Bracket Board' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'results', label: 'Results' },
    ...(hasPools ? [{ id: 'pools' as Tab, label: 'Pool Standings' }] : []),
    { id: 'placements', label: 'Final Placements' },
  ];

  return (
    <div className="space-y-4">
      <Link
        to="/public"
        className="inline-flex min-h-touch items-center gap-1 font-semibold text-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All sports
      </Link>
      <PageHeader
        title={event.event_name}
        subtitle={[
          FORMAT_LABELS[event.format_type],
          event.venue,
          event.responsible_unit && `Lead: ${event.responsible_unit}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<SyncButton scope="public" />}
      />
      <LiveIndicator />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {detail.isLoading ? (
        <Loading />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        d && (
          <>
            {tab === 'bracket' && (
              <BracketBoard matches={d.matches} participants={d.participants} />
            )}
            {tab === 'schedule' && (
              <ScheduleTab
                sessions={sessions.data ?? []}
                matches={d.matches}
                participants={d.participants}
              />
            )}
            {tab === 'results' && <ResultsTab matches={d.matches} participants={d.participants} />}
            {tab === 'pools' && <PoolsTab standings={d.standings} />}
            {tab === 'placements' && (
              <Card title="Final Placements">
                {d.placements.length === 0 ? (
                  <Empty title="Final placements not yet published" />
                ) : (
                  <ol className="space-y-2">
                    {d.placements.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-lg border border-slate-300 p-3"
                      >
                        <span className="w-12 text-xl font-extrabold">
                          {ordinal(p.final_place)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">{p.team_name}</span>
                          <span className="block text-sm text-slate-700">{p.unit}</span>
                        </span>
                        <span className="font-bold tabular-nums">
                          {Number(p.overall_points)} pts
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}

function ScheduleTab({
  sessions,
  matches,
  participants,
}: {
  sessions: {
    id: string;
    session_date: string | null;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    venue_area: string | null;
    session_purpose: string | null;
    status: string;
  }[];
  matches: PublicMatch[];
  participants: PublicMatchParticipant[];
}) {
  const upcoming = matches
    .filter((m) => !m.is_official && m.public_status !== 'void')
    .sort((a, b) =>
      `${a.match_date ?? '9'}${a.start_time ?? ''}`.localeCompare(
        `${b.match_date ?? '9'}${b.start_time ?? ''}`,
      ),
    );
  return (
    <div className="space-y-4">
      <Card title="Sessions">
        {sessions.length === 0 ? (
          <Empty title="No sessions scheduled" />
        ) : (
          <ul className="divide-y divide-slate-200">
            {sessions.map((s) => (
              <li key={s.id} className="py-2">
                <p className="font-bold">
                  {formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)}
                  {s.status === 'cancelled' && <span className="ml-2 text-red-700">Cancelled</span>}
                </p>
                <p className="text-sm text-slate-700">
                  {[s.venue, s.venue_area, s.session_purpose].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Upcoming Matches">
        {upcoming.length === 0 ? (
          <Empty title="No upcoming matches" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                participants={participants.filter((p) => p.match_id === m.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ResultsTab({
  matches,
  participants,
}: {
  matches: PublicMatch[];
  participants: PublicMatchParticipant[];
}) {
  const official = matches
    .filter((m) => m.is_official)
    .sort(
      (a, b) =>
        b.stage_order - a.stage_order ||
        b.round_order - a.round_order ||
        (a.match_number ?? 0) - (b.match_number ?? 0),
    );
  if (official.length === 0) return <Empty title="No official results yet" />;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {official.map((m) => (
        <div key={m.id}>
          <p className="mb-1 text-xs font-semibold uppercase text-slate-600">
            {m.stage_name} · {m.round_name ?? `Round ${m.round_order}`}
          </p>
          <MatchCard match={m} participants={participants.filter((p) => p.match_id === m.id)} />
        </div>
      ))}
    </div>
  );
}

function PoolsTab({ standings }: { standings: PublicPoolStanding[] }) {
  const pools = new Map<string, PublicPoolStanding[]>();
  for (const s of standings)
    pools.set(`${s.stage_name} · Pool ${s.pool_name}`, [
      ...(pools.get(`${s.stage_name} · Pool ${s.pool_name}`) ?? []),
      s,
    ]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[...pools.entries()].map(([name, rows]) => (
        <Card key={name} title={name}>
          <ol className="space-y-1">
            {[...rows]
              .sort((a, b) => (a.pool_rank ?? 99) - (b.pool_rank ?? 99))
              .map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-2">
                  <span className="w-6 font-bold tabular-nums">{r.pool_rank ?? '–'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {r.team_name}
                    {r.advanced && (
                      <span className="ml-2 rounded bg-green-700 px-1.5 text-xs text-white">
                        {humanize(r.advancement_type) || 'Advanced'}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-800">
                    {r.wins}-{r.losses}
                    {r.ties ? `-${r.ties}` : ''} · {Number(r.point_differential) > 0 ? '+' : ''}
                    {Number(r.point_differential)}
                  </span>
                </li>
              ))}
          </ol>
          <p className="mt-2 text-xs text-slate-600">W-L(-T) · point differential</p>
        </Card>
      ))}
    </div>
  );
}
