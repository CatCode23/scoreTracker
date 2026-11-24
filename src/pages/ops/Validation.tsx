import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useLookups } from '../../lib/api/lookups';
import { db, useOperatorNames, useOpsMutation, useResults } from '../../lib/api/ops';
import { hasMatchRole, VALIDATE_ROLES } from '../../lib/domain/permissions';
import type { MatchResult } from '../../lib/types';
import { ResultValidationCard, type ValidationAction } from '../../components/ResultValidationCard';
import { Notice, PageHeader, Select, Tabs } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { SyncButton } from '../../components/SyncButton';

type Tab = 'pending' | 'recent';

export function Validation() {
  const auth = useAuth();
  const L = useLookups();
  const results = useResults();
  const names = useOperatorNames();
  const [tab, setTab] = useState<Tab>('pending');
  const [eventFilter, setEventFilter] = useState('');

  const act = useOpsMutation(
    ({ id, action, reason }: { id: string; action: ValidationAction; reason: string | null }) =>
      db.update('match_results', id, { status: action, status_reason: reason }),
  );

  if (L.loading || results.isLoading) return <Loading />;
  if (L.error || results.error) return <ErrorState error={L.error ?? results.error} />;

  const all = (results.data ?? []).filter(
    (r) => !eventFilter || L.matchById.get(r.match_id)?.event_id === eventFilter,
  );
  const can = (r: MatchResult) => {
    const m = L.matchById.get(r.match_id);
    return m ? hasMatchRole(auth, m.event_id, L.venueOf(m), VALIDATE_ROLES) : false;
  };
  const title = (r: MatchResult) => {
    const m = L.matchById.get(r.match_id);
    return m
      ? `${L.eventById.get(m.event_id)?.event_code} · ${m.match_code} · ${m.round_name ?? ''}`
      : 'Match';
  };
  const pending = all.filter((r) => r.status === 'submitted' || r.status === 'disputed');
  const recent = all.filter((r) => !['submitted', 'disputed'].includes(r.status)).slice(0, 40);

  const card = (r: MatchResult) => (
    <ResultValidationCard
      key={r.id}
      result={r}
      title={title(r)}
      teamLabel={L.team}
      submitterName={(r.submitted_by && names.data?.[r.submitted_by]) || 'Unknown'}
      canValidate={can(r)}
      canVoidOfficial={false}
      onAction={(action, reason) => act.mutateAsync({ id: r.id, action, reason })}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        subtitle="Results from Scorer accounts wait here for an event administrator. Results entered by administrators are Official straight away."
        actions={<SyncButton />}
      />
      <Notice tone="info">
        To fix an Official result, open the match on <strong>Matches</strong> and tap{' '}
        <strong>Edit result</strong>.
      </Notice>
      <Select
        aria-label="Filter by event"
        value={eventFilter}
        onChange={(e) => setEventFilter(e.target.value)}
        className="max-w-sm"
      >
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
          { id: 'pending', label: `Awaiting approval (${pending.length})` },
          { id: 'recent', label: 'Recent results' },
        ]}
      />
      {tab === 'pending' &&
        (pending.length === 0 ? (
          <Empty title="Nothing waiting for approval" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">{pending.map(card)}</div>
        ))}
      {tab === 'recent' &&
        (recent.length === 0 ? (
          <Empty title="Nothing yet" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">{recent.map(card)}</div>
        ))}
    </div>
  );
}
