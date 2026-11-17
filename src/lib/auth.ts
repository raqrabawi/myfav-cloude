/**
 * Supabase Auth adapter with the same surface the original UI used from
 * Firebase (`auth.currentUser`, `onAuthStateChanged`, `User`, sign-in helpers).
 * Keeping this surface lets App.tsx and every component stay visually and
 * behaviourally identical while the identity provider changes underneath.
 */
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './supabaseClient';

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

export function toFacadeUser(u: SupabaseUser | null | undefined): User | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;
  const photo =
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
export function onAuthStateChanged(
  _auth: AuthFacade,
  callback: (user: User | null) => void
): () => void {
  if (!supabase) {
    auth.currentUser = null;
    const t = setTimeout(() => callback(null), 0);
    return () => clearTimeout(t);
  }

  let lastUid: string | null | undefined = undefined;
  let disposed = false;

  const emit = (session: Session | null) => {
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

  const { data } = supabase.auth.onAuthStateChange((_event, session) => emit(session));

  return () => {
    disposed = true;
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

export function mapSupabaseAuthError(error: unknown): AuthAdapterError {
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
      return new AuthAdapterError('auth/weak-password', msg);
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return new AuthAdapterError('auth/too-many-requests', msg);
    case 'email_not_confirmed':
      return new AuthAdapterError(
        'myfav/email-not-confirmed',
        'Please confirm your email address first — open the verification link we emailed you, then log in.'
      );
    case 'email_provider_disabled':
    case 'signup_disabled':
      return new AuthAdapterError(
        'myfav/provider-disabled',
        'Email/password authentication is not enabled yet in Supabase (Authentication → Providers → Email).'
      );
    case 'provider_disabled':
      return new AuthAdapterError(
        'myfav/provider-disabled',
        'Google sign-in is not enabled yet in Supabase (Authentication → Providers → Google).'
      );
    default:
      if (e.status === 429) return new AuthAdapterError('auth/too-many-requests', msg);
      return new AuthAdapterError(code ? `supabase/${code}` : '', msg || 'Authentication failed. Please try again.');
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
  const client = requireSupabase();
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
    throw mapSupabaseAuthError(error);
  }
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw mapSupabaseAuthError(error);
  return data;
}

export async function registerWithEmail(name: string, email: string, password: string) {
  const client = requireSupabase();
  const trimmedName = name.trim();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: trimmedName ? { full_name: trimmedName, name: trimmedName } : {},
      emailRedirectTo: appReturnUrl(),
    },
  });
  if (error) throw mapSupabaseAuthError(error);

  // Supabase anti-enumeration: an already-registered email returns a user with
  // no identities and no session.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new AuthAdapterError('auth/email-already-in-use', 'Email already registered');
  }
  // With "Confirm email" enabled (required by the security spec) there is no
  // session until the address is verified.
  if (!data.session) {
    throw new AuthAdapterError(
      'myfav/verification-sent',
      `Account created! We sent a verification link to ${email.trim()}. Confirm your email, then log in.`
    );
  }
  return data;
}

export async function sendPasswordReset(email: string) {
  const client = requireSupabase();
  const redirect = new URL(appReturnUrl() || window.location.origin);
  redirect.searchParams.delete('share');
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirect.toString(),
  });
  if (error) throw mapSupabaseAuthError(error);
}

export async function updatePassword(newPassword: string) {
  const client = requireSupabase();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw mapSupabaseAuthError(error);
}

export function onPasswordRecovery(callback: () => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(callback, 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOutUser() {
  auth.currentUser = null;
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw mapSupabaseAuthError(error);
}
