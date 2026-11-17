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
vi.mock('../../src/lib/apiClient', () => ({
  apiClient: new Proxy(
    { getWorkspace: vi.fn(async () => cloudWorkspace) },
    { get: (t, k) => (k in t ? (t as Record<string, unknown>)[k as string] : vi.fn(async () => undefined)) }
  ),
}));

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

async function clickSignOut() {
  const btn = host.querySelector<HTMLButtonElement>('button[title^="Signed in as"]');
  expect(btn, 'header sign-out button').toBeTruthy();
  await act(async () => btn!.click());
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
    expect(host.querySelector('button[title="Log in to sync"]')).toBeTruthy();
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

  it('keeps real guest data when the account was never linked', async () => {
    const guest = [{ ...cloudWorkspace.bookmarks[0], id: 'g1', ownerId: 'local', title: 'Guest Only Site', url: 'https://guest.example', categoryId: 'gc' }];
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify([{ ...cloudWorkspace.categories[0], id: 'gc', ownerId: 'local', name: 'Guest Category' }]));
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(guest));

    await renderSignedIn(); // not linked -> sync-choice gate, cloud data not shown yet
    await clickSignOut();
    expect(host.textContent).toContain('Guest Only Site');
    expect(host.textContent).not.toContain('Cloud Secret Site');
    expect(guestBookmarks().map((b: { id: string }) => b.id)).toEqual(['g1']);
  });
});
