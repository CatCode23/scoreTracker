import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, KeyRound } from 'lucide-react';
import { supabase, isConfigured, friendlyError } from '../../lib/supabase';
import { appRootUrl } from '../../lib/env';
import { useAuth } from '../../lib/auth';
import { Button, Card, Field, Input, Notice, PageHeader } from '../../components/ui';
import { NotConfigured } from '../../components/states';

const emailSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6,10}$/, 'Enter the numeric code from the email') });

export function SignIn() {
  const auth = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema) });
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  if (auth.session) return <Navigate to="/ops" replace />;

  const sendLink = emailForm.handleSubmit(async ({ email }) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: appRootUrl(),
        // Accounts are created by an operations admin (Supabase "Invite user").
        shouldCreateUser: false,
      },
    });
    if (err) {
      setError(
        /signups not allowed|not found|otp_disabled/i.test(err.message)
          ? 'This email is not registered for staff access. Contact the operations cell.'
          : friendlyError(err),
      );
      return;
    }
    setSentTo(email);
  });

  const verify = codeForm.handleSubmit(async ({ code }) => {
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: sentTo!, token: code, type: 'email' });
    if (err) setError(/expired|invalid/i.test(err.message) ? 'That code is invalid or expired. Request a new link.' : friendlyError(err));
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Staff sign in" subtitle="Scorers, venue leads, sport managers and operations staff only." />
      {!isConfigured && <NotConfigured />}
      <Notice tone="info">
        The public does not need to sign in. Results, brackets and standings are on the public pages. QR codes only open the
        site; they never sign you in.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}

      {!sentTo ? (
        <Card>
          <form onSubmit={sendLink} className="space-y-4" noValidate>
            <Field label="Email address" htmlFor="email" error={emailForm.formState.errors.email?.message}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" {...emailForm.register('email')} />
            </Field>
            <Button type="submit" block disabled={emailForm.formState.isSubmitting || !isConfigured}>
              <Mail className="h-5 w-5" aria-hidden />
              {emailForm.formState.isSubmitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <Notice tone="success" title="Check your email">
            We sent a sign-in link to <strong>{sentTo}</strong>. Open it <strong>on this device, in this browser</strong>. If your
            email app opens links in a different browser, type the code from the email below instead.
          </Notice>
          <form onSubmit={verify} className="mt-4 space-y-4" noValidate>
            <Field label="Code from email" htmlFor="code" error={codeForm.formState.errors.code?.message}>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" {...codeForm.register('code')} />
            </Field>
            <Button type="submit" block disabled={codeForm.formState.isSubmitting}>
              <KeyRound className="h-5 w-5" aria-hidden /> Sign in with code
            </Button>
            <Button variant="ghost" block onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
