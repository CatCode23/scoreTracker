import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import type { Access } from '../../lib/domain/permissions';
import { ErrorState, Loading, Unauthorized } from '../../components/states';
import { Card, Notice } from '../../components/ui';

/** Route guard for operations pages. UI only: the database enforces access via RLS. */
export function RequireAccess({
  check,
  allowInactive,
  children,
}: {
  check?: (a: Access) => boolean;
  /** Signed-in but not-yet-activated users may still open this page (e.g. change password). */
  allowInactive?: boolean;
  children: ReactNode;
}) {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.loading) return <Loading label="Checking your access…" />;
  if (!auth.session) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  if (allowInactive) return <>{children}</>;
  if (auth.profileError) {
    return (
      <Card>
        <p className="mb-2 font-bold">Could not load your staff profile</p>
        <ErrorState error={auth.profileError} onRetry={auth.refresh} />
      </Card>
    );
  }
  if (!auth.profile || !auth.profile.active) {
    return (
      <Card>
        <Notice tone="warn" title="Account pending activation">
          You are signed in as <strong>{auth.session.user.email}</strong>, but an operations admin
          has not activated your account or assigned you a role yet. Give them this email address.
        </Notice>
      </Card>
    );
  }
  if (check && !check(auth)) return <Unauthorized />;
  return <>{children}</>;
}
