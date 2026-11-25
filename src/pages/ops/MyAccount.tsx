import { useAuth } from '../../lib/auth';
import { useEvents } from '../../lib/api/ops';
import { ROLE_LABELS } from '../../lib/types';
import { Card, Notice, PageHeader } from '../../components/ui';
import { isOpsAdmin } from '../../lib/domain/permissions';
import { displayLogin } from '../../lib/username';
import { ChangePassword } from './ChangePassword';

/** Your username, role and assignments, and changing your password. */
export function MyAccount() {
  const auth = useAuth();
  const active = Boolean(auth.profile?.active);
  const events = useEvents();
  const name = (id: string | null) =>
    id ? (events.data?.find((e) => e.id === id)?.event_name ?? 'Unknown event') : 'All events';

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader
        title="My Account"
        subtitle={[auth.profile?.display_name, displayLogin(auth.session?.user.email)]
          .filter(Boolean)
          .join(' · ')}
      />
      <Card title="Role and assignments">
        {!active ? (
          <Notice tone="warn" title="Not activated yet">
            An operations admin needs to activate your account. Give them your username:{' '}
            <strong>{displayLogin(auth.session?.user.email)}</strong>.
          </Notice>
        ) : (
          <>
            <p>
              Role: <strong>{auth.profile ? ROLE_LABELS[auth.profile.role] : '—'}</strong>
            </p>
            {isOpsAdmin(auth) ? (
              <p className="mt-1 text-sm text-slate-700">Full access to every event.</p>
            ) : auth.assignments.length === 0 ? (
              <p className="mt-1 text-sm text-slate-700">
                No event assignments yet. Ask the operations cell to assign you to an event.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {auth.assignments.map((a) => (
                  <li key={a.id} className="rounded bg-slate-50 px-2 py-2 text-sm">
                    <strong>{ROLE_LABELS[a.assignment_role]}</strong> · {name(a.event_id)} ·{' '}
                    {a.venue ?? 'All venues'}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      <ChangePassword />
    </div>
  );
}
