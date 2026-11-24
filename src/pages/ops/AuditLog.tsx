import { useState } from 'react';
import { useAuditLog, useEvents, useOperatorNames, type AuditFilter } from '../../lib/api/ops';
import { formatDateTime, humanize } from '../../lib/domain/format';
import type { AuditEntry } from '../../lib/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';

const TABLES = [
  'matches',
  'match_participants',
  'match_results',
  'corrections',
  'event_placements',
  'point_adjustments',
  'event_participants',
  'teams',
  'user_assignments',
  'profiles',
  'scoring_settings',
  'events',
];
const ACTIONS = [
  'insert',
  'update',
  'delete',
  'submit',
  'validate',
  'approve',
  'return',
  'dispute',
  'void',
  'publish',
];

function changedKeys(e: AuditEntry): string[] {
  if (!e.old_data || !e.new_data) return [];
  return Object.keys(e.new_data).filter(
    (k) => k !== 'updated_at' && JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]),
  );
}

export function AuditLog() {
  const events = useEvents();
  const names = useOperatorNames();
  const [draft, setDraft] = useState<AuditFilter>({});
  const [filter, setFilter] = useState<AuditFilter>({});
  const log = useAuditLog(filter, true);
  const [open, setOpen] = useState<string | null>(null);
  const set = (k: keyof AuditFilter) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value || undefined }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of submissions, validations, corrections, voids and placement changes."
      />
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter(draft);
          }}
        >
          <Field label="Event" htmlFor="af-event">
            <Select id="af-event" onChange={set('eventId')} value={draft.eventId ?? ''}>
              <option value="">Any</option>
              {(events.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.event_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Table" htmlFor="af-table">
            <Select id="af-table" onChange={set('table')} value={draft.table ?? ''}>
              <option value="">Any</option>
              {TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action" htmlFor="af-action">
            <Select id="af-action" onChange={set('action')} value={draft.action ?? ''}>
              <option value="">Any</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actor" htmlFor="af-actor">
            <Select id="af-actor" onChange={set('actor')} value={draft.actor ?? ''}>
              <option value="">Anyone</option>
              {Object.entries(names.data ?? {}).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Record ID" htmlFor="af-record">
            <Input
              id="af-record"
              onChange={set('recordId')}
              value={draft.recordId ?? ''}
              placeholder="uuid"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From" htmlFor="af-from">
              <Input
                id="af-from"
                type="datetime-local"
                onChange={set('from')}
                value={draft.from ?? ''}
              />
            </Field>
            <Field label="To" htmlFor="af-to">
              <Input id="af-to" type="datetime-local" onChange={set('to')} value={draft.to ?? ''} />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit">Apply filters</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft({});
                setFilter({});
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </Card>
      {log.isLoading ? (
        <Loading />
      ) : log.error ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : (log.data ?? []).length === 0 ? (
        <Empty title="No audit entries match" />
      ) : (
        <ul className="space-y-2">
          {(log.data ?? []).map((e) => {
            const keys = changedKeys(e);
            return (
              <li key={e.id} className="rounded-lg border border-slate-300 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {humanize(e.action)} · {e.table_name}
                  </span>
                  <span className="text-sm text-slate-700">{formatDateTime(e.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700">
                  By {(e.actor_profile_id && names.data?.[e.actor_profile_id]) || 'System / SQL'} ·
                  record {e.record_id.slice(0, 8)}…
                  {keys.length > 0 && ` · changed: ${keys.join(', ')}`}
                </p>
                {e.reason && <p className="text-sm">Reason: {e.reason}</p>}
                <Button
                  variant="ghost"
                  className="mt-1 min-h-[36px] px-2 text-sm"
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                >
                  {open === e.id ? 'Hide details' : 'Show details'}
                </Button>
                {open === e.id && (
                  <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                    {JSON.stringify({ old: e.old_data, new: e.new_data }, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
