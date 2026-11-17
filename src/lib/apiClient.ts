/**
 * MyFav V2 data client.
 *
 * Keeps the exact exported contract of the original `apiClient`
 * (src/lib/apiClient.ts in MyFav-main) so App.tsx and every component are
 * unchanged, but talks to the Neon Data API (PostgREST-compatible, RLS +
 * transactional RPCs) instead of the original Express/Drizzle server.
 *
 * Original route              -> V2 implementation
 * GET    /api/workspace       -> 5 owner-scoped selects (paged, RLS)
 * POST   /api/workspace/sync-local -> rpc myfav_sync_local_workspace (atomic)
 * DELETE /api/workspace       -> rpc myfav_clear_workspace (atomic)
 * POST   /api/workspace/import-plan -> rpc myfav_import_chrome_plan (atomic)
 * POST   /api/bookmarks       -> rpc myfav_save_bookmark
 * PATCH  /api/bookmarks/:id/favorite -> update bookmarks
 * DELETE /api/bookmarks/:id   -> delete bookmarks
 * POST   /api/bookmarks/batch-edit   -> rpc myfav_batch_edit_bookmarks (atomic)
 * POST   /api/bookmarks/batch-delete -> rpc myfav_batch_delete_bookmarks (atomic)
 * POST   /api/shortcuts       -> rpc myfav_save_quick_shortcut
 * DELETE /api/shortcuts/:id   -> delete quick_shortcuts
 * PUT    /api/shortcuts/reorder -> rpc myfav_reorder_quick_shortcuts (atomic)
 * POST   /api/categories      -> rpc myfav_create_category
 * PUT    /api/categories/reorder -> rpc myfav_reorder_category_tree (atomic)
 * PATCH  /api/categories/:id  -> update categories
 * DELETE /api/categories/:id  -> rpc myfav_delete_category (atomic)
 * PUT    /api/settings        -> upsert user_settings
 * POST   /api/shares          -> rpc myfav_publish_share
 * DELETE /api/shares/:shareId -> delete shared_categories
 * GET    /api/shares/:shareId -> rpc get_public_share (anonymous, whitelisted)
 */
import type {
  BookmarkItem,
  CategoryItem,
  QuickShortcutItem,
  SharedCategoryRecord,
  UserSettings,
} from '../types';
import type { ChromeImportPlan } from '../utils/chromeBookmarksParser';
import { requireNeon } from './neonClient';

/** Minimal structural types for the Data API client (Neon's postgrest-js). */
interface PostgrestError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}
type QueryResult<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;
interface QueryBuilder<T = unknown> extends QueryResult<T[]> {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
  update(values: Record<string, unknown>): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): QueryBuilder<T>;
  maybeSingle(): QueryResult<T>;
}
export interface DataClient {
  auth: {
    getSession(): Promise<{
      data: { session: { user?: { id?: string } | null } | null };
      error: unknown;
    }>;
  };
  // Rows are typed at each call site via selectAll<T>.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): QueryBuilder<any>;
  rpc(fn: string, args?: Record<string, unknown>): QueryResult<unknown>;
}
import {
  mapBookmark,
  mapCategory,
  mapQuickShortcut,
  mapSettings,
  mapShare,
  settingsToRow,
  type BookmarkRow,
  type CategoryRow,
  type QuickShortcutRow,
  type SharedCategoryRow,
  type UserSettingsRow,
} from './repositories/mappers';

export interface WorkspacePayload {
  categories: CategoryItem[];
  bookmarks: BookmarkItem[];
  quickShortcuts: QuickShortcutItem[];
  settings: UserSettings | null;
  sharedCategories: SharedCategoryRecord[];
}

const PAGE_SIZE = 1000;

