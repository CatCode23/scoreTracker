import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, LogIn, Mail } from 'lucide-react';
import { supabase, isConfigured, friendlyError } from '../../lib/supabase';
import { appRootUrl } from '../../lib/env';
import { useAuth } from '../../lib/auth';
import { Button, Card, Field, Input, Notice, PageHeader } from '../../components/ui';
import { NotConfigured } from '../../components/states';

const passwordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
const emailSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'Enter the numeric code from the email'),
});

/** Plain-language message for Supabase sign-in errors. */
export function signInErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) {
    return 'This account has not been confirmed. Ask the operations cell to confirm it in Supabase.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many sign-in emails have been sent. Wait a while and try again, or sign in with your password.';
  }
  if (/signups not allowed|not found|otp_disabled/i.test(message)) {
    return 'This email is not registered for staff access. Contact the operations cell.';
  }
  if (/expired|invalid/i.test(message))
    return 'That code is invalid or expired. Request a new one.';
  return friendlyError({ message });
}

export function SignIn() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showEmailOption, setShowEmailOption] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pwForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema) });
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  if (auth.session) return <Navigate to="/ops" replace />;

  const signInWithPassword = pwForm.handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(signInErrorMessage(err.message));
  });

  const sendLink = emailForm.handleSubmit(async ({ email }) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      // Accounts are created by an operations admin; never self-register.
      options: { emailRedirectTo: appRootUrl(), shouldCreateUser: false },
    });
    if (err) return setError(signInErrorMessage(err.message));
    setSentTo(email);
  });

  const verify = codeForm.handleSubmit(async ({ code }) => {
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: sentTo!,
      token: code,
      type: 'email',
    });
    if (err) setError(signInErrorMessage(err.message));
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader
        title="Staff sign in"
        subtitle="Scorers, venue leads, sport managers and operations staff only."
      />
      {!isConfigured && <NotConfigured />}
      <Notice tone="info">
        The public does not need to sign in. Results, brackets and standings are on the public
        pages. QR codes only open the site; they never sign you in.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <form
          onSubmit={signInWithPassword}
          className="space-y-4"
          noValidate
          aria-label="Sign in with password"
        >
          <Field
            label="Email address"
            htmlFor="email"
            error={pwForm.formState.errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              {...pwForm.register('email')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={pwForm.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...pwForm.register('password')}
            />
          </Field>
          <Button type="submit" block disabled={pwForm.formState.isSubmitting || !isConfigured}>
            <LogIn className="h-5 w-5" aria-hidden />
            {pwForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-3 text-sm text-slate-700">
          Forgot your password or don&apos;t have an account? Contact the operations cell.
        </p>
      </Card>

      {!showEmailOption ? (
        <Button variant="ghost" block onClick={() => setShowEmailOption(true)}>
          <Mail className="h-5 w-5" aria-hidden /> Sign in with an email link instead
        </Button>
      ) : !sentTo ? (
        <Card title="Email sign-in link (backup)">
          <form onSubmit={sendLink} className="space-y-4" noValidate>
            <Field
              label="Email address"
              htmlFor="link-email"
              error={emailForm.formState.errors.email?.message}
            >
              <Input
                id="link-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                {...emailForm.register('email')}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              block
              disabled={emailForm.formState.isSubmitting || !isConfigured}
            >
              <Mail className="h-5 w-5" aria-hidden />
              {emailForm.formState.isSubmitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <Notice tone="success" title="Check your email">
            We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device, in this
            browser, or type the code from the email below.
          </Notice>
          <form onSubmit={verify} className="mt-4 space-y-4" noValidate>
            <Field
              label="Code from email"
              htmlFor="code"
              error={codeForm.formState.errors.code?.message}
            >
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                {...codeForm.register('code')}
              />
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
