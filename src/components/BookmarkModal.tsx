import React, { useState, useEffect } from 'react';
import { X, Star, Globe, Plus, Check } from 'lucide-react';
import { BookmarkItem, CategoryItem } from '../types';
import { CategoryIcon } from './CategoryIcon';

interface BookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    title: string;
    url: string;
    description: string;
    categoryId: string;
    subcategoryId: string;
    isFavorite: boolean;
  }) => Promise<void>;
  onQuickCreateCategory: (name: string, parentId: string) => Promise<string | null>;
  categories: CategoryItem[];
  initialBookmark?: BookmarkItem | null;
  defaultCategoryId?: string;
  defaultSubcategoryId?: string;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onQuickCreateCategory,
  categories,
  initialBookmark,
  defaultCategoryId,
  defaultSubcategoryId,
}) => {
  const rootCategories = categories
    .filter((c) => c.parentId === '')
    .sort((a, b) => a.order - b.order);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);

  const [showNewRootInput, setShowNewRootInput] = useState(false);
  const [newRootName, setNewRootName] = useState('');

  const [showNewSubInput, setShowNewSubInput] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setShowNewRootInput(rootCategories.length === 0);
    setNewRootName('');
    setShowNewSubInput(false);
    setNewSubName('');

    if (initialBookmark) {
      setTitle(initialBookmark.title);
      setUrl(initialBookmark.url);
      setDescription(initialBookmark.description);
      setCategoryId(initialBookmark.categoryId);
      setSubcategoryId(initialBookmark.subcategoryId);
      setIsFavorite(initialBookmark.isFavorite);
    } else {
      const initialCat =
        defaultCategoryId && rootCategories.some((c) => c.id === defaultCategoryId)
          ? defaultCategoryId
          : rootCategories[0]?.id || '';
      setTitle('');
      setUrl('');
      setDescription('');
      setCategoryId(initialCat);
      setSubcategoryId(defaultSubcategoryId || '');
      setIsFavorite(false);
    }
  }, [isOpen, initialBookmark, defaultCategoryId, defaultSubcategoryId, rootCategories.length]);

  if (!isOpen) return null;

  const subcategoriesForSelected = categories
    .filter((c) => c.parentId === categoryId)
    .sort((a, b) => a.order - b.order);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    setSubcategoryId('');
    setShowNewSubInput(false);
  };

  const handleCreateQuickRoot = async () => {
    const trimmed = newRootName.trim();
    if (!trimmed) return;
    const createdId = await onQuickCreateCategory(trimmed, '');
    if (createdId) {
      setCategoryId(createdId);
      setSubcategoryId('');
      setNewRootName('');
      setShowNewRootInput(false);
    }
  };

  const handleCreateQuickSub = async () => {
    const trimmed = newSubName.trim();
    if (!trimmed || !categoryId) return;
    const createdId = await onQuickCreateCategory(trimmed, categoryId);
    if (createdId) {
      setSubcategoryId(createdId);
      setNewSubName('');
      setShowNewSubInput(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanTitle = title.trim();
    let cleanUrl = url.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const cleanDesc = description.trim();

    if (!cleanTitle || cleanTitle.length > 120) {
      setError('Please enter a website title between 1 and 120 characters.');
      return;
    }
    if (
      !cleanUrl ||
      cleanUrl.length < 4 ||
      cleanUrl.length > 500 ||
      !/^https?:\/\/.+$/.test(cleanUrl)
    ) {
      setError('Please enter a valid website URL (starting with https:// or http://).');
      return;
    }
    if (cleanDesc.length > 400) {
      setError('Description must be 400 characters or fewer.');
      return;
    }

    let finalCategoryId = categoryId;
    if (!finalCategoryId && newRootName.trim()) {
      const createdId = await onQuickCreateCategory(newRootName.trim(), '');
      if (createdId) finalCategoryId = createdId;
    }

    if (!finalCategoryId) {
      setError('Please select or create a category for this website.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: initialBookmark?.id,
        title: cleanTitle,
        url: cleanUrl,
        description: cleanDesc,
        categoryId: finalCategoryId,
        subcategoryId,
        isFavorite,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save website.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="w-10 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4 sm:hidden" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {initialBookmark?.id ? 'Edit Saved Website' : 'Save Website to Vault'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign a category, optional subcategory, and notes for instant retrieval.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body + Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Website URL
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://lucide.dev"
                  maxLength={500}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Website Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Lucide Open-Source Icons"
                  maxLength={120}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsFavorite((prev) => !prev)}
                className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  isFavorite
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                    : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                />
                <span>{isFavorite ? 'Pinned' : 'Pin'}</span>
              </button>
            </div>

            {/* Category Selection Grid + Quick Create */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-300">
                  Primary Category
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewRootInput((prev) => !prev)}
                  className="text-xs accent-text hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Category</span>
                </button>
              </div>

              {showNewRootInput && (
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    type="text"
                    value={newRootName}
                    onChange={(e) => setNewRootName(e.target.value)}
                    placeholder="Category name (e.g. Icons, AI Design)"
                    maxLength={80}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950/80 border border-white/15 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleCreateQuickRoot}
                    className="px-3 py-2 rounded-xl accent-bg text-white text-xs font-medium flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              )}

              {rootCategories.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                  {rootCategories.map((cat) => {
                    const selected = cat.id === categoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-medium flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          selected
                            ? 'accent-subtle-bg accent-border text-white font-semibold shadow-xs'
                            : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <CategoryIcon
                            name={cat.icon}
                            categoryName={cat.name}
                            className={`w-4 h-4 shrink-0 ${
                              selected ? 'accent-text' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{cat.name}</span>
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 accent-text shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Subcategory Selection + Quick Create */}
            {categoryId && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Subcategory (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewSubInput((prev) => !prev)}
                    className="text-xs accent-text hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Subcategory</span>
                  </button>
                </div>

                {showNewSubInput && (
                  <div className="flex items-center gap-2 mb-2.5">
                    <input
                      type="text"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Subcategory name (e.g. Vector Packs)"
                      maxLength={80}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950/80 border border-white/15 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    <button
                      type="button"
                      onClick={handleCreateQuickSub}
                      className="px-3 py-2 rounded-xl accent-bg text-white text-xs font-medium flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSubcategoryId('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      subcategoryId === ''
                        ? 'accent-bg border-transparent text-white shadow-xs'
                        : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    General (Root)
                  </button>
                  {subcategoriesForSelected.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSubcategoryId(sub.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        subcategoryId === sub.id
                          ? 'accent-bg border-transparent text-white shadow-xs'
                          : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Curator Notes / Description
                </label>
                <span className="text-[11px] font-mono-tabular text-slate-500">
                  {description.length}/400
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="What makes this website worth saving?"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors resize-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving...'
                : initialBookmark?.id
                ? 'Save Changes'
                : 'Save Website'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
