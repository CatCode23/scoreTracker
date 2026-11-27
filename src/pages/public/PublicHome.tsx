import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, MapPin, Radio } from 'lucide-react';
import {
  usePublicEvents,
  usePublicLastUpdate,
  usePublicLeaderboard,
  usePublicUpNext,
} from '../../lib/api/public';
import { usePublicRealtime } from '../../lib/realtime';
import { isConfigured } from '../../lib/supabase';
import { formatDate, formatDateTime, formatTime, humanize } from '../../lib/domain/format';
import { FORMAT_LABELS } from '../../lib/types';
import { Card, cx } from '../../components/ui';
import { Empty, ErrorState, Loading, NotConfigured } from '../../components/states';
import { Leaderboard } from '../../components/Leaderboard';
import { SyncButton } from '../../components/SyncButton';

export function LiveIndicator() {
  const live = usePublicRealtime();
  const last = usePublicLastUpdate();
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700" aria-live="polite">
      <Radio
        className={cx('h-4 w-4', live === 'live' ? 'text-green-700' : 'text-slate-500')}
        aria-hidden
      />
      <span className="font-semibold">
        {live === 'live'
          ? 'Live updates on'
          : live === 'connecting'
            ? 'Connecting…'
            : 'Auto-refresh every minute'}
      </span>
      {last.data?.last_updated_at && (
        <span>· Last official update {formatDateTime(last.data.last_updated_at)}</span>
      )}
    </p>
  );
}

export function PublicHome() {
  const events = usePublicEvents();
  const board = usePublicLeaderboard();
  const upNext = usePublicUpNext();
  const eventName = (code: string) =>
    events.data?.find((e) => e.event_code === code)?.event_name ?? code;

  return (
    <div className="space-y-5">
      <section
        aria-label="WOTB Tournament"
        className="overflow-hidden rounded-2xl bg-ink text-white shadow"
      >
        <div className="flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="WOTB Tournament logo"
            width={128}
            height={128}
            className="h-28 w-28 shrink-0 drop-shadow-lg sm:h-32 sm:w-32"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold leading-tight">WOTB Tournament</h1>
            <p className="mt-1 text-steel">
              Official schedule, results, brackets and Commander&apos;s Cup standings.
            </p>
          </div>
          <SyncButton scope="public" className="border-white" />
        </div>
        <div className="flex h-2" aria-hidden>
          <div className="flex-1 bg-field" />
          <div className="flex-[2] bg-brand-bright" />
          <div className="flex-1 bg-field" />
        </div>
      </section>
      {!isConfigured && <NotConfigured />}
      <LiveIndicator />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr] [&>*]:min-w-0">
        <Card title="Commander's Cup: Unit Standings">
          <p className="mb-3 text-sm text-slate-700">
            Unit standings. Each unit's teams earn points in their sports: 1st = 8 pts through 8th =
            1 pt, from official published placements.
          </p>
          {board.isLoading ? (
            <Loading />
          ) : board.error ? (
            <ErrorState error={board.error} onRetry={() => board.refetch()} />
          ) : (
            <Leaderboard rows={board.data ?? []} />
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Sports">
            {events.isLoading ? (
              <Loading />
            ) : events.error ? (
              <ErrorState error={events.error} onRetry={() => events.refetch()} />
            ) : (events.data ?? []).length === 0 ? (
              <Empty title="No events published" />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {events.data!.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/sport/${e.event_code}`}
                      className="flex min-h-touch items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3 hover:border-brand hover:bg-white"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{e.event_name}</span>
                        <span className="block text-sm text-slate-700">
                          {FORMAT_LABELS[e.format_type]} · {e.participant_count} team
                          {e.participant_count === 1 ? '' : 's'}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-600">
                          <MapPin className="h-3 w-3" aria-hidden /> {e.venue ?? 'Venue TBD'} ·{' '}
                          {humanize(e.status)}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Up next">
            {upNext.isLoading ? (
              <Loading />
            ) : upNext.error ? (
              <ErrorState error={upNext.error} />
            ) : (upNext.data?.matches ?? []).length === 0 ? (
              <Empty title="No upcoming matches scheduled" />
            ) : (
              <ul className="divide-y divide-slate-200">
                {upNext.data!.matches.map((m) => {
                  const teams = upNext
                    .data!.participants.filter((p) => p.match_id === m.id)
                    .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }))
                    .map((p) => p.team_name ?? 'TBD');
                  return (
                    <li key={m.id} className="flex items-start gap-3 py-2">
                      <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0">
                        <Link
                          to={`/sport/${m.event_code}`}
                          className="font-bold underline-offset-2 hover:underline"
                        >
                          {eventName(m.event_code)}
                        </Link>
                        <span className="text-sm text-slate-700">
                          {' '}
                          · {m.round_name ?? m.match_code}
                        </span>
                        <span className="block text-sm text-slate-800">
                          {teams.length ? teams.join(' vs ') : 'Teams to be decided'}
                        </span>
                        <span className="block text-sm text-slate-600">
                          {[formatDate(m.match_date), formatTime(m.start_time), m.venue_area]
                            .filter(Boolean)
                            .join(' · ')}
                          {m.public_status === 'delayed' && ' · Delayed'}
                          {m.public_status === 'in_progress' && ' · In progress'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
