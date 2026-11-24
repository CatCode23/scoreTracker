import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
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
} from './lib/domain/permissions';
import type { Access } from './lib/domain/permissions';
import { Empty, Loading } from './components/states';

// Operations pages are code-split so public visitors on phones download less.
const Dashboard = lazy(() =>
  import('./pages/ops/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const MyAssignments = lazy(() =>
  import('./pages/ops/MyAssignments').then((m) => ({ default: m.MyAssignments })),
);
const ScoreEntry = lazy(() =>
  import('./pages/ops/ScoreEntry').then((m) => ({ default: m.ScoreEntry })),
);
const Validation = lazy(() =>
  import('./pages/ops/Validation').then((m) => ({ default: m.Validation })),
);
const MatchManagement = lazy(() =>
  import('./pages/ops/MatchManagement').then((m) => ({ default: m.MatchManagement })),
);
const MatchSetup = lazy(() =>
  import('./pages/ops/MatchSetup').then((m) => ({ default: m.MatchSetup })),
);
const Placements = lazy(() =>
  import('./pages/ops/Placements').then((m) => ({ default: m.Placements })),
);
const Teams = lazy(() => import('./pages/ops/Teams').then((m) => ({ default: m.Teams })));
const EventRegistration = lazy(() =>
  import('./pages/ops/EventRegistration').then((m) => ({ default: m.EventRegistration })),
);
const Roster = lazy(() => import('./pages/ops/Roster').then((m) => ({ default: m.Roster })));
const Users = lazy(() => import('./pages/ops/Users').then((m) => ({ default: m.Users })));
const Settings = lazy(() => import('./pages/ops/Settings').then((m) => ({ default: m.Settings })));
const ChangePassword = lazy(() =>
  import('./pages/ops/ChangePassword').then((m) => ({ default: m.ChangePassword })),
);
const AuditLog = lazy(() => import('./pages/ops/AuditLog').then((m) => ({ default: m.AuditLog })));

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
          <Route index element={guard(<Dashboard />)} />
          <Route
            path="password"
            element={
              <RequireAccess allowInactive>
                <Suspense fallback={<Loading />}>
                  <ChangePassword />
                </Suspense>
              </RequireAccess>
            }
          />
          <Route path="assignments" element={guard(<MyAssignments />)} />
          <Route path="score" element={guard(<ScoreEntry />, canSubmitAnything)} />
          <Route
            path="validate"
            element={guard(<Validation />, (a) => canValidateAnything(a) || hasGlobalRead(a))}
          />
          <Route
            path="matches"
            element={guard(<MatchManagement />, (a) => canManageAnything(a) || hasGlobalRead(a))}
          />
          <Route path="setup" element={guard(<MatchSetup />, canManageAnything)} />
          <Route
            path="placements"
            element={guard(<Placements />, (a) => canManageAnything(a) || hasGlobalRead(a))}
          />
          <Route path="teams" element={guard(<Teams />, canRegisterTeams)} />
          <Route path="registration" element={guard(<EventRegistration />, canManageAnything)} />
          <Route path="roster" element={guard(<Roster />)} />
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
