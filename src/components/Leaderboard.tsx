import { Medal } from 'lucide-react';
import type { LeaderboardRow } from '../lib/types';
import { Empty } from './states';
import { cx } from './ui';

const medal = ['text-yellow-600', 'text-slate-500', 'text-amber-800'];

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty title="No official placements yet">
        The Commander's Cup standings appear once event placements are published.
      </Empty>
    );
  }
  return (
    <ol className="space-y-2" aria-label="Overall unit leaderboard">
      {rows.map((r) => (
        <li
          key={r.unit}
          className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-3"
        >
          <span className="flex w-10 shrink-0 items-center justify-center text-xl font-extrabold tabular-nums">
            {r.rank <= 3 ? (
              <Medal className={cx('h-7 w-7', medal[r.rank - 1])} aria-label={`Rank ${r.rank}`} />
            ) : (
              r.rank
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{r.unit}</span>
            <span className="block text-sm text-slate-700">
              {r.events_placed} event placing{r.events_placed === 1 ? '' : 's'}
              {r.firsts > 0 && ` · ${r.firsts}× 1st`}
              {r.adjustment_points !== 0 &&
                ` · adjustments ${r.adjustment_points > 0 ? '+' : ''}${r.adjustment_points}`}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-2xl font-extrabold tabular-nums">
              {Number(r.total_points)}
            </span>
            <span className="block text-xs text-slate-600">pts</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
