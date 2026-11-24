import { useAuth } from '../../lib/auth';
import { useEvents } from '../../lib/api/ops';
import { ROLE_LABELS } from '../../lib/types';
import { Card, PageHeader } from '../../components/ui';
import { Empty, Loading } from '../../components/states';
import { isOpsAdmin } from '../../lib/domain/permissions';

export function MyAssignments() {
  const auth = useAuth();
  const events = useEvents();
  const name = (id: string | null) =>
    id ? (events.data?.find((e) => e.id === id)?.event_name ?? 'Unknown event') : 'All events';
  return (
    <div className="space-y-4">
      <PageHeader
        title="My Assignments"
        subtitle={`${auth.profile?.display_name ?? ''} · ${auth.profile?.email ?? ''}`}
      />
      <Card title="Account">
        <p>
          Primary role: <strong>{auth.profile ? ROLE_LABELS[auth.profile.role] : '—'}</strong>
        </p>
        {isOpsAdmin(auth) && (
          <p className="text-sm text-slate-700">Operations admins have full operational access.</p>
        )}
      </Card>
      <Card title="Event / venue assignments">
        {events.isLoading ? (
          <Loading />
        ) : auth.assignments.length === 0 ? (
          <Empty title="No assignments">
            Ask the operations cell to assign you to an event and venue.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {auth.assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-300 p-3">
                <p className="font-bold">{ROLE_LABELS[a.assignment_role]}</p>
                <p className="text-slate-700">
                  {name(a.event_id)} · {a.venue ?? 'All venues'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
