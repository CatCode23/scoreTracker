import { useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  db,
  useEvents,
  useMatchParticipants,
  useMatches,
  useOpsMutation,
  useParticipants,
  usePoolAssignments,
  usePools,
  useStages,
} from '../../lib/api/ops';
import { canManageEvent } from '../../lib/domain/permissions';
import { headToHeadWarning, overlappingMatchWarnings } from '../../lib/domain/validation';
import { formatDate, formatTime, humanize, ordinal } from '../../lib/domain/format';
import {
  MATCH_TYPES,
  STAGE_TYPES,
  type EventRow,
  type Match,
  type MatchType,
  type StageType,
} from '../../lib/types';
import { friendlyError, supabase } from '../../lib/supabase';
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Tabs,
  TextArea,
} from '../../components/ui';
import { Empty, ErrorState, Loading, Unauthorized } from '../../components/states';
import { MatchStatusBadge } from '../../components/status';
import { useConfirm } from '../../components/ConfirmDialog';
import { nextMatchNumber, suggestMatchCode, suggestRoundOrder } from '../../lib/domain/matchCode';
import { parseCsv } from '../../lib/domain/csv';

type Tab = 'stages' | 'matches' | 'import';

/** Read a form into a plain object of trimmed strings. */
function formValues(e: FormEvent<HTMLFormElement>): Record<string, string> {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
}
const orNull = (v: string | undefined) => (v ? v : null);
const intOrNull = (v: string | undefined) => (v ? Number(v) : null);

export function MatchSetup() {
  const auth = useAuth();
  const events = useEvents();
  const [eventId, setEventId] = useState('');
  const [tab, setTab] = useState<Tab>('matches');
  if (events.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} />;
  const manageable = (events.data ?? []).filter((e) => canManageEvent(auth, e.id));
  if (manageable.length === 0)
    return <Unauthorized message="Only sport managers and operations admins can set up matches." />;
  const event = manageable.find((e) => e.id === eventId);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Match Setup"
        subtitle="Stages, pools, matches and the teams in each match."
      />
      <Card>
        <Field label="Event" htmlFor="setup-event">
          <Select id="setup-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
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
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'matches', label: 'Matches' },
              { id: 'stages', label: 'Stages & Pools' },
              { id: 'import', label: 'Import CSV' },
            ]}
          />
          {tab === 'stages' && <StagesTab event={event} />}
          {tab === 'matches' && <MatchesTab event={event} />}
          {tab === 'import' && <ImportTab event={event} />}
        </>
      )}
    </div>
  );
}

function useErr() {
  const [err, setErr] = useState<string | null>(null);
  const wrap = (fn: () => Promise<unknown>) => async () => {
    setErr(null);
    try {
      await fn();
      return true;
    } catch (x) {
      setErr(friendlyError(x));
      return false;
    }
  };
  return {
    err,
    setErr,
    wrap,
    node: err && (
      <Notice tone="error" className="mt-2">
        {err}
      </Notice>
    ),
  };
}

