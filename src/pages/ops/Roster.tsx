import { useState } from 'react';
import { useEvents, useParticipants } from '../../lib/api/ops';
import { humanize } from '../../lib/domain/format';
import { participantCountWarning } from '../../lib/domain/validation';
import { Card, Field, Notice, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';

export function Roster() {
  const events = useEvents();
  const [eventId, setEventId] = useState('');
  const participants = useParticipants(eventId || undefined);
  if (events.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} />;
  const event = events.data?.find((e) => e.id === eventId);
  const list = eventId ? (participants.data ?? []) : [];
  const active = list.filter((p) => p.active && p.check_in_status !== 'withdrawn');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Roster / Registration Review"
        subtitle="Restricted: visible to authenticated staff only."
      />
      <Card>
        <Field label="Event" htmlFor="roster-event">
          <Select id="roster-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Select an event…</option>
            {(events.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.event_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      {event && participantCountWarning(active.length, event.target_team_count) && (
        <Notice tone="warn">
          {participantCountWarning(active.length, event.target_team_count)}
        </Notice>
      )}
      {eventId &&
        (participants.isLoading ? (
          <Loading />
        ) : participants.error ? (
          <ErrorState error={participants.error} />
        ) : list.length === 0 ? (
          <Empty title="No teams registered (or not visible to your assignment)" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-300 bg-white p-3">
                <p className="font-bold">
                  {p.seed != null && (
                    <span className="mr-2 rounded bg-slate-700 px-1.5 text-xs text-white">
                      #{p.seed}
                    </span>
                  )}
                  {p.teams?.team_name}
                </p>
                <p className="text-sm text-slate-700">Unit: {p.teams?.unit}</p>
                <p className="text-sm text-slate-700">Players: {p.teams?.player_count ?? '—'}</p>
                <p className="text-sm text-slate-700">Captain: {p.teams?.captain_name || '—'}</p>
                <p className="text-sm font-semibold">{humanize(p.check_in_status)}</p>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
