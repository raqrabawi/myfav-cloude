import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Check } from 'lucide-react';
import { BookmarkItem, CategoryItem } from '../types';
import { CategoryIcon } from './CategoryIcon';

interface MoveWebsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarksToMove: BookmarkItem[];
  categories: CategoryItem[];
  onConfirmMove: (
    bookmarkIds: string[],
    targetCategoryId: string,
    targetSubcategoryId: string
  ) => Promise<void>;
}

export const MoveWebsiteModal: React.FC<MoveWebsiteModalProps> = ({
  isOpen,
  onClose,
  bookmarksToMove,
  categories,
  onConfirmMove,
}) => {
  const rootCategories = categories
    .filter((c) => c.parentId === '')
    .sort((a, b) => a.order - b.order);

  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!isOpen || bookmarksToMove.length === 0) return;
    const first = bookmarksToMove[0];
    setSelectedCatId(first.categoryId || rootCategories[0]?.id || '');
    setSelectedSubId(bookmarksToMove.length === 1 ? first.subcategoryId : '');
  }, [isOpen, bookmarksToMove]);

  if (!isOpen || bookmarksToMove.length === 0) return null;

  const subcategories = categories
    .filter((c) => c.parentId === selectedCatId)
    .sort((a, b) => a.order - b.order);

  const handleConfirm = async () => {
    if (!selectedCatId) return;
    setIsMoving(true);
    try {
      await onConfirmMove(
        bookmarksToMove.map((b) => b.id),
        selectedCatId,
        selectedSubId
      );
      onClose();
    } finally {
      setIsMoving(false);
    }
  };

  const singleBookmark = bookmarksToMove.length === 1 ? bookmarksToMove[0] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="glass-elevated w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[88vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="w-10 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4 sm:hidden" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-100 truncate">
                  {singleBookmark
                    ? `Move "${singleBookmark.title}"`
                    : `Move ${bookmarksToMove.length} Websites`}
                </h2>
                <p className="text-xs text-slate-400">
                  Select destination category and optional subcategory
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-300 mb-2">
              1. Choose Target Category
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {rootCategories.map((cat) => {
                const isSelected = cat.id === selectedCatId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCatId(cat.id);
                      setSelectedSubId('');
                    }}
                    className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-left text-xs font-medium flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'accent-subtle-bg accent-border text-white font-semibold shadow-xs'
                        : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <CategoryIcon
                        name={cat.icon}
                        categoryName={cat.name}
                        className={`w-4 h-4 shrink-0 ${isSelected ? 'accent-text' : 'text-slate-400'}`}
                      />
                      <span className="truncate">{cat.name}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 accent-text shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-300 mb-2">
              2. Choose Subcategory
            </p>
            {subcategories.length === 0 ? (
              <p className="text-xs text-slate-500 py-2 px-3 rounded-xl bg-slate-950/40 border border-white/8">
                No subcategories in this category — item will be placed in the root category.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubId('')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                    selectedSubId === ''
                      ? 'accent-bg border-transparent text-white shadow-xs'
                      : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  Root Category (No Subcategory)
                </button>
                {subcategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSelectedSubId(sub.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                      selectedSubId === sub.id
                        ? 'accent-bg border-transparent text-white shadow-xs'
                        : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isMoving || !selectedCatId}
            onClick={handleConfirm}
            className="min-h-[44px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {isMoving ? 'Moving...' : 'Confirm Move'}
          </button>
        </div>
      </div>
    </div>
  );
};
