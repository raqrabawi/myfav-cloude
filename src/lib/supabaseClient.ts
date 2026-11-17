import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase browser client.
 *
 * Only the PUBLIC project URL and the publishable (anon) key may be used in the
 * browser. Never put a service-role / secret key in a VITE_* variable.
 *
 * If the variables are missing the app still boots in guest (local-only) mode —
 * exactly like the original when the cloud is unreachable — and every cloud
 * action fails with a clear configuration error.
 */

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const rawKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
).trim();

export interface SupabaseEnvStatus {
  ok: boolean;
  problems: string[];
}

export function validateSupabaseEnv(url = rawUrl, key = rawKey): SupabaseEnvStatus {
  const problems: string[] = [];
  if (!url) {
    problems.push('VITE_SUPABASE_URL is not set.');
  } else {
    try {
      const parsed = new URL(url);
      const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !isLocal) {
        problems.push('VITE_SUPABASE_URL must use https:// (http is only allowed for localhost).');
      }
    } catch {
      problems.push('VITE_SUPABASE_URL is not a valid URL.');
    }
  }
  if (!key) {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) is not set.');
  } else if (/^sb_secret_/i.test(key) || /service_role/i.test(safeJwtRole(key))) {
    problems.push(
      'The configured Supabase key is a SECRET/service-role key. Use the publishable (anon) key in the browser.'
    );
  }
  return { ok: problems.length === 0, problems };
}

function safeJwtRole(key: string): string {
  const parts = key.split('.');
  if (parts.length !== 3) return '';
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json?.role === 'string' ? json.role : '';
  } catch {
    return '';
  }
}

export const supabaseEnv = validateSupabaseEnv();

if (!supabaseEnv.ok && typeof console !== 'undefined') {
  console.error(
    `[MyFav] Supabase is not configured — running in local-only mode.\n - ${supabaseEnv.problems.join('\n - ')}`
  );
}

export const supabase: SupabaseClient | null = supabaseEnv.ok
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'myfav-v2-auth',
      },
    })
  : null;

export class CloudNotConfiguredError extends Error {
  code = 'myfav/supabase-not-configured';
  constructor() {
    super(
      'Cloud sync is not configured for this deployment (missing Supabase URL / publishable key).'
    );
    this.name = 'CloudNotConfiguredError';
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new CloudNotConfiguredError();
  return supabase;
}
