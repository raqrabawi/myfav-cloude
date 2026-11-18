export interface ExtractedChromeCategory {
  tempId: string;
  name: string;
  icon: string;
  parentTempId: string; // "" if root category, or root tempId if subcategory
  order: number;
}

export interface ExtractedChromeBookmark {
  title: string;
  url: string;
  categoryTempId: string;
  subcategoryTempId: string;
  categoryName: string;
  subcategoryName: string;
  order: number;
}

export interface ChromeImportPlan {
  categories: ExtractedChromeCategory[];
  bookmarks: ExtractedChromeBookmark[];
}

const CHROME_ROOT_WRAPPERS = new Set([
  'bookmarks bar',
  'bookmarks toolbar',
  'other bookmarks',
  'unfiled bookmarks',
  'mobile bookmarks',
  'favorites bar',
  'favorites',
  'bookmarks',
  'synced bookmarks',
]);

// Links that sit directly in a browser's top-level folder keep that browser's
// own name (Safari "Favorites", Edge "Favorites bar", Firefox "Bookmarks
// Toolbar"); Chrome's folders keep the original "Bookmarks Bar" behaviour.
const WRAPPER_DISPLAY_NAME: Record<string, string> = {
  favorites: 'Favorites',
  'favorites bar': 'Favorites Bar',
  'bookmarks toolbar': 'Bookmarks Toolbar',
};

// Safari exports its Reading List (saved articles) with the bookmarks; those
// aren't favourite websites, so they are not imported.
const SKIPPED_TOP_LEVEL_FOLDERS = new Set(['reading list']);

const FALLBACK_DISTINCT_ICONS = [
  'compass',
  'layers',
  'globe',
  'sparkles',
  'rocket',
  'hexagon',
  'zap',
  'cpu',
  'palette',
  'book-open',
] as const;

export function inferIconForFolderName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (!lower) return 'compass';

  if (/\b(icon|icons|svg|glyph|emoji|sticker)\b/.test(lower)) return 'sparkles';
  if (/\b(image|images|photo|photos|stock|picture|wallpaper|mockup|unsplash|gallery|camera)\b/.test(lower))
    return 'image';
  if (/\b(video|videos|youtube|movie|movies|film|stream|streaming|tv|cinema|animation|motion)\b/.test(lower))
    return 'video';
  if (/\b(music|audio|sound|podcast|spotify|radio|voice|beat|sfx)\b/.test(lower))
    return 'music';
  if (/\b(ai\s*design|generative|midjourney|prompt|magic|ai|gpt|claude|openai|gemini|copilot|bot)\b/.test(lower))
    return 'wand-2';
  if (/\b(ai\s*dev|llm|machine\s*learning|ml|neural|model|agent|agents|automation|hardware)\b/.test(lower))
    return 'cpu';
  if (/\b(code|coding|dev|developer|programming|github|git|frontend|backend|react|js|typescript|web\s*dev|software)\b/.test(lower))
    return 'code-2';
  if (/\b(data|database|sql|cloud|server|hosting|aws|firebase|supabase|storage|api|analytics)\b/.test(lower))
    return 'database';
  if (/\b(graphic|design|ui|ux|color|colors|palette|art|illustration|dribbble|behance|figma|canvas)\b/.test(lower))
    return 'palette';
  if (/\b(font|fonts|typography|type|writing|copywriting|blog|editorial|vector|draw)\b/.test(lower))
    return 'pen-tool';
  if (/\b(logo|logos|brand|branding|identity|symbol)\b/.test(lower)) return 'hexagon';
  if (/\b(marketing|seo|social|ads|advertising|growth|media|pr|campaign|newsletter)\b/.test(lower))
    return 'megaphone';
  if (/\b(business|finance|work|startup|company|office|ops|management|crm|legal|career|job|jobs|invest|money|bank)\b/.test(lower))
    return 'briefcase';
  if (/\b(shop|shopping|store|ecommerce|buy|deals|amazon|market|product|products|fashion)\b/.test(lower))
    return 'shopping-bag';
  if (/\b(tool|tools|utility|utilities|script|cli|terminal|command|extension|plugin|productivity)\b/.test(lower))
    return 'terminal';
  if (/\b(learn|learning|course|courses|tutorial|read|reading|doc|docs|documentation|book|books|wiki|study|research|education|news|article)\b/.test(lower))
    return 'book-open';
  if (/\b(security|auth|privacy|vpn|crypto|password|cyber|admin)\b/.test(lower))
    return 'shield';
  if (/\b(game|games|gaming|play|arcade|3d|webgl|fun|entertainment)\b/.test(lower))
    return 'gamepad-2';
  if (/\b(launch|project|projects|idea|ideas|inspiration|trend|trends|future|explore)\b/.test(lower))
    return 'rocket';
  if (/\b(template|templates|component|components|system|resource|resources|kit|ui\s*kit|asset|assets)\b/.test(lower))
    return 'layers';
  if (/\b(quick|fast|daily|favorite|favorites|top|pinned|essential|bar|toolbar)\b/.test(lower))
    return 'zap';

  // Deterministic distinct icon based on folder name hash so folders never all look the same
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_DISTINCT_ICONS[hash % FALLBACK_DISTINCT_ICONS.length];
}

