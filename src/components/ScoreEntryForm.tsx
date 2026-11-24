import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Send } from 'lucide-react';
import { defaultResultMethod, fieldsForMethod, isHeadToHead, validateResult } from '../lib/domain/validation';
import { inferWinnerFromScores } from '../lib/domain/advancement';
import { parseDuration, humanize } from '../lib/domain/format';
import { friendlyError } from '../lib/supabase';
import { RESULT_METHODS, type MatchType, type ParticipantValue, type ResultMethod } from '../lib/types';
import { Button, Checkbox, Field, Input, Notice, Select, TextArea } from './ui';

export interface EntryParticipant {
  participant_id: string;
  slot: string;
  label: string;
}

export interface ResultPayload {
  result_method: ResultMethod;
  winner_participant_id: string | null;
  loser_participant_id: string | null;
  participant_values: ParticipantValue[];
  referee_confirmed: boolean;
  notes: string | null;
}

interface RowValues {
  participant_id: string;
  score: string;
  time: string;
  penalty: string;
  technical: string;
  placement: string;
}
interface FormValues {
  result_method: ResultMethod;
  rows: RowValues[];
  winner: string;
  referee_confirmed: boolean;
  notes: string;
}

const FIELD_LABEL: Record<string, string> = {
  score: 'Score',
  time_seconds: 'Time (mm:ss or seconds)',
  penalty_seconds: 'Penalty (seconds)',
  technical_score: 'Technical score',
  placement: 'Place (1 = first)',
};
const ROW_KEY = { score: 'score', time_seconds: 'time', penalty_seconds: 'penalty', technical_score: 'technical', placement: 'placement' } as const;

