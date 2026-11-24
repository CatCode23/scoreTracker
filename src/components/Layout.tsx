import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LogIn, LogOut, Trophy, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';
import {
  canManageAnything,
  canRegisterTeams,
  canSubmitAnything,
  canValidateAnything,
  hasGlobalRead,
  isActive,
  isOpsAdmin,
} from '../lib/domain/permissions';
import { OfflineBanner } from './states';
import { cx } from './ui';
import { useOpsRealtime } from '../lib/realtime';

interface NavItem {
  to: string;
  label: string;
  show: boolean;
}

export function Layout() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const active = isActive(auth);
  useOpsRealtime(active);

  const ops: NavItem[] = [
    { to: '/ops', label: 'Dashboard', show: active },
    { to: '/ops/assignments', label: 'My Assignments', show: active },
    { to: '/ops/score', label: 'Score Entry', show: canSubmitAnything(auth) },
    {
      to: '/ops/validate',
      label: 'Validation',
      show: canValidateAnything(auth) || hasGlobalRead(auth),
    },
    {
      to: '/ops/matches',
      label: 'Match Management',
      show: canManageAnything(auth) || hasGlobalRead(auth),
    },
    { to: '/ops/setup', label: 'Match Setup', show: canManageAnything(auth) },
    {
      to: '/ops/placements',
      label: 'Placements',
      show: canManageAnything(auth) || hasGlobalRead(auth),
    },
    { to: '/ops/teams', label: 'Teams', show: canRegisterTeams(auth) },
    { to: '/ops/registration', label: 'Event Registration', show: canManageAnything(auth) },
    { to: '/ops/roster', label: 'Roster Review', show: active },
    { to: '/ops/users', label: 'Users', show: isOpsAdmin(auth) },
    { to: '/ops/settings', label: 'Settings', show: isOpsAdmin(auth) },
    { to: '/ops/audit', label: 'Audit Log', show: isOpsAdmin(auth) },
    { to: '/ops/password', label: 'Change Password', show: Boolean(auth.session) },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <header
        className="sticky top-0 z-40 bg-brand text-white shadow"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
          <Link to="/public" className="flex min-h-touch min-w-0 items-center gap-2 font-extrabold">
            <Trophy className="h-6 w-6 text-brand-accent" aria-hidden />
            <span className="truncate text-base leading-tight sm:text-lg">{env.appName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {auth.session ? (
              <>
                {ops.length > 0 && (
                  <button
                    type="button"
                    className="flex min-h-touch min-w-touch items-center justify-center rounded-lg hover:bg-brand-light"
                    aria-expanded={open}
                    aria-controls="ops-nav"
                    onClick={() => setOpen((v) => !v)}
                  >
                    {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    <span className="sr-only">Operations menu</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm font-semibold hover:bg-brand-light"
                >
                  <LogOut className="h-5 w-5" aria-hidden />{' '}
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                className="flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm font-semibold hover:bg-brand-light"
              >
                <LogIn className="h-5 w-5" aria-hidden />{' '}
                <span className="whitespace-nowrap">Staff sign in</span>
              </Link>
            )}
          </div>
        </div>
        {auth.session && open && ops.length > 0 && (
          <nav
            id="ops-nav"
            aria-label="Operations"
            className="border-t border-brand-light bg-brand"
          >
            <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-1 p-2 sm:grid-cols-4">
              <li>
                <NavLink
                  to="/public"
                  className="flex min-h-touch items-center rounded-lg px-3 font-semibold hover:bg-brand-light"
                >
                  Public view
                </NavLink>
              </li>
              {ops.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.to === '/ops'}
                    className={({ isActive: a }) =>
                      cx(
                        'flex min-h-touch items-center rounded-lg px-3 font-semibold hover:bg-brand-light',
                        a && 'bg-brand-light ring-2 ring-brand-accent',
                      )
                    }
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>
      <footer className="border-t border-slate-300 bg-white px-4 py-4 text-center text-xs text-slate-700">
        Official results only on public pages. QR codes are navigation aids only and never grant
        access.
      </footer>
    </div>
  );
}
