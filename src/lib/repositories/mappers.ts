/**
 * Row <-> domain mappers. Database columns are snake_case (`sort_order`
 * instead of the reserved word `order`); the UI keeps the original camelCase
 * domain shapes from src/types.ts unchanged.
 */
import type {
  BookmarkItem,
  CategoryItem,
  QuickShortcutItem,
  SharedCategoryRecord,
  SharedCategoryBookmark,
  SharedCategorySubcategory,
  UserSettings,
} from '../../types';

export interface CategoryRow {
  owner_id: string;
  id: string;
  name: string;
  icon: string;
  parent_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRow {
  owner_id: string;
  id: string;
  title: string;
  url: string;
  description: string;
  category_id: string;
  subcategory_id: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuickShortcutRow {
  owner_id: string;
  id: string;
  title: string;
  url: string;
  icon_type: string;
  custom_icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  owner_id: string;
  theme_mode: string;
  primary_color: string;
  glass_intensity: string;
  card_density: string;
  updated_at: string;
}

export interface SharedCategoryRow {
  id: string;
  owner_id: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  is_public: boolean;
  subcategories: unknown;
  bookmarks: unknown;
  created_at: string;
  updated_at: string;
}

const iso = (v: string | null | undefined): string => {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

export function mapCategory(r: CategoryRow): CategoryItem {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    icon: r.icon,
    parentId: r.parent_id ?? '',
    order: r.sort_order ?? 0,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function mapBookmark(r: BookmarkRow): BookmarkItem {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    url: r.url,
    description: r.description ?? '',
    categoryId: r.category_id,
    subcategoryId: r.subcategory_id ?? '',
    isFavorite: Boolean(r.is_favorite),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function mapQuickShortcut(r: QuickShortcutRow): QuickShortcutItem {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    url: r.url,
    iconType: r.icon_type === 'lucide' || r.icon_type === 'custom' ? r.icon_type : 'favicon',
    customIcon: r.custom_icon ?? '',
    order: r.sort_order ?? 0,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function mapSettings(r: UserSettingsRow): UserSettings {
  return {
    ownerId: r.owner_id,
    themeMode: r.theme_mode === 'light' ? 'light' : 'dark',
    primaryColor: r.primary_color,
    glassIntensity:
      r.glass_intensity === 'subtle' || r.glass_intensity === 'frosted'
        ? r.glass_intensity
        : 'balanced',
    cardDensity: r.card_density === 'compact' ? 'compact' : 'comfortable',
    updatedAt: iso(r.updated_at),
  };
}

export function mapShare(r: SharedCategoryRow): SharedCategoryRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    isPublic: Boolean(r.is_public),
    subcategories: Array.isArray(r.subcategories)
      ? (r.subcategories as SharedCategorySubcategory[])
      : [],
    bookmarks: Array.isArray(r.bookmarks) ? (r.bookmarks as SharedCategoryBookmark[]) : [],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Same normalisation as the original server's upsertUserSettingsInDb(). */
export function settingsToRow(
  ownerId: string,
  s: { themeMode?: string; primaryColor: string; glassIntensity: string; cardDensity: string }
) {
  const primary = String(s.primaryColor || 'blue').slice(0, 32);
  return {
    owner_id: ownerId,
    theme_mode: s.themeMode === 'light' ? 'light' : 'dark',
    primary_color: /^[A-Za-z0-9#]{1,32}$/.test(primary) ? primary : 'blue',
    glass_intensity:
      s.glassIntensity === 'subtle' || s.glassIntensity === 'frosted' ? s.glassIntensity : 'balanced',
    card_density: s.cardDensity === 'compact' ? 'compact' : 'comfortable',
  };
}
