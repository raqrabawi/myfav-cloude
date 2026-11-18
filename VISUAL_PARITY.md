# VISUAL_PARITY.md — Original MyFav vs MyFav V2

## Method
- **Original:** `MyFav-main` from the supplied ZIP, built unmodified with `vite build` and served with `vite preview` (port 3101).
- **V2:** this repository, `vite build` + `vite preview` (port 3102), **no `VITE_NEON_URL` set**, so guest/local mode, which is how a signed-out visitor sees the app.
- **Driver:** `tests/visual/compare.mjs` using Playwright 1.63 with Chromium (headless shell build 1243), device scale factor 1, dark colour scheme, fixed clock `2026-11-17T09:00:00Z`, CSS animations disabled at capture, pointer parked at (0,0).
- **Same data:** identical seeded localStorage workspace (`tests/visual/seed.mjs`: 4 root categories, 3 subcategories, 8 websites incl. Arabic text, 3 quick shortcuts) or an empty workspace.
- **Network:** every non-localhost request is blocked in **both** runs. Google Fonts, favicons and analytics therefore fall back identically. **Limitation:** the comparison does not exercise the real web fonts or remote favicons, but these come from the same `index.html`/component code in both builds.
- **Diff:** `pixelmatch` with threshold 0.1, full-viewport (one full-page) PNGs. The screenshots (`tests/visual/output/{original,v2,diff}/`) are generated locally and git-ignored. Only the summary `tests/visual/output/results.json` is committed; re-run `node tests/visual/compare.mjs` to reproduce them.

## Result: 42 / 42 captures pixel-identical (0 differing pixels) — re-run after the Neon migration, still identical

| State | Viewport | Size | Differing pixels | Result |
|---|---|---|---|---|
| `home-empty` | desktop | 1440x900 | 0 | IDENTICAL |
| `home-empty` | tablet | 834x1112 | 0 | IDENTICAL |
| `home-empty` | mobile | 390x844 | 0 | IDENTICAL |
| `home-seeded` | desktop | 1440x900 | 0 | IDENTICAL |
| `home-seeded` | tablet | 834x1112 | 0 | IDENTICAL |
| `home-seeded` | mobile | 390x844 | 0 | IDENTICAL |
| `home-seeded-fullpage` | desktop | 1440x1533 | 0 | IDENTICAL |
| `category-design` | desktop | 1440x900 | 0 | IDENTICAL |
| `favorites` | desktop | 1440x900 | 0 | IDENTICAL |
| `categories-view` | desktop | 1440x900 | 0 | IDENTICAL |
| `categories-view` | tablet | 834x1112 | 0 | IDENTICAL |
| `categories-view` | mobile | 390x844 | 0 | IDENTICAL |
| `settings` | desktop | 1440x900 | 0 | IDENTICAL |
| `settings` | tablet | 834x1112 | 0 | IDENTICAL |
| `settings` | mobile | 390x844 | 0 | IDENTICAL |
| `auth-login` | desktop | 1440x900 | 0 | IDENTICAL |
| `auth-login` | tablet | 834x1112 | 0 | IDENTICAL |
| `auth-login` | mobile | 390x844 | 0 | IDENTICAL |
| `auth-register` | desktop | 1440x900 | 0 | IDENTICAL |
| `auth-reset` | desktop | 1440x900 | 0 | IDENTICAL |
| `auth-validation-error` | desktop | 1440x900 | 0 | IDENTICAL |
| `add-website-modal` | desktop | 1440x900 | 0 | IDENTICAL |
| `add-website-modal` | tablet | 834x1112 | 0 | IDENTICAL |
| `add-website-modal` | mobile | 390x844 | 0 | IDENTICAL |
| `add-shortcut-modal` | desktop | 1440x900 | 0 | IDENTICAL |
| `category-manager` | desktop | 1440x900 | 0 | IDENTICAL |
| `batch-edit-selected` | desktop | 1440x900 | 0 | IDENTICAL |
| `move-website-modal` | desktop | 1440x900 | 0 | IDENTICAL |
| `edit-website-modal` | desktop | 1440x900 | 0 | IDENTICAL |
| `chrome-sync-empty` | desktop | 1440x900 | 0 | IDENTICAL |
| `compact-density` | desktop | 1440x900 | 0 | IDENTICAL |
| `light-theme` | desktop | 1440x900 | 0 | IDENTICAL |
| `light-theme` | tablet | 834x1112 | 0 | IDENTICAL |
| `light-theme` | mobile | 390x844 | 0 | IDENTICAL |
| `theme-rose-frosted` | desktop | 1440x900 | 0 | IDENTICAL |
| `theme-custom-hex-subtle` | desktop | 1440x900 | 0 | IDENTICAL |
| `sidebar-expanded` | desktop | 1440x900 | 0 | IDENTICAL |
| `search-no-results` | desktop | 1440x900 | 0 | IDENTICAL |
| `search-results` | desktop | 1440x900 | 0 | IDENTICAL |
| `shared-link-not-found` | desktop | 1440x900 | 0 | IDENTICAL |
| `shared-link-not-found` | tablet | 834x1112 | 0 | IDENTICAL |
| `shared-link-not-found` | mobile | 390x844 | 0 | IDENTICAL |

