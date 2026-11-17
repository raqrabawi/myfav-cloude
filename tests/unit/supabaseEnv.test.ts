import { describe, expect, it } from 'vitest';
import { validateSupabaseEnv } from '../../src/lib/supabaseClient';

describe('startup env validation', () => {
  it('accepts https URL + publishable key', () => {
    expect(validateSupabaseEnv('https://abc.supabase.co', 'sb_publishable_abc').ok).toBe(true);
  });
  it('allows http only for localhost', () => {
    expect(validateSupabaseEnv('http://127.0.0.1:54321', 'sb_publishable_abc').ok).toBe(true);
    expect(validateSupabaseEnv('http://abc.supabase.co', 'sb_publishable_abc').ok).toBe(false);
  });
  it('rejects missing values', () => {
    const r = validateSupabaseEnv('', '');
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(2);
  });
  it('refuses secret / service-role keys in the browser', () => {
    expect(validateSupabaseEnv('https://a.supabase.co', 'sb_secret_abcdefghijklmnop').ok).toBe(false);
    const payload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '');
    expect(validateSupabaseEnv('https://a.supabase.co', `x.${payload}.y`).ok).toBe(false);
    const anon = btoa(JSON.stringify({ role: 'anon' })).replace(/=+$/, '');
    expect(validateSupabaseEnv('https://a.supabase.co', `x.${anon}.y`).ok).toBe(true);
  });
});
