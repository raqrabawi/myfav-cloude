import {
  BookmarkItem,
  CategoryItem,
  QuickShortcutItem,
  UserSettings,
} from '../types';

export type BackupFormat = 'csv' | 'html' | 'json';

function getDateStamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toUnixSeconds(iso?: string): number {
  if (!iso) return Math.floor(Date.now() / 1000);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return Math.floor(Date.now() / 1000);
  return Math.max(0, Math.floor(ms / 1000));
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeExportUrl(rawUrl: string): string {
  const trimmed = String(rawUrl ?? '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return 'https://example.com';
}

export function buildBookmarksCsv(
  categories: CategoryItem[],
  bookmarks: BookmarkItem[]
): string {
  const categoryById = new Map(categories.map((cat) => [cat.id, cat]));

  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    const catA = categoryById.get(a.categoryId);
    const catB = categoryById.get(b.categoryId);
    const orderA = catA ? catA.order : Number.MAX_SAFE_INTEGER;
    const orderB = catB ? catB.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    const subA = a.subcategoryId ? categoryById.get(a.subcategoryId) : undefined;
    const subB = b.subcategoryId ? categoryById.get(b.subcategoryId) : undefined;
    const subOrderA = subA ? subA.order : -1;
    const subOrderB = subB ? subB.order : -1;
    if (subOrderA !== subOrderB) return subOrderA - subOrderB;

    return a.title.localeCompare(b.title);
  });

  const headers = [
    'Title',
    'URL',
    'Category',
    'Subcategory',
    'Favorite',
    'Description',
    'Created At',
    'Updated At',
  ];

  const rows = sortedBookmarks.map((bm) => {
    const rootCat = categoryById.get(bm.categoryId);
    const subCat = bm.subcategoryId ? categoryById.get(bm.subcategoryId) : undefined;

    return [
      escapeCsvCell(bm.title),
      escapeCsvCell(bm.url),
      escapeCsvCell(rootCat?.name || 'Uncategorized'),
      escapeCsvCell(subCat?.name || ''),
      escapeCsvCell(bm.isFavorite ? 'Yes' : 'No'),
      escapeCsvCell(bm.description || ''),
      escapeCsvCell(bm.createdAt || ''),
      escapeCsvCell(bm.updatedAt || ''),
    ].join(',');
  });

  // Prefix UTF-8 BOM so Microsoft Excel and Google Sheets preserve Unicode/emoji cleanly
  return `\uFEFF${[headers.join(','), ...rows].join('\r\n')}`;
}