export function inferFallbackCategoryName(url: string, title: string): string {
  const combined = `${title} ${url}`.toLowerCase();
  if (/\b(icon|icons|svg|lucide|phosphor|flaticon|fontawesome|lordicon)\b/.test(combined)) {
    return 'Icons';
  }
  if (/\b(logo|brandarchive|logobook|brand\s*identity)\b/.test(combined)) {
    return 'Logo Design';
  }
  if (
    /\b(midjourney|krea|runway|leonardo|ideogram|civitai|spline|framer|ai\s*design|ai\s*art)\b/.test(
      combined
    )
  ) {
    return 'AI Design';
  }
  if (
    /\b(openai|anthropic|claude|chatgpt|huggingface|langchain|replicate|github|vercel|supabase|colab|ai\s*dev|llm)\b/.test(
      combined
    )
  ) {
    return 'AI Development';
  }
  if (/\b(unsplash|pexels|pixabay|cosmos|pinterest|shutterstock|ls\.graphics|photo|image)\b/.test(combined)) {
    return 'Images';
  }
  if (/\b(figma|dribbble|behance|awwwards|canva|adobe|coolors|oklch|fontshare|font|graphic|design)\b/.test(combined)) {
    return 'Graphic Design';
  }
  if (/\b(ahrefs|semrush|moz|hubspot|mailchimp|seo|marketing|analytics|ads)\b/.test(combined)) {
    return 'Digital Marketing';
  }
  return 'Bookmarks Bar';
}

interface ChromeJsonNode {
  type?: 'folder' | 'url' | string;
  name?: string;
  title?: string;
  url?: string;
  children?: ChromeJsonNode[];
}

/**
 * Parses:
 * 1) Chrome's live local `Bookmarks` JSON file (or `chrome.bookmarks.getTree()` JSON payload)
 * 2) Chrome's exported `bookmarks_*.html` file
 * 3) Pasted folders & URLs
 * And preserves the exact folder (Category), subfolder (Subcategory), and bookmark arrangement.
 */