function toNumber(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Convert form values into the submission payload. Exported for tests. */
export function buildPayload(values: FormValues, matchType: MatchType, participants: EntryParticipant[]): ResultPayload {
  const fields = fieldsForMethod(values.result_method);
  const participant_values: ParticipantValue[] = values.rows.map((r) => {
    const v: ParticipantValue = { participant_id: r.participant_id };
    if (fields.includes('score')) v.score = toNumber(r.score);
    if (fields.includes('time_seconds')) v.time_seconds = parseDuration(r.time);
    if (fields.includes('penalty_seconds')) v.penalty_seconds = toNumber(r.penalty) ?? 0;
    if (fields.includes('technical_score')) v.technical_score = toNumber(r.technical);
    if (fields.includes('placement')) v.placement = toNumber(r.placement);
    return v;
  });
  let winner: string | null = values.winner || null;
  let loser: string | null = null;
  if (isHeadToHead(matchType)) {
    if (winner && participants.length === 2) loser = participants.find((p) => p.participant_id !== winner)?.participant_id ?? null;
  } else {
    // Multi-team: winner = 1st place, if entered.
    const first = participant_values.find((v) => v.placement === 1);
    winner = winner || first?.participant_id || null;
  }
  return {
    result_method: values.result_method,
    winner_participant_id: winner,
    loser_participant_id: loser,
    participant_values,
    referee_confirmed: values.referee_confirmed,
    notes: values.notes.trim() || null,
  };
}

export function ScoreEntryForm({
  matchType,
  participants,
  onSubmit,
}: {
  matchType: MatchType;
  participants: EntryParticipant[];
  onSubmit: (payload: ResultPayload) => Promise<void>;
}) {
  const h2h = isHeadToHead(matchType);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, control, setValue, reset, formState } = useForm<FormValues>({
    defaultValues: {
      result_method: defaultResultMethod(matchType),
      rows: participants.map((p) => ({ participant_id: p.participant_id, score: '', time: '', penalty: '', technical: '', placement: '' })),
      winner: '',
      referee_confirmed: false,
      notes: '',
    },
  });

  // Reset when the selected match changes.
  const key = participants.map((p) => p.participant_id).join('|');
  useEffect(() => {
    reset({
      result_method: defaultResultMethod(matchType),
      rows: participants.map((p) => ({ participant_id: p.participant_id, score: '', time: '', penalty: '', technical: '', placement: '' })),
      winner: '',
      referee_confirmed: false,
      notes: '',
    });
    setErrors([]);
    setServerError(null);
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, matchType]);

  const method = useWatch({ control, name: 'result_method' });
  const rows = useWatch({ control, name: 'rows' });
  const winner = useWatch({ control, name: 'winner' });
  const referee = useWatch({ control, name: 'referee_confirmed' });
  const fields = fieldsForMethod(method);

  // Convenience: suggest the winner from scores (scorer can still change it).
  useEffect(() => {
    if (!h2h || method !== 'score' || !rows) return;
    const inferred = inferWinnerFromScores(rows.map((r) => ({ participant_id: r.participant_id, score: toNumber(r.score) })));
    if (inferred.winner && !formState.dirtyFields.winner) setValue('winner', inferred.winner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows?.map((r) => r.score)), method, h2h]);

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    const payload = buildPayload(values, matchType, participants);
    const problems = validateResult(
      { match_id: '00000000-0000-0000-0000-000000000000', ...payload },
      matchType,
      participants.map((p) => p.participant_id),
    );
    if (fields.includes('time_seconds') && payload.participant_values.some((v) => Number.isNaN(v.time_seconds as number))) {
      problems.unshift('Enter times as mm:ss (for example 12:34.5) or as seconds.');
    }
    if (payload.participant_values.some((v) => Object.values(v).some((x) => typeof x === 'number' && Number.isNaN(x)))) {
      problems.unshift('One of the values is not a valid number.');
    }
    setErrors([...new Set(problems)]);
    if (problems.length) return;
    try {
      await onSubmit(payload);
      setDone(true);
    } catch (e) {
      setServerError(friendlyError(e));
    }
  });

  if (participants.length === 0) {
    return <Notice tone="warn">No teams are assigned to this match yet. Contact the sport manager.</Notice>;
  }
  if (done) {
    return (
      <Notice tone="success" title="Result submitted — Awaiting Validation">
        The venue lead or sport manager will validate it. It is not public until marked Official.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Submit result">
      {h2h && participants.length < 2 && <Notice tone="warn">Head-to-head match has fewer than two teams assigned.</Notice>}

      <Field label="Result type" htmlFor="result_method">
        <Select id="result_method" {...register('result_method')}>
          {RESULT_METHODS.map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Teams (read-only)</legend>
        {participants.map((p, i) => (
          <div key={p.participant_id} className="rounded-lg border border-slate-300 bg-slate-50 p-3">
            <p className="font-bold">
              <span className="mr-2 rounded bg-slate-700 px-1.5 text-xs text-white">{p.slot}</span>
              {p.label}
            </p>
            {fields.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {fields.map((f) => {
                  const id = `row-${i}-${f}`;
                  const isTime = f === 'time_seconds';
                  return (
                    <Field key={f} label={FIELD_LABEL[f]} htmlFor={id}>
                      <Input
                        id={id}
                        inputMode={isTime ? 'text' : 'decimal'}
                        min={0}
                        placeholder={isTime ? 'mm:ss' : '0'}
                        aria-label={`${FIELD_LABEL[f]} for ${p.label}`}
                        {...register(`rows.${i}.${ROW_KEY[f]}` as const)}
                      />
                    </Field>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </fieldset>

      {h2h && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Winner</legend>
          <div className="grid gap-2">
            {participants.map((p) => (
              <label key={p.participant_id} className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-slate-400 bg-white p-3">
                <input type="radio" value={p.participant_id} className="h-6 w-6 accent-brand" {...register('winner')} />
                <span className="font-semibold">{p.label}</span>
              </label>
            ))}
            {method === 'score' && (
              <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-slate-400 bg-white p-3">
                <input type="radio" value="" className="h-6 w-6 accent-brand" {...register('winner')} />
                <span>Tie / no winner (pool play only)</span>
              </label>
            )}
          </div>
          {winner && <p className="mt-1 text-sm text-slate-700">Selected winner: {participants.find((p) => p.participant_id === winner)?.label}</p>}
        </fieldset>
      )}

      <Field label="Notes (optional, no personal data)" htmlFor="notes">
        <TextArea id="notes" maxLength={500} {...register('notes')} />
      </Field>

      <Checkbox
        id="referee_confirmed"
        label="Referee / official has approved this result"
        description="Required. Do not submit until the referee confirms the result."
        checked={referee}
        onChange={(v) => setValue('referee_confirmed', v, { shouldDirty: true })}
      />

      {errors.length > 0 && (
        <Notice tone="error" title="Please fix the following">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      {serverError && <Notice tone="error">{serverError}</Notice>}

      <Button type="submit" block variant="success" disabled={formState.isSubmitting}>
        <Send className="h-5 w-5" aria-hidden /> {formState.isSubmitting ? 'Submitting…' : 'Submit Result'}
      </Button>
    </form>
  );
}
