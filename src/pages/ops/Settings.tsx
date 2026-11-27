import { useState } from 'react';
import {
  db,
  useEvents,
  useOpsMutation,
  usePointsMatrix,
  useSettings,
  useTeams,
  useUnits,
} from '../../lib/api/ops';
import { FORMAT_LABELS, type EventRow, type FormatType } from '../../lib/types';
import { friendlyError, supabase } from '../../lib/supabase';
import { humanize } from '../../lib/domain/format';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  TextArea,
} from '../../components/ui';
import { ErrorState, Loading } from '../../components/states';
import { useConfirm } from '../../components/ConfirmDialog';

export function Settings() {
  const settings = useSettings();
  const matrix = usePointsMatrix();
  const events = useEvents();
  const confirm = useConfirm();
  const updSetting = useOpsMutation(({ id, values }: { id: string; values: object }) =>
    db.update('scoring_settings', id, values),
  );
  const updMatrix = useOpsMutation(async ({ place, points }: { place: number; points: number }) => {
    const { error } = await supabase.from('points_matrix').update({ points }).eq('place', place);
    if (error) throw error;
  });
  const addPlace = useOpsMutation((v: { place: number; points: number }) =>
    db.insert('points_matrix', { ...v, description: `${v.place}th place` }),
  );

  if (settings.isLoading || matrix.isLoading || events.isLoading) return <Loading />;
  if (settings.error) return <ErrorState error={settings.error} />;
  const get = (k: string) => settings.data?.find((s) => s.setting_key === k);
  const penalty = get('no_show_penalty');
  const overall = get('overall_scoring_enabled');

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Operations admin only. All changes are audited." />
      {(updSetting.error || updMatrix.error) && (
        <Notice tone="error">{friendlyError(updSetting.error ?? updMatrix.error)}</Notice>
      )}

      <Card title="Scoring">
        {penalty && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="No-show penalty points" htmlFor="pen">
              <Input
                id="pen"
                inputMode="numeric"
                defaultValue={penalty.numeric_value ?? ''}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n !== penalty.numeric_value)
                    updSetting.mutate({ id: penalty.id, values: { numeric_value: n } });
                }}
              />
            </Field>
            <div className="flex items-end">
              <Checkbox
                id="pen-on"
                label="No-show penalty enabled"
                checked={penalty.enabled}
                onChange={(v) => updSetting.mutate({ id: penalty.id, values: { enabled: v } })}
              />
            </div>
          </div>
        )}
        {overall && (
          <div className="mt-3">
            <Checkbox
              id="overall-on"
              label="Overall (Commander's Cup) scoring enabled"
              description="When off, the public leaderboard is hidden."
              checked={overall.enabled && overall.text_value !== 'false'}
              onChange={(v) =>
                updSetting.mutate({
                  id: overall.id,
                  values: { enabled: v, text_value: v ? 'true' : 'false' },
                })
              }
            />
          </div>
        )}
      </Card>

      <Card title="Points matrix">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(matrix.data ?? []).map((m) => (
            <li key={m.place}>
              <Field
                label={`${m.place}${['st', 'nd', 'rd'][m.place - 1] ?? 'th'} place`}
                htmlFor={`pm-${m.place}`}
              >
                <Input
                  id={`pm-${m.place}`}
                  inputMode="numeric"
                  defaultValue={m.points}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n !== Number(m.points))
                      updMatrix.mutate({ place: m.place, points: n });
                  }}
                />
              </Field>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const next = Math.max(0, ...(matrix.data ?? []).map((m) => m.place)) + 1;
            addPlace.mutate({ place: next, points: 0 });
          }}
        >
          Add place
        </Button>
        <p className="mt-2 text-sm text-slate-700">
          Changing the matrix recalculates all non-overridden placement points.
        </p>
      </Card>

      <UnitsCard />

      <Card title="Events">
        <ul className="space-y-3">
          {(events.data ?? []).map((e) => (
            <EventEditor key={e.id} event={e} />
          ))}
        </ul>
        <NewEventForm
          nextOrder={Math.max(0, ...(events.data ?? []).map((e) => e.display_order)) + 1}
        />
      </Card>
      {confirm.dialog}
    </div>
  );
}

