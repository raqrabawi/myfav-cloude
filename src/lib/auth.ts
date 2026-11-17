/**
 * Neon Managed Better Auth adapter with the same surface the original UI used
 * from Firebase (`auth.currentUser`, `onAuthStateChanged`, `User`, sign-in
 * helpers). Keeping this surface lets App.tsx and every component stay
 * visually and behaviourally identical while the identity provider changes.
 *
 * Most calls go through Neon's Supabase-compatible adapter; sign-up and the
 * password-reset completion use the underlying Better Auth client directly
 * (the adapter has no equivalent for those flows).
 */
import { neon, requireNeon } from './neonClient';

/** Supabase-shaped session/user objects produced by Neon's adapter. */
interface AdapterUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}
interface AdapterSession {
  user?: AdapterUser | null;
}

interface BetterAuthResult<T> {
  data: T | null;
  error: { code?: string; message?: string; status?: number } | null;
}
interface BetterAuthLike {
  signUp: {
    email(input: {
      email: string;
      password: string;
      name: string;
      callbackURL?: string;
    }): Promise<BetterAuthResult<{ token: string | null; user?: unknown }>>;
  };
  resetPassword(input: { newPassword: string; token: string }): Promise<BetterAuthResult<unknown>>;
  emailOtp: {
    sendVerificationOtp(input: {
      email: string;
      type: 'email-verification' | 'sign-in' | 'forget-password';
    }): Promise<BetterAuthResult<unknown>>;
    verifyEmail(input: { email: string; otp: string }): Promise<BetterAuthResult<unknown>>;
  };
}

function betterAuth(): BetterAuthLike {
  const client = requireNeon() as unknown as {
    auth: { getBetterAuthInstance(): BetterAuthLike };
  };
  return client.auth.getBetterAuthInstance();
}

/** Firebase-compatible subset of the user object consumed by the UI. */
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  photoURL: string | null;
}

export interface AuthFacade {
  currentUser: User | null;
}

export const auth: AuthFacade = { currentUser: null };

export const OAUTH_FRESH_SIGNIN_KEY = 'myfav.v2.oauthFreshSignIn';

export function toFacadeUser(u: AdapterUser | null | undefined): User | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.displayName === 'string' && meta.displayName) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;
  const photo =
    (typeof meta.profileImageUrl === 'string' && meta.profileImageUrl) ||
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName: name,
    emailVerified: Boolean(u.email_confirmed_at),
    photoURL: photo,
  };
}

/**
 * Firebase semantics: the callback fires once with the initial state and then
 * only when the signed-in identity changes (sign in / sign out / switch user).
 * Token refreshes and profile updates do NOT re-fire it, so App's sync gate is
 * never re-triggered by background refreshes.
 */
/**
 * Neon's adapter announces SIGNED_IN / SIGNED_OUT through Better Auth's
 * localStorage "broadcast channel", whose `storage` events reach only OTHER
 * tabs. The tab that actually signed in or out is never told, so we notify
 * our own listeners directly after those calls succeed.
 */
const localEmitters = new Set<(session: AdapterSession | null) => void>();
function notifyLocal(session: AdapterSession | null) {
  localEmitters.forEach((emit) => emit(session));
}
/** After a successful password sign-in; never treats a user-less reply as sign-out. */
function notifySignedIn(data: unknown) {
  const s = data as AdapterSession | null | undefined;
  if (s?.user?.id) notifyLocal(s);
}

export function onAuthStateChanged(
  _auth: AuthFacade,
  callback: (user: User | null) => void
): () => void {
  if (!neon) {
    auth.currentUser = null;
    const t = setTimeout(() => callback(null), 0);
    return () => clearTimeout(t);
  }

  let lastUid: string | null | undefined = undefined;
  let disposed = false;

  const emit = (session: AdapterSession | null) => {
    const next = toFacadeUser(session?.user);
    auth.currentUser = next;
    const nextUid = next?.uid ?? null;
    if (!next) {
      // A cancelled/failed OAuth round-trip must not mark a later session as "fresh".
      try {
        sessionStorage.removeItem(OAUTH_FRESH_SIGNIN_KEY);
      } catch {
        // ignore
      }
    }
    if (nextUid === lastUid) return;
    lastUid = nextUid;
    // Defer: Supabase forbids awaiting other Supabase calls inside its
    // onAuthStateChange callback, and App's handler loads the workspace.
    setTimeout(() => {
      if (!disposed) callback(next);
    }, 0);
  };

  const { data } = neon.auth.onAuthStateChange((_event: string, session: unknown) =>
    emit(session as AdapterSession | null)
  );
  localEmitters.add(emit);

  return () => {
    disposed = true;
    localEmitters.delete(emit);
    data.subscription.unsubscribe();
  };
}

