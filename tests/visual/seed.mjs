// Deterministic guest (localStorage) workspace used for visual + E2E parity runs.
const T = '2026-11-01T09:00:00.000Z';
const cat = (id, name, icon, parentId, order) => ({ id, ownerId: 'local', name, icon, parentId, order, createdAt: T, updatedAt: T });
const bm = (id, title, url, description, categoryId, subcategoryId, isFavorite) => ({
  id, ownerId: 'local', title, url, description, categoryId, subcategoryId, isFavorite, createdAt: T, updatedAt: T,
});

export const SEED = {
  aethermark_categories_v1: [
    cat('cat_design', 'Design & UI', 'palette', '', 0),
    cat('cat_ai', 'AI Development', 'cpu', '', 1),
    cat('cat_marketing', 'Digital Marketing', 'megaphone', '', 2),
    cat('cat_reading', 'Reading — عربي', 'book-open', '', 3),
    cat('sub_icons', 'Icons', 'sparkles', 'cat_design', 0),
    cat('sub_type', 'Typography', 'pen-tool', 'cat_design', 1),
    cat('sub_agents', 'Agents', 'rocket', 'cat_ai', 0),
  ],
  aethermark_bookmarks_v1: [
    bm('seed_bm_figma', 'Figma', 'https://www.figma.com/', 'Collaborative interface design tool.', 'cat_design', '', true),
    bm('seed_bm_lucide', 'Lucide Icons', 'https://lucide.dev/', 'Beautiful & consistent open-source icons.', 'cat_design', 'sub_icons', true),
    bm('seed_bm_phosphor', 'Phosphor Icons', 'https://phosphoricons.com/', 'Flexible icon family.', 'cat_design', 'sub_icons', false),
    bm('seed_bm_fontshare', 'Fontshare', 'https://www.fontshare.com/', 'Free quality fonts.', 'cat_design', 'sub_type', false),
    bm('seed_bm_hf', 'Hugging Face', 'https://huggingface.co/', 'Models, datasets and spaces.', 'cat_ai', '', false),
    bm('seed_bm_langchain', 'LangChain', 'https://www.langchain.com/', 'Framework for LLM apps.', 'cat_ai', 'sub_agents', true),
    bm('seed_bm_ahrefs', 'Ahrefs', 'https://ahrefs.com/', 'SEO toolset.', 'cat_marketing', '', false),
    bm('seed_bm_pg', 'Paul Graham Essays', 'http://paulgraham.com/articles.html', '', 'cat_reading', '', false),
  ],
  aethermark_quick_shortcuts_v1: [
    { id: 'qs_gh', ownerId: 'local', title: 'GitHub', url: 'https://github.com/', iconType: 'lucide', customIcon: 'code-2', order: 0, createdAt: T, updatedAt: T },
    { id: 'qs_hn', ownerId: 'local', title: 'Hacker News', url: 'https://news.ycombinator.com/', iconType: 'favicon', customIcon: '', order: 1, createdAt: T, updatedAt: T },
    { id: 'qs_mail', ownerId: 'local', title: 'Mail', url: 'https://mail.example.com/', iconType: 'lucide', customIcon: 'zap', order: 2, createdAt: T, updatedAt: T },
  ],
};

export function settings(over = {}) {
  return { ownerId: 'local', themeMode: 'dark', primaryColor: 'blue', glassIntensity: 'balanced', cardDensity: 'comfortable', updatedAt: T, ...over };
}
