/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Star,
  ExternalLink,
  ArrowRightLeft,
  Edit3,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Cloud,
  Copy,
  Check,
  Layers,
  Palette,
  Bookmark,
  Settings,
  Compass,
  Chrome,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  ChevronLeft,
  ArrowLeft,
  GripVertical,
  Zap,
  RefreshCw,
  StarOff,
  LogIn,
} from 'lucide-react';
import {
  auth,
  consumeOAuthFreshSignInFlag,
  OAUTH_FRESH_SIGNIN_KEY,
  onAuthStateChanged,
  registerWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  type User,
} from './lib/auth';
import { apiClient } from './lib/apiClient';
import {
  BookmarkItem,
  CategoryItem,
  DEMO_BOOKMARK_IDS,
  DEMO_CATEGORY_IDS,
  ImportProgressState,
  INITIAL_BOOKMARKS,
  INITIAL_CATEGORIES,
  QuickShortcutIconType,
  QuickShortcutItem,
  SharedCategoryRecord,
  UserSettings,
} from './types';
import {
  CategoryIcon,
  extractDomain,
  QuickShortcutIcon,
  WebsiteFavicon,
} from './components/CategoryIcon';
import { applyThemeToDom } from './utils/theme';
import {
  initGoogleAnalytics,
  trackEvent,
  trackPageView,
} from './utils/analytics';
import {
  ChromeImportPlan,
  inferIconForFolderName,
  parseChromeBookmarksExactArrangement,
} from './utils/chromeBookmarksParser';
import {
  clearSavedChromeFileHandle,
  getSavedChromeFileHandle,
  pickLiveChromeBookmarksFile,
  readLinkedChromeFile,
} from './utils/chromeLiveSync';
import type { BatchEditPayload } from './components/BatchEditModal';
import { MyFavLogo } from './components/MyFavLogo';
import type { AuthPageMode } from './components/AuthPage';
import { Deferred } from './components/Deferred';

// Screens and dialogs that are not needed for the first paint of the Main Page
// load on demand (and are prefetched in the background once the app is idle).
const loadBookmarkModal = () => import('./components/BookmarkModal');
const loadMoveWebsiteModal = () => import('./components/MoveWebsiteModal');
const loadBatchEditModal = () => import('./components/BatchEditModal');
const loadCategoriesPage = () => import('./components/CategoryManagerModal');
const loadSettingsPage = () => import('./components/SettingsModal');
const loadWebsitePreviewModal = () => import('./components/WebsitePreviewModal');
const loadQuickShortcutModal = () => import('./components/QuickShortcutModal');
const loadChromeImportModal = () => import('./components/ChromeImportModal');
const loadShareCategoryModal = () => import('./components/ShareCategoryModal');
const loadSharedCollectionView = () => import('./components/SharedCollectionView');
const loadAccountSyncModal = () => import('./components/AccountSyncModal');
const loadAuthPage = () => import('./components/AuthPage');

const BookmarkModal = lazy(() => loadBookmarkModal().then((m) => ({ default: m.BookmarkModal })));
const MoveWebsiteModal = lazy(() => loadMoveWebsiteModal().then((m) => ({ default: m.MoveWebsiteModal })));
const BatchEditModal = lazy(() => loadBatchEditModal().then((m) => ({ default: m.BatchEditModal })));
const CategoriesPage = lazy(() => loadCategoriesPage().then((m) => ({ default: m.CategoryManagerModal })));
const SettingsPage = lazy(() => loadSettingsPage().then((m) => ({ default: m.SettingsModal })));
const WebsitePreviewModal = lazy(() =>
  loadWebsitePreviewModal().then((m) => ({ default: m.WebsitePreviewModal }))
);
const QuickShortcutModal = lazy(() => loadQuickShortcutModal().then((m) => ({ default: m.QuickShortcutModal })));
const ChromeImportModal = lazy(() => loadChromeImportModal().then((m) => ({ default: m.ChromeImportModal })));
const ShareCategoryModal = lazy(() => loadShareCategoryModal().then((m) => ({ default: m.ShareCategoryModal })));
const SharedCollectionView = lazy(() =>
  loadSharedCollectionView().then((m) => ({ default: m.SharedCollectionView }))
);
const AccountSyncModal = lazy(() => loadAccountSyncModal().then((m) => ({ default: m.AccountSyncModal })));
const AuthPage = lazy(() => loadAuthPage().then((m) => ({ default: m.AuthPage })));

const PREFETCH_ON_IDLE = [
  loadAuthPage,
  loadBookmarkModal,
  loadWebsitePreviewModal,
  loadSettingsPage,
  loadCategoriesPage,
  loadQuickShortcutModal,
  loadMoveWebsiteModal,
  loadBatchEditModal,
  loadShareCategoryModal,
  loadChromeImportModal,
];
import { SignInLoadingOverlay, type SignInLoadingStage } from './components/SignInLoadingOverlay';

const STORAGE_KEYS = {
  CATEGORIES: 'aethermark_categories_v1',
  BOOKMARKS: 'aethermark_bookmarks_v1',
  SETTINGS: 'aethermark_settings_v1',
  QUICK_SHORTCUTS: 'aethermark_quick_shortcuts_v1',
  CHROME_SYNC_META: 'aethermark_chrome_sync_meta_v1',
  CHROME_CACHED_PLAN: 'aethermark_chrome_cached_plan_v1',
  CLOUD_LINKED_UID: 'aethermark_cloud_linked_uid_v1',
};

const WIN_DEFAULT_CHROME_PATH = `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks`;
const MAC_DEFAULT_CHROME_PATH = `~/Library/Application Support/Google/Chrome/Default/Bookmarks`;

