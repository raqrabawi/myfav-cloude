import React, { useState, useRef } from 'react';
import {
  Upload,
  Chrome,
  Sparkles,
  Check,
  ArrowLeft,
  Trash2,
  ClipboardPaste,
  Layers,
  Copy,
  Zap,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';
import type { User } from '../lib/auth';
import {
  ChromeImportPlan,
  parseChromeBookmarksExactArrangement,
} from '../utils/chromeBookmarksParser';
import { ImportProgressState } from '../types';
import { CategoryIcon, WebsiteFavicon } from './CategoryIcon';
import { ImportProgressPanel } from './ImportProgressPanel';

interface ChromeSyncPageProps {
  onBackToDirectory: () => void;
  user: User | null;
  onSignInWithGoogle: () => Promise<void>;
  existingCategoryCount: number;
  existingBookmarkCount: number;
  onImportExactPlan: (
    plan: ChromeImportPlan,
    replaceAllExisting: boolean,
    onProgress?: (progress: ImportProgressState) => void
  ) => Promise<void>;
  onClearEntireWorkspace: () => Promise<void>;
}

const WIN_CHROME_PATH = `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks`;
const MAC_CHROME_PATH = `~/Library/Application Support/Google/Chrome/Default/Bookmarks`;

export const ChromeSyncPage: React.FC<ChromeSyncPageProps> = ({
  onBackToDirectory,
  user,
  onSignInWithGoogle,
  existingCategoryCount,
  existingBookmarkCount,
  onImportExactPlan,
  onClearEntireWorkspace,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [importPlan, setImportPlan] = useState<ChromeImportPlan | null>(null);
  const [replaceAllExisting, setReplaceAllExisting] = useState(true);
  const [autoSyncImmediately, setAutoSyncImmediately] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [copiedPath, setCopiedPath] = useState<'win' | 'mac' | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleCopyPath = (os: 'win' | 'mac') => {
    const text = os === 'win' ? WIN_CHROME_PATH : MAC_CHROME_PATH;
    navigator.clipboard?.writeText(text);
    setCopiedPath(os);
    setTimeout(() => {
      setCopiedPath((prev) => (prev === os ? null : prev));
    }, 2000);
  };

  const handleAnalyzeContent = async (
    content: string,
    sourceLabel?: string,
    shouldAutoCommit = false
  ) => {
    setError('');
    setStatusMessage('');
    const plan = parseChromeBookmarksExactArrangement(content);
    if (plan.bookmarks.length === 0 && plan.categories.length === 0) {
      setImportProgress(null);
      setError(
        'No bookmarks or folders were found in that file. Make sure you selected your Chrome Bookmarks file or exported HTML file.'
      );
      return;
    }

    const rootCount = plan.categories.filter((c) => c.parentTempId === '').length;
    const subCount = plan.categories.filter((c) => c.parentTempId !== '').length;

    if (shouldAutoCommit) {
      const totalUnits = Math.max(1, plan.categories.length + plan.bookmarks.length);
      setIsImporting(true);
      setImportProgress({
        phase: 'categories',
        processed: 0,
        total: totalUnits,
        addedBookmarks: 0,
        addedCategories: 0,
        skippedDuplicates: 0,
        currentTitle: 'Preparing your links...',
        sourceLabel,
      });
      try {
        await onImportExactPlan(plan, replaceAllExisting, (progress) => {
          setImportProgress({
            ...progress,
            sourceLabel,
          });
        });
        return;
      } catch (err) {
        setImportProgress(null);
        setError(
          err instanceof Error ? err.message : 'Failed to auto-sync Chrome bookmarks.'
        );
      } finally {
        setIsImporting(false);
      }
    }

    setImportProgress(null);
    setImportPlan(plan);
    setStatusMessage(
      `Found ${plan.bookmarks.length} bookmarks across ${rootCount} categories and ${subCount} subcategories${
        sourceLabel ? ` in "${sourceLabel}"` : ''
      }.`
    );
  };

  const handleFileUpload = (file: File) => {
    setError('');
    setStatusMessage('');
    if (autoSyncImmediately) {
      setImportProgress({
        phase: 'reading',
        processed: 0,
        total: 1,
        addedBookmarks: 0,
        addedCategories: 0,
        skippedDuplicates: 0,
        currentTitle: `Reading ${file.name}...`,
        sourceLabel: file.name,
      });
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target?.result === 'string' ? e.target.result : '';
      handleAnalyzeContent(text, file.name, autoSyncImmediately);
    };
    reader.onerror = () => {
      setImportProgress(null);
      setError('Could not read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importPlan) return;
    const totalUnits = Math.max(
      1,
      importPlan.categories.length + importPlan.bookmarks.length
    );
    setIsImporting(true);
    setError('');
    setImportProgress({
      phase: 'categories',
      processed: 0,
      total: totalUnits,
      addedBookmarks: 0,
      addedCategories: 0,
      skippedDuplicates: 0,
      currentTitle: 'Preparing your links...',
      sourceLabel: 'Chrome Arrangement Preview',
    });
    try {
      await onImportExactPlan(importPlan, replaceAllExisting, (progress) => {
        setImportProgress({
          ...progress,
          sourceLabel: 'Chrome Arrangement Preview',
        });
      });
      setImportPlan(null);
    } catch (err) {
      setImportProgress(null);
      setError(
        err instanceof Error ? err.message : 'Failed to import Chrome bookmarks.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearWorkspace = async () => {
    setIsClearing(true);
    setError('');
    try {
      await onClearEntireWorkspace();
      setStatusMessage(
        'Cleared all categories, subcategories, and websites from your workspace.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear workspace.');
    } finally {
      setIsClearing(false);
    }
  };

  const rootExtracted = importPlan
    ? importPlan.categories
        .filter((c) => c.parentTempId === '')
        .sort((a, b) => a.order - b.order)
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <section className="glass-surface rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={onBackToDirectory}
              className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Directory</span>
            </button>
            <span>/</span>
            <span className="accent-text">Google Chrome Auto-Sync</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Chrome className="w-6 h-6 accent-text shrink-0" />
            <span>Sync Google Chrome Bookmarks & Categories</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Sync your live Chrome Bookmarks profile or exported file with exact folder (Category), subfolder (Subcategory), and website arrangement.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {(existingCategoryCount > 0 || existingBookmarkCount > 0) && (
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearWorkspace}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {isClearing ? 'Clearing...' : 'Clear Workspace'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onBackToDirectory}
            className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>
      </section>

      {/* Google Account Status & Why Browser Sandbox Needs 1-Step File Connection */}
      <section className="glass-surface rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border accent-border">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-100">
              {user
                ? `Connected to Google Account (${user.email}) — Cloud Sync Active`
                : 'Step 1: Connect Google Account for Cross-Device Cloud Sync'}
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Because Google Chrome encrypts and sandboxes local browser bookmarks from web OAuth tokens, select your live Chrome{' '}
              <span className="font-mono-tabular text-white">Bookmarks</span> file (or exported HTML) once below — MyFav will automatically build your exact Categories, Subcategories, and Websites and keep them synced to your Google account across all devices.
            </p>
          </div>
        </div>

        {!user && (
          <button
            type="button"
            onClick={onSignInWithGoogle}
            className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Log in
          </button>
        )}
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="p-4 rounded-xl accent-subtle-bg border accent-border text-xs text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 accent-text shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Sync Methods Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Method 1: Instant Live Chrome Bookmarks Profile OR HTML File Auto-Sync */}
        <div className="lg:col-span-7 glass-surface rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Instant Chrome Auto-Sync (Live Profile or HTML)
                </h2>
                <p className="text-xs text-slate-400">
                  Supports both Chrome&apos;s live local <span className="font-mono-tabular">Bookmarks</span> file and exported <span className="font-mono-tabular">bookmarks.html</span>
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoSyncImmediately}
                onChange={(e) => setAutoSyncImmediately(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
              />
              <span>Auto-import immediately on select</span>
            </label>
          </div>

          {/* Direct Live Chrome Profile Path Shortcut (No Export Required!) */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <FolderOpen className="w-4 h-4 accent-text" />
              <span>Option A: Sync Directly from Chrome&apos;s Live Profile (No Export Needed)</span>
            </div>
            <p className="text-xs text-slate-400">
              1. Copy your OS path below · 2. Click <strong className="text-slate-200">Select Chrome Bookmarks File</strong> below · 3. Paste the path into the file dialog and press Enter:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleCopyPath('win')}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <div className="min-w-0 text-left">
                  <span className="block font-semibold">
                    Windows Chrome Path
                  </span>
                  <span className="block text-[10px] font-mono-tabular opacity-75 truncate">
                    {WIN_CHROME_PATH}
                  </span>
                </div>
                {copiedPath === 'win' ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopyPath('mac')}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <div className="min-w-0 text-left">
                  <span className="block font-semibold">
                    macOS Chrome Path
                  </span>
                  <span className="block text-[10px] font-mono-tabular opacity-75 truncate">
                    {MAC_CHROME_PATH}
                  </span>
                </div>
                {copiedPath === 'mac' ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Or Option B: Exported HTML */}
          <div className="text-xs text-slate-400 px-1">
            <strong className="text-slate-200">Option B:</strong> Or in Chrome press{' '}
            <span className="font-mono-tabular text-white">Ctrl+Shift+O</span> → click{' '}
            <span className="font-mono-tabular text-white">⋮</span> →{' '}
            <strong className="text-white">Export bookmarks</strong> and select the{' '}
            <span className="font-mono-tabular text-white">.html</span> file below:
          </div>

          {importProgress ? (
            <ImportProgressPanel
              progress={importProgress}
              onDone={() => {
                setImportProgress(null);
                onBackToDirectory();
              }}
              onReset={() => {
                setImportProgress(null);
                setImportPlan(null);
                setStatusMessage('');
                setError('');
              }}
            />
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer space-y-3 ${
                isDraggingFile
                  ? 'accent-subtle-bg accent-border'
                  : 'bg-slate-950/50 border-white/15 hover:border-[var(--accent-primary)] hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl accent-bg text-white flex items-center justify-center mx-auto shadow-lg">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {isImporting
                    ? 'Syncing Chrome Categories & Bookmarks...'
                    : 'Select Chrome Bookmarks File (or Drag & Drop Here)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Accepts live Chrome <span className="font-mono-tabular text-slate-200">Bookmarks</span> file or exported{' '}
                  <span className="font-mono-tabular text-slate-200">bookmarks.html</span> — preserves exact folder & bookmark order
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Method 2: Paste Directly from Chrome Bookmark Manager */}
        <div className="lg:col-span-5 glass-surface rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-white/8 pb-3">
            <ClipboardPaste className="w-4 h-4 accent-text shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Or Copy & Paste from Chrome Manager
              </h2>
              <p className="text-xs text-slate-400">
                Paste folders & links in the exact order you want them created
              </p>
            </div>
          </div>

          <textarea
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            rows={8}
            placeholder={
              'Icons\nLucide - https://lucide.dev\nPhosphor - https://phosphoricons.com\n\nAI Design\nMidjourney - https://midjourney.com'
            }
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] font-mono-tabular resize-none"
          />

          <button
            type="button"
            onClick={() =>
              handleAnalyzeContent(pasteInput, 'Pasted Bookmarks', autoSyncImmediately)
            }
            disabled={!pasteInput.trim() || isImporting}
            className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {autoSyncImmediately
                ? 'Sync Pasted Bookmarks Now'
                : 'Preview Arrangement'}
            </span>
          </button>
        </div>
      </div>

      {/* Exact Arrangement Preview (when Auto-Sync Immediately is unchecked) */}
      {importPlan && (
        <section className="glass-surface rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 accent-text" />
                <span>
                  Exact Chrome Arrangement Preview ({rootExtracted.length} Categories ·{' '}
                  {importPlan.bookmarks.length} Bookmarks)
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Categories, subcategories, and websites will be added in this exact order.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceAllExisting}
                  onChange={(e) => setReplaceAllExisting(e.target.checked)}
                  className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
                />
                <span>Clear existing categories & websites first</span>
              </label>

              <button
                type="button"
                disabled={isImporting}
                onClick={handleConfirmImport}
                className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isImporting
                    ? 'Applying Chrome Arrangement...'
                    : `Import ${rootExtracted.length} Categories & ${importPlan.bookmarks.length} Websites`}
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
            {rootExtracted.map((rootCat, rootIdx) => {
              const subs = importPlan.categories
                .filter((c) => c.parentTempId === rootCat.tempId)
                .sort((a, b) => a.order - b.order);
              const rootDirectBookmarks = importPlan.bookmarks.filter(
                (b) => b.categoryTempId === rootCat.tempId && !b.subcategoryTempId
              );
              const totalInRoot = importPlan.bookmarks.filter(
                (b) => b.categoryTempId === rootCat.tempId
              ).length;

              return (
                <div
                  key={rootCat.tempId}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono-tabular text-slate-500">
                        {String(rootIdx + 1).padStart(2, '0')}.
                      </span>
                      <div className="w-8 h-8 rounded-lg accent-subtle-bg flex items-center justify-center accent-text">
                        <CategoryIcon name={rootCat.icon} className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {rootCat.name}
                      </h3>
                    </div>
                    <span className="text-xs font-mono-tabular text-slate-400">
                      {totalInRoot} {totalInRoot === 1 ? 'bookmark' : 'bookmarks'}
                      {subs.length > 0 ? ` · ${subs.length} subfolders` : ''}
                    </span>
                  </div>

                  {rootDirectBookmarks.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {rootDirectBookmarks.map((bm, i) => (
                        <div
                          key={`${bm.url}_${i}`}
                          className="p-2.5 rounded-xl bg-slate-900/70 border border-white/5 flex items-center gap-2.5 min-w-0"
                        >
                          <WebsiteFavicon url={bm.url} title={bm.title} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate">
                              {bm.title}
                            </p>
                            <p className="text-[11px] font-mono-tabular text-slate-500 truncate">
                              {bm.url}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {subs.map((sub) => {
                    const subBookmarks = importPlan.bookmarks.filter(
                      (b) => b.subcategoryTempId === sub.tempId
                    );
                    return (
                      <div
                        key={sub.tempId}
                        className="pl-4 border-l border-white/10 space-y-2 pt-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold accent-text">
                            ↳ {sub.name}
                          </span>
                          <span className="font-mono-tabular text-slate-500">
                            {subBookmarks.length} sites
                          </span>
                        </div>
                        {subBookmarks.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {subBookmarks.map((bm, i) => (
                              <div
                                key={`${bm.url}_${i}`}
                                className="p-2 rounded-xl bg-slate-900/50 border border-white/5 flex items-center gap-2 min-w-0"
                              >
                                <WebsiteFavicon url={bm.url} title={bm.title} />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-200 truncate">
                                    {bm.title}
                                  </p>
                                  <p className="text-[11px] font-mono-tabular text-slate-500 truncate">
                                    {bm.url}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
