import { useState } from 'react';
import { db, useEvents, useOpsMutation, usePointsMatrix, useSettings } from '../../lib/api/ops';
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
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
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
  const loadSchedule = useOpsMutation((replace: boolean) =>
    db.rpc<number>('load_preliminary_schedule', { p_year: Number(year), p_replace: replace }),
  );

  if (settings.isLoading || matrix.isLoading || events.isLoading) return <Loading />;
  if (settings.error) return <ErrorState error={settings.error} />;
  const get = (k: string) => settings.data?.find((s) => s.setting_key === k);
  const penalty = get('no_show_penalty');
  const overall = get('overall_scoring_enabled');
  const tYear = get('tournament_year');

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Operations admin only. All changes are audited." />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {(updSetting.error || updMatrix.error) && (
        <Notice tone="error">{friendlyError(updSetting.error ?? updMatrix.error)}</Notice>
      )}

      <Card title="Preliminary schedule">
        <p className="text-sm text-slate-700">
          Loads the known preliminary sessions (Dec 7–9) for the selected tournament year. Sessions
          remain editable on Match Setup. Current year setting:{' '}
          <strong>{tYear?.numeric_value ?? 'not set'}</strong>.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Tournament year" htmlFor="year">
            <Input
              id="year"
              inputMode="numeric"
              className="w-28"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
          <Button
            onClick={() =>
              confirm.ask(
                {
                  title: `Load preliminary schedule for ${year}?`,
                  body: 'Events that already have sessions are skipped.',
                  confirmLabel: 'Load',
                },
                async () => {
                  const n = await loadSchedule.mutateAsync(false);
                  setMsg({ tone: 'success', text: `${n} sessions created.` });
                },
              )
            }
          >
            Load schedule
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              confirm.ask(
                {
                  title: `Replace ALL sessions with the ${year} preliminary schedule?`,
                  body: 'Existing sessions are deleted; matches keep their data but lose their session link.',
                  danger: true,
                  confirmLabel: 'Replace',
                },
                async () => {
                  const n = await loadSchedule.mutateAsync(true);
                  setMsg({ tone: 'success', text: `${n} sessions created (replaced).` });
                },
              )
            }
          >
            Replace schedule
          </Button>
        </div>
      </Card>

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

      <Card title="Events">
        <ul className="space-y-3">
          {(events.data ?? []).map((e) => (
            <EventEditor key={e.id} event={e} />
          ))}
        </ul>
      </Card>
      {confirm.dialog}
    </div>
  );
}

function EventEditor({ event }: { event: EventRow }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useOpsMutation((values: object) => db.update('events', event.id, values));
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
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Edit'}
        </Button>
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
    </li>
  );
}
