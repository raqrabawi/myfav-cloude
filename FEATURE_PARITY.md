# FEATURE_PARITY.md — MyFav original → MyFav V2 (Neon)

Legend: **VERIFIED** = an automated test was run and passed (see TEST_REPORT.md). **PARTIAL** = backend logic verified, live browser flow not run. **BLOCKED** = needs a browser that can reach Neon. This environment's network blocks Neon hosts. Database-level behaviour **was** verified live on Neon through the Neon tooling (see TEST_REPORT §Live Neon).

UI source note: all 17 original components except `ShareCategoryModal`, `SettingsModal` and `ChromeSyncPage` are **byte-identical** to the original. Those three differ only in their `User` type import. `App.tsx` differs in its imports plus one logic line (see `docs/UI_DIFF_vs_original.patch`).

## A. Guest and account behaviour
| Feature | Original source | V2 implementation | Test | Status |
|---|---|---|---|---|
| Guest/local workspace (localStorage) | `App.tsx` state + `STORAGE_KEYS` | Unchanged code | E2E ×2 builds (11 scenarios) | VERIFIED |
| Email registration | `firebase.ts registerWithEmail` | `lib/auth.ts` → Better Auth `signUp.email` (name kept) + **6-digit code** dialog | unit `authFacade` | PARTIAL / live browser BLOCKED |
| Email verification required | Firebase verification link | Neon "require email verification" (code) + `EmailVerificationModal`; DB also requires `neon_auth.user.emailVerified` | unit + **live Neon** (unverified user rejected) | VERIFIED (DB) / PARTIAL (UI) |
| Email sign-in / sign-out | `signInWithEmail`, `signOutUser` | Neon adapter `signInWithPassword`, `signOut`; unverified sign-in opens the code dialog | unit | PARTIAL / live browser BLOCKED |
| Password reset | Firebase-hosted reset page | `requestPasswordReset` link → app `?token=` → `PasswordRecoveryModal` → Better Auth `resetPassword` | unit | PARTIAL / live browser BLOCKED |
| Google sign-in | `signInWithPopup` | Neon adapter `signInWithOAuth` (full-page **redirect**; keeps `?share=`) | unit | PARTIAL / live browser BLOCKED |
| Session persistence / restore | Firebase persistence | `@neon/neon-js` session cache + cross-tab sync | unit (`onAuthStateChanged` semantics) | PARTIAL |
| `onAuthStateChanged` semantics (fires only on identity change) | Firebase | facade dedupes token refresh / user update | unit | VERIFIED |
| Auth error messages | `mapFirebaseAuthError` in AuthPage (unchanged) | adapter emits Firebase-style codes → same messages; Neon-specific cases (8-char password, unverified, bad code) get precise messages | unit | VERIFIED |
| AccountSyncModal: Sync local → cloud | `handleChoiceSyncLocalToCloud` → `/sync-local` | rpc `myfav_sync_local_workspace` (atomic, merge) | differential vs original (2 scenarios ×4 checks) | VERIFIED (backend) |
| AccountSyncModal: Keep local only | sign out, keep local | unchanged | code identical | VERIFIED (code) |
| AccountSyncModal: Get cloud & sync | load cloud, clear local cache | unchanged + `getWorkspace` | unit (paging) | PARTIAL |
| AccountSyncModal: Start fresh | `DELETE /api/workspace` | rpc `myfav_clear_workspace` (keeps settings, like original) | DB | VERIFIED (backend) |
| Logout cleanup / no cross-user leakage | client state reset + server uid | same client code; RLS owner isolation | DB isolation tests + **live Neon** two-user test | VERIFIED (backend) |

## B. Bookmarks
| Feature | Original | V2 | Test | Status |
|---|---|---|---|---|
| Add / edit website | `POST /api/bookmarks` | rpc `myfav_save_bookmark` (same cleaning: trim, 120/500/400 caps, http(s) only) | DB + E2E (guest) | VERIFIED |
| Delete | `DELETE /api/bookmarks/:id` | table delete (RLS) | DB + E2E | VERIFIED |
| Favorite toggle / favorites view | `PATCH .../favorite` | table update | DB + E2E | VERIFIED |
| Batch edit (move + favorite) | `/batch-edit` | rpc `myfav_batch_edit_bookmarks` (single atomic statement) | DB (incl. all-or-nothing) + E2E | VERIFIED |
| Batch delete | `/batch-delete` | rpc `myfav_batch_delete_bookmarks` | DB | VERIFIED |
| Move website modal | client + batch edit | unchanged | visual | VERIFIED |
| Copy URL / open | client only | unchanged | code identical | VERIFIED (code) |
| Search / sort / density | client only | unchanged | E2E + visual | VERIFIED |

