import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, MoreHorizontal, Pencil } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLookups } from '../../lib/api/lookups';
import {
  db,
  useMatchParticipants,
  useOperatorNames,
  useOpsMutation,
  useResults,
  useStages,
} from '../../lib/api/ops';
import {
  canManageEvent,
  hasEventRole,
  hasGlobalRead,
  hasMatchRole,
  SUBMIT_ROLES,
  VALIDATE_ROLES,
} from '../../lib/domain/permissions';
import {
  describeAutoAdvance,
  winnerAndLoser,
  type AdvanceNote,
} from '../../lib/domain/advancement';
import { groupBracket } from '../../lib/domain/bracket';
import { formatDate, formatSeconds, formatTime, humanize, ordinal } from '../../lib/domain/format';
import { isHeadToHead } from '../../lib/domain/validation';
import {
  MATCH_STATUSES,
  type Match,
  type MatchParticipant,
  type MatchResult,
  type MatchStatus,
} from '../../lib/types';
import { friendlyError, supabase } from '../../lib/supabase';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  PageHeader,
  Select,
  Tabs,
  cx,
} from '../../components/ui';
import { Empty, ErrorState, Loading, OFFLINE_CONTINGENCY } from '../../components/states';
import { MatchStatusBadge } from '../../components/status';
import { SyncButton } from '../../components/SyncButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { ScoreEntryForm, type ResultPayload } from '../../components/ScoreEntryForm';
import { ResultValidationCard, type ValidationAction } from '../../components/ResultValidationCard';
import { AdvanceDialog, type AdvanceTarget } from '../../components/AdvanceDialog';

type Filter = 'to_play' | 'finished' | 'all';
const FINISHED = new Set<MatchStatus>(['official', 'complete', 'void']);

const sortSlots = (a: MatchParticipant, b: MatchParticipant) =>
  a.slot.localeCompare(b.slot, undefined, { numeric: true });

function valueText(s: MatchParticipant): string {
  if (s.score != null) return String(s.score);
  if (s.time_seconds != null) return formatSeconds(s.time_seconds);
  if (s.technical_score != null) return String(s.technical_score);
  if (s.placement != null) return `#${s.placement}`;
  return '';
}

/**
 * Matches: one place to run an event's matches. Pick an event, tap a match, then enter or
 * fix its result. Teams move on automatically; rarely used bracket tools are under More.
 */
