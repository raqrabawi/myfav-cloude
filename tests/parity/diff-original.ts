/**
 * DIFFERENTIAL PARITY TEST — original server logic vs V2 RPCs.
 *
 * Runs the ORIGINAL MyFav server functions (MyFav-main/src/db/workspace.ts,
 * Drizzle + PostgreSQL) and the V2 Supabase RPCs against two separate local
 * databases with identical inputs, then compares the resulting workspaces
 * (names, icons, hierarchy, order, bookmark placement, counters).
 *
 * Usage (needs the original source tree with its node_modules installed):
 *   ORIGINAL_ROOT=/path/to/MyFav-main \
 *   $ORIGINAL_ROOT/node_modules/.bin/tsx tests/parity/diff-original.ts
 *
 * Env: PGHOST (/tmp), PGPORT (54329), PGUSER (postgres). Creates/drops the
 * databases myfav_orig_diff and uses myfav_test (V2, migrated).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGINAL_ROOT = resolve(process.env.ORIGINAL_ROOT || '../orig/MyFav-main');
const V2_ROOT = resolve(import.meta.dirname, '../..');
const PGHOST = process.env.PGHOST || '/tmp';
const PGPORT = process.env.PGPORT || '54329';
const PGUSER = process.env.PGUSER || 'postgres';
const ORIG_DB = 'myfav_orig_diff';

const v2Require = createRequire(join(V2_ROOT, 'package.json'));
const pg = v2Require('pg');
const { JSDOM } = v2Require('jsdom');
(globalThis as any).DOMParser = new JSDOM('').window.DOMParser;

const admin = new pg.Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: 'postgres' });
await admin.connect();
await admin.query(`drop database if exists ${ORIG_DB} with (force)`);
await admin.query(`create database ${ORIG_DB}`);
await admin.end();

process.env.SQL_HOST = PGHOST;
process.env.SQL_USER = PGUSER;
process.env.SQL_PASSWORD = '';
process.env.SQL_DB_NAME = ORIG_DB;
process.env.PGPORT = PGPORT;
delete process.env.SUPABASE_DB_URL;

const origDb = await import(pathToFileURL(join(ORIGINAL_ROOT, 'src/db/index.ts')).href);
const origUsers = await import(pathToFileURL(join(ORIGINAL_ROOT, 'src/db/users.ts')).href);
const orig = await import(pathToFileURL(join(ORIGINAL_ROOT, 'src/db/workspace.ts')).href);
const { parseChromeBookmarksExactArrangement } = await import(
  pathToFileURL(join(V2_ROOT, 'src/utils/chromeBookmarksParser.ts')).href
);

// The original only auto-creates tables for SUPABASE_DB_URL (SSL forced), so run
// its exact DDL (extracted verbatim from src/db/index.ts) against the local DB.
{
  const src = readFileSync(join(ORIGINAL_ROOT, 'src/db/index.ts'), 'utf8');
  const block = src.slice(src.indexOf('SUPABASE_INIT_STATEMENTS = ['), src.indexOf('];', src.indexOf('SUPABASE_INIT_STATEMENTS = [')));
  const ddl = [...block.matchAll(/`([\s\S]*?)`/g)].map((m) => m[1]);
  if (ddl.length !== 6) throw new Error(`expected 6 DDL statements, found ${ddl.length}`);
  const c = new pg.Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: ORIG_DB });
  await c.connect();
  for (const stmt of ddl) await c.query(stmt);
  await c.end();
}
void origDb;
const ORIG_UID = 'orig_user_a';
await origUsers.getOrCreateUser(ORIG_UID, 'a@example.com');

const V2_UID = '00000000-0000-4000-8000-00000000000a';
const v2 = new pg.Pool({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: process.env.MYFAV_TEST_DB || 'myfav_test', max: 2 });
const origPool = new pg.Pool({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: ORIG_DB, max: 2 });

async function v2Call(sql: string, params: unknown[] = []) {
  const c = await v2.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: V2_UID, role: 'authenticated' })]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

async function resetBoth() {
  await origPool.query(`delete from shared_categories; delete from quick_shortcuts; delete from bookmarks; delete from categories; delete from user_settings;`);
  await v2.query(`truncate public.shared_categories, public.bookmarks, public.quick_shortcuts, public.user_settings, public.categories cascade;
                  delete from neon_auth."user"; insert into neon_auth."user" (id, email, "emailVerified") values ('${V2_UID}', 'a@example.com', true);`);
}

/** Same pre-existing cloud workspace in both systems, created via each system's own API. */
async function seedBoth() {
  const seedCats = [
    { id: 'cat_design', name: 'Design & UI', icon: 'palette', parentId: '' },
    { id: 'cat_tools', name: 'Tools', icon: 'cpu', parentId: '' },
    { id: 'sub_icons', name: 'Icons', icon: 'sparkles', parentId: 'cat_design' },
  ];
  const seedBms = [
    { id: 'bm_seed1', title: 'Figma', url: 'https://www.figma.com/', description: 'seed', categoryId: 'cat_design', subcategoryId: '', isFavorite: true },
    { id: 'bm_seed2', title: 'Lucide', url: 'https://lucide.dev/', description: '', categoryId: 'cat_design', subcategoryId: 'sub_icons', isFavorite: false },
  ];
  for (const c of seedCats) {
    await orig.createCategoryInDb(ORIG_UID, c);
    await v2Call(`select public.myfav_create_category($1,$2,$3,$4)`, [c.id, c.name, c.icon, c.parentId]);
  }
  for (const b of seedBms) {
    await orig.upsertBookmark(ORIG_UID, b);
    await v2Call(`select public.myfav_save_bookmark($1::jsonb)`, [JSON.stringify(b)]);
  }
  for (const s of [{ id: 'qs_1', title: 'HN', url: 'https://news.ycombinator.com/', iconType: 'favicon', customIcon: '' }]) {
    await orig.upsertQuickShortcut(ORIG_UID, s);
    await v2Call(`select public.myfav_save_quick_shortcut($1::jsonb)`, [JSON.stringify(s)]);
  }
}

