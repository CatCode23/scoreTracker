import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useLookups } from '../../lib/api/lookups';
import { db, useCorrections, useOperatorNames, useOpsMutation, useResults } from '../../lib/api/ops';
import { canManageEvent, hasMatchRole, MANAGE_ROLES, VALIDATE_ROLES } from '../../lib/domain/permissions';
import { formatDateTime, humanize } from '../../lib/domain/format';
import type { Correction, MatchResult } from '../../lib/types';
import { ResultValidationCard, type ValidationAction } from '../../components/ResultValidationCard';
import { Button, Card, Notice, PageHeader, Select, Tabs } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { ResultStatusBadge } from '../../components/status';
import { SyncButton } from '../../components/SyncButton';
import { useConfirm } from '../../components/ConfirmDialog';

type Tab = 'pending' | 'corrections' | 'recent';

export function Validation() {
  const auth = useAuth();
  const L = useLookups();
  const results = useResults();
  const corrections = useCorrections();
  const names = useOperatorNames();
  const [tab, setTab] = useState<Tab>('pending');
  const [eventFilter, setEventFilter] = useState('');

  const act = useOpsMutation(({ id, action, reason }: { id: string; action: ValidationAction; reason: string | null }) =>
    db.update('match_results', id, { status: action, status_reason: reason }),
  );

  if (L.loading || results.isLoading) return <Loading />;
  if (L.error || results.error) return <ErrorState error={L.error ?? results.error} />;

  const all = (results.data ?? []).filter((r) => !eventFilter || L.matchById.get(r.match_id)?.event_id === eventFilter);
  const can = (r: MatchResult, roles = VALIDATE_ROLES) => {
    const m = L.matchById.get(r.match_id);
    return m ? hasMatchRole(auth, m.event_id, L.venueOf(m), roles) : false;
  };
  const title = (r: MatchResult) => {
    const m = L.matchById.get(r.match_id);
    return m ? `${L.eventById.get(m.event_id)?.event_code} · ${m.match_code} · ${m.round_name ?? ''}` : 'Match';
  };
  const pending = all.filter((r) => r.status === 'submitted' || r.status === 'disputed');
  const recent = all.filter((r) => !['submitted', 'disputed'].includes(r.status)).slice(0, 40);
  const pendingCorr = (corrections.data ?? []).filter((c) => c.decision === 'pending');

  const card = (r: MatchResult) => (
    <ResultValidationCard
      key={r.id}
      result={r}
      title={title(r)}
      teamLabel={L.team}
      submitterName={(r.submitted_by && names.data?.[r.submitted_by]) || 'Unknown'}
      canValidate={can(r)}
      canVoidOfficial={can(r, MANAGE_ROLES)}
      onAction={(action, reason) => act.mutateAsync({ id: r.id, action, reason })}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Result Validation" subtitle="Venue leads, sport managers and operations admins." actions={<SyncButton />} />
      <Select aria-label="Filter by event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="max-w-sm">
        <option value="">All my events</option>
        {L.events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.event_name}
          </option>
        ))}
      </Select>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pending', label: `Awaiting Validation (${pending.length})` },
          { id: 'corrections', label: `Correction requests (${pendingCorr.length})` },
          { id: 'recent', label: 'Recently decided' },
        ]}
      />
      {tab === 'pending' &&
        (pending.length === 0 ? <Empty title="No results awaiting validation" /> : <div className="grid gap-3 lg:grid-cols-2">{pending.map(card)}</div>)}
      {tab === 'recent' &&
        (recent.length === 0 ? <Empty title="Nothing yet" /> : <div className="grid gap-3 lg:grid-cols-2">{recent.map(card)}</div>)}
      {tab === 'corrections' && (
        <CorrectionsList
          corrections={(corrections.data ?? []).filter((c) => !eventFilter || L.matchById.get(all.find((r) => r.id === c.result_id)?.match_id ?? '')?.event_id === eventFilter)}
          results={results.data ?? []}
          title={title}
          names={names.data ?? {}}
          canDecide={(r) => {
            const m = r && L.matchById.get(r.match_id);
            return Boolean(m && canManageEvent(auth, m.event_id));
          }}
        />
      )}
    </div>
  );
}

function CorrectionsList({
  corrections,
  results,
  title,
  names,
  canDecide,
}: {
  corrections: Correction[];
  results: MatchResult[];
  title: (r: MatchResult) => string;
  names: Record<string, string>;
  canDecide: (r: MatchResult | undefined) => boolean;
}) {
  const confirm = useConfirm();
  const decide = useOpsMutation(
    async ({ c, r, approve, notes }: { c: Correction; r: MatchResult | undefined; approve: boolean; notes: string }) => {
      await db.update('corrections', c.id, { decision: approve ? 'approved' : 'denied', decision_notes: notes });
      if (approve && r) {
        if (r.status === 'official') {
          await db.update('match_results', r.id, { status: 'void', status_reason: `Correction approved: ${notes}` });
        } else if (r.status === 'submitted' || r.status === 'disputed') {
          await db.update('match_results', r.id, { status: 'returned', status_reason: `Correction approved: ${notes}` });
        }
      }
    },
  );
  if (corrections.length === 0) return <Empty title="No correction requests" />;
  return (
    <div className="space-y-3">
      <Notice tone="info">
        Approving a correction voids an Official result (or returns a pending one) and reopens the match so a corrected
        result can be submitted and validated.
      </Notice>
      {corrections.map((c) => {
        const r = results.find((x) => x.id === c.result_id);
        return (
          <Card key={c.id} title={r ? title(r) : 'Result'} actions={r && <ResultStatusBadge status={r.status} />}>
            <p className="text-sm text-slate-700">
              {humanize(c.correction_type)} · requested by {(c.requested_by && names[c.requested_by]) || 'Unknown'} at{' '}
              {formatDateTime(c.requested_at)}
            </p>
            <p className="mt-1">
              <strong>Reason:</strong> {c.reason}
            </p>
            <p className="mt-1 text-sm">
              Decision: <strong>{humanize(c.decision)}</strong>
              {c.decision_notes && ` — ${c.decision_notes}`}
            </p>
            {c.decision === 'pending' && canDecide(r) && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="success"
                  onClick={() =>
                    confirm.ask(
                      { title: 'Approve correction?', body: r?.status === 'official' ? 'The Official result will be voided and removed from public pages.' : undefined, reasonLabel: 'Decision notes (required)', confirmLabel: 'Approve' },
                      (notes) => decide.mutateAsync({ c, r, approve: true, notes }),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    confirm.ask({ title: 'Deny correction?', reasonLabel: 'Decision notes (required)', confirmLabel: 'Deny' }, (notes) =>
                      decide.mutateAsync({ c, r, approve: false, notes }),
                    )
                  }
                >
                  Deny
                </Button>
              </div>
            )}
          </Card>
        );
      })}
      {confirm.dialog}
    </div>
  );
}
