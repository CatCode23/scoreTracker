import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { db, useAdjustments, useEvents, useOpsMutation, useParticipants, usePlacements, usePointsMatrix, useSettings } from '../../lib/api/ops';
import { canManageEvent, hasGlobalRead, isOpsAdmin } from '../../lib/domain/permissions';
import { pointsForPlace } from '../../lib/domain/points';
import { formatDateTime, ordinal } from '../../lib/domain/format';
import { friendlyError } from '../../lib/supabase';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading, Unauthorized } from '../../components/states';
import { useConfirm } from '../../components/ConfirmDialog';

export function Placements() {
  const auth = useAuth();
  const events = useEvents();
  const [eventId, setEventId] = useState('');
  const participants = useParticipants(eventId || undefined);
  const placements = usePlacements(eventId || undefined);
  const adjustments = useAdjustments(eventId || undefined);
  const matrix = usePointsMatrix();
  const settings = useSettings();
  const confirm = useConfirm();
  const [place, setPlace] = useState('');
  const [pid, setPid] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = useOpsMutation(() => db.insert('event_placements', { event_id: eventId, participant_id: pid, final_place: Number(place), ranking_method: 'manual' }));
  const remove = useOpsMutation((id: string) => db.remove('event_placements', id));
  const approve = useOpsMutation((publish: boolean) => db.rpc('approve_event_placements', { p_event_id: eventId, p_publish: publish }));
  const unpublish = useOpsMutation(async (ids: string[]) => {
    for (const id of ids) await db.update('event_placements', id, { public_visible: false });
  });
  const penalty = useOpsMutation(({ participantId, reason }: { participantId: string; reason: string }) =>
    db.rpc('apply_no_show_penalty', { p_participant_id: participantId, p_reason: reason }),
  );
  const toggleAdj = useOpsMutation(({ id, active }: { id: string; active: boolean }) => db.update('point_adjustments', id, { active }));

  if (events.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} />;
  const visible = (events.data ?? []).filter((e) => canManageEvent(auth, e.id) || hasGlobalRead(auth));
  if (visible.length === 0) return <Unauthorized />;
  const event = visible.find((e) => e.id === eventId);
  const canEdit = event ? canManageEvent(auth, event.id) : false;
  const admin = isOpsAdmin(auth);
  const list = placements.data ?? [];
  const team = (id: string) => {
    const p = participants.data?.find((x) => x.id === id);
    return p ? `${p.teams?.team_name} (${p.teams?.unit})` : 'Team';
  };
  const placed = new Set(list.map((p) => p.participant_id));
  const penaltySetting = settings.data?.find((s) => s.setting_key === 'no_show_penalty');
  const allApproved = list.length > 0 && list.every((p) => p.approved_at);
  const allPublic = list.length > 0 && list.every((p) => p.public_visible);
  const preview = place ? pointsForPlace(Number(place), matrix.data) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Event Placements" subtitle="Record 1st–8th. Points come from the scoring matrix. Admin approval publishes them." />
      <Card>
        <Field label="Event" htmlFor="pl-event">
          <Select id="pl-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Select an event…</option>
            {visible.map((e) => (
              <option key={e.id} value={e.id}>
                {e.event_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {event && (
        <>
          {!event.counts_toward_overall && <Notice tone="warn">This event does not count toward the overall Commander's Cup.</Notice>}
          <Card
            title="Placements"
            actions={
              <span className="flex gap-1">
                {allPublic ? <Badge className="bg-green-700 text-white">Published</Badge> : allApproved ? <Badge className="bg-sky-200">Approved, not public</Badge> : list.length > 0 && <Badge className="bg-amber-300">Pending approval</Badge>}
              </span>
            }
          >
            {placements.isLoading ? (
              <Loading />
            ) : list.length === 0 ? (
              <Empty title="No placements entered" />
            ) : (
              <ol className="space-y-2">
                {list.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 p-3">
                    <span className="w-12 text-xl font-extrabold">{ordinal(p.final_place)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{team(p.participant_id)}</span>
                      <span className="text-sm text-slate-700">
                        {Number(p.overall_points)} pts{p.points_override && ' (admin override)'} ·{' '}
                        {p.public_visible ? 'Public' : p.approved_at ? `Approved ${formatDateTime(p.approved_at)}` : 'Not approved'}
                      </span>
                    </span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        className="text-red-700"
                        onClick={() => confirm.ask({ title: `Remove ${ordinal(p.final_place)} place entry?`, danger: true, confirmLabel: 'Remove' }, () => remove.mutateAsync(p.id))}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <form
                className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setErr(null);
                  const n = Number(place);
                  if (!Number.isInteger(n) || n < 1) return setErr('Place must be a whole number of 1 or more.');
                  if (!pid) return setErr('Select a team.');
                  try {
                    await save.mutateAsync(undefined);
                    setPlace('');
                    setPid('');
                  } catch (x) {
                    setErr(friendlyError(x));
                  }
                }}
              >
                <Field label="Place" htmlFor="pl-place" hint={preview != null ? `${preview} pts` : undefined}>
                  <Input id="pl-place" inputMode="numeric" value={place} onChange={(e) => setPlace(e.target.value)} />
                </Field>
                <Field label="Team" htmlFor="pl-team">
                  <Select id="pl-team" value={pid} onChange={(e) => setPid(e.target.value)}>
                    <option value="">Select…</option>
                    {(participants.data ?? [])
                      .filter((p) => !placed.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.teams?.team_name} ({p.teams?.unit})
                        </option>
                      ))}
                  </Select>
                </Field>
                <Button type="submit">Add placement</Button>
              </form>
            )}
            {err && <Notice tone="error" className="mt-2">{err}</Notice>}
            <p className="mt-3 text-sm text-slate-700">Changing an approved placement automatically withdraws approval and removes it from public view.</p>
            {admin && list.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                <Button
                  variant="success"
                  onClick={() =>
                    confirm.ask(
                      { title: `Approve and publish ${event.event_name} placements?`, body: 'Placements and points appear on the public site and leaderboard immediately.', confirmLabel: 'Approve & Publish' },
                      () => approve.mutateAsync(true).then(() => undefined),
                    )
                  }
                >
                  Approve & Publish
                </Button>
                {!allApproved && (
                  <Button variant="secondary" onClick={() => confirm.ask({ title: 'Approve without publishing?', confirmLabel: 'Approve' }, () => approve.mutateAsync(false).then(() => undefined))}>
                    Approve only
                  </Button>
                )}
                {list.some((p) => p.public_visible) && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      confirm.ask({ title: 'Unpublish placements?', danger: true, confirmLabel: 'Unpublish' }, () =>
                        unpublish.mutateAsync(list.filter((p) => p.public_visible).map((p) => p.id)),
                      )
                    }
                  >
                    Unpublish
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card title="No-show / failure-to-field penalty">
            <p className="text-sm text-slate-700">
              Current setting:{' '}
              <strong>{penaltySetting?.enabled ? `${penaltySetting.numeric_value} points` : 'Disabled'}</strong>. Penalties are never automatic; each requires
              confirmation and a reason.
            </p>
            {(adjustments.data ?? []).length > 0 && (
              <ul className="mt-3 space-y-2">
                {(adjustments.data ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-300 p-2">
                    <span>
                      <span className="block font-semibold">
                        {team(a.participant_id)}: {Number(a.points)} pts {!a.active && '(inactive)'}
                      </span>
                      <span className="text-sm text-slate-700">
                        {a.reason} · {formatDateTime(a.applied_at)}
                      </span>
                    </span>
                    {canEdit && (
                      <Button variant="ghost" onClick={() => toggleAdj.mutate({ id: a.id, active: !a.active })}>
                        {a.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && penaltySetting?.enabled && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {(participants.data ?? [])
                  .filter((p) => !(adjustments.data ?? []).some((a) => a.participant_id === p.id && a.active && a.adjustment_type === 'no_show_penalty'))
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
                      <span className="text-sm font-semibold">{p.teams?.team_name}</span>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          confirm.ask(
                            {
                              title: `Apply ${penaltySetting.numeric_value} point no-show penalty to ${p.teams?.team_name}?`,
                              body: 'This marks the team No Show and deducts points from the overall standings.',
                              danger: true,
                              reasonLabel: 'Reason (required)',
                              confirmLabel: 'Apply penalty',
                            },
                            (reason) => penalty.mutateAsync({ participantId: p.id, reason }).then(() => undefined),
                          )
                        }
                      >
                        Apply penalty
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
      {confirm.dialog}
    </div>
  );
}
