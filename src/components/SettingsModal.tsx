import React, { useState, useRef } from 'react';
import {
  Palette,
  Sparkles,
  Cloud,
  LogOut,
  RotateCcw,
  Check,
  ArrowLeft,
  LayoutGrid,
  Chrome,
  Upload,
  Copy,
  Trash2,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sun,
  Moon,
  RefreshCw,
  Download,
  BookmarkPlus,
  Link2,
  Unlink,
  Zap,
  FileSpreadsheet,
  FileCode2,
  Braces,
  HardDriveDownload,
} from 'lucide-react';
import type { User } from '../lib/auth';
import {
  BookmarkItem,
  CardDensity,
  CategoryItem,
  GlassIntensity,
  ImportProgressState,
  QuickShortcutItem,
  THEME_PRESETS,
  ThemeMode,
  UserSettings,
} from '../types';
import { resolveThemeColors } from '../utils/theme';
import {
  ChromeImportPlan,
  parseChromeBookmarksExactArrangement,
} from '../utils/chromeBookmarksParser';
import {
  downloadCompanionExtensionZip,
  generateBookmarkletHref,
  isFileSystemAccessSupported,
} from '../utils/chromeLiveSync';
import { BackupFormat, triggerBackupDownload } from '../utils/backupExport';
import { trackEvent } from '../utils/analytics';
import { InstallAppSection } from './InstallAppSection';
import { ImportProgressPanel } from './ImportProgressPanel';

interface SettingsPageProps {
  onBackToDirectory: () => void;
  settings: UserSettings;
  onUpdateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  user: User | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onResetDefaults: () => Promise<void>;
  existingCategoryCount: number;
  existingBookmarkCount: number;
  categories: CategoryItem[];
  bookmarks: BookmarkItem[];
  quickShortcuts?: QuickShortcutItem[];
  onImportExactPlan: (
    plan: ChromeImportPlan,
    replaceAllExisting: boolean,
    onProgress?: (progress: ImportProgressState) => void
  ) => Promise<void>;
  onClearEntireWorkspace: () => Promise<void>;
  defaultTab?: 'appearance' | 'sync' | 'account';
  linkedChromeFileName?: string | null;
  lastChromeSyncTime?: string | null;
  autoWatchChromeFile?: boolean;
  onToggleAutoWatchChromeFile?: (enabled: boolean) => void;
  onLinkLiveChromeFile?: (os?: 'win' | 'mac') => Promise<void>;
  onRefreshLiveChromeFile?: () => Promise<void>;
  onUnlinkLiveChromeFile?: () => Promise<void>;
  onOpenImportModal?: () => void;
}

const WIN_CHROME_PATH = `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks`;
const MAC_CHROME_PATH = `~/Library/Application Support/Google/Chrome/Default/Bookmarks`;