/** Original server error strings, preserved so any UI that shows them is unchanged. */
const MSG = {
  workspace: 'Failed to load workspace data',
  sync: 'Failed to sync local data',
  clear: 'Failed to clear workspace',
  importPlan: 'Failed to import bookmarks',
  saveBookmark: 'Failed to save website',
  favorite: 'Failed to toggle favorite',
  deleteBookmark: 'Failed to delete website',
  batchEdit: 'Failed to update selected websites',
  batchDelete: 'Failed to delete selected websites',
  saveShortcut: 'Failed to save shortcut',
  deleteShortcut: 'Failed to delete shortcut',
  reorderShortcuts: 'Failed to reorder shortcuts',
  createCategory: 'Failed to create category',
  reorderCategories: 'Failed to reorder categories',
  updateCategory: 'Failed to update category',
  deleteCategory: 'Failed to delete category',
  settings: 'Failed to update settings',
  share: 'Failed to share category',
  revoke: 'Failed to revoke share link',
  shareNotFound: 'Shared collection not found',
  shareLoad: 'Failed to load shared collection',
  auth: 'Unauthorized: Missing token',
} as const;

export class ApiError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.cause = cause;
  }
}

function fail(message: string, error: PostgrestError | Error | null | unknown): never {
  if (error && typeof console !== 'undefined') {
    console.error(`[MyFav] ${message}:`, error);
  }
  throw new ApiError(message, error);
}

async function requireUserId(client: DataClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  const uid = data.session?.user?.id;
  if (error || !uid) fail(MSG.auth, error);
  return uid;
}

