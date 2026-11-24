import { AlertTriangle, Lock, Loader2, WifiOff, Inbox, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Notice } from './ui';
import { friendlyError } from '../lib/supabase';
import { useOnline } from '../lib/realtime';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 p-6 text-slate-700">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> <span>{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-400 bg-white p-6 text-center">
      <Inbox className="h-8 w-8 text-slate-500" aria-hidden />
      <p className="font-semibold text-slate-900">{title}</p>
      {children && <div className="text-sm text-slate-700">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Notice tone="error" title="Something went wrong">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {friendlyError(error)}
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Notice>
  );
}

export function Unauthorized({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-300 bg-white p-6 text-center">
      <Lock className="h-8 w-8 text-slate-600" aria-hidden />
      <p className="text-lg font-bold">Not authorized</p>
      <p className="text-slate-700">
        {message ??
          'Your account does not have access to this page. Contact the operations cell if you need access.'}
      </p>
    </div>
  );
}

export function NotConfigured() {
  return (
    <Notice tone="warn" title="Data connection not configured">
      <p className="flex items-start gap-2">
        <Settings className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were not set when this site was built. See
        docs/DEPLOYMENT.md.
      </p>
    </Notice>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-red-800 px-4 py-2 text-sm font-semibold text-white"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        You are offline. Results shown may be out of date. If connectivity is unavailable, complete
        the venue paper scorecard and report to the designated sport manager or operations cell.
      </span>
    </div>
  );
}

export const OFFLINE_CONTINGENCY =
  'If connectivity is unavailable, complete the venue paper scorecard and report to the designated sport manager or operations cell.';
