import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { db, useMatchParticipants, useMatches, useOpsMutation, useParticipants, useResults, useStages, useEvents } from '../../lib/api/ops';
import { canManageEvent, hasGlobalRead } from '../../lib/domain/permissions';
import { checkDestinationSlot, suggestSlot, winnerAndLoser } from '../../lib/domain/advancement';
import { groupBracket } from '../../lib/domain/bracket';
import { formatSeconds, formatTime, humanize } from '../../lib/domain/format';
import { MATCH_STATUSES, type Match, type MatchParticipant, type MatchStatus } from '../../lib/types';
import { friendlyError } from '../../lib/supabase';
import { Button, Card, Checkbox, Field, Input, Notice, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading, Unauthorized } from '../../components/states';
import { MatchStatusBadge, UnofficialBadge } from '../../components/status';
import { SyncButton } from '../../components/SyncButton';
import { useConfirm } from '../../components/ConfirmDialog';

interface AdvanceTarget {
  from: Match;
  participantId: string;
  kind: 'winner_of_match' | 'loser_of_match' | 'manual';
}

export function MatchManagement() {
  const auth = useAuth();
  const events = useEvents();
  const [eventId, setEventId] = useState('');
  const matches = useMatches(eventId || undefined);
  const mps = useMatchParticipants(eventId || undefined);
  const stages = useStages(eventId || undefined);
  const participants = useParticipants(eventId || undefined);
  const results = useResults({ eventId: eventId || undefined, statuses: ['official'] });
  const [advance, setAdvance] = useState<AdvanceTarget | null>(null);
  const confirm = useConfirm();
  const setStatus = useOpsMutation(({ id, status }: { id: string; status: MatchStatus }) => db.update('matches', id, { status }));
  const flag = useOpsMutation(({ id, values }: { id: string; values: Partial<MatchParticipant> }) => db.update('match_participants', id, values));

  const visible = (events.data ?? []).filter((e) => canManageEvent(auth, e.id) || hasGlobalRead(auth));
  const canManage = eventId ? canManageEvent(auth, eventId) : false;
  const team = (pid: string | null) => {
    const p = participants.data?.find((x) => x.id === pid);
    return p ? `${p.teams?.team_name} (${p.teams?.unit})` : 'TBD';
  };

  const grouped = useMemo(() => {
    const st = new Map((stages.data ?? []).map((s) => [s.id, s]));
    return groupBracket(
      (matches.data ?? []).map((m) => ({
        ...m,
        stage_name: st.get(m.stage_id)?.stage_name ?? 'Stage',
        stage_order: st.get(m.stage_id)?.stage_order ?? 0,
        stage_type: st.get(m.stage_id)?.stage_type ?? 'elimination',
      })),
    );
  }, [matches.data, stages.data]);

  if (events.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} />;
  if (visible.length === 0) return <Unauthorized />;

  return (
    <div className="space-y-4">
      <PageHeader title="Match Management" subtitle="Status, manual winner/loser advancement, eliminations." actions={<SyncButton />} />
      <Card>
        <Field label="Event" htmlFor="mm-event">
          <Select id="mm-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Select an event…</option>
            {visible.map((e) => (
              <option key={e.id} value={e.id}>
                {e.event_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      {eventId && !canManage && <Notice tone="info">Read-only view. Only the event's sport manager can make changes.</Notice>}
      {(setStatus.error || flag.error) && <Notice tone="error">{friendlyError(setStatus.error ?? flag.error)}</Notice>}

      {eventId &&
        (matches.isLoading || mps.isLoading ? (
          <Loading />
        ) : grouped.length === 0 ? (
          <Empty title="No matches for this event. Create them on Match Setup." />
        ) : (
          grouped.map((st) => (
            <section key={st.stage_id} className="space-y-3">
              <h2 className="text-xl font-bold">{st.stage_name}</h2>
              {st.rounds.map((r) => (
                <div key={r.key} className="space-y-2">
                  <h3 className="rounded bg-slate-200 px-2 py-1 text-sm font-bold uppercase">{r.round_name}</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {r.matches.map((m) => {
                      const slots = (mps.data ?? []).filter((p) => p.match_id === m.id).sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }));
                      const result = (results.data ?? []).find((x) => x.match_id === m.id);
                      const ids = slots.map((s) => s.participant_id).filter(Boolean) as string[];
                      const { winner, loser } = winnerAndLoser(result, ids);
                      return (
                        <article key={m.id} className="rounded-xl border border-slate-300 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span>
                              <span className="block font-bold">{m.match_code}</span>
                              <span className="text-sm text-slate-700">
                                {[humanize(m.match_type), formatTime(m.start_time), m.venue_area].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span className="flex flex-col items-end gap-1">
                              <MatchStatusBadge status={m.status} />
                              {m.status !== 'official' && m.status !== 'complete' && <UnofficialBadge />}
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {slots.map((s) => (
                              <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 text-sm ${s.participant_id === winner ? 'bg-green-100 font-bold' : 'bg-slate-50'}`}>
                                <span>
                                  <strong>{s.slot}</strong> · {team(s.participant_id)}
                                  {s.advanced && <span className="ml-1 text-green-800">· advanced</span>}
                                  {s.eliminated && <span className="ml-1 text-red-800">· eliminated</span>}
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className="tabular-nums">
                                    {s.score ?? (s.time_seconds != null ? formatSeconds(s.time_seconds) : s.placement != null ? `#${s.placement}` : '')}
                                  </span>
                                  {canManage && s.participant_id && (
                                    <>
                                      <Button variant="ghost" className="min-h-[36px] px-2 text-xs" onClick={() => flag.mutate({ id: s.id, values: { eliminated: !s.eliminated } })}>
                                        {s.eliminated ? 'Un-eliminate' : 'Eliminate'}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="min-h-[36px] px-2 text-xs"
                                        onClick={() => setAdvance({ from: m, participantId: s.participant_id!, kind: 'manual' })}
                                      >
                                        Move…
                                      </Button>
                                    </>
                                  )}
                                </span>
                              </li>
                            ))}
                            {slots.length === 0 && <li className="text-sm italic text-slate-600">No teams assigned</li>}
                          </ul>
                          {(m.next_winner_match_id || m.next_loser_match_id) && (
                            <p className="mt-1 text-xs text-slate-700">
                              {m.next_winner_match_id && `Winner → ${matches.data?.find((x) => x.id === m.next_winner_match_id)?.match_code} ${m.next_winner_slot ?? ''}`}
                              {m.next_winner_match_id && m.next_loser_match_id && ' · '}
                              {m.next_loser_match_id && `Loser → ${matches.data?.find((x) => x.id === m.next_loser_match_id)?.match_code} ${m.next_loser_slot ?? ''}`}
                            </p>
                          )}
                          {canManage && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {winner && (
                                <Button onClick={() => setAdvance({ from: m, participantId: winner, kind: 'winner_of_match' })}>
                                  <ArrowRight className="h-4 w-4" aria-hidden /> Advance winner
                                </Button>
                              )}
                              {loser && (
                                <Button variant="secondary" onClick={() => setAdvance({ from: m, participantId: loser, kind: 'loser_of_match' })}>
                                  <ArrowRight className="h-4 w-4" aria-hidden /> Route loser
                                </Button>
                              )}
                              <Select
                                aria-label={`Status of ${m.match_code}`}
                                className="w-44"
                                value={m.status}
                                onChange={(e) => {
                                  const status = e.target.value as MatchStatus;
                                  if (status === 'void' || status === 'complete') {
                                    confirm.ask(
                                      { title: `Mark ${m.match_code} ${humanize(status)}?`, danger: status === 'void', confirmLabel: `Mark ${humanize(status)}` },
                                      () => setStatus.mutateAsync({ id: m.id, status }),
                                    );
                                  } else setStatus.mutate({ id: m.id, status });
                                }}
                              >
                                {MATCH_STATUSES.map((s) => (
                                  <option key={s} value={s} disabled={s === 'official' || s === 'submitted'}>
                                    {humanize(s)}
                                    {(s === 'official' || s === 'submitted') && ' (via results)'}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))
        ))}

      {advance && (
        <AdvanceDialog
          target={advance}
          matches={matches.data ?? []}
          slots={mps.data ?? []}
          team={team}
          onClose={() => setAdvance(null)}
        />
      )}
      {confirm.dialog}
    </div>
  );
}

export function AdvanceDialog({
  target,
  matches,
  slots,
  team,
  onClose,
}: {
  target: AdvanceTarget;
  matches: Match[];
  slots: MatchParticipant[];
  team: (id: string | null) => string;
  onClose: () => void;
}) {
  const defaultDest =
    target.kind === 'winner_of_match' ? target.from.next_winner_match_id : target.kind === 'loser_of_match' ? target.from.next_loser_match_id : null;
  const defaultSlot =
    target.kind === 'winner_of_match' ? target.from.next_winner_slot : target.kind === 'loser_of_match' ? target.from.next_loser_slot : null;
  const [dest, setDest] = useState(defaultDest ?? '');
  const destSlots = slots.filter((s) => s.match_id === dest);
  const [slot, setSlot] = useState(defaultSlot ?? suggestSlot(destSlots));
  const [overwrite, setOverwrite] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = dest ? checkDestinationSlot(destSlots, slot, target.participantId) : null;
  const go = useOpsMutation(() =>
    db.rpc('advance_participant', {
      p_from_match_id: target.from.id,
      p_participant_id: target.participantId,
      p_to_match_id: dest,
      p_slot: slot,
      p_source_type: target.kind,
      p_overwrite: overwrite,
      p_reason: `${humanize(target.kind)} from ${target.from.match_code}`,
    }),
  );
  const blocked = !dest || !slot.trim() || !confirmed || check?.kind === 'already_in_match' || (check?.kind === 'occupied' && !overwrite);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="adv-title" className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="adv-title" className="text-xl font-bold">
          {target.kind === 'winner_of_match' ? 'Advance winner' : target.kind === 'loser_of_match' ? 'Route loser' : 'Move team'}
        </h2>
        <p className="mt-1 text-slate-800">
          <strong>{team(target.participantId)}</strong> from {target.from.match_code}
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Destination match" htmlFor="adv-dest">
            <Select
              id="adv-dest"
              value={dest}
              onChange={(e) => {
                setDest(e.target.value);
                setSlot(suggestSlot(slots.filter((s) => s.match_id === e.target.value)));
                setOverwrite(false);
              }}
            >
              <option value="">Select…</option>
              {matches
                .filter((m) => m.id !== target.from.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.match_code} · {m.round_name ?? ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Destination slot" htmlFor="adv-slot">
            <Input id="adv-slot" value={slot} onChange={(e) => { setSlot(e.target.value); setOverwrite(false); }} />
          </Field>
          {dest && (
            <div className="text-sm">
              Current slots:{' '}
              {destSlots.length === 0 ? 'none' : destSlots.map((s) => `${s.slot}: ${team(s.participant_id)}`).join(' · ')}
            </div>
          )}
          {check?.kind === 'occupied' && (
            <Notice tone="warn" title="Slot already occupied">
              Slot {slot} currently holds <strong>{team(check.occupantParticipantId)}</strong>. Advancing will overwrite it.
              <div className="mt-2">
                <Checkbox id="adv-overwrite" label="Yes, overwrite this slot" checked={overwrite} onChange={setOverwrite} />
              </div>
            </Notice>
          )}
          {check?.kind === 'already_in_match' && <Notice tone="error">This team is already in slot {check.existingSlot} of that match.</Notice>}
          {check?.kind === 'same' && <Notice tone="info">This team is already in that slot. Nothing will change.</Notice>}
          <Checkbox id="adv-confirm" label="I confirm this advancement" description="Recorded in the audit log." checked={confirmed} onChange={setConfirmed} />
          {err && <Notice tone="error">{err}</Notice>}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={blocked || go.isPending}
            onClick={async () => {
              setErr(null);
              try {
                await go.mutateAsync(undefined);
                onClose();
              } catch (x) {
                setErr(friendlyError(x));
              }
            }}
          >
            {go.isPending ? 'Working…' : 'Confirm advancement'}
          </Button>
        </div>
      </div>
    </div>
  );
}