function EventEditor({ event }: { event: EventRow }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useOpsMutation((values: object) => db.update('events', event.id, values));
  const remove = useOpsMutation(() => db.remove('events', event.id));
  const confirm = useConfirm();
  return (
    <li className="rounded-lg border border-slate-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="block font-bold">
            {event.event_name}{' '}
            <span className="text-sm font-normal text-slate-600">({event.event_code})</span>
          </span>
          <span className="text-sm text-slate-700">
            {FORMAT_LABELS[event.format_type]} · {event.venue} · {humanize(event.status)} ·{' '}
            {event.public_visible ? 'Public' : 'Hidden'}
          </span>
        </span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="ghost"
            className="text-red-700"
            onClick={() =>
              confirm.ask(
                {
                  title: `Delete ${event.event_name}?`,
                  body: (
                    <>
                      This permanently deletes the event and <strong>everything in it</strong>: team
                      registrations, sessions, stages, matches, results, placements and penalties.
                      The teams themselves are kept. To hide an event instead, edit it and untick
                      &quot;Visible on public site&quot;.
                    </>
                  ),
                  danger: true,
                  requireText: event.event_code,
                  confirmLabel: 'Delete event',
                },
                () => remove.mutateAsync(),
              )
            }
          >
            Delete
          </Button>
        </span>
      </div>
      {open && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? '').trim();
            const target = s('target_team_count');
            if (target && (!Number.isInteger(Number(target)) || Number(target) < 0))
              return setErr('Target team count must be a whole number.');
            try {
              await save.mutateAsync({
                event_name: s('event_name'),
                format_type: s('format_type') as FormatType,
                venue: s('venue') || null,
                responsible_unit: s('responsible_unit') || null,
                start_date: s('start_date') || null,
                end_date: s('end_date') || null,
                target_team_count: target ? Number(target) : null,
                status: s('status'),
                counts_toward_overall: fd.get('counts_toward_overall') === 'on',
                public_visible: fd.get('public_visible') === 'on',
                notes: s('notes') || null,
              });
              setOpen(false);
            } catch (x) {
              setErr(friendlyError(x));
            }
          }}
        >
          <Field label="Name" htmlFor={`en-${event.id}`}>
            <Input
              id={`en-${event.id}`}
              name="event_name"
              defaultValue={event.event_name}
              required
            />
          </Field>
          <Field label="Format" htmlFor={`ef-${event.id}`}>
            <Select id={`ef-${event.id}`} name="format_type" defaultValue={event.format_type}>
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Venue" htmlFor={`ev-${event.id}`}>
            <Input id={`ev-${event.id}`} name="venue" defaultValue={event.venue ?? ''} />
          </Field>
          <Field label="Responsible unit" htmlFor={`eu-${event.id}`}>
            <Input
              id={`eu-${event.id}`}
              name="responsible_unit"
              defaultValue={event.responsible_unit ?? ''}
            />
          </Field>
          <Field label="Start date" htmlFor={`es-${event.id}`}>
            <Input
              id={`es-${event.id}`}
              name="start_date"
              type="date"
              defaultValue={event.start_date ?? ''}
            />
          </Field>
          <Field label="End date" htmlFor={`ee-${event.id}`}>
            <Input
              id={`ee-${event.id}`}
              name="end_date"
              type="date"
              defaultValue={event.end_date ?? ''}
            />
          </Field>
          <Field label="Target team count" htmlFor={`et-${event.id}`}>
            <Input
              id={`et-${event.id}`}
              name="target_team_count"
              inputMode="numeric"
              defaultValue={event.target_team_count ?? ''}
            />
          </Field>
          <Field label="Status" htmlFor={`est-${event.id}`}>
            <Select id={`est-${event.id}`} name="status" defaultValue={event.status}>
              {['planning', 'active', 'complete', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex min-h-touch items-center gap-2">
            <input
              type="checkbox"
              name="counts_toward_overall"
              defaultChecked={event.counts_toward_overall}
              className="h-6 w-6 accent-brand"
            />
            Counts toward overall
          </label>
          <label className="flex min-h-touch items-center gap-2">
            <input
              type="checkbox"
              name="public_visible"
              defaultChecked={event.public_visible}
              className="h-6 w-6 accent-brand"
            />
            Visible on public site
          </label>
          <Field
            label="Internal notes (never public)"
            htmlFor={`eno-${event.id}`}
            className="sm:col-span-2"
          >
            <TextArea id={`eno-${event.id}`} name="notes" defaultValue={event.notes ?? ''} />
          </Field>
          {err && (
            <Notice tone="error" className="sm:col-span-2">
              {err}
            </Notice>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              Save event
            </Button>
          </div>
        </form>
      )}
      {confirm.dialog}
    </li>
  );
}