## C. Categories
| Feature | Original | V2 | Test | Status |
|---|---|---|---|---|
| Create root / subcategory (order = sibling count) | `POST /api/categories` | rpc `myfav_create_category` | DB | VERIFIED |
| Rename / icon | `PATCH` | table update (icon cleaned) | DB | VERIFIED |
| Delete root with / without fallback; delete sub | `DELETE ?fallbackCategoryId` | rpc `myfav_delete_category` (fallback must be own other root) | DB (4 cases) | VERIFIED |
| Drag/drop reorder + re-parent + bookmark re-homing | `PUT /api/categories/reorder` | rpc `myfav_reorder_category_tree`, final tree validated at COMMIT | DB (4 cases incl. rollback) | VERIFIED (backend) |
| 2-level hierarchy, same-owner references | implicit | deferred constraint triggers + composite FKs | DB | VERIFIED |
| Category manager UI | `CategoryManagerModal` | unchanged | visual | VERIFIED |

## D. Quick shortcuts
| Create/edit (favicon/lucide/custom), delete, reorder | `/api/shortcuts*` | rpc `myfav_save_quick_shortcut`, delete, rpc `myfav_reorder_quick_shortcuts` | DB (incl. concurrent creates) + E2E | VERIFIED |
|---|---|---|---|---|

## E. Chrome import
| Feature | Original | V2 | Test | Status |
|---|---|---|---|---|
| HTML / Chrome JSON parsing | `chromeBookmarksParser.ts` | unchanged | unit (8) | VERIFIED |
| Cloud import merge / replace, counters | `importChromePlanToDb` | rpc `myfav_import_chrome_plan`, one transaction, per-user advisory lock | **differential vs original**: 8 scenarios incl. 5,000-bookmark, malformed, empty, twice-imported | VERIFIED |
| Guest import | client | unchanged | E2E ×2 builds | VERIFIED |
| Atomicity / concurrent imports | single tx (original) | single tx + advisory lock | DB (timeout rollback, concurrent merge) | VERIFIED |
| Progress panel / modal UI | unchanged | | visual (Chrome Sync page) | VERIFIED |

## F. Linked Chrome file / live sync
| Link / refresh / unlink / auto-watch; File System Access + IndexedDB; fallback picker | `chromeLiveSync.ts`, `ChromeSyncPage.tsx` | unchanged code (only `User` type import) | visual (empty Chrome Sync page); live picker needs a user gesture | PARTIAL (not truly background, same browser limits as the original) |
|---|---|---|---|---|

## G. Sharing
| Feature | Original | V2 | Test | Status |
|---|---|---|---|---|
| Publish / update snapshot | `POST /api/shares` | rpc `myfav_publish_share` (whitelisted keys rebuilt, invalid URLs dropped) | DB + **live Neon** | VERIFIED (backend) |
| Public read without auth | `GET /api/shares/:id` | rpc `get_public_share` (role `anonymous` via Neon anonymous JWT; single id; `ownerId` returned as `""`) | DB + **live Neon** | VERIFIED (backend) |
| Revoke | `DELETE /api/shares/:id` | table delete → public read returns not-found | DB | VERIFIED |
| Share-link deep entry / not-found view | `?share=` | unchanged | E2E + visual (not-found) | VERIFIED |
| Share modal & shared view with data | | unchanged | needs live backend | BLOCKED |

## H. Settings, export, reset
| Theme dark/light, 8 presets + custom hex, glass, density | unchanged UI; cloud via `user_settings` upsert (enum CHECKs) | DB + E2E (persist) + visual (5 themes) | VERIFIED |
|---|---|---|---|
| Export CSV / HTML / JSON | `backupExport.ts` unchanged | unit (escaping) + E2E downloads | VERIFIED |
| Clear workspace | rpc `myfav_clear_workspace` | DB | VERIFIED |

## I. Other
| Browser back/forward, share deep links | unchanged | E2E | VERIFIED |
|---|---|---|---|
| Responsive desktop/tablet/mobile | unchanged CSS | visual 3 viewports | VERIFIED |
| Error boundary, offline handling | unchanged; adapter throws original error strings | unit | VERIFIED |
| GA4 / GTM analytics | Firebase Analytics bridge removed (it was inactive: empty `measurementId`) | lint/build | VERIFIED |
| `GET /api/health`, `GET *` SPA fallback | Not used by the UI; SPA fallback is a host setting (see README) | — | n/a |

