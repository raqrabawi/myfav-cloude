import { describe, expect, it } from 'vitest';
import { mapBookmark, mapCategory, mapQuickShortcut, mapSettings, mapShare, settingsToRow } from '../../src/lib/repositories/mappers';

describe('row <-> domain mappers', () => {
  it('category: sort_order -> order, "" parent preserved', () => {
    const c = mapCategory({ owner_id: 'u', id: 'c', name: 'N', icon: 'zap', parent_id: '', sort_order: 3, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-02T00:00:00Z' });
    expect(c).toEqual({ id: 'c', ownerId: 'u', name: 'N', icon: 'zap', parentId: '', order: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' });
  });
  it('bookmark mapping', () => {
    const b = mapBookmark({ owner_id: 'u', id: 'b', title: 'T', url: 'https://x', description: '', category_id: 'c', subcategory_id: '', is_favorite: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    expect(b).toMatchObject({ categoryId: 'c', subcategoryId: '', isFavorite: true });
  });
  it('shortcut icon type normalisation', () => {
    const s = mapQuickShortcut({ owner_id: 'u', id: 'q', title: 'T', url: 'https://x', icon_type: 'weird', custom_icon: '', sort_order: 0, created_at: '', updated_at: '' });
    expect(s.iconType).toBe('favicon');
  });
  it('settings normalisation mirrors original server', () => {
    expect(mapSettings({ owner_id: 'u', theme_mode: 'x', primary_color: 'teal', glass_intensity: 'x', card_density: 'x', updated_at: '' })).toMatchObject({ themeMode: 'dark', glassIntensity: 'balanced', cardDensity: 'comfortable', primaryColor: 'teal' });
    expect(settingsToRow('u', { themeMode: 'light', primaryColor: '#14B8A6', glassIntensity: 'frosted', cardDensity: 'compact' })).toEqual({ owner_id: 'u', theme_mode: 'light', primary_color: '#14B8A6', glass_intensity: 'frosted', card_density: 'compact' });
    expect(settingsToRow('u', { primaryColor: 'red;drop table', glassIntensity: '', cardDensity: '' }).primary_color).toBe('blue');
  });
  it('share mapping tolerates non-array snapshots', () => {
    const s = mapShare({ id: 's', owner_id: 'u', category_id: 'c', category_name: 'N', category_icon: 'zap', is_public: true, subcategories: null, bookmarks: {}, created_at: '', updated_at: '' });
    expect(s.subcategories).toEqual([]);
    expect(s.bookmarks).toEqual([]);
  });
});