function UnitsCard() {
  const units = useUnits();
  const teams = useTeams();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = useOpsMutation((n: string) => db.insert('units', { name: n }));
  const rename = useOpsMutation(({ id, n }: { id: string; n: string }) =>
    db.update('units', id, { name: n }),
  );
  const toggle = useOpsMutation(({ id, active }: { id: string; active: boolean }) =>
    db.update('units', id, { active }),
  );
  const remove = useOpsMutation((id: string) => db.remove('units', id));
  const count = (unit: string) => (teams.data ?? []).filter((t) => t.unit === unit).length;
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      return true;
    } catch (x) {
      setErr(friendlyError(x));
      return false;
    }
  };

  return (
    <Card title="Units">
      <p className="text-sm text-slate-700">
        The units competing for the Commander&apos;s Cup. Every team belongs to one of these, and
        the public leaderboard totals points by unit. Renaming a unit renames it on all its teams.
      </p>
      {units.isLoading ? (
        <Loading />
      ) : (
        <ul className="mt-3 space-y-2">
          {(units.data ?? []).map((u) => (
            <li
              key={u.id}
              className="grid gap-2 rounded-lg border border-slate-300 p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
            >
              <Input
                aria-label={`Name of ${u.name}`}
                defaultValue={u.name}
                onBlur={(e) => {
                  const n = e.target.value.trim();
                  if (n && n !== u.name) void run(() => rename.mutateAsync({ id: u.id, n }));
                }}
              />
              <span className="text-sm text-slate-700">
                {count(u.name)} team{count(u.name) === 1 ? '' : 's'}
              </span>
              <Button
                variant="ghost"
                onClick={() => void run(() => toggle.mutateAsync({ id: u.id, active: !u.active }))}
              >
                {u.active ? 'Hide from new teams' : 'Show for new teams'}
              </Button>
              <Button
                variant="ghost"
                className="text-red-700"
                onClick={() =>
                  confirm.ask(
                    {
                      title: `Delete unit ${u.name}?`,
                      body:
                        count(u.name) > 0
                          ? 'This unit still has teams, so the delete will be refused. Move or delete its teams first.'
                          : undefined,
                      danger: true,
                      confirmLabel: 'Delete unit',
                    },
                    () => remove.mutateAsync(u.id),
                  )
                }
              >
                Delete
              </Button>
            </li>
          ))}
          {(units.data ?? []).length === 0 && (
            <li className="text-sm text-slate-600">No units yet.</li>
          )}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return setErr('Enter a unit name.');
          if (await run(() => add.mutateAsync(n))) setName('');
        }}
      >
        <Field label="New unit" htmlFor="new-unit">
          <Input
            id="new-unit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 1-2 SBCT"
          />
        </Field>
        <Button type="submit" variant="secondary">
          Add unit
        </Button>
      </form>
      {err && (
        <Notice tone="error" className="mt-2">
          {err}
        </Notice>
      )}
      {confirm.dialog}
    </Card>
  );
}

function NewEventForm({ nextOrder }: { nextOrder: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = useOpsMutation((values: object) => db.insert('events', values));
  if (!open) {
    return (
      <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
        Add event
      </Button>
    );
  }
  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-300 p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => String(fd.get(k) ?? '').trim();
        const code = s('event_code').toUpperCase();
        if (!/^[A-Z0-9]{2,10}$/.test(code))
          return setErr('Code must be 2–10 letters or digits, e.g. TUG.');
        if (!s('event_name')) return setErr('Event name is required.');
        const target = s('target_team_count');
        try {
          await add.mutateAsync({
            event_code: code,
            event_name: s('event_name'),
            format_type: s('format_type'),
            venue: s('venue') || null,
            responsible_unit: s('responsible_unit') || null,
            target_team_count: target ? Number(target) : null,
            counts_toward_overall: fd.get('counts_toward_overall') === 'on',
            public_visible: fd.get('public_visible') === 'on',
            display_order: nextOrder,
          });
          setOpen(false);
        } catch (x) {
          setErr(friendlyError(x));
        }
      }}
    >
      <Field label="Code (used in links, e.g. #/sport/TUG)" htmlFor="ne-code">
        <Input id="ne-code" name="event_code" autoCapitalize="characters" placeholder="TUG" />
      </Field>
      <Field label="Name" htmlFor="ne-name">
        <Input id="ne-name" name="event_name" placeholder="Tug of War" />
      </Field>
      <Field label="Format" htmlFor="ne-format">
        <Select id="ne-format" name="format_type" defaultValue="single_elimination">
          {Object.entries(FORMAT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Venue" htmlFor="ne-venue">
        <Input id="ne-venue" name="venue" />
      </Field>
      <Field label="Responsible unit" htmlFor="ne-unit">
        <Input id="ne-unit" name="responsible_unit" />
      </Field>
      <Field label="Target team count" htmlFor="ne-target">
        <Input id="ne-target" name="target_team_count" inputMode="numeric" />
      </Field>
      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          name="counts_toward_overall"
          defaultChecked
          className="h-6 w-6 accent-brand"
        />
        Counts toward overall
      </label>
      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          name="public_visible"
          defaultChecked
          className="h-6 w-6 accent-brand"
        />
        Visible on public site
      </label>
      {err && (
        <Notice tone="error" className="sm:col-span-2">
          {err}
        </Notice>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={add.isPending}>
          Create event
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
