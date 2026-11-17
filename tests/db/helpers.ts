/**
 * Test harness that executes SQL exactly the way Supabase's PostgREST does:
 * inside a transaction, `SET LOCAL ROLE authenticated|anon` and the JWT claims
 * in `request.jwt.claims`. Deferred constraint triggers fire at COMMIT, so
 * every call commits (or reports the commit-time error).
 */
import pg from 'pg';

export const pool = new pg.Pool({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || 'postgres',
  database: process.env.MYFAV_TEST_DB || 'myfav_test',
  max: 8,
});

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
export const USER_UNVERIFIED = '00000000-0000-4000-8000-0000000000cc';

export async function resetData() {
  await pool.query(`
    truncate public.shared_categories, public.bookmarks, public.quick_shortcuts,
             public.user_settings, public.categories cascade;
    delete from auth.users;
    insert into auth.users (id, email, email_confirmed_at) values
      ('${USER_A}', 'a@example.com', now()),
      ('${USER_B}', 'b@example.com', now()),
      ('${USER_UNVERIFIED}', 'c@example.com', null);
  `);
}

export interface RunResult<T = Record<string, unknown>> {
  rows: T[];
  error: (Error & { code?: string }) | null;
}

/** Runs one or more statements as `role` with `sub` claim, in one transaction. */
export async function runAs<T = Record<string, unknown>>(
  who: { role: 'authenticated' | 'anon'; sub?: string },
  sql: string,
  params: unknown[] = []
): Promise<RunResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${who.role}`);
    const claims = JSON.stringify(who.sub ? { sub: who.sub, role: who.role } : { role: who.role });
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const raw = (await client.query(sql, params)) as unknown;
    const res = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as { rows: T[] };
    await client.query('commit');
    return { rows: res.rows, error: null };
  } catch (e) {
    try {
      await client.query('rollback');
    } catch {
      // ignore
    }
    return { rows: [], error: e as Error & { code?: string } };
  } finally {
    client.release();
  }
}

export const asA = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  runAs<T>({ role: 'authenticated', sub: USER_A }, sql, params);
export const asB = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  runAs<T>({ role: 'authenticated', sub: USER_B }, sql, params);
export const asUnverified = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  runAs<T>({ role: 'authenticated', sub: USER_UNVERIFIED }, sql, params);
export const asAnon = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  runAs<T>({ role: 'anon' }, sql, params);

/** Superuser read for assertions (bypasses RLS). */
export async function adminRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await pool.query(sql, params)).rows as T[];
}

export async function seedBasic(uid: string, prefix = '') {
  const r = await runAs({ role: 'authenticated', sub: uid }, `
    select public.myfav_create_category('${prefix}cat_design', 'Design', 'palette', '');
    select public.myfav_create_category('${prefix}cat_dev', 'Development', 'code-2', '');
    select public.myfav_create_category('${prefix}sub_icons', 'Icons', 'sparkles', '${prefix}cat_design');
    select public.myfav_save_bookmark('{"id":"${prefix}bm_figma","title":"Figma","url":"https://figma.com","description":"UI","categoryId":"${prefix}cat_design","subcategoryId":"","isFavorite":false}'::jsonb);
    select public.myfav_save_bookmark('{"id":"${prefix}bm_lucide","title":"Lucide","url":"https://lucide.dev","description":"","categoryId":"${prefix}cat_design","subcategoryId":"${prefix}sub_icons","isFavorite":true}'::jsonb);
  `);
  if (r.error) throw r.error;
}
