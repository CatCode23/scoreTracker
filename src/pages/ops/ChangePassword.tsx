import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, friendlyError } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Button, Card, Field, Input, Notice, PageHeader } from '../../components/ui';

export const MIN_PASSWORD_LENGTH = 10;

export const changePasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type Values = z.infer<typeof changePasswordSchema>;

export function ChangePassword() {
  const auth = useAuth();
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
  });

  const submit = handleSubmit(async ({ password }) => {
    setResult(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setResult({
        tone: 'error',
        text: /same|different/i.test(error.message)
          ? 'The new password must be different from your current one.'
          : /weak|short|characters/i.test(error.message)
            ? 'That password is too weak. Use a longer one.'
            : friendlyError(error),
      });
      return;
    }
    reset();
    setResult({ tone: 'success', text: 'Password changed. Use it next time you sign in.' });
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Change password" subtitle={auth.session?.user.email} />
      <Notice tone="info">
        Replace the temporary password you were given. Do not share your account; every result you
        submit is recorded under your name.
      </Notice>
      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate aria-label="Change password">
          {/* Hidden username field helps password managers save the right account. */}
          <input
            type="email"
            autoComplete="username"
            value={auth.session?.user.email ?? ''}
            readOnly
            hidden
          />
          <Field
            label="New password"
            htmlFor="new-password"
            error={formState.errors.password?.message}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirm-password"
            error={formState.errors.confirm?.message}
          >
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              {...register('confirm')}
            />
          </Field>
          {result && <Notice tone={result.tone}>{result.text}</Notice>}
          <Button type="submit" block disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
