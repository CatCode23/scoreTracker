import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { TestAuthProvider } from '../../../lib/auth';

const { signInWithPassword, signInWithOtp, updateUser } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../../lib/supabase', () => ({
  isConfigured: true,
  friendlyError: (e: { message?: string }) => e?.message ?? 'error',
  supabase: { auth: { signInWithPassword, signInWithOtp, updateUser, verifyOtp: vi.fn() } },
}));

const { SignIn, signInErrorMessage } = await import('../SignIn');
const { ChangePassword } = await import('../ChangePassword');

beforeEach(() => vi.clearAllMocks());

describe('SignIn', () => {
  const renderSignIn = () =>
    render(
      <MemoryRouter>
        <TestAuthProvider value={{}}>
          <SignIn />
        </TestAuthProvider>
      </MemoryRouter>,
    );

  it('signs in with email and password without sending an email', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderSignIn();
    await user.type(screen.getByLabelText('Email address'), 'scorer@example.test');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'scorer@example.test',
      password: 'correct horse',
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('shows a plain message for wrong credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const user = userEvent.setup();
    renderSignIn();
    await user.type(screen.getByLabelText('Email address'), 'scorer@example.test');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  });

  it('keeps the email link as a backup option', async () => {
    const user = userEvent.setup();
    renderSignIn();
    expect(
      screen.queryByRole('button', { name: /Email me a sign-in link/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /email link instead/ }));
    expect(screen.getByRole('button', { name: /Email me a sign-in link/ })).toBeInTheDocument();
  });

  it('maps rate-limit errors to plain language', () => {
    expect(signInErrorMessage('email rate limit exceeded')).toMatch(/Too many sign-in emails/);
  });
});

describe('ChangePassword', () => {
  const session = { user: { email: 'scorer@example.test' } } as unknown as Session;
  const renderPage = () =>
    render(
      <TestAuthProvider value={{ session }}>
        <ChangePassword />
      </TestAuthProvider>,
    );

  it('rejects short or mismatched passwords', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updates the password', async () => {
    updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('New password'), 'a-long-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(updateUser).toHaveBeenCalledWith({ password: 'a-long-password' });
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
  });
});
