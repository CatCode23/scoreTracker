import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLookups } from '../../lib/api/lookups';
import { db, useMatchParticipants, useOpsMutation, useResults } from '../../lib/api/ops';
import { hasEventRole, hasMatchRole, SUBMIT_ROLES } from '../../lib/domain/permissions';
import { formatDate, formatDateTime, formatTime } from '../../lib/domain/format';
import type { Correction, MatchResult } from '../../lib/types';
import { ScoreEntryForm, type ResultPayload } from '../../components/ScoreEntryForm';
import { Button, Card, Field, Notice, PageHeader, Select, TextArea, cx } from '../../components/ui';
import { Empty, ErrorState, Loading, OFFLINE_CONTINGENCY } from '../../components/states';
import { MatchStatusBadge, ResultStatusBadge } from '../../components/status';
import { SyncButton } from '../../components/SyncButton';
import { friendlyError } from '../../lib/supabase';

const OPEN = new Set(['planned', 'ready', 'in_progress', 'delayed']);

export function ScoreEntry() {
  const auth = useAuth();
  const L = useLookups();
  const [eventId, setEventId] = useState('');
  const [matchId, setMatchId] = useState('');
  const mps = useMatchParticipants(eventId || undefined);
  const mine = useResults();

  const myEvents = L.events.filter((e) => hasEventRole(auth, e.id, SUBMIT_ROLES));
  const activeEvent = eventId || (myEvents.length === 1 ? myEvents[0].id : '');
  const matches = useMemo(
    () =>
      L.matches
        .filter(
          (m) =>
            m.event_id === activeEvent &&
            hasMatchRole(auth, m.event_id, L.venueOf(m), SUBMIT_ROLES),
        )
        .filter((m) => OPEN.has(m.status) || m.status === 'submitted')
        .sort((a, b) =>
          `${a.match_date}${a.start_time}${a.match_code}`.localeCompare(
            `${b.match_date}${b.start_time}${b.match_code}`,
          ),
        ),
    [L, activeEvent, auth],
  );
  const match = matches.find((m) => m.id === matchId);
  const participants = (mps.data ?? [])
    .filter((p) => p.match_id === matchId && p.participant_id)
    .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }))
    .map((p) => ({
      participant_id: p.participant_id!,
      slot: p.slot,
      label: L.team(p.participant_id),
    }));

  const submit = useOpsMutation(async (payload: ResultPayload) => {
    await db.insert('match_results', {
      match_id: matchId,
      status: 'submitted',
      submitted_by: auth.session!.user.id,
      ...payload,
    });
  });

  if (L.loading) return <Loading />;
  if (L.error) return <ErrorState error={L.error} />;

  const myResults = (mine.data ?? [])
    .filter((r) => r.submitted_by === auth.session?.user.id)
    .slice(0, 15);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Score Entry" actions={<SyncButton />} />
      <Notice tone="info" title="Field-use guide">
        <p className="text-base font-semibold">
          1. Select Match. 2. Enter result. 3. Confirm referee approval. 4. Submit.
        </p>
        <p className="mt-1">{OFFLINE_CONTINGENCY}</p>
      </Notice>

      {myEvents.length === 0 ? (
        <Empty title="You are not assigned to score any event">
          Ask the operations cell for a scorer assignment.
        </Empty>
      ) : (
        <Card>
          <Field label="Event" htmlFor="event">
            <Select
              id="event"
              value={activeEvent}
              onChange={(e) => {
                setEventId(e.target.value);
                setMatchId('');
              }}
            >
              <option value="">Select an event…</option>
              {myEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.event_name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      )}

      {activeEvent && (
        <Card title="1. Select Match">
          {matches.length === 0 ? (
            <Empty title="No open matches at your assigned venue" />
          ) : (
            <ul className="grid gap-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMatchId(m.id)}
                    aria-pressed={m.id === matchId}
                    className={cx(
                      'flex min-h-touch w-full items-center justify-between gap-2 rounded-lg border-2 p-3 text-left',
                      m.id === matchId ? 'border-brand bg-green-50' : 'border-slate-300 bg-white',
                    )}
                  >
                    <span>
                      <span className="block font-bold">
                        {m.match_code} · {m.round_name ?? `Round ${m.round_order}`}
                      </span>
                      <span className="block text-sm text-slate-700">
                        {[formatDate(m.match_date), formatTime(m.start_time), m.venue_area]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <MatchStatusBadge status={m.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {match && (
        <Card title={`2–4. Enter result: ${match.match_code}`}>
          {match.status === 'submitted' ? (
            <Notice tone="warn" title="Awaiting Validation">
              A result for this match has already been submitted. Use “Request correction” below if
              it is wrong.
            </Notice>
          ) : mps.isLoading ? (
            <Loading />
          ) : (
            <ScoreEntryForm
              matchType={match.match_type}
              participants={participants}
              onSubmit={(p) => submit.mutateAsync(p).then(() => undefined)}
            />
          )}
        </Card>
      )}

      <Card
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" aria-hidden /> My recent submissions
          </span>
        }
      >
        {myResults.length === 0 ? (
          <Empty title="No submissions yet" />
        ) : (
          <ul className="space-y-2">
            {myResults.map((r) => (
              <MySubmission
                key={r.id}
                result={r}
                title={L.matchById.get(r.match_id)?.match_code ?? 'Match'}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MySubmission({ result, title }: { result: MatchResult; title: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Correction['correction_type']>('score_correction');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const request = useOpsMutation(() =>
    db.insert('corrections', {
      result_id: result.id,
      requested_by: auth.session!.user.id,
      correction_type: type,
      reason: reason.trim(),
    }),
  );
  const canRequest = ['submitted', 'official', 'disputed'].includes(result.status);
  return (
    <li className="rounded-lg border border-slate-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="text-sm text-slate-700">{formatDateTime(result.submitted_at)}</span>
        </span>
        <ResultStatusBadge status={result.status} />
      </div>
      {result.status_reason && <p className="mt-1 text-sm">Reason: {result.status_reason}</p>}
      {canRequest && !open && (
        <Button variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
          Request correction
        </Button>
      )}
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reason.trim().length < 3)
              return setMsg({ tone: 'error', text: 'A reason is required.' });
            try {
              await request.mutateAsync(undefined);
              setMsg({
                tone: 'success',
                text: 'Correction requested. The sport manager will review it.',
              });
              setOpen(false);
              setReason('');
            } catch (err) {
              setMsg({ tone: 'error', text: friendlyError(err) });
            }
          }}
        >
          <Field label="Correction type" htmlFor={`ct-${result.id}`}>
            <Select
              id={`ct-${result.id}`}
              value={type}
              onChange={(e) => setType(e.target.value as Correction['correction_type'])}
            >
              <option value="score_correction">Score correction</option>
              <option value="winner_correction">Winner correction</option>
              <option value="placement_correction">Placement correction</option>
              <option value="forfeit">Forfeit</option>
              <option value="dispute">Dispute</option>
              <option value="administrative">Administrative</option>
            </Select>
          </Field>
          <Field
            label="What is wrong and what should it be? (required)"
            htmlFor={`cr-${result.id}`}
          >
            <TextArea
              id={`cr-${result.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={request.isPending}>
              Send request
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {msg && (
        <Notice tone={msg.tone} className="mt-2">
          {msg.text}
        </Notice>
      )}
    </li>
  );
}
