/**
 * Functional / transactional behaviour of the RPCs, compared with the
 * original server semantics in MyFav-main/src/db/workspace.ts.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminRows, asA, asAnon, asB, pool, resetData, runAs, seedBasic, USER_A } from './helpers';

beforeEach(async () => {
  await resetData();
});
afterAll(async () => {
  await pool.end();
});

const cats = () =>
  adminRows<{ id: string; name: string; parent_id: string; sort_order: number; icon: string }>(
    `select id, name, parent_id, sort_order, icon from public.categories where owner_id = '${USER_A}' order by parent_id, sort_order, created_at, seq`
  );
const bms = () =>
  adminRows<{ id: string; title: string; url: string; category_id: string; subcategory_id: string; is_favorite: boolean; description: string }>(
    `select id, title, url, category_id, subcategory_id, is_favorite, description from public.bookmarks where owner_id = '${USER_A}' order by created_at, seq`
  );

describe('categories', () => {
  it('create assigns order = sibling count and keeps the client id', async () => {
    await seedBasic(USER_A);
    const c = await cats();
    expect(c.filter((x) => x.parent_id === '').map((x) => [x.id, x.sort_order])).toEqual([
      ['cat_design', 0],
      ['cat_dev', 1],
    ]);
    expect(c.find((x) => x.id === 'sub_icons')).toMatchObject({ parent_id: 'cat_design', sort_order: 0 });
  });

  it('create rejects empty names and cleans unknown icons to "bookmark"', async () => {
    expect((await asA(`select public.myfav_create_category('c1', '   ', 'zap', '')`)).error?.message).toMatch(/required/);
    const r = await asA<{ icon: string }>(`select (public.myfav_create_category('c2', 'X', '<svg>', '')).icon`);
    expect(r.rows[0].icon).toBe('bookmark');
  });

  it('delete root WITHOUT fallback deletes its bookmarks, subcategories and share', async () => {
    await seedBasic(USER_A);
    await asA(`select public.myfav_publish_share('{"categoryId":"cat_design","categoryName":"Design","categoryIcon":"palette","subcategories":[],"bookmarks":[]}'::jsonb)`);
    const r = await asA(`select public.myfav_delete_category('cat_design', null)`);
    expect(r.error).toBeNull();
    expect((await cats()).map((c) => c.id)).toEqual(['cat_dev']);
    expect(await bms()).toHaveLength(0);
    expect(await adminRows(`select 1 from public.shared_categories`)).toHaveLength(0);
  });

  it('delete root WITH fallback reassigns bookmarks (subcategory cleared)', async () => {
    await seedBasic(USER_A);
    const r = await asA(`select public.myfav_delete_category('cat_design', 'cat_dev')`);
    expect(r.error).toBeNull();
    const b = await bms();
    expect(b).toHaveLength(2);
    expect(b.every((x) => x.category_id === 'cat_dev' && x.subcategory_id === '')).toBe(true);
  });

  it('delete root with an invalid fallback (sub / own id / other user) fails atomically', async () => {
    await seedBasic(USER_A);
    for (const fb of ['sub_icons', 'cat_design', 'b_cat_design']) {
      const r = await asA(`select public.myfav_delete_category('cat_design', $1)`, [fb]);
      expect(r.error, fb).not.toBeNull();
    }
    expect(await cats()).toHaveLength(3);
    expect(await bms()).toHaveLength(2);
  });

  it('delete subcategory clears subcategory_id on its bookmarks', async () => {
    await seedBasic(USER_A);
    await asA(`select public.myfav_delete_category('sub_icons', null)`);
    const b = await bms();
    expect(b.find((x) => x.id === 'bm_lucide')).toMatchObject({ category_id: 'cat_design', subcategory_id: '' });
  });

  it('update category name/icon', async () => {
    await seedBasic(USER_A);
    const r = await asA(`update public.categories set name = 'Design 2', icon = 'zap' where id = 'cat_design'`);
    expect(r.error).toBeNull();
    expect((await cats()).find((c) => c.id === 'cat_design')).toMatchObject({ name: 'Design 2', icon: 'zap' });
  });
});

describe('category tree drag/drop (reorder RPC)', () => {
  it('root with children dropped INSIDE another root: children + bookmarks re-homed atomically', async () => {
    await seedBasic(USER_A);
    // Mirrors App.tsx handleCategoryTreeDrop payload for dragging cat_design into cat_dev.
    const payload = {
      draggedId: 'cat_design',
      newParentId: 'cat_dev',
      reorderedSiblings: [{ id: 'cat_design', order: 0 }],
      childSubsToMove: [{ id: 'sub_icons', order: 1 }],
      bookmarksToUpdate: [
        { id: 'bm_figma', categoryId: 'cat_dev', subcategoryId: 'cat_design' },
        { id: 'bm_lucide', categoryId: 'cat_dev', subcategoryId: 'sub_icons' },
      ],
    };
    const r = await asA(`select public.myfav_reorder_category_tree($1::jsonb)`, [JSON.stringify(payload)]);
    expect(r.error).toBeNull();
    const c = await cats();
    expect(c.find((x) => x.id === 'cat_design')?.parent_id).toBe('cat_dev');
    expect(c.find((x) => x.id === 'sub_icons')?.parent_id).toBe('cat_dev');
    const b = await bms();
    expect(b.every((x) => x.category_id === 'cat_dev')).toBe(true);
  });

  it('subcategory dragged out to become a root', async () => {
    await seedBasic(USER_A);
    const payload = {
      draggedId: 'sub_icons',
      newParentId: '',
      reorderedSiblings: [
        { id: 'cat_design', order: 0 },
        { id: 'sub_icons', order: 1 },
        { id: 'cat_dev', order: 2 },
      ],
      childSubsToMove: [],
      bookmarksToUpdate: [{ id: 'bm_lucide', categoryId: 'sub_icons', subcategoryId: '' }],
    };
    const r = await asA(`select public.myfav_reorder_category_tree($1::jsonb)`, [JSON.stringify(payload)]);
    expect(r.error).toBeNull();
    const roots = (await cats()).filter((x) => x.parent_id === '').map((x) => x.id);
    expect(roots).toEqual(['cat_design', 'sub_icons', 'cat_dev']);
  });

  it('an inconsistent move (would orphan bookmarks / create 3 levels) rolls back completely', async () => {
    await seedBasic(USER_A);
    const before = await cats();
    const payload = {
      draggedId: 'cat_design',
      newParentId: 'cat_dev',
      reorderedSiblings: [{ id: 'cat_design', order: 0 }],
      childSubsToMove: [], // children NOT moved -> 3 levels
      bookmarksToUpdate: [],
    };
    const r = await asA(`select public.myfav_reorder_category_tree($1::jsonb)`, [JSON.stringify(payload)]);
    expect(r.error).not.toBeNull();
    expect(await cats()).toEqual(before);
  });

  it('sibling reorder only changes order', async () => {
    await seedBasic(USER_A);
    const payload = {
      draggedId: 'cat_dev',
      newParentId: '',
      reorderedSiblings: [
        { id: 'cat_dev', order: 0 },
        { id: 'cat_design', order: 1 },
      ],
      childSubsToMove: [],
      bookmarksToUpdate: [],
    };
    expect((await asA(`select public.myfav_reorder_category_tree($1::jsonb)`, [JSON.stringify(payload)])).error).toBeNull();
    expect((await cats()).filter((x) => x.parent_id === '').map((x) => x.id)).toEqual(['cat_dev', 'cat_design']);
  });
});

describe('bookmarks', () => {
  it('save creates with generated id when none given; update keeps id & created_at', async () => {
    await seedBasic(USER_A);
    const c = await asA<{ id: string; created_at: string }>(
      `select (r).id, (r).created_at from (select public.myfav_save_bookmark('{"title":"  New  ","url":"  https://new.dev  ","description":"d","categoryId":"cat_dev","subcategoryId":"","isFavorite":true}'::jsonb) r) s`
    );
    expect(c.error).toBeNull();
    expect(c.rows[0].id).toMatch(/^bm_/);
    const id = c.rows[0].id;
    const u = await asA<{ title: string; created_at: string; url: string }>(
      `select (r).title, (r).created_at, (r).url from (select public.myfav_save_bookmark(jsonb_build_object('id',$1::text,'title','Renamed','url','https://new.dev/x','categoryId','cat_dev')) r) s`,
      [id]
    );
    expect(u.rows[0].title).toBe('Renamed');
    expect(new Date(u.rows[0].created_at).getTime()).toBe(new Date(c.rows[0].created_at).getTime());
    const all = await bms();
    expect(all.find((b) => b.id === id)).toMatchObject({ title: 'Renamed', url: 'https://new.dev/x' });
  });

  it('title falls back to URL and is trimmed / capped at 120', async () => {
    await seedBasic(USER_A);
    const r = await asA<{ title: string }>(
      `select (public.myfav_save_bookmark('{"title":"   ","url":"https://only-url.dev","categoryId":"cat_dev"}'::jsonb)).title`
    );
    expect(r.rows[0].title).toBe('https://only-url.dev');
    const long = 'T'.repeat(300);
    const r2 = await asA<{ n: number }>(
      `select char_length((public.myfav_save_bookmark(jsonb_build_object('title',$1::text,'url','https://x.dev','categoryId','cat_dev'))).title) n`,
      [long]
    );
    expect(r2.rows[0].n).toBe(120);
  });

  it('favorite toggle, batch edit (move + favorite) and batch delete', async () => {
    await seedBasic(USER_A);
    await asA(`update public.bookmarks set is_favorite = true where id = 'bm_figma'`);
    expect((await bms()).find((b) => b.id === 'bm_figma')?.is_favorite).toBe(true);

    const e = await asA(`select public.myfav_batch_edit_bookmarks(array['bm_figma','bm_lucide'], 'cat_dev', '', 'unfavorite')`);
    expect(e.error).toBeNull();
    expect((await bms()).every((b) => b.category_id === 'cat_dev' && !b.is_favorite && b.subcategory_id === '')).toBe(true);

    const keep = await asA(`select public.myfav_batch_edit_bookmarks(array['bm_figma'], null, null, 'favorite')`);
    expect(keep.error).toBeNull();
    expect((await bms()).find((b) => b.id === 'bm_figma')).toMatchObject({ is_favorite: true, category_id: 'cat_dev' });

    await asA(`select public.myfav_batch_delete_bookmarks(array['bm_figma','bm_lucide'])`);
    expect(await bms()).toHaveLength(0);
  });

  it('batch edit is all-or-nothing when the target is invalid', async () => {
    await seedBasic(USER_A);
    const r = await asA(`select public.myfav_batch_edit_bookmarks(array['bm_figma','bm_lucide'], 'cat_dev', 'sub_icons', 'favorite')`);
    expect(r.error).not.toBeNull();
    const b = await bms();
    expect(b.find((x) => x.id === 'bm_figma')).toMatchObject({ category_id: 'cat_design', is_favorite: false });
  });
});

describe('quick shortcuts', () => {
  it('create appends with order = count, update keeps order, reorder is atomic', async () => {
    for (const [id, url] of [['qs_a', 'https://a.dev'], ['qs_b', 'https://b.dev'], ['qs_c', 'https://c.dev']]) {
      const r = await asA(
        `select public.myfav_save_quick_shortcut(jsonb_build_object('id',$1::text,'title','S','url',$2::text,'iconType','favicon','customIcon','ignored'))`,
        [id, url]
      );
      expect(r.error).toBeNull();
    }
    let rows = await adminRows<{ id: string; sort_order: number; custom_icon: string }>(
      `select id, sort_order, custom_icon from public.quick_shortcuts order by sort_order`
    );
    expect(rows.map((r) => [r.id, r.sort_order])).toEqual([['qs_a', 0], ['qs_b', 1], ['qs_c', 2]]);
    expect(rows.every((r) => r.custom_icon === '')).toBe(true);

    await asA(`select public.myfav_save_quick_shortcut('{"id":"qs_b","title":"B2","url":"https://b.dev","iconType":"lucide","customIcon":"zap"}'::jsonb)`);
    await asA(`select public.myfav_reorder_quick_shortcuts(array['qs_c','qs_a','qs_b'])`);
    rows = await adminRows(`select id, sort_order, custom_icon from public.quick_shortcuts order by sort_order`);
    expect(rows.map((r) => r.id)).toEqual(['qs_c', 'qs_a', 'qs_b']);
    expect(rows.find((r) => r.id === 'qs_b')?.custom_icon).toBe('zap');

    await asA(`delete from public.quick_shortcuts where id = 'qs_a'`);
    expect(await adminRows(`select 1 from public.quick_shortcuts`)).toHaveLength(2);
  });
});

describe('settings', () => {
  it('upsert insert then update (theme/color/glass/density)', async () => {
    const sql = `insert into public.user_settings (owner_id, theme_mode, primary_color, glass_intensity, card_density)
                 values ('${USER_A}', $1, $2, $3, $4)
                 on conflict (owner_id) do update set theme_mode = excluded.theme_mode, primary_color = excluded.primary_color,
                   glass_intensity = excluded.glass_intensity, card_density = excluded.card_density`;
    expect((await asA(sql, ['dark', 'blue', 'balanced', 'comfortable'])).error).toBeNull();
    expect((await asA(sql, ['light', '#14B8A6', 'frosted', 'compact'])).error).toBeNull();
    const s = await adminRows(`select theme_mode, primary_color, glass_intensity, card_density from public.user_settings`);
    expect(s[0]).toEqual({ theme_mode: 'light', primary_color: '#14B8A6', glass_intensity: 'frosted', card_density: 'compact' });
  });
});

describe('sharing', () => {
  const publish = (extra = {}) =>
    asA<{ id: string }>(`select (public.myfav_publish_share($1::jsonb)).id`, [
      JSON.stringify({
        categoryId: 'cat_design',
        categoryName: 'Design',
        categoryIcon: 'palette',
        subcategories: [{ id: 'sub_icons', name: 'Icons', icon: 'sparkles', order: 0, secret: 'x' }],
        bookmarks: [
          { title: 'Figma', url: 'https://figma.com', description: 'UI', subcategoryId: '', isFavorite: false, ownerEmail: 'a@example.com' },
          { title: 'Bad', url: 'javascript:alert(1)', description: '', subcategoryId: '', isFavorite: false },
        ],
        ...extra,
      }),
    ]);

  it('publish -> anonymous read (whitelisted) -> update in place -> revoke', async () => {
    await seedBasic(USER_A);
    const p = await publish();
    expect(p.error).toBeNull();
    const shareId = p.rows[0].id;
    expect(shareId).toMatch(/^share_[a-f0-9]{32}$/);

    const pub = await asAnon<{ s: Record<string, unknown> }>(`select public.get_public_share($1) s`, [shareId]);
    expect(pub.error).toBeNull();
    const s = pub.rows[0].s as { ownerId: string; bookmarks: Array<Record<string, unknown>>; subcategories: Array<Record<string, unknown>> };
    expect(s.ownerId).toBe('');
    expect(JSON.stringify(s)).not.toContain(USER_A);
    expect(JSON.stringify(s)).not.toContain('a@example.com');
    expect(s.bookmarks).toHaveLength(1); // javascript: URL dropped
    expect(Object.keys(s.bookmarks[0]).sort()).toEqual(['description', 'isFavorite', 'subcategoryId', 'title', 'url']);
    expect(Object.keys(s.subcategories[0]).sort()).toEqual(['icon', 'id', 'name', 'order']);

    const upd = await publish({ existingShareId: shareId, categoryName: 'Design v2' });
    expect(upd.rows[0].id).toBe(shareId);
    const pub2 = await asAnon<{ s: { categoryName: string } }>(`select public.get_public_share($1) s`, [shareId]);
    expect(pub2.rows[0].s.categoryName).toBe('Design v2');

    await asA(`delete from public.shared_categories where id = $1`, [shareId]);
    const gone = await asAnon<{ s: unknown }>(`select public.get_public_share($1) s`, [shareId]);
    expect(gone.rows[0].s).toBeNull();
  });

  it("another user cannot update A's share via existingShareId (creates own share instead / fails)", async () => {
    await seedBasic(USER_A);
    await seedBasic('00000000-0000-4000-8000-00000000000b', 'b_');
    const p = await publish();
    const shareId = p.rows[0].id;
    const r = await asB(`select (public.myfav_publish_share($1::jsonb)).id`, [
      JSON.stringify({ existingShareId: shareId, categoryId: 'b_cat_design', categoryName: 'Hijack', categoryIcon: 'zap', subcategories: [], bookmarks: [] }),
    ]);
    expect(r.error).toBeNull();
    expect((r.rows[0] as { id: string }).id).not.toBe(shareId);
    const pub = await asAnon<{ s: { categoryName: string } }>(`select public.get_public_share($1) s`, [shareId]);
    expect(pub.rows[0].s.categoryName).toBe('Design');
  });

  it('cannot share another user\'s category or a subcategory', async () => {
    await seedBasic(USER_A);
    const r1 = await publish({ categoryId: 'b_cat_design' });
    expect(r1.error).not.toBeNull();
    const r2 = await publish({ categoryId: 'sub_icons' });
    expect(r2.error?.message).toMatch(/Only root categories/);
  });

  it('get_public_share rejects malformed ids and unknown ids return null', async () => {
    const r = await asAnon<{ s: unknown }>(`select public.get_public_share($1) s`, ["x' or 1=1 --"]);
    expect(r.error).toBeNull();
    expect(r.rows[0].s).toBeNull();
  });
});

describe('workspace clear', () => {
  it('clears categories, bookmarks, shortcuts and shares but keeps settings (original parity)', async () => {
    await seedBasic(USER_A);
    await asA(`insert into public.user_settings (owner_id) values ('${USER_A}')`);
    await asA(`select public.myfav_save_quick_shortcut('{"title":"x","url":"https://x.dev"}'::jsonb)`);
    await asA(`select public.myfav_clear_workspace()`);
    for (const t of ['categories', 'bookmarks', 'quick_shortcuts', 'shared_categories']) {
      expect(await adminRows(`select 1 from public.${t}`), t).toHaveLength(0);
    }
    expect(await adminRows(`select 1 from public.user_settings`)).toHaveLength(1);
  });
});

describe('auth required', () => {
  it('RPCs fail when there is no JWT subject', async () => {
    const r = await runAs({ role: 'authenticated' }, `select public.myfav_clear_workspace()`);
    expect(r.error?.message).toMatch(/Not authenticated/);
  });
});
