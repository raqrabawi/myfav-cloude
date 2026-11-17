import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Star, SlidersHorizontal, FolderOpen, StarOff } from 'lucide-react';
import { BookmarkItem, CategoryItem } from '../types';
import { CategoryIcon } from './CategoryIcon';

export type BatchFavoriteAction = 'keep' | 'favorite' | 'unfavorite';

export interface BatchEditPayload {
  category?: {
    categoryId: string;
    subcategoryId: string;
  };
  favoriteStatus?: BatchFavoriteAction;
}

interface BatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarksToEdit: BookmarkItem[];
  categories: CategoryItem[];
  onConfirmBatchEdit: (
    bookmarkIds: string[],
    updates: BatchEditPayload
  ) => Promise<void>;
}

export const BatchEditModal: React.FC<BatchEditModalProps> = ({
  isOpen,
  onClose,
  bookmarksToEdit,
  categories,
  onConfirmBatchEdit,
}) => {
  const rootCategories = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === '')
        .sort((a, b) => a.order - b.order),
    [categories]
  );

  const [updateCategory, setUpdateCategory] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [favoriteAction, setFavoriteAction] = useState<BatchFavoriteAction>('keep');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || bookmarksToEdit.length === 0) return;
    const first = bookmarksToEdit[0];
    setUpdateCategory(false);
    setSelectedCatId(first.categoryId || rootCategories[0]?.id || '');
    setSelectedSubId('');
    setFavoriteAction('keep');
    setError('');
  }, [isOpen, bookmarksToEdit, rootCategories]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || bookmarksToEdit.length === 0) return null;

  const subcategories = categories
    .filter((c) => c.parentId === selectedCatId)
    .sort((a, b) => a.order - b.order);

  const pinnedCount = bookmarksToEdit.filter((b) => b.isFavorite).length;
  const unpinnedCount = bookmarksToEdit.length - pinnedCount;
  const canApply =
    (updateCategory && Boolean(selectedCatId)) || favoriteAction !== 'keep';

  const targetCatObj = rootCategories.find((c) => c.id === selectedCatId);
  const targetSubObj = subcategories.find((c) => c.id === selectedSubId);

  const handleConfirm = async () => {
    if (!canApply) return;
    setError('');
    setIsSaving(true);
    try {
      await onConfirmBatchEdit(
        bookmarksToEdit.map((b) => b.id),
        {
          category:
            updateCategory && selectedCatId
              ? {
                  categoryId: selectedCatId,
                  subcategoryId: selectedSubId || '',
                }
              : undefined,
          favoriteStatus: favoriteAction,
        }
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to apply batch changes. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const previewTitles = bookmarksToEdit
    .slice(0, 3)
    .map((b) => b.title)
    .join(', ');
  const remainingCount = Math.max(0, bookmarksToEdit.length - 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => !isSaving && onClose()}
    >
      <div
        className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="w-10 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4 sm:hidden" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-100 truncate">
                  Batch Edit {bookmarksToEdit.length}{' '}
                  {bookmarksToEdit.length === 1 ? 'Website' : 'Websites'}
                </h2>
                <p className="text-xs text-slate-400 font-mono-tabular">
                  {pinnedCount} pinned · {unpinnedCount} unpinned
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Selected Sites Summary Line */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/55 border border-white/8 text-xs text-slate-300">
            <span className="text-slate-400">Selected: </span>
            <span className="font-medium text-slate-100">{previewTitles}</span>
            {remainingCount > 0 && (
              <span className="text-slate-400 font-mono-tabular">
                {' '}
                +{remainingCount} more
              </span>
            )}
          </div>

          {/* 1. Favorite Status Action */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">
                1. Favorite Status
              </p>
              <span className="text-[11px] text-slate-400">
                Update pinned state in one click
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFavoriteAction('keep')}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  favoriteAction === 'keep'
                    ? 'accent-subtle-bg accent-border text-white font-semibold'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>No Change</span>
              </button>

              <button
                type="button"
                onClick={() => setFavoriteAction('favorite')}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  favoriteAction === 'favorite'
                    ? 'accent-bg border-transparent text-white font-semibold shadow-xs'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    favoriteAction === 'favorite'
                      ? 'fill-white text-white'
                      : 'text-amber-400'
                  }`}
                />
                <span>Pin Favorites</span>
              </button>

              <button
                type="button"
                onClick={() => setFavoriteAction('unfavorite')}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  favoriteAction === 'unfavorite'
                    ? 'accent-bg border-transparent text-white font-semibold shadow-xs'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <StarOff className="w-3.5 h-3.5" />
                <span>Unpin All</span>
              </button>
            </div>
          </div>

          {/* 2. Category & Subcategory Assignment */}
          <div className="space-y-3 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-200">
                  2. Category &amp; Subcategory
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateCategory}
                  onChange={(e) => setUpdateCategory(e.target.checked)}
                  className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
                />
                <span>Move to category</span>
              </label>
            </div>

            {rootCategories.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-950/40 border border-white/8 text-xs text-slate-400 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span>No categories available yet.</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {rootCategories.map((cat) => {
                    const isSelected = updateCategory && cat.id === selectedCatId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setUpdateCategory(true);
                          setSelectedCatId(cat.id);
                          setSelectedSubId('');
                        }}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-medium flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'accent-subtle-bg accent-border text-white font-semibold shadow-xs'
                            : updateCategory
                            ? 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                            : 'bg-slate-950/40 border-white/8 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <CategoryIcon
                            name={cat.icon}
                            categoryName={cat.name}
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'accent-text' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{cat.name}</span>
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 accent-text shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {updateCategory && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-400">
                      Subcategory (optional)
                    </p>
                    {subcategories.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 px-3 rounded-xl bg-slate-950/40 border border-white/8">
                        No subcategories in {targetCatObj?.name || 'this category'} — items will be placed in the root folder.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSubId('')}
                          className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                            selectedSubId === ''
                              ? 'accent-bg border-transparent text-white shadow-xs'
                              : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          Root Category
                        </button>
                        {subcategories.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setSelectedSubId(sub.id)}
                            className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                              selectedSubId === sub.id
                                ? 'accent-bg border-transparent text-white shadow-xs'
                                : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-400 truncate">
            {!canApply ? (
              'Choose a category move or favorite status change above'
            ) : (
              <>
                Pending:{' '}
                <span className="text-slate-200 font-medium">
                  {[
                    updateCategory && targetCatObj
                      ? `Move to ${targetCatObj.name}${
                          targetSubObj ? ` / ${targetSubObj.name}` : ''
                        }`
                      : null,
                    favoriteAction === 'favorite'
                      ? 'Pin as Favorites'
                      : favoriteAction === 'unfavorite'
                      ? 'Remove from Favorites'
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </>
            )}
          </p>

          <div className="flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !canApply}
              onClick={handleConfirm}
              className="min-h-[40px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              {isSaving
                ? 'Applying...'
                : `Apply to ${bookmarksToEdit.length} ${
                    bookmarksToEdit.length === 1 ? 'Site' : 'Sites'
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
