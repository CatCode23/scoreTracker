import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  db,
  useEvents,
  useOpsMutation,
  useParticipants,
  useTeams,
  useUnits,
} from '../../lib/api/ops';
import { canManageEvent, isOpsAdmin } from '../../lib/domain/permissions';
import { teamSchema, type TeamInput } from '../../lib/domain/validation';
import type { CheckInStatus, EventParticipant, EventRow, Team } from '../../lib/types';
import { participantCountWarning } from '../../lib/domain/validation';
import { humanize } from '../../lib/domain/format';
import { friendlyError, supabase } from '../../lib/supabase';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
} from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { useConfirm } from '../../components/ConfirmDialog';

/**
 * Save a team and make its event registrations match `event_ids`.
 * Registrations are only added/removed for events the user may manage (RLS enforces it too).
 */
export async function saveTeam(
  values: TeamInput,
  team: Team | undefined,
  current: EventParticipant[],
): Promise<void> {
  const row = {
    team_name: values.team_name.trim(),
    unit: values.unit,
    player_count: values.player_count,
    active: values.active,
  };
  let teamId = team?.id;
  if (team) {
    await db.update('teams', team.id, row);
  } else {
    const { data, error } = await supabase.from('teams').insert(row).select('id').single();
    if (error) throw error;
    teamId = (data as { id: string }).id;
  }
  const have = new Set(current.map((p) => p.event_id));
  const want = new Set(values.event_ids);
  const toAdd = values.event_ids.filter((id) => !have.has(id));
  const toRemove = current.filter((p) => !want.has(p.event_id));
  if (toAdd.length) {
    await db.insert(
      'event_participants',
      toAdd.map((event_id) => ({ event_id, team_id: teamId })),
    );
  }
  for (const p of toRemove) await db.remove('event_participants', p.id);
}