// ---------------------------------------------------------------------------
function StagesTab({ event }: { event: EventRow }) {
  const stages = useStages(event.id);
  const pools = usePools(event.id);
  const participants = useParticipants(event.id);
  const assignments = usePoolAssignments((pools.data ?? []).map((p) => p.id));
  const save = useOpsMutation((args: { table: string; values: object }) =>
    db.insert(args.table, args.values),
  );
  const upd = useOpsMutation((args: { table: string; id: string; values: object }) =>
    db.update(args.table, args.id, args.values),
  );
  const del = useOpsMutation((args: { table: string; id: string }) =>
    db.remove(args.table, args.id),
  );
  const recompute = useOpsMutation((poolId: string) =>
    db.rpc('recompute_pool_standings', { p_pool_id: poolId }),
  );
  const confirm = useConfirm();
  const e = useErr();
  const nextOrder = Math.max(0, ...(stages.data ?? []).map((s) => s.stage_order)) + 1;
  const team = (pid: string) =>
    participants.data?.find((p) => p.id === pid)?.teams?.team_name ?? 'Team';

  if (stages.isLoading) return <Loading />;
  return (
    <div className="space-y-4">
      <Card title="Add stage">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={async (ev) => {
            const v = formValues(ev);
            const form = ev.currentTarget;
            if (!v.stage_name) return e.setErr('Stage name is required.');
            const ok = await e.wrap(() =>
              save.mutateAsync({
                table: 'stages',
                values: {
                  event_id: event.id,
                  stage_name: v.stage_name,
                  stage_order: Number(v.stage_order || nextOrder),
                  stage_type: v.stage_type,
                  advancement_rule: orNull(v.advancement_rule),
                  scheduled_date: orNull(v.scheduled_date),
                },
              }),
            )();
            if (ok) form.reset();
          }}
        >
          <Field label="Stage name" htmlFor="stage_name">
            <Input
              id="stage_name"
              name="stage_name"
              placeholder="e.g. Pool Play, Championship, Consolation"
            />
          </Field>
          <Field label="Order" htmlFor="stage_order">
            <Input
              id="stage_order"
              name="stage_order"
              inputMode="numeric"
              defaultValue={nextOrder}
            />
          </Field>
          <Field label="Type" htmlFor="stage_type">
            <Select
              id="stage_type"
              name="stage_type"
              defaultValue={event.format_type === 'pool_then_playoff' ? 'pool' : 'elimination'}
            >
              {STAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="scheduled_date">
            <Input id="scheduled_date" name="scheduled_date" type="date" />
          </Field>
          <Field
            label="Advancement rule (plain text)"
            htmlFor="advancement_rule"
            className="sm:col-span-2 lg:col-span-3"
          >
            <Input
              id="advancement_rule"
              name="advancement_rule"
              placeholder="e.g. Top 2 per pool + 2 wild cards advance"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" block>
              Add stage
            </Button>
          </div>
        </form>
        {e.node}
      </Card>

      {(stages.data ?? []).length === 0 ? (
        <Empty title="No stages yet" />
      ) : (
        (stages.data ?? []).map((s) => {
          const stagePools = (pools.data ?? []).filter((p) => p.stage_id === s.id);
          return (
            <Card
              key={s.id}
              title={`${s.stage_order}. ${s.stage_name}`}
              actions={
                <div className="flex gap-2">
                  <Select
                    aria-label="Stage status"
                    value={s.status}
                    onChange={(ev) =>
                      upd.mutate({ table: 'stages', id: s.id, values: { status: ev.target.value } })
                    }
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                  </Select>
                  <Button
                    variant="ghost"
                    aria-label={`Delete stage ${s.stage_name}`}
                    onClick={() =>
                      confirm.ask(
                        {
                          title: `Delete stage "${s.stage_name}"?`,
                          body: 'This deletes its pools and matches too.',
                          danger: true,
                          confirmLabel: 'Delete',
                        },
                        () => del.mutateAsync({ table: 'stages', id: s.id }),
                      )
                    }
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </Button>
                </div>
              }
            >
              <p className="text-sm text-slate-700">
                {humanize(s.stage_type as StageType)}
                {s.scheduled_date && ` · ${formatDate(s.scheduled_date)}`}
                {s.advancement_rule && ` · ${s.advancement_rule}`}
              </p>
              {s.stage_type === 'pool' && (
                <div className="mt-3 space-y-3">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={async (ev) => {
                      const v = formValues(ev);
                      const form = ev.currentTarget;
                      if (!v.pool_name) return;
                      const ok = await e.wrap(() =>
                        save.mutateAsync({
                          table: 'pools',
                          values: {
                            stage_id: s.id,
                            pool_name: v.pool_name,
                            venue_area: orNull(v.venue_area),
                          },
                        }),
                      )();
                      if (ok) form.reset();
                    }}
                  >
                    <Field label="Pool name" htmlFor={`pn-${s.id}`}>
                      <Input id={`pn-${s.id}`} name="pool_name" placeholder="A" className="w-28" />
                    </Field>
                    <Field label="Area" htmlFor={`pa-${s.id}`}>
                      <Input
                        id={`pa-${s.id}`}
                        name="venue_area"
                        placeholder="Court 1"
                        className="w-36"
                      />
                    </Field>
                    <Button type="submit" variant="secondary">
                      Add pool
                    </Button>
                  </form>
                  {stagePools.map((p) => {
                    const members = (assignments.data ?? [])
                      .filter((a) => a.pool_id === p.id)
                      .sort((a, b) => (a.pool_rank ?? 99) - (b.pool_rank ?? 99));
                    const assigned = new Set(
                      (assignments.data ?? [])
                        .filter((a) => stagePools.some((sp) => sp.id === a.pool_id))
                        .map((a) => a.participant_id),
                    );
                    return (
                      <div key={p.id} className="rounded-lg border border-slate-300 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold">
                            Pool {p.pool_name}{' '}
                            {p.venue_area && (
                              <span className="font-normal text-slate-600">· {p.venue_area}</span>
                            )}
                          </p>
                          <Button
                            variant="secondary"
                            onClick={() => e.wrap(() => recompute.mutateAsync(p.id))()}
                          >
                            Recompute standings
                          </Button>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {members.map((m) => (
                            <li
                              key={m.id}
                              className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-2 py-1 text-sm"
                            >
                              <span className="min-w-[8rem] flex-1 font-semibold">
                                {team(m.participant_id)}
                              </span>
                              <span className="tabular-nums">
                                {m.wins}-{m.losses}-{m.ties} · {Number(m.point_differential)}
                              </span>
                              <Input
                                aria-label="Pool rank"
                                className="w-16"
                                inputMode="numeric"
                                defaultValue={m.pool_rank ?? ''}
                                onBlur={(ev) =>
                                  upd.mutate({
                                    table: 'pool_assignments',
                                    id: m.id,
                                    values: { pool_rank: intOrNull(ev.target.value) },
                                  })
                                }
                              />
                              <Select
                                aria-label="Advancement"
                                className="w-40"
                                value={
                                  m.advanced
                                    ? (m.advancement_type ?? 'automatic')
                                    : m.advancement_type === 'did_not_advance'
                                      ? 'did_not_advance'
                                      : ''
                                }
                                onChange={(ev) => {
                                  const v = ev.target.value;
                                  upd.mutate({
                                    table: 'pool_assignments',
                                    id: m.id,
                                    values: {
                                      advanced: v === 'automatic' || v === 'wild_card',
                                      advancement_type: v || null,
                                    },
                                  });
                                }}
                              >
                                <option value="">Undecided</option>
                                <option value="automatic">Advances</option>
                                <option value="wild_card">Wild card</option>
                                <option value="did_not_advance">Did not advance</option>
                              </Select>
                              <Button
                                variant="ghost"
                                aria-label="Remove from pool"
                                onClick={() => del.mutate({ table: 'pool_assignments', id: m.id })}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <form
                          className="mt-2 flex flex-wrap items-end gap-2"
                          onSubmit={async (ev) => {
                            const v = formValues(ev);
                            if (!v.participant_id) return;
                            await e.wrap(() =>
                              save.mutateAsync({
                                table: 'pool_assignments',
                                values: {
                                  pool_id: p.id,
                                  participant_id: v.participant_id,
                                  pool_seed: intOrNull(v.pool_seed),
                                },
                              }),
                            )();
                          }}
                        >
                          <Select name="participant_id" aria-label="Team to add" className="w-56">
                            <option value="">Add team…</option>
                            {(participants.data ?? [])
                              .filter((x) => !assigned.has(x.id) && x.active)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.teams?.team_name} ({x.teams?.unit})
                                </option>
                              ))}
                          </Select>
                          <Input
                            name="pool_seed"
                            aria-label="Pool seed"
                            placeholder="Seed"
                            className="w-20"
                            inputMode="numeric"
                          />
                          <Button type="submit" variant="secondary">
                            Add
                          </Button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })
      )}
      {(upd.error || del.error) && (
        <Notice tone="error">{friendlyError(upd.error ?? del.error)}</Notice>
      )}
      {confirm.dialog}
    </div>
  );
}

const COMMON_ROUNDS = [
  'Opening Round',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Final',
  '3rd Place',
  'Consolation Semifinal',
  '5th Place',
  '7th Place',
  'Pool A',
  'Pool B',
  'Heat 1',
  'Heat 2',
];

/**
 * Stage, round, round order, match number and match code. For a new match the order,
 * number and code are filled in automatically from the stage and round, until you type
 * in one of them yourself.
 */
function MatchIdentityFields({
  eventCode,
  stages,
  matches,
  editing,
  start,
  onPick,
}: {
  eventCode: string;
  stages: { id: string; stage_name: string }[];
  matches: Match[];
  editing: Match | null;
  start: { stageId: string; roundName: string };
  onPick: (pick: { stageId: string; roundName: string }) => void;
}) {
  const isNew = !editing;
  const [stageId, setStageId] = useState(
    editing?.stage_id ?? (start.stageId || stages[0]?.id || ''),
  );
  const [roundName, setRoundName] = useState(editing?.round_name ?? start.roundName);
  const [order, setOrder] = useState(editing ? String(editing.round_order) : '');
  const [num, setNum] = useState(editing?.match_number != null ? String(editing.match_number) : '');
  const [code, setCode] = useState(editing?.match_code ?? '');
  const [touched, setTouched] = useState({ order: !isNew, num: !isNew, code: !isNew });

  const others = matches.filter((m) => m.id !== editing?.id);
  const effOrder = touched.order ? order : String(suggestRoundOrder(others, stageId, roundName));
  const effNum = touched.num ? num : String(nextMatchNumber(others, stageId, roundName));
  const effCode = touched.code
    ? code
    : suggestMatchCode(
        eventCode,
        roundName,
        Number(effOrder) || 1,
        effNum.trim() === '' ? null : Number(effNum),
        others.map((m) => m.match_code),
      );
  const roundNames = [
    ...new Set([
      ...others.filter((m) => m.stage_id === stageId && m.round_name).map((m) => m.round_name!),
      ...COMMON_ROUNDS,
    ]),
  ];
  const auto = (typed: boolean) => (typed ? undefined : 'Filled in automatically; type to change');

  return (
    <>
      <Field label="Stage" htmlFor="m-stage">
        <Select
          id="m-stage"
          name="stage_id"
          value={stageId}
          onChange={(e) => {
            setStageId(e.target.value);
            onPick({ stageId: e.target.value, roundName });
          }}
        >
          {stages.map((st) => (
            <option key={st.id} value={st.id}>
              {st.stage_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Round name" htmlFor="m-round">
        <Input
          id="m-round"
          name="round_name"
          list="m-round-names"
          value={roundName}
          onChange={(e) => {
            setRoundName(e.target.value);
            onPick({ stageId, roundName: e.target.value });
          }}
          placeholder="Quarterfinal, Final, Heat 1, 185 lb…"
        />
        <datalist id="m-round-names">
          {roundNames.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
      <Field label="Round order" htmlFor="m-ro" hint={auto(touched.order)}>
        <Input
          id="m-ro"
          name="round_order"
          inputMode="numeric"
          value={effOrder}
          onChange={(e) => {
            setOrder(e.target.value);
            setTouched((t) => ({ ...t, order: true }));
          }}
        />
      </Field>
      <Field label="Match number" htmlFor="m-no" hint={auto(touched.num)}>
        <Input
          id="m-no"
          name="match_number"
          inputMode="numeric"
          value={effNum}
          onChange={(e) => {
            setNum(e.target.value);
            setTouched((t) => ({ ...t, num: true }));
          }}
        />
      </Field>
      <Field label="Match code" htmlFor="m-code" hint={auto(touched.code)}>
        <Input
          id="m-code"
          name="match_code"
          value={effCode}
          onChange={(e) => {
            setCode(e.target.value);
            setTouched((t) => ({ ...t, code: true }));
          }}
        />
      </Field>
    </>
  );
}

/** "Loser goes to" is only needed for semifinals / consolation, so it hides behind a checkbox. */
function LoserRouting({ initial, options }: { initial: string | null; options: Match[] }) {
  const [on, setOn] = useState(Boolean(initial));
  return (
    <div className="space-y-2 sm:col-span-2">
      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="h-6 w-6 accent-brand"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        Loser plays again (3rd place or consolation)
      </label>
      {on && (
        <Field
          label="Loser goes to"
          htmlFor="m-nl"
          hint="The loser takes the first open slot in that match."
        >
          <Select id="m-nl" name="next_loser_match_id" defaultValue={initial ?? ''}>
            <option value="">— choose a match —</option>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.match_code}
                {x.round_name ? ` · ${x.round_name}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function MatchesTab({ event }: { event: EventRow }) {
  const stages = useStages(event.id);
  const pools = usePools(event.id);
  const matches = useMatches(event.id);
  const mps = useMatchParticipants(event.id);
  const participants = useParticipants(event.id);
  const save = useOpsMutation((args: { table: string; values: object }) =>
    db.insert(args.table, args.values),
  );
  const upd = useOpsMutation((args: { id: string; values: object }) =>
    db.update('matches', args.id, args.values),
  );
  const del = useOpsMutation((args: { table: string; id: string }) =>
    db.remove(args.table, args.id),
  );
  const confirm = useConfirm();
  const e = useErr();
  const [editing, setEditing] = useState<Match | null>(null);
  const [newFormKey, setNewFormKey] = useState(0);
  const [lastPick, setLastPick] = useState({ stageId: '', roundName: '' });

  const team = (pid: string | null) => {
    const p = participants.data?.find((x) => x.id === pid);
    return p ? `${p.teams?.team_name} (${p.teams?.unit})` : 'TBD';
  };
  const list = matches.data ?? [];
  const overlap = useMemo(
    () =>
      overlappingMatchWarnings(
        list.map((m) => ({
          match_id: m.id,
          match_code: m.match_code,
          match_date: m.match_date,
          start_time: m.start_time,
          participant_ids: (mps.data ?? [])
            .filter((p) => p.match_id === m.id && p.participant_id)
            .map((p) => p.participant_id!),
        })),
        (id) => team(id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, mps.data, participants.data],
  );

  if (stages.isLoading || matches.isLoading) return <Loading />;
  if ((stages.data ?? []).length === 0)
    return <Empty title="Create a stage first (Stages & Pools tab)." />;

  const matchForm = (m: Match | null) => (
    <form
      key={m?.id ?? `new-${newFormKey}`}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (ev) => {
        const v = formValues(ev);
        const form = ev.currentTarget;
        if (!v.match_code) return e.setErr('Match code is required.');
        const values = {
          event_id: event.id,
          stage_id: v.stage_id,
          pool_id: orNull(v.pool_id),
          match_code: v.match_code.toUpperCase(),
          round_name: orNull(v.round_name),
          round_order: Number(v.round_order || 1),
          match_number: intOrNull(v.match_number),
          match_date: orNull(v.match_date),
          start_time: orNull(v.start_time),
          venue_area: orNull(v.venue_area),
          match_type: v.match_type as MatchType,
          next_winner_match_id: orNull(v.next_winner_match_id),
          // No slot to choose: teams take the next match's first open slot. An existing
          // slot is kept only while the destination stays the same.
          next_winner_slot:
            m && orNull(v.next_winner_match_id) === m.next_winner_match_id
              ? m.next_winner_slot
              : null,
          next_loser_match_id: orNull(v.next_loser_match_id),
          next_loser_slot:
            m && orNull(v.next_loser_match_id) === m.next_loser_match_id ? m.next_loser_slot : null,
          public_visible: v.public_visible === 'on',
          auto_advance: v.auto_advance === 'on',
          decides_place: intOrNull(v.decides_place),
        };
        const ok = await e.wrap(() =>
          m
            ? upd.mutateAsync({ id: m.id, values })
            : save.mutateAsync({ table: 'matches', values }),
        )();
        if (ok) {
          if (m) setEditing(null);
          else {
            form.reset();
            setNewFormKey((k) => k + 1); // fresh form: next number and code fill in
          }
        }
      }}
    >
      <MatchIdentityFields
        eventCode={event.event_code}
        stages={stages.data ?? []}
        matches={list}
        editing={m}
        start={lastPick}
        onPick={setLastPick}
      />
      <Field label="Pool (pool games)" htmlFor="m-pool">
        <Select id="m-pool" name="pool_id" defaultValue={m?.pool_id ?? ''}>
          <option value="">None</option>
          {(pools.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              Pool {p.pool_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Match type" htmlFor="m-type">
        <Select
          id="m-type"
          name="match_type"
          defaultValue={
            m?.match_type ??
            (event.format_type === 'heat_time'
              ? 'heat'
              : event.format_type === 'multi_station'
                ? 'multi_station'
                : event.format_type === 'weight_class'
                  ? 'bout'
                  : 'head_to_head')
          }
        >
          {MATCH_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date" htmlFor="m-date">
        <Input id="m-date" name="match_date" type="date" defaultValue={m?.match_date ?? ''} />
      </Field>
      <Field label="Start time" htmlFor="m-time">
        <Input
          id="m-time"
          name="start_time"
          type="time"
          defaultValue={m?.start_time?.slice(0, 5) ?? ''}
        />
      </Field>
      <Field label="Area / court / field" htmlFor="m-area">
        <Input id="m-area" name="venue_area" defaultValue={m?.venue_area ?? ''} />
      </Field>
      <Field label="Public" htmlFor="m-public">
        <label className="flex min-h-touch items-center gap-2">
          <input
            id="m-public"
            type="checkbox"
            name="public_visible"
            defaultChecked={m?.public_visible ?? true}
            className="h-6 w-6 accent-brand"
          />
          Show on public pages
        </label>
      </Field>
      <Field
        label="Decides places"
        htmlFor="m-decides"
        hint="Fills in Placements when the result is saved. Heats/stations: the result's places start here."
      >
        <Select id="m-decides" name="decides_place" defaultValue={m?.decides_place ?? ''}>
          <option value="">No</option>
          {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {ordinal(n)} (winner) / {ordinal(n + 1)} (loser)
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Move teams on"
        htmlFor="m-auto"
        hint="When a result is saved, put the winner/loser into the matches below"
      >
        <label className="flex min-h-touch items-center gap-2">
          <input
            id="m-auto"
            type="checkbox"
            name="auto_advance"
            defaultChecked={m?.auto_advance ?? true}
            className="h-6 w-6 accent-brand"
          />
          Automatically
        </label>
      </Field>
      <Field
        label="Winner goes to"
        htmlFor="m-nw"
        hint="The winner takes the first open slot in that match."
      >
        <Select id="m-nw" name="next_winner_match_id" defaultValue={m?.next_winner_match_id ?? ''}>
          <option value="">— (no next match)</option>
          {list
            .filter((x) => x.id !== m?.id)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.match_code}
                {x.round_name ? ` · ${x.round_name}` : ''}
              </option>
            ))}
        </Select>
      </Field>
      <LoserRouting
        initial={m?.next_loser_match_id ?? null}
        options={list.filter((x) => x.id !== m?.id)}
      />
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit">{m ? 'Save match' : 'Add match'}</Button>
        {m && (
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      {overlap.length > 0 && (
        <Notice tone="warn" title="Schedule overlap">
          <ul className="list-disc pl-5">
            {overlap.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      <Card title={editing ? `Edit ${editing.match_code}` : 'Add match'}>
        {matchForm(editing)}
        {e.node}
      </Card>
      {list.length === 0 ? (
        <Empty title="No matches yet" />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((m) => {
            const slots = (mps.data ?? [])
              .filter((p) => p.match_id === m.id)
              .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }));
            const warn = headToHeadWarning(
              m.match_type,
              slots.filter((s) => s.participant_id).length,
            );
            const stage = stages.data?.find((s) => s.id === m.stage_id);
            const inMatch = new Set(slots.map((s) => s.participant_id));
            return (
              <li key={m.id} className="rounded-xl border border-slate-300 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block font-bold">{m.match_code}</span>
                    <span className="text-sm text-slate-700">
                      {[
                        stage?.stage_name,
                        m.round_name,
                        m.match_number && `#${m.match_number}`,
                        humanize(m.match_type),
                        formatDate(m.match_date),
                        formatTime(m.start_time),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <MatchStatusBadge status={m.status} />
                </div>
                {warn && (
                  <Notice tone="warn" className="mt-2">
                    {warn}
                  </Notice>
                )}
                <ul className="mt-2 space-y-1">
                  {slots.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm"
                    >
                      <span>
                        <strong>{s.slot}</strong> · {team(s.participant_id)}{' '}
                        <span className="text-slate-600">({humanize(s.source_type)})</span>
                      </span>
                      <Button
                        variant="ghost"
                        aria-label={`Remove slot ${s.slot}`}
                        onClick={() =>
                          confirm.ask(
                            {
                              title: `Remove ${team(s.participant_id)} from ${m.match_code}?`,
                              danger: true,
                              confirmLabel: 'Remove',
                            },
                            () => del.mutateAsync({ table: 'match_participants', id: s.id }),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={async (ev) => {
                    const v = formValues(ev);
                    const form = ev.currentTarget;
                    if (!v.slot || !v.participant_id) return e.setErr('Choose a slot and a team.');
                    if (slots.some((s) => s.slot === v.slot))
                      return e.setErr(
                        `Slot ${v.slot} is already used in ${m.match_code}. Remove it first or use Matches → More to advance.`,
                      );
                    const ok = await e.wrap(() =>
                      save.mutateAsync({
                        table: 'match_participants',
                        values: {
                          match_id: m.id,
                          slot: v.slot,
                          participant_id: v.participant_id,
                          source_type: v.source_type,
                        },
                      }),
                    )();
                    if (ok) form.reset();
                  }}
                >
                  <Input
                    name="slot"
                    aria-label="Slot"
                    placeholder="Slot"
                    className="w-24"
                    defaultValue={
                      ['A', 'B'].find((x) => !slots.some((s) => s.slot === x)) ??
                      `Lane ${slots.length + 1}`
                    }
                  />
                  <Select name="participant_id" aria-label="Team" className="w-52">
                    <option value="">Team…</option>
                    {(participants.data ?? [])
                      .filter((p) => p.active && !inMatch.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.seed != null ? `#${p.seed} ` : ''}
                          {p.teams?.team_name}
                        </option>
                      ))}
                  </Select>
                  <Select
                    name="source_type"
                    aria-label="Source"
                    className="w-36"
                    defaultValue="seed"
                  >
                    {['seed', 'pool_rank', 'wild_card', 'manual'].map((x) => (
                      <option key={x} value={x}>
                        {humanize(x)}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary">
                    Assign
                  </Button>
                </form>
                <div className="mt-2 flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-700"
                    onClick={() =>
                      confirm.ask(
                        {
                          title: `Delete match ${m.match_code}?`,
                          body: 'Its participants and results are deleted too.',
                          danger: true,
                          confirmLabel: 'Delete',
                        },
                        () => del.mutateAsync({ table: 'matches', id: m.id }),
                      )
                    }
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirm.dialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
const MATCH_CSV_HEADER =
  'match_code,stage_order,round_name,round_order,match_number,match_type,match_date,start_time,venue_area,next_winner_code,next_winner_slot,next_loser_code,next_loser_slot';
const SLOT_CSV_HEADER = 'match_code,slot,seed';

function ImportTab({ event }: { event: EventRow }) {
  const stages = useStages(event.id);
  const matches = useMatches(event.id);
  const participants = useParticipants(event.id);
  const [matchCsv, setMatchCsv] = useState(MATCH_CSV_HEADER + '\n');
  const [slotCsv, setSlotCsv] = useState(SLOT_CSV_HEADER + '\n');
  const [log, setLog] = useState<{ tone: 'success' | 'error' | 'warn'; text: string }[]>([]);
  const run = useOpsMutation(async (fn: () => Promise<void>) => fn());

  const importMatches = async () => {
    const out: typeof log = [];
    const rowsIn = parseCsv(matchCsv);
    const stageByOrder = new Map((stages.data ?? []).map((s) => [String(s.stage_order), s.id]));
    const created = new Map<string, string>((matches.data ?? []).map((m) => [m.match_code, m.id]));
    const pending: { code: string; nw?: string; nws?: string; nl?: string; nls?: string }[] = [];
    for (const r of rowsIn) {
      const stageId = stageByOrder.get(r.stage_order ?? '');
      // A blank match_code is generated from the round and number, like the form does.
      const code = (
        r.match_code ||
        suggestMatchCode(
          event.event_code,
          r.round_name,
          Number(r.round_order || 1),
          r.match_number ? Number(r.match_number) : null,
          [...created.keys()],
        )
      ).toUpperCase();
      if (!stageId) {
        out.push({
          tone: 'error',
          text: `Skipped row "${code}": unknown stage_order "${r.stage_order}".`,
        });
        continue;
      }
      if (created.has(code)) {
        out.push({ tone: 'warn', text: `${code} already exists — skipped (not overwritten).` });
        continue;
      }
      if (r.match_type && !MATCH_TYPES.includes(r.match_type as MatchType)) {
        out.push({ tone: 'error', text: `${code}: unknown match_type "${r.match_type}".` });
        continue;
      }
      try {
        await db.insert('matches', {
          event_id: event.id,
          stage_id: stageId,
          match_code: code,
          round_name: r.round_name || null,
          round_order: Number(r.round_order || 1),
          match_number: r.match_number ? Number(r.match_number) : null,
          match_type: r.match_type || 'head_to_head',
          match_date: r.match_date || null,
          start_time: r.start_time || null,
          venue_area: r.venue_area || null,
        });
        out.push({ tone: 'success', text: `Created ${code}` });
        created.set(code, 'new');
        pending.push({
          code,
          nw: r.next_winner_code,
          nws: r.next_winner_slot,
          nl: r.next_loser_code,
          nls: r.next_loser_slot,
        });
      } catch (x) {
        out.push({ tone: 'error', text: `${code}: ${friendlyError(x)}` });
      }
    }
    // Second pass: link next-match pointers now that all codes exist.
    if (pending.some((p) => p.nw || p.nl)) {
      const { data } = await supabase
        .from('matches')
        .select('id, match_code')
        .eq('event_id', event.id);
      const idOf = new Map(
        (data ?? []).map((m: { id: string; match_code: string }) => [m.match_code, m.id]),
      );
      for (const p of pending) {
        if (!p.nw && !p.nl) continue;
        try {
          await db.update('matches', idOf.get(p.code)!, {
            next_winner_match_id: p.nw ? (idOf.get(p.nw.toUpperCase()) ?? null) : null,
            next_winner_slot: p.nws || null,
            next_loser_match_id: p.nl ? (idOf.get(p.nl.toUpperCase()) ?? null) : null,
            next_loser_slot: p.nls || null,
          });
        } catch (x) {
          out.push({ tone: 'error', text: `${p.code} links: ${friendlyError(x)}` });
        }
      }
    }
    setLog(out);
  };

  const importSlots = async () => {
    const out: typeof log = [];
    const { data } = await supabase
      .from('matches')
      .select('id, match_code')
      .eq('event_id', event.id);
    const idOf = new Map(
      (data ?? []).map((m: { id: string; match_code: string }) => [m.match_code, m.id]),
    );
    const bySeed = new Map((participants.data ?? []).map((p) => [String(p.seed), p.id]));
    for (const r of parseCsv(slotCsv)) {
      const mid = idOf.get((r.match_code ?? '').toUpperCase());
      const pid = bySeed.get(r.seed ?? '');
      if (!mid || !pid || !r.slot) {
        out.push({
          tone: 'error',
          text: `Skipped ${r.match_code}/${r.slot}: unknown match code or seed "${r.seed}".`,
        });
        continue;
      }
      try {
        await db.insert('match_participants', {
          match_id: mid,
          slot: r.slot,
          participant_id: pid,
          source_type: 'seed',
        });
        out.push({ tone: 'success', text: `${r.match_code} slot ${r.slot} ← seed ${r.seed}` });
      } catch (x) {
        out.push({ tone: 'error', text: `${r.match_code}/${r.slot}: ${friendlyError(x)}` });
      }
    }
    setLog(out);
  };

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Import never overwrites existing matches. Stages must exist first (referenced by stage
        order). Times use 24-hour HH:MM. Teams are placed by their event seed. Leave match_code
        blank to generate it from the round and match number.
      </Notice>
      <Card title="1. Matches CSV">
        <TextArea
          aria-label="Matches CSV"
          className="font-mono text-sm"
          rows={8}
          value={matchCsv}
          onChange={(e) => setMatchCsv(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-600">
          Example: SOC-QF1,1,Quarterfinal,1,1,head_to_head,2026-12-08,09:00,Field 1,SOC-SF1,A,,
        </p>
        <Button className="mt-2" disabled={run.isPending} onClick={() => run.mutate(importMatches)}>
          Import matches
        </Button>
      </Card>
      <Card title="2. Match participants CSV (by seed)">
        <TextArea
          aria-label="Participants CSV"
          className="font-mono text-sm"
          rows={6}
          value={slotCsv}
          onChange={(e) => setSlotCsv(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-600">Example: SOC-QF1,A,1</p>
        <Button className="mt-2" disabled={run.isPending} onClick={() => run.mutate(importSlots)}>
          Import participants
        </Button>
      </Card>
      {log.length > 0 && (
        <Card title="Import results">
          <ul className="space-y-1 text-sm">
            {log.map((l, i) => (
              <li
                key={i}
                className={
                  l.tone === 'error'
                    ? 'text-red-800'
                    : l.tone === 'warn'
                      ? 'text-amber-800'
                      : 'text-green-800'
                }
              >
                {l.text}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
