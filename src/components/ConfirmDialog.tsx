import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Input, Notice, TextArea } from './ui';
import { friendlyError } from '../lib/supabase';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, a reason is required and passed to onConfirm. */
  reasonLabel?: string;
  /** When set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
}

export function ConfirmDialog({
  open,
  options,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  error?: string | null;
  open: boolean;
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
      setTouched(false);
      setTimeout(() => ref.current?.querySelector<HTMLElement>('textarea, button')?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const needsReason = Boolean(options.reasonLabel);
  const reasonError =
    needsReason && touched && reason.trim().length < 3 ? 'A reason is required.' : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`${id}-title`} className="text-xl font-bold">
          {options.title}
        </h2>
        {options.body && <div className="mt-2 text-slate-800">{options.body}</div>}
        {needsReason && (
          <Field
            label={options.reasonLabel}
            htmlFor={`${id}-reason`}
            error={reasonError}
            className="mt-4"
          >
            <TextArea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          </Field>
        )}
        {options.requireText && (
          <Field
            label={
              <>
                Type <strong>{options.requireText}</strong> to confirm
              </>
            }
            htmlFor={`${id}-typed`}
            className="mt-4"
          >
            <Input
              id={`${id}-typed`}
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <Notice tone="error" className="mt-4">
            {error}
          </Notice>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={options.danger ? 'danger' : 'primary'}
            disabled={
              busy || (Boolean(options.requireText) && typed.trim() !== options.requireText)
            }
            onClick={() => {
              setTouched(true);
              if (needsReason && reason.trim().length < 3) return;
              onConfirm(reason.trim());
            }}
          >
            {busy ? 'Working…' : (options.confirmLabel ?? 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Hook: const confirm = useConfirm(); confirm.ask({...}, async (reason) => ...) ; render {confirm.dialog} */
export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    run: (reason: string) => unknown;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = (
    <ConfirmDialog
      error={error}
      open={state !== null}
      options={state?.options ?? { title: '' }}
      busy={busy}
      onCancel={() => !busy && setState(null)}
      onConfirm={async (reason) => {
        if (!state) return;
        setBusy(true);
        setError(null);
        try {
          await state.run(reason);
          setState(null);
        } catch (e) {
          setError(friendlyError(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
  return {
    ask: (options: ConfirmOptions, run: (reason: string) => unknown) => {
      setError(null);
      setState({ options, run });
    },
    dialog,
  };
}
