import { env } from './env';

/**
 * Staff can sign in with a plain username ("jsmith") instead of an email address.
 * Supabase identifies accounts by email, so a username is stored as
 * "<username>@<USERNAME_DOMAIN>" (create the account in Supabase that way, with
 * Auto Confirm). No email is ever sent to these addresses.
 */
export const USERNAME_DOMAIN = env.usernameDomain;

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** "jsmith" -> "jsmith@wotb.local"; real email addresses pass through (lower-cased). */
export function toLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`;
}

/** True when the input is a valid username or a plausible email address. */
export function isValidLogin(input: string): boolean {
  const v = input.trim().toLowerCase();
  if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return USERNAME.test(v);
}

/** How to show an account: "jsmith" for username accounts, the email otherwise. */
export function displayLogin(email: string | null | undefined): string {
  if (!email) return '';
  const suffix = `@${USERNAME_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/** Username accounts have no real inbox, so email sign-in links can't reach them. */
export function isUsernameAccount(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`));
}
