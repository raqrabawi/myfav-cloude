// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inferFallbackCategoryName,
  inferIconForFolderName,
  parseChromeBookmarksExactArrangement,
} from '../../src/utils/chromeBookmarksParser';

const fixture = (n: string) => readFileSync(join(__dirname, '../fixtures', n), 'utf8');

describe('parseChromeBookmarksExactArrangement (original parser, unchanged in V2)', () => {
  it('builds root/sub categories from nested folders, skipping Chrome wrapper folders', () => {
    const plan = parseChromeBookmarksExactArrangement(fixture('chrome-basic.html'));
    const roots = plan.categories.filter((c) => c.parentTempId === '').map((c) => c.name);
    expect(roots).toContain('Design & UI');
    expect(roots).toContain('AI Dev — عربي 🚀');
    expect(roots).not.toContain('Bookmarks bar');
    expect(roots).not.toContain('Other bookmarks');
    const subs = plan.categories.filter((c) => c.parentTempId !== '').map((c) => c.name);
    expect(subs).toContain('Icons');
    // deeper levels are flattened into "A / B" subcategory names (2-level model)
    expect(subs).toContain('Icons / Animated (3rd level)');
  });

  it('decodes HTML entities and keeps special characters', () => {
    const plan = parseChromeBookmarksExactArrangement(fixture('chrome-basic.html'));
    expect(plan.bookmarks.map((b) => b.title)).toContain('Stripe Atlas <startup> "quoted"');
  });

  it('every bookmark points at a category that exists in the plan', () => {
    const plan = parseChromeBookmarksExactArrangement(fixture('chrome-large-5000.html'));
    const ids = new Set(plan.categories.map((c) => c.tempId));
    expect(plan.bookmarks.length).toBe(5000);
    for (const b of plan.bookmarks) {
      expect(ids.has(b.categoryTempId)).toBe(true);
      if (b.subcategoryTempId) expect(ids.has(b.subcategoryTempId)).toBe(true);
    }
  });

  it('keeps document order in the order field', () => {
    const plan = parseChromeBookmarksExactArrangement(fixture('chrome-basic.html'));
    const orders = plan.bookmarks.map((b) => b.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('handles empty and malformed input without throwing', () => {
    expect(parseChromeBookmarksExactArrangement('')).toEqual({ categories: [], bookmarks: [] });
    const m = parseChromeBookmarksExactArrangement(fixture('chrome-malformed.html'));
    expect(Array.isArray(m.bookmarks)).toBe(true);
    expect(() => parseChromeBookmarksExactArrangement('{not json')).not.toThrow();
  });

  it('parses the Chrome JSON "Bookmarks" file format', () => {
    const json = JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          name: 'Bookmarks bar',
          children: [
            { type: 'folder', name: 'Dev', children: [{ type: 'url', name: 'MDN', url: 'https://developer.mozilla.org/' }] },
          ],
        },
        other: { type: 'folder', name: 'Other bookmarks', children: [] },
      },
    });
    const plan = parseChromeBookmarksExactArrangement(json);
    expect(plan.categories.some((c) => c.name === 'Dev')).toBe(true);
    expect(plan.bookmarks.some((b) => b.url === 'https://developer.mozilla.org/')).toBe(true);
  });
});

describe('icon / name inference helpers', () => {
  it('maps folder names to known icons', () => {
    expect(typeof inferIconForFolderName('Design')).toBe('string');
    expect(inferIconForFolderName('Database stuff')).toBe(inferIconForFolderName('cloud'));
  });
  it('fallback category name is non-empty', () => {
    expect(inferFallbackCategoryName('https://github.com/x', 'GitHub').length).toBeGreaterThan(0);
  });
});

describe('imports from other browsers (same bookmarks.html format)', () => {
  const placed = (file: string) => {
    const plan = parseChromeBookmarksExactArrangement(fixture(file));
    const name = (id: string) => plan.categories.find((c) => c.tempId === id)?.name ?? '';
    return Object.fromEntries(
      plan.bookmarks.map((b) => [b.title, name(b.categoryTempId) + (b.subcategoryTempId ? ' > ' + name(b.subcategoryTempId) : '')])
    );
  };

  it('Safari (File → Export → Bookmarks): keeps "Favorites", folders become categories, skips Reading List', () => {
    expect(placed('safari-export.html')).toEqual({
      Apple: 'Favorites',
      Figma: 'Favorites',
      Dribbble: 'Design',
      Behance: 'Design',
      'Hacker News': 'Bookmarks Menu',
      GitHub: 'Work',
      MDN: 'Work > Docs',
      Google: 'Bookmarks Bar',
    });
    const names = parseChromeBookmarksExactArrangement(fixture('safari-export.html')).categories.map((c) => c.name);
    expect(names).not.toContain('Reading List');
  });

  it('Edge (Export favorites): keeps "Favorites Bar"', () => {
    expect(placed('edge-export.html')).toEqual({
      Bing: 'Favorites Bar',
      'BBC News': 'News',
      'Microsoft Learn': 'Other favorites',
    });
  });

  it('Firefox (Export Bookmarks to HTML): keeps "Bookmarks Toolbar", ignores place: links', () => {
    expect(placed('firefox-export.html')).toEqual({
      Wikipedia: 'Bookmarks Bar',
      'Get Help': 'Mozilla Firefox',
      Mozilla: 'Bookmarks Toolbar',
      'MDN Web Docs': 'Dev',
      'Hacker News': 'Bookmarks Bar',
    });
  });
});
