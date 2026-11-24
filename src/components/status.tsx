import { Badge, cx } from './ui';
import type { MatchStatus, PublicStatus, ResultStatus } from '../lib/types';

export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting Approval',
  official: 'Official',
  returned: 'Returned for Correction',
  disputed: 'Disputed',
  void: 'Void',
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  planned: 'Scheduled',
  ready: 'Ready',
  in_progress: 'In Progress',
  submitted: 'Awaiting Approval',
  official: 'Official',
  complete: 'Complete',
  delayed: 'Delayed',
  void: 'Void',
};

export const PUBLIC_STATUS_LABEL: Record<PublicStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  official: 'Official',
  delayed: 'Delayed',
  void: 'Void',
};

const color: Record<string, string> = {
  official: 'bg-field text-white',
  complete: 'bg-field-light text-white',
  submitted: 'bg-amber-300 text-amber-950',
  awaiting: 'bg-amber-300 text-amber-950',
  returned: 'bg-orange-200 text-orange-950',
  disputed: 'bg-red-700 text-white',
  void: 'bg-slate-700 text-white',
  delayed: 'bg-orange-600 text-white',
  in_progress: 'bg-blue-700 text-white',
  ready: 'bg-sky-200 text-sky-950',
  planned: 'bg-slate-200 text-slate-900',
  scheduled: 'bg-slate-200 text-slate-900',
  draft: 'bg-slate-200 text-slate-900',
};

export function ResultStatusBadge({ status }: { status: ResultStatus }) {
  return <Badge className={color[status]}>{RESULT_STATUS_LABEL[status]}</Badge>;
}
export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return <Badge className={color[status]}>{MATCH_STATUS_LABEL[status]}</Badge>;
}
export function PublicStatusBadge({ status }: { status: PublicStatus }) {
  return <Badge className={cx(color[status])}>{PUBLIC_STATUS_LABEL[status]}</Badge>;
}
/** Shown only in authenticated operations views. */
export function UnofficialBadge() {
  return <Badge className="border border-amber-600 bg-amber-100 text-amber-900">Unofficial</Badge>;
}