export function buildBookmarksHtml(
  categories: CategoryItem[],
  bookmarks: BookmarkItem[]
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const rootCategories = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const subcategoriesByParent = new Map<string, CategoryItem[]>();
  for (const cat of categories) {
    if (!cat.parentId) continue;
    const list = subcategoriesByParent.get(cat.parentId) || [];
    list.push(cat);
    subcategoriesByParent.set(cat.parentId, list);
  }
  for (const list of subcategoriesByParent.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  const rootCategoryIds = new Set(rootCategories.map((c) => c.id));
  const subcategoryIds = new Set(
    categories.filter((c) => Boolean(c.parentId)).map((c) => c.id)
  );

  const renderBookmarkLine = (bm: BookmarkItem, indent: string) => {
    const addDate = toUnixSeconds(bm.createdAt);
    const href = escapeHtml(sanitizeExportUrl(bm.url));
    const title = escapeHtml(bm.title || bm.url || 'Untitled Bookmark');
    return `${indent}<DT><A HREF="${href}" ADD_DATE="${addDate}">${title}</A>`;
  };

  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${nowSec}" LAST_MODIFIED="${nowSec}" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>`,
    '    <DL><p>',
  ];

  for (const rootCat of rootCategories) {
    const catAddDate = toUnixSeconds(rootCat.createdAt);
    const catModDate = toUnixSeconds(rootCat.updatedAt);
    lines.push(
      `        <DT><H3 ADD_DATE="${catAddDate}" LAST_MODIFIED="${catModDate}">${escapeHtml(rootCat.name)}</H3>`
    );
    lines.push('        <DL><p>');

    const directBookmarks = bookmarks.filter(
      (bm) =>
        bm.categoryId === rootCat.id &&
        (!bm.subcategoryId || !subcategoryIds.has(bm.subcategoryId))
    );
    for (const bm of directBookmarks) {
      lines.push(renderBookmarkLine(bm, '            '));
    }

    const subs = subcategoriesByParent.get(rootCat.id) || [];
    for (const sub of subs) {
      const subAddDate = toUnixSeconds(sub.createdAt);
      const subModDate = toUnixSeconds(sub.updatedAt);
      lines.push(
        `            <DT><H3 ADD_DATE="${subAddDate}" LAST_MODIFIED="${subModDate}">${escapeHtml(sub.name)}</H3>`
      );
      lines.push('            <DL><p>');

      const subBookmarks = bookmarks.filter(
        (bm) => bm.categoryId === rootCat.id && bm.subcategoryId === sub.id
      );
      for (const bm of subBookmarks) {
        lines.push(renderBookmarkLine(bm, '                '));
      }

      lines.push('            </DL><p>');
    }

    lines.push('        </DL><p>');
  }

  const orphanBookmarks = bookmarks.filter((bm) => !rootCategoryIds.has(bm.categoryId));
  if (orphanBookmarks.length > 0) {
    lines.push(
      `        <DT><H3 ADD_DATE="${nowSec}" LAST_MODIFIED="${nowSec}">General</H3>`
    );
    lines.push('        <DL><p>');
    for (const bm of orphanBookmarks) {
      lines.push(renderBookmarkLine(bm, '            '));
    }
    lines.push('        </DL><p>');
  }

  lines.push('    </DL><p>');
  lines.push('</DL><p>');

  return lines.join('\n');
}

export function buildWorkspaceJsonBackup(params: {
  categories: CategoryItem[];
  bookmarks: BookmarkItem[];
  quickShortcuts?: QuickShortcutItem[];
  settings: UserSettings;
}): string {
  const { categories, bookmarks, quickShortcuts = [], settings } = params;
  const rootCount = categories.filter((c) => !c.parentId).length;
  const subCount = categories.filter((c) => Boolean(c.parentId)).length;

  const payload = {
    app: 'MyFav',
    format: 'myfav-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: {
      categories: rootCount,
      subcategories: subCount,
      bookmarks: bookmarks.length,
      quickShortcuts: quickShortcuts.length,
    },
    data: {
      categories: categories.map(({ ownerId: _ownerId, ...rest }) => rest),
      bookmarks: bookmarks.map(({ ownerId: _ownerId, ...rest }) => rest),
      quickShortcuts: quickShortcuts.map(({ ownerId: _ownerId, ...rest }) => rest),
      settings: {
        themeMode: settings.themeMode || 'dark',
        primaryColor: settings.primaryColor,
        glassIntensity: settings.glassIntensity,
        cardDensity: settings.cardDensity,
      },
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function triggerBackupDownload(
  format: BackupFormat,
  params: {
    categories: CategoryItem[];
    bookmarks: BookmarkItem[];
    quickShortcuts?: QuickShortcutItem[];
    settings: UserSettings;
  }
): { filename: string; format: BackupFormat } {
  const stamp = getDateStamp();
  let content = '';
  let filename = '';
  let mimeType = '';

  if (format === 'csv') {
    content = buildBookmarksCsv(params.categories, params.bookmarks);
    filename = `myfav-bookmarks-${stamp}.csv`;
    mimeType = 'text/csv;charset=utf-8';
  } else if (format === 'html') {
    content = buildBookmarksHtml(params.categories, params.bookmarks);
    filename = `myfav-bookmarks-${stamp}.html`;
    mimeType = 'text/html;charset=utf-8';
  } else {
    content = buildWorkspaceJsonBackup(params);
    filename = `myfav-backup-${stamp}.json`;
    mimeType = 'application/json;charset=utf-8';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return { filename, format };
}
