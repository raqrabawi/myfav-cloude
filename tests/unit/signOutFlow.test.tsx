// @vitest-environment jsdom
/**
 * App-level regression test for sign-out in the same tab:
 *  - the cloud workspace must disappear from the page immediately (no reload),
 *  - cloud data must never be written into this browser's guest storage,
 *  - a stale cloud copy left in guest storage by the earlier bug is cleared,
 *  - real guest data of an account that was never linked is kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

type Cb = (u: unknown) => void;
const authState: { cb: Cb | null } = { cb: null };
const signedInUser = { uid: 'u1', email: 'u1@x.dev', displayName: 'U One', emailVerified: true, photoURL: null };

vi.mock('../../src/lib/auth', () => ({
  auth: { currentUser: null },
  consumeOAuthFreshSignInFlag: () => false,
  OAUTH_FRESH_SIGNIN_KEY: 'myfav.v2.oauthFreshSignIn',
  onAuthStateChanged: (_a: unknown, cb: Cb) => {
    authState.cb = cb;
    return () => {};
  },
  registerWithEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(async () => {
    authState.cb?.(null);
  }),
}));

const now = '2026-11-17T00:00:00.000Z';
const cloudWorkspace = {
  categories: [{ id: 'c1', ownerId: 'u1', name: 'Cloud Category', icon: 'Folder', parentId: '', order: 0, createdAt: now, updatedAt: now }],
  bookmarks: [
    { id: 'b1', ownerId: 'u1', title: 'Cloud Secret Site', url: 'https://cloud-secret.example', description: '', categoryId: 'c1', subcategoryId: '', isFavorite: false, createdAt: now, updatedAt: now },
  ],
  quickShortcuts: [],
  sharedCategories: [],
  settings: null,
};
const api = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  syncLocalWorkspace: vi.fn(),
  recordBookmarkOpen: vi.fn(),
}));
vi.mock('../../src/lib/apiClient', () => {
  return {
    apiClient: new Proxy(api as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : vi.fn(async () => undefined)),
    }),
  };
});

const KEYS = {
  CATEGORIES: 'aethermark_categories_v1',
  BOOKMARKS: 'aethermark_bookmarks_v1',
  QUICK_SHORTCUTS: 'aethermark_quick_shortcuts_v1',
  LINKED: 'aethermark_cloud_linked_uid_v1',
};
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  api.getWorkspace.mockReset().mockImplementation(async () => cloudWorkspace);
  api.syncLocalWorkspace.mockReset().mockImplementation(async () => cloudWorkspace);
  api.recordBookmarkOpen.mockReset().mockImplementation(async () => ({ ok: true }));
  localStorage.clear();
  sessionStorage.clear();
  authState.cb = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class Obs { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as Record<string, unknown>).ResizeObserver ??= Obs;
  (globalThis as Record<string, unknown>).IntersectionObserver ??= Obs;
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function renderSignedIn() {
  const { default: App } = await import('../../src/App');
  root = createRoot(host);
  await act(async () => root.render(React.createElement(App)));
  await act(async () => authState.cb?.(signedInUser));
  await flush();
}

// Sign out the way a user now does: Settings -> Account & Data -> Sign Out
// (the side-nav login/logout button was removed on request).
const buttonByText = (re: RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => re.test((b.textContent || '').trim()));

async function clickSignOut() {
  const settings = buttonByText(/^Settings$/);
  expect(settings, 'Settings button').toBeTruthy();
  await act(async () => settings!.click());
  for (let i = 0; i < 20 && !buttonByText(/^Account/); i++) await flush(); // lazy Settings page
  const account = buttonByText(/^Account/);
  expect(account, 'Account & Data tab').toBeTruthy();
  await act(async () => account!.click());
  await flush();
  const signOut = buttonByText(/^Sign Out$/);
  expect(signOut, 'Sign Out button').toBeTruthy();
  await act(async () => signOut!.click());
  await flush();
}

const guestBookmarks = () => JSON.parse(localStorage.getItem(KEYS.BOOKMARKS) ?? 'null');

describe('sign-out in the same tab', () => {
  it('removes the cloud workspace from the page and never saves it as guest data', async () => {
    localStorage.setItem(KEYS.LINKED, 'u1');
    localStorage.setItem(KEYS.CATEGORIES, '[]');
    localStorage.setItem(KEYS.BOOKMARKS, '[]');
    localStorage.setItem(KEYS.QUICK_SHORTCUTS, '[]');

    await renderSignedIn();
    expect(host.textContent).toContain('Cloud Secret Site');

    await clickSignOut();
    expect(host.textContent).not.toContain('Cloud Secret Site');
    expect(host.textContent).not.toContain('Cloud Category');
    expect(buttonByText(/^Log in$/), 'header Log in button').toBeTruthy();
    expect(guestBookmarks()).toEqual([]);
    expect(localStorage.getItem(KEYS.CATEGORIES)).toBe('[]');
    expect(localStorage.getItem(KEYS.LINKED)).toBeNull();
  });

  it('clears a stale cloud copy left in guest storage by the earlier bug', async () => {
    localStorage.setItem(KEYS.LINKED, 'u1');
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(cloudWorkspace.categories));
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(cloudWorkspace.bookmarks));

    await renderSignedIn();
    await clickSignOut();
    expect(host.textContent).not.toContain('Cloud Secret Site');
    expect(guestBookmarks()).toEqual([]);
  });

  it('signing out after an automatic sync shows an empty guest workspace', async () => {
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify([{ ...cloudWorkspace.bookmarks[0], id: 'g1', ownerId: 'local', title: 'Guest Only Site', url: 'https://guest.example', categoryId: '' }]));
    await renderSignedIn();
    await clickSignOut();
    expect(host.textContent).not.toContain('Cloud Secret Site');
    expect(guestBookmarks()).toEqual([]);
  });
});

describe('sign-in with existing data: automatic sync, no prompt', () => {
  const guestBookmark = { ...cloudWorkspace.bookmarks[0], id: 'g1', ownerId: 'local', title: 'Guest Only Site', url: 'https://guest.example', categoryId: '' };

  it('merges this device\'s websites into the account and opens the Main Page without asking', async () => {
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify([guestBookmark]));
    await renderSignedIn();

    expect(api.syncLocalWorkspace).toHaveBeenCalledTimes(1);
    expect(api.syncLocalWorkspace.mock.calls[0][0].bookmarks.map((b: { id: string }) => b.id)).toEqual(['g1']);
    // The sync's own result is reused: no second full workspace download.
    expect(api.getWorkspace).not.toHaveBeenCalled();
    expect(host.textContent).not.toMatch(/Sync Local|Keep Local|Start Fresh|Choose how/i);
    expect(host.textContent).toContain('Cloud Secret Site');
    expect(host.textContent).toContain('Main Page');
    expect(localStorage.getItem(KEYS.LINKED)).toBe('u1');
    expect(guestBookmarks()).toEqual([]);
  });

  it('with no local data, just opens the cloud workspace (nothing to upload)', async () => {
    await renderSignedIn();
    expect(api.syncLocalWorkspace).not.toHaveBeenCalled();
    expect(api.getWorkspace).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Cloud Secret Site');
    expect(localStorage.getItem(KEYS.LINKED)).toBe('u1');
  });

  it('if the automatic sync fails, the device copy is kept and the browser is not linked', async () => {
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify([guestBookmark]));
    api.syncLocalWorkspace.mockRejectedValueOnce(new Error('network down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderSignedIn();
    err.mockRestore();
    expect(localStorage.getItem(KEYS.LINKED)).toBeNull();
    expect(guestBookmarks().map((b: { id: string }) => b.id)).toEqual(['g1']);
    expect(host.textContent).toContain("Couldn't sync this device's websites yet");
  });
});

const wait = async (ms: number) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

describe('loading animation after sign-in', () => {
  const overlay = () => document.querySelector('[data-testid="signin-loading-overlay"]');

  it('shows "Syncing your websites" while the merge runs, then disappears when the Main Page is ready', async () => {
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify([{ ...cloudWorkspace.bookmarks[0], id: 'g1', ownerId: 'local', title: 'Guest Only Site', url: 'https://guest.example', categoryId: '' }]));
    let release!: () => void;
    api.syncLocalWorkspace.mockImplementationOnce(() => new Promise((r) => (release = () => r(cloudWorkspace))));

    const { default: App } = await import('../../src/App');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(App)));
    await act(async () => {
      void authState.cb?.(signedInUser); // don't await: the sync is held open on purpose
    });
    await wait(300); // > 180 ms show delay

    expect(overlay()).toBeTruthy();
    expect(overlay()!.getAttribute('aria-label')).toMatch(/Syncing your websites/);

    await act(async () => release());
    await wait(800); // exit animation

    expect(overlay()).toBeNull();
    expect(host.textContent).toContain('Cloud Secret Site');
  });

  it('shows "Signing you in" when the page opens on the way back from Google', async () => {
    sessionStorage.setItem('myfav.v2.oauthFreshSignIn', '1');
    const { default: App } = await import('../../src/App');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(App)));
    await wait(300);
    expect(overlay()?.getAttribute('aria-label')).toMatch(/Signing you in/);
    await act(async () => authState.cb?.(signedInUser));
    await wait(800);
    expect(overlay()).toBeNull();
  });
});

describe('Main Page order: pinned first, then most used, then A–Z', () => {
  const bm = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    id, ownerId: 'u1', title, url: `https://${id}.example`, description: '', categoryId: 'c1', subcategoryId: '',
    isFavorite: false, createdAt: now, updatedAt: now, openCount: 0, lastOpenedAt: '', ...extra,
  });
  const workspace = {
    ...cloudWorkspace,
    bookmarks: [
      bm('zeta', 'Zeta'),
      bm('alpha', 'alpha'),
      bm('used5', 'Mid Used', { openCount: 5 }),
      bm('pinB', 'Pinned B', { isFavorite: true }),
      bm('used9', 'Top Used', { openCount: 9 }),
      bm('pinA', 'Pinned A', { isFavorite: true, openCount: 1 }),
      bm('beta', 'Beta'),
    ],
  };
  const order = () =>
    [...host.querySelectorAll<HTMLAnchorElement>('a[href^="https://"][href$=".example"]')]
      .map((a) => a.getAttribute('href')!.replace('https://', '').replace('.example', ''))
      .filter((v, i, arr) => arr.indexOf(v) === i);

  it('orders the Main Page after sign-in and counts a click without reordering mid-visit', async () => {
    localStorage.setItem(KEYS.LINKED, 'u1');
    api.getWorkspace.mockImplementation(async () => workspace);
    await renderSignedIn();
    // pinned (by usage, then A–Z) -> most used -> rest A–Z (case-insensitive)
    expect(order()).toEqual(['pinA', 'pinB', 'used9', 'used5', 'alpha', 'Beta'.toLowerCase(), 'zeta']);

    const zetaLink = host.querySelector<HTMLAnchorElement>('a[href="https://zeta.example"]')!;
    await act(async () => {
      zetaLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(api.recordBookmarkOpen).toHaveBeenCalledWith('zeta');
    // the list doesn't jump while you are on it
    expect(order()).toEqual(['pinA', 'pinB', 'used9', 'used5', 'alpha', 'beta', 'zeta']);
  });
});

describe('side nav and Quick Access layout', () => {
  it('has no login/logout button in the side nav', async () => {
    localStorage.setItem(KEYS.LINKED, 'u1');
    await renderSignedIn();
    const aside = host.querySelector('aside')!;
    expect(aside.querySelector('button[title^="Signed in as"]')).toBeNull();
    expect(aside.querySelector('button[title="Log in to sync"]')).toBeNull();
    expect(aside.textContent).not.toMatch(/Sign Out|Log in|Local Vault/);
  });
});
