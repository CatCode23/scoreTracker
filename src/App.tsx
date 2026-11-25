import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { PublicHome } from './pages/public/PublicHome';
import { SportDetail } from './pages/public/SportDetail';
import { SignIn } from './pages/ops/SignIn';
import { RequireAccess } from './pages/ops/RequireAccess';
import {
  canManageAnything,
  canRegisterTeams,
  canSubmitAnything,
  canValidateAnything,
  hasGlobalRead,
  isOpsAdmin,
  isFieldOnly,
} from './lib/domain/permissions';
import type { Access } from './lib/domain/permissions';
import { Empty, Loading } from './components/states';

// Operations pages are code-split so public visitors on phones download less.
const Dashboard = lazy(() =>
  import('./pages/ops/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Validation = lazy(() =>
  import('./pages/ops/Validation').then((m) => ({ default: m.Validation })),
);
const Matches = lazy(() => import('./pages/ops/Matches').then((m) => ({ default: m.Matches })));
const MatchSetup = lazy(() =>
  import('./pages/ops/MatchSetup').then((m) => ({ default: m.MatchSetup })),
);
const Placements = lazy(() =>
  import('./pages/ops/Placements').then((m) => ({ default: m.Placements })),
);
const Teams = lazy(() => import('./pages/ops/Teams').then((m) => ({ default: m.Teams })));
const Users = lazy(() => import('./pages/ops/Users').then((m) => ({ default: m.Users })));
const Settings = lazy(() => import('./pages/ops/Settings').then((m) => ({ default: m.Settings })));
const MyAccount = lazy(() =>
  import('./pages/ops/MyAccount').then((m) => ({ default: m.MyAccount })),
);
const AuditLog = lazy(() => import('./pages/ops/AuditLog').then((m) => ({ default: m.AuditLog })));

/** Staff home: field-only users (scorers, venue leads) go straight to Matches. */
function OpsHome() {
  const auth = useAuth();
  return isFieldOnly(auth) ? <Navigate to="/ops/matches" replace /> : <Dashboard />;
}

const guard = (el: JSX.Element, check?: (a: Access) => boolean) => (
  <RequireAccess check={check}>
    <Suspense fallback={<Loading />}>{el}</Suspense>
  </RequireAccess>
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/public" replace />} />
        <Route path="public" element={<PublicHome />} />
        <Route path="sport/:code" element={<SportDetail />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="ops">
          <Route index element={guard(<OpsHome />)} />
          <Route
            path="account"
            element={
              <RequireAccess allowInactive>
                <Suspense fallback={<Loading />}>
                  <MyAccount />
                </Suspense>
              </RequireAccess>
            }
          />
          <Route path="password" element={<Navigate to="/ops/account" replace />} />
          <Route path="assignments" element={<Navigate to="/ops/account" replace />} />
          <Route path="score" element={<Navigate to="/ops/matches" replace />} />
          <Route
            path="validate"
            element={guard(<Validation />, (a) => canValidateAnything(a) || hasGlobalRead(a))}
          />
          <Route
            path="matches"
            element={guard(
              <Matches />,
              (a) => canSubmitAnything(a) || canManageAnything(a) || hasGlobalRead(a),
            )}
          />
          <Route path="setup" element={guard(<MatchSetup />, canManageAnything)} />
          <Route
            path="placements"
            element={guard(<Placements />, (a) => canManageAnything(a) || hasGlobalRead(a))}
          />
          <Route path="teams" element={guard(<Teams />, canRegisterTeams)} />
          <Route path="users" element={guard(<Users />, isOpsAdmin)} />
          <Route path="settings" element={guard(<Settings />, isOpsAdmin)} />
          <Route path="audit" element={guard(<AuditLog />, isOpsAdmin)} />
        </Route>
        <Route path="*" element={<Empty title="Page not found" />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
