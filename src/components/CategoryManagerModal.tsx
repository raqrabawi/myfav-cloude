import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  FolderPlus,
  ArrowLeft,
  Sparkles,
  X,
  Share2,
  BarChart3,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowUpDown,
} from 'lucide-react';
import {
  BookmarkItem,
  CATEGORY_ICONS,
  CategoryItem,
  SharedCategoryRecord,
} from '../types';
import { CategoryIcon } from './CategoryIcon';

interface CategoryManagerPageProps {
  onBackToDirectory: () => void;
  onSelectCategoryInDirectory: (categoryId: string, subcategoryId?: string) => void;
  categories: CategoryItem[];
  bookmarks: BookmarkItem[];
  sharedByCategoryId?: Record<string, SharedCategoryRecord>;
  onOpenShareModal?: (category: CategoryItem) => void;
  onCreateCategory: (name: string, icon: string, parentId: string) => Promise<void>;
  onUpdateCategory: (id: string, name: string, icon: string) => Promise<void>;
  onDeleteCategory: (id: string, fallbackCategoryId?: string) => Promise<void>;
  onClearAllCategoriesAndBookmarks: () => Promise<void>;
}

type SummaryFilter = 'all' | 'cleanup' | 'empty' | 'large';
type SummarySort = 'fewest' | 'most' | 'order' | 'alpha';

