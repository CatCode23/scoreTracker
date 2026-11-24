import { CheckCircle2, CornerUpLeft, Flag, Ban } from 'lucide-react';
import { formatDateTime, formatSeconds, humanize } from '../lib/domain/format';
import type { MatchResult } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { ResultStatusBadge, UnofficialBadge } from './status';
import { Button, Notice } from './ui';

export type ValidationAction = 'official' | 'returned' | 'disputed' | 'void';

export function ResultValidationCard({
  result,
  title,
  teamLabel,
  submitterName,
  canValidate,
  canVoidOfficial,
  onAction,
}: {
  result: MatchResult;
  title: string;
  teamLabel: (participantId: string | null) => string;
  submitterName: string;
  canValidate: boolean;
  canVoidOfficial: boolean;
  onAction: (action: ValidationAction, reason: string | null) => Promise<unknown>;
}) {
  const confirm = useConfirm();
  const pending = result.status === 'submitted' || result.status === 'disputed';

  const ask = (action: ValidationAction) => {
    const reasonNeeded = action !== 'official';
    const cfg = {
      official: {
        title: 'Mark result Official?',
        confirmLabel: 'Mark Official',
        danger: false,
        body: 'This publishes the result to the public site immediately.',
      },
      returned: {
        title: 'Return for correction?',
        confirmLabel: 'Return for Correction',
        danger: false,
        body: 'The scorer will need to submit a new result.',
      },
      disputed: {
        title: 'Mark as disputed?',
        confirmLabel: 'Mark Disputed',
        danger: true,
        body: 'The result stays unofficial until a sport manager resolves it.',
      },
      void: {
        title: 'Void this result?',
        confirmLabel: 'Void',
        danger: true,
        body:
          result.status === 'official'
            ? 'This removes an Official result from the public site and reopens the match.'
            : 'The result will not be used.',
      },
    }[action];
    confirm.ask({ ...cfg, reasonLabel: reasonNeeded ? 'Reason (required)' : undefined }, (reason) =>
      onAction(action, reasonNeeded ? reason : null),
    );
  };

  return (
    <article
      className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm"
      aria-label={`Result for ${title}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        <span className="flex gap-1">
          {result.status !== 'official' && <UnofficialBadge />}
          <ResultStatusBadge status={result.status} />
        </span>
      </div>
      <p className="text-sm text-slate-700">
        {humanize(result.result_method)} · Submitted by <strong>{submitterName}</strong> at{' '}
        {formatDateTime(result.submitted_at)}
      </p>
      <ul className="mt-2 space-y-1">
        {result.participant_values.map((v) => (
          <li
            key={v.participant_id}
            className={`flex justify-between gap-2 rounded px-2 py-1 ${v.participant_id === result.winner_participant_id ? 'bg-green-100 font-bold' : 'bg-slate-50'}`}
          >
            <span>
              {teamLabel(v.participant_id)}
              {v.participant_id === result.winner_participant_id && ' — Winner'}
            </span>
            <span className="tabular-nums">
              {[
                v.score != null && `Score ${v.score}`,
                v.time_seconds != null && `Time ${formatSeconds(v.time_seconds)}`,
                v.penalty_seconds ? `+${v.penalty_seconds}s pen` : null,
                v.technical_score != null && `Tech ${v.technical_score}`,
                v.placement != null && `Place ${v.placement}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
        {result.participant_values.length === 0 && result.winner_participant_id && (
          <li className="rounded bg-green-100 px-2 py-1 font-bold">
            Winner: {teamLabel(result.winner_participant_id)}
          </li>
        )}
      </ul>
      <p className="mt-2 text-sm">
        Referee confirmed: <strong>{result.referee_confirmed ? 'Yes' : 'No'}</strong>
      </p>
      {result.notes && <p className="mt-1 text-sm text-slate-800">Notes: {result.notes}</p>}
      {result.status_reason && (
        <p className="mt-1 text-sm text-slate-800">Reason: {result.status_reason}</p>
      )}
      {!result.referee_confirmed && pending && (
        <Notice tone="warn" className="mt-2">
          Referee confirmation is missing; this result cannot be marked Official.
        </Notice>
      )}

      {canValidate && pending && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="success"
            onClick={() => ask('official')}
            disabled={!result.referee_confirmed}
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Mark Official
          </Button>
          <Button variant="secondary" onClick={() => ask('returned')}>
            <CornerUpLeft className="h-5 w-5" aria-hidden /> Return for Correction
          </Button>
          {result.status !== 'disputed' && (
            <Button variant="secondary" onClick={() => ask('disputed')}>
              <Flag className="h-5 w-5" aria-hidden /> Mark Disputed
            </Button>
          )}
          <Button variant="danger" onClick={() => ask('void')}>
            <Ban className="h-5 w-5" aria-hidden /> Void
          </Button>
        </div>
      )}
      {canVoidOfficial && result.status === 'official' && (
        <div className="mt-3">
          <Button variant="danger" onClick={() => ask('void')}>
            <Ban className="h-5 w-5" aria-hidden /> Void Official result
          </Button>
        </div>
      )}
      {confirm.dialog}
    </article>
  );
}
