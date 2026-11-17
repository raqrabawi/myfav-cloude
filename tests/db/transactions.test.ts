/**
 * Atomicity, concurrency and scale of the multi-record RPCs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseChromeBookmarksExactArrangement } from '../../src/utils/chromeBookmarksParser';
import { adminRows, asA, pool, resetData, seedBasic, USER_A } from './helpers';

(globalThis as unknown as { DOMParser: unknown }).DOMParser = new JSDOM('').window.DOMParser;
const fixture = (n: string) => readFileSync(join(__dirname, '../fixtures', n), 'utf8');

beforeEach(async () => {
  await resetData();
  await seedBasic(USER_A);
});
afterAll(async () => {
  await pool.end();
});

const countBms = async () =>
  (await adminRows<{ n: number }>(`select count(*)::int n from public.bookmarks where owner_id = '${USER_A}'`))[0].n;

describe('atomicity', () => {
  it('a REPLACE import cancelled mid-flight leaves the previous workspace untouched', async () => {
    const plan = parseChromeBookmarksExactArrangement(fixture('chrome-large-5000.html'));
    const client = await pool.connect();
    let err: Error | null = null;
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: USER_A, role: 'authenticated' })]);
      await client.query(`set local statement_timeout = '150ms'`);
      await client.query(`select public.myfav_import_chrome_plan($1::jsonb, true)`, [JSON.stringify(plan)]);
      await client.query('commit');
    } catch (e) {
      err = e as Error;
      await client.query('rollback');
    } finally {
      client.release();
    }
    expect(err?.message).toMatch(/statement timeout|canceling/);
    expect(await countBms()).toBe(2);
    const cats = await adminRows(`select id from public.categories where owner_id = '${USER_A}' order by id`);
    expect(cats.map((c: Record<string, unknown>) => c.id)).toEqual(['cat_design', 'cat_dev', 'sub_icons']);
  });

  it('an error after the RPC inside the same request rolls everything back', async () => {
    const r = await asA(`select public.myfav_clear_workspace(); select 1/0;`);
    expect(r.error?.message).toMatch(/division by zero/);
    expect(await countBms()).toBe(2);
  });
});

describe('concurrency', () => {
  it('two simultaneous MERGE imports of the same file do not create duplicates', async () => {
    const plan = JSON.stringify(parseChromeBookmarksExactArrangement(fixture('chrome-basic.html')));
    const [r1, r2] = await Promise.all([
      asA<{ s: { addedBookmarks: number; skippedDuplicates: number } }>(`select public.myfav_import_chrome_plan($1::jsonb, false) s`, [plan]),
      asA<{ s: { addedBookmarks: number; skippedDuplicates: number } }>(`select public.myfav_import_chrome_plan($1::jsonb, false) s`, [plan]),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const added = [r1.rows[0].s.addedBookmarks, r2.rows[0].s.addedBookmarks].sort();
    expect(added[0]).toBe(0); // the second one (serialised by the advisory lock) sees everything as duplicate
    const dupUrls = await adminRows(
      `select lower(url) u, count(*) from public.bookmarks where owner_id = '${USER_A}' group by 1 having count(*) > 1`
    );
    expect(dupUrls).toHaveLength(0);
    const rootNames = await adminRows(
      `select lower(name) n, count(*) from public.categories where owner_id = '${USER_A}' and parent_id = '' group by 1 having count(*) > 1`
    );
    expect(rootNames).toHaveLength(0);
  });

  it('concurrent quick-shortcut creates get distinct, gap-free orders', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        asA(`select public.myfav_save_quick_shortcut(jsonb_build_object('title','S','url','https://s' || $1::text || '.dev'))`, [String(i)])
      )
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    const orders = (await adminRows<{ sort_order: number }>(`select sort_order from public.quick_shortcuts order by 1`)).map((r) => r.sort_order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('scale', () => {
  it('imports 5,000 bookmarks (REPLACE) in one transaction within a reasonable time', async () => {
    const plan = JSON.stringify(parseChromeBookmarksExactArrangement(fixture('chrome-large-5000.html')));
    const t0 = Date.now();
    const r = await asA<{ s: { addedBookmarks: number; addedCategories: number } }>(
      `select public.myfav_import_chrome_plan($1::jsonb, true) s`,
      [plan]
    );
    const ms = Date.now() - t0;
    expect(r.error).toBeNull();
    expect(r.rows[0].s.addedBookmarks).toBe(5000);
    expect(r.rows[0].s.addedCategories).toBe(250);
    console.log(`[scale] 5,000-bookmark replace import committed in ${ms} ms`);
    expect(ms).toBeLessThan(20_000);
  });
});
