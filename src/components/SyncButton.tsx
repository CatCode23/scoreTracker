import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button, cx } from './ui';

/** Prominent manual refresh for field users. */
export function SyncButton({ scope = 'all', className }: { scope?: 'public' | 'ops' | 'all'; className?: string }) {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [last, setLast] = useState<Date | null>(null);
  return (
    <Button
      variant="secondary"
      className={cx('border-2 border-brand', className)}
      onClick={async () => {
        await qc.invalidateQueries(scope === 'all' ? undefined : { queryKey: [scope] });
        setLast(new Date());
      }}
      aria-label="Sync and refresh data"
    >
      <RefreshCw className={cx('h-5 w-5', fetching && 'animate-spin')} aria-hidden />
      <span>Sync / Refresh</span>
      {last && !fetching && (
        <span className="hidden text-xs font-normal text-slate-600 sm:inline">
          {last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
      )}
    </Button>
  );
}
