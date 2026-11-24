import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, MapPin, Radio } from 'lucide-react';
import {
  usePublicEvents,
  usePublicLastUpdate,
  usePublicLeaderboard,
  usePublicSessions,
} from '../../lib/api/public';
import { usePublicRealtime } from '../../lib/realtime';
import { isConfigured } from '../../lib/supabase';
import { formatDate, formatDateTime, formatTime, humanize } from '../../lib/domain/format';
import { FORMAT_LABELS } from '../../lib/types';
import { Card, PageHeader, cx } from '../../components/ui';
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
  const sessions = usePublicSessions();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (sessions.data ?? [])
    .filter(
      (s) =>
        s.status !== 'cancelled' &&
        s.status !== 'complete' &&
        (!s.session_date || s.session_date >= today),
    )
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader
        title="WOTB Tournament"
        subtitle="Official schedule, results, brackets and Commander's Cup standings."
        actions={<SyncButton scope="public" />}
      />
      {!isConfigured && <NotConfigured />}
      <LiveIndicator />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Commander's Cup Leaderboard">
          <p className="mb-3 text-sm text-slate-700">
            1st = 8 pts through 8th = 1 pt, from official published placements.
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

          <Card title="Upcoming Sessions">
            {sessions.isLoading ? (
              <Loading />
            ) : sessions.error ? (
              <ErrorState error={sessions.error} />
            ) : upcoming.length === 0 ? (
              <Empty title="No upcoming sessions scheduled" />
            ) : (
              <ul className="divide-y divide-slate-200">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 py-2">
                    <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0">
                      <Link
                        to={`/sport/${s.event_code}`}
                        className="font-bold underline-offset-2 hover:underline"
                      >
                        {s.event_name}
                      </Link>
                      <span className="block text-sm text-slate-700">
                        {formatDate(s.session_date)} · {formatTime(s.start_time)}–
                        {formatTime(s.end_time)}
                      </span>
                      <span className="block text-sm text-slate-600">
                        {[s.venue, s.venue_area, s.session_purpose].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