export const CategoryManagerModal: React.FC<CategoryManagerPageProps> = ({
  onBackToDirectory,
  onSelectCategoryInDirectory,
  categories,
  bookmarks,
  sharedByCategoryId = {},
  onOpenShareModal,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const rootCategories = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === '')
        .sort((a, b) => a.order - b.order),
    [categories]
  );

  // Add Category Popup Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState<string>('sparkles');
  const [newCatParentId, setNewCatParentId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('sparkles');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fallbackCatId, setFallbackCatId] = useState<string>('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Summary View State
  const [showSummary, setShowSummary] = useState(true);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');
  const [summarySort, setSummarySort] = useState<SummarySort>('fewest');

  const showBanner = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg((prev) => (prev === msg ? '' : prev));
    }, 2500);
  };

  const openAddCategoryModal = (defaultParentId = '') => {
    setError('');
    setNewCatName('');
    setNewCatIcon('sparkles');
    setNewCatParentId(defaultParentId);
    setIsAddModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = newCatName.trim();
    if (!trimmed || trimmed.length > 80) {
      setError('Enter a name between 1 and 80 characters.');
      return;
    }
    setIsCreating(true);
    try {
      await onCreateCategory(trimmed, newCatIcon, newCatParentId);
      setNewCatName('');
      setIsAddModalOpen(false);
      showBanner(
        newCatParentId
          ? `Added subcategory "${trimmed}"`
          : `Created root category "${trimmed}"`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (cat: CategoryItem) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed.length > 80) return;
    await onUpdateCategory(id, trimmed, editIcon);
    setEditingId(null);
    showBanner(`Updated "${trimmed}"`);
  };

  const initiateDelete = (cat: CategoryItem) => {
    setEditingId(null);
    setConfirmDeleteId(cat.id);
    const otherRoots = rootCategories.filter((r) => r.id !== cat.id);
    setFallbackCatId(otherRoots[0]?.id || '');
  };

  const confirmDelete = async (cat: CategoryItem) => {
    await onDeleteCategory(cat.id, fallbackCatId || undefined);
    setConfirmDeleteId(null);
    showBanner(`Removed "${cat.name}"`);
  };

  const totalSubcategories = categories.filter((c) => c.parentId !== '').length;

  // Per-Category Summary Metrics for Cleanup Analysis
  const categorySummaries = useMemo(() => {
    return rootCategories.map((root) => {
      const subs = categories.filter((c) => c.parentId === root.id);
      const catBookmarks = bookmarks.filter((b) => b.categoryId === root.id);
      const totalCount = catBookmarks.length;
      const favoriteCount = catBookmarks.filter((b) => b.isFavorite).length;
      const emptySubCount = subs.filter(
        (sub) => !bookmarks.some((b) => b.subcategoryId === sub.id)
      ).length;

      const status: 'empty' | 'low' | 'large' | 'balanced' =
        totalCount === 0
          ? 'empty'
          : totalCount <= 2
          ? 'low'
          : totalCount >= 25
          ? 'large'
          : 'balanced';

      return {
        category: root,
        totalCount,
        favoriteCount,
        subCount: subs.length,
        emptySubCount,
        status,
      };
    });
  }, [rootCategories, categories, bookmarks]);

  const maxBookmarkCount = useMemo(
    () => Math.max(1, ...categorySummaries.map((s) => s.totalCount)),
    [categorySummaries]
  );

  const emptyFolderCount = useMemo(
    () => categorySummaries.filter((s) => s.totalCount === 0).length,
    [categorySummaries]
  );

  const smallFolderCount = useMemo(
    () => categorySummaries.filter((s) => s.totalCount >= 1 && s.totalCount <= 2).length,
    [categorySummaries]
  );

  const largeFolderCount = useMemo(
    () => categorySummaries.filter((s) => s.totalCount >= 25).length,
    [categorySummaries]
  );

  const cleanupCandidateCount = useMemo(
    () =>
      categorySummaries.filter(
        (s) => s.totalCount <= 2 || s.emptySubCount > 0 || s.totalCount >= 25
      ).length,
    [categorySummaries]
  );

  const filteredAndSortedSummaries = useMemo(() => {
    const filtered = categorySummaries.filter((item) => {
      if (summaryFilter === 'empty') return item.totalCount === 0;
      if (summaryFilter === 'large') return item.totalCount >= 25;
      if (summaryFilter === 'cleanup') {
        return item.totalCount <= 2 || item.emptySubCount > 0 || item.totalCount >= 25;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (summarySort === 'fewest') {
        if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount;
        return a.category.order - b.category.order;
      }
      if (summarySort === 'most') {
        if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
        return a.category.order - b.category.order;
      }
      if (summarySort === 'alpha') {
        return a.category.name.localeCompare(b.category.name);
      }
      return a.category.order - b.category.order;
    });
  }, [categorySummaries, summaryFilter, summarySort]);

  return (
    <div className="w-full space-y-5 pb-12">
      {/* Unified Top Header (matching Settings page header style) */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBackToDirectory}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Websites</span>
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Categories</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Organize your taxonomy structure, review folder totals, and clean up empty or oversized categories ({rootCategories.length} categories · {totalSubcategories} subcategories).
          </p>
        </div>

        <button
          type="button"
          onClick={() => openAddCategoryModal('')}
          className="min-h-[38px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-lg shadow-black/20"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Category</span>
        </button>
      </div>

      {error && !isAddModalOpen && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 accent-text shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Category Bookmark Summary & Cleanup View */}
      {rootCategories.length > 0 && (
        <section className="glass-surface rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-100">
                  Category Summary View
                </h2>
                <p className="text-xs text-slate-400">
                  Total websites per category to help spot empty, low-count, or crowded folders
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSummary((prev) => !prev)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            >
              <span>{showSummary ? 'Hide Summary' : 'Show Summary'}</span>
              {showSummary ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* 4-Metric Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-white/8 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-white/8 bg-slate-950/55">
            <button
              type="button"
              onClick={() => {
                setSummaryFilter('all');
                setShowSummary(true);
              }}
              className="p-3 text-left hover:bg-white/5 transition-colors cursor-pointer rounded-tl-xl sm:rounded-l-xl"
            >
              <span className="block text-[11px] text-slate-400">Total Bookmarks</span>
              <span className="mt-0.5 block text-lg font-bold font-mono-tabular text-slate-100">
                {bookmarks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSummaryFilter('empty');
                setShowSummary(true);
              }}
              className="p-3 text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="block text-[11px] text-slate-400">Empty Folders (0)</span>
              <span
                className={`mt-0.5 block text-lg font-bold font-mono-tabular ${
                  emptyFolderCount > 0 ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {emptyFolderCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSummaryFilter('cleanup');
                setShowSummary(true);
              }}
              className="p-3 text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="block text-[11px] text-slate-400">Small Folders (1–2)</span>
              <span className="mt-0.5 block text-lg font-bold font-mono-tabular text-slate-100">
                {smallFolderCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSummaryFilter('large');
                setShowSummary(true);
              }}
              className="p-3 text-left hover:bg-white/5 transition-colors cursor-pointer rounded-br-xl sm:rounded-r-xl"
            >
              <span className="block text-[11px] text-slate-400">Large Folders (25+)</span>
              <span className="mt-0.5 block text-lg font-bold font-mono-tabular text-slate-100">
                {largeFolderCount}
              </span>
            </button>
          </div>

          {showSummary && (
            <div className="space-y-3">
              {/* Filter & Sort Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/10">
                  {(
                    [
                      { id: 'all', label: `All (${rootCategories.length})` },
                      { id: 'cleanup', label: `Needs Cleanup (${cleanupCandidateCount})` },
                      { id: 'empty', label: `Empty (${emptyFolderCount})` },
                      { id: 'large', label: `Large (${largeFolderCount})` },
                    ] as const
                  ).map((fOpt) => (
                    <button
                      key={fOpt.id}
                      type="button"
                      onClick={() => setSummaryFilter(fOpt.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap font-mono-tabular ${
                        summaryFilter === fOpt.id
                          ? 'accent-bg text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fOpt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={summarySort}
                    onChange={(e) => setSummarySort(e.target.value as SummarySort)}
                    aria-label="Sort category summary"
                    className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                  >
                    <option value="fewest">Sort: Fewest Bookmarks First</option>
                    <option value="most">Sort: Most Bookmarks First</option>
                    <option value="order">Sort: Custom Folder Order</option>
                    <option value="alpha">Sort: Name (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Per-Category Summary Breakdown List */}
              {filteredAndSortedSummaries.length === 0 ? (
                <div className="py-6 px-4 text-center rounded-xl bg-slate-950/45 border border-white/8 text-xs text-slate-400">
                  No categories match this filter.
                </div>
              ) : (
                <div className="rounded-xl border border-white/8 bg-slate-950/55 divide-y divide-white/8 max-h-80 overflow-y-auto">
                  {filteredAndSortedSummaries.map(
                    ({ category, totalCount, favoriteCount, subCount, emptySubCount, status }) => {
                      const barPercent =
                        totalCount === 0
                          ? 0
                          : Math.max(4, Math.round((totalCount / maxBookmarkCount) * 100));

                      return (
                        <div
                          key={category.id}
                          className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white/[0.03] transition-colors"
                        >
                          {/* Category Title & Sub-metrics */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                              <CategoryIcon
                                name={category.icon}
                                categoryName={category.name}
                                className="w-4 h-4"
                              />
                            </div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectCategoryInDirectory(category.id)}
                                className="text-xs sm:text-sm font-semibold text-slate-100 hover:text-[var(--accent-light)] transition-colors truncate block text-left cursor-pointer"
                              >
                                {category.name}
                              </button>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular">
                                <span>
                                  {subCount} {subCount === 1 ? 'subcategory' : 'subcategories'}
                                </span>
                                {favoriteCount > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{favoriteCount} pinned</span>
                                  </>
                                )}
                                {emptySubCount > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-amber-300">
                                      {emptySubCount} empty sub
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Proportional Bar + Status Label + Count + Quick Action */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="hidden md:flex items-center gap-2 w-28">
                              <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    status === 'empty'
                                      ? 'bg-transparent'
                                      : status === 'low'
                                      ? 'bg-amber-400'
                                      : status === 'large'
                                      ? 'bg-sky-400'
                                      : 'accent-bg'
                                  }`}
                                  style={{ width: `${barPercent}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 min-w-[138px] justify-end font-mono-tabular">
                              {status === 'empty' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  <span>Empty</span>
                                </span>
                              )}
                              {status === 'low' && (
                                <span className="text-[11px] font-medium text-amber-300">
                                  Low
                                </span>
                              )}
                              {status === 'large' && (
                                <span className="text-[11px] font-medium accent-text">
                                  Large
                                </span>
                              )}
                              {status === 'balanced' && (
                                <span className="text-[11px] font-medium text-slate-400">
                                  Active
                                </span>
                              )}
                              <span aria-hidden="true" className="text-slate-600">
                                ·
                              </span>
                              <span className="text-xs font-bold text-slate-100">
                                {totalCount} {totalCount === 1 ? 'site' : 'sites'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onSelectCategoryInDirectory(category.id)}
                                title={`View ${category.name} bookmarks`}
                                className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              {totalCount === 0 && (
                                <button
                                  type="button"
                                  onClick={() => initiateDelete(category)}
                                  title={`Remove empty folder ${category.name}`}
                                  aria-label={`Remove empty folder ${category.name}`}
                                  className="min-h-[30px] min-w-[30px] rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Full-Width Directory Hierarchy Tree List */}
      <div className="space-y-3.5">
        {rootCategories.length === 0 ? (
          <div className="glass-surface rounded-2xl p-8 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl accent-subtle-bg accent-text flex items-center justify-center mx-auto">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-200">No categories yet</p>
              <p className="text-xs text-slate-400">
                Click &ldquo;Add Category&rdquo; in the header above to create your first category, or import your Chrome bookmark folders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAddCategoryModal('')}
              className="mt-1 inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>
        ) : (
          rootCategories.map((root) => {
            const subs = categories
              .filter((c) => c.parentId === root.id)
              .sort((a, b) => a.order - b.order);
            const rootBookmarkCount = bookmarks.filter((b) => b.categoryId === root.id).length;
            const isEditingRoot = editingId === root.id;
            const isDeletingRoot = confirmDeleteId === root.id;

            return (
              <div
                key={root.id}
                className="glass-surface rounded-2xl p-4 sm:p-5 space-y-3.5"
              >
                {/* Root Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {isEditingRoot ? (
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={80}
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs sm:text-sm text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(root.id)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {CATEGORY_ICONS.map((iconKey) => (
                          <button
                            key={iconKey}
                            type="button"
                            onClick={() => setEditIcon(iconKey)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer ${
                              editIcon === iconKey
                                ? 'accent-bg border-transparent text-white'
                                : 'bg-slate-950 border-white/10 text-slate-400'
                            }`}
                          >
                            <CategoryIcon name={iconKey} className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                          <CategoryIcon
                            name={root.icon}
                            categoryName={root.name}
                            className="w-5 h-5"
                          />
                        </div>
                        <div className="min-w-0 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectCategoryInDirectory(root.id)}
                            className="text-base font-semibold text-slate-100 hover:text-[var(--accent-light)] transition-colors truncate text-left cursor-pointer"
                          >
                            {root.name}
                          </button>
                          <div className="flex items-center gap-1.5 font-mono-tabular">
                            <span
                              title={`${rootBookmarkCount} saved websites`}
                              className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-[11px] font-medium text-slate-400"
                            >
                              {rootBookmarkCount}
                            </span>
                            {subs.length > 0 && (
                              <span
                                title={`${subs.length} subcategories`}
                                className="px-2 py-0.5 rounded-lg accent-subtle-bg accent-text text-[11px] font-semibold"
                              >
                                ↳ {subs.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {onOpenShareModal && (
                          <button
                            type="button"
                            onClick={() => onOpenShareModal(root)}
                            aria-label={`Share ${root.name}`}
                            title={
                              sharedByCategoryId[root.id]
                                ? 'Manage public read-only share link'
                                : 'Generate public read-only share link'
                            }
                            className={`min-h-[38px] px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                              sharedByCategoryId[root.id]
                                ? 'accent-subtle-bg border accent-border accent-text hover:bg-white/10 font-semibold'
                                : 'bg-white/5 hover:bg-white/10 text-slate-200'
                            }`}
                          >
                            <Share2 className="w-3.5 h-3.5 accent-text" />
                            <span>Share</span>
                            {sharedByCategoryId[root.id] && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                                title="Public link active"
                              />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openAddCategoryModal(root.id)}
                          className="min-h-[38px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 accent-text" />
                          <span>Add Subcategory</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(root)}
                          aria-label={`Rename ${root.name}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => initiateDelete(root)}
                          aria-label={`Delete ${root.name}`}
                          className="min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Delete Confirmation Banner */}
                {isDeletingRoot && (
                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-3">
                    <p className="text-xs text-rose-200">
                      Remove category <strong className="font-semibold">{root.name}</strong>?
                      {rootBookmarkCount > 0 &&
                        rootCategories.length > 1 &&
                        ` Choose where to move its ${rootBookmarkCount} saved website(s):`}
                    </p>
                    {rootBookmarkCount > 0 && rootCategories.length > 1 && (
                      <select
                        value={fallbackCatId}
                        onChange={(e) => setFallbackCatId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-slate-100"
                      >
                        <option value="">Delete websites in this category</option>
                        {rootCategories
                          .filter((c) => c.id !== root.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              Move websites to: {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 text-xs text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(root)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        Confirm Remove
                      </button>
                    </div>
                  </div>
                )}

                {/* Subcategories Grid/List */}
                {subs.length > 0 && (
                  <div className="pt-3 border-t border-white/8 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {subs.map((sub) => {
                      const subCount = bookmarks.filter(
                        (b) => b.subcategoryId === sub.id
                      ).length;
                      const isEditingSub = editingId === sub.id;

                      return (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-slate-950/55 border border-white/6"
                        >
                          {isEditingSub ? (
                            <div className="flex-1 flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={80}
                                className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/15 text-xs text-slate-100"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(sub.id)}
                                className="px-2.5 py-1 rounded-lg accent-bg text-white text-xs font-medium cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 rounded-lg bg-white/5 text-slate-400 text-xs cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onSelectCategoryInDirectory(root.id, sub.id)}
                                className="flex items-center gap-2 min-w-0 text-left hover:text-white transition-colors cursor-pointer"
                              >
                                <span className="text-slate-500 text-xs">↳</span>
                                <span className="text-xs font-medium text-slate-200 truncate">
                                  {sub.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-slate-400 font-mono-tabular">
                                  {subCount}
                                </span>
                              </button>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEditing(sub)}
                                  aria-label={`Rename subcategory ${sub.name}`}
                                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 flex items-center justify-center cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteCategory(sub.id)}
                                  aria-label={`Delete subcategory ${sub.name}`}
                                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Category / Subcategory Popup Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="glass-elevated rounded-2xl w-full max-w-md border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    {newCatParentId ? 'Add New Subcategory' : 'Add New Category'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Choose a name, hierarchy level, and icon
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAdd} className="p-5 overflow-y-auto space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Hierarchy Placement
                </label>
                <select
                  value={newCatParentId}
                  onChange={(e) => setNewCatParentId(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="">Root Category (Top Level)</option>
                  {rootCategories.map((root) => (
                    <option key={root.id} value={root.id}>
                      Subcategory inside: {root.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {newCatParentId ? 'Subcategory Name' : 'Category Name'}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder={
                    newCatParentId
                      ? 'e.g. Vector Libraries, Prompt Engineering...'
                      : 'e.g. Icons, AI Design, Marketing...'
                  }
                  maxLength={80}
                  required
                  className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Select Category Icon
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {CATEGORY_ICONS.map((iconKey) => {
                    const active = newCatIcon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setNewCatIcon(iconKey)}
                        className={`h-10 rounded-xl flex items-center justify-center border transition-colors cursor-pointer ${
                          active
                            ? 'accent-bg border-transparent text-white shadow-sm'
                            : 'bg-slate-950/60 border-white/8 text-slate-400 hover:text-slate-100 hover:bg-white/5'
                        }`}
                        title={iconKey}
                      >
                        <CategoryIcon name={iconKey} className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="min-h-[40px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {isCreating
                      ? 'Creating...'
                      : newCatParentId
                      ? 'Create Subcategory'
                      : 'Create Category'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