function generateCleanId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${randomPart}`;
}


// Guest (signed-out) workspace as stored in this browser. Used on first load
// and again on sign-out, so a signed-out page never keeps showing cloud data.
function readLocalCategories(): CategoryItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (saved) {
      const parsed: CategoryItem[] = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !DEMO_CATEGORY_IDS.has(c.id));
      }
    }
  } catch {
    // ignore storage errors
  }
  return INITIAL_CATEGORIES;
}

function readLocalBookmarks(): BookmarkItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    if (saved) {
      const parsed: BookmarkItem[] = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (b) => !DEMO_BOOKMARK_IDS.has(b.id) && !DEMO_CATEGORY_IDS.has(b.categoryId)
        );
      }
    }
  } catch {
    // ignore storage errors
  }
  return INITIAL_BOOKMARKS;
}

function readLocalQuickShortcuts(): QuickShortcutItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.QUICK_SHORTCUTS);
    if (saved) {
      const parsed: QuickShortcutItem[] = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => a.order - b.order);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export default function App() {
  // Auth & Cloud Sync Gate State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  // Page opened by returning from Google sign-in: show the loader until auth resolves.
  const [returningFromSignIn] = useState(() => {
    try {
      return sessionStorage.getItem(OAUTH_FRESH_SIGNIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const freshSignInTriggeredRef = useRef(false);
  const [syncGateStatus, setSyncGateStatus] = useState<
    'idle' | 'checking' | 'awaiting_choice' | 'ready'
  >('idle');
  const [pendingSyncChoice, setPendingSyncChoice] = useState<{
    targetUser: User;
    localCategories: CategoryItem[];
    localBookmarks: BookmarkItem[];
    localShortcuts: QuickShortcutItem[];
    cloudCategories: CategoryItem[];
    cloudBookmarks: BookmarkItem[];
    cloudShortcuts: QuickShortcutItem[];
  } | null>(null);
  const [isSyncChoiceProcessing, setIsSyncChoiceProcessing] = useState(false);
  const [syncChoiceError, setSyncChoiceError] = useState('');

  // Local / Synced Data State — automatically purges all previous demo categories, subcategories, and websites
  const [categories, setCategories] = useState<CategoryItem[]>(readLocalCategories);

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(readLocalBookmarks);

  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      ownerId: 'local',
      themeMode: 'dark',
      primaryColor: 'blue',
      glassIntensity: 'balanced',
      cardDensity: 'comfortable',
      updatedAt: new Date().toISOString(),
    };
  });

  const [quickShortcuts, setQuickShortcuts] = useState<QuickShortcutItem[]>(readLocalQuickShortcuts);

  const localCategoriesRef = useRef<CategoryItem[]>(categories);
  const localBookmarksRef = useRef<BookmarkItem[]>(bookmarks);
  const localQuickShortcutsRef = useRef<QuickShortcutItem[]>(quickShortcuts);
  if (!user) {
    localCategoriesRef.current = categories;
    localBookmarksRef.current = bookmarks;
    localQuickShortcutsRef.current = quickShortcuts;
  }

  // Page Navigation & Filtering State
  const [activeView, setActiveView] = useState<
    'all' | 'favorites' | 'categories' | 'settings' | 'chrome-sync'
  >('all');
  const [authPageMode, setAuthPageMode] = useState<AuthPageMode | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'order' | 'alpha' | 'favorites'>('order');

  // Bulk Selection & Drag-and-Drop State
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [draggedBookmarkId, setDraggedBookmarkId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedShortcutId, setDraggedShortcutId] = useState<string | null>(null);
  const [categoryDropState, setCategoryDropState] = useState<{
    targetId: string;
    position: 'before' | 'inside' | 'after';
  } | null>(null);
  const [holdExpandTargetId, setHoldExpandTargetId] = useState<string | null>(null);
  const holdExpandTimerRef = useRef<number | null>(null);
  const holdExpandCurrentIdRef = useRef<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals State
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkItem | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const [bookmarksToMove, setBookmarksToMove] = useState<BookmarkItem[]>([]);
  const [bookmarksToBatchEdit, setBookmarksToBatchEdit] = useState<BookmarkItem[]>([]);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [previewingBookmark, setPreviewingBookmark] = useState<BookmarkItem | null>(null);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<QuickShortcutItem | null>(null);
  const [isChromeImportModalOpen, setIsChromeImportModalOpen] = useState(false);
  const [sharingCategory, setSharingCategory] = useState<CategoryItem | null>(null);
  const [sharedCategories, setSharedCategories] = useState<SharedCategoryRecord[]>([]);
  const [activeShareId, setActiveShareId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('share');
    } catch {
      return null;
    }
  });
  const [inlineSubParentId, setInlineSubParentId] = useState<string | null>(null);
  const [inlineSubName, setInlineSubName] = useState('');

  // Live Zero-Upload Chrome Sync State
  const [linkedChromeHandle, setLinkedChromeHandle] =
    useState<FileSystemFileHandle | null>(null);
  const [linkedChromeFileName, setLinkedChromeFileName] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHROME_SYNC_META);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.linkedFileName || null;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [lastChromeModifiedMs, setLastChromeModifiedMs] = useState<number>(0);
  const [lastChromeSyncTime, setLastChromeSyncTime] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHROME_SYNC_META);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.lastSyncTime || null;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [autoWatchChromeFile, setAutoWatchChromeFile] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHROME_SYNC_META);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed.autoWatch);
      }
    } catch {
      // ignore
    }
    return true;
  });
  const [isSyncingChromeLive, setIsSyncingChromeLive] = useState(false);
  const [liveSyncToast, setLiveSyncToast] = useState<string | null>(null);

  // Apply Theme CSS Variables whenever settings change
  useEffect(() => {
    applyThemeToDom(
      settings.primaryColor,
      settings.glassIntensity,
      settings.themeMode || 'dark'
    );
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Persist local data when not signed in
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
      } catch {
        // ignore
      }
    }
  }, [categories, user]);

  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
      } catch {
        // ignore
      }
    }
  }, [bookmarks, user]);

  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(
          STORAGE_KEYS.QUICK_SHORTCUTS,
          JSON.stringify(quickShortcuts)
        );
      } catch {
        // ignore
      }
    }
  }, [quickShortcuts, user]);

  // Listen for browser back/forward navigation on ?share= links
  useEffect(() => {
    const handlePopState = () => {
      try {
        setActiveShareId(new URLSearchParams(window.location.search).get('share'));
      } catch {
        setActiveShareId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize Google Analytics (GA4) when VITE_GA_MEASUREMENT_ID is configured
  useEffect(() => {
    void initGoogleAnalytics();
  }, []);

  // Track virtual page views across MyFav sections and shared links
  useEffect(() => {
    if (activeShareId) {
      trackPageView(`/?share=${activeShareId}`, 'MyFav — Shared Category Collection');
      return;
    }
    const pagePath =
      activeView === 'all' && selectedCategoryId !== 'all'
        ? `/category/${selectedCategoryId}`
        : `/${activeView}`;
    const pageTitle = `MyFav — ${
      activeView === 'categories'
        ? 'Categories'
        : activeView === 'settings' || activeView === 'chrome-sync'
        ? 'Settings'
        : activeView === 'favorites'
        ? 'Favorites'
        : 'Directory'
    }`;
    trackPageView(pagePath, pageTitle);
  }, [activeView, selectedCategoryId, activeShareId]);

  const openAuthPage = (mode: AuthPageMode = 'login') => {
    setAuthPageMode(mode);
  };

  const closeAuthPage = () => {
    setAuthPageMode(null);
  };

  useEffect(() => {
    if (user && authPageMode !== null) {
      closeAuthPage();
    }
  }, [user, authPageMode]);

  const handleGoogleLogin = async () => {
    freshSignInTriggeredRef.current = true;
    setSyncChoiceError('');
    try {
      await signInWithGoogle();
      closeAuthPage();
    } catch (error) {
      freshSignInTriggeredRef.current = false;
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        return;
      }
      console.error('Google sign-in failed:', error);
      throw error;
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    freshSignInTriggeredRef.current = true;
    setSyncChoiceError('');
    try {
      await signInWithEmail(email, password);
      closeAuthPage();
    } catch (error) {
      freshSignInTriggeredRef.current = false;
      throw error;
    }
  };

  const handleEmailRegister = async (
    name: string,
    email: string,
    password: string
  ) => {
    freshSignInTriggeredRef.current = true;
    setSyncChoiceError('');
    try {
      await registerWithEmail(name, email, password);
      closeAuthPage();
    } catch (error) {
      freshSignInTriggeredRef.current = false;
      throw error;
    }
  };

  const handlePasswordReset = async (email: string) => {
    await sendPasswordReset(email);
  };

  const handleSignOut = async () => {
    try {
      // A cloud-linked account empties guest storage when it links, and guest
      // auto-save is off while signed in, so anything there now is a copy of
      // cloud data left by the earlier same-tab sign-out bug. Reset it so the
      // signed-out page shows an empty guest workspace, as after linking.
      if (user && localStorage.getItem(STORAGE_KEYS.CLOUD_LINKED_UID) === user.uid) {
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
      }
      localStorage.removeItem(STORAGE_KEYS.CLOUD_LINKED_UID);
    } catch {
      // ignore
    }
    setPendingSyncChoice(null);
    setSyncGateStatus('idle');
    await signOutUser();
  };

  // Warm the on-demand screens in the background so their first open is instant.
  useEffect(() => {
    const run = () => PREFETCH_ON_IDLE.forEach((load) => void load().catch(() => {}));
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 2500);
    return () => window.clearTimeout(t);
  }, []);

  const wasSignedInRef = useRef(false);
  const prefetchedWorkspaceRef = useRef<{
    uid: string;
    data: Awaited<ReturnType<typeof apiClient.getWorkspace>>;
  } | null>(null);

  // Supabase Auth listener (Firebase-compatible facade) with pre-sync decision gate on login
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (cancelled) return;

      if (!currentUser) {
        freshSignInTriggeredRef.current = false;
        if (wasSignedInRef.current) {
          // Signed in -> signed out in this tab: drop the cloud workspace from
          // the screen and show this browser's guest workspace, exactly what a
          // reload shows. Done in the same batch as setUser(null) so the guest
          // auto-save effects never write cloud data into guest storage.
          wasSignedInRef.current = false;
          setCategories(readLocalCategories());
          setBookmarks(readLocalBookmarks());
          setQuickShortcuts(readLocalQuickShortcuts());
          setActiveView('all');
          setSelectedCategoryId('all');
          setSelectedSubcategoryId('all');
        }
        setUser(null);
        setAuthReady(true);
        setSyncGateStatus('idle');
        setPendingSyncChoice(null);
        setCloudLoading(false);
        return;
      }

      wasSignedInRef.current = true;
      setUser(currentUser);
      setAuthReady(true);

      let linkedUid: string | null = null;
      try {
        linkedUid = localStorage.getItem(STORAGE_KEYS.CLOUD_LINKED_UID);
      } catch {
        // ignore
      }

      // V2: Google sign-in uses a full-page OAuth redirect (Supabase) instead of a
      // Firebase popup, so the "fresh sign-in" marker survives in sessionStorage.
      const wasTriggeredByLogin =
        freshSignInTriggeredRef.current || consumeOAuthFreshSignInFlag();
      freshSignInTriggeredRef.current = false;

      // Returning session for already-linked account: attach listeners seamlessly
      if (!wasTriggeredByLogin && linkedUid === currentUser.uid) {
        setPendingSyncChoice(null);
        setSyncGateStatus('ready');
        return;
      }

      // Fresh login or unlinked account: no prompt. Merge this browser's guest
      // workspace into the account (server de-duplicates websites by URL and
      // categories by name), link the browser, then open the Main Page with the
      // combined cloud workspace.
      setSyncGateStatus('checking');
      setCloudLoading(true);
      setSyncChoiceError('');
      setPendingSyncChoice(null);

      const localCategories = localCategoriesRef.current;
      const localBookmarks = localBookmarksRef.current;
      const localShortcuts = localQuickShortcutsRef.current;
      const hasLocalData =
        localCategories.length > 0 || localBookmarks.length > 0 || localShortcuts.length > 0;

      let syncFailed = false;
      try {
        if (hasLocalData) {
          const synced = await apiClient.syncLocalWorkspace({
            categories: localCategories,
            bookmarks: localBookmarks,
            quickShortcuts: localShortcuts,
          });
          // The sync already returns the full workspace: reuse it instead of
          // fetching everything a second time.
          prefetchedWorkspaceRef.current = { uid: currentUser.uid, data: synced };
        }
        if (cancelled) return;
        try {
          localStorage.setItem(STORAGE_KEYS.CLOUD_LINKED_UID, currentUser.uid);
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
          localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
          localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
        } catch {
          // ignore
        }
      } catch (error) {
        if (cancelled) return;
        // Not linked: the guest copy stays in this browser and the merge is
        // retried on the next sign-in. Nothing is lost.
        syncFailed = true;
        console.error('Automatic sync of local data failed:', error);
      }

      setActiveView('all');
      setSelectedCategoryId('all');
      setSelectedSubcategoryId('all');
      setSyncGateStatus('ready');
      if (syncFailed) {
        setLiveSyncToast("Couldn't sync this device's websites yet. They're kept here and will sync next time you log in.");
        setTimeout(() => setLiveSyncToast(null), 5000);
      } else if (hasLocalData) {
        setLiveSyncToast('Synced your websites to your account');
        setTimeout(() => setLiveSyncToast(null), 3500);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Load workspace data from Supabase PostgreSQL when signed in & sync choice resolved
  useEffect(() => {
    if (!authReady || !user || syncGateStatus !== 'ready') {
      if (!user) {
        setSharedCategories([]);
        setCloudLoading(false);
      }
      return;
    }

    let cancelled = false;
    setCloudLoading(true);

    const prefetched = prefetchedWorkspaceRef.current;
    prefetchedWorkspaceRef.current = null;
    const workspacePromise =
      prefetched && prefetched.uid === user.uid
        ? Promise.resolve(prefetched.data)
        : apiClient.getWorkspace();

    workspacePromise
      .then((data) => {
        if (cancelled) return;
        setCategories(data.categories);
        setBookmarks(data.bookmarks);
        setQuickShortcuts(data.quickShortcuts);
        setSharedCategories(data.sharedCategories);
        if (data.settings) {
          setSettings((prev) => ({
            ...prev,
            ownerId: data.settings!.ownerId,
            themeMode: data.settings!.themeMode || prev.themeMode || 'dark',
            primaryColor: data.settings!.primaryColor || 'blue',
            glassIntensity: data.settings!.glassIntensity || 'balanced',
            cardDensity: data.settings!.cardDensity || 'comfortable',
            updatedAt: data.settings!.updatedAt,
          }));
        }
        setCloudLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setCloudLoading(false);
        console.error('Failed to load PostgreSQL workspace:', error);
        setLiveSyncToast('Could not load cloud workspace. Please refresh.');
        setTimeout(() => setLiveSyncToast(null), 4000);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user, syncGateStatus]);

  // Decision Handlers for AccountSyncModal (Sync Local to Cloud / Keep Local / Get Cloud & Sync / Fresh Start)
  const handleChoiceSyncLocalToCloud = async () => {
    if (!pendingSyncChoice) return;
    const {
      targetUser,
      localCategories,
      localBookmarks,
      localShortcuts,
    } = pendingSyncChoice;

    setIsSyncChoiceProcessing(true);
    setSyncChoiceError('');

    try {
      const synced = await apiClient.syncLocalWorkspace({
        categories: localCategories,
        bookmarks: localBookmarks,
        quickShortcuts: localShortcuts,
      });

      setCategories(synced.categories);
      setBookmarks(synced.bookmarks);
      setQuickShortcuts(synced.quickShortcuts);
      setSharedCategories(synced.sharedCategories);

      try {
        localStorage.setItem(STORAGE_KEYS.CLOUD_LINKED_UID, targetUser.uid);
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
      } catch {
        // ignore
      }

      setPendingSyncChoice(null);
      setSyncGateStatus('ready');
      setLiveSyncToast('Synced your data to Google account');
      setTimeout(() => setLiveSyncToast(null), 3500);
    } catch (err) {
      setSyncChoiceError(
        err instanceof Error ? err.message : 'Failed to sync local data to Google.'
      );
    } finally {
      setIsSyncChoiceProcessing(false);
    }
  };

  const handleChoiceKeepLocalOnly = async () => {
    setIsSyncChoiceProcessing(true);
    setSyncChoiceError('');
    try {
      try {
        localStorage.removeItem(STORAGE_KEYS.CLOUD_LINKED_UID);
      } catch {
        // ignore
      }
      setPendingSyncChoice(null);
      setSyncGateStatus('idle');
      await signOutUser();
      setLiveSyncToast('Keeping websites & categories locally on this computer');
      setTimeout(() => setLiveSyncToast(null), 3500);
    } catch (err) {
      setSyncChoiceError(
        err instanceof Error ? err.message : 'Failed to switch back to local mode.'
      );
    } finally {
      setIsSyncChoiceProcessing(false);
    }
  };

  const handleChoiceGetCloudAndSync = async () => {
    if (!pendingSyncChoice) return;
    setIsSyncChoiceProcessing(true);
    setSyncChoiceError('');
    try {
      try {
        localStorage.setItem(
          STORAGE_KEYS.CLOUD_LINKED_UID,
          pendingSyncChoice.targetUser.uid
        );
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
      } catch {
        // ignore
      }
      setSelectedCategoryId('all');
      setSelectedSubcategoryId('all');
      setPendingSyncChoice(null);
      setSyncGateStatus('ready');
      setLiveSyncToast('Synced saved data from your Google account');
      setTimeout(() => setLiveSyncToast(null), 3500);
    } finally {
      setIsSyncChoiceProcessing(false);
    }
  };

  const handleChoiceStartFresh = async (goToChromeSync = false) => {
    if (!pendingSyncChoice) return;
    const { targetUser } = pendingSyncChoice;
    setIsSyncChoiceProcessing(true);
    setSyncChoiceError('');

    try {
      await apiClient.clearWorkspace();

      setCategories([]);
      setBookmarks([]);
      setQuickShortcuts([]);
      setSharedCategories([]);
      setSelectedCategoryId('all');
      setSelectedSubcategoryId('all');

      try {
        localStorage.setItem(STORAGE_KEYS.CLOUD_LINKED_UID, targetUser.uid);
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
      } catch {
        // ignore
      }

      setPendingSyncChoice(null);
      setSyncGateStatus('ready');
      if (goToChromeSync) {
        setActiveView('chrome-sync');
      } else {
        setLiveSyncToast('Started a fresh cloud workspace');
        setTimeout(() => setLiveSyncToast(null), 3500);
      }
    } catch (err) {
      setSyncChoiceError(
        err instanceof Error ? err.message : 'Failed to reset workspace.'
      );
    } finally {
      setIsSyncChoiceProcessing(false);
    }
  };

  const sharedByCategoryId = useMemo(() => {
    const map: Record<string, SharedCategoryRecord> = {};
    for (const share of sharedCategories) {
      if (share.categoryId) {
        map[share.categoryId] = share;
      }
    }
    return map;
  }, [sharedCategories]);

  // Derived Category Hierarchy (sorted strictly by `order`)
  const rootCategories = useMemo(
    () => categories.filter((c) => c.parentId === '').sort((a, b) => a.order - b.order),
    [categories]
  );

  const subcategoriesByParent = useMemo(() => {
    const map: Record<string, CategoryItem[]> = {};
    for (const c of categories) {
      if (c.parentId) {
        if (!map[c.parentId]) map[c.parentId] = [];
        map[c.parentId].push(c);
      }
    }
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.order - b.order);
    });
    return map;
  }, [categories]);

  const categoryMap = useMemo(() => {
    const map: Record<string, CategoryItem> = {};
    for (const c of categories) map[c.id] = c;
    return map;
  }, [categories]);

  // Filtered and Sorted Bookmarks (preserves Chrome import arrangement by default)
  const filteredBookmarks = useMemo(() => {
    return bookmarks
      .filter((bm) => {
        if (activeView === 'favorites' && !bm.isFavorite) return false;
        if (selectedCategoryId !== 'all' && bm.categoryId !== selectedCategoryId) {
          return false;
        }
        if (selectedSubcategoryId !== 'all' && bm.subcategoryId !== selectedSubcategoryId) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const catName = categoryMap[bm.categoryId]?.name.toLowerCase() || '';
          const subName = categoryMap[bm.subcategoryId]?.name.toLowerCase() || '';
          return (
            bm.title.toLowerCase().includes(q) ||
            bm.url.toLowerCase().includes(q) ||
            bm.description.toLowerCase().includes(q) ||
            catName.includes(q) ||
            subName.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'alpha') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'favorites') {
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        }
        // 'order': sort by category order -> subcategory order -> creation order
        const catOrderA = categoryMap[a.categoryId]?.order ?? 9999;
        const catOrderB = categoryMap[b.categoryId]?.order ?? 9999;
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;

        const subOrderA = a.subcategoryId
          ? categoryMap[a.subcategoryId]?.order ?? 9999
          : -1;
        const subOrderB = b.subcategoryId
          ? categoryMap[b.subcategoryId]?.order ?? 9999
          : -1;
        if (subOrderA !== subOrderB) return subOrderA - subOrderB;

        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [
    bookmarks,
    activeView,
    selectedCategoryId,
    selectedSubcategoryId,
    searchQuery,
    sortBy,
    categoryMap,
  ]);

  // Clear Entire Workspace (Categories, Subcategories, Bookmarks, and Quick Shortcuts)
  const handleClearEntireWorkspace = async () => {
    if (user) {
      await apiClient.clearWorkspace();
      setQuickShortcuts([]);
      setBookmarks([]);
      setCategories([]);
      setSharedCategories([]);
    } else {
      setQuickShortcuts([]);
      setBookmarks([]);
      setCategories([]);
      try {
        localStorage.setItem(STORAGE_KEYS.QUICK_SHORTCUTS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify([]));
      } catch {
        // ignore
      }
    }
    setSelectedCategoryId('all');
    setSelectedSubcategoryId('all');
  };

  // Import Chrome Bookmarks Plan with Exact Category, Subcategory & Website Arrangement
  // Supports both Replace All mode and Smart Incremental Merge (zero duplicates when syncing live!)
  const handleImportExactChromePlan = async (
    plan: ChromeImportPlan,
    replaceAllExisting: boolean,
    onProgress?: (progress: ImportProgressState) => void
  ) => {
    const rootCats = plan.categories
      .filter((c) => c.parentTempId === '')
      .sort((a, b) => a.order - b.order);
    const subCats = plan.categories
      .filter((c) => c.parentTempId !== '')
      .sort((a, b) => a.order - b.order);
    const orderedBookmarks = [...plan.bookmarks].sort((a, b) => a.order - b.order);

    const totalUnits = Math.max(
      1,
      rootCats.length + subCats.length + orderedBookmarks.length
    );
    let processedCount = 0;
    let addedCatCount = 0;
    let addedBmCount = 0;
    let skippedDupCount = 0;

    const emitProgress = (
      phase: ImportProgressState['phase'],
      currentTitle?: string
    ) => {
      onProgress?.({
        phase,
        processed: Math.min(totalUnits, processedCount),
        total: totalUnits,
        addedBookmarks: addedBmCount,
        addedCategories: addedCatCount,
        skippedDuplicates: skippedDupCount,
        currentTitle,
      });
    };

    const tickVisualFrame = async (batchStride: number, index: number) => {
      if (!onProgress) return;
      if (!user && index % batchStride === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 14));
      }
    };

    if (user) {
      emitProgress(
        'categories',
        replaceAllExisting ? 'Replacing workspace...' : 'Syncing folders and bookmarks...'
      );
      const { summary, workspace } = await apiClient.importChromePlan(
        plan,
        replaceAllExisting
      );
      setCategories(workspace.categories);
      setBookmarks(workspace.bookmarks);
      setQuickShortcuts(workspace.quickShortcuts);
      setSharedCategories(workspace.sharedCategories);

      addedCatCount = summary.addedCategories;
      addedBmCount = summary.addedBookmarks;
      skippedDupCount = summary.skippedDuplicates;

      const expandedMap: Record<string, boolean> = {};
      for (const catId of summary.expandedCategoryIds) {
        expandedMap[catId] = true;
      }
      setExpandedCategories((prev) => ({ ...prev, ...expandedMap }));
    } else {
      if (replaceAllExisting) {
        emitProgress('preparing', 'Clearing previous bookmarks...');
        await handleClearEntireWorkspace();
      } else {
        emitProgress('categories', 'Scanning existing categories...');
      }

      const existingRootsByName = new Map<string, CategoryItem>();
      const existingSubsByParentAndName = new Map<string, CategoryItem>();
      const existingBookmarkUrls = new Set<string>();

      if (!replaceAllExisting) {
        for (const c of categories) {
          if (c.parentId === '') {
            existingRootsByName.set(c.name.trim().toLowerCase(), c);
          }
        }
        for (const c of categories) {
          if (c.parentId !== '') {
            existingSubsByParentAndName.set(
              `${c.parentId}::${c.name.trim().toLowerCase()}`,
              c
            );
          }
        }
        for (const b of bookmarks) {
          existingBookmarkUrls.add(b.url.trim().toLowerCase());
        }
      }

      const baseTimeMs = Date.now();
      const tempToRealId: Record<string, string> = {};
      const newLocalCategories: CategoryItem[] = [];
      const newLocalBookmarks: BookmarkItem[] = [];
      const expandedMap: Record<string, boolean> = {};

      let nextRootOrder = replaceAllExisting
        ? 0
        : categories.filter((c) => c.parentId === '').length;

      for (let i = 0; i < rootCats.length; i++) {
        const rc = rootCats[i];
        processedCount++;
        emitProgress('categories', rc.name);
        await tickVisualFrame(2, i);

        const existingMatch = !replaceAllExisting
          ? existingRootsByName.get(rc.name.trim().toLowerCase())
          : undefined;

        if (existingMatch) {
          tempToRealId[rc.tempId] = existingMatch.id;
          expandedMap[existingMatch.id] = true;
          continue;
        }

        const realId = generateCleanId(`cat_${i}`);
        tempToRealId[rc.tempId] = realId;
        expandedMap[realId] = true;
        addedCatCount++;
        const iso = new Date(baseTimeMs + i * 10).toISOString();
        const orderVal = replaceAllExisting ? i : nextRootOrder++;

        newLocalCategories.push({
          id: realId,
          ownerId: 'local',
          name: rc.name.slice(0, 80),
          icon: rc.icon || 'bookmark',
          parentId: '',
          order: orderVal,
          createdAt: iso,
          updatedAt: iso,
        });
      }

      for (let i = 0; i < subCats.length; i++) {
        const sc = subCats[i];
        processedCount++;
        emitProgress('categories', sc.name);
        await tickVisualFrame(3, i);

        const parentRealId = tempToRealId[sc.parentTempId];
        if (!parentRealId) continue;

        const existingSubMatch = !replaceAllExisting
          ? existingSubsByParentAndName.get(
              `${parentRealId}::${sc.name.trim().toLowerCase()}`
            )
          : undefined;

        if (existingSubMatch) {
          tempToRealId[sc.tempId] = existingSubMatch.id;
          continue;
        }

        const realSubId = generateCleanId(`sub_${i}`);
        tempToRealId[sc.tempId] = realSubId;
        addedCatCount++;
        const iso = new Date(baseTimeMs + 1000 + i * 10).toISOString();

        newLocalCategories.push({
          id: realSubId,
          ownerId: 'local',
          name: sc.name.slice(0, 80),
          icon: sc.icon || 'bookmark',
          parentId: parentRealId,
          order: sc.order,
          createdAt: iso,
          updatedAt: iso,
        });
      }

      const localTickStride =
        orderedBookmarks.length > 180 ? 6 : orderedBookmarks.length > 60 ? 3 : 1;

      for (let i = 0; i < orderedBookmarks.length; i++) {
        const bm = orderedBookmarks[i];
        processedCount++;
        const normalizedUrl = bm.url.trim().toLowerCase();
        if (!replaceAllExisting && existingBookmarkUrls.has(normalizedUrl)) {
          skippedDupCount++;
          emitProgress('bookmarks', bm.title);
          await tickVisualFrame(localTickStride * 2, i);
          continue;
        }
        existingBookmarkUrls.add(normalizedUrl);

        const realCatId = tempToRealId[bm.categoryTempId];
        if (!realCatId) continue;
        const realSubId = bm.subcategoryTempId
          ? tempToRealId[bm.subcategoryTempId] || ''
          : '';

        const bmId = generateCleanId(`bm_${String(i).padStart(4, '0')}`);
        const iso = new Date(baseTimeMs + 5000 + i * 10).toISOString();
        addedBmCount++;

        emitProgress('bookmarks', bm.title);
        await tickVisualFrame(localTickStride, i);

        newLocalBookmarks.push({
          id: bmId,
          ownerId: 'local',
          title: bm.title.slice(0, 120),
          url: bm.url.slice(0, 500),
          description: '',
          categoryId: realCatId,
          subcategoryId: realSubId,
          isFavorite: false,
          createdAt: iso,
          updatedAt: iso,
        });
      }

      setExpandedCategories((prev) => ({ ...prev, ...expandedMap }));
      setCategories((prev) =>
        replaceAllExisting ? newLocalCategories : [...prev, ...newLocalCategories]
      );
      setBookmarks((prev) =>
        replaceAllExisting ? newLocalBookmarks : [...prev, ...newLocalBookmarks]
      );
    }

    const nowTimeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastChromeSyncTime(nowTimeStr);
    try {
      localStorage.setItem(
        STORAGE_KEYS.CHROME_CACHED_PLAN,
        JSON.stringify(plan)
      );
      localStorage.setItem(
        STORAGE_KEYS.CHROME_SYNC_META,
        JSON.stringify({
          lastSyncTime: nowTimeStr,
          autoWatch: autoWatchChromeFile,
          linkedFileName: linkedChromeFileName,
        })
      );
    } catch {
      // ignore
    }

    if (addedBmCount > 0 || addedCatCount > 0) {
      setLiveSyncToast(
        `Synced ${addedBmCount} new Chrome ${
          addedBmCount === 1 ? 'bookmark' : 'bookmarks'
        } (${nowTimeStr})`
      );
      setTimeout(() => setLiveSyncToast(null), 4000);
    }

    processedCount = totalUnits;
    emitProgress('complete');
  };

  // Automatic Direct OS Chrome Path Sync (No file selector needed)
  const handleSyncFromOsDirect = async (os: 'win' | 'mac') => {
    const autoPath = os === 'win' ? WIN_DEFAULT_CHROME_PATH : MAC_DEFAULT_CHROME_PATH;
    const osLabel = os === 'win' ? 'Windows' : 'macOS';

    setIsSyncingChromeLive(true);
    setLinkedChromeFileName(autoPath);
    setAutoWatchChromeFile(true);

    try {
      // 1. Trigger Companion Chrome Extension live sync if installed
      window.postMessage({ type: 'AETHERMARK_REQUEST_CHROME_SYNC', os, path: autoPath }, '*');

      // 2. If a live FileSystemFileHandle is already available in IndexedDB, read from it silently
      if (linkedChromeHandle) {
        try {
          const data = await readLinkedChromeFile(linkedChromeHandle, false);
          setLastChromeModifiedMs(data.lastModified);
          const plan = parseChromeBookmarksExactArrangement(data.content);
          if (plan.bookmarks.length > 0 || plan.categories.length > 0) {
            await handleImportExactChromePlan(plan, false);
          }
        } catch {
          // Handle permission not active; fall through to cached plan sync
        }
      } else {
        // 3. Check if we have a cached Chrome plan from previous sync and merge any missing items
        try {
          const cachedRaw = localStorage.getItem(STORAGE_KEYS.CHROME_CACHED_PLAN);
          if (cachedRaw) {
            const cachedPlan = JSON.parse(cachedRaw) as ChromeImportPlan;
            if (
              cachedPlan &&
              Array.isArray(cachedPlan.bookmarks) &&
              Array.isArray(cachedPlan.categories)
            ) {
              await handleImportExactChromePlan(cachedPlan, false);
            }
          }
        } catch {
          // ignore
        }
      }

      const nowTimeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastChromeSyncTime(nowTimeStr);
      try {
        localStorage.setItem(
          STORAGE_KEYS.CHROME_SYNC_META,
          JSON.stringify({
            lastSyncTime: nowTimeStr,
            autoWatch: true,
            linkedFileName: autoPath,
          })
        );
      } catch {
        // ignore
      }

      setLiveSyncToast(`Synced from ${osLabel} Chrome (${nowTimeStr})`);
      setTimeout(() => setLiveSyncToast(null), 4000);
    } finally {
      setIsSyncingChromeLive(false);
    }
  };

  // Live Zero-Upload Chrome Sync Handlers
  const handleLinkLiveChromeFile = async (os?: 'win' | 'mac') => {
    if (os) {
      await handleSyncFromOsDirect(os);
      return;
    }
    const picked = await pickLiveChromeBookmarksFile();
    setLinkedChromeHandle(picked.handle);
    setLinkedChromeFileName(picked.name);
    setLastChromeModifiedMs(picked.lastModified);

    const plan = parseChromeBookmarksExactArrangement(picked.content);
    if (plan.bookmarks.length === 0 && plan.categories.length === 0) {
      throw new Error(
        'No Chrome bookmarks found in the selected file. Make sure you selected your Chrome "Bookmarks" file.'
      );
    }
    await handleImportExactChromePlan(plan, false);
  };

  const handleRefreshLiveChromeFile = async (requestPerm = true) => {
    if (!linkedChromeHandle) {
      const isMac =
        linkedChromeFileName?.includes('Library/Application Support') ||
        navigator.platform?.toLowerCase().includes('mac');
      await handleSyncFromOsDirect(isMac ? 'mac' : 'win');
      return;
    }
    setIsSyncingChromeLive(true);
    try {
      const data = await readLinkedChromeFile(linkedChromeHandle, requestPerm);
      setLastChromeModifiedMs(data.lastModified);
      setLinkedChromeFileName(data.name);
      const plan = parseChromeBookmarksExactArrangement(data.content);
      if (plan.bookmarks.length > 0 || plan.categories.length > 0) {
        await handleImportExactChromePlan(plan, false);
      }
    } catch {
      const isMac =
        linkedChromeFileName?.includes('Library/Application Support') ||
        navigator.platform?.toLowerCase().includes('mac');
      await handleSyncFromOsDirect(isMac ? 'mac' : 'win');
    } finally {
      setIsSyncingChromeLive(false);
    }
  };

  const handleUnlinkLiveChromeFile = async () => {
    await clearSavedChromeFileHandle();
    setLinkedChromeHandle(null);
    setLinkedChromeFileName(null);
    setLastChromeModifiedMs(0);
    try {
      localStorage.setItem(
        STORAGE_KEYS.CHROME_SYNC_META,
        JSON.stringify({
          lastSyncTime: lastChromeSyncTime,
          autoWatch: autoWatchChromeFile,
          linkedFileName: null,
        })
      );
    } catch {
      // ignore
    }
  };

  const handleToggleAutoWatchChromeFile = (enabled: boolean) => {
    setAutoWatchChromeFile(enabled);
    try {
      localStorage.setItem(
        STORAGE_KEYS.CHROME_SYNC_META,
        JSON.stringify({
          lastSyncTime: lastChromeSyncTime,
          autoWatch: enabled,
          linkedFileName: linkedChromeFileName,
        })
      );
    } catch {
      // ignore
    }
  };

  // Restore saved Chrome FileSystemFileHandle on startup + Listen for Bookmarklet & Extension Sync
  useEffect(() => {
    getSavedChromeFileHandle().then((handle) => {
      if (handle) {
        setLinkedChromeHandle(handle);
        setLinkedChromeFileName(handle.name || 'Bookmarks');
      }
    });

    // Check if opened via 1-Click Bookmarklet or Extension (?addUrl=...&addTitle=...)
    const params = new URLSearchParams(window.location.search);
    const addUrl = params.get('addUrl');
    const addTitle = params.get('addTitle');
    if (addUrl) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      setEditingBookmark({
        id: '',
        ownerId: user?.uid || 'local',
        title: addTitle || addUrl,
        url: addUrl,
        description: '',
        categoryId: categories[0]?.id || '',
        subcategoryId: '',
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setIsBookmarkModalOpen(true);
    }
  }, []);

  const importPlanHandlerRef = useRef(handleImportExactChromePlan);
  importPlanHandlerRef.current = handleImportExactChromePlan;

  // Listen for real-time postMessage from MyFav Chrome Companion Extension
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'AETHERMARK_EXTENSION_SYNC' &&
        typeof event.data.payload === 'string'
      ) {
        const plan = parseChromeBookmarksExactArrangement(event.data.payload);
        if (plan.bookmarks.length > 0 || plan.categories.length > 0) {
          await importPlanHandlerRef.current(plan, false);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Auto-Watch Linked Chrome Bookmarks File for live changes without re-uploading
  useEffect(() => {
    if (!linkedChromeHandle || !autoWatchChromeFile) return;

    const timer = window.setInterval(async () => {
      try {
        const data = await readLinkedChromeFile(linkedChromeHandle, false);
        if (lastChromeModifiedMs === 0 || data.lastModified > lastChromeModifiedMs) {
          setLastChromeModifiedMs(data.lastModified);
          const plan = parseChromeBookmarksExactArrangement(data.content);
          if (plan.bookmarks.length > 0 || plan.categories.length > 0) {
            await handleImportExactChromePlan(plan, false);
          }
        }
      } catch {
        // Permission may require a user click first; ignore background poll error
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, [linkedChromeHandle, autoWatchChromeFile, lastChromeModifiedMs, categories, bookmarks]);

  // CRUD Handlers for Bookmarks
  const handleSaveBookmark = async (data: {
    id?: string;
    title: string;
    url: string;
    description: string;
    categoryId: string;
    subcategoryId: string;
    isFavorite: boolean;
  }) => {
    const nowIso = new Date().toISOString();
    const isExisting = Boolean(data.id && bookmarks.some((b) => b.id === data.id));
    const docId = isExisting && data.id ? data.id : generateCleanId('bm');

    if (user) {
      const saved = await apiClient.saveBookmark({
        id: isExisting ? docId : undefined,
        title: data.title.slice(0, 120),
        url: data.url.slice(0, 500),
        description: data.description.slice(0, 400),
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId || '',
        isFavorite: Boolean(data.isFavorite),
      });
      setBookmarks((prev) =>
        isExisting
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved]
      );
    } else {
      if (isExisting) {
        setBookmarks((prev) =>
          prev.map((item) =>
            item.id === docId
              ? {
                  ...item,
                  title: data.title,
                  url: data.url,
                  description: data.description,
                  categoryId: data.categoryId,
                  subcategoryId: data.subcategoryId,
                  isFavorite: data.isFavorite,
                  updatedAt: nowIso,
                }
              : item
          )
        );
      } else {
        const newBm: BookmarkItem = {
          id: docId,
          ownerId: 'local',
          title: data.title,
          url: data.url,
          description: data.description,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          isFavorite: data.isFavorite,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setBookmarks((prev) => [...prev, newBm]);
      }
    }
  };

  const handleToggleFavorite = async (bm: BookmarkItem) => {
    const nextVal = !bm.isFavorite;
    const nowIso = new Date().toISOString();
    setBookmarks((prev) =>
      prev.map((item) =>
        item.id === bm.id
          ? { ...item, isFavorite: nextVal, updatedAt: nowIso }
          : item
      )
    );
    if (user) {
      await apiClient.toggleFavorite(bm.id, nextVal);
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    if (user) {
      await apiClient.deleteBookmark(id);
    }
    setBookmarks((prev) => prev.filter((item) => item.id !== id));
    setSelectedBookmarkIds((prev) => prev.filter((selId) => selId !== id));
  };

  const handleMoveWebsites = async (
    bookmarkIds: string[],
    targetCategoryId: string,
    targetSubcategoryId: string
  ) => {
    await handleBatchEditWebsites(bookmarkIds, {
      category: {
        categoryId: targetCategoryId,
        subcategoryId: targetSubcategoryId || '',
      },
      favoriteStatus: 'keep',
    });
  };

  const handleBatchEditWebsites = async (
    bookmarkIds: string[],
    updates: BatchEditPayload
  ) => {
    if (bookmarkIds.length === 0) return;
    const hasCategoryChange = Boolean(updates.category?.categoryId);
    const hasFavoriteChange =
      updates.favoriteStatus === 'favorite' ||
      updates.favoriteStatus === 'unfavorite';
    if (!hasCategoryChange && !hasFavoriteChange) return;

    setIsBatchEditing(true);
    const nowIso = new Date().toISOString();
    const idSet = new Set(bookmarkIds);

    try {
      if (user) {
        await apiClient.batchEditBookmarks({
          bookmarkIds,
          category: updates.category,
          favoriteStatus: updates.favoriteStatus || 'keep',
        });
      }

      setBookmarks((prev) =>
        prev.map((bm) => {
          if (!idSet.has(bm.id)) return bm;
          return {
            ...bm,
            ...(updates.category
              ? {
                  categoryId: updates.category.categoryId,
                  subcategoryId: updates.category.subcategoryId || '',
                }
              : {}),
            ...(updates.favoriteStatus === 'favorite'
              ? { isFavorite: true }
              : updates.favoriteStatus === 'unfavorite'
              ? { isFavorite: false }
              : {}),
            updatedAt: nowIso,
          };
        })
      );

      const parts: string[] = [];
      if (updates.category) {
        const catName =
          categoryMap[updates.category.categoryId]?.name || 'selected category';
        const subName = updates.category.subcategoryId
          ? categoryMap[updates.category.subcategoryId]?.name
          : '';
        parts.push(`moved to ${catName}${subName ? ` / ${subName}` : ''}`);
      }
      if (updates.favoriteStatus === 'favorite') {
        parts.push('pinned to Favorites');
      } else if (updates.favoriteStatus === 'unfavorite') {
        parts.push('removed from Favorites');
      }

      setLiveSyncToast(
        `Updated ${bookmarkIds.length} ${
          bookmarkIds.length === 1 ? 'website' : 'websites'
        }${parts.length > 0 ? ` (${parts.join(' · ')})` : ''}`
      );
      setTimeout(() => setLiveSyncToast(null), 3500);

      setSelectedBookmarkIds([]);
      setConfirmBulkDelete(false);
      setBulkMode(false);
      lastSelectedIdRef.current = null;
    } finally {
      setIsBatchEditing(false);
    }
  };

  const handleDeleteSelectedBookmarks = async () => {
    if (selectedBookmarkIds.length === 0) return;
    setIsBulkDeleting(true);
    const idsToDelete = [...selectedBookmarkIds];
    const idSet = new Set(idsToDelete);

    try {
      if (user) {
        await apiClient.batchDeleteBookmarks(idsToDelete);
      }
      setBookmarks((prev) => prev.filter((item) => !idSet.has(item.id)));
      setSelectedBookmarkIds([]);
      setConfirmBulkDelete(false);
      setBulkMode(false);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // CRUD Handlers for Quick Access Shortcuts
  const handleSaveQuickShortcut = async (data: {
    id?: string;
    title: string;
    url: string;
    iconType: QuickShortcutIconType;
    customIcon: string;
  }) => {
    const nowIso = new Date().toISOString();
    const isExisting = Boolean(
      data.id && quickShortcuts.some((s) => s.id === data.id)
    );
    const docId = isExisting && data.id ? data.id : generateCleanId('qs');
    const cleanTitle = data.title.trim().slice(0, 80);
    const cleanUrl = data.url.trim().slice(0, 500);
    const cleanCustomIcon =
      data.iconType === 'favicon' ? '' : data.customIcon.trim().slice(0, 500);

    if (user) {
      const saved = await apiClient.saveQuickShortcut({
        id: isExisting ? docId : undefined,
        title: cleanTitle,
        url: cleanUrl,
        iconType: data.iconType,
        customIcon: cleanCustomIcon,
      });
      setQuickShortcuts((prev) =>
        isExisting
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved]
      );
    } else {
      if (isExisting) {
        setQuickShortcuts((prev) =>
          prev.map((item) =>
            item.id === docId
              ? {
                  ...item,
                  title: cleanTitle,
                  url: cleanUrl,
                  iconType: data.iconType,
                  customIcon: cleanCustomIcon,
                  updatedAt: nowIso,
                }
              : item
          )
        );
      } else {
        const newShortcut: QuickShortcutItem = {
          id: docId,
          ownerId: 'local',
          title: cleanTitle,
          url: cleanUrl,
          iconType: data.iconType,
          customIcon: cleanCustomIcon,
          order: quickShortcuts.length,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setQuickShortcuts((prev) => [...prev, newShortcut]);
      }
    }
  };

  const handleDeleteQuickShortcut = async (id: string) => {
    if (user) {
      await apiClient.deleteQuickShortcut(id);
    }
    setQuickShortcuts((prev) =>
      prev
        .filter((item) => item.id !== id)
        .map((item, idx) => ({ ...item, order: idx }))
    );
  };

  const handleToggleBookmarkShortcut = async (bm: BookmarkItem) => {
    const existing = quickShortcuts.find(
      (s) => s.url.toLowerCase() === bm.url.toLowerCase()
    );
    if (existing) {
      await handleDeleteQuickShortcut(existing.id);
    } else {
      await handleSaveQuickShortcut({
        title: bm.title,
        url: bm.url,
        iconType: 'favicon',
        customIcon: '',
      });
    }
  };

  const handleReorderShortcuts = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const oldIdx = quickShortcuts.findIndex((s) => s.id === sourceId);
    const newIdx = quickShortcuts.findIndex((s) => s.id === targetId);
    if (oldIdx === -1 || newIdx === -1) return;

    const updated = [...quickShortcuts];
    const [moved] = updated.splice(oldIdx, 1);
    updated.splice(newIdx, 0, moved);
    const reindexed = updated.map((item, idx) => ({ ...item, order: idx }));
    setQuickShortcuts(reindexed);

    if (user) {
      await apiClient.reorderQuickShortcuts(reindexed.map((s) => s.id));
    }
  };

  // CRUD Handlers for Categories & Subcategories
  const handleCreateCategory = async (
    name: string,
    icon: string,
    parentId: string
  ): Promise<string | null> => {
    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) return null;
    const newId = generateCleanId(parentId ? 'sub' : 'cat');
    const siblings = categories.filter((c) => c.parentId === parentId);
    const nextOrder = siblings.length;
    const nowIso = new Date().toISOString();
    const resolvedIcon = icon || inferIconForFolderName(cleanName);

    let createdId = newId;
    if (user) {
      const created = await apiClient.createCategory({
        id: newId,
        name: cleanName,
        icon: resolvedIcon,
        parentId: parentId || '',
      });
      createdId = created.id;
      setCategories((prev) => [...prev, created]);
    } else {
      const newCat: CategoryItem = {
        id: newId,
        ownerId: 'local',
        name: cleanName,
        icon: resolvedIcon,
        parentId: parentId || '',
        order: nextOrder,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setCategories((prev) => [...prev, newCat]);
    }

    if (parentId) {
      setExpandedCategories((prev) => ({ ...prev, [parentId]: true }));
    }
    return createdId;
  };

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) return;
    const safeIcon = /^[a-zA-Z0-9_-]{1,40}$/.test(icon) ? icon : 'bookmark';

    if (user) {
      await apiClient.updateCategory(id, { name: cleanName, icon: safeIcon });
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, name: cleanName, icon: safeIcon, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const handleDeleteCategory = async (id: string, fallbackCategoryId?: string) => {
    const target = categoryMap[id];
    if (!target) return;

    const isRoot = target.parentId === '';
    if (user) {
      await apiClient.deleteCategory(id, fallbackCategoryId);
      if (isRoot && sharedByCategoryId[id]) {
        const shareToDelete = sharedByCategoryId[id].id;
        setSharedCategories((prev) => prev.filter((s) => s.id !== shareToDelete));
      }
    }

    if (isRoot) {
      setBookmarks((prev) =>
        fallbackCategoryId
          ? prev.map((b) =>
              b.categoryId === id
                ? { ...b, categoryId: fallbackCategoryId, subcategoryId: '' }
                : b
            )
          : prev.filter((b) => b.categoryId !== id)
      );
      setCategories((prev) =>
        prev.filter((c) => c.id !== id && c.parentId !== id)
      );
    } else {
      setBookmarks((prev) =>
        prev.map((b) => (b.subcategoryId === id ? { ...b, subcategoryId: '' } : b))
      );
      setCategories((prev) => prev.filter((c) => c.id !== id));
    }

    if (selectedCategoryId === id) {
      setSelectedCategoryId('all');
      setSelectedSubcategoryId('all');
    }
    if (selectedSubcategoryId === id) {
      setSelectedSubcategoryId('all');
    }
  };

  // Update Settings Handler
  const handleUpdateSettings = async (partial: Partial<UserSettings>) => {
    const nextSettings: UserSettings = {
      ...settings,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    setSettings(nextSettings);

    if (user) {
      await apiClient.updateSettings({
        themeMode: nextSettings.themeMode || 'dark',
        primaryColor: nextSettings.primaryColor.slice(0, 32),
        glassIntensity: nextSettings.glassIntensity,
        cardDensity: nextSettings.cardDensity,
      });
    }
  };

  // Public Read-Only Category Share Handlers
  const handlePublishOrUpdateShare = async (
    category: CategoryItem
  ): Promise<SharedCategoryRecord> => {
    if (!user) {
      throw new Error('Please sign in with Google to generate a public share link.');
    }

    const safeCatName = category.name.trim().slice(0, 80) || 'Shared Collection';
    const safeCatIcon = /^[a-zA-Z0-9_\-]+$/.test(category.icon || '')
      ? category.icon.slice(0, 40)
      : 'bookmark';

    const childSubs = (subcategoriesByParent[category.id] || [])
      .slice(0, 100)
      .map((sub, idx) => ({
        id: sub.id,
        name: sub.name.trim().slice(0, 80) || 'Subcategory',
        icon: /^[a-zA-Z0-9_\-]+$/.test(sub.icon || '')
          ? sub.icon.slice(0, 40)
          : 'bookmark',
        order: Number.isFinite(sub.order) ? sub.order : idx,
      }));

    const validSubIdSet = new Set(childSubs.map((s) => s.id));

    const catBookmarks = bookmarks
      .filter(
        (b) =>
          b.categoryId === category.id &&
          /^https?:\/\/.+$/.test(b.url || '') &&
          b.url.length >= 4
      )
      .slice(0, 500)
      .map((bm) => ({
        title: (bm.title || 'Saved Website').trim().slice(0, 120) || 'Saved Website',
        url: bm.url.slice(0, 500),
        description: (bm.description || '').slice(0, 400),
        subcategoryId:
          bm.subcategoryId && validSubIdSet.has(bm.subcategoryId)
            ? bm.subcategoryId
            : '',
        isFavorite: Boolean(bm.isFavorite),
      }));

    const existing = sharedByCategoryId[category.id];
    const saved = await apiClient.publishOrUpdateShare({
      existingShareId: existing?.id,
      categoryId: category.id,
      categoryName: safeCatName,
      categoryIcon: safeCatIcon,
      subcategories: childSubs,
      bookmarks: catBookmarks,
    });

    setSharedCategories((prev) =>
      existing
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved]
    );

    if (!existing) {
      trackEvent('share_category', {
        category_id: category.id,
        bookmark_count: catBookmarks.length,
      });
    }

    return saved;
  };

  const handleRevokeShare = async (shareId: string): Promise<void> => {
    if (!user) return;
    await apiClient.revokeShare(shareId);
    setSharedCategories((prev) => prev.filter((s) => s.id !== shareId));
  };

  const handleExitShareView = () => {
    try {
      window.history.pushState({}, '', window.location.pathname);
    } catch {
      // ignore
    }
    setActiveShareId(null);
  };

  const handleOpenSharePreview = (shareId: string) => {
    setSharingCategory(null);
    try {
      window.history.pushState(
        {},
        '',
        `${window.location.pathname}?share=${encodeURIComponent(shareId)}`
      );
    } catch {
      // ignore
    }
    setActiveShareId(shareId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Drag and Drop & Hover-Hold Auto-Expand Handlers
  const clearHoldExpandTimer = () => {
    if (holdExpandTimerRef.current !== null) {
      window.clearTimeout(holdExpandTimerRef.current);
      holdExpandTimerRef.current = null;
    }
    holdExpandCurrentIdRef.current = null;
    setHoldExpandTargetId(null);
  };

  const scheduleHoldExpand = (catId: string, alsoExpandSidebar = false) => {
    if (draggedCategoryId === catId) return;
    const alreadyExpanded = Boolean(expandedCategories[catId]) && (!alsoExpandSidebar || isSidebarExpanded);
    if (alreadyExpanded) return;
    if (holdExpandCurrentIdRef.current === catId) return;

    clearHoldExpandTimer();
    holdExpandCurrentIdRef.current = catId;
    setHoldExpandTargetId(catId);

    holdExpandTimerRef.current = window.setTimeout(() => {
      if (alsoExpandSidebar) {
        setIsSidebarExpanded(true);
      }
      setExpandedCategories((prev) => ({
        ...prev,
        [catId]: true,
      }));
      holdExpandTimerRef.current = null;
      holdExpandCurrentIdRef.current = null;
      setHoldExpandTargetId(null);
    }, 520);
  };

  const updateCategoryDropStateStable = (
    targetId: string,
    position: 'before' | 'inside' | 'after'
  ) => {
    setCategoryDropState((prev) => {
      if (prev && prev.targetId === targetId && prev.position === position) {
        return prev;
      }
      return { targetId, position };
    });
  };

  const computeDropPosition = (
    e: React.DragEvent<HTMLElement>,
    allowInside: boolean
  ): 'before' | 'inside' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const ratio = rect.height > 0 ? offsetY / rect.height : 0.5;
    if (allowInside) {
      // If the dragged category itself already has child subcategories, prioritize reordering above/below
      const draggedHasSubs =
        draggedCategoryId &&
        (subcategoriesByParent[draggedCategoryId]?.length ?? 0) > 0;
      if (draggedHasSubs) {
        return ratio < 0.5 ? 'before' : 'after';
      }
      if (ratio < 0.36) return 'before';
      if (ratio > 0.64) return 'after';
      return 'inside';
    }
    return ratio < 0.5 ? 'before' : 'after';
  };

  const handleDropOnCategory = async (targetCatId: string, targetSubId = '') => {
    clearHoldExpandTimer();
    setDragOverTarget(null);
    setCategoryDropState(null);
    if (!draggedBookmarkId) return;
    await handleMoveWebsites([draggedBookmarkId], targetCatId, targetSubId);
    setDraggedBookmarkId(null);
  };

  const handleCategoryTreeDrop = async (
    targetId: string,
    position: 'before' | 'inside' | 'after'
  ) => {
    clearHoldExpandTimer();
    setCategoryDropState(null);
    setDragOverTarget(null);

    // If a website bookmark is being dragged, route to website move
    if (draggedBookmarkId && !draggedCategoryId) {
      const targetObj = categoryMap[targetId];
      if (!targetObj) return;
      if (targetObj.parentId === '') {
        await handleDropOnCategory(targetObj.id, '');
      } else {
        await handleDropOnCategory(targetObj.parentId, targetObj.id);
      }
      return;
    }

    if (!draggedCategoryId || draggedCategoryId === targetId) {
      setDraggedCategoryId(null);
      return;
    }

    const draggedCat = categoryMap[draggedCategoryId];
    const targetCat = categoryMap[targetId];
    if (!draggedCat || !targetCat) {
      setDraggedCategoryId(null);
      return;
    }

    // Prevent dropping a root category inside one of its own subcategories
    if (targetCat.parentId === draggedCat.id) {
      setDraggedCategoryId(null);
      return;
    }

    const draggedId = draggedCat.id;
    setDraggedCategoryId(null);

    // Determine new parentId for the dragged category
    let newParentId = '';
    if (position === 'inside') {
      // Nest inside target root category (or target subcategory's parent)
      newParentId = targetCat.parentId === '' ? targetCat.id : targetCat.parentId;
    } else {
      // Placed 'before' or 'after' targetCat -> shares targetCat's parentId
      newParentId = targetCat.parentId;
    }

    if (newParentId === draggedId) return;

    // Build the updated sibling list under newParentId
    const currentSiblings = categories
      .filter((c) => c.parentId === newParentId && c.id !== draggedId)
      .sort((a, b) => a.order - b.order);

    let insertIndex = currentSiblings.length;
    if (position === 'before' || position === 'after') {
      const targetIndex = currentSiblings.findIndex((c) => c.id === targetCat.id);
      if (targetIndex !== -1) {
        insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      }
    }

    const updatedDragged: CategoryItem = {
      ...draggedCat,
      parentId: newParentId,
      updatedAt: new Date().toISOString(),
    };

    const reorderedSiblings = [
      ...currentSiblings.slice(0, insertIndex),
      updatedDragged,
      ...currentSiblings.slice(insertIndex),
    ].map((item, idx) => ({
      ...item,
      order: idx,
    }));

    // If a root category had child subcategories and is now becoming a subcategory of newParentId,
    // move its child subcategories to newParentId as well so 2-level hierarchy remains valid
    const childSubsToMove =
      draggedCat.parentId === '' && newParentId !== ''
        ? categories.filter((c) => c.parentId === draggedId)
        : [];

    // Also update bookmarks if a root category became a subcategory or a subcategory became a root category
    const bookmarksToUpdate: { id: string; categoryId: string; subcategoryId: string }[] = [];
    if (draggedCat.parentId === '' && newParentId !== '') {
      for (const bm of bookmarks) {
        if (bm.categoryId === draggedId) {
          bookmarksToUpdate.push({
            id: bm.id,
            categoryId: newParentId,
            subcategoryId: bm.subcategoryId || draggedId,
          });
        }
      }
    } else if (draggedCat.parentId !== '' && newParentId === '') {
      for (const bm of bookmarks) {
        if (bm.subcategoryId === draggedId) {
          bookmarksToUpdate.push({
            id: bm.id,
            categoryId: draggedId,
            subcategoryId: '',
          });
        }
      }
    } else if (
      draggedCat.parentId !== '' &&
      newParentId !== '' &&
      draggedCat.parentId !== newParentId
    ) {
      for (const bm of bookmarks) {
        if (bm.subcategoryId === draggedId) {
          bookmarksToUpdate.push({
            id: bm.id,
            categoryId: newParentId,
            subcategoryId: draggedId,
          });
        }
      }
    }

    if (newParentId !== '') {
      setExpandedCategories((prev) => ({
        ...prev,
        [newParentId]: true,
      }));
    }

    // Optimistic local state update for instant UI feedback without flicker
    const siblingMap = new Map(reorderedSiblings.map((s) => [s.id, s]));
    const childSubIds = new Set(childSubsToMove.map((c) => c.id));
    let nextExtraOrder = reorderedSiblings.length;

    setCategories((prev) =>
      prev.map((c) => {
        if (siblingMap.has(c.id)) {
          return siblingMap.get(c.id)!;
        }
        if (childSubIds.has(c.id)) {
          return {
            ...c,
            parentId: newParentId,
            order: nextExtraOrder++,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );

    if (bookmarksToUpdate.length > 0) {
      const bmMap = new Map(bookmarksToUpdate.map((b) => [b.id, b]));
      setBookmarks((prev) =>
        prev.map((b) => {
          const upd = bmMap.get(b.id);
          return upd
            ? {
                ...b,
                categoryId: upd.categoryId,
                subcategoryId: upd.subcategoryId,
                updatedAt: new Date().toISOString(),
              }
            : b;
        })
      );
    }

    // Persist atomically to Supabase PostgreSQL (transactional RPC)
    if (user) {
      let extraIdx = reorderedSiblings.length;
      await apiClient.reorderCategoryTree({
        draggedId,
        newParentId,
        reorderedSiblings: reorderedSiblings.map((sib) => ({
          id: sib.id,
          order: sib.order,
        })),
        childSubsToMove: childSubsToMove.map((childSub) => ({
          id: childSub.id,
          order: extraIdx++,
        })),
        bookmarksToUpdate,
      });
    }
  };

  const toggleBulkSelect = (id: string, shiftKey = false) => {
    setConfirmBulkDelete(false);

    if (shiftKey && lastSelectedIdRef.current) {
      const startIndex = filteredBookmarks.findIndex(
        (b) => b.id === lastSelectedIdRef.current
      );
      const endIndex = filteredBookmarks.findIndex((b) => b.id === id);
      if (startIndex !== -1 && endIndex !== -1) {
        const [from, to] =
          startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = filteredBookmarks.slice(from, to + 1).map((b) => b.id);
        setSelectedBookmarkIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
        lastSelectedIdRef.current = id;
        return;
      }
    }

    lastSelectedIdRef.current = id;
    setSelectedBookmarkIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 1500);
  };

  const activeCategoryObj =
    selectedCategoryId !== 'all' ? categoryMap[selectedCategoryId] : null;
  const activeSubcategoryObj =
    selectedSubcategoryId !== 'all' ? categoryMap[selectedSubcategoryId] : null;
  const activeSubcategoriesList =
    selectedCategoryId !== 'all' ? subcategoriesByParent[selectedCategoryId] || [] : [];

  const isLightMode = (settings.themeMode || 'dark') === 'light';

  if (activeShareId) {
    return (
      <>
        <Suspense fallback={null}>
          <SharedCollectionView
            shareId={activeShareId}
            themeMode={settings.themeMode || 'dark'}
            onToggleThemeMode={() =>
              handleUpdateSettings({
                themeMode: (settings.themeMode || 'dark') === 'light' ? 'dark' : 'light',
              })
            }
            onExitShareView={handleExitShareView}
            onPreviewBookmark={(bm) => setPreviewingBookmark(bm)}
          />
        </Suspense>
        <Deferred when={previewingBookmark !== null}>
          <WebsitePreviewModal
            bookmark={previewingBookmark}
            category={null}
            subcategory={null}
            onClose={() => setPreviewingBookmark(null)}
          />
        </Deferred>
      </>
    );
  }

  const signInLoadingStage: SignInLoadingStage | null =
    !authReady && returningFromSignIn
      ? 'signing-in'
      : user && syncGateStatus === 'checking'
      ? localBookmarksRef.current.length > 0 ||
        localCategoriesRef.current.length > 0 ||
        localQuickShortcutsRef.current.length > 0
        ? 'syncing'
        : 'loading'
      : user && cloudLoading
      ? 'loading'
      : null;

  return (
    <div
      style={{ backgroundColor: isLightMode ? '#F1F5F9' : '#070B14' }}
      className={`min-h-screen transition-colors duration-300 ${
        isLightMode ? 'bg-[#F1F5F9] text-slate-900' : 'bg-[#070B14] text-slate-100'
      } accent-glow-bg flex flex-col pb-16 lg:pb-0`}
    >
      {/* Top Navigation Bar with Creative MyFav Logo & Right-Aligned Menu */}
      <header className="sticky top-0 z-30 h-14 lg:h-16 glass-surface border-b border-white/8 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Creative MyFav Logo & Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('all');
            setSelectedCategoryId('all');
            setSelectedSubcategoryId('all');
          }}
          className="flex items-center whitespace-nowrap shrink-0"
        >
          <MyFavLogo size="md" />
        </a>

        {/* Right-Aligned Top Navigation Menu (Main Page, Categories, Settings) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300 ml-auto">
          {liveSyncToast && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>{liveSyncToast}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveView('all');
              setSelectedCategoryId('all');
              setSelectedSubcategoryId('all');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 flex items-center gap-2 ${
              (activeView === 'all' || activeView === 'favorites') && selectedCategoryId === 'all'
                ? 'text-white border-b-2 border-[var(--accent-primary)]'
                : ''
            }`}
          >
            <Bookmark
              className={`w-4 h-4 shrink-0 ${
                (activeView === 'all' || activeView === 'favorites') && selectedCategoryId === 'all'
                  ? 'accent-text'
                  : 'text-slate-400'
              }`}
            />
            <span>Main Page</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('categories');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 flex items-center gap-2 ${
              activeView === 'categories'
                ? 'text-white border-b-2 border-[var(--accent-primary)]'
                : ''
            }`}
          >
            <Layers
              className={`w-4 h-4 shrink-0 ${
                activeView === 'categories' ? 'accent-text' : 'text-slate-400'
              }`}
            />
            <span>Categories</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('settings');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 flex items-center gap-2 ${
              activeView === 'settings' || activeView === 'chrome-sync'
                ? 'text-white border-b-2 border-[var(--accent-primary)]'
                : ''
            }`}
          >
            <Settings
              className={`w-4 h-4 shrink-0 ${
                activeView === 'settings' || activeView === 'chrome-sync'
                  ? 'accent-text'
                  : 'text-slate-400'
              }`}
            />
            <span>Settings</span>
          </button>
        </nav>
      </header>

      {/* Main 1440px Multi-Column Workspace */}
      <div className="max-w-[1440px] w-full mx-auto flex-1 flex flex-col lg:flex-row gap-6 px-4 sm:px-6 lg:px-8 py-5 lg:py-7">
        {/* Left Glassmorphic Category Sidebar (Desktop - Auto Collapsed by Default with Expand/Collapse Controls) */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 glass-surface rounded-2xl h-[calc(100vh-6.75rem)] sticky top-22 justify-between overflow-hidden transition-all duration-300 ${
            isSidebarExpanded ? 'w-[288px] p-4' : 'w-[76px] p-2.5'
          }`}
        >
          {isSidebarExpanded ? (
            /* EXPANDED VIEW */
            <>
              <div className="flex flex-col min-h-0 flex-1">
                {/* Header with Add & Collapse Buttons */}
                <div className="flex items-center justify-between pb-3 border-b border-white/8">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      Categories ({rootCategories.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('categories');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      title="Add or Manage Categories"
                      className="text-xs accent-text hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>

                  {/* Collapse Button */}
                  <button
                    type="button"
                    onClick={() => setIsSidebarExpanded(false)}
                    title="Collapse to icons"
                    aria-label="Collapse Categories Panel"
                    className="w-7.5 h-7.5 rounded-xl bg-slate-950/60 border border-white/10 hover:border-[var(--accent-primary)]/40 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  >
                    <PanelLeftClose className="w-4 h-4 accent-text" />
                  </button>
                </div>

                {/* Scrollable Category & Subcategory Tree */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pt-2.5">
                  {/* Main Page Navigation Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('all');
                      setSelectedCategoryId('all');
                      setSelectedSubcategoryId('all');
                    }}
                    className={`w-full group relative flex items-center justify-between rounded-xl px-2 py-1.5 transition-all duration-200 cursor-pointer ${
                      activeView === 'all' && selectedCategoryId === 'all'
                        ? 'accent-subtle-bg text-white border accent-border shadow-xs'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7.5 h-7.5 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          activeView === 'all' && selectedCategoryId === 'all'
                            ? 'accent-bg text-white shadow-sm'
                            : 'bg-slate-950/70 border border-white/10 accent-text group-hover:border-[var(--accent-primary)]/40'
                        }`}
                      >
                        <Bookmark className="w-4 h-4" strokeWidth={2.1} />
                      </span>
                      <span className="text-xs font-semibold truncate">Main Page</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-mono-tabular text-slate-400">
                      {bookmarks.length}
                    </span>
                  </button>

                  {/* Pinned Navigation Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('favorites');
                      setSelectedCategoryId('all');
                      setSelectedSubcategoryId('all');
                    }}
                    className={`w-full group relative flex items-center justify-between rounded-xl px-2 py-1.5 transition-all duration-200 cursor-pointer ${
                      activeView === 'favorites'
                        ? 'accent-subtle-bg text-white border accent-border shadow-xs'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7.5 h-7.5 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          activeView === 'favorites'
                            ? 'accent-bg text-white shadow-sm'
                            : 'bg-slate-950/70 border border-white/10 text-amber-400 group-hover:border-amber-400/40'
                        }`}
                      >
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={2.1} />
                      </span>
                      <span className="text-xs font-semibold truncate">Pinned</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-mono-tabular text-slate-400">
                      {bookmarks.filter((b) => b.isFavorite).length}
                    </span>
                  </button>

                  <div className="my-1.5 border-b border-white/8" />

                  {rootCategories.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-center space-y-2 mt-1">
                      <p className="text-[11px] text-slate-400">
                        No categories yet. Sync your Chrome bookmarks or add a category.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveView('chrome-sync')}
                        className="w-full py-1.5 px-2.5 rounded-lg accent-subtle-bg accent-text text-[11px] font-semibold cursor-pointer"
                      >
                        Sync Chrome
                      </button>
                    </div>
                  ) : (
                    rootCategories.map((cat) => {
                      const subs = subcategoriesByParent[cat.id] || [];
                      const isSelectedCat =
                        activeView === 'all' &&
                        selectedCategoryId === cat.id &&
                        selectedSubcategoryId === 'all';
                      const isExpanded = Boolean(expandedCategories[cat.id]);
                      const catCount = bookmarks.filter((b) => b.categoryId === cat.id).length;
                      const isBeingDragged = draggedCategoryId === cat.id;
                      const dropOnThisCat =
                        categoryDropState?.targetId === cat.id ? categoryDropState.position : null;
                      const isWebsiteDragTarget =
                        !draggedCategoryId && dragOverTarget === `cat_${cat.id}`;
                      const isHoldingToExpand = holdExpandTargetId === cat.id;

                      const isAnyDragging = Boolean(draggedCategoryId || draggedBookmarkId);

                      return (
                        <div
                          key={cat.id}
                          className={`relative space-y-1 ${
                            isBeingDragged ? 'opacity-40' : ''
                          }`}
                        >
                          <div
                            draggable={inlineSubParentId !== cat.id}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', cat.id);
                              e.dataTransfer.effectAllowed = 'move';
                              // Defer state update slightly so browser captures clean drag image
                              window.requestAnimationFrame(() => {
                                setDraggedCategoryId(cat.id);
                              });
                            }}
                            onDragEnd={() => {
                              clearHoldExpandTimer();
                              setDraggedCategoryId(null);
                              setCategoryDropState(null);
                              setDragOverTarget(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              if (draggedCategoryId) {
                                if (draggedCategoryId === cat.id) return;
                                const pos = computeDropPosition(e, true);
                                updateCategoryDropStateStable(cat.id, pos);
                                if (pos === 'inside' && !isExpanded) {
                                  scheduleHoldExpand(cat.id, false);
                                }
                              } else if (draggedBookmarkId) {
                                if (dragOverTarget !== `cat_${cat.id}`) {
                                  setDragOverTarget(`cat_${cat.id}`);
                                }
                                if (!isExpanded) {
                                  scheduleHoldExpand(cat.id, false);
                                }
                              }
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              const related = e.relatedTarget as Node | null;
                              if (related && e.currentTarget.contains(related)) {
                                return;
                              }
                              if (holdExpandCurrentIdRef.current === cat.id) {
                                clearHoldExpandTimer();
                              }
                              if (categoryDropState?.targetId === cat.id) {
                                setCategoryDropState(null);
                              }
                              if (dragOverTarget === `cat_${cat.id}`) {
                                setDragOverTarget(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (draggedCategoryId) {
                                const pos =
                                  categoryDropState?.targetId === cat.id
                                    ? categoryDropState.position
                                    : computeDropPosition(e, true);
                                handleCategoryTreeDrop(cat.id, pos);
                              } else {
                                handleDropOnCategory(cat.id, '');
                              }
                            }}
                            className={`group relative flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors duration-150 ${
                              isAnyDragging ? '[&_*]:pointer-events-none' : ''
                            } ${
                              dropOnThisCat === 'inside' || isWebsiteDragTarget
                                ? 'accent-subtle-bg ring-2 ring-[var(--accent-primary)] shadow-lg'
                                : dropOnThisCat === 'before' || dropOnThisCat === 'after'
                                ? 'bg-white/[0.06] border border-white/15'
                                : isSelectedCat
                                ? 'accent-subtle-bg text-white border accent-border shadow-xs'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                            }`}
                          >
                            {/* Zero-Layout-Shift "Move Above" Overlay Indicator */}
                            {dropOnThisCat === 'before' && (
                              <div className="pointer-events-none absolute -top-[5px] left-1 right-1 z-30 flex items-center gap-1.5">
                                <div className="h-[3px] flex-1 rounded-full accent-bg shadow-[0_0_10px_var(--accent-primary)]" />
                                <span className="px-1.5 py-0.2 rounded accent-bg text-white text-[9px] font-bold uppercase tracking-wider shadow-sm">
                                  ↑ Above
                                </span>
                              </div>
                            )}

                            {/* Zero-Layout-Shift "Move Below" Overlay Indicator */}
                            {dropOnThisCat === 'after' && (
                              <div className="pointer-events-none absolute -bottom-[5px] left-1 right-1 z-30 flex items-center gap-1.5">
                                <div className="h-[3px] flex-1 rounded-full accent-bg shadow-[0_0_10px_var(--accent-primary)]" />
                                <span className="px-1.5 py-0.2 rounded accent-bg text-white text-[9px] font-bold uppercase tracking-wider shadow-sm">
                                  ↓ Below
                                </span>
                              </div>
                            )}

                            {/* Drag Grip + Enhanced Category Icon Badge + Label */}
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                              <span
                                title="Drag to reorder or move inside another folder"
                                className="text-slate-500 opacity-40 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveView('all');
                                  setSelectedCategoryId(cat.id);
                                  setSelectedSubcategoryId('all');
                                  setExpandedCategories((prev) => ({
                                    ...prev,
                                    [cat.id]: true,
                                  }));
                                }}
                                className="flex-1 flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
                              >
                                <span
                                  className={`w-7.5 h-7.5 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-150 ${
                                    dropOnThisCat === 'inside'
                                      ? 'accent-bg text-white shadow-md'
                                      : isSelectedCat
                                      ? 'accent-bg text-white shadow-sm'
                                      : 'bg-slate-950/70 border border-white/10 accent-text group-hover:border-[var(--accent-primary)]/40'
                                  }`}
                                >
                                  <CategoryIcon
                                    name={cat.icon}
                                    categoryName={cat.name}
                                    className="w-4 h-4"
                                    strokeWidth={2.1}
                                  />
                                </span>
                                <span className="text-xs font-semibold truncate">{cat.name}</span>
                              </button>
                            </div>

                            {/* Floating Badge when Moving Inside Folder or Holding to Expand */}
                            {dropOnThisCat === 'inside' && (
                              <span className="pointer-events-none px-1.5 py-0.5 rounded-md accent-bg text-white text-[9px] font-bold uppercase tracking-wider shrink-0 mr-1 shadow-sm">
                                ↳ Inside
                              </span>
                            )}
                            {isHoldingToExpand && !isExpanded && (
                              <span className="pointer-events-none px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-semibold shrink-0 mr-1">
                                Opening...
                              </span>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-mono-tabular text-slate-400">
                                {catCount}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCategories((prev) => ({
                                    ...prev,
                                    [cat.id]: !prev[cat.id],
                                  }))
                                }
                                aria-label={`Toggle ${cat.name} subcategories`}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer ${
                                  isHoldingToExpand ? 'ring-2 ring-[var(--accent-primary)]' : ''
                                }`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Nested Subcategories */}
                          {isExpanded && (
                            <div className="pl-4 pr-1 py-1 space-y-1 border-l border-white/10 ml-4">
                              {subs.map((sub) => {
                                const isSelectedSub =
                                  activeView === 'all' &&
                                  selectedSubcategoryId === sub.id;
                                const subCount = bookmarks.filter(
                                  (b) => b.subcategoryId === sub.id
                                ).length;
                                const isSubBeingDragged = draggedCategoryId === sub.id;
                                const dropOnThisSub =
                                  categoryDropState?.targetId === sub.id
                                    ? categoryDropState.position
                                    : null;
                                const isSubWebsiteDragTarget =
                                  !draggedCategoryId && dragOverTarget === `sub_${sub.id}`;

                                return (
                                  <div
                                    key={sub.id}
                                    className={`relative ${
                                      isSubBeingDragged ? 'opacity-40' : ''
                                    }`}
                                  >
                                    <div
                                      draggable
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        e.dataTransfer.setData('text/plain', sub.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        window.requestAnimationFrame(() => {
                                          setDraggedCategoryId(sub.id);
                                        });
                                      }}
                                      onDragEnd={() => {
                                        clearHoldExpandTimer();
                                        setDraggedCategoryId(null);
                                        setCategoryDropState(null);
                                        setDragOverTarget(null);
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (draggedCategoryId) {
                                          if (draggedCategoryId === sub.id) return;
                                          const pos = computeDropPosition(e, false);
                                          updateCategoryDropStateStable(sub.id, pos);
                                        } else if (draggedBookmarkId) {
                                          if (dragOverTarget !== `sub_${sub.id}`) {
                                            setDragOverTarget(`sub_${sub.id}`);
                                          }
                                        }
                                      }}
                                      onDragLeave={(e) => {
                                        e.stopPropagation();
                                        const related = e.relatedTarget as Node | null;
                                        if (related && e.currentTarget.contains(related)) {
                                          return;
                                        }
                                        if (categoryDropState?.targetId === sub.id) {
                                          setCategoryDropState(null);
                                        }
                                        if (dragOverTarget === `sub_${sub.id}`) {
                                          setDragOverTarget(null);
                                        }
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (draggedCategoryId) {
                                          const pos =
                                            categoryDropState?.targetId === sub.id
                                              ? categoryDropState.position
                                              : computeDropPosition(e, false);
                                          handleCategoryTreeDrop(sub.id, pos);
                                        } else {
                                          handleDropOnCategory(cat.id, sub.id);
                                        }
                                      }}
                                      onClick={() => {
                                        setActiveView('all');
                                        setSelectedCategoryId(cat.id);
                                        setSelectedSubcategoryId(sub.id);
                                      }}
                                      className={`group/sub relative w-full px-2 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors duration-150 cursor-pointer ${
                                        isAnyDragging ? '[&_*]:pointer-events-none' : ''
                                      } ${
                                        isSubWebsiteDragTarget
                                          ? 'accent-subtle-bg ring-1 ring-[var(--accent-primary)] text-white'
                                          : dropOnThisSub === 'before' || dropOnThisSub === 'after'
                                          ? 'bg-white/[0.06]'
                                          : isSelectedSub
                                          ? 'accent-bg text-white font-medium shadow-xs'
                                          : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                                      }`}
                                    >
                                      {dropOnThisSub === 'before' && (
                                        <div className="pointer-events-none absolute -top-[4px] left-1 right-1 z-30 flex items-center gap-1">
                                          <div className="h-[2px] flex-1 rounded-full accent-bg shadow-[0_0_8px_var(--accent-primary)]" />
                                          <span className="px-1 py-0.2 rounded accent-bg text-white text-[8px] font-bold uppercase">
                                            ↑ Above
                                          </span>
                                        </div>
                                      )}

                                      {dropOnThisSub === 'after' && (
                                        <div className="pointer-events-none absolute -bottom-[4px] left-1 right-1 z-30 flex items-center gap-1">
                                          <div className="h-[2px] flex-1 rounded-full accent-bg shadow-[0_0_8px_var(--accent-primary)]" />
                                          <span className="px-1 py-0.2 rounded accent-bg text-white text-[8px] font-bold uppercase">
                                            ↓ Below
                                          </span>
                                        </div>
                                      )}

                                      <span className="flex items-center gap-1.5 min-w-0 truncate">
                                        <GripVertical className="w-3 h-3 opacity-35 group-hover/sub:opacity-100 cursor-grab active:cursor-grabbing shrink-0" />
                                        <span
                                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                            isSelectedSub
                                              ? 'bg-white/20 text-white'
                                              : 'bg-slate-950/60 border border-white/8 accent-text'
                                          }`}
                                        >
                                          <CategoryIcon
                                            name={sub.icon}
                                            categoryName={sub.name}
                                            className="w-3 h-3"
                                          />
                                        </span>
                                        <span className="truncate">{sub.name}</span>
                                      </span>
                                      <span
                                        className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded ${
                                          isSelectedSub ? 'bg-white/20 text-white' : 'text-slate-500'
                                        }`}
                                      >
                                        {subCount}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Quick Inline Add Subcategory */}
                              {inlineSubParentId === cat.id ? (
                                <form
                                  onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (inlineSubName.trim()) {
                                      await handleCreateCategory(
                                        inlineSubName,
                                        cat.icon,
                                        cat.id
                                      );
                                      setInlineSubName('');
                                      setInlineSubParentId(null);
                                    }
                                  }}
                                  className="flex items-center gap-1 pt-1"
                                >
                                  <input
                                    type="text"
                                    value={inlineSubName}
                                    onChange={(e) => setInlineSubName(e.target.value)}
                                    placeholder="Subcategory..."
                                    maxLength={80}
                                    autoFocus
                                    className="w-full px-2 py-1 rounded-md bg-slate-950 border border-white/15 text-[11px] text-slate-100 focus:outline-none focus:border-[var(--accent-primary)]"
                                  />
                                  <button
                                    type="submit"
                                    className="px-2 py-1 rounded-md accent-bg text-white text-[11px] font-medium cursor-pointer shrink-0"
                                  >
                                    Add
                                  </button>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInlineSubParentId(cat.id);
                                    setInlineSubName('');
                                  }}
                                  className="w-full px-2.5 py-1 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Subcategory</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Sidebar Footer: Cloud Sync */}
              <div className="pt-3.5 border-t border-white/8">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/8 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Cloud className="w-4 h-4 accent-text shrink-0" />
                    <span className="text-[11px] text-slate-300 truncate">
                      {user ? user.email || 'Cloud Synced' : 'Local Vault'}
                    </span>
                  </div>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="text-[11px] text-slate-400 hover:text-white cursor-pointer shrink-0"
                    >
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAuthPage('login')}
                      className="text-[11px] font-semibold accent-text hover:underline cursor-pointer shrink-0"
                    >
                      Log in
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* COLLAPSED VIEW (Auto Closed by Default with Enhanced Tactile Category Icons) */
            <>
              <div className="flex flex-col items-center min-h-0 flex-1">
                {/* Expand Button */}
                <div className="pb-2.5 border-b border-white/8 w-full flex justify-center">
                  <button
                    type="button"
                    onClick={() => setIsSidebarExpanded(true)}
                    title="Expand Categories Panel"
                    aria-label="Expand Categories Panel"
                    className="w-11 h-11 rounded-2xl bg-slate-950/60 border border-white/10 hover:border-[var(--accent-primary)]/40 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer group shadow-xs"
                  >
                    <PanelLeftOpen className="w-5 h-5 accent-text group-hover:scale-110 transition-transform" />
                  </button>
                </div>

                {/* Vertical Enhanced Category Icons List */}
                <div className="flex-1 overflow-y-auto space-y-2.5 py-3 w-full flex flex-col items-center no-scrollbar">
                  {/* Main Page Icon */}
                  <div className="relative flex flex-col items-center w-full">
                    {activeView === 'all' && selectedCategoryId === 'all' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full accent-bg shadow-[0_0_10px_var(--accent-primary)]" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('all');
                        setSelectedCategoryId('all');
                        setSelectedSubcategoryId('all');
                      }}
                      title={`Main Page (${bookmarks.length})`}
                      aria-label="Main Page"
                      className={`group/icon relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                        activeView === 'all' && selectedCategoryId === 'all'
                          ? 'accent-bg text-white shadow-[0_6px_16px_rgba(var(--accent-rgb),0.35)] scale-105'
                          : 'bg-slate-950/60 border border-white/10 text-slate-300 hover:border-[var(--accent-primary)]/45 hover:bg-white/10 hover:scale-105 shadow-xs'
                      }`}
                    >
                      <Bookmark
                        className={`w-[18px] h-[18px] transition-transform duration-200 group-hover/icon:scale-110 ${
                          activeView === 'all' && selectedCategoryId === 'all'
                            ? 'text-white'
                            : 'accent-text'
                        }`}
                        strokeWidth={2.1}
                      />
                      {bookmarks.length > 0 && (
                        <span
                          className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-bold font-mono-tabular flex items-center justify-center shadow-xs ${
                            activeView === 'all' && selectedCategoryId === 'all'
                              ? 'bg-slate-950 text-white border border-white/25'
                              : 'bg-slate-900 border border-white/15 text-slate-300'
                          }`}
                        >
                          {bookmarks.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Pinned Icon */}
                  <div className="relative flex flex-col items-center w-full">
                    {activeView === 'favorites' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full accent-bg shadow-[0_0_10px_var(--accent-primary)]" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('favorites');
                        setSelectedCategoryId('all');
                        setSelectedSubcategoryId('all');
                      }}
                      title={`Pinned Favorites (${bookmarks.filter((b) => b.isFavorite).length})`}
                      aria-label="Pinned Websites"
                      className={`group/icon relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                        activeView === 'favorites'
                          ? 'accent-bg text-white shadow-[0_6px_16px_rgba(var(--accent-rgb),0.35)] scale-105'
                          : 'bg-slate-950/60 border border-white/10 text-slate-300 hover:border-amber-400/45 hover:bg-white/10 hover:scale-105 shadow-xs'
                      }`}
                    >
                      <Star
                        className={`w-[18px] h-[18px] transition-transform duration-200 group-hover/icon:scale-110 ${
                          activeView === 'favorites'
                            ? 'fill-white text-white'
                            : 'fill-amber-400 text-amber-400'
                        }`}
                        strokeWidth={2.1}
                      />
                      {bookmarks.filter((b) => b.isFavorite).length > 0 && (
                        <span
                          className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-bold font-mono-tabular flex items-center justify-center shadow-xs ${
                            activeView === 'favorites'
                              ? 'bg-slate-950 text-white border border-white/25'
                              : 'bg-slate-900 border border-white/15 text-slate-300'
                          }`}
                        >
                          {bookmarks.filter((b) => b.isFavorite).length}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="w-8 my-1 border-b border-white/8" />

                  {rootCategories.map((cat) => {
                    const isSelectedCat =
                      activeView === 'all' && selectedCategoryId === cat.id;
                    const catCount = bookmarks.filter((b) => b.categoryId === cat.id).length;
                    const subCount = (subcategoriesByParent[cat.id] || []).length;
                    const isBeingDragged = draggedCategoryId === cat.id;
                    const dropOnThisIcon =
                      categoryDropState?.targetId === cat.id ? categoryDropState.position : null;
                    const isDragTarget =
                      (!draggedCategoryId && dragOverTarget === `cat_${cat.id}`) ||
                      dropOnThisIcon === 'inside';
                    const isHoldingToExpand = holdExpandTargetId === cat.id;

                    return (
                      <div key={cat.id} className="relative flex flex-col items-center w-full">
                        {dropOnThisIcon === 'before' && (
                          <div className="pointer-events-none absolute -top-1.5 w-8 h-1 rounded-full accent-bg shadow-[0_0_10px_var(--accent-primary)] z-30" />
                        )}

                        {/* Active Left Indicator Bar */}
                        {isSelectedCat && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full accent-bg shadow-[0_0_10px_var(--accent-primary)]" />
                        )}

                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', cat.id);
                            e.dataTransfer.effectAllowed = 'move';
                            window.requestAnimationFrame(() => {
                              setDraggedCategoryId(cat.id);
                            });
                          }}
                          onDragEnd={() => {
                            clearHoldExpandTimer();
                            setDraggedCategoryId(null);
                            setCategoryDropState(null);
                            setDragOverTarget(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (draggedCategoryId) {
                              if (draggedCategoryId === cat.id) return;
                              const pos = computeDropPosition(e, true);
                              updateCategoryDropStateStable(cat.id, pos);
                              if (pos === 'inside') {
                                scheduleHoldExpand(cat.id, true);
                              }
                            } else if (draggedBookmarkId) {
                              if (dragOverTarget !== `cat_${cat.id}`) {
                                setDragOverTarget(`cat_${cat.id}`);
                              }
                              scheduleHoldExpand(cat.id, true);
                            }
                          }}
                          onDragLeave={(e) => {
                            const related = e.relatedTarget as Node | null;
                            if (related && e.currentTarget.contains(related)) {
                              return;
                            }
                            if (holdExpandCurrentIdRef.current === cat.id) {
                              clearHoldExpandTimer();
                            }
                            if (categoryDropState?.targetId === cat.id) {
                              setCategoryDropState(null);
                            }
                            setDragOverTarget(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedCategoryId) {
                              const pos =
                                categoryDropState?.targetId === cat.id
                                  ? categoryDropState.position
                                  : computeDropPosition(e, true);
                              handleCategoryTreeDrop(cat.id, pos);
                            } else {
                              handleDropOnCategory(cat.id, '');
                            }
                          }}
                          onClick={() => {
                            setActiveView('all');
                            setSelectedCategoryId(cat.id);
                            setSelectedSubcategoryId('all');
                          }}
                          title={`${cat.name} (${catCount} websites${
                            subCount > 0 ? `, ${subCount} subcategories` : ''
                          }) — Click to filter or hold drag to expand`}
                          className={`group/icon relative w-11 h-11 rounded-2xl flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                            draggedCategoryId || draggedBookmarkId ? '[&_*]:pointer-events-none' : ''
                          } ${
                            isBeingDragged ? 'opacity-40' : ''
                          } ${
                            isHoldingToExpand
                              ? 'ring-2 ring-amber-400 accent-subtle-bg'
                              : isDragTarget
                              ? 'accent-subtle-bg ring-2 ring-[var(--accent-primary)] shadow-lg'
                              : isSelectedCat
                              ? 'accent-bg text-white shadow-[0_6px_16px_rgba(var(--accent-rgb),0.35)]'
                              : 'bg-slate-950/60 border border-white/10 text-slate-300 hover:border-[var(--accent-primary)]/45 hover:bg-white/10 shadow-xs'
                          }`}
                        >
                          <CategoryIcon
                            name={cat.icon}
                            categoryName={cat.name}
                            className={`w-[18px] h-[18px] transition-transform duration-200 group-hover/icon:scale-110 ${
                              isSelectedCat ? 'text-white' : 'accent-text'
                            }`}
                            strokeWidth={2.1}
                          />

                          {/* Website Count Badge */}
                          {catCount > 0 && (
                            <span
                              className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-bold font-mono-tabular flex items-center justify-center shadow-xs ${
                                isSelectedCat
                                  ? 'bg-slate-950 text-white border border-white/25'
                                  : 'bg-slate-900 border border-white/15 text-slate-300'
                              }`}
                            >
                              {catCount}
                            </span>
                          )}

                          {/* Subfolder Indicator Dot */}
                          {subCount > 0 && (
                            <span
                              className={`absolute bottom-1 w-1.5 h-1 rounded-full ${
                                isSelectedCat ? 'bg-white/90' : 'accent-bg opacity-80'
                              }`}
                            />
                          )}
                        </button>

                        {dropOnThisIcon === 'after' && (
                          <div className="pointer-events-none absolute -bottom-1.5 w-8 h-1 rounded-full accent-bg shadow-[0_0_10px_var(--accent-primary)] z-30" />
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('categories');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    title="Add or Manage Categories"
                    className="w-11 h-11 rounded-2xl bg-slate-950/40 border border-dashed border-white/15 hover:border-[var(--accent-primary)] text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer mt-1 group"
                  >
                    <FolderPlus className="w-4 h-4 accent-text group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Collapsed Footer: Cloud Icon */}
              <div className="pt-3 border-t border-white/8 w-full flex flex-col items-center">
                <button
                  type="button"
                  onClick={() =>
                    user ? void handleSignOut() : openAuthPage('login')
                  }
                  title={user ? `Signed in as ${user.email} (click to sign out)` : 'Log in to sync'}
                  className="w-11 h-11 rounded-2xl bg-slate-950/60 border border-white/10 hover:border-white/25 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Cloud className={`w-4 h-4 ${user ? 'accent-text' : 'text-slate-500'}`} />
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 space-y-5">
          {activeView === 'categories' ? (
            <Suspense fallback={<div className="glass-surface rounded-2xl h-64 flex items-center justify-center" role="status" aria-label="Loading">
                <div className="w-7 h-7 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin" />
              </div>}>
              <CategoriesPage
                onBackToDirectory={() => setActiveView('all')}
                onSelectCategoryInDirectory={(catId, subId) => {
                  setSelectedCategoryId(catId);
                  setSelectedSubcategoryId(subId || 'all');
                  setActiveView('all');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                categories={categories}
                bookmarks={bookmarks}
                sharedByCategoryId={sharedByCategoryId}
                onOpenShareModal={(cat) => setSharingCategory(cat)}
                onCreateCategory={async (name, icon, parentId) => {
                  await handleCreateCategory(name, icon, parentId);
                }}
                onUpdateCategory={handleUpdateCategory}
                onDeleteCategory={handleDeleteCategory}
                onClearAllCategoriesAndBookmarks={handleClearEntireWorkspace}
              />
            </Suspense>
          ) : activeView === 'settings' || activeView === 'chrome-sync' ? (
            <Suspense fallback={<div className="glass-surface rounded-2xl h-64 flex items-center justify-center" role="status" aria-label="Loading">
                <div className="w-7 h-7 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin" />
              </div>}>
              <SettingsPage
                onBackToDirectory={() => setActiveView('all')}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                user={user}
                onSignIn={async () => openAuthPage('login')}
                onSignOut={handleSignOut}
                onResetDefaults={handleClearEntireWorkspace}
                existingCategoryCount={categories.length}
                existingBookmarkCount={bookmarks.length}
                categories={categories}
                bookmarks={bookmarks}
                quickShortcuts={quickShortcuts}
                onImportExactPlan={handleImportExactChromePlan}
                onClearEntireWorkspace={handleClearEntireWorkspace}
                defaultTab={activeView === 'chrome-sync' ? 'sync' : 'appearance'}
                linkedChromeFileName={linkedChromeFileName}
                lastChromeSyncTime={lastChromeSyncTime}
                autoWatchChromeFile={autoWatchChromeFile}
                onToggleAutoWatchChromeFile={handleToggleAutoWatchChromeFile}
                onLinkLiveChromeFile={handleLinkLiveChromeFile}
                onRefreshLiveChromeFile={() => handleRefreshLiveChromeFile(true)}
                onUnlinkLiveChromeFile={handleUnlinkLiveChromeFile}
                onOpenImportModal={() => setIsChromeImportModalOpen(true)}
              />
            </Suspense>
          ) : (
            <>
              {/* Unified Top Header (matching Settings & Categories page header style) */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  {activeView === 'favorites' || selectedCategoryId !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('all');
                        setSelectedCategoryId('all');
                        setSelectedSubcategoryId('all');
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer mb-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Main Page</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                      <span>Directory</span>
                      <span>/</span>
                      <span className="text-slate-200">All Categories</span>
                    </div>
                  )}
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    {activeView === 'favorites'
                      ? 'Pinned Favorites'
                      : activeSubcategoryObj
                      ? activeSubcategoryObj.name
                      : activeCategoryObj
                      ? activeCategoryObj.name
                      : 'Personal Web Directory'}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    {activeView === 'favorites'
                      ? `Quick access to your ${filteredBookmarks.length} pinned websites.`
                      : activeSubcategoryObj && activeCategoryObj
                      ? `Browsing ${filteredBookmarks.length} saved websites in ${activeCategoryObj.name} / ${activeSubcategoryObj.name}.`
                      : activeCategoryObj
                      ? `Browsing ${filteredBookmarks.length} saved websites in ${activeCategoryObj.name}.`
                      : `Curate, search, and launch your ${bookmarks.length} saved websites across ${rootCategories.length} categories.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!user && (
                    <button
                      type="button"
                      onClick={() => openAuthPage('login')}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl accent-subtle-bg hover:bg-white/15 border accent-border accent-text text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Log in</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBookmark(null);
                      setIsBookmarkModalOpen(true);
                    }}
                    className="min-h-[38px] px-4 py-2 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-black/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Website</span>
                  </button>
                </div>
              </div>

              {/* Top Quick Access Shortcuts Bar (Icon + Name only, opens in new window, customizable icon) */}
              <section
                aria-label="Quick Access Shortcuts"
                className="glass-surface rounded-2xl p-3.5 sm:p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg accent-subtle-bg accent-text flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-semibold text-slate-200 tracking-tight truncate">
                      Quick Access
                    </h2>
                    {quickShortcuts.length > 0 && (
                      <span className="text-[11px] font-mono-tabular text-slate-400">
                        ({quickShortcuts.length})
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingShortcut(null);
                      setIsShortcutModalOpen(true);
                    }}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl accent-subtle-bg hover:bg-white/10 border accent-border accent-text text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Shortcut</span>
                  </button>
                </div>

                {quickShortcuts.length === 0 ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-dashed border-white/10">
                    <p className="text-xs text-slate-400">
                      Pin your favorite custom websites here as quick access cards for instant 1-click launch in a new window — with customizable icons.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingShortcut(null);
                        setIsShortcutModalOpen(true);
                      }}
                      className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 accent-text" />
                      <span>Choose Custom Sites</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-stretch gap-3 sm:gap-3.5 flex-wrap pt-0.5">
                    {quickShortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        draggable
                        onDragStart={() => setDraggedShortcutId(shortcut.id)}
                        onDragOver={(e) => {
                          if (draggedShortcutId && draggedShortcutId !== shortcut.id) {
                            e.preventDefault();
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedShortcutId && draggedShortcutId !== shortcut.id) {
                            handleReorderShortcuts(draggedShortcutId, shortcut.id);
                          }
                          setDraggedShortcutId(null);
                        }}
                        onDragEnd={() => setDraggedShortcutId(null)}
                        className={`group relative w-[104px] sm:w-[116px] rounded-2xl bg-slate-950/65 hover:bg-white/[0.08] border border-white/10 hover:border-[var(--accent-primary)]/45 hover:-translate-y-0.5 transition-all duration-200 shadow-sm ${
                          draggedShortcutId === shortcut.id ? 'opacity-40 scale-95' : ''
                        }`}
                      >
                        <a
                          href={shortcut.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${shortcut.title} in new window`}
                          className="w-full h-full flex flex-col items-center justify-center text-center p-3 sm:p-3.5 rounded-2xl text-slate-100 hover:text-[var(--accent-light)] transition-colors"
                        >
                          <QuickShortcutIcon
                            url={shortcut.url}
                            title={shortcut.title}
                            iconType={shortcut.iconType}
                            customIcon={shortcut.customIcon}
                            size="lg"
                          />
                          <span className="mt-2.5 text-xs sm:text-[13px] font-semibold truncate w-full px-0.5">
                            {shortcut.title}
                          </span>
                        </a>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingShortcut(shortcut);
                            setIsShortcutModalOpen(true);
                          }}
                          title="Change icon or edit shortcut"
                          aria-label={`Edit ${shortcut.title} shortcut or change icon`}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-slate-900/85 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center transition-all cursor-pointer shadow-xs"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setEditingShortcut(null);
                        setIsShortcutModalOpen(true);
                      }}
                      title="Add another custom website shortcut"
                      className="group w-[104px] sm:w-[116px] min-h-[100px] sm:min-h-[108px] p-3 rounded-2xl border border-dashed border-white/15 hover:border-[var(--accent-primary)]/50 bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer"
                    >
                      <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-slate-900/60 border border-white/10 group-hover:border-[var(--accent-primary)]/40 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                        <Plus className="w-5 h-5 accent-text" />
                      </div>
                      <span className="text-xs font-semibold">Add Site</span>
                    </button>
                  </div>
                )}
              </section>

              {/* Search & Sort Toolbar */}
              <section className="glass-surface rounded-2xl p-4 sm:p-5 space-y-4">
                {/* Search Input & Sort Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search saved websites by title, URL, category, or notes..."
                      className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Sort Toggle */}
                    <div className="flex items-center p-1 rounded-xl bg-slate-950/70 border border-white/10">
                      {(
                        [
                          { id: 'favorites', label: 'Pinned First' },
                          { id: 'alpha', label: 'A–Z' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() =>
                            setSortBy((prev) => (prev === tab.id ? 'order' : tab.id))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            sortBy === tab.id
                              ? 'accent-bg text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Synced List Density Toggle (Comfortable / Compact) */}
                    <div
                      className="flex items-center p-1 rounded-xl bg-slate-950/70 border border-white/10"
                      title="Switch List Density (synced with Settings)"
                    >
                      {(
                        [
                          { id: 'comfortable', label: 'Comfortable' },
                          { id: 'compact', label: 'Compact' },
                        ] as const
                      ).map((dOpt) => {
                        const isDensityActive =
                          (settings.cardDensity || 'comfortable') === dOpt.id;
                        return (
                          <button
                            key={dOpt.id}
                            type="button"
                            onClick={() => handleUpdateSettings({ cardDensity: dOpt.id })}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              isDensityActive
                                ? 'accent-subtle-bg accent-border border text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200 border border-transparent'
                            }`}
                          >
                            {dOpt.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Bulk Select Mode Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMode((prev) => {
                          if (prev) {
                            setSelectedBookmarkIds([]);
                            setConfirmBulkDelete(false);
                            lastSelectedIdRef.current = null;
                          }
                          return !prev;
                        });
                      }}
                      title={
                        bulkMode
                          ? 'Exit batch selection mode'
                          : 'Select multiple websites to batch edit category, favorites, or delete'
                      }
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        bulkMode
                          ? 'accent-subtle-bg accent-border accent-text font-semibold'
                          : 'bg-slate-950/70 border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>{bulkMode ? 'Done' : 'Batch Edit'}</span>
                    </button>
                  </div>
                </div>

                {/* Bulk Action Banner */}
                {bulkMode && (() => {
                  const selectedBookmarksList = bookmarks.filter((b) =>
                    selectedBookmarkIds.includes(b.id)
                  );
                  const hasUnpinnedSelected = selectedBookmarksList.some(
                    (b) => !b.isFavorite
                  );
                  const hasPinnedSelected = selectedBookmarksList.some(
                    (b) => b.isFavorite
                  );

                  return (
                    <div className="p-3 rounded-xl accent-subtle-bg border accent-border flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-semibold text-white font-mono-tabular">
                          {selectedBookmarkIds.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmBulkDelete(false);
                            setSelectedBookmarkIds(
                              selectedBookmarkIds.length === filteredBookmarks.length
                                ? []
                                : filteredBookmarks.map((b) => b.id)
                            );
                          }}
                          className="text-xs accent-text hover:underline cursor-pointer"
                        >
                          {selectedBookmarkIds.length === filteredBookmarks.length
                            ? 'Deselect All'
                            : 'Select All Visible'}
                        </button>
                        {selectedBookmarkIds.length > 0 && (
                          <span className="hidden sm:inline text-[11px] text-slate-400">
                            Tip: Hold Shift + click to select a range
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {confirmBulkDelete ? (
                          <>
                            <span className="text-xs text-rose-200 font-medium">
                              Delete {selectedBookmarkIds.length}{' '}
                              {selectedBookmarkIds.length === 1 ? 'bookmark' : 'bookmarks'}?
                            </span>
                            <button
                              type="button"
                              disabled={isBulkDeleting}
                              onClick={() => setConfirmBulkDelete(false)}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-40"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isBulkDeleting || selectedBookmarkIds.length === 0}
                              onClick={handleDeleteSelectedBookmarks}
                              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>
                                {isBulkDeleting ? 'Deleting...' : 'Confirm Delete'}
                              </span>
                            </button>
                          </>
                        ) : (
                          <>
                            {hasUnpinnedSelected && (
                              <button
                                type="button"
                                disabled={
                                  selectedBookmarkIds.length === 0 ||
                                  isBulkDeleting ||
                                  isBatchEditing
                                }
                                onClick={() =>
                                  handleBatchEditWebsites(selectedBookmarkIds, {
                                    favoriteStatus: 'favorite',
                                  })
                                }
                                title="Pin all selected websites to Favorites in one operation"
                                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap"
                              >
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>Pin Favorites</span>
                              </button>
                            )}

                            {hasPinnedSelected && (
                              <button
                                type="button"
                                disabled={
                                  selectedBookmarkIds.length === 0 ||
                                  isBulkDeleting ||
                                  isBatchEditing
                                }
                                onClick={() =>
                                  handleBatchEditWebsites(selectedBookmarkIds, {
                                    favoriteStatus: 'unfavorite',
                                  })
                                }
                                title="Remove all selected websites from Favorites"
                                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap"
                              >
                                <StarOff className="w-3.5 h-3.5" />
                                <span>Unpin</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={
                                selectedBookmarkIds.length === 0 ||
                                isBulkDeleting ||
                                isBatchEditing
                              }
                              onClick={() => setConfirmBulkDelete(true)}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                selectedBookmarkIds.length === 0 ||
                                isBulkDeleting ||
                                isBatchEditing
                              }
                              onClick={() => setBookmarksToBatchEdit(selectedBookmarksList)}
                              className="min-h-[36px] px-4 py-1.5 rounded-xl accent-bg text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span>Batch Edit ({selectedBookmarkIds.length})</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </section>

              {/* Loading Skeleton or Website Cards Grid */}
              {cloudLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="glass-surface rounded-2xl p-5 h-44 animate-pulse flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/80" />
                        <div className="space-y-2 flex-1">
                          <div className="h-4 w-2/3 bg-slate-800/80 rounded" />
                          <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
                        </div>
                      </div>
                      <div className="h-3 w-full bg-slate-800/50 rounded" />
                      <div className="h-8 w-full bg-slate-800/40 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : filteredBookmarks.length === 0 ? (
                <div className="glass-surface rounded-2xl p-10 text-center max-w-xl mx-auto my-6 space-y-4">
                  <div className="w-12 h-12 rounded-2xl accent-subtle-bg accent-text flex items-center justify-center mx-auto">
                    <Chrome className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                      {searchQuery
                        ? 'No websites match your search'
                        : 'Your Web Directory is Empty'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {searchQuery
                        ? `No saved websites matched "${searchQuery}". Try clearing your search filter.`
                        : 'Import your Chrome bookmarks in Settings, sign in with Google to sync your saved sites, or create a category to begin.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 cursor-pointer"
                      >
                        Clear Search
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveView('chrome-sync')}
                          className="min-h-[44px] px-5 py-2.5 rounded-xl accent-bg text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-lg"
                        >
                          <Chrome className="w-4 h-4" />
                          <span>Sync Chrome</span>
                        </button>

                        {!user && (
                          <button
                            type="button"
                            onClick={() => openAuthPage('login')}
                            className="min-h-[44px] px-5 py-2.5 rounded-xl accent-subtle-bg hover:bg-white/15 border accent-border accent-text text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                          >
                            <LogIn className="w-4 h-4" />
                            <span>Log in</span>
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveView('categories')}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4 accent-text" />
                      <span>Create Category</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex flex-col transition-all duration-200 ${
                    settings.cardDensity === 'compact' ? 'space-y-1.5' : 'space-y-3'
                  }`}
                >
                  {filteredBookmarks.map((bm) => {
                    const cat = categoryMap[bm.categoryId];
                    const sub = bm.subcategoryId ? categoryMap[bm.subcategoryId] : null;
                    const effectiveCat = sub || cat;
                    const isSelected = selectedBookmarkIds.includes(bm.id);
                    const isCompact = settings.cardDensity === 'compact';

                    // Determine if the description is merely a duplicate of the category name/path
                    const descText = (bm.description || '').trim();
                    const catName = cat?.name?.trim().toLowerCase() || '';
                    const subName = sub?.name?.trim().toLowerCase() || '';
                    const lowerDesc = descText.toLowerCase();
                    const isDuplicateCategoryDesc =
                      !descText ||
                      (catName && lowerDesc === catName) ||
                      (subName && lowerDesc === subName) ||
                      (catName && lowerDesc.startsWith(`${catName} /`)) ||
                      (subName && lowerDesc.endsWith(`/ ${subName}`)) ||
                      (catName && subName && (
                        lowerDesc === `${catName} / ${subName}` ||
                        lowerDesc === `${catName}/${subName}` ||
                        lowerDesc === `${catName} - ${subName}` ||
                        lowerDesc === `${subName} / ${catName}`
                      ));

                    return (
                      <article
                        key={bm.id}
                        draggable={!bulkMode}
                        onDragStart={() => setDraggedBookmarkId(bm.id)}
                        onDragEnd={() => {
                          setDraggedBookmarkId(null);
                          setDragOverTarget(null);
                        }}
                        onClick={(e) => {
                          if (!bulkMode) return;
                          const target = e.target as HTMLElement | null;
                          if (target?.closest('a, button, input')) return;
                          toggleBulkSelect(bm.id, e.shiftKey);
                        }}
                        className={`glass-surface website-card flex flex-col md:flex-row md:items-center justify-between group ${
                          isCompact
                            ? 'rounded-xl px-3 py-1.5 sm:py-2 gap-2'
                            : 'rounded-2xl p-4 sm:p-4.5 gap-3.5'
                        } ${bulkMode ? 'cursor-pointer select-none' : ''} ${
                          isSelected
                            ? 'accent-border ring-1 ring-[var(--accent-primary)]'
                            : 'hover:border-white/20'
                        } ${draggedBookmarkId === bm.id ? 'opacity-50' : ''}`}
                      >
                        {/* Left Section: Favicon + Title + Prominently Highlighted URL + Single Category */}
                        <div
                          className={`flex items-center min-w-0 flex-1 ${
                            isCompact ? 'gap-2.5' : 'gap-3.5'
                          }`}
                        >
                          {bulkMode ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBulkSelect(bm.id, e.shiftKey);
                              }}
                              aria-label={
                                isSelected ? `Deselect ${bm.title}` : `Select ${bm.title}`
                              }
                              className={`${
                                isCompact ? 'w-7.5 h-7.5 rounded-lg' : 'w-10 h-10 rounded-xl'
                              } bg-slate-900 border border-white/15 flex items-center justify-center shrink-0 cursor-pointer`}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 accent-text" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBulkMode(true);
                                toggleBulkSelect(bm.id, e.shiftKey);
                              }}
                              title="Select website for batch edit"
                              aria-label={`Select ${bm.title} for batch edit`}
                              className="relative group/fav shrink-0 cursor-pointer rounded-xl"
                            >
                              <WebsiteFavicon url={bm.url} title={bm.title} compact={isCompact} />
                              <span
                                className={`absolute inset-0 ${
                                  isCompact ? 'rounded-lg' : 'rounded-xl'
                                } bg-slate-950/80 border border-white/20 flex items-center justify-center opacity-0 group-hover/fav:opacity-100 transition-opacity`}
                              >
                                <Square className="w-4 h-4 accent-text" />
                              </span>
                            </button>
                          )}

                          {isCompact ? (
                            /* COMPACT SINGLE-LINE DENSITY LAYOUT */
                            <div className="min-w-0 flex-1 flex flex-wrap sm:flex-nowrap items-center gap-2">
                              <a
                                href={bm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs sm:text-[13px] font-semibold text-slate-100 hover:text-[var(--accent-light)] transition-colors truncate flex items-center gap-1 max-w-[200px] sm:max-w-[260px] shrink-0"
                              >
                                <span className="truncate">{bm.title}</span>
                              </a>

                              {bm.isFavorite && (
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                              )}

                              <a
                                href={bm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={bm.url}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-light)] font-mono text-[11px] font-medium hover:bg-[var(--accent-primary)]/25 transition-colors truncate max-w-[220px] sm:max-w-xs lg:max-w-md"
                              >
                                <Globe className="w-3 h-3 shrink-0 opacity-80" />
                                <span className="truncate">{bm.url}</span>
                              </a>

                              {/* Single Category Tag */}
                              {effectiveCat && (
                                <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 shrink-0 truncate">
                                  <span className="text-slate-600">•</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveView('all');
                                      setSelectedCategoryId(effectiveCat.parentId || effectiveCat.id);
                                      setSelectedSubcategoryId(effectiveCat.parentId ? effectiveCat.id : 'all');
                                    }}
                                    className="accent-text hover:underline cursor-pointer truncate font-medium"
                                    title={`Category: ${effectiveCat.name}`}
                                  >
                                    {effectiveCat.name}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* COMFORTABLE SPACIOUS TWO-LINE CARD LAYOUT */
                            <div className="min-w-0 flex-1 space-y-1.5">
                              {/* Title & Favorite Star */}
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

                              {/* Optional Description / Notes (only real user notes, never duplicate category text) */}
                              {!isDuplicateCategoryDesc && (
                                <p className="text-xs text-slate-400 line-clamp-1">
                                  {descText}
                                </p>
                              )}

                              {/* Prominently Highlighted Website URL & Single Category */}
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {/* Highlighted URL Pill */}
                                <a
                                  href={bm.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={bm.url}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-light)] font-mono text-xs font-semibold hover:bg-[var(--accent-primary)]/25 hover:border-[var(--accent-primary)]/50 transition-colors truncate max-w-[260px] sm:max-w-md lg:max-w-xl shadow-xs"
                                >
                                  <Globe className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                  <span className="truncate">{bm.url}</span>
                                </a>

                                {/* Single Category Tag */}
                                {effectiveCat && (
                                  <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                                    <span className="text-slate-600">•</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveView('all');
                                        setSelectedCategoryId(effectiveCat.parentId || effectiveCat.id);
                                        setSelectedSubcategoryId(effectiveCat.parentId ? effectiveCat.id : 'all');
                                      }}
                                      className="accent-text hover:underline cursor-pointer font-medium"
                                      title={`Category: ${effectiveCat.name}`}
                                    >
                                      {effectiveCat.name}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Section: Action Controls */}
                        <div
                          className={`flex items-center justify-between md:justify-end shrink-0 ${
                            isCompact
                              ? 'gap-1 pt-1.5 md:pt-0 border-t md:border-t-0 border-white/5'
                              : 'gap-1.5 pt-2.5 md:pt-0 border-t md:border-t-0 border-white/5'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleBookmarkShortcut(bm)}
                            aria-label="Toggle Quick Access Shortcut"
                            title={
                              quickShortcuts.some(
                                (s) => s.url.toLowerCase() === bm.url.toLowerCase()
                              )
                                ? 'Remove from Top Quick Access'
                                : 'Pin to Top Quick Access Bar'
                            }
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-[var(--accent-light)] hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            <Zap
                              className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
                                quickShortcuts.some(
                                  (s) => s.url.toLowerCase() === bm.url.toLowerCase()
                                )
                                  ? 'fill-[var(--accent-primary)] accent-text'
                                  : ''
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(bm)}
                            aria-label={bm.isFavorite ? 'Unpin website' : 'Pin website'}
                            title={bm.isFavorite ? 'Unpin' : 'Pin to favorites'}
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            <Star
                              className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
                                bm.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => setBookmarksToMove([bm])}
                            aria-label="Move to another category or subcategory"
                            title="Move to another category or subcategory"
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-[var(--accent-light)] hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyUrl(bm.id, bm.url)}
                            title="Copy URL"
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            {copiedId === bm.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingBookmark(bm);
                              setIsBookmarkModalOpen(true);
                            }}
                            title="Edit website details"
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteBookmark(bm.id)}
                            title="Delete website"
                            className={`${
                              isCompact ? 'min-h-[28px] min-w-[28px]' : 'min-h-[36px] min-w-[36px]'
                            } rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <a
                            href={bm.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${
                              isCompact
                                ? 'min-h-[28px] px-2.5 py-0.5 text-[11px]'
                                : 'min-h-[36px] px-3.5 py-1 text-xs'
                            } rounded-lg accent-subtle-bg hover:bg-white/15 accent-text font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ml-0.5`}
                          >
                            <span>Visit</span>
                            <ExternalLink className="w-3 h-3" />
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

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-15 glass-elevated border-t border-white/10 grid grid-cols-4 items-center px-2">
        <button
          type="button"
          onClick={() => {
            setActiveView('all');
            setSelectedCategoryId('all');
            setSelectedSubcategoryId('all');
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            (activeView === 'all' || activeView === 'favorites') && selectedCategoryId === 'all'
              ? 'accent-text'
              : 'text-slate-400'
          }`}
        >
          <Bookmark className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">All Sites</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('categories');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeView === 'categories' ? 'accent-text' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Categories</span>
        </button>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setEditingBookmark(null);
              setIsBookmarkModalOpen(true);
            }}
            aria-label="Save Website"
            className="w-11 h-11 rounded-2xl accent-bg text-white flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveView('settings');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
            activeView === 'settings' || activeView === 'chrome-sync'
              ? 'accent-text'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Settings</span>
        </button>
      </nav>

      {/* Modals for Saving/Editing or Moving a Website */}
      <Deferred when={isBookmarkModalOpen}>
        <BookmarkModal
          isOpen={isBookmarkModalOpen}
          onClose={() => {
            setIsBookmarkModalOpen(false);
            setEditingBookmark(null);
          }}
          onSave={handleSaveBookmark}
          onQuickCreateCategory={(name, parentId) =>
            handleCreateCategory(name, '', parentId)
          }
          categories={categories}
          initialBookmark={editingBookmark}
          defaultCategoryId={selectedCategoryId !== 'all' ? selectedCategoryId : undefined}
          defaultSubcategoryId={
            selectedSubcategoryId !== 'all' ? selectedSubcategoryId : undefined
          }
        />
      </Deferred>

      <Deferred when={bookmarksToMove.length > 0}>
        <MoveWebsiteModal
          isOpen={bookmarksToMove.length > 0}
          onClose={() => setBookmarksToMove([])}
          bookmarksToMove={bookmarksToMove}
          categories={categories}
          onConfirmMove={handleMoveWebsites}
        />
      </Deferred>

      <Deferred when={bookmarksToBatchEdit.length > 0}>
        <BatchEditModal
          isOpen={bookmarksToBatchEdit.length > 0}
          onClose={() => setBookmarksToBatchEdit([])}
          bookmarksToEdit={bookmarksToBatchEdit}
          categories={categories}
          onConfirmBatchEdit={handleBatchEditWebsites}
        />
      </Deferred>

      <Deferred when={previewingBookmark !== null}>
        <WebsitePreviewModal
          bookmark={previewingBookmark}
          category={
            previewingBookmark ? categoryMap[previewingBookmark.categoryId] || null : null
          }
          subcategory={
            previewingBookmark?.subcategoryId
              ? categoryMap[previewingBookmark.subcategoryId] || null
              : null
          }
          onClose={() => setPreviewingBookmark(null)}
        />
      </Deferred>

      <Deferred when={isShortcutModalOpen}>
        <QuickShortcutModal
          isOpen={isShortcutModalOpen}
          onClose={() => {
            setIsShortcutModalOpen(false);
            setEditingShortcut(null);
          }}
          onSave={handleSaveQuickShortcut}
          onDelete={handleDeleteQuickShortcut}
          bookmarks={bookmarks}
          initialShortcut={editingShortcut}
        />
      </Deferred>

      <Deferred when={isChromeImportModalOpen}>
        <ChromeImportModal
          isOpen={isChromeImportModalOpen}
          onClose={() => setIsChromeImportModalOpen(false)}
          onImportExactPlan={handleImportExactChromePlan}
          linkedChromeFileName={linkedChromeFileName}
          lastChromeSyncTime={lastChromeSyncTime}
          onLinkLiveChromeFile={handleLinkLiveChromeFile}
          onRefreshLiveChromeFile={() => handleRefreshLiveChromeFile(true)}
        />
      </Deferred>

      {sharingCategory && (
        <Suspense fallback={null}>
        <ShareCategoryModal
          category={sharingCategory}
          subcategories={subcategoriesByParent[sharingCategory.id] || []}
          bookmarks={bookmarks}
          existingShare={sharedByCategoryId[sharingCategory.id] || null}
          user={user}
          onSignIn={async () => {
            setSharingCategory(null);
            openAuthPage('login');
          }}
          onPublishOrUpdateShare={handlePublishOrUpdateShare}
          onRevokeShare={handleRevokeShare}
          onPreviewSharedPage={handleOpenSharePreview}
          onClose={() => setSharingCategory(null)}
        />
        </Suspense>
      )}

      <SignInLoadingOverlay stage={signInLoadingStage} />

      <Deferred when={syncGateStatus === 'awaiting_choice' && pendingSyncChoice !== null}>
        <AccountSyncModal
          isOpen={syncGateStatus === 'awaiting_choice' && pendingSyncChoice !== null}
          userEmail={pendingSyncChoice?.targetUser.email || ''}
          userName={pendingSyncChoice?.targetUser.displayName}
          hasLocalData={Boolean(
            pendingSyncChoice &&
              (pendingSyncChoice.localCategories.length > 0 ||
                pendingSyncChoice.localBookmarks.length > 0 ||
                pendingSyncChoice.localShortcuts.length > 0)
          )}
          hasCloudData={Boolean(
            pendingSyncChoice &&
              (pendingSyncChoice.cloudCategories.length > 0 ||
                pendingSyncChoice.cloudBookmarks.length > 0 ||
                pendingSyncChoice.cloudShortcuts.length > 0)
          )}
          localCounts={{
            categories: pendingSyncChoice?.localCategories.length || 0,
            bookmarks: pendingSyncChoice?.localBookmarks.length || 0,
            shortcuts: pendingSyncChoice?.localShortcuts.length || 0,
          }}
          cloudCounts={{
            categories: pendingSyncChoice?.cloudCategories.length || 0,
            bookmarks: pendingSyncChoice?.cloudBookmarks.length || 0,
            shortcuts: pendingSyncChoice?.cloudShortcuts.length || 0,
          }}
          isProcessing={isSyncChoiceProcessing}
          error={syncChoiceError}
          onSyncLocalToCloud={handleChoiceSyncLocalToCloud}
          onKeepLocalOnly={handleChoiceKeepLocalOnly}
          onGetCloudAndSync={handleChoiceGetCloudAndSync}
          onStartFresh={handleChoiceStartFresh}
        />
      </Deferred>

      <Deferred when={Boolean(authPageMode && !user)}>
        <AuthPage
          isOpen={Boolean(authPageMode && !user)}
          mode={authPageMode || 'login'}
          onModeChange={(nextMode) => setAuthPageMode(nextMode)}
          onClose={closeAuthPage}
          onGoogleLogin={handleGoogleLogin}
          onEmailLogin={handleEmailLogin}
          onEmailRegister={handleEmailRegister}
          onPasswordReset={handlePasswordReset}
        />
      </Deferred>
    </div>
  );
}