## Deliberate, documented behaviour differences
1. **Google sign-in is a redirect, not a popup.** The UI is unchanged. The "fresh sign-in" marker survives the round trip in `sessionStorage`, so a fresh sign-in is still detected. (Since 2026-11-17 the AccountSyncModal is no longer shown; see the change below.)
2. **Email verification uses a 6-digit code.** Neon's shared email sender supports codes, not verification links. After sign-up, or after signing in with an unverified email, a small code dialog opens (new screen). Once the code is accepted the user is signed in automatically. With a custom email provider, links become possible.
3. **Minimum password length is 8** (Neon Better Auth default). The original Firebase minimum was 6, and AuthPage's unchanged pre-check still says 6. For 6–7 characters the server's message explains the real 8-character rule.
4. **Password recovery** uses a new in-app dialog fed by the `?token=` reset link. Firebase hosted this page itself.
5. **Public share** responses return `ownerId: ""` (no owner UUID). The shared view never displays it.
6. **Share IDs** carry 128 random bits instead of timestamp plus `Math.random`.
7. **Stricter integrity.** Writes that would have produced orphaned or 3-level or cross-tenant data are rejected and rolled back. For sync-local, a bookmark whose "category" is a subcategory is re-homed under its root. On realistic inputs the differential tests show identical outcomes.
8. **IDs are unique per owner** (composite keys), not globally.
9. **Existing users can't be migrated.** Firebase password users cannot be moved, because the password hashes are incompatible. Not relevant yet, since V2 has no production users.


## Intentional behaviour change (2026-11-17): automatic sync on sign-in
At the owner's request, signing in no longer opens the AccountSyncModal ("Sync local → cloud / Keep local only / Get cloud & sync / Start fresh").
- If this browser has guest data, it is merged into the account through `myfav_sync_local_workspace`. The merge never deletes anything and skips duplicates: websites by URL, categories by name.
- The browser is then linked, guest storage is emptied, and the **Main Page** opens with the account's workspace.
- If the merge fails, the browser is not linked and the guest copy stays on the device. A toast says so, and the merge is retried at the next sign-in.
- "Keep local only" and "Start fresh" are no longer offered at sign-in. Clearing the workspace is still available in Settings.
- Tests: `tests/unit/signOutFlow.test.tsx` (3 sign-in cases).

## Intentional behaviour change (2026-11-18): Main Page order
At the owner's request, the **Main Page** (no category selected, no sort button active) now shows:
1. **Pinned** websites first,
2. then **most used**, by how many times each website was opened,
3. then **all others A–Z**, case-insensitive.

Pinned websites are themselves ordered by use, then A–Z.

- **What counts as a use:** opening a website from its title, address or Visit button (left or middle click). The count is stored per website in the account (`open_count`, `last_opened_at`, migration `0003_bookmark_usage.sql`, RPC `myfav_record_bookmark_open`), so it's the same on every device. Guests' counts are kept in the browser.
- **The list doesn't jump while you use it:** the order is refreshed whenever the Main Page is shown again.
- **Unchanged:** the "Pinned First" and "A–Z" buttons, and category pages, which keep their category arrangement.
- **Tests:** `tests/db/usage.test.ts` (6) and an App-level ordering test in `tests/unit/signOutFlow.test.tsx`.

## Additions (2026-11-18): installable app + import from any browser
- **Install as an app.** `public/manifest.webmanifest`, app icons in `public/icons/` (iPhone 180 px, 192/512 px and a maskable icon), and iOS meta tags. The theme colour follows light/dark.
  - **iPhone/iPad:** Share → Add to Home Screen opens MyFav full screen as "MyFav".
  - **Android, Chrome and Edge:** a one-tap Install.
  - **Mac Safari:** File → Add to Dock.
- **Install prompt** (`InstallAppPrompt.tsx`): a small card tailored to the device. It's hidden when MyFav is already installed or the browser can't install apps, and "Not now / Got it" hides it for 30 days. A permanent **Install MyFav as an app** section sits in Settings → Account & Data (`InstallAppSection.tsx`).
- **Import from Safari, Edge and Firefox**, the same `bookmarks.html` format as Chrome.
  - Each browser's top folder keeps its own name: Safari "Favorites", Edge "Favorites Bar", Firefox "Bookmarks Toolbar". Chrome is unchanged.
  - Safari's Reading List is skipped.
  - The import screens are renamed from Chrome-only wording (the Settings tab is now "Import & Sync") and include per-browser export steps.
- **Fix:** the "My" in the MyFav logo was white-on-white in light mode.
- **Tests:** 3 new parser tests (Safari, Edge and Firefox fixtures); 5 new e2e tests (Safari import, iPhone card + "Got it", already-installed, one-tap Install + Settings, manifest/icons served).