async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  message: string
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) fail(message, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export function createApiClient(
  getClient: () => DataClient = () => requireNeon() as unknown as DataClient
) {
  const loadWorkspace = async (): Promise<WorkspacePayload> => {
    const client = getClient();
    const uid = await requireUserId(client);
    const [cats, bms, scs, settingsRes, shares] = await Promise.all([
      selectAll<CategoryRow>(
        (a, b) =>
          client
            .from('categories')
            .select('owner_id,id,name,icon,parent_id,sort_order,created_at,updated_at')
            .eq('owner_id', uid)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
            .order('seq', { ascending: true })
            .range(a, b),
        MSG.workspace
      ),
      selectAll<BookmarkRow>(
        (a, b) =>
          client
            .from('bookmarks')
            .select(
              'owner_id,id,title,url,description,category_id,subcategory_id,is_favorite,created_at,updated_at'
            )
            .eq('owner_id', uid)
            .order('created_at', { ascending: true })
            .order('seq', { ascending: true })
            .range(a, b),
        MSG.workspace
      ),
      selectAll<QuickShortcutRow>(
        (a, b) =>
          client
            .from('quick_shortcuts')
            .select('owner_id,id,title,url,icon_type,custom_icon,sort_order,created_at,updated_at')
            .eq('owner_id', uid)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
            .order('seq', { ascending: true })
            .range(a, b),
        MSG.workspace
      ),
      client
        .from('user_settings')
        .select('owner_id,theme_mode,primary_color,glass_intensity,card_density,updated_at')
        .eq('owner_id', uid)
        .maybeSingle(),
      selectAll<SharedCategoryRow>(
        (a, b) =>
          client
            .from('shared_categories')
            .select('*')
            .eq('owner_id', uid)
            .order('created_at', { ascending: true })
            .range(a, b),
        MSG.workspace
      ),
    ]);
    if (settingsRes.error) fail(MSG.workspace, settingsRes.error);

    return {
      categories: cats.map(mapCategory),
      bookmarks: bms.map(mapBookmark),
      quickShortcuts: scs.map(mapQuickShortcut),
      settings: settingsRes.data ? mapSettings(settingsRes.data as UserSettingsRow) : null,
      sharedCategories: shares.map(mapShare),
    };
  };

  const rpc = async <T>(fn: string, args: Record<string, unknown>, message: string): Promise<T> => {
    const client = getClient();
    await requireUserId(client);
    const { data, error } = await client.rpc(fn, args);
    if (error) fail(message, error);
    return data as T;
  };

  return {
    getWorkspace: loadWorkspace,

    syncLocalWorkspace: async (payload: {
      categories: CategoryItem[];
      bookmarks: BookmarkItem[];
      quickShortcuts: QuickShortcutItem[];
    }): Promise<WorkspacePayload> => {
      await rpc(
        'myfav_sync_local_workspace',
        {
          p_payload: {
            categories: Array.isArray(payload.categories) ? payload.categories : [],
            bookmarks: Array.isArray(payload.bookmarks) ? payload.bookmarks : [],
            quickShortcuts: Array.isArray(payload.quickShortcuts) ? payload.quickShortcuts : [],
          },
        },
        MSG.sync
      );
      return loadWorkspace();
    },

    clearWorkspace: async () => {
      await rpc('myfav_clear_workspace', {}, MSG.clear);
      return { ok: true };
    },

    importChromePlan: async (plan: ChromeImportPlan, replaceAllExisting: boolean) => {
      if (!plan || !Array.isArray(plan.categories) || !Array.isArray(plan.bookmarks)) {
        fail('Invalid import plan payload', null);
      }
      const summary = await rpc<{
        addedCategories: number;
        addedBookmarks: number;
        skippedDuplicates: number;
        expandedCategoryIds: string[];
      }>(
        'myfav_import_chrome_plan',
        { p_plan: plan, p_replace_all: Boolean(replaceAllExisting) },
        MSG.importPlan
      );
      const workspace = await loadWorkspace();
      return { summary, workspace };
    },

    saveBookmark: async (data: {
      id?: string;
      title: string;
      url: string;
      description: string;
      categoryId: string;
      subcategoryId: string;
      isFavorite: boolean;
    }): Promise<BookmarkItem> => {
      const row = await rpc<BookmarkRow>('myfav_save_bookmark', { p: data }, MSG.saveBookmark);
      return mapBookmark(row);
    },

    toggleFavorite: async (id: string, isFavorite: boolean) => {
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client
        .from('bookmarks')
        .update({ is_favorite: Boolean(isFavorite) })
        .eq('owner_id', uid)
        .eq('id', id);
      if (error) fail(MSG.favorite, error);
      return { ok: true };
    },

    deleteBookmark: async (id: string) => {
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client.from('bookmarks').delete().eq('owner_id', uid).eq('id', id);
      if (error) fail(MSG.deleteBookmark, error);
      return { ok: true };
    },

    batchEditBookmarks: async (payload: {
      bookmarkIds: string[];
      category?: { categoryId: string; subcategoryId: string };
      favoriteStatus: 'keep' | 'favorite' | 'unfavorite';
    }) => {
      const ids = Array.isArray(payload.bookmarkIds) ? payload.bookmarkIds : [];
      if (ids.length === 0) return { ok: true };
      await rpc(
        'myfav_batch_edit_bookmarks',
        {
          p_ids: ids,
          p_category_id: payload.category?.categoryId || null,
          p_subcategory_id: payload.category?.categoryId ? payload.category.subcategoryId || '' : null,
          p_favorite_status: payload.favoriteStatus || 'keep',
        },
        MSG.batchEdit
      );
      return { ok: true };
    },

    batchDeleteBookmarks: async (bookmarkIds: string[]) => {
      const ids = Array.isArray(bookmarkIds) ? bookmarkIds : [];
      if (ids.length === 0) return { ok: true };
      await rpc('myfav_batch_delete_bookmarks', { p_ids: ids }, MSG.batchDelete);
      return { ok: true };
    },

    saveQuickShortcut: async (data: {
      id?: string;
      title: string;
      url: string;
      iconType: 'favicon' | 'lucide' | 'custom';
      customIcon: string;
    }): Promise<QuickShortcutItem> => {
      const row = await rpc<QuickShortcutRow>('myfav_save_quick_shortcut', { p: data }, MSG.saveShortcut);
      return mapQuickShortcut(row);
    },

    deleteQuickShortcut: async (id: string) => {
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client.from('quick_shortcuts').delete().eq('owner_id', uid).eq('id', id);
      if (error) fail(MSG.deleteShortcut, error);
      return { ok: true };
    },

    reorderQuickShortcuts: async (orderedIds: string[]) => {
      await rpc(
        'myfav_reorder_quick_shortcuts',
        { p_ordered_ids: Array.isArray(orderedIds) ? orderedIds : [] },
        MSG.reorderShortcuts
      );
      return { ok: true };
    },

    createCategory: async (data: {
      id?: string;
      name: string;
      icon: string;
      parentId: string;
    }): Promise<CategoryItem> => {
      const row = await rpc<CategoryRow>(
        'myfav_create_category',
        {
          p_id: data.id ?? null,
          p_name: data.name,
          p_icon: data.icon,
          p_parent_id: data.parentId || '',
        },
        MSG.createCategory
      );
      return mapCategory(row);
    },

    updateCategory: async (id: string, data: { name: string; icon: string }) => {
      const cleanName = (data.name || '').trim().slice(0, 80);
      if (!cleanName) return { ok: true };
      const icon = data.icon && /^[a-zA-Z0-9_-]{1,40}$/.test(data.icon) ? data.icon : 'bookmark';
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client
        .from('categories')
        .update({ name: cleanName, icon })
        .eq('owner_id', uid)
        .eq('id', id);
      if (error) fail(MSG.updateCategory, error);
      return { ok: true };
    },

    deleteCategory: async (id: string, fallbackCategoryId?: string) => {
      await rpc(
        'myfav_delete_category',
        { p_id: id, p_fallback_category_id: fallbackCategoryId || null },
        MSG.deleteCategory
      );
      return { ok: true };
    },

    reorderCategoryTree: async (payload: {
      draggedId: string;
      newParentId: string;
      reorderedSiblings: Array<{ id: string; order: number }>;
      childSubsToMove: Array<{ id: string; order: number }>;
      bookmarksToUpdate: Array<{ id: string; categoryId: string; subcategoryId: string }>;
    }) => {
      await rpc('myfav_reorder_category_tree', { p_payload: payload }, MSG.reorderCategories);
      return { ok: true };
    },

    updateSettings: async (settings: {
      themeMode?: string;
      primaryColor: string;
      glassIntensity: string;
      cardDensity: string;
    }) => {
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client
        .from('user_settings')
        .upsert(settingsToRow(uid, settings), { onConflict: 'owner_id' });
      if (error) fail(MSG.settings, error);
      return { ok: true };
    },

    publishOrUpdateShare: async (payload: {
      existingShareId?: string;
      categoryId: string;
      categoryName: string;
      categoryIcon: string;
      subcategories: Array<{ id: string; name: string; icon: string; order: number }>;
      bookmarks: Array<{
        title: string;
        url: string;
        description: string;
        subcategoryId: string;
        isFavorite: boolean;
      }>;
    }): Promise<SharedCategoryRecord> => {
      const row = await rpc<SharedCategoryRow>('myfav_publish_share', { p: payload }, MSG.share);
      return mapShare(row);
    },

    revokeShare: async (shareId: string) => {
      const client = getClient();
      const uid = await requireUserId(client);
      const { error } = await client
        .from('shared_categories')
        .delete()
        .eq('owner_id', uid)
        .eq('id', shareId);
      if (error) fail(MSG.revoke, error);
      return { ok: true };
    },

    getPublicShare: async (shareId: string): Promise<SharedCategoryRecord> => {
      const client = getClient();
      const { data, error } = await client.rpc('get_public_share', { p_share_id: shareId });
      if (error) fail(MSG.shareLoad, error);
      if (!data) fail(MSG.shareNotFound, null);
      return data as SharedCategoryRecord;
    },
  };
}

export const apiClient = createApiClient();
