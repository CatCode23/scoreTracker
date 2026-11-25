import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { db, useAllAssignments, useEvents, useOpsMutation, useProfiles } from '../../lib/api/ops';
import { ROLES, ROLE_LABELS, type Role } from '../../lib/types';
import { friendlyError } from '../../lib/supabase';
import { Badge, Button, Card, Input, Notice, PageHeader, Select } from '../../components/ui';
import { Empty, ErrorState, Loading } from '../../components/states';
import { useConfirm } from '../../components/ConfirmDialog';
import { displayLogin, USERNAME_DOMAIN } from '../../lib/username';

export function Users() {
  const auth = useAuth();
  const profiles = useProfiles(true);
  const assignments = useAllAssignments(true);
  const events = useEvents();
  const [q, setQ] = useState('');
  const confirm = useConfirm();
  const upd = useOpsMutation(({ id, values }: { id: string; values: object }) =>
    db.update('profiles', id, values),
  );
  const addA = useOpsMutation((values: object) => db.insert('user_assignments', values));
  const delA = useOpsMutation((id: string) => db.remove('user_assignments', id));
  const err = upd.error ?? addA.error ?? delA.error;

  if (profiles.isLoading || assignments.isLoading) return <Loading />;
  if (profiles.error) return <ErrorState error={profiles.error} />;
  const list = (profiles.data ?? []).filter((p) =>
    `${p.display_name} ${p.email}`.toLowerCase().includes(q.toLowerCase()),
  );
  const evName = (id: string | null) =>
    id ? (events.data?.find((e) => e.id === id)?.event_name ?? '?') : 'All events';
  const venues = [...new Set((events.data ?? []).map((e) => e.venue).filter(Boolean))] as string[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & Assignments"
        subtitle="Activate staff, set roles, and assign events/venues."
      />
      <Notice tone="info" title="Adding a staff member">
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Supabase: Authentication → Users → Add user → <strong>Create new user</strong>. For the
            email, use their real address, or a username in the form{' '}
            <strong>jsmith@{USERNAME_DOMAIN}</strong>. Set a temporary password and tick{' '}
            <strong>Auto Confirm User</strong>.
          </li>
          <li>
            Here: <strong>Activate</strong> them and set their role. Scorers, venue leads and sport
            managers also need an event assignment.
          </li>
          <li>
            Give them their username (e.g. <strong>jsmith</strong>) and password directly. They
            change the password under <strong>My Account</strong>.
          </li>
        </ol>
        <p className="mt-2">
          To reset a forgotten password, set a new one on the user in Supabase.
        </p>
      </Notice>
      {err && <Notice tone="error">{friendlyError(err)}</Notice>}
      <Input
        aria-label="Search users"
        placeholder="Search name or username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 ? (
        <Empty title="No users" />
      ) : (
        <ul className="space-y-3">
          {list.map((p) => {
            const mine = (assignments.data ?? []).filter((a) => a.profile_id === p.id);
            const self = p.id === auth.session?.user.id;
            return (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="block font-bold">
                        {p.display_name || '(no name)'}{' '}
                        {self && <span className="text-sm font-normal">(you)</span>}
                      </span>
                      <span className="text-sm text-slate-700">{displayLogin(p.email)}</span>
                    </span>
                    {p.active ? (
                      <Badge className="bg-field text-white">Active</Badge>
                    ) : (
                      <Badge className="bg-amber-300">Inactive</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      aria-label="Display name"
                      defaultValue={p.display_name ?? ''}
                      onBlur={(e) =>
                        e.target.value.trim() !== (p.display_name ?? '') &&
                        upd.mutate({ id: p.id, values: { display_name: e.target.value.trim() } })
                      }
                    />
                    <Select
                      aria-label="Primary role"
                      value={p.role}
                      disabled={self}
                      onChange={(e) => {
                        const role = e.target.value as Role;
                        confirm.ask(
                          {
                            title: `Change ${displayLogin(p.email)} to ${ROLE_LABELS[role]}?`,
                            confirmLabel: 'Change role',
                          },
                          () => upd.mutateAsync({ id: p.id, values: { role } }),
                        );
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant={p.active ? 'danger' : 'success'}
                      disabled={self}
                      onClick={() =>
                        confirm.ask(
                          {
                            title: `${p.active ? 'Deactivate' : 'Activate'} ${displayLogin(p.email)}?`,
                            danger: p.active,
                            confirmLabel: p.active ? 'Deactivate' : 'Activate',
                          },
                          () => upd.mutateAsync({ id: p.id, values: { active: !p.active } }),
                        )
                      }
                    >
                      {p.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-semibold">Assignments</p>
                    {mine.length === 0 && <p className="text-sm text-slate-600">None</p>}
                    <ul className="mt-1 space-y-1">
                      {mine.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm"
                        >
                          <span>
                            <strong>{ROLE_LABELS[a.assignment_role]}</strong> · {evName(a.event_id)}{' '}
                            · {a.venue ?? 'All venues'}
                          </span>
                          <Button
                            variant="ghost"
                            className="min-h-[36px] text-red-700"
                            onClick={() =>
                              confirm.ask(
                                {
                                  title: 'Remove assignment?',
                                  danger: true,
                                  confirmLabel: 'Remove',
                                },
                                () => delA.mutateAsync(a.id),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="mt-2 grid gap-2 sm:grid-cols-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        addA.mutate({
                          profile_id: p.id,
                          assignment_role: fd.get('role'),
                          event_id: fd.get('event') || null,
                          venue: String(fd.get('venue') ?? '').trim() || null,
                        });
                        e.currentTarget.reset();
                      }}
                    >
                      <Select name="role" aria-label="Assignment role" defaultValue="scorer">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                      <Select name="event" aria-label="Event">
                        <option value="">All events</option>
                        {(events.data ?? []).map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.event_name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        name="venue"
                        aria-label="Venue (blank = all)"
                        placeholder="Venue (blank = all)"
                        list="venue-list"
                      />
                      <Button type="submit" variant="secondary">
                        Add assignment
                      </Button>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <datalist id="venue-list">
        {venues.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      {confirm.dialog}
    </div>
  );
}