export function Matches() {
  const auth = useAuth();
  const L = useLookups();
  const [eventId, setEventId] = useState('');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('to_play');
  const [notes, setNotes] = useState<AdvanceNote[]>([]);

  const visibleEvents = L.events.filter(
    (e) =>
      hasGlobalRead(auth) ||
      hasEventRole(auth, e.id, ['scorer', 'venue_lead', 'sport_manager', 'read_only']),
  );
  const activeEvent = eventId || (visibleEvents.length === 1 ? visibleEvents[0].id : '');
  const mps = useMatchParticipants(activeEvent || undefined);
  const results = useResults({ eventId: activeEvent || undefined });
  const stages = useStages(activeEvent || undefined);

  const eventMatches = useMemo(
    () => L.matches.filter((m) => m.event_id === activeEvent),
    [L.matches, activeEvent],
  );
  const grouped = useMemo(() => {
    const st = new Map((stages.data ?? []).map((s) => [s.id, s]));
    const shown = eventMatches.filter((m) =>
      filter === 'all'
        ? true
        : filter === 'finished'
          ? FINISHED.has(m.status)
          : !FINISHED.has(m.status),
    );
    return groupBracket(
      shown.map((m) => ({
        ...m,
        stage_name: st.get(m.stage_id)?.stage_name ?? 'Stage',
        stage_order: st.get(m.stage_id)?.stage_order ?? 0,
        stage_type: st.get(m.stage_id)?.stage_type ?? 'elimination',
      })),
    );
  }, [eventMatches, stages.data, filter]);

  if (L.loading) return <Loading />;
  if (L.error) return <ErrorState error={L.error} />;

  const selected = matchId ? L.matchById.get(matchId) : undefined;
  const slotsOf = (id: string) => (mps.data ?? []).filter((p) => p.match_id === id).sort(sortSlots);

  if (selected) {
    return (
      <MatchDetail
        match={selected}
        slots={slotsOf(selected.id)}
        allSlots={mps.data ?? []}
        results={(results.data ?? []).filter((r) => r.match_id === selected.id)}
        notes={notes}
        setNotes={setNotes}
        onBack={() => {
          setMatchId(null);
          setNotes([]);
        }}
      />
    );
  }

  const toPlay = eventMatches.filter((m) => !FINISHED.has(m.status)).length;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Matches"
        subtitle="Tap a match to enter or fix its result."
        actions={<SyncButton />}
      />
      <Notice tone="info">
        <span className="font-semibold">
          1. Pick the event. 2. Tap the match. 3. Enter the result and save.
        </span>{' '}
        Teams move on to their next match automatically. {OFFLINE_CONTINGENCY}
      </Notice>
      {visibleEvents.length === 0 ? (
        <Empty title="You are not assigned to any event">
          Ask the operations cell for an assignment.
        </Empty>
      ) : (
        <Card>
          <Field label="Event" htmlFor="matches-event">
            <Select
              id="matches-event"
              value={activeEvent}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Select an event…</option>
              {visibleEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.event_name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      )}

      {activeEvent && (
        <>
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'to_play', label: `To play (${toPlay})` },
              { id: 'finished', label: 'Finished' },
              { id: 'all', label: 'All' },
            ]}
          />
          {mps.isLoading || stages.isLoading ? (
            <Loading />
          ) : eventMatches.length === 0 ? (
            <Empty title="No matches for this event yet">Create them on Match Setup.</Empty>
          ) : grouped.length === 0 ? (
            <Empty
              title={filter === 'to_play' ? 'Every match has a result' : 'No finished matches yet'}
            />
          ) : (
            grouped.map((st) => (
              <section key={st.stage_id} className="space-y-2">
                <h2 className="text-lg font-bold">{st.stage_name}</h2>
                {st.rounds.map((r) => (
                  <div key={r.key} className="space-y-2">
                    <h3 className="rounded bg-slate-200 px-2 py-1 text-sm font-bold uppercase">
                      {r.round_name}
                    </h3>
                    <ul className="grid gap-2 lg:grid-cols-2">
                      {r.matches.map((m) => (
                        <li key={m.id}>
                          <MatchRow
                            match={m}
                            slots={slotsOf(m.id)}
                            team={L.team}
                            onOpen={() => setMatchId(m.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function MatchRow({
  match,
  slots,
  team,
  onOpen,
}: {
  match: Match;
  slots: MatchParticipant[];
  team: (id: string | null) => string;
  onOpen: () => void;
}) {
  const done = match.status === 'official' || match.status === 'complete';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-touch w-full items-center gap-3 rounded-lg border-2 border-slate-300 bg-white p-3 text-left hover:border-brand"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{match.match_code}</span>
          <MatchStatusBadge status={match.status} />
        </span>
        <span className="block text-sm text-slate-700">
          {[formatDate(match.match_date), formatTime(match.start_time), match.venue_area]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="mt-1 block space-y-0.5">
          {slots.length === 0 ? (
            <span className="text-sm italic text-slate-600">Teams to be decided</span>
          ) : (
            slots.map((s) => (
              <span key={s.id} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{team(s.participant_id)}</span>
                {done && (
                  <span className="shrink-0 font-semibold tabular-nums">{valueText(s)}</span>
                )}
              </span>
            ))
          )}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
    </button>
  );
}

function MatchDetail({
  match,
  slots,
  allSlots,
  results,
  notes,
  setNotes,
  onBack,
}: {
  match: Match;
  slots: MatchParticipant[];
  allSlots: MatchParticipant[];
  results: MatchResult[];
  notes: AdvanceNote[];
  setNotes: (n: AdvanceNote[]) => void;
  onBack: () => void;
}) {
  const auth = useAuth();
  const L = useLookups();
  const names = useOperatorNames();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [advance, setAdvance] = useState<AdvanceTarget | null>(null);

  const venue = L.venueOf(match);
  const canSubmit = hasMatchRole(auth, match.event_id, venue, SUBMIT_ROLES);
  const canValidate = hasMatchRole(auth, match.event_id, venue, VALIDATE_ROLES);
  const canManage = canManageEvent(auth, match.event_id);
  const official = results.find((r) => r.status === 'official');
  const pending = results.find((r) => r.status === 'submitted' || r.status === 'disputed');
  const ids = slots.map((s) => s.participant_id).filter(Boolean) as string[];
  const { winner, loser } = winnerAndLoser(official, ids);
  const participants = slots
    .filter((s) => s.participant_id)
    .map((s) => ({
      participant_id: s.participant_id!,
      slot: s.slot,
      label: L.team(s.participant_id),
    }));
  const codeOf = (id: string | null) =>
    id ? (L.matchById.get(id)?.match_code ?? 'next match') : '';
  const event = L.eventById.get(match.event_id);

  // After an Official save or edit, report where teams went.
  const reportAdvance = async (w: string | null, l: string | null) => {
    const [moved, placed] = await Promise.all([
      supabase
        .from('match_participants')
        .select('match_id, participant_id, slot')
        .eq('source_match_id', match.id),
      match.decides_place != null
        ? supabase
            .from('event_placements')
            .select('participant_id, final_place')
            .eq('source_match_id', match.id)
            .order('final_place')
        : Promise.resolve({ data: [] as { participant_id: string; final_place: number }[] }),
    ]);
    const out = describeAutoAdvance(
      match,
      w,
      l,
      (moved.data ?? []) as { match_id: string; participant_id: string | null; slot: string }[],
      (id) => codeOf(id),
      (id) => L.team(id),
    );
    const places = (placed.data ?? []) as { participant_id: string; final_place: number }[];
    if (places.length > 0) {
      out.push({
        tone: 'success',
        text: `Placements filled in: ${places.map((p) => `${ordinal(p.final_place)} ${L.team(p.participant_id)}`).join(', ')}. Publish them on the Placements page.`,
      });
    }
    setNotes(out);
  };

  const submit = useOpsMutation(async (p: ResultPayload) => {
    setNotes([]);
    await db.insert('match_results', {
      match_id: match.id,
      status: canValidate ? 'official' : 'submitted',
      submitted_by: auth.session!.user.id,
      ...p,
    });
    if (canValidate) await reportAdvance(p.winner_participant_id, p.loser_participant_id);
  });

  const downstream = allSlots.filter(
    (s) =>
      s.source_match_id === match.id &&
      (s.source_type === 'winner_of_match' || s.source_type === 'loser_of_match'),
  );
  const [updateNext, setUpdateNext] = useState(true);
  const correct = useOpsMutation(async (p: ResultPayload) => {
    await db.rpc('correct_match_result', {
      p_result_id: official!.id,
      p_result_method: p.result_method,
      p_winner: p.winner_participant_id,
      p_loser: p.loser_participant_id,
      p_values: p.participant_values,
      p_reason: p.reason,
      p_update_advancement: updateNext,
    });
    await reportAdvance(p.winner_participant_id, p.loser_participant_id);
  });

  const validate = useOpsMutation(
    ({ id, action, reason }: { id: string; action: ValidationAction; reason: string | null }) =>
      db.update('match_results', id, { status: action, status_reason: reason }),
  );
  const setStatus = useOpsMutation((status: MatchStatus) =>
    db.update('matches', match.id, { status }),
  );
  const flag = useOpsMutation(({ id, values }: { id: string; values: Partial<MatchParticipant> }) =>
    db.update('match_participants', id, values),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-5 w-5" aria-hidden /> All matches
      </Button>
      <PageHeader
        title={match.match_code}
        subtitle={[
          event?.event_name,
          match.round_name,
          formatDate(match.match_date),
          formatTime(match.start_time),
          match.venue_area,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<MatchStatusBadge status={match.status} />}
      />

      {notes.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {notes.map((n) => (
            <Notice key={n.text} tone={n.tone}>
              {n.text}
            </Notice>
          ))}
        </div>
      )}

      {/* ---- The result ---- */}
      {match.status === 'void' ? (
        <Notice tone="warn" title="This match is void">
          It does not count. Change its status under More if that was a mistake.
        </Notice>
      ) : official && !editing ? (
        <Card title="Result: Official">
          <ul className="space-y-1">
            {slots.map((s) => (
              <li
                key={s.id}
                className={cx(
                  'flex items-center justify-between gap-2 rounded px-2 py-2',
                  s.participant_id === winner ? 'bg-green-100 font-bold' : 'bg-slate-50',
                )}
              >
                <span>
                  {L.team(s.participant_id)}
                  {s.participant_id === winner && ' · Winner'}
                </span>
                <span className="tabular-nums">{valueText(s)}</span>
              </li>
            ))}
          </ul>
          {(match.next_winner_match_id || match.next_loser_match_id) && (
            <p className="mt-2 text-sm text-slate-700">
              {match.next_winner_match_id &&
                `Winner goes to ${codeOf(match.next_winner_match_id)} (${match.next_winner_slot ?? '?'})`}
              {match.next_winner_match_id && match.next_loser_match_id && ' · '}
              {match.next_loser_match_id &&
                `Loser goes to ${codeOf(match.next_loser_match_id)} (${match.next_loser_slot ?? '?'})`}
            </p>
          )}
          {canManage && (
            <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit result
            </Button>
          )}
        </Card>
      ) : official && editing ? (
        <Card title="Edit result">
          <p className="mb-3 text-sm text-slate-700">
            The corrected result replaces the current one on the public site straight away. The old
            result and your reason are kept in the audit log.
          </p>
          {downstream.length > 0 && (
            <div className="mb-3">
              <Notice tone="warn" title="Teams have already moved on from this match">
                {downstream.map((d) => (
                  <span key={d.id} className="block">
                    {L.team(d.participant_id)} → {codeOf(d.match_id)} (slot {d.slot})
                  </span>
                ))}
              </Notice>
              <div className="mt-2">
                <Checkbox
                  id="edit-update-next"
                  label="If the winner changes, swap the corrected teams into those matches"
                  description="Refused if one of those matches already has a result; edit that one first."
                  checked={updateNext}
                  onChange={setUpdateNext}
                />
              </div>
            </div>
          )}
          <ScoreEntryForm
            matchType={match.match_type}
            participants={participants}
            initial={{
              result_method: official.result_method,
              winner_participant_id: official.winner_participant_id,
              loser_participant_id: official.loser_participant_id,
              participant_values: official.participant_values,
              notes: official.notes,
            }}
            onSubmit={async (p) => {
              await correct.mutateAsync(p);
              setEditing(false);
            }}
          />
          <Button variant="ghost" block className="mt-2" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </Card>
      ) : pending ? (
        canValidate ? (
          <ResultValidationCard
            result={pending}
            title="Submitted by a Scorer: awaiting approval"
            teamLabel={L.team}
            submitterName={
              (pending.submitted_by && names.data?.[pending.submitted_by]) || 'Unknown'
            }
            canValidate
            canVoidOfficial={false}
            onAction={async (action, reason) => {
              await validate.mutateAsync({ id: pending.id, action, reason });
              if (action === 'official') {
                await reportAdvance(pending.winner_participant_id, pending.loser_participant_id);
              }
            }}
          />
        ) : (
          <Notice tone="warn" title="Awaiting approval">
            A result has been submitted and is waiting for an event administrator.
          </Notice>
        )
      ) : canSubmit ? (
        <Card title="Enter result">
          {isHeadToHead(match.match_type) && participants.length < 2 ? (
            <Notice tone="warn">
              This match needs two teams before a result can be entered. They are filled in when
              earlier matches are finished, or by hand under More.
            </Notice>
          ) : (
            <ScoreEntryForm
              key={match.id}
              matchType={match.match_type}
              participants={participants}
              submitsOfficial={canValidate}
              onSubmit={(p) => submit.mutateAsync(p).then(() => undefined)}
            />
          )}
        </Card>
      ) : (
        <Card title="Teams">
          {participants.length === 0 ? (
            <p className="text-slate-700">Teams to be decided.</p>
          ) : (
            <ul className="space-y-1">
              {participants.map((p) => (
                <li key={p.participant_id} className="rounded bg-slate-50 px-2 py-2">
                  {p.label}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-slate-700">
            No result yet. You are not assigned to enter results here.
          </p>
        </Card>
      )}

      {/* ---- More: rarely used bracket tools ---- */}
      {canManage && (
        <Card>
          <Button
            variant="ghost"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="-ml-2"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden /> {showMore ? 'Hide more' : 'More'}
          </Button>
          {showMore && (
            <div className="mt-3 space-y-4">
              <Field
                label="Match status"
                htmlFor="match-status"
                hint="Official is set by saving a result."
              >
                <Select
                  id="match-status"
                  value={match.status}
                  onChange={(e) => {
                    const status = e.target.value as MatchStatus;
                    if (status === 'void' || status === 'complete') {
                      confirm.ask(
                        {
                          title: `Mark ${match.match_code} ${humanize(status)}?`,
                          danger: status === 'void',
                          confirmLabel: `Mark ${humanize(status)}`,
                        },
                        () => setStatus.mutateAsync(status),
                      );
                    } else setStatus.mutate(status);
                  }}
                >
                  {MATCH_STATUSES.map((s) => (
                    <option key={s} value={s} disabled={s === 'official' || s === 'submitted'}>
                      {humanize(s)}
                      {(s === 'official' || s === 'submitted') && ' (via results)'}
                    </option>
                  ))}
                </Select>
              </Field>

              {(winner || loser) && (
                <div className="flex flex-wrap gap-2">
                  {winner && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setAdvance({ from: match, participantId: winner, kind: 'winner_of_match' })
                      }
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden /> Advance winner
                    </Button>
                  )}
                  {loser && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setAdvance({ from: match, participantId: loser, kind: 'loser_of_match' })
                      }
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden /> Route loser
                    </Button>
                  )}
                </div>
              )}

              {slots.some((s) => s.participant_id) && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Teams in this match</p>
                  <ul className="space-y-1">
                    {slots
                      .filter((s) => s.participant_id)
                      .map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-col gap-1 rounded bg-slate-50 px-2 py-1 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span>
                            <strong>{s.slot}</strong> · {L.team(s.participant_id)}
                            {s.advanced && <span className="ml-1 text-green-800">· advanced</span>}
                            {s.eliminated && (
                              <span className="ml-1 text-red-800">· eliminated</span>
                            )}
                          </span>
                          <span className="flex gap-1">
                            <Button
                              variant="ghost"
                              className="min-h-[36px] px-2 text-xs"
                              onClick={() =>
                                flag.mutate({ id: s.id, values: { eliminated: !s.eliminated } })
                              }
                            >
                              {s.eliminated ? 'Un-eliminate' : 'Eliminate'}
                            </Button>
                            <Button
                              variant="ghost"
                              className="min-h-[36px] px-2 text-xs"
                              onClick={() =>
                                setAdvance({
                                  from: match,
                                  participantId: s.participant_id!,
                                  kind: 'manual',
                                })
                              }
                            >
                              Move…
                            </Button>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-slate-700">
                Change times, routing or teams in a slot on <strong>Match Setup</strong>.
              </p>
              {(setStatus.error || flag.error) && (
                <Notice tone="error">{friendlyError(setStatus.error ?? flag.error)}</Notice>
              )}
            </div>
          )}
        </Card>
      )}

      {advance && (
        <AdvanceDialog
          target={advance}
          matches={L.matches.filter((m) => m.event_id === match.event_id)}
          slots={allSlots}
          team={L.team}
          onClose={() => setAdvance(null)}
        />
      )}
      {confirm.dialog}
    </div>
  );
}
