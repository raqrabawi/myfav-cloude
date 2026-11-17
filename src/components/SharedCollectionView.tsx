import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Lock,
  Moon,
  Search,
  Share2,
  Star,
  Sun,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { BookmarkItem, SharedCategoryRecord, ThemeMode } from '../types';
import { CategoryIcon, WebsiteFavicon } from './CategoryIcon';
import { MyFavLogo } from './MyFavLogo';

interface SharedCollectionViewProps {
  shareId: string;
  themeMode: ThemeMode;
  onToggleThemeMode: () => void;
  onExitShareView: () => void;
  onPreviewBookmark: (bookmark: BookmarkItem) => void;
}

export const SharedCollectionView: React.FC<SharedCollectionViewProps> = ({
  shareId,
  themeMode,
  onToggleThemeMode,
  onExitShareView,
  onPreviewBookmark,
}) => {
  const [sharedData, setSharedData] = useState<SharedCategoryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSharedCollection = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const d = await apiClient.getPublicShare(shareId);
        if (cancelled) return;
        if (!d || d.isPublic === false) {
          setNotFound(true);
          setSharedData(null);
          return;
        }
        setSharedData({
          id: d.id,
          ownerId: d.ownerId || '',
          categoryId: d.categoryId || '',
          categoryName: d.categoryName || 'Curated Collection',
          categoryIcon: d.categoryIcon || 'bookmark',
          isPublic: Boolean(d.isPublic),
          subcategories: Array.isArray(d.subcategories) ? d.subcategories : [],
          bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
          createdAt: d.createdAt || '',
          updatedAt: d.updatedAt || '',
        });
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setSharedData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSharedCollection();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const sortedSubcategories = useMemo(() => {
    if (!sharedData) return [];
    return [...sharedData.subcategories].sort((a, b) => a.order - b.order);
  }, [sharedData]);

  const subMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sub of sortedSubcategories) {
      map[sub.id] = sub.name;
    }
    return map;
  }, [sortedSubcategories]);

  const filteredBookmarks = useMemo(() => {
    if (!sharedData) return [];
    const q = searchQuery.trim().toLowerCase();
    return sharedData.bookmarks.filter((bm) => {
      if (selectedSubId !== 'all' && bm.subcategoryId !== selectedSubId) {
        return false;
      }
      if (!q) return true;
      const subName = bm.subcategoryId ? (subMap[bm.subcategoryId] || '').toLowerCase() : '';
      return (
        bm.title.toLowerCase().includes(q) ||
        bm.url.toLowerCase().includes(q) ||
        bm.description.toLowerCase().includes(q) ||
        subName.includes(q)
      );
    });
  }, [sharedData, selectedSubId, searchQuery, subMap]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  return (
    <div className="min-h-screen accent-glow-bg text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 glass-elevated border-b border-white/10">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MyFavLogo size="md" showText={true} />
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold shrink-0">
              <Lock className="w-3 h-3" />
              <span>Public Read-Only Collection</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleThemeMode}
              title={themeMode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              aria-label="Toggle theme mode"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {themeMode === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onExitShareView}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Open MyFav</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 space-y-5">
        {loading ? (
          <div className="space-y-4">
            <div className="glass-surface rounded-2xl p-6 h-28 animate-pulse" />
            <div className="glass-surface rounded-2xl p-5 h-24 animate-pulse" />
            <div className="glass-surface rounded-2xl p-5 h-24 animate-pulse" />
          </div>
        ) : notFound || !sharedData ? (
          <div className="glass-surface rounded-2xl p-10 text-center max-w-lg mx-auto my-10 space-y-4">
            <div className="w-12 h-12 rounded-2xl accent-subtle-bg accent-text flex items-center justify-center mx-auto">
              <Share2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-slate-100">
                Shared Collection Not Found
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                This shared category link may have been revoked by its owner or does not exist.
              </p>
            </div>
            <button
              type="button"
              onClick={onExitShareView}
              className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold cursor-pointer shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to MyFav Directory</span>
            </button>
          </div>
        ) : (
          <>
            {/* Collection Hero Header */}
            <section className="glass-surface rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl accent-subtle-bg border accent-border flex items-center justify-center accent-text shrink-0">
                  <CategoryIcon
                    name={sharedData.categoryIcon}
                    categoryName={sharedData.categoryName}
                    className="w-7 h-7"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider accent-text">
                      Curated Category Collection
                    </span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-[11px] font-mono-tabular text-slate-400">
                      {sharedData.bookmarks.length}{' '}
                      {sharedData.bookmarks.length === 1 ? 'website' : 'websites'}
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight truncate">
                    {sharedData.categoryName}
                  </h1>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy('share_url', window.location.href)}
                className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                {copiedKey === 'share_url' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Share Link</span>
                  </>
                )}
              </button>
            </section>

            {/* Search & Subcategory Filter Bar */}
            <section className="glass-surface rounded-2xl p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search websites in ${sharedData.categoryName}...`}
                  className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>

              {sortedSubcategories.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSubId('all')}
                    className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      selectedSubId === 'all'
                        ? 'accent-bg text-white'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    All ({sharedData.bookmarks.length})
                  </button>
                  {sortedSubcategories.map((sub) => {
                    const count = sharedData.bookmarks.filter(
                      (b) => b.subcategoryId === sub.id
                    ).length;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubId(sub.id)}
                        className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          selectedSubId === sub.id
                            ? 'accent-bg text-white font-semibold'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300'
                        }`}
                      >
                        {sub.name} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Read-only Website Cards */}
            {filteredBookmarks.length === 0 ? (
              <div className="glass-surface rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-400">
                No websites found in this view.
              </div>
            ) : (
              <div className="flex flex-col space-y-3">
                {filteredBookmarks.map((bm, idx) => {
                  const subName = bm.subcategoryId ? subMap[bm.subcategoryId] : '';
                  const copyId = `bm_${idx}`;
                  const previewBm: BookmarkItem = {
                    id: copyId,
                    ownerId: sharedData.ownerId,
                    title: bm.title,
                    url: bm.url,
                    description: bm.description,
                    categoryId: sharedData.categoryId,
                    subcategoryId: bm.subcategoryId,
                    isFavorite: bm.isFavorite,
                    createdAt: '',
                    updatedAt: '',
                  };

                  return (
                    <article
                      key={`${bm.url}_${idx}`}
                      className="glass-surface website-card rounded-2xl p-4 sm:p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-3.5 group hover:border-white/20"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <WebsiteFavicon url={bm.url} title={bm.title} />

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <a
                              href={bm.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-base sm:text-[17px] font-semibold text-slate-100 hover:text-[var(--accent-light)] transition-colors truncate flex items-center gap-1.5"
                            >
                              <span className="truncate">{bm.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 accent-text" />
                            </a>
                            {bm.isFavorite && (
                              <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
                            )}
                          </div>

                          {bm.description && (
                            <p className="text-xs text-slate-400 line-clamp-1">
                              {bm.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <a
                              href={bm.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={bm.url}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-light)] font-mono text-xs font-semibold hover:bg-[var(--accent-primary)]/25 transition-colors truncate max-w-[260px] sm:max-w-md lg:max-w-xl"
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{bm.url}</span>
                            </a>

                            {subName && (
                              <span className="text-xs accent-text font-medium">
                                • {subName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2.5 md:pt-0 border-t md:border-t-0 border-white/5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onPreviewBookmark(previewBm)}
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5 accent-text" />
                          <span>Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(copyId, bm.url)}
                          title="Copy URL"
                          className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          {copiedKey === copyId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-3 py-1 rounded-lg accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