/** Reads (and clears) the marker set right before an OAuth redirect. */
export function consumeOAuthFreshSignInFlag(): boolean {
  try {
    const v = sessionStorage.getItem(OAUTH_FRESH_SIGNIN_KEY);
    sessionStorage.removeItem(OAUTH_FRESH_SIGNIN_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

/** Error carrying a Firebase-style `code` so AuthPage's messages stay identical. */
export class AuthAdapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthAdapterError';
  }
}

export function mapAuthError(error: unknown): AuthAdapterError {
  const e = (error ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  const code = String(e.code ?? '');
  const msg = String(e.message ?? '');
  const lower = msg.toLowerCase();

  if (e.name === 'AuthRetryableFetchError' || lower.includes('failed to fetch') || lower.includes('network')) {
    return new AuthAdapterError('auth/network-request-failed', msg || 'Network error');
  }
  switch (code) {
    case 'invalid_credentials':
      return new AuthAdapterError('auth/invalid-credential', msg);
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return new AuthAdapterError('auth/email-already-in-use', msg);
    case 'email_address_invalid':
    case 'validation_failed':
      return new AuthAdapterError('auth/invalid-email', msg);
    case 'weak_password':
      return new AuthAdapterError('myfav/password-too-short', 'Password must be at least 8 characters long.');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return new AuthAdapterError('auth/too-many-requests', msg);
    case 'email_not_confirmed':
      return new AuthAdapterError(
        'myfav/email-not-confirmed',
        'Please verify your email address first — enter the 6-digit code we emailed you.'
      );
    case 'email_provider_disabled':
    case 'signup_disabled':
      return new AuthAdapterError(
        'myfav/provider-disabled',
        'Email/password sign-in is not enabled yet in Neon Auth (Neon Console → Auth → Settings).'
      );
    case 'provider_disabled':
      return new AuthAdapterError(
        'myfav/provider-disabled',
        'Google sign-in is not enabled yet in Neon Auth (Neon Console → Auth → OAuth providers).'
      );
    default:
      if (e.status === 429) return new AuthAdapterError('auth/too-many-requests', msg);
      return new AuthAdapterError(code ? `neon-auth/${code}` : '', msg || 'Authentication failed. Please try again.');
  }
}

function appReturnUrl(): string {
  if (typeof window === 'undefined') return '';
  // Keep ?share= deep links; drop OAuth leftovers.
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  return url.toString();
}

export async function signInWithGoogle() {
  const client = requireNeon();
  try {
    sessionStorage.setItem(OAUTH_FRESH_SIGNIN_KEY, '1');
  } catch {
    // ignore
  }
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appReturnUrl() },
  });
  if (error) {
    try {
      sessionStorage.removeItem(OAUTH_FRESH_SIGNIN_KEY);
    } catch {
      // ignore
    }
    throw mapAuthError(error);
  }
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireNeon();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    const mapped = mapAuthError(error);
    if (mapped.code === 'myfav/email-not-confirmed') {
      // Neon sends a fresh 6-digit code on sign-in ("send verification email
      // on sign-in"); open the code dialog so the user can finish right away.
      requestEmailVerification(email.trim(), password);
      throw new AuthAdapterError(
        'myfav/email-not-confirmed',
        `Your email isn't verified yet. We sent a 6-digit code to ${email.trim()} — enter it to finish signing in.`
      );
    }
    throw mapped;
  }
  notifySignedIn(data);
  return data;
}

/** Better Auth error codes (sign-up) -> Firebase-style codes used by AuthPage. */
export function mapBetterAuthError(error: { code?: string; message?: string; status?: number }) {
  const code = String(error.code ?? '').toUpperCase();
  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return new AuthAdapterError('auth/email-already-in-use', error.message ?? 'Email already registered');
    case 'INVALID_EMAIL':
      return new AuthAdapterError('auth/invalid-email', error.message ?? 'Invalid email');
    // Neon Managed Better Auth enforces 8+ characters (the original Firebase
    // minimum was 6, which AuthPage still pre-checks), so give the real rule.
    case 'PASSWORD_TOO_SHORT':
      return new AuthAdapterError('myfav/password-too-short', 'Password must be at least 8 characters long.');
    case 'PASSWORD_TOO_LONG':
      return new AuthAdapterError('myfav/password-too-long', 'Password must be at most 128 characters long.');
    case 'INVALID_TOKEN':
      return new AuthAdapterError(
        'myfav/invalid-reset-token',
        'This password reset link is invalid or has expired. Request a new one from the login screen.'
      );
    default:
      if (error.status === 429) return new AuthAdapterError('auth/too-many-requests', error.message ?? '');
      return mapAuthError(error);
  }
}

export async function registerWithEmail(name: string, email: string, password: string) {
  const client = requireNeon();
  const trimmedName = name.trim();
  let result: BetterAuthResult<{ token: string | null }>;
  try {
    result = await betterAuth().signUp.email({
      email: email.trim(),
      password,
      name: trimmedName,
      callbackURL: appReturnUrl() || undefined,
    });
  } catch (err) {
    throw mapAuthError(err);
  }
  if (result.error) throw mapBetterAuthError(result.error);

  // With "require email verification" on (required by the security model)
  // Better Auth returns no session token until the address is verified.
  if (!result.data?.token) {
    requestEmailVerification(email.trim(), password);
    throw new AuthAdapterError(
      'myfav/verification-sent',
      `Account created! We sent a 6-digit verification code to ${email.trim()}. Enter it to finish signing up.`
    );
  }
  // Verification disabled on the project: establish the session through the
  // adapter so onAuthStateChange fires like any other sign-in.
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw mapAuthError(error);
  notifySignedIn(data);
  return data;
}

