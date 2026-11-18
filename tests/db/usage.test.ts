/**
 * Website usage counter (migration 0003): drives the Main Page order
 * "pinned first, then most used, then A–Z".
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminRows, asA, asAnon, asB, asUnverified, pool, resetData, seedBasic, USER_A, USER_B } from './helpers';

beforeEach(async () => {
  await resetData();
  await seedBasic(USER_A);
  await seedBasic(USER_B);
});
afterAll(async () => {
  await pool.end();
});

const usage = async (owner: string, id: string) =>
  (
    await adminRows<{ open_count: number; last_opened_at: string | null; updated_at: string }>(
      `select open_count, last_opened_at, updated_at::text from public.bookmarks where owner_id = $1 and id = $2`,
      [owner, id]
    )
  )[0];

const firstBookmarkId = async (owner: string) =>
  (await adminRows<{ id: string }>(`select id from public.bookmarks where owner_id = $1 order by created_at, seq limit 1`, [owner]))[0].id;

describe('myfav_record_bookmark_open', () => {
  it('new bookmarks start at 0 opens', async () => {
    const id = await firstBookmarkId(USER_A);
    expect(await usage(USER_A, id)).toMatchObject({ open_count: 0, last_opened_at: null });
  });

  it('increments atomically and records the time, without changing updated_at', async () => {
    const id = await firstBookmarkId(USER_A);
    const before = await usage(USER_A, id);
    for (let i = 0; i < 3; i++) {
      const r = await asA(`select public.myfav_record_bookmark_open($1)`, [id]);
      expect(r.error).toBeFalsy();
    }
    const after = await usage(USER_A, id);
    expect(after.open_count).toBe(3);
    expect(after.last_opened_at).not.toBeNull();
    expect(after.updated_at).toBe(before.updated_at);
  });

  it('a real edit still bumps updated_at', async () => {
    const id = await firstBookmarkId(USER_A);
    const before = await usage(USER_A, id);
    await new Promise((r) => setTimeout(r, 20));
    await asA(`update public.bookmarks set title = 'Edited' where id = $1`, [id]);
    expect((await usage(USER_A, id)).updated_at).not.toBe(before.updated_at);
  });

  it("cannot count another user's bookmark (same id, other owner unchanged)", async () => {
    const idB = await firstBookmarkId(USER_B);
    await asA(`select public.myfav_record_bookmark_open($1)`, [idB]);
    expect((await usage(USER_B, idB)).open_count).toBe(0);
    // A's own bookmark with that id (seeded identically) is the only one counted
    const own = await usage(USER_A, idB);
    if (own) expect(own.open_count).toBe(1);
  });

  it('anonymous and unverified users are refused', async () => {
    const id = await firstBookmarkId(USER_A);
    expect((await asAnon(`select public.myfav_record_bookmark_open($1)`, [id])).error).toBeTruthy();
    const u = await asUnverified(`select public.myfav_record_bookmark_open($1)`, [id]);
    expect(u.error).toBeTruthy();
    expect((await usage(USER_A, id)).open_count).toBe(0);
  });

  it('rejects malformed ids', async () => {
    const r = await asA(`select public.myfav_record_bookmark_open($1)`, ['bad id; drop table']);
    expect(r.error?.message).toMatch(/invalid bookmark id/);
  });
});
