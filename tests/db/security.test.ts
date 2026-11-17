/**
 * security_spec.md "Dirty Dozen" adversarial payloads + RLS isolation,
 * translated from Firestore rules to Supabase/PostgreSQL.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adminRows,
  asA,
  asAnon,
  asB,
  asUnverified,
  pool,
  resetData,
  seedBasic,
  USER_A,
  USER_B,
} from './helpers';

beforeEach(async () => {
  await resetData();
  await seedBasic(USER_A);
  await seedBasic(USER_B, 'b_');
});
afterAll(async () => {
  await pool.end();
});

describe('security_spec Dirty Dozen', () => {
  it('P1 identity spoofing: A cannot create a category owned by B', async () => {
    const r = await asA(
      `insert into public.categories (owner_id, id, name, icon, parent_id, sort_order)
       values ('${USER_B}', 'cat_1', 'Design', 'palette', '', 1)`
    );
    expect(r.error?.message).toMatch(/row-level security/);
    expect(await adminRows(`select 1 from public.categories where id = 'cat_1'`)).toHaveLength(0);
  });

  it('P2 unverified email: user without confirmed email cannot write (table or RPC)', async () => {
    const t = await asUnverified(
      `insert into public.categories (id, name, icon, parent_id) values ('cat_1', 'Design', 'palette', '')`
    );
    expect(t.error?.message).toMatch(/row-level security/);
    const r = await asUnverified(`select public.myfav_create_category('cat_1','Design','palette','')`);
    expect(r.error?.message).toMatch(/not verified/);
    const read = await asUnverified(`select count(*)::int as n from public.categories`);
    expect(read.rows[0].n).toBe(0);
  });

  it('P3 shadow field injection is rejected (unknown column)', async () => {
    const r = await asA(
      `insert into public.bookmarks (id, title, url, category_id, "isAdmin")
       values ('bm_1', 'Figma', 'https://figma.com', 'cat_design', true)`
    );
    expect(r.error?.code).toBe('42703');
  });

  it('P4 orphaned bookmark referencing a non-existent category is rejected at commit', async () => {
    const r = await asA(
      `insert into public.bookmarks (id, title, url, category_id) values ('bm_x', 'Figma', 'https://figma.com', 'non_existent_cat')`
    );
    expect(r.error?.code).toMatch(/23503/);
    const viaRpc = await asA(
      `select public.myfav_save_bookmark('{"title":"F","url":"https://f.com","categoryId":"non_existent_cat"}'::jsonb)`
    );
    expect(viaRpc.error).not.toBeNull();
  });

  it("P5 cross-tenant hijack: A cannot move a bookmark into B's category", async () => {
    const r = await asA(`update public.bookmarks set category_id = 'b_cat_design' where id = 'bm_figma'`);
    expect(r.error?.code).toMatch(/23503/);
    const viaBatch = await asA(
      `select public.myfav_batch_edit_bookmarks(array['bm_figma'], 'b_cat_design', '', 'keep')`
    );
    expect(viaBatch.error).not.toBeNull();
    const row = await adminRows<{ category_id: string }>(
      `select category_id from public.bookmarks where owner_id = '${USER_A}' and id = 'bm_figma'`
    );
    expect(row[0].category_id).toBe('cat_design');
  });

  it('P6 owner_id is immutable on update', async () => {
    const r = await asA(`update public.bookmarks set owner_id = '${USER_B}' where id = 'bm_figma'`);
    expect(r.error).not.toBeNull();
    expect(
      await adminRows(`select 1 from public.bookmarks where owner_id = '${USER_A}' and id = 'bm_figma'`)
    ).toHaveLength(1);
  });

  it('P7 created_at cannot be backdated', async () => {
    const r = await asA(
      `update public.categories set name = 'Renamed', created_at = '2020-01-01T00:00:00Z' where id = 'cat_design'`
    );
    expect(r.error?.message).toMatch(/created_at is immutable/);
  });

  it('P8 forged client timestamps on create are replaced with server time', async () => {
    const r = await asA(
      `insert into public.categories (id, name, icon, parent_id, sort_order, created_at, updated_at)
       values ('cat_forged', 'Icons', 'sparkles', '', 9, '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
       returning created_at, updated_at`
    );
    expect(r.error).toBeNull();
    const created = new Date(r.rows[0].created_at as string).getTime();
    expect(Math.abs(created - Date.now())).toBeLessThan(60_000);
    expect(new Date(r.rows[0].updated_at as string).getUTCFullYear()).not.toBe(2099);
  });

  it('P9 oversized description (10,000 chars) is rejected', async () => {
    const big = 'A'.repeat(10_000);
    const r = await asA(`update public.bookmarks set description = $1 where id = 'bm_figma'`, [big]);
    expect(r.error?.code).toBe('23514');
    // The RPC path truncates exactly like the original server (slice(0, 400)).
    const rpc = await asA<{ d: number }>(
      `select char_length((public.myfav_save_bookmark(jsonb_build_object('id','bm_figma','title','Figma','url','https://figma.com','description',$1::text,'categoryId','cat_design')) ).description) as d`,
      [big]
    );
    expect(rpc.error).toBeNull();
    expect(rpc.rows[0].d).toBe(400);
  });

  it('P10 javascript: URI is rejected (table and RPC)', async () => {
    const r = await asA(
      `insert into public.bookmarks (id, title, url, category_id) values ('bm_xss', 'XSS', 'javascript:alert(1)', 'cat_design')`
    );
    expect(r.error?.code).toBe('23514');
    const rpc = await asA(
      `select public.myfav_save_bookmark('{"title":"XSS","url":"javascript:alert(1)","categoryId":"cat_design"}'::jsonb)`
    );
    expect(rpc.error?.message).toMatch(/Invalid bookmark URL/);
    const sc = await asA(
      `select public.myfav_save_quick_shortcut('{"title":"x","url":"javascript:alert(1)","iconType":"favicon","customIcon":""}'::jsonb)`
    );
    expect(sc.error?.message).toMatch(/Invalid shortcut URL/);
    for (const bad of ['JAVASCRIPT:alert(1)', 'data:text/html,hi', 'ftp://x.com', 'https://']) {
      const x = await asA(
        `insert into public.bookmarks (id, title, url, category_id) values ('bm_bad', 'x', $1, 'cat_design')`,
        [bad]
      );
      expect(x.error?.code, bad).toBe('23514');
    }
  });

  it('P11 path/id poisoning (special chars, >128 chars) is rejected', async () => {
    const r1 = await asA(`insert into public.categories (id, name) values ('invalid$id!@#', 'X')`);
    expect(r1.error?.code).toBe('23514');
    const r2 = await asA(`insert into public.categories (id, name) values ($1, 'X')`, ['a'.repeat(129)]);
    expect(r2.error?.code).toBe('23514');
    // RPC replaces an unclean id with a generated one instead of failing.
    const r3 = await asA<{ id: string }>(`select (public.myfav_create_category('bad id!', 'X', 'zap', '')).id`);
    expect(r3.error).toBeNull();
    expect(r3.rows[0].id).toMatch(/^cat_[a-f0-9]{20,}$/);
  });

  it('P12 unfiltered cross-user list returns only own rows', async () => {
    const r = await asA<{ owner_id: string }>(`select owner_id from public.bookmarks`);
    expect(r.rows.length).toBe(2);
    expect(new Set(r.rows.map((x) => x.owner_id))).toEqual(new Set([USER_A]));
    for (const t of ['categories', 'quick_shortcuts', 'user_settings', 'shared_categories']) {
      const x = await asA<{ n: number }>(`select count(*)::int n from public.${t} where owner_id <> '${USER_A}'`);
      expect(x.rows[0].n, t).toBe(0);
    }
  });
});

describe('RLS isolation between two real users', () => {
  it("B cannot read, update or delete A's rows (silently zero rows)", async () => {
    const read = await asB<{ n: number }>(`select count(*)::int n from public.bookmarks where owner_id = '${USER_A}'`);
    expect(read.rows[0].n).toBe(0);
    const upd = await asB(`update public.bookmarks set title = 'pwned' where owner_id = '${USER_A}' returning id`);
    expect(upd.rows).toHaveLength(0);
    const del = await asB(`delete from public.categories where owner_id = '${USER_A}' returning id`);
    expect(del.rows).toHaveLength(0);
    const still = await adminRows(`select title from public.bookmarks where owner_id = '${USER_A}' and title = 'pwned'`);
    expect(still).toHaveLength(0);
  });

  it("RPCs only ever touch the caller's rows even when given the other user's ids", async () => {
    await asB(`select public.myfav_batch_delete_bookmarks(array['bm_figma','bm_lucide'])`);
    await asB(`select public.myfav_delete_category('cat_design', null)`);
    await asB(`select public.myfav_clear_workspace()`);
    const a = await adminRows(`select id from public.bookmarks where owner_id = '${USER_A}'`);
    expect(a).toHaveLength(2);
    const b = await adminRows(`select id from public.bookmarks where owner_id = '${USER_B}'`);
    expect(b).toHaveLength(0);
  });

  it('same client id may exist for two users without collision', async () => {
    const r = await asB(`select public.myfav_create_category('cat_design', 'Design', 'palette', '')`);
    expect(r.error).toBeNull();
    const rows = await adminRows(`select owner_id from public.categories where id = 'cat_design'`);
    expect(rows).toHaveLength(2);
  });
});

describe('anonymous access', () => {
  it('anon cannot read or write any private table', async () => {
    for (const t of ['categories', 'bookmarks', 'quick_shortcuts', 'user_settings', 'shared_categories']) {
      const r = await asAnon(`select * from public.${t} limit 1`);
      expect(r.error?.message, t).toMatch(/permission denied/);
    }
    const w = await asAnon(`insert into public.categories (owner_id, id, name) values ('${USER_A}', 'x', 'x')`);
    expect(w.error?.message).toMatch(/permission denied/);
  });

  it('anon cannot execute any write RPC', async () => {
    for (const sql of [
      `select public.myfav_clear_workspace()`,
      `select public.myfav_create_category('x','x','x','')`,
      `select public.myfav_import_chrome_plan('{"categories":[],"bookmarks":[]}', true)`,
      `select public.myfav_sync_local_workspace('{}')`,
      `select public.myfav_publish_share('{}')`,
    ]) {
      const r = await asAnon(sql);
      expect(r.error?.message, sql).toMatch(/permission denied/);
    }
  });

  it('anon cannot call private helpers', async () => {
    const r = await asAnon(`select private.is_verified()`);
    expect(r.error?.message).toMatch(/permission denied/);
  });
});

describe('additional constraints', () => {
  it('rejects a third hierarchy level', async () => {
    const r = await asA(`select public.myfav_create_category('deep', 'Deep', 'zap', 'sub_icons')`);
    expect(r.error?.message).toMatch(/two levels/);
  });

  it('rejects a subcategory whose parent belongs to another user', async () => {
    const r = await asA(`select public.myfav_create_category('s_x', 'X', 'zap', 'b_cat_design')`);
    expect(r.error?.code).toBe('23503');
  });

  it('rejects a bookmark whose subcategory belongs to a different root', async () => {
    const r = await asA(
      `select public.myfav_save_bookmark('{"title":"x","url":"https://x.com","categoryId":"cat_dev","subcategoryId":"sub_icons"}'::jsonb)`
    );
    expect(r.error?.message).toMatch(/does not belong/);
  });

  it('settings enums are enforced', async () => {
    const r = await asA(
      `insert into public.user_settings (owner_id, theme_mode) values ('${USER_A}', 'neon')`
    );
    expect(r.error?.code).toBe('23514');
    const ok = await asA(
      `insert into public.user_settings (owner_id, theme_mode, primary_color, glass_intensity, card_density)
       values ('${USER_A}', 'light', '#FF00AA', 'frosted', 'compact')`
    );
    expect(ok.error).toBeNull();
    const bad = await asA(`update public.user_settings set primary_color = 'red;drop' where owner_id = '${USER_A}'`);
    expect(bad.error?.code).toBe('23514');
  });

  it('shortcut icon type enum and favicon/custom_icon consistency', async () => {
    const r = await asA(
      `insert into public.quick_shortcuts (id, title, url, icon_type) values ('q1','x','https://x.com','emoji')`
    );
    expect(r.error?.code).toBe('23514');
  });

  it('share snapshot with non-whitelisted keys or javascript URL is rejected by the table', async () => {
    const r = await asA(
      `insert into public.shared_categories (id, category_id, category_name, subcategories, bookmarks)
       values ('share_x', 'cat_design', 'D', '[]',
               '[{"title":"x","url":"javascript:alert(1)","description":"","subcategoryId":"","isFavorite":false}]')`
    );
    expect(r.error?.code).toBe('23514');
    const r2 = await asA(
      `insert into public.shared_categories (id, category_id, category_name, subcategories, bookmarks)
       values ('share_y', 'cat_design', 'D', '[]',
               '[{"title":"x","url":"https://x.com","description":"","subcategoryId":"","isFavorite":false,"ownerEmail":"a@example.com"}]')`
    );
    expect(r2.error?.code).toBe('23514');
  });
});
