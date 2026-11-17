import { describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/lib/apiClient';

type Call = { table?: string; ops: Array<[string, unknown[]]> };

function fakeClient(opts: { uid?: string | null; rows?: Record<string, unknown[]>; rpc?: Record<string, unknown>; rpcError?: unknown } = {}) {
  const calls: Call[] = [];
  const rpcCalls: Array<[string, unknown]> = [];
  const uid = opts.uid === undefined ? 'user-1' : opts.uid;
  const client = {
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null }, error: null }) },
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpc?.[fn] ?? null, error: null };
    },
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      let range: [number, number] | null = null;
      let single = false;
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'update', 'delete', 'upsert', 'in']) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return builder;
        };
      }
      builder.range = (a: number, b: number) => {
        call.ops.push(['range', [a, b]]);
        range = [a, b];
        return builder;
      };
      builder.maybeSingle = () => {
        single = true;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => void) => {
        const all = opts.rows?.[table] ?? [];
        if (single) return resolve({ data: all[0] ?? null, error: null });
        const data = range ? all.slice(range[0], range[1] + 1) : all;
        return resolve({ data, error: null });
      };
      return builder;
    },
  };
  return { client, calls, rpcCalls };
}

const row = (i: number) => ({
  owner_id: 'user-1', id: `bm_${i}`, title: `T${i}`, url: `https://x${i}.dev`, description: '',
  category_id: 'c', subcategory_id: '', is_favorite: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

describe('apiClient (Supabase implementation of the original contract)', () => {
  it('getWorkspace pages past the 1000-row PostgREST limit and scopes by owner', async () => {
    const { client, calls } = fakeClient({ rows: { bookmarks: Array.from({ length: 2345 }, (_, i) => row(i)) } });
    const api = createApiClient(() => client as never);
    const ws = await api.getWorkspace();
    expect(ws.bookmarks).toHaveLength(2345);
    expect(ws.bookmarks[2344].id).toBe('bm_2344');
    const bmCalls = calls.filter((c) => c.table === 'bookmarks');
    expect(bmCalls).toHaveLength(3);
    expect(bmCalls[0].ops).toContainEqual(['eq', ['owner_id', 'user-1']]);
    expect(ws.settings).toBeNull();
  });

  it('maps every mutating operation to the intended RPC with the original payload', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: {
        myfav_import_chrome_plan: { addedCategories: 1, addedBookmarks: 2, skippedDuplicates: 3, expandedCategoryIds: ['c'] },
        myfav_save_bookmark: row(1),
        myfav_create_category: { owner_id: 'user-1', id: 'c', name: 'N', icon: 'zap', parent_id: '', sort_order: 0, created_at: '', updated_at: '' },
        myfav_save_quick_shortcut: { owner_id: 'user-1', id: 'q', title: 'Q', url: 'https://q', icon_type: 'favicon', custom_icon: '', sort_order: 0, created_at: '', updated_at: '' },
        myfav_publish_share: { id: 'share_1', owner_id: 'user-1', category_id: 'c', category_name: 'N', category_icon: 'zap', is_public: true, subcategories: [], bookmarks: [], created_at: '', updated_at: '' },
      },
    });
    const api = createApiClient(() => client as never);
    const imp = await api.importChromePlan({ categories: [], bookmarks: [] }, true);
    expect(imp.summary.skippedDuplicates).toBe(3);
    await api.saveBookmark({ title: 't', url: 'https://x', description: '', categoryId: 'c', subcategoryId: '', isFavorite: false });
    await api.createCategory({ id: 'c', name: 'N', icon: 'zap', parentId: '' });
    await api.deleteCategory('c', 'd');
    await api.reorderQuickShortcuts(['a', 'b']);
    await api.batchEditBookmarks({ bookmarkIds: ['a'], category: { categoryId: 'c', subcategoryId: '' }, favoriteStatus: 'favorite' });
    await api.batchDeleteBookmarks(['a']);
    await api.batchDeleteBookmarks([]);
    await api.clearWorkspace();
    await api.saveQuickShortcut({ title: 'Q', url: 'https://q', iconType: 'favicon', customIcon: '' });
    const share = await api.publishOrUpdateShare({ categoryId: 'c', categoryName: 'N', categoryIcon: 'zap', subcategories: [], bookmarks: [] });
    expect(share.id).toBe('share_1');
    expect(rpcCalls.map((c) => c[0])).toEqual([
      'myfav_import_chrome_plan', 'myfav_save_bookmark', 'myfav_create_category', 'myfav_delete_category',
      'myfav_reorder_quick_shortcuts', 'myfav_batch_edit_bookmarks', 'myfav_batch_delete_bookmarks',
      'myfav_clear_workspace', 'myfav_save_quick_shortcut', 'myfav_publish_share',
    ]);
    expect(rpcCalls[0][1]).toEqual({ p_plan: { categories: [], bookmarks: [] }, p_replace_all: true });
    expect(rpcCalls[3][1]).toEqual({ p_id: 'c', p_fallback_category_id: 'd' });
    expect(rpcCalls[5][1]).toEqual({ p_ids: ['a'], p_category_id: 'c', p_subcategory_id: '', p_favorite_status: 'favorite' });
  });

  it('surfaces the original server error strings', async () => {
    const { client } = fakeClient({ rpcError: { message: 'boom', code: '23514' } });
    const api = createApiClient(() => client as never);
    await expect(api.syncLocalWorkspace({ categories: [], bookmarks: [], quickShortcuts: [] })).rejects.toThrow('Failed to sync local data');
    await expect(api.clearWorkspace()).rejects.toThrow('Failed to clear workspace');
  });

  it('refuses authenticated operations when signed out', async () => {
    const { client } = fakeClient({ uid: null });
    const api = createApiClient(() => client as never);
    await expect(api.getWorkspace()).rejects.toThrow(/Unauthorized/);
  });

  it('public share: not found -> same error as original 404 handler', async () => {
    const { client } = fakeClient({ uid: null, rpc: { get_public_share: null } });
    const api = createApiClient(() => client as never);
    await expect(api.getPublicShare('share_x')).rejects.toThrow('Shared collection not found');
  });
});