export async function sendPasswordReset(email: string) {
  const client = requireNeon();
  const redirect = new URL(appReturnUrl() || window.location.origin);
  redirect.searchParams.delete('share');
  redirect.searchParams.delete(PASSWORD_RESET_TOKEN_PARAM);
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirect.toString(),
  });
  if (error) throw mapAuthError(error);
}

// ---------------------------------------------------------------------------
// Email verification with 6-digit codes (Neon's shared email sender supports
// codes, not links). The password is kept ONLY in memory, only until the code
// is verified, so the user is signed in automatically afterwards.
// ---------------------------------------------------------------------------
export const EMAIL_VERIFICATION_EVENT = 'myfav:email-verification-required';

let pendingVerification: { email: string; password: string | null } | null = null;

export function requestEmailVerification(email: string, password: string | null = null) {
  pendingVerification = { email, password };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EMAIL_VERIFICATION_EVENT, { detail: { email } }));
  }
}

export function cancelEmailVerification() {
  pendingVerification = null;
}

function mapOtpError(error: { code?: string; message?: string; status?: number }) {
  const code = String(error.code ?? '').toUpperCase();
  if (code === 'INVALID_OTP' || code === 'OTP_EXPIRED' || code === 'INVALID_CODE') {
    return new AuthAdapterError(
      'myfav/invalid-verification-code',
      'That code is incorrect or has expired. Check the latest email or request a new code.'
    );
  }
  if (code === 'TOO_MANY_ATTEMPTS') {
    return new AuthAdapterError('auth/too-many-requests', 'Too many attempts. Request a new code and try again.');
  }
  return mapBetterAuthError(error);
}

/** Verifies the code; signs the user in when the password is known. */
export async function verifyEmailCode(email: string, code: string): Promise<{ signedIn: boolean }> {
  const otp = code.replace(/\s+/g, '');
  let result: BetterAuthResult<unknown>;
  try {
    result = await betterAuth().emailOtp.verifyEmail({ email: email.trim(), otp });
  } catch (err) {
    throw mapAuthError(err);
  }
  if (result.error) throw mapOtpError(result.error);

  const pending = pendingVerification;
  pendingVerification = null;
  if (!pending?.password || pending.email.toLowerCase() !== email.trim().toLowerCase()) {
    return { signedIn: false };
  }
  try {
    sessionStorage.setItem(OAUTH_FRESH_SIGNIN_KEY, '1'); // same "fresh sign-in" gate as OAuth
  } catch {
    // ignore
  }
  const { data, error } = await requireNeon().auth.signInWithPassword({
    email: pending.email,
    password: pending.password,
  });
  if (error) {
    try {
      sessionStorage.removeItem(OAUTH_FRESH_SIGNIN_KEY);
    } catch {
      // ignore
    }
    return { signedIn: false };
  }
  notifySignedIn(data);
  return { signedIn: true };
}

export async function resendVerificationCode(email: string) {
  let result: BetterAuthResult<unknown>;
  try {
    result = await betterAuth().emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'email-verification',
    });
  } catch (err) {
    throw mapAuthError(err);
  }
  if (result.error) throw mapOtpError(result.error);
}

export const PASSWORD_RESET_TOKEN_PARAM = 'token';

/**
 * Better Auth's reset email links to the auth server, which redirects back to
 * the app with `?token=<reset token>` (or `?error=INVALID_TOKEN`).
 */
export function readPasswordResetRedirect(href = typeof window !== 'undefined' ? window.location.href : '') {
  if (!href) return null;
  const url = new URL(href);
  const token = url.searchParams.get(PASSWORD_RESET_TOKEN_PARAM);
  const error = url.searchParams.get('error');
  if (token) return { token, error: null as string | null };
  if (error === 'INVALID_TOKEN') return { token: null, error };
  return null;
}

export function clearPasswordResetParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(PASSWORD_RESET_TOKEN_PARAM);
  if (url.searchParams.get('error') === 'INVALID_TOKEN') url.searchParams.delete('error');
  window.history.replaceState(window.history.state, '', url.toString());
}

export async function completePasswordReset(token: string, newPassword: string) {
  let result: BetterAuthResult<unknown>;
  try {
    result = await betterAuth().resetPassword({ newPassword, token });
  } catch (err) {
    throw mapAuthError(err);
  }
  if (result.error) throw mapBetterAuthError(result.error);
}

export async function signOutUser() {
  auth.currentUser = null;
  pendingVerification = null;
  if (!neon) return;
  const { error } = await neon.auth.signOut();
  if (error) throw mapAuthError(error);
  notifyLocal(null);
}
