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
};
vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: { auth: fakeAuth },
  requireSupabase: () => ({ auth: fakeAuth }),
}));

const authMod = await import('../../src/lib/auth');
const flush = () => new Promise((r) => setTimeout(r, 5));
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  user: { id, email: `${id}@x.dev`, email_confirmed_at: '2026-01-01', user_metadata: { full_name: 'Ranan' }, ...extra },
});

beforeEach(() => {
  listeners.length = 0;
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('onAuthStateChanged — Firebase semantics on top of Supabase', () => {
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
    ['weak_password', 'auth/weak-password'],
    ['over_request_rate_limit', 'auth/too-many-requests'],
  ])('%s -> %s', (code, expected) => {
    expect(authMod.mapSupabaseAuthError({ code, message: 'x' }).code).toBe(expected);
  });
  it('network failures', () => {
    expect(authMod.mapSupabaseAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).code).toBe('auth/network-request-failed');
  });
  it('unconfirmed email gets a clear message', () => {
    expect(authMod.mapSupabaseAuthError({ code: 'email_not_confirmed' }).message).toMatch(/confirm your email/i);
  });
});

describe('sign-in / registration flows', () => {
  it('email sign-in trims the address and maps errors', async () => {
    fakeAuth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', message: 'bad' } });
    await expect(authMod.signInWithEmail('  a@b.co ', 'pw')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(fakeAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
  });

  it('registration with email confirmation required tells the user to verify', async () => {
    fakeAuth.signUp.mockResolvedValueOnce({ data: { user: { id: 'n', identities: [{}] }, session: null }, error: null });
    await expect(authMod.registerWithEmail('Ranan', 'r@x.dev', 'secret1')).rejects.toMatchObject({ code: 'myfav/verification-sent' });
    expect(fakeAuth.signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Ranan', name: 'Ranan' });
  });

  it('registration of an existing email (anti-enumeration response) maps to email-already-in-use', async () => {
    fakeAuth.signUp.mockResolvedValueOnce({ data: { user: { id: 'n', identities: [] }, session: null }, error: null });
    await expect(authMod.registerWithEmail('', 'r@x.dev', 'secret1')).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
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
});
