import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LogIn, LogOut, Menu, X } from 'lucide-react';
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
  isFieldOnly,
} from '../lib/domain/permissions';
import { OfflineBanner } from './states';
import { cx } from './ui';
import { useOpsRealtime } from '../lib/realtime';
import { usePendingApprovalCount } from '../lib/api/ops';

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
  // The Approvals page only appears when Scorer-account results are waiting.
  const pending = usePendingApprovalCount(canValidateAnything(auth));
  const pendingCount = pending.data ?? 0;

  const fieldOnly = isFieldOnly(auth);
  // Grouped by when you use them. Empty groups are hidden, so field staff (scorers,
  // venue leads) only see Matches and My Account.
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Event day',
      items: [
        {
          to: '/ops/matches',
          label: 'Matches',
          show: canSubmitAnything(auth) || canManageAnything(auth) || hasGlobalRead(auth),
        },
        {
          to: '/ops/validate',
          label: `Approvals (${pendingCount})`,
          show: canValidateAnything(auth) && pendingCount > 0,
        },
        {
          to: '/ops/placements',
          label: 'Placements',
          show: canManageAnything(auth) || hasGlobalRead(auth),
        },
        { to: '/ops', label: 'Dashboard', show: active && !fieldOnly },
      ],
    },
    {
      title: 'Setup',
      items: [
        { to: '/ops/setup', label: 'Match Setup', show: canManageAnything(auth) },
        { to: '/ops/teams', label: 'Teams', show: canRegisterTeams(auth) },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: '/ops/users', label: 'Users', show: isOpsAdmin(auth) },
        { to: '/ops/settings', label: 'Settings', show: isOpsAdmin(auth) },
        { to: '/ops/audit', label: 'Audit Log', show: isOpsAdmin(auth) },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/ops/account', label: 'My Account', show: Boolean(auth.session) },
        { to: '/public', label: 'Public view', show: true },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((n) => n.show) }))
    .filter((g) => g.items.length > 0);
  const ops = groups.flatMap((g) => g.items);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <header
        className="sticky top-0 z-40 border-b-4 border-brand bg-ink text-white shadow"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
          <Link to="/public" className="flex min-h-touch min-w-0 items-center gap-2 font-extrabold">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              className="h-10 w-10 shrink-0"
              width={40}
              height={40}
            />
            <span className="truncate text-base leading-tight sm:text-lg">{env.appName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {auth.session ? (
              <>
                {ops.length > 0 && (
                  <button
                    type="button"
                    className="flex min-h-touch min-w-touch items-center justify-center rounded-lg hover:bg-ink-soft"
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
                  className="flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm font-semibold hover:bg-ink-soft"
                >
                  <LogOut className="h-5 w-5" aria-hidden />{' '}
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                className="flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm font-semibold hover:bg-ink-soft"
              >
                <LogIn className="h-5 w-5" aria-hidden />{' '}
                <span className="whitespace-nowrap">Staff sign in</span>
              </Link>
            )}
          </div>
        </div>
        {auth.session && open && ops.length > 0 && (
          <nav id="ops-nav" aria-label="Operations" className="border-t border-ink-soft bg-ink">
            <div className="mx-auto max-w-6xl space-y-2 p-2">
              {groups.map((g) => (
                <div key={g.title}>
                  <p className="px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-steel">
                    {g.title}
                  </p>
                  <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {g.items.map((n) => (
                      <li key={n.to}>
                        <NavLink
                          to={n.to}
                          end={n.to === '/ops' || n.to === '/public'}
                          className={({ isActive: a }) =>
                            cx(
                              'flex min-h-touch items-center rounded-lg px-3 font-semibold hover:bg-ink-soft',
                              a && 'bg-ink-soft ring-2 ring-brand',
                            )
                          }
                        >
                          {n.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
