export interface CategoryItem {
  id: string;
  ownerId: string;
  name: string;
  icon: string;
  parentId: string; // "" for root category, or root category ID for subcategory
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkItem {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  description: string;
  categoryId: string;
  subcategoryId: string; // "" if none
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  /** How many times this website was opened (drives "most used" on the Main Page). */
  openCount?: number;
  /** ISO time of the last open, "" if never. */
  lastOpenedAt?: string;
}

export type QuickShortcutIconType = 'favicon' | 'lucide' | 'custom';

export interface QuickShortcutItem {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  iconType: QuickShortcutIconType;
  customIcon: string; // "" for favicon, icon name for lucide, or image URL for custom
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SharedCategorySubcategory {
  id: string;
  name: string;
  icon: string;
  order: number;
}

export interface SharedCategoryBookmark {
  title: string;
  url: string;
  description: string;
  subcategoryId: string;
  isFavorite: boolean;
}

export interface SharedCategoryRecord {
  id: string;
  ownerId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  isPublic: boolean;
  subcategories: SharedCategorySubcategory[];
  bookmarks: SharedCategoryBookmark[];
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = 'dark' | 'light';
export type GlassIntensity = 'subtle' | 'balanced' | 'frosted';
export type CardDensity = 'comfortable' | 'compact';

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  hover: string;
  light: string;
  rgb: string;
}

export interface ImportProgressState {
  phase: 'reading' | 'preparing' | 'categories' | 'bookmarks' | 'complete';
  processed: number;
  total: number;
  addedBookmarks: number;
  addedCategories: number;
  skippedDuplicates: number;
  currentTitle?: string;
  sourceLabel?: string;
}

export interface UserSettings {
  ownerId: string;
  themeMode?: ThemeMode;
  primaryColor: string; // hex or preset id
  glassIntensity: GlassIntensity;
  cardDensity: CardDensity;
  updatedAt: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'blue',
    name: 'Sapphire Blue',
    primary: '#3B82F6',
    hover: '#2563EB',
    light: '#93C5FD',
    rgb: '59, 130, 246',
  },
  {
    id: 'cyan',
    name: 'Arctic Cyan',
    primary: '#06B6D4',
    hover: '#0891B2',
    light: '#67E8F9',
    rgb: '6, 182, 212',
  },
  {
    id: 'indigo',
    name: 'Cobalt Indigo',
    primary: '#6366F1',
    hover: '#4F46E5',
    light: '#A5B4FC',
    rgb: '99, 102, 241',
  },
  {
    id: 'emerald',
    name: 'Emerald Jade',
    primary: '#10B981',
    hover: '#059669',
    light: '#6EE7B7',
    rgb: '16, 185, 129',
  },
  {
    id: 'amber',
    name: 'Solar Amber',
    primary: '#F59E0B',
    hover: '#D97706',
    light: '#FCD34D',
    rgb: '245, 158, 11',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    primary: '#F43F5E',
    hover: '#E11D48',
    light: '#FDA4AF',
    rgb: '244, 63, 94',
  },
  {
    id: 'violet',
    name: 'Electric Violet',
    primary: '#8B5CF6',
    hover: '#7C3AED',
    light: '#C4B5FD',
    rgb: '139, 92, 246',
  },
  {
    id: 'teal',
    name: 'Oceanic Teal',
    primary: '#14B8A6',
    hover: '#0D9488',
    light: '#5EEAD4',
    rgb: '20, 184, 166',
  },
];

export const CATEGORY_ICONS = [
  'sparkles',
  'wand-2',
  'cpu',
  'code-2',
  'terminal',
  'database',
  'palette',
  'pen-tool',
  'image',
  'video',
  'music',
  'hexagon',
  'layers',
  'globe',
  'compass',
  'megaphone',
  'briefcase',
  'shopping-bag',
  'book-open',
  'shield',
  'rocket',
  'gamepad-2',
  'zap',
  'bookmark',
] as const;

export type CategoryIconName = (typeof CATEGORY_ICONS)[number];

export const DEMO_CATEGORY_IDS = new Set([
  'cat_icons',
  'cat_images',
  'cat_ai_dev',
  'cat_ai_design',
  'cat_graphic_design',
  'cat_logo_design',
  'cat_digital_marketing',
  'cat_business',
  'sub_icons_svg',
  'sub_icons_animated',
  'sub_images_stock',
  'sub_images_textures',
  'sub_aidev_sdks',
  'sub_aidev_agents',
  'sub_aidesign_gen',
  'sub_aidesign_ui',
  'sub_graphic_type',
  'sub_graphic_color',
  'sub_logo_inspiration',
  'sub_marketing_seo',
  'sub_business_ops',
]);

export const DEMO_BOOKMARK_IDS = new Set([
  'bm_lucide',
  'bm_phosphor',
  'bm_lordicon',
  'bm_cosmos',
  'bm_lsgraphics',
  'bm_huggingface',
  'bm_langchain',
  'bm_midjourney',
  'bm_krea',
  'bm_fontshare',
  'bm_oklch',
  'bm_logobook',
  'bm_ahrefs',
  'bm_stripe_atlas',
]);

export const INITIAL_CATEGORIES: CategoryItem[] = [];
export const INITIAL_BOOKMARKS: BookmarkItem[] = [];