export const SettingsModal: React.FC<SettingsPageProps> = ({
  onBackToDirectory,
  settings,
  onUpdateSettings,
  user,
  onSignIn,
  onSignOut,
  onResetDefaults,
  existingCategoryCount,
  existingBookmarkCount,
  categories,
  bookmarks,
  quickShortcuts = [],
  onImportExactPlan,
  onClearEntireWorkspace,
  defaultTab = 'appearance',
  linkedChromeFileName = null,
  lastChromeSyncTime = null,
  autoWatchChromeFile = false,
  onToggleAutoWatchChromeFile,
  onLinkLiveChromeFile,
  onRefreshLiveChromeFile,
  onUnlinkLiveChromeFile,
  onOpenImportModal,
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'sync' | 'account'>(defaultTab);
  const resolvedTheme = resolveThemeColors(settings.primaryColor);

  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Chrome Sync Local State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [copiedPath, setCopiedPath] = useState<'win' | 'mac' | null>(null);
  const [replaceAllExisting, setReplaceAllExisting] = useState(false);
  const [autoSyncImmediately, setAutoSyncImmediately] = useState(true);
  const [importPlan, setImportPlan] = useState<ChromeImportPlan | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [syncError, setSyncError] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{
    format: BackupFormat;
    filename: string;
    count: number;
  } | null>(null);

  const hasExportableData = bookmarks.length > 0 || categories.length > 0;

  const handleExportBackup = (format: BackupFormat) => {
    const result = triggerBackupDownload(format, {
      categories,
      bookmarks,
      quickShortcuts,
      settings,
    });
    setBackupNotice({
      format,
      filename: result.filename,
      count: bookmarks.length,
    });
    trackEvent('backup_export', {
      format,
      bookmark_count: bookmarks.length,
      category_count: categories.length,
    });
  };

  // V2: include the deploy base path ("/" on root hosts, "/myfav-cloude/" on GitHub Pages).
  const appOrigin =
    typeof window !== 'undefined' ? `${window.location.origin}${import.meta.env.BASE_URL}` : '';
  const bookmarkletHref = generateBookmarkletHref(appOrigin);

  React.useEffect(() => {
    if (bookmarkletRef.current && bookmarkletHref) {
      bookmarkletRef.current.setAttribute('href', bookmarkletHref);
    }
  }, [bookmarkletHref, activeTab]);

  const [syncingOs, setSyncingOs] = useState<'win' | 'mac' | null>(null);

  const handleSyncFromOs = async (os: 'win' | 'mac') => {
    const autoPath = os === 'win' ? WIN_CHROME_PATH : MAC_CHROME_PATH;
    const osLabel = os === 'win' ? 'Windows' : 'macOS';
    setSyncingOs(os);
    setCopiedPath(os);
    setSyncError('');
    setSyncStatus(`Syncing automatically from ${osLabel} path (${autoPath})...`);

    try {
      if (onLinkLiveChromeFile) {
        await onLinkLiveChromeFile(os);
      }
      setSyncStatus(
        `Synced with ${osLabel} Chrome (${autoPath})! Auto-watch is active.`
      );
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSyncError(err.message);
      }
    } finally {
      setSyncingOs(null);
      setTimeout(() => {
        setCopiedPath((prev) => (prev === os ? null : prev));
      }, 2500);
    }
  };

  const handleProcessContent = async (
    content: string,
    sourceLabel?: string
  ) => {
    setSyncError('');
    setSyncStatus('');
    const plan = parseChromeBookmarksExactArrangement(content);
    if (plan.bookmarks.length === 0 && plan.categories.length === 0) {
      setImportProgress(null);
      setSyncError(
        'No bookmarks or folders were found. Please select your Chrome "Bookmarks" file or an exported bookmarks HTML file.'
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
      setSyncError(
        err instanceof Error ? err.message : 'Failed to import Chrome bookmarks.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleFilePicked = (file: File) => {
    setSyncError('');
    setSyncStatus('');
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
      setSyncError('Could not read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      await onClearEntireWorkspace();
      setShowConfirmClear(false);
      setSyncStatus('Workspace data has been cleared.');
    } catch {
      // ignore
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="w-full space-y-5 pb-12">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBackToDirectory}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Websites</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">Settings</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Manage your workspace theme, Chrome bookmarks sync, backups, and Google account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onOpenImportModal) {
              onOpenImportModal();
            } else {
              setActiveTab('sync');
            }
          }}
          className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-[38px] px-4 py-2 rounded-xl accent-bg text-white text-sm sm:text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer sm:shrink-0 shadow-lg shadow-black/20"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>
      </div>

      {/* Clean Segmented Tab Switcher */}
      <div className="p-1 rounded-xl bg-slate-950/80 border border-white/10 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`min-h-[40px] sm:min-h-[38px] px-1.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'appearance'
              ? 'accent-bg text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Palette className="hidden sm:block w-3.5 h-3.5" />
          <span>Appearance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`min-h-[40px] sm:min-h-[38px] px-1.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'sync'
              ? 'accent-bg text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Chrome className="hidden sm:block w-3.5 h-3.5" />
          <span>Import &amp; Sync</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`min-h-[40px] sm:min-h-[38px] px-1.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'account'
              ? 'accent-bg text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Cloud className="hidden sm:block w-3.5 h-3.5" />
          <span>Account & Data</span>
        </button>
      </div>

      {/* TAB 1: APPEARANCE */}
      {activeTab === 'appearance' && (
        <div className="space-y-5">
          {/* Theme Mode: Dark Mode vs Light Mode */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-100">Theme Mode</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Switch between dark obsidian glass and crisp frosted light mode.
                </p>
              </div>
              <span className="text-xs font-mono-tabular accent-text uppercase px-2.5 py-1 rounded-md bg-white/5 border border-white/5 shrink-0">
                {(settings.themeMode || 'dark') === 'light' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {(
                [
                  {
                    id: 'dark',
                    label: 'Dark Mode',
                    desc: 'Deep obsidian glass',
                    icon: Moon,
                  },
                  {
                    id: 'light',
                    label: 'Light Mode',
                    desc: 'Crisp frosted daylight',
                    icon: Sun,
                  },
                ] as { id: ThemeMode; label: string; desc: string; icon: typeof Moon }[]
              ).map((mode) => {
                const isSelected = (settings.themeMode || 'dark') === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ themeMode: mode.id })}
                    className={`min-h-[60px] p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'accent-subtle-bg accent-border text-white shadow-sm'
                        : 'bg-slate-950/60 border-white/8 text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'accent-bg text-white'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                          {mode.label}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{mode.desc}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 accent-text shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Theme Accent Color */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-100">Primary Theme Color</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select your primary accent color for active items, buttons, and glowing accents.
                </p>
              </div>
              <span className="text-xs font-mono-tabular accent-text uppercase px-2.5 py-1 rounded-md bg-white/5 border border-white/5 shrink-0">
                {resolvedTheme.name}
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {THEME_PRESETS.map((preset) => {
                const isSelected =
                  settings.primaryColor.toLowerCase() === preset.id ||
                  settings.primaryColor.toLowerCase() === preset.primary.toLowerCase();

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onUpdateSettings({ primaryColor: preset.id })}
                    className={`min-h-[46px] px-2.5 sm:px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'accent-subtle-bg accent-border text-white'
                        : 'bg-slate-950/60 border-white/8 text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <span
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span className="text-xs font-medium truncate">{preset.name}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 accent-text shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Hex Picker */}
            <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Custom hex color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={resolvedTheme.primary}
                  onChange={(e) => onUpdateSettings({ primaryColor: e.target.value })}
                  aria-label="Pick custom primary color"
                  className="w-8 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                />
                <span className="text-xs font-mono-tabular text-slate-200 uppercase px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10">
                  {resolvedTheme.primary}
                </span>
              </div>
            </div>
          </section>

          {/* Interface & Layout */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-5">
            <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 accent-text" />
              <span>Interface & Glass Depth</span>
            </h2>

            {/* Glass Intensity */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300">Glass Translucency</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'subtle', label: 'Subtle', desc: '10px blur' },
                    { id: 'balanced', label: 'Balanced', desc: '16px blur' },
                    { id: 'frosted', label: 'Frosted', desc: '24px blur' },
                  ] as { id: GlassIntensity; label: string; desc: string }[]
                ).map((opt) => {
                  const active = settings.glassIntensity === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateSettings({ glassIntensity: opt.id })}
                      className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                        active
                          ? 'accent-subtle-bg accent-border text-white'
                          : 'bg-slate-950/60 border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <p className="text-xs font-semibold">{opt.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List Row Density */}
            <div className="space-y-2.5 pt-2 border-t border-white/8">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                  <span>List Density</span>
                </span>
                <span className="text-[11px] accent-text font-medium">
                  {settings.cardDensity === 'compact'
                    ? 'Single-line compact rows'
                    : 'Spacious two-line cards'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'comfortable', label: 'Comfortable', desc: 'Spacious 2-line cards' },
                    { id: 'compact', label: 'Compact', desc: 'Single-line dense rows' },
                  ] as { id: CardDensity; label: string; desc: string }[]
                ).map((opt) => {
                  const active = settings.cardDensity === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          glassIntensity: settings.glassIntensity,
                          cardDensity: opt.id,
                        })
                      }
                      className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                        active
                          ? 'accent-subtle-bg accent-border text-white'
                          : 'bg-slate-950/60 border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <p className="text-xs font-semibold">{opt.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Live Density Preview Box */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-white/8 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-0.5">
                  <span>Live Row Preview</span>
                  <span>{settings.cardDensity === 'compact' ? 'Compact Mode' : 'Comfortable Mode'}</span>
                </div>

                {settings.cardDensity === 'compact' ? (
                  <div className="glass-surface rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 transition-all duration-200">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-6.5 h-6.5 rounded-md accent-subtle-bg border accent-border flex items-center justify-center text-[10px] font-bold accent-text shrink-0">
                        M
                      </div>
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        MyFav Web Vault
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-light)] font-mono text-[10px] truncate">
                        https://myfav.app
                      </span>
                      <span className="hidden sm:inline text-[10px] text-slate-400 truncate">
                        • UI
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md accent-subtle-bg accent-text text-[10px] font-semibold shrink-0">
                      Visit
                    </span>
                  </div>
                ) : (
                  <div className="glass-surface rounded-xl p-3 flex items-center justify-between gap-3 transition-all duration-200">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl accent-subtle-bg border accent-border flex items-center justify-center text-sm font-bold accent-text shrink-0">
                        M
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          MyFav Web Vault
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-light)] font-mono text-[11px] font-semibold truncate">
                            https://myfav.app
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">
                            • UI
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg accent-subtle-bg accent-text text-xs font-semibold shrink-0">
                      Visit
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: CHROME SYNC */}
      {activeTab === 'sync' && (
        <div id="chrome-sync-settings-section" className="space-y-5">
          {syncError && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{syncError}</span>
            </div>
          )}

          {syncStatus && (
            <div className="p-4 rounded-xl accent-subtle-bg border accent-border text-xs text-white flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
              <span>{syncStatus}</span>
            </div>
          )}

          {/* METHOD 1: FILE UPLOAD OR PASTE (PRIMARY) */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4 border accent-border">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md accent-subtle-bg accent-text text-[11px] font-semibold">
                <Upload className="w-3 h-3" />
                <span>Method 1 · File Upload or Paste</span>
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
                <Upload className="w-4 h-4 accent-text" />
                <span>Upload a Bookmarks File (Chrome, Safari, Edge, Firefox) or Paste</span>
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drop a <span className="font-mono text-slate-300">bookmarks.html</span> exported from Chrome, Safari, Edge or Firefox, or Chrome&apos;s <span className="font-mono text-slate-300">Bookmarks</span> JSON file, here anytime. Safari: File → Export → Bookmarks…; Edge: Favorites → Export favorites; Firefox: Manage bookmarks → Export Bookmarks to HTML. By default, MyFav merges only new websites without duplicating existing ones.
              </p>
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

            {/* Dropzone or Animated Import Progress & Finish Interaction */}
            {importProgress ? (
              <ImportProgressPanel
                progress={importProgress}
                onDone={() => {
                  setImportProgress(null);
                  onBackToDirectory();
                }}
                onReset={() => {
                  setImportProgress(null);
                  setSyncStatus('');
                  setSyncError('');
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
                className={`p-5 sm:p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                  isDraggingFile
                    ? 'accent-subtle-bg accent-border scale-101'
                    : 'bg-slate-950/60 border-white/10 hover:border-white/25 hover:bg-slate-950/80'
                }`}
              >
                <div className="w-10 h-10 rounded-full accent-subtle-bg flex items-center justify-center accent-text">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-100">
                    Click to browse or drop your bookmarks file here
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Smart merge adds only new folders &amp; websites unless &ldquo;Replace existing&rdquo; is checked below
                  </p>
                </div>
              </div>
            )}

            {/* Import Options */}
            <div className="pt-1 flex items-center justify-between gap-3 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceAllExisting}
                  onChange={(e) => setReplaceAllExisting(e.target.checked)}
                  className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
                />
                <span>Replace existing bookmarks (leave unchecked to automatically add new links)</span>
              </label>
            </div>

            {/* Manual Paste Alternative */}
            <div className="pt-2 border-t border-white/8">
              <button
                type="button"
                onClick={() => setShowPasteBox((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 accent-text" />
                <span>{showPasteBox ? 'Hide manual paste' : 'Or paste bookmarks content manually'}</span>
              </button>

              {showPasteBox && (
                <div className="mt-3 space-y-2.5">
                  <textarea
                    rows={4}
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Paste Chrome JSON or HTML bookmarks code here..."
                    className="w-full p-3 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button
                    type="button"
                    disabled={!pasteContent.trim() || isImporting}
                    onClick={() => handleProcessContent(pasteContent, 'Manual Paste')}
                    className="chrome-sync-btn w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {isImporting ? 'Importing...' : 'Auto-Import Pasted Content'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* METHOD 2 & 3: COMPANION EXTENSION + 1-CLICK BOOKMARKLET */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Method 2: Chrome Companion Extension */}
            <section className="glass-surface rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 text-slate-300 text-[11px] font-semibold">
                  <Chrome className="w-3 h-3 accent-text" />
                  <span>Method 2 · Real-Time Background Sync</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Chrome Companion Extension
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Download our lightweight Chrome Extension pre-configured for your workspace. It listens to <span className="font-mono text-slate-300">chrome.bookmarks</span> and pushes every new or edited bookmark directly to MyFav automatically.
                </p>
                <ol className="text-[11px] text-slate-400 space-y-1 pl-4 list-decimal">
                  <li>Download and unzip the extension folder</li>
                  <li>Open <span className="font-mono text-slate-200">chrome://extensions</span> &amp; enable <strong>Developer mode</strong></li>
                  <li>Click <strong>Load unpacked</strong> and select the folder</li>
                </ol>
              </div>

              <button
                type="button"
                onClick={() => {
                  downloadCompanionExtensionZip(appOrigin);
                  setSyncStatus(
                    'Downloaded "myfav-chrome-sync-extension.zip"! Unzip it and load it in chrome://extensions for automatic real-time sync.'
                  );
                }}
                className="chrome-sync-btn w-full min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Chrome Extension (.zip)</span>
              </button>
            </section>

            {/* Method 3: 1-Click Chrome Bookmarklet */}
            <section className="glass-surface rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 text-slate-300 text-[11px] font-semibold">
                  <BookmarkPlus className="w-3 h-3 accent-text" />
                  <span>Method 3 · Save Active Tab in 1 Click</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-100">
                  &ldquo;+ Save to MyFav&rdquo; Bookmarklet
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Drag the button below onto your Chrome Bookmarks Bar (<span className="font-mono text-slate-300">Ctrl+Shift+B</span>). Whenever you&apos;re browsing any website, click it on your bar to save that site straight into MyFav without uploading a list.
                </p>
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-dashed border-white/15 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">Drag this to your Bookmarks Bar:</span>
                  <a
                    ref={bookmarkletRef}
                    href="#bookmarklet"
                    onClick={(e) => {
                      e.preventDefault();
                      setSyncStatus(
                        'Drag the "+ Save to MyFav" button to your Chrome Bookmarks Bar at the top of your browser!'
                      );
                    }}
                    title="Drag me to your Chrome Bookmarks Bar!"
                    className="chrome-sync-btn min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                    <span>+ Save to MyFav</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          {/* HIDDEN FOR NOW: 1-CLICK LIVE CHROME PROFILE LINK (ZERO RE-UPLOAD) */}
          {false && (
            <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4 border accent-border">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md accent-subtle-bg accent-text text-[11px] font-semibold">
                    <Zap className="w-3 h-3" />
                    <span>Zero Re-Upload</span>
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
                    <Link2 className="w-4 h-4 accent-text" />
                    <span>Live Chrome Profile Link (1-Click Refresh &amp; Auto-Watch)</span>
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Click <strong className="text-slate-200">Sync from Windows</strong> or <strong className="text-slate-200">Sync from macOS</strong> below to automatically use your system&apos;s default Chrome <span className="font-mono text-slate-200">Bookmarks</span> path and start syncing immediately without selecting a file path.
                  </p>
                </div>

                {linkedChromeFileName && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shrink-0 max-w-xs truncate">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Active: {linkedChromeFileName}</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={syncingOs !== null}
                  onClick={() => handleSyncFromOs('win')}
                  className="chrome-sync-btn w-full min-h-[48px] px-4 py-2.5 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-between gap-3 cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <RefreshCw
                      className={`w-4 h-4 shrink-0 ${syncingOs === 'win' ? 'animate-spin' : ''}`}
                    />
                    <div className="min-w-0">
                      <span className="block font-semibold">
                        {syncingOs === 'win' ? 'Syncing from Windows...' : 'Sync from Windows'}
                      </span>
                      <span className="block text-[10px] font-mono opacity-75 truncate">
                        {WIN_CHROME_PATH}
                      </span>
                    </div>
                  </div>
                  {copiedPath === 'win' && syncingOs !== 'win' ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                      Synced
                    </span>
                  ) : (
                    <Chrome className="w-4 h-4 shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={syncingOs !== null}
                  onClick={() => handleSyncFromOs('mac')}
                  className="chrome-sync-btn w-full min-h-[48px] px-4 py-2.5 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-between gap-3 cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <RefreshCw
                      className={`w-4 h-4 shrink-0 ${syncingOs === 'mac' ? 'animate-spin' : ''}`}
                    />
                    <div className="min-w-0">
                      <span className="block font-semibold">
                        {syncingOs === 'mac' ? 'Syncing from macOS...' : 'Sync from macOS'}
                      </span>
                      <span className="block text-[10px] font-mono opacity-75 truncate">
                        {MAC_CHROME_PATH}
                      </span>
                    </div>
                  </div>
                  {copiedPath === 'mac' && syncingOs !== 'mac' ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                      Synced
                    </span>
                  ) : (
                    <Chrome className="w-4 h-4 shrink-0" />
                  )}
                </button>
              </div>

              {linkedChromeFileName && (
                <div className="p-4 rounded-xl bg-slate-950/70 border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">
                        Auto-Sync Path: <span className="font-mono accent-text">{linkedChromeFileName}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {lastChromeSyncTime
                          ? `Last synced at ${lastChromeSyncTime}`
                          : 'Ready for automatic incremental sync'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isRefreshingLive}
                        onClick={async () => {
                          if (!onRefreshLiveChromeFile) return;
                          setIsRefreshingLive(true);
                          setSyncError('');
                          setSyncStatus('');
                          try {
                            await onRefreshLiveChromeFile();
                            setSyncStatus('Synced latest bookmarks directly from your Chrome profile!');
                          } catch (err) {
                            setSyncError(
                              err instanceof Error
                                ? err.message
                                : 'Could not refresh Chrome profile.'
                            );
                          } finally {
                            setIsRefreshingLive(false);
                          }
                        }}
                        className="chrome-sync-btn min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRefreshingLive ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingLive ? 'Syncing...' : 'Refresh Now'}</span>
                      </button>

                      {onUnlinkLiveChromeFile && (
                        <button
                          type="button"
                          onClick={onUnlinkLiveChromeFile}
                          title="Unlink path"
                          className="chrome-sync-btn min-h-[40px] px-4 py-2 rounded-xl accent-subtle-bg border accent-border accent-text text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Unlink className="w-4 h-4" />
                          <span>Unlink</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {onToggleAutoWatchChromeFile && (
                    <div className="pt-2.5 border-t border-white/8 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoWatchChromeFile}
                          onChange={(e) => onToggleAutoWatchChromeFile?.(e.target.checked)}
                          className="rounded border-white/20 bg-slate-900 accent-[var(--accent-primary)]"
                        />
                        <span>
                          <strong>Auto-Watch Live Profile:</strong> Automatically check and import new Chrome bookmarks every 10 seconds while MyFav is open
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* TAB 3: ACCOUNT & DATA */}
      {activeTab === 'account' && (
        <div className="space-y-5">
          <InstallAppSection />

          {/* Cloud Account Sync Card */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-100">
                    {user ? 'Account Connected' : 'Local Workspace'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {user
                      ? `Signed in as ${user.email} · Cloud sync is active across all devices.`
                      : 'Log in with Google or email & password to sync your bookmarks across desktop and mobile.'}
                  </p>
                </div>
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="min-h-[40px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  Log in
                </button>
              )}
            </div>
          </section>

          {/* Workspace Stats */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-100">Workspace Summary</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8 text-center">
                <span className="text-xl font-bold font-mono-tabular text-slate-100">
                  {existingCategoryCount}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">Categories & Subcategories</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8 text-center">
                <span className="text-xl font-bold font-mono-tabular text-slate-100">
                  {existingBookmarkCount}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">Websites Saved</p>
              </div>
            </div>
          </section>

          {/* Backup & Export Section */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                  <HardDriveDownload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-100">Backup</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download your bookmarks as a browser-ready HTML bookmark file, CSV spreadsheet, or full JSON backup.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono-tabular text-slate-400 shrink-0 sm:pt-1">
                {existingBookmarkCount} sites · {existingCategoryCount} folders
              </span>
            </div>

            {backupNotice && (
              <div className="p-3.5 rounded-xl accent-subtle-bg border accent-border text-xs text-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0" />
                  <span className="truncate">
                    Exported <span className="font-mono">{backupNotice.filename}</span> ({backupNotice.count} {backupNotice.count === 1 ? 'website' : 'websites'}).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupNotice(null)}
                  className="text-[11px] text-slate-300 hover:text-white shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                disabled={!hasExportableData}
                onClick={() => handleExportBackup('html')}
                className="chrome-sync-btn p-4 rounded-xl bg-slate-950/60 border border-white/10 text-left flex flex-col justify-between gap-4 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-lg accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                      <FileCode2 className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">.html</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 pt-1">HTML Bookmark Backup</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Standard bookmark format for Chrome, Safari, Firefox, Edge, or re-importing into MyFav.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text">
                  <Download className="w-3.5 h-3.5" />
                  <span>Export HTML</span>
                </span>
              </button>

              <button
                type="button"
                disabled={!hasExportableData}
                onClick={() => handleExportBackup('csv')}
                className="chrome-sync-btn p-4 rounded-xl bg-slate-950/60 border border-white/10 text-left flex flex-col justify-between gap-4 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-lg accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">.csv</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 pt-1">CSV Spreadsheet</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Clean spreadsheet table with title, URL, category, subcategory, favorite status, and notes.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text">
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </span>
              </button>

              <button
                type="button"
                disabled={!hasExportableData}
                onClick={() => handleExportBackup('json')}
                className="chrome-sync-btn p-4 rounded-xl bg-slate-950/60 border border-white/10 text-left flex flex-col justify-between gap-4 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-lg accent-subtle-bg flex items-center justify-center accent-text shrink-0">
                      <Braces className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">.json</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 pt-1">JSON Full Backup</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Complete structured workspace backup including folders, websites, quick shortcuts, and theme settings.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text">
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </span>
              </button>
            </div>

            {!hasExportableData && (
              <p className="text-[11px] text-slate-400">
                Add at least one website or category to enable backup exports.
              </p>
            )}
          </section>

          {/* Danger Zone: Clear Data */}
          <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-4 border border-rose-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-rose-300">Clear Workspace</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Permanently remove all categories, subcategories, and saved websites.
                </p>
              </div>

              {showConfirmClear ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowConfirmClear(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isClearing}
                    onClick={handleClearData}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isClearing ? 'Clearing...' : 'Yes, Delete All'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmClear(true)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All Data</span>
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
