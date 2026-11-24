import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { db, useEvents, useOpsMutation, useParticipants, useTeams } from '../../lib/api/ops';
import { canManageEvent } from '../../lib/domain/permissions';
import { participantCountWarning } from '../../lib/domain/validation';
import { humanize } from '../../lib/domain/format';
import type { CheckInStatus, EventParticipant, Team } from '../../lib/types';
import { friendlyError } from '../../lib/supabase';
import { Button, Card, Field, Input, Notice, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading, Unauthorized } from '../../components/states';
import { useConfirm } from '../../components/ConfirmDialog';

const STATUSES: CheckInStatus[] = ['registered', 'checked_in', 'no_show', 'withdrawn'];

export function EventRegistration() {
  const auth = useAuth();
  const events = useEvents();
  const teams = useTeams();
  const [eventId, setEventId] = useState('');
  const participants = useParticipants(eventId || undefined);
  const [teamId, setTeamId] = useState('');
  const [seed, setSeed] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();

  const add = useOpsMutation(() =>
    db.insert('event_participants', {
      event_id: eventId,
      team_id: teamId,
      seed: seed ? Number(seed) : null,
    }),
  );
  const update = useOpsMutation(
    ({ id, values }: { id: string; values: Partial<EventParticipant> }) =>
      db.update('event_participants', id, values),
  );
  const remove = useOpsMutation((id: string) => db.remove('event_participants', id));

  if (events.isLoading || teams.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} />;
  const manageable = (events.data ?? []).filter((e) => canManageEvent(auth, e.id));
  if (manageable.length === 0)
    return (
      <Unauthorized message="Only sport managers and operations admins can register teams into events." />
    );
  const event = manageable.find((e) => e.id === eventId);
  const regs = eventId ? (participants.data ?? []) : [];
  const registered = new Set(regs.map((r) => r.team_id));
  const available = (teams.data ?? []).filter((t: Team) => t.active && !registered.has(t.id));
  const activeCount = regs.filter((r) => r.active && r.check_in_status !== 'withdrawn').length;
  const warning = event ? participantCountWarning(activeCount, event.target_team_count) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Event Registration"
        subtitle="Add existing teams to a sport. Team records are never duplicated per sport."
      />
      <Card>
        <Field label="Event" htmlFor="reg-event">
          <Select id="reg-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Select an event…</option>
            {manageable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.event_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {event && (
        <>
          {warning && <Notice tone="warn">{warning}</Notice>}
          <Card title="Add a team">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                if (!teamId) return setErr('Select a team.');
                if (seed && (!Number.isInteger(Number(seed)) || Number(seed) < 1))
                  return setErr('Seed must be a whole number of 1 or more.');
                try {
                  await add.mutateAsync(undefined);
                  setTeamId('');
                  setSeed('');
                } catch (x) {
                  setErr(friendlyError(x));
                }
              }}
            >
              <Field label="Team" htmlFor="reg-team">
                <Select id="reg-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Select a team…</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_name} ({t.unit})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Seed" htmlFor="reg-seed">
                <Input
                  id="reg-seed"
                  inputMode="numeric"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={add.isPending}>
                Register
              </Button>
            </form>
            {available.length === 0 && (
              <p className="mt-2 text-sm text-slate-700">
                All active teams are registered. Create teams on the Teams page.
              </p>
            )}
            {err && (
              <Notice tone="error" className="mt-2">
                {err}
              </Notice>
            )}
          </Card>

          <Card
            title={`Registered teams (${activeCount}${event.target_team_count != null ? ` / target ${event.target_team_count}` : ''})`}
          >
            {participants.isLoading ? (
              <Loading />
            ) : regs.length === 0 ? (
              <Empty title="No teams registered" />
            ) : (
              <ul className="space-y-2">
                {regs.map((r) => (
                  <li
                    key={r.id}
                    className="grid gap-2 rounded-lg border border-slate-300 p-3 sm:grid-cols-[1fr_100px_170px_auto] sm:items-center"
                  >
                    <span>
                      <span className="block font-bold">{r.teams?.team_name}</span>
                      <span className="text-sm text-slate-700">
                        {r.teams?.unit}
                        {!r.eligible_for_points && ' · not eligible for points'}
                      </span>
                    </span>
                    <Input
                      aria-label={`Seed for ${r.teams?.team_name}`}
                      inputMode="numeric"
                      defaultValue={r.seed ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === '' ? null : Number(v);
                        if (n !== r.seed && (n === null || (Number.isInteger(n) && n >= 1)))
                          update.mutate({ id: r.id, values: { seed: n } });
                      }}
                    />
                    <Select
                      aria-label={`Check-in status for ${r.teams?.team_name}`}
                      value={r.check_in_status}
                      onChange={(e) =>
                        update.mutate({
                          id: r.id,
                          values: { check_in_status: e.target.value as CheckInStatus },
                        })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          update.mutate({
                            id: r.id,
                            values: { eligible_for_points: !r.eligible_for_points },
                          })
                        }
                      >
                        {r.eligible_for_points ? 'Exclude pts' : 'Include pts'}
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-700"
                        onClick={() =>
                          confirm.ask(
                            {
                              title: `Remove ${r.teams?.team_name} from ${event.event_name}?`,
                              body: 'Only possible before the team is placed in matches. Consider marking it Withdrawn instead.',
                              danger: true,
                              confirmLabel: 'Remove',
                            },
                            () => remove.mutateAsync(r.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {update.error && (
              <Notice tone="error" className="mt-2">
                {friendlyError(update.error)}
              </Notice>
            )}
            <p className="mt-3 text-sm text-slate-700">
              Marking a team “No show” does not apply a penalty. Penalties are applied only by
              explicit action on the Placements page.
            </p>
          </Card>
        </>
      )}
      {confirm.dialog}
    </div>
  );
}