function TeamForm({
  team,
  registrations,
  events,
  units,
  canUseEvent,
  onDone,
}: {
  team?: Team;
  registrations: EventParticipant[];
  events: EventRow[];
  units: string[];
  canUseEvent: (eventId: string) => boolean;
  onDone: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState, setValue, control } = useForm<TeamInput>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      team_name: team?.team_name ?? '',
      unit: team?.unit ?? '',
      player_count: team?.player_count ?? null,
      event_ids: registrations.map((r) => r.event_id),
      active: team?.active ?? true,
    },
  });
  const eventIds = useWatch({ control, name: 'event_ids' });
  const active = useWatch({ control, name: 'active' });
  const save = useOpsMutation((v: TeamInput) => saveTeam(v, team, registrations));
  const e = formState.errors;

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={handleSubmit(async (v) => {
        setErr(null);
        try {
          await save.mutateAsync(v);
          onDone();
        } catch (x) {
          setErr(friendlyError(x));
        }
      })}
    >
      <Field label="Team name" htmlFor="team_name" error={e.team_name?.message}>
        <Input id="team_name" {...register('team_name')} placeholder="e.g. 1-2 SBCT Soccer" />
      </Field>
      <Field label="Unit" htmlFor="unit" error={e.unit?.message} hint="Points go to this unit">
        <Select id="unit" {...register('unit')}>
          <option value="">Choose a unit…</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Player count (optional)" htmlFor="player_count" error={e.player_count?.message}>
        <Input
          id="player_count"
          inputMode="numeric"
          {...register('player_count', {
            setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
          })}
        />
      </Field>
      <div className="flex items-end">
        <Checkbox
          id="team-active"
          label="Active"
          checked={active}
          onChange={(v) => setValue('active', v)}
        />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900">
          Events this team plays in
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((ev) => {
            const checked = eventIds.includes(ev.id);
            const allowed = canUseEvent(ev.id);
            return (
              <label
                key={ev.id}
                className={`flex min-h-touch items-center gap-3 rounded-lg border border-slate-400 bg-white p-3 ${allowed ? 'cursor-pointer' : 'opacity-60'}`}
              >
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-brand"
                  checked={checked}
                  disabled={!allowed}
                  onChange={(x) =>
                    setValue(
                      'event_ids',
                      x.target.checked
                        ? [...eventIds, ev.id]
                        : eventIds.filter((id) => id !== ev.id),
                      { shouldValidate: formState.isSubmitted },
                    )
                  }
                />
                <span className="font-semibold">{ev.event_name}</span>
              </label>
            );
          })}
        </div>
        {e.event_ids && (
          <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
            {e.event_ids.message}
          </p>
        )}
        {team && (
          <p className="mt-1 text-sm text-slate-600">
            Unticking an event removes the team from it. That is refused if the team is already in
            matches.
          </p>
        )}
      </fieldset>
      {err && (
        <Notice tone="error" className="sm:col-span-2">
          {err}
        </Notice>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {team ? 'Save team' : 'Create team'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const CHECK_IN: CheckInStatus[] = ['registered', 'checked_in', 'no_show', 'withdrawn'];

/** One event's teams: seeds, check-in, points eligibility, remove from event. */
export function EventRoster({
  event,
  regs,
  teamsById,
  canEdit,
  onEditTeam,
}: {
  event: EventRow;
  regs: EventParticipant[];
  teamsById: Map<string, Team>;
  canEdit: boolean;
  onEditTeam: (t: Team) => void;
}) {
  const confirm = useConfirm();
  const update = useOpsMutation(
    ({ id, values }: { id: string; values: Partial<EventParticipant> }) =>
      db.update('event_participants', id, values),
  );
  const remove = useOpsMutation((id: string) => db.remove('event_participants', id));
  const active = regs.filter((r) => r.active && r.check_in_status !== 'withdrawn').length;
  const warning = participantCountWarning(active, event.target_team_count);
  const sorted = [...regs].sort(
    (a, b) =>
      (a.seed ?? 999) - (b.seed ?? 999) ||
      (teamsById.get(a.team_id)?.team_name ?? '').localeCompare(
        teamsById.get(b.team_id)?.team_name ?? '',
      ),
  );

  return (
    <Card
      title={`${event.event_name}: ${active} team${active === 1 ? '' : 's'}${event.target_team_count != null ? ` (target ${event.target_team_count})` : ''}`}
    >
      {warning && (
        <Notice tone="warn" className="mb-3">
          {warning}
        </Notice>
      )}
      {sorted.length === 0 ? (
        <Empty title="No teams in this event yet">
          Add one with New team, or tick this event on an existing team.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const t = teamsById.get(r.team_id);
            return (
              <li
                key={r.id}
                className="grid gap-2 rounded-lg border border-slate-300 bg-white p-3 sm:grid-cols-[1fr_90px_170px_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block font-bold">
                    {t?.team_name ?? 'Team'}{' '}
                    {t && !t.active && <span className="text-sm text-red-700">(inactive)</span>}
                  </span>
                  <span className="text-sm text-slate-700">
                    {t?.unit}
                    {t?.player_count != null && ` · ${t.player_count} players`}
                    {!r.eligible_for_points && ' · not counting for points'}
                  </span>
                </span>
                {canEdit ? (
                  <>
                    <Input
                      aria-label={`Seed for ${t?.team_name}`}
                      placeholder="Seed"
                      inputMode="numeric"
                      defaultValue={r.seed ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === '' ? null : Number(v);
                        if (n !== r.seed && (n === null || (Number.isInteger(n) && n >= 1))) {
                          update.mutate({ id: r.id, values: { seed: n } });
                        }
                      }}
                    />
                    <Select
                      aria-label={`Check-in status for ${t?.team_name}`}
                      value={r.check_in_status}
                      onChange={(e) =>
                        update.mutate({
                          id: r.id,
                          values: { check_in_status: e.target.value as CheckInStatus },
                        })
                      }
                    >
                      {CHECK_IN.map((c) => (
                        <option key={c} value={c}>
                          {humanize(c)}
                        </option>
                      ))}
                    </Select>
                    <span className="flex flex-wrap gap-1">
                      {t && (
                        <Button
                          variant="ghost"
                          aria-label={`Edit ${t.team_name}`}
                          onClick={() => onEditTeam(t)}
                        >
                          <Pencil className="h-5 w-5" aria-hidden />
                        </Button>
                      )}
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
                              title: `Remove ${t?.team_name} from ${event.event_name}?`,
                              body: 'The team itself is kept. This is refused if the team is already in matches; mark it Withdrawn instead.',
                              danger: true,
                              confirmLabel: 'Remove from event',
                            },
                            () => remove.mutateAsync(r.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  </>
                ) : (
                  <span className="text-sm sm:col-span-3">
                    {r.seed != null ? `Seed ${r.seed} · ` : ''}
                    {humanize(r.check_in_status)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {update.error && (
        <Notice tone="error" className="mt-2">
          {friendlyError(update.error)}
        </Notice>
      )}
      {canEdit && (
        <p className="mt-3 text-sm text-slate-700">
          Marking a team &quot;No show&quot; does not apply a penalty. Penalties are applied only on
          the Placements page.
        </p>
      )}
      {confirm.dialog}
    </Card>
  );
}

export function Teams() {
  const auth = useAuth();
  const teams = useTeams();
  const units = useUnits();
  const events = useEvents();
  const participants = useParticipants();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [q, setQ] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const remove = useOpsMutation((id: string) => db.remove('teams', id));
  const admin = isOpsAdmin(auth);

  const regsByTeam = useMemo(() => {
    const m = new Map<string, EventParticipant[]>();
    for (const p of participants.data ?? []) m.set(p.team_id, [...(m.get(p.team_id) ?? []), p]);
    return m;
  }, [participants.data]);
  const eventName = (id: string) => events.data?.find((e) => e.id === id)?.event_name ?? 'Event';

  if (teams.isLoading || units.isLoading || events.isLoading) return <Loading />;
  if (teams.error ?? units.error ?? events.error) {
    return <ErrorState error={teams.error ?? units.error ?? events.error} />;
  }

  const unitNames = (units.data ?? []).filter((u) => u.active).map((u) => u.name);
  const list = (teams.data ?? []).filter(
    (t) =>
      `${t.team_name} ${t.unit}`.toLowerCase().includes(q.toLowerCase()) &&
      (!unitFilter || t.unit === unitFilter) &&
      (!eventFilter || (regsByTeam.get(t.id) ?? []).some((r) => r.event_id === eventFilter)),
  );
  const selectedEvent = (events.data ?? []).find((e) => e.id === eventFilter);
  const teamsById = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const byUnit = new Map<string, Team[]>();
  for (const t of list) byUnit.set(t.unit, [...(byUnit.get(t.unit) ?? []), t]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teams"
        subtitle="Each team belongs to a unit and plays in one or more events. Placements earn points for the unit. Pick an event to set seeds and check-in."
        actions={
          <Button onClick={() => setEditing('new')} disabled={unitNames.length === 0}>
            <Plus className="h-5 w-5" aria-hidden /> New team
          </Button>
        }
      />
      {unitNames.length === 0 && (
        <Notice tone="warn" title="No units yet">
          {admin ? (
            <>
              Add the competing units first under{' '}
              <Link className="underline" to="/ops/settings">
                Settings → Units
              </Link>
              .
            </>
          ) : (
            'Ask an operations admin to add the competing units first.'
          )}
        </Notice>
      )}
      {editing && (
        <Card title={editing === 'new' ? 'New team' : `Edit ${editing.team_name}`}>
          <TeamForm
            key={editing === 'new' ? 'new' : editing.id}
            team={editing === 'new' ? undefined : editing}
            registrations={editing === 'new' ? [] : (regsByTeam.get(editing.id) ?? [])}
            events={events.data ?? []}
            units={
              editing !== 'new' && !unitNames.includes(editing.unit)
                ? [...unitNames, editing.unit]
                : unitNames
            }
            canUseEvent={(id) => canManageEvent(auth, id)}
            onDone={() => setEditing(null)}
          />
        </Card>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          aria-label="Search teams"
          placeholder="Search teams or units"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Filter by unit"
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
        >
          <option value="">All units</option>
          {(units.data ?? []).map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by event"
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
        >
          <option value="">All events</option>
          {(events.data ?? []).map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.event_name}
            </option>
          ))}
        </Select>
      </div>
      {remove.error && <Notice tone="error">{friendlyError(remove.error)}</Notice>}
      {!eventFilter && (
        <p className="text-sm text-slate-700">
          Choose an event above to set seeds and check-in for that event.
        </p>
      )}
      {eventFilter && selectedEvent ? (
        <EventRoster
          event={selectedEvent}
          regs={(participants.data ?? []).filter(
            (p) => p.event_id === eventFilter && list.some((t) => t.id === p.team_id),
          )}
          teamsById={teamsById}
          canEdit={canManageEvent(auth, eventFilter)}
          onEditTeam={(t) => {
            setEditing(t);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : list.length === 0 ? (
        <Empty title="No teams match" />
      ) : (
        [...byUnit.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([unit, unitTeams]) => (
            <section key={unit} aria-label={unit}>
              <h2 className="mb-2 text-lg font-bold">
                {unit}{' '}
                <span className="text-sm font-normal text-slate-600">
                  · {unitTeams.length} team{unitTeams.length === 1 ? '' : 's'}
                </span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unitTeams.map((t) => {
                  const regs = regsByTeam.get(t.id) ?? [];
                  return (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-300 bg-white p-3"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold">
                          {t.team_name}{' '}
                          {!t.active && <span className="text-sm text-red-700">(inactive)</span>}
                        </span>
                        {t.player_count != null && (
                          <span className="block text-sm text-slate-700">
                            {t.player_count} players
                          </span>
                        )}
                        <span className="mt-1 flex flex-wrap gap-1">
                          {regs.length === 0 ? (
                            <span className="text-sm text-amber-800">Not in any event</span>
                          ) : (
                            regs.map((r) => (
                              <Badge
                                key={r.id}
                                className="bg-slate-200 normal-case tracking-normal text-slate-900"
                              >
                                {eventName(r.event_id)}
                              </Badge>
                            ))
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0">
                        <Button
                          variant="ghost"
                          aria-label={`Edit ${t.team_name}`}
                          onClick={() => setEditing(t)}
                        >
                          <Pencil className="h-5 w-5" aria-hidden />
                        </Button>
                        {admin && (
                          <Button
                            variant="ghost"
                            className="text-red-700"
                            aria-label={`Delete ${t.team_name}`}
                            onClick={() =>
                              confirm.ask(
                                {
                                  title: `Delete ${t.team_name}?`,
                                  body: 'This also removes the team from its events. It is refused if the team is already in matches; mark it inactive instead.',
                                  danger: true,
                                  confirmLabel: 'Delete team',
                                },
                                () => remove.mutateAsync(t.id),
                              )
                            }
                          >
                            <Trash2 className="h-5 w-5" aria-hidden />
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
      {confirm.dialog}
    </div>
  );
}