export function parseChromeBookmarksExactArrangement(
  rawContent: string
): ChromeImportPlan {
  const categories: ExtractedChromeCategory[] = [];
  const bookmarks: ExtractedChromeBookmark[] = [];

  const rootCatByName = new Map<string, ExtractedChromeCategory>();
  const subCatByKey = new Map<string, ExtractedChromeCategory>();

  const getOrCreateRootCategory = (rawName: string): ExtractedChromeCategory => {
    const cleanName = rawName.trim().slice(0, 80) || 'Bookmarks';
    const key = cleanName.toLowerCase();
    const existing = rootCatByName.get(key);
    if (existing) return existing;

    const created: ExtractedChromeCategory = {
      tempId: `cat_${categories.filter((c) => c.parentTempId === '').length + 1}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      name: cleanName,
      icon: inferIconForFolderName(cleanName),
      parentTempId: '',
      order: categories.filter((c) => c.parentTempId === '').length,
    };
    categories.push(created);
    rootCatByName.set(key, created);
    return created;
  };

  const getOrCreateSubcategory = (
    rootTempId: string,
    rawSubName: string
  ): ExtractedChromeCategory => {
    const cleanName = rawSubName.trim().slice(0, 80);
    const key = `${rootTempId}::${cleanName.toLowerCase()}`;
    const existing = subCatByKey.get(key);
    if (existing) return existing;

    const siblingsCount = categories.filter((c) => c.parentTempId === rootTempId).length;
    const created: ExtractedChromeCategory = {
      tempId: `sub_${siblingsCount + 1}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      icon: inferIconForFolderName(cleanName),
      parentTempId: rootTempId,
      order: siblingsCount,
    };
    categories.push(created);
    subCatByKey.set(key, created);
    return created;
  };

  const registerBookmarkInFolderStack = (
    href: string,
    title: string,
    folderStack: string[]
  ) => {
    if (!/^https?:\/\/.+/i.test(href)) return;
    if (folderStack[0] && SKIPPED_TOP_LEVEL_FOLDERS.has(folderStack[0].trim().toLowerCase())) return;

    const meaningfulFolders = folderStack.filter(
      (f, idx) => !(idx === 0 && CHROME_ROOT_WRAPPERS.has(f.toLowerCase()))
    );

    let rootCat: ExtractedChromeCategory;
    let subCat: ExtractedChromeCategory | null = null;

    if (meaningfulFolders.length === 0) {
      const wrapperKey = (folderStack[0] || '').trim().toLowerCase();
      const topWrapperName =
        folderStack[0] && !CHROME_ROOT_WRAPPERS.has(wrapperKey)
          ? folderStack[0]
          : WRAPPER_DISPLAY_NAME[wrapperKey] || 'Bookmarks Bar';
      rootCat = getOrCreateRootCategory(topWrapperName);
    } else if (meaningfulFolders.length === 1) {
      rootCat = getOrCreateRootCategory(meaningfulFolders[0]);
    } else {
      rootCat = getOrCreateRootCategory(meaningfulFolders[0]);
      const subPathName = meaningfulFolders.slice(1).join(' / ');
      subCat = getOrCreateSubcategory(rootCat.tempId, subPathName);
    }

    bookmarks.push({
      title: (title || href).slice(0, 120),
      url: href.slice(0, 500),
      categoryTempId: rootCat.tempId,
      subcategoryTempId: subCat ? subCat.tempId : '',
      categoryName: rootCat.name,
      subcategoryName: subCat ? subCat.name : '',
      order: bookmarks.length,
    });
  };

  // 1. Check if input is Chrome's live `Bookmarks` JSON file or `chrome.bookmarks.getTree()` JSON
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed);

      const walkJsonNode = (node: ChromeJsonNode, folderStack: string[]) => {
        const nodeTitle = (node.name || node.title || '').trim();
        const isFolder =
          node.type === 'folder' || Array.isArray(node.children);

        if (node.url && !isFolder) {
          registerBookmarkInFolderStack(
            node.url.trim(),
            nodeTitle || node.url.trim(),
            folderStack
          );
          return;
        }

        if (Array.isArray(node.children)) {
          const nextStack = nodeTitle ? [...folderStack, nodeTitle] : folderStack;
          if (nextStack.length === 1 && SKIPPED_TOP_LEVEL_FOLDERS.has(nextStack[0].toLowerCase())) {
            return;
          }
          const meaningful = nextStack.filter(
            (f, idx) => !(idx === 0 && CHROME_ROOT_WRAPPERS.has(f.toLowerCase()))
          );
          if (meaningful.length === 1) {
            getOrCreateRootCategory(meaningful[0]);
          } else if (meaningful.length >= 2) {
            const r = getOrCreateRootCategory(meaningful[0]);
            getOrCreateSubcategory(r.tempId, meaningful.slice(1).join(' / '));
          }

          for (const child of node.children) {
            walkJsonNode(child, nextStack);
          }
        }
      };

      if (
        parsedJson &&
        typeof parsedJson === 'object' &&
        parsedJson.format === 'myfav-backup' &&
        parsedJson.data &&
        Array.isArray(parsedJson.data.categories) &&
        Array.isArray(parsedJson.data.bookmarks)
      ) {
        const rawCats = parsedJson.data.categories as Array<{
          id?: string;
          name?: string;
          icon?: string;
          parentId?: string;
          order?: number;
        }>;
        const rawBookmarks = parsedJson.data.bookmarks as Array<{
          title?: string;
          url?: string;
          categoryId?: string;
          subcategoryId?: string;
        }>;

        const rootMap = new Map<string, ExtractedChromeCategory>();
        const subMap = new Map<string, ExtractedChromeCategory>();

        for (const cat of [...rawCats]
          .filter((c) => !c.parentId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
          if (!cat.id || !cat.name) continue;
          const created = getOrCreateRootCategory(cat.name);
          if (cat.icon) created.icon = cat.icon;
          rootMap.set(cat.id, created);
        }

        for (const sub of [...rawCats]
          .filter((c) => Boolean(c.parentId))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
          if (!sub.id || !sub.name || !sub.parentId) continue;
          const parent = rootMap.get(sub.parentId);
          if (!parent) continue;
          const created = getOrCreateSubcategory(parent.tempId, sub.name);
          if (sub.icon) created.icon = sub.icon;
          subMap.set(sub.id, created);
        }

        for (const bm of rawBookmarks) {
          const href = (bm.url || '').trim();
          if (!/^https?:\/\/.+/i.test(href)) continue;
          const title = (bm.title || href).trim();
          const rootCat =
            (bm.categoryId ? rootMap.get(bm.categoryId) : undefined) ||
            getOrCreateRootCategory(inferFallbackCategoryName(href, title));
          const subCat = bm.subcategoryId ? subMap.get(bm.subcategoryId) : undefined;

          bookmarks.push({
            title: title.slice(0, 120),
            url: href.slice(0, 500),
            categoryTempId: rootCat.tempId,
            subcategoryTempId: subCat ? subCat.tempId : '',
            categoryName: rootCat.name,
            subcategoryName: subCat ? subCat.name : '',
            order: bookmarks.length,
          });
        }

        if (bookmarks.length > 0 || categories.length > 0) {
          return { categories, bookmarks };
        }
      } else if (Array.isArray(parsedJson)) {
        // chrome.bookmarks.getTree() array
        for (const rootNode of parsedJson) {
          walkJsonNode(rootNode, []);
        }
      } else if (parsedJson && typeof parsedJson === 'object' && parsedJson.roots) {
        // Chrome local `Bookmarks` file format: { roots: { bookmark_bar, other, synced } }
        const roots = parsedJson.roots as Record<string, ChromeJsonNode>;
        if (roots.bookmark_bar) walkJsonNode(roots.bookmark_bar, []);
        if (roots.other) walkJsonNode(roots.other, []);
        if (roots.synced) walkJsonNode(roots.synced, []);
      }

      if (bookmarks.length > 0 || categories.length > 0) {
        return { categories, bookmarks };
      }
    } catch {
      // Fall through to HTML/text parsing
    }
  }

  // 2. Parse Netscape / Chrome Bookmark HTML tree
  if (/<a\s+[^>]*href=/i.test(rawContent)) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawContent, 'text/html');

    const walkHtml = (container: Element, folderStack: string[]) => {
      const children = Array.from(container.children);
      for (const child of children) {
        const tag = child.tagName.toUpperCase();

        if (tag === 'DT') {
          let h3: Element | null = null;
          let a: Element | null = null;
          let dl: Element | null = null;

          for (const dtChild of Array.from(child.children)) {
            const dtTag = dtChild.tagName.toUpperCase();
            if (dtTag === 'H3' && !h3) h3 = dtChild;
            else if (dtTag === 'A' && !a) a = dtChild;
            else if (dtTag === 'DL' && !dl) dl = dtChild;
          }

          if (a) {
            const href = (a.getAttribute('href') || '').trim();
            const title = (a.textContent || '').trim() || href;
            registerBookmarkInFolderStack(href, title, folderStack);
          }

          if (h3 && dl) {
            const folderTitle = (h3.textContent || '').trim();
            const nextStack = folderTitle ? [...folderStack, folderTitle] : folderStack;
            if (nextStack.length === 1 && SKIPPED_TOP_LEVEL_FOLDERS.has(nextStack[0].toLowerCase())) {
              continue; // e.g. Safari's Reading List: no category, no links
            }
            const meaningful = nextStack.filter(
              (f, idx) => !(idx === 0 && CHROME_ROOT_WRAPPERS.has(f.toLowerCase()))
            );
            if (meaningful.length === 1) {
              getOrCreateRootCategory(meaningful[0]);
            } else if (meaningful.length >= 2) {
              const r = getOrCreateRootCategory(meaningful[0]);
              getOrCreateSubcategory(r.tempId, meaningful.slice(1).join(' / '));
            }
            walkHtml(dl, nextStack);
          } else if (dl) {
            walkHtml(dl, folderStack);
          }
        } else {
          walkHtml(child, folderStack);
        }
      }
    };

    walkHtml(doc.body, []);
  }

  // 3. Fallback: Line-by-line pasted links or "[Folder] Title - URL"
  if (bookmarks.length === 0) {
    let currentHeaderCategory: string | null = null;
    const lines = rawContent.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const urlMatch = line.match(/https?:\/\/[^\s)>\]]+/i);
      if (!urlMatch) {
        const cleanedHeading = line.replace(/^[#*\-–—•:]+\s*/, '').trim();
        if (cleanedHeading.length >= 2 && cleanedHeading.length <= 60) {
          currentHeaderCategory = cleanedHeading;
          getOrCreateRootCategory(currentHeaderCategory);
        }
        continue;
      }

      const url = urlMatch[0].trim();
      let title = line
        .replace(url, '')
        .replace(/^[\s\-–—:|[\]()]+|[\s\-–—:|[\]()]+$/g, '')
        .trim();

      if (!title) {
        try {
          const u = new URL(url);
          title = u.hostname.replace(/^www\./, '');
        } catch {
          title = url;
        }
      }

      const catName =
        currentHeaderCategory || inferFallbackCategoryName(url, title);
      const rootCat = getOrCreateRootCategory(catName);

      bookmarks.push({
        title: title.slice(0, 120),
        url: url.slice(0, 500),
        categoryTempId: rootCat.tempId,
        subcategoryTempId: '',
        categoryName: rootCat.name,
        subcategoryName: '',
        order: bookmarks.length,
      });
    }
  }

  return { categories, bookmarks };
}
