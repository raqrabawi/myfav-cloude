// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: string, session: unknown) => void;
const listeners: Listener[] = [];
const fakeAuth = {
  onAuthStateChange: vi.fn((cb: Listener) => {
    listeners.push(cb);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(),
  getBetterAuthInstance: () => fakeBetterAuth,
};
const fakeBetterAuth = {
  signUp: { email: vi.fn() },
  resetPassword: vi.fn(),
  emailOtp: { verifyEmail: vi.fn(), sendVerificationOtp: vi.fn() },
};
vi.mock('../../src/lib/neonClient', () => ({
  neon: { auth: fakeAuth },
  requireNeon: () => ({ auth: fakeAuth }),
}));

const authMod = await import('../../src/lib/auth');
const flush = () => new Promise((r) => setTimeout(r, 5));
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  user: { id, email: `${id}@x.dev`, email_confirmed_at: '2026-01-01', user_metadata: { displayName: 'Ranan' }, ...extra },
});

beforeEach(() => {
  listeners.length = 0;
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('onAuthStateChanged — Firebase semantics on top of Neon Auth', () => {
  it('fires for initial state and identity changes only (not token refresh)', async () => {
    const seen: Array<string | null> = [];
    const unsub = authMod.onAuthStateChanged(authMod.auth, (u) => seen.push(u ? u.uid : null));
    listeners[0]('INITIAL_SESSION', null);
    await flush();
    listeners[0]('SIGNED_IN', session('u1'));
    await flush();
    listeners[0]('TOKEN_REFRESHED', session('u1'));
    listeners[0]('USER_UPDATED', session('u1'));
    await flush();
    listeners[0]('SIGNED_IN', session('u2'));
    await flush();
    listeners[0]('SIGNED_OUT', null);
    await flush();
    expect(seen).toEqual([null, 'u1', 'u2', null]);
    unsub();
  });

  it('maps the Supabase user to the Firebase-like User shape', () => {
    const u = authMod.toFacadeUser(session('abc').user as never);
    expect(u).toEqual({ uid: 'abc', email: 'abc@x.dev', displayName: 'Ranan', emailVerified: true, photoURL: null });
  });

  it('keeps auth.currentUser in sync', async () => {
    authMod.onAuthStateChanged(authMod.auth, () => {});
    listeners[0]('SIGNED_IN', session('u9'));
    expect(authMod.auth.currentUser?.uid).toBe('u9');
  });
});

describe('error mapping keeps AuthPage messages identical', () => {
  it.each([
    ['invalid_credentials', 'auth/invalid-credential'],
    ['user_already_exists', 'auth/email-already-in-use'],
    ['email_address_invalid', 'auth/invalid-email'],
    ['over_request_rate_limit', 'auth/too-many-requests'],
  ])('%s -> %s', (code, expected) => {
    expect(authMod.mapAuthError({ code, message: 'x' }).code).toBe(expected);
  });
  it('network failures', () => {
    expect(authMod.mapAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).code).toBe('auth/network-request-failed');
  });
  it('unconfirmed email gets a clear message', () => {
    expect(authMod.mapAuthError({ code: 'email_not_confirmed' }).message).toMatch(/verify your email/i);
  });
});

describe('sign-in / registration flows', () => {
  it('email sign-in trims the address and maps errors', async () => {
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', message: 'bad' } });
    await expect(authMod.signInWithEmail('  a@b.co ', 'pw')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(fakeAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
  });

  it('registration with email verification required tells the user to verify', async () => {
    fakeBetterAuth.signUp.email.mockResolvedValueOnce({ data: { token: null, user: { id: 'n' } }, error: null });
    await expect(authMod.registerWithEmail(' Ranan ', ' r@x.dev ', 'secret123')).rejects.toMatchObject({ code: 'myfav/verification-sent' });
    const arg = fakeBetterAuth.signUp.email.mock.calls[0][0];
    expect(arg).toMatchObject({ email: 'r@x.dev', password: 'secret123', name: 'Ranan' });
    expect(fakeAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('registration without verification signs the user in through the adapter', async () => {
    fakeBetterAuth.signUp.email.mockResolvedValueOnce({ data: { token: 'tok', user: { id: 'n' } }, error: null });
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: {} }, error: null });
    await authMod.registerWithEmail('Ranan', 'r@x.dev', 'secret123');
    expect(fakeAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'r@x.dev', password: 'secret123' });
  });

  it.each([
    ['USER_ALREADY_EXISTS', 'auth/email-already-in-use'],
    ['INVALID_EMAIL', 'auth/invalid-email'],
    ['PASSWORD_TOO_SHORT', 'myfav/password-too-short'],
  ])('Better Auth sign-up error %s -> %s', async (code, expected) => {
    fakeBetterAuth.signUp.email.mockResolvedValueOnce({ data: null, error: { code, message: 'x', status: 422 } });
    await expect(authMod.registerWithEmail('a', 'r@x.dev', 'secret123')).rejects.toMatchObject({ code: expected });
  });

  it('password too short explains the real 8-character rule', () => {
    expect(authMod.mapBetterAuthError({ code: 'PASSWORD_TOO_SHORT' }).message).toBe('Password must be at least 8 characters long.');
  });

  it('password reset: reads ?token=, completes with Better Auth, maps invalid tokens', async () => {
    expect(authMod.readPasswordResetRedirect('https://app.dev/?token=abc123')).toEqual({ token: 'abc123', error: null });
    expect(authMod.readPasswordResetRedirect('https://app.dev/?error=INVALID_TOKEN')).toEqual({ token: null, error: 'INVALID_TOKEN' });
    expect(authMod.readPasswordResetRedirect('https://app.dev/?share=share_x')).toBeNull();
    fakeBetterAuth.resetPassword.mockResolvedValueOnce({ data: { status: true }, error: null });
    await authMod.completePasswordReset('abc123', 'newpassword1');
    expect(fakeBetterAuth.resetPassword).toHaveBeenCalledWith({ newPassword: 'newpassword1', token: 'abc123' });
    fakeBetterAuth.resetPassword.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_TOKEN', message: 'invalid token' } });
    await expect(authMod.completePasswordReset('bad', 'newpassword1')).rejects.toMatchObject({ code: 'myfav/invalid-reset-token' });
  });

  it('password reset request strips share/token params from the redirect', async () => {
    window.history.replaceState({}, '', '/?share=share_abc&token=old');
    fakeAuth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    await authMod.sendPasswordReset(' r@x.dev ');
    const [email, opts] = fakeAuth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe('r@x.dev');
    expect(opts.redirectTo).not.toContain('share=');
    expect(opts.redirectTo).not.toContain('token=');
  });

  it('Google sign-in redirects back to the same page (keeps ?share=) and marks a fresh sign-in', async () => {
    window.history.replaceState({}, '', '/?share=share_abc&code=old');
    fakeAuth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: null });
    await authMod.signInWithGoogle();
    const opts = fakeAuth.signInWithOAuth.mock.calls[0][0];
    expect(opts.provider).toBe('google');
    expect(opts.options.redirectTo).toContain('share=share_abc');
    expect(opts.options.redirectTo).not.toContain('code=');
    expect(authMod.consumeOAuthFreshSignInFlag()).toBe(true);
    expect(authMod.consumeOAuthFreshSignInFlag()).toBe(false);
  });

  it('a signed-out initial state clears a stale OAuth marker', async () => {
    sessionStorage.setItem(authMod.OAUTH_FRESH_SIGNIN_KEY, '1');
    authMod.onAuthStateChanged(authMod.auth, () => {});
    listeners[0]('INITIAL_SESSION', null);
    expect(authMod.consumeOAuthFreshSignInFlag()).toBe(false);
  });

  it('sign-out clears currentUser', async () => {
    authMod.auth.currentUser = { uid: 'x', email: null, displayName: null, emailVerified: true, photoURL: null };
    await authMod.signOutUser();
    expect(authMod.auth.currentUser).toBeNull();
    expect(fakeAuth.signOut).toHaveBeenCalled();
  });

  it('sign-out updates the SAME tab even though Neon only broadcasts it to other tabs', async () => {
    const seen: Array<string | null> = [];
    const unsub = authMod.onAuthStateChanged(authMod.auth, (u) => seen.push(u ? u.uid : null));
    listeners[listeners.length - 1]('INITIAL_SESSION', session('u1'));
    await flush();
    // The adapter emits nothing to this tab on sign-out (localStorage broadcast).
    await authMod.signOutUser();
    await flush();
    expect(seen).toEqual(['u1', null]);
    unsub();
  });

  it('a failed sign-out keeps the user signed in and reports the error', async () => {
    const seen: Array<string | null> = [];
    const unsub = authMod.onAuthStateChanged(authMod.auth, (u) => seen.push(u ? u.uid : null));
    listeners[listeners.length - 1]('INITIAL_SESSION', session('u1'));
    await flush();
    fakeAuth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } } as never);
    await expect(authMod.signOutUser()).rejects.toMatchObject({ code: 'auth/network-request-failed' });
    await flush();
    expect(seen).toEqual(['u1']);
    unsub();
  });

  it('email sign-in updates the SAME tab without waiting for a reload', async () => {
    const seen: Array<string | null> = [];
    const unsub = authMod.onAuthStateChanged(authMod.auth, (u) => seen.push(u ? u.uid : null));
    listeners[listeners.length - 1]('INITIAL_SESSION', null);
    await flush();
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: { ...session('u5'), session: {} }, error: null });
    await authMod.signInWithEmail('u5@x.dev', 'password123');
    await flush();
    expect(seen).toEqual([null, 'u5']);
    unsub();
  });

  it('sign-up needing verification opens the code dialog and signs in after the code is verified', async () => {
    const seen: string[] = [];
    const onEvt = (e: Event) => seen.push((e as CustomEvent<{ email: string }>).detail.email);
    window.addEventListener(authMod.EMAIL_VERIFICATION_EVENT, onEvt);
    fakeBetterAuth.signUp.email.mockResolvedValueOnce({ data: { token: null }, error: null });
    await expect(authMod.registerWithEmail('R', 'r@x.dev', 'secret123')).rejects.toMatchObject({ code: 'myfav/verification-sent' });
    expect(seen).toEqual(['r@x.dev']);

    fakeBetterAuth.emailOtp.verifyEmail.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_OTP', message: 'bad' } });
    await expect(authMod.verifyEmailCode('r@x.dev', '000000')).rejects.toMatchObject({ code: 'myfav/invalid-verification-code' });

    fakeBetterAuth.emailOtp.verifyEmail.mockResolvedValueOnce({ data: { status: true }, error: null });
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: {} }, error: null });
    await expect(authMod.verifyEmailCode('r@x.dev', '123 456')).resolves.toEqual({ signedIn: true });
    expect(fakeBetterAuth.emailOtp.verifyEmail).toHaveBeenLastCalledWith({ email: 'r@x.dev', otp: '123456' });
    expect(fakeAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'r@x.dev', password: 'secret123' });
    // the password is not kept after use; the fresh-sign-in gate is set for the sync dialog
    fakeBetterAuth.emailOtp.verifyEmail.mockResolvedValueOnce({ data: { status: true }, error: null });
    await expect(authMod.verifyEmailCode('r@x.dev', '123456')).resolves.toEqual({ signedIn: false });
    expect(authMod.consumeOAuthFreshSignInFlag()).toBe(true);
    window.removeEventListener(authMod.EMAIL_VERIFICATION_EVENT, onEvt);
  });

  it('unverified sign-in opens the code dialog with a clear message', async () => {
    let opened = '';
    const onEvt = (e: Event) => (opened = (e as CustomEvent<{ email: string }>).detail.email);
    window.addEventListener(authMod.EMAIL_VERIFICATION_EVENT, onEvt);
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'email_not_confirmed', message: 'x' } });
    await expect(authMod.signInWithEmail('u@x.dev', 'secret123')).rejects.toThrow(/6-digit code/);
    expect(opened).toBe('u@x.dev');
    window.removeEventListener(authMod.EMAIL_VERIFICATION_EVENT, onEvt);
  });

  it('resend uses the email-verification OTP type', async () => {
    fakeBetterAuth.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: {}, error: null });
    await authMod.resendVerificationCode(' r@x.dev ');
    expect(fakeBetterAuth.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'r@x.dev', type: 'email-verification' });
  });
});
