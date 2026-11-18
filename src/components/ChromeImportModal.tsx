import React, { useState, useRef } from 'react';
import {
  X,
  Chrome,
  Upload,
  Check,
  FolderOpen,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  ChromeImportPlan,
  parseChromeBookmarksExactArrangement,
} from '../utils/chromeBookmarksParser';
import { ImportProgressState } from '../types';
import { ImportProgressPanel } from './ImportProgressPanel';

interface ChromeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportExactPlan: (
    plan: ChromeImportPlan,
    replaceAllExisting: boolean,
    onProgress?: (progress: ImportProgressState) => void
  ) => Promise<void>;
  linkedChromeFileName?: string | null;
  lastChromeSyncTime?: string | null;
  onLinkLiveChromeFile?: (os?: 'win' | 'mac') => Promise<void>;
  onRefreshLiveChromeFile?: () => Promise<void>;
}

const WIN_CHROME_PATH = `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks`;
const MAC_CHROME_PATH = `~/Library/Application Support/Google/Chrome/Default/Bookmarks`;

export const ChromeImportModal: React.FC<ChromeImportModalProps> = ({
  isOpen,
  onClose,
  onImportExactPlan,
  linkedChromeFileName = null,
  lastChromeSyncTime = null,
  onLinkLiveChromeFile,
  onRefreshLiveChromeFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [syncingOs, setSyncingOs] = useState<'win' | 'mac' | null>(null);
  const [copiedPath, setCopiedPath] = useState<'win' | 'mac' | null>(null);
  const [replaceAllExisting, setReplaceAllExisting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleCloseModal = () => {
    if (isImporting) return;
    setImportProgress(null);
    setStatusMsg('');
    setErrorMsg('');
    onClose();
  };

  const handleSyncFromOs = async (os: 'win' | 'mac') => {
    const autoPath = os === 'win' ? WIN_CHROME_PATH : MAC_CHROME_PATH;
    const osLabel = os === 'win' ? 'Windows' : 'macOS';
    setSyncingOs(os);
    setCopiedPath(os);
    setErrorMsg('');
    setStatusMsg(`Syncing automatically from ${osLabel} path (${autoPath})...`);

    try {
      if (onLinkLiveChromeFile) {
        await onLinkLiveChromeFile(os);
      }
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setErrorMsg(err.message);
      }
    } finally {
      setSyncingOs(null);
    }
  };

  const handleProcessContent = async (content: string, sourceLabel?: string) => {
    setErrorMsg('');
    setStatusMsg('');
    const plan = parseChromeBookmarksExactArrangement(content);
    if (plan.bookmarks.length === 0 && plan.categories.length === 0) {
      setImportProgress(null);
      setErrorMsg(
        'No bookmarks were found in that file. Export your bookmarks as an HTML file from Chrome, Safari, Edge or Firefox (see "How do I export my bookmarks?") and select that file.'
      );
      return;
    }

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
    } catch (err) {
      setImportProgress(null);
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to import Chrome bookmarks.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleFilePicked = (file: File) => {
    setErrorMsg('');
    setStatusMsg('');
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

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target?.result === 'string' ? e.target.result : '';
      handleProcessContent(text, file.name);
    };
    reader.onerror = () => {
      setImportProgress(null);
      setErrorMsg('Could not read the selected file.');
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={handleCloseModal}
    >
      <div
        className="glass-elevated rounded-2xl w-full max-w-lg border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl accent-subtle-bg accent-text flex items-center justify-center shrink-0">
              <Chrome className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-100 truncate">
                Import Bookmarks
              </h2>
              <p className="text-xs text-slate-400 truncate">
                From Chrome, Safari, Edge or Firefox into MyFav
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isImporting}
            onClick={handleCloseModal}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-white flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Direct Live OS Sync Buttons (Automatic Path - No File Picker Needed) */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-white/12 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 accent-text" />
                  <span>1-Click Chrome Sync (Chrome only)</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Automatically uses your system&apos;s default Chrome <span className="font-mono text-slate-200">Bookmarks</span> path and starts syncing immediately.
                </p>
              </div>
            </div>

            {linkedChromeFileName && (
              <div className="p-3 rounded-xl bg-slate-900/90 border accent-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100 truncate">
                    Active Path: <span className="font-mono accent-text">{linkedChromeFileName}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {lastChromeSyncTime
                      ? `Last synced at ${lastChromeSyncTime}`
                      : 'Ready for 1-click refresh'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isRefreshingLive}
                  onClick={async () => {
                    if (!onRefreshLiveChromeFile) return;
                    setIsRefreshingLive(true);
                    setErrorMsg('');
                    try {
                      await onRefreshLiveChromeFile();
                      onClose();
                    } catch (err) {
                      setErrorMsg(
                        err instanceof Error
                          ? err.message
                          : 'Could not refresh Chrome profile.'
                      );
                    } finally {
                      setIsRefreshingLive(false);
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRefreshingLive ? 'animate-spin' : ''}`}
                  />
                  <span>{isRefreshingLive ? 'Syncing...' : 'Refresh'}</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={syncingOs !== null}
                onClick={() => handleSyncFromOs('win')}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {syncingOs === 'win' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Syncing Windows...</span>
                  </>
                ) : copiedPath === 'win' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Synced Windows!</span>
                  </>
                ) : (
                  <>
                    <Chrome className="w-4 h-4 shrink-0" />
                    <span>Sync from Windows</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={syncingOs !== null}
                onClick={() => handleSyncFromOs('mac')}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {syncingOs === 'mac' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Syncing macOS...</span>
                  </>
                ) : copiedPath === 'mac' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Synced macOS!</span>
                  </>
                ) : (
                  <>
                    <Chrome className="w-4 h-4 shrink-0" />
                    <span>Sync from macOS</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFilePicked(file);
              e.target.value = '';
            }}
            accept=".html,.htm,.json,*"
            className="hidden"
          />

          {/* File Dropzone or Live Animated Progress / Finish Card */}
          {importProgress ? (
            <ImportProgressPanel
              progress={importProgress}
              onDone={handleCloseModal}
              onReset={() => {
                setImportProgress(null);
                setStatusMsg('');
                setErrorMsg('');
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
                if (file) handleFilePicked(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                isDraggingFile
                  ? 'accent-subtle-bg accent-border scale-101'
                  : 'bg-slate-950/60 border-white/15 hover:border-[var(--accent-primary)] hover:bg-slate-950/80'
              }`}
            >
              <div className="w-11 h-11 rounded-2xl accent-subtle-bg flex items-center justify-center accent-text">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {isImporting
                    ? 'Importing your bookmarks...'
                    : 'Drop or select your exported bookmarks file'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Works with files exported from Chrome, Safari, Edge and Firefox (<span className="font-mono text-slate-200">.html</span>), or Chrome&apos;s <span className="font-mono text-slate-200">Bookmarks</span> file
                </p>
              </div>
            </div>
          )}

          {/* How to export bookmarks from each browser */}
          <details className="group rounded-xl bg-slate-950/60 border border-white/10 px-4 py-3 text-xs text-slate-300">
            <summary className="cursor-pointer select-none font-semibold text-slate-100 list-none flex items-center justify-between gap-2">
              <span>How do I export my bookmarks?</span>
              <span className="text-slate-400 group-open:rotate-180 transition-transform" aria-hidden>
                ▾
              </span>
            </summary>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>
                <strong className="text-slate-100">Safari (Mac):</strong> File → Export → Bookmarks…
                Your Favorites and folders come in as categories; the Reading List is skipped.
              </li>
              <li>
                <strong className="text-slate-100">iPhone / iPad:</strong> Safari can&apos;t export there. Turn on
                Safari in iCloud settings, then export from a Mac signed in to the same Apple ID, or add
                websites one by one with Add Website.
              </li>
              <li>
                <strong className="text-slate-100">Chrome:</strong> menu ⋮ → Bookmarks and lists → Bookmark
                manager → ⋮ → Export bookmarks. Or use 1-Click Chrome Sync above.
              </li>
              <li>
                <strong className="text-slate-100">Edge:</strong> menu ⋯ → Favorites → ⋯ → Export favorites.
              </li>
              <li>
                <strong className="text-slate-100">Firefox:</strong> Bookmarks → Manage bookmarks → Import and
                Backup → Export Bookmarks to HTML…
              </li>
            </ul>
          </details>

          {/* Merge vs Replace Option */}
          <div className="flex items-center justify-between gap-3 pt-1 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceAllExisting}
                onChange={(e) => setReplaceAllExisting(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
              />
              <span>Replace all existing bookmarks (uncheck to smartly merge new ones)</span>
            </label>
          </div>

          {/* Optional Paste Box */}
          <div className="pt-2 border-t border-white/8">
            <button
              type="button"
              onClick={() => setShowPasteBox((prev) => !prev)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {showPasteBox
                  ? 'Hide manual paste'
                  : 'Or paste bookmarks HTML / JSON / URLs manually'}
              </span>
            </button>

            {showPasteBox && (
              <div className="mt-2.5 space-y-2">
                <textarea
                  rows={3}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste Chrome JSON, HTML, or URLs here..."
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  disabled={!pasteContent.trim() || isImporting}
                  onClick={() => handleProcessContent(pasteContent, 'Pasted Content')}
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Merge Pasted Bookmarks
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
