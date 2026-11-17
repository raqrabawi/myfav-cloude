import { createClient } from '@neon/neon-js/supabase';

/**
 * Neon browser client: Managed Better Auth + Data API (PostgREST-compatible)
 * through Neon's Supabase-compatible adapter, so `client.auth.*`,
 * `client.from()` and `client.rpc()` keep the same shapes the app already uses.
 *
 * Configuration is ONE public value, the HTTPS Neon database URL WITHOUT
 * credentials, e.g. https://ep-xxx.c-9.us-east-2.aws.neon.tech/neondb — the SDK
 * derives the Auth (.neonauth …/auth) and Data API (.apirest …/rest/v1) URLs.
 * Never put a postgres:// connection string (it contains a password) in a
 * VITE_* variable; startup validation refuses it.
 *
 * Without the variable the app still boots in guest (local-only) mode, exactly
 * like the original when the cloud is unreachable.
 */

const rawUrl = String(import.meta.env.VITE_NEON_URL ?? '').trim();

export interface NeonEnvStatus {
  ok: boolean;
  problems: string[];
}

export function validateNeonEnv(url = rawUrl): NeonEnvStatus {
  const problems: string[] = [];
  if (!url) {
    problems.push('VITE_NEON_URL is not set.');
    return { ok: false, problems };
  }
  if (/^postgres(ql)?:\/\//i.test(url)) {
    problems.push(
      'VITE_NEON_URL is a Postgres connection string (it contains a password). Use the HTTPS database URL instead, e.g. https://ep-xxx.<region>.aws.neon.tech/neondb.'
    );
    return { ok: false, problems };
  }
  try {
    const parsed = new URL(url);
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      problems.push('VITE_NEON_URL must use https:// (http is only allowed for localhost).');
    }
    if (parsed.username || parsed.password) {
      problems.push('VITE_NEON_URL must not contain credentials.');
    }
    if (parsed.search) {
      problems.push('VITE_NEON_URL must not contain query parameters.');
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      problems.push('VITE_NEON_URL must end with the database name, e.g. …/neondb.');
    }
  } catch {
    problems.push('VITE_NEON_URL is not a valid URL.');
  }
  return { ok: problems.length === 0, problems };
}

export const neonEnv = validateNeonEnv();

if (!neonEnv.ok && typeof console !== 'undefined') {
  console.error(
    `[MyFav] Neon is not configured — running in local-only mode.\n - ${neonEnv.problems.join('\n - ')}`
  );
}

export type NeonClient = ReturnType<typeof createClient>;

export const neon: NeonClient | null = neonEnv.ok
  ? createClient(rawUrl, {
      // Signed-out visitors get a short-lived anonymous JWT, so public share
      // links (rpc get_public_share, granted to role `anonymous`) work.
      auth: { allowAnonymous: true },
    })
  : null;

export class CloudNotConfiguredError extends Error {
  code = 'myfav/neon-not-configured';
  constructor() {
    super('Cloud sync is not configured for this deployment (missing VITE_NEON_URL).');
    this.name = 'CloudNotConfiguredError';
  }
}

export function requireNeon(): NeonClient {
  if (!neon) throw new CloudNotConfiguredError();
  return neon;
}
