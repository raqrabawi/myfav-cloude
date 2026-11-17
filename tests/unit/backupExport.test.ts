import { describe, expect, it } from 'vitest';
import { buildBookmarksCsv, buildBookmarksHtml, buildWorkspaceJsonBackup } from '../../src/utils/backupExport';
import type { BookmarkItem, CategoryItem, UserSettings } from '../../src/types';

const now = '2026-11-17T08:00:00.000Z';
const cats: CategoryItem[] = [
  { id: 'c1', ownerId: 'u', name: 'Design "UI", <Tools>', icon: 'palette', parentId: '', order: 0, createdAt: now, updatedAt: now },
  { id: 's1', ownerId: 'u', name: 'Icons & Glyphs', icon: 'sparkles', parentId: 'c1', order: 0, createdAt: now, updatedAt: now },
];
const bms: BookmarkItem[] = [
  { id: 'b1', ownerId: 'u', title: 'Figma, "the" tool', url: 'https://figma.com', description: 'line1\nline2', categoryId: 'c1', subcategoryId: '', isFavorite: true, createdAt: now, updatedAt: now },
  { id: 'b2', ownerId: 'u', title: '<script>x</script>', url: 'javascript:alert(1)', description: '', categoryId: 'c1', subcategoryId: 's1', isFavorite: false, createdAt: now, updatedAt: now },
];
const settings: UserSettings = { ownerId: 'u', themeMode: 'dark', primaryColor: 'blue', glassIntensity: 'balanced', cardDensity: 'comfortable', updatedAt: now };

describe('backup export (original module, unchanged in V2)', () => {
  it('CSV: BOM, header, RFC-4180 quoting of commas, quotes and newlines', () => {
    const csv = buildBookmarksCsv(cats, bms);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Figma, ""the"" tool"');
    expect(csv).toContain('"line1\nline2"');
    expect(csv.split('\r\n').length).toBeGreaterThanOrEqual(3);
  });

  it('HTML: Netscape format, escapes markup, neutralises javascript: URLs', () => {
    const html = buildBookmarksHtml(cats, bms);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/HREF="javascript:/i);
    expect(html).toContain('Design &quot;UI&quot;, &lt;Tools&gt;');
  });

  it('JSON: versioned backup without ownerId fields', () => {
    const json = JSON.parse(buildWorkspaceJsonBackup({ categories: cats, bookmarks: bms, quickShortcuts: [], settings }));
    expect(json.format).toBe('myfav-backup');
    expect(json.summary).toEqual({ categories: 1, subcategories: 1, bookmarks: 2, quickShortcuts: 0 });
    expect(JSON.stringify(json.data)).not.toContain('ownerId');
    expect(json.data.settings).toEqual({ themeMode: 'dark', primaryColor: 'blue', glassIntensity: 'balanced', cardDensity: 'comfortable' });
  });
});