## Not covered by this visual comparison (honest limitations)
| Area | Why | What was done instead |
|---|---|---|
| Signed-in UI: header avatar/state, `AccountSyncModal` (4 choices), `ShareCategoryModal` with a published link, `SharedCollectionView` with real data, `WebsitePreviewModal` | Requires a live auth backend. The original needs the real Firebase project, and V2 needs Neon; neither is reachable from this sandbox's browser. | The component source is **byte-identical** to the original (verified with `diff`; see TEST_REPORT §1). Only data/auth adapters changed underneath. |
| Hover/focus micro-states, drag-and-drop ghost images, animation timing | Not captured frame-by-frame | Same CSS/Motion code; drag/drop persistence tested at the DB level |
| Browsers other than Chromium; real device DPR 2/3 | Only Chromium available here | Run `compare.mjs` in CI or locally with other browsers |
| `PasswordRecoveryModal`, `EmailVerificationModal` (V2-only) | No original equivalent exists: Firebase hosted its own reset and verification pages | Reuse AuthPage's exact classes; documented deviation |
| Live Chrome File System Access "link file" flow | Needs a user gesture + OS file picker | Code copied unchanged; guest HTML import E2E passes on both builds |

**Conclusion:** for every state that can be rendered without a live auth backend, V2 is pixel-identical to the original in Chromium. Authenticated screens are unverified visually.

## Intentional changes requested after the parity run (2026-11-17)
| Change | Where | Effect on the captures above |
|---|---|---|
| Navigation label "All Websites" renamed to **"Main Page"** (also the collapsed-sidebar icon tooltip/aria-label and the "Back to Main Page" link) | `src/App.tsx` | Captures showing the top menu or sidebar now differ from the original by this label text only. The 42/42 result above predates this change. |
| New sign-in loading overlay (`SignInLoadingOverlay`) | `src/components/SignInLoadingOverlay.tsx`, `src/App.tsx` | Appears only while signing in, syncing or loading after sign-in, and only if that takes longer than 180 ms. It shows three stages ("Signing you in", "Syncing your websites", "Loading your Main Page") with an orbit-and-logo animation, an accent-coloured progress sweep and step dots. Light and dark themes supported; respects reduced-motion. Not in the original. |
| Performance pass: logo re-encoded as a 160 px WebP (449 KB to 2.6 KB), lazy-loaded favicons, on-demand screens and dialogs, separate library files | `src/assets/images`, `src/components/{MyFavLogo,CategoryIcon,Deferred}.tsx`, `src/App.tsx`, `vite.config.ts` | No visual change. Old vs new builds, pixel diff: main, add-website, settings, categories, add-shortcut = 8 / 0 / 8 / 8 / 0 px (0.001%), all inside the logo from resampling. First-visit download 685 KB → 225 KB. |
| Category Summary View simplified (owner request): removed the Hide/Show toggle, filter tabs, sort menu, per-category list and the empty/small/large folder counts. It now shows one box: **Total Categories**, **Total Subcategories**, **Total Bookmarks** | `src/components/CategoryManagerModal.tsx` | Categories page only |
| Light-mode fix: Quick Access cards (and a few other surfaces using the same shades) stayed dark in light mode. Added light-mode rules for `bg-slate-950/65`, `bg-slate-950/85`, `bg-slate-900/85`, `bg-white/[0.02]`, `bg-white/[0.06]`, `hover:bg-white/[0.06]`, `hover:bg-white/[0.08]`, `hover:bg-slate-800`, `border-white/12`, `border-white/25` | `src/index.css` | Light mode only; dark mode pixel-identical before/after |
| Light-mode fix: in the collapsed sidebar, the selected item's count badge (`bg-slate-950 text-white`) showed white text on a near-white background. Added `html.light .bg-slate-950.text-white { color: #0f172a }` | `src/index.css` | Light mode only; dark mode pixel-identical before/after |
| Quick Access: one horizontally scrolling row on all screen sizes (no wrapping), with snap scrolling; the page itself never scrolls sideways | `src/App.tsx` | Main Page |
| Side nav: removed the login/logout footer (expanded: email/"Local Vault" + Sign Out/Log in; collapsed: cloud button). Log in stays in the Main Page header; sign in/out stays in Settings → Account & Data | `src/App.tsx` | Side nav |