type Norm = {
  roots: string[];
  subs: string[];
  bookmarks: string[];
  shortcuts: string[];
};

function normalize(cats: any[], bms: any[], scs: any[]): Norm {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const roots = cats.filter((c) => c.parentId === '');
  return {
    roots: roots.map((c) => `${c.name} | ${c.icon} | #${c.order}`),
    subs: cats
      .filter((c) => c.parentId !== '')
      .map((c) => `${byId.get(c.parentId)?.name ?? '??'} > ${c.name} | ${c.icon} | #${c.order}`),
    bookmarks: bms.map(
      (b) =>
        `${b.title} | ${b.url} | ${byId.get(b.categoryId)?.name ?? '??'} > ${
          b.subcategoryId ? byId.get(b.subcategoryId)?.name ?? '??' : ''
        } | fav=${b.isFavorite} | ${b.description}`
    ),
    shortcuts: scs.map((s) => `${s.title} | ${s.url} | ${s.iconType} | ${s.customIcon} | #${s.order}`),
  };
}

async function snapshotOrig(): Promise<Norm> {
  const ws = await orig.getUserWorkspace(ORIG_UID);
  return normalize(ws.categories, ws.bookmarks, ws.quickShortcuts);
}

async function snapshotV2(): Promise<Norm> {
  // Same ordering as src/lib/apiClient.ts getWorkspace()
  const cats = await v2Call(`select id, name, icon, parent_id as "parentId", sort_order as "order" from public.categories order by sort_order, created_at, seq`);
  const bms = await v2Call(`select title, url, description, category_id as "categoryId", subcategory_id as "subcategoryId", is_favorite as "isFavorite" from public.bookmarks order by created_at, seq`);
  const scs = await v2Call(`select title, url, icon_type as "iconType", custom_icon as "customIcon", sort_order as "order" from public.quick_shortcuts order by sort_order, created_at, seq`);
  return normalize(cats, bms, scs);
}

let failures = 0;
const results: string[] = [];

function compare(name: string, a: unknown, b: unknown) {
  const ja = JSON.stringify(a, null, 1);
  const jb = JSON.stringify(b, null, 1);
  const size = Array.isArray(a) ? ` [${a.length} rows]` : ` ${JSON.stringify(a)}`;
  if (ja === jb) {
    results.push(`PASS  ${name}${size}`);
  } else {
    failures++;
    results.push(`FAIL  ${name}`);
    const la = ja.split('\n');
    const lb = jb.split('\n');
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) {
        results.push(`      first difference at line ${i}:\n        original: ${la[i]}\n        v2      : ${lb[i]}`);
        break;
      }
    }
  }
}

async function importScenario(label: string, fixture: string, replace: boolean, seed: boolean, twice = false) {
  await resetBoth();
  if (seed) await seedBoth();
  const html = readFileSync(join(V2_ROOT, 'tests/fixtures', fixture), 'utf8');
  const plan = parseChromeBookmarksExactArrangement(html);
  const runs = twice ? 2 : 1;
  let so: any, sv: any;
  for (let i = 0; i < runs; i++) {
    so = await orig.importChromePlanToDb(ORIG_UID, plan, replace);
    [sv] = await v2Call(`select public.myfav_import_chrome_plan($1::jsonb, $2) as s`, [JSON.stringify(plan), replace]);
    sv = sv.s;
  }
  const t0 = Date.now();
  const o = await snapshotOrig();
  const v = await snapshotV2();
  compare(`${label}: summary counters`, {
    addedCategories: so.addedCategories,
    addedBookmarks: so.addedBookmarks,
    skippedDuplicates: so.skippedDuplicates,
    expanded: so.expandedCategoryIds.length,
  }, {
    addedCategories: sv.addedCategories,
    addedBookmarks: sv.addedBookmarks,
    skippedDuplicates: sv.skippedDuplicates,
    expanded: sv.expandedCategoryIds.length,
  });
  compare(`${label}: root categories`, o.roots, v.roots);
  compare(`${label}: subcategories`, o.subs, v.subs);
  compare(`${label}: bookmarks (order + placement)`, o.bookmarks, v.bookmarks);
  compare(`${label}: quick shortcuts`, o.shortcuts, v.shortcuts);
  void t0;
}

