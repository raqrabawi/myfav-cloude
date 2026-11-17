import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  Search,
  Globe,
  Sparkles,
  Image as ImageIcon,
  Trash2,
  Bookmark,
} from 'lucide-react';
import {
  BookmarkItem,
  CATEGORY_ICONS,
  QuickShortcutIconType,
  QuickShortcutItem,
} from '../types';
import { CategoryIcon, QuickShortcutIcon, WebsiteFavicon } from './CategoryIcon';

interface QuickShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    title: string;
    url: string;
    iconType: QuickShortcutIconType;
    customIcon: string;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialShortcut?: QuickShortcutItem | null;
  bookmarks: BookmarkItem[];
}

export const QuickShortcutModal: React.FC<QuickShortcutModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialShortcut,
  bookmarks,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [iconType, setIconType] = useState<QuickShortcutIconType>('favicon');
  const [selectedLucideIcon, setSelectedLucideIcon] = useState<string>('sparkles');
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [showSavedPicker, setShowSavedPicker] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setBookmarkSearch('');

    if (initialShortcut) {
      setTitle(initialShortcut.title);
      setUrl(initialShortcut.url);
      setIconType(initialShortcut.iconType);
      if (initialShortcut.iconType === 'lucide') {
        setSelectedLucideIcon(initialShortcut.customIcon || 'sparkles');
        setCustomImageUrl('');
      } else if (initialShortcut.iconType === 'custom') {
        setCustomImageUrl(initialShortcut.customIcon || '');
        setSelectedLucideIcon('sparkles');
      } else {
        setSelectedLucideIcon('sparkles');
        setCustomImageUrl('');
      }
      setShowSavedPicker(false);
    } else {
      setTitle('');
      setUrl('');
      setIconType('favicon');
      setSelectedLucideIcon('sparkles');
      setCustomImageUrl('');
      setShowSavedPicker(bookmarks.length > 0);
    }
  }, [isOpen, initialShortcut, bookmarks.length]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarkSearch.trim().toLowerCase();
    if (!q) return bookmarks.slice(0, 24);
    return bookmarks
      .filter(
        (b) =>
          b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
      )
      .slice(0, 24);
  }, [bookmarks, bookmarkSearch]);

  if (!isOpen) return null;

  const resolvedCustomIcon =
    iconType === 'lucide'
      ? selectedLucideIcon
      : iconType === 'custom'
      ? customImageUrl.trim()
      : '';

  const previewUrl = url.trim()
    ? /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`
    : 'https://example.com';

  const handleSelectSavedBookmark = (bm: BookmarkItem) => {
    setTitle(bm.title.slice(0, 80));
    setUrl(bm.url);
    setShowSavedPicker(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanTitle = title.trim().slice(0, 80);
    let cleanUrl = url.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    if (!cleanTitle) {
      setError('Please enter a name for the shortcut.');
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

    let finalCustomIcon = '';
    if (iconType === 'lucide') {
      finalCustomIcon = selectedLucideIcon || 'sparkles';
    } else if (iconType === 'custom') {
      let cleanIconUrl = customImageUrl.trim();
      if (cleanIconUrl && !/^https?:\/\//i.test(cleanIconUrl)) {
        cleanIconUrl = `https://${cleanIconUrl}`;
      }
      if (
        !cleanIconUrl ||
        cleanIconUrl.length < 4 ||
        cleanIconUrl.length > 500 ||
        !/^https?:\/\/.+$/.test(cleanIconUrl)
      ) {
        setError('Please enter a valid HTTPS/HTTP image URL for the custom icon.');
        return;
      }
      finalCustomIcon = cleanIconUrl;
    }

    setSaving(true);
    try {
      await onSave({
        id: initialShortcut?.id,
        title: cleanTitle,
        url: cleanUrl,
        iconType,
        customIcon: finalCustomIcon,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shortcut.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialShortcut || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(initialShortcut.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                {initialShortcut ? 'Edit Quick Access Shortcut' : 'Add Quick Access Shortcut'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose a custom site or pick from your saved websites, and customize its icon.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Quick Pick from Saved Websites */}
          {bookmarks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 accent-text" />
                  <span>Choose from Saved Websites</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSavedPicker((prev) => !prev)}
                  className="text-xs accent-text hover:underline cursor-pointer font-medium"
                >
                  {showSavedPicker ? 'Hide list' : `Browse (${bookmarks.length})`}
                </button>
              </div>

              {showSavedPicker && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={bookmarkSearch}
                      onChange={(e) => setBookmarkSearch(e.target.value)}
                      placeholder="Filter saved websites..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {filteredBookmarks.length === 0 ? (
                      <p className="text-[11px] text-slate-500 text-center py-2">
                        No matching saved websites.
                      </p>
                    ) : (
                      filteredBookmarks.map((bm) => {
                        const isPicked = url.trim() === bm.url.trim();
                        return (
                          <button
                            key={bm.id}
                            type="button"
                            onClick={() => handleSelectSavedBookmark(bm)}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-colors cursor-pointer border ${
                              isPicked
                                ? 'accent-subtle-bg accent-border text-white'
                                : 'bg-slate-900/50 border-transparent hover:bg-white/5 text-slate-300'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0 flex-1">
                              <WebsiteFavicon url={bm.url} title={bm.title} compact />
                              <span className="text-xs font-medium truncate">{bm.title}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 truncate max-w-[140px]">
                              {bm.url.replace(/^https?:\/\/(www\.)?/, '')}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Live Top-Bar Shortcut Tile Preview */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-white/8 flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-slate-400">
                Shortcut Preview:
              </span>
              <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl glass-surface border border-white/10 max-w-[220px]">
                <QuickShortcutIcon
                  url={previewUrl}
                  title={title || 'Website'}
                  iconType={iconType}
                  customIcon={resolvedCustomIcon}
                  size="sm"
                />
                <span className="text-xs font-semibold text-slate-100 truncate">
                  {title.trim() || 'Website Name'}
                </span>
              </div>
            </div>

            {/* Website Name & URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Website Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Figma, GitHub, YouTube"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Website URL
                </label>
                <input
                  type="text"
                  required
                  maxLength={500}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://figma.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs sm:text-sm text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
            </div>

            {/* Customize Icon Section */}
            <div className="space-y-2.5 pt-1">
              <label className="block text-xs font-medium text-slate-300">
                Shortcut Icon Style
              </label>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'favicon',
                      label: 'Website Icon',
                      icon: Globe,
                    },
                    {
                      id: 'lucide',
                      label: 'Choose Icon',
                      icon: Sparkles,
                    },
                    {
                      id: 'custom',
                      label: 'Custom Image',
                      icon: ImageIcon,
                    },
                  ] as const
                ).map((tab) => {
                  const IconComp = tab.icon;
                  const active = iconType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setIconType(tab.id)}
                      className={`min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'accent-subtle-bg accent-border text-white font-semibold'
                          : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5 accent-text shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Icon Picker Grid when 'lucide' is active */}
              {iconType === 'lucide' && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 space-y-2">
                  <span className="text-[11px] text-slate-400 block">
                    Select an icon for this shortcut:
                  </span>
                  <div className="grid grid-cols-8 gap-1.5">
                    {CATEGORY_ICONS.map((iconName) => {
                      const active = selectedLucideIcon === iconName;
                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => setSelectedLucideIcon(iconName)}
                          title={iconName}
                          className={`h-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                            active
                              ? 'accent-bg border-transparent text-white scale-105 shadow-xs'
                              : 'bg-slate-900/70 border-white/8 text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <CategoryIcon name={iconName} className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Image URL Input when 'custom' is active */}
              {iconType === 'custom' && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 space-y-1.5">
                  <label className="block text-[11px] text-slate-300">
                    Custom Icon Image URL (PNG, SVG, WebP, or ICO)
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    value={customImageUrl}
                    onChange={(e) => setCustomImageUrl(e.target.value)}
                    placeholder="https://example.com/icon.png"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-white/10 text-xs text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-3 flex items-center justify-between gap-2.5 border-t border-white/10">
              {initialShortcut && onDelete ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDelete}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-medium text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[42px] px-5 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {saving
                      ? 'Saving...'
                      : initialShortcut
                      ? 'Save Changes'
                      : 'Add Shortcut'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