async function syncScenario(label: string, seed: boolean) {
  await resetBoth();
  if (seed) await seedBoth();
  // A guest workspace as App.tsx keeps it in localStorage.
  const local = {
    categories: [
      { id: 'cat_l1', name: '  design & ui ', icon: 'palette', parentId: '', order: 0 },
      { id: 'cat_l2', name: 'Reading', icon: 'book-open', parentId: '', order: 1 },
      { id: 'cat_l3', name: '', icon: '<bad>', parentId: '', order: 2 },
      { id: 'sub_l1', name: 'Icons', icon: 'zap', parentId: 'cat_l1', order: 0 },
      { id: 'sub_l2', name: 'Fonts', icon: 'pen-tool', parentId: 'cat_l1', order: 1 },
      { id: 'sub_l3', name: 'Orphan', icon: 'zap', parentId: 'missing', order: 0 },
      { id: 'bad id!', name: 'Weird Id', icon: 'zap', parentId: '', order: 3 },
    ],
    bookmarks: [
      { id: 'bm_l1', title: 'Figma again', url: 'https://www.figma.com/', description: '', categoryId: 'cat_l1', subcategoryId: '', isFavorite: false },
      { id: 'bm_l2', title: 'Fontshare', url: 'https://fontshare.com', description: 'fonts', categoryId: 'cat_l1', subcategoryId: 'sub_l2', isFavorite: true },
      { id: 'bm_l3', title: 'Bad', url: 'javascript:alert(1)', description: '', categoryId: 'cat_l2', subcategoryId: '', isFavorite: false },
      { id: 'bm_l4', title: '  ', url: '  https://paulgraham.com  ', description: 'x'.repeat(500), categoryId: 'cat_l2', subcategoryId: '', isFavorite: false },
      { id: 'bm_l5', title: 'Dup in payload', url: 'https://FONTSHARE.com', description: '', categoryId: 'cat_l2', subcategoryId: '', isFavorite: false },
      { id: 'bm_l6', title: 'Unknown cat', url: 'https://nowhere.dev', description: '', categoryId: 'cat_missing', subcategoryId: '', isFavorite: false },
      { id: 'bm_l7', title: 'In weird', url: 'https://weird.dev', description: '', categoryId: 'bad id!', subcategoryId: '', isFavorite: false },
      { id: 'bm_l8', title: 'Untitled cat', url: 'https://untitled.dev', description: '', categoryId: 'cat_l3', subcategoryId: '', isFavorite: false },
    ],
    quickShortcuts: [
      { id: 'qs_l1', title: 'HN dup', url: 'https://news.ycombinator.com/', iconType: 'favicon', customIcon: '', order: 0 },
      { id: 'qs_l2', title: '', url: 'https://github.com', iconType: 'lucide', customIcon: 'code-2', order: 1 },
      { id: 'qs_l3', title: 'Img', url: 'https://example.com', iconType: 'custom', customIcon: 'https://example.com/i.png', order: 2 },
      { id: 'qs_l4', title: 'Bad', url: 'ftp://x', iconType: 'favicon', customIcon: '', order: 3 },
    ],
  };
  await orig.syncLocalWorkspaceToCloud(ORIG_UID, local);
  await v2Call(`select public.myfav_sync_local_workspace($1::jsonb)`, [JSON.stringify(local)]);
  const o = await snapshotOrig();
  const v = await snapshotV2();
  compare(`${label}: root categories`, o.roots, v.roots);
  compare(`${label}: subcategories`, o.subs, v.subs);
  compare(`${label}: bookmarks (order + placement)`, o.bookmarks, v.bookmarks);
  compare(`${label}: quick shortcuts`, o.shortcuts, v.shortcuts);
}

await importScenario('import MERGE basic into empty workspace', 'chrome-basic.html', false, false);
await importScenario('import MERGE basic into seeded workspace', 'chrome-basic.html', false, true);
await importScenario('import MERGE basic twice (all duplicates second time)', 'chrome-basic.html', false, true, true);
await importScenario('import REPLACE basic over seeded workspace', 'chrome-basic.html', true, true);
await importScenario('import MERGE malformed file', 'chrome-malformed.html', false, true);
await importScenario('import MERGE empty file', 'chrome-empty.html', false, true);
await importScenario('import MERGE large 5000 into seeded workspace', 'chrome-large-5000.html', false, true);
await importScenario('import REPLACE large 5000', 'chrome-large-5000.html', true, true);
await syncScenario('sync-local guest data into empty cloud', false);
await syncScenario('sync-local guest data into seeded cloud', true);

console.log(results.join('\n'));
console.log(`\n${failures === 0 ? 'ALL PARITY CHECKS PASSED' : `${failures} PARITY CHECK(S) FAILED`}`);
await v2.end();
await origPool.end();
process.exit(failures === 0 ? 0 : 1);
