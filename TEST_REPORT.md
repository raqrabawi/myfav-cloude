# TEST_REPORT.md — MyFav V2

**Date:** 17 Nov 2026. Every result below comes from a command that was actually run in the build environment. Nothing is claimed for tests that were not run.

## Environment
- Linux, Node 22.23.4, npm 10.9
- PostgreSQL 16.15 (local cluster), with the test-only shim `supabase/tests/shim/00_local_supabase_shim.sql` providing the `anon`/`authenticated` roles, `auth.users` and `auth.uid()` from `request.jwt.claims`
- Playwright 1.63 with Chromium (build 1243), headless
- Original reference: `MyFav-main.zip`, installed with `bun install --frozen-lockfile`, `tsc --noEmit` clean, `vite build` clean, served unmodified

## Summary
| # | Suite | Command | Result |
|---|---|---|---|
| 1 | UI-source identity vs original | `diff -ru` (see `docs/UI_DIFF_vs_original.patch`) | 14/17 components, CSS, types, utils (except analytics), index.html, vite.config, assets **byte-identical**. 3 components differ by one type import; App.tsx by imports + 1 logic line |
| 2 | Migrations apply on a clean DB | `bash scripts/local-db.sh` | **PASS** |
| 3 | Typecheck + forbidden-content check (no Firebase/Express/Drizzle/pg runtime, no secrets) | `npm run lint` | **PASS** (0 TS errors) |
| 4 | Production build | `npm run build` | **PASS** (warning only: >500 kB chunk, same as original) |
| 5 | Unit tests | `npm test` | **PASS 41/41** (parser 8, export 3, mappers 5, env 4, auth facade 16, apiClient 5) |
| 6 | DB security / RLS / RPC / transactions | `npm run test:db` | **PASS 52/52** (security 24, rpc 23, transactions 5) |
| 7 | Differential parity vs original server code | `ORIGINAL_ROOT=… tsx tests/parity/diff-original.ts` | **PASS 48/48** checks over 10 scenarios (Chrome import merge/replace/twice/malformed/empty/5,000 rows; sync-local into empty/seeded cloud) |
| 8 | E2E guest flows, same spec on both builds | `npx playwright test` | **PASS 22/22** (11 scenarios × {original, v2}) |
| 9 | Visual parity | `node tests/visual/compare.mjs` | **PASS 42/42 pixel-identical** (0 differing pixels) |
| 10 | Mutation checks (the tests detect weakening) | manual, see SECURITY_REPORT | security: 4 tests failed when the DB was weakened. Parity: 5 checks failed when the dedupe rule was broken. Both restored afterwards |

Performance (from #6): a 5,000-bookmark REPLACE import commits in one transaction in ~2.3 s on local PostgreSQL.

## Details

### 7. Differential parity (original Drizzle code vs V2 RPCs, separate DBs, identical input)
Compared: summary counters, root categories (name/icon/order), subcategories (parent/name/icon/order), bookmarks in display order (title/url/root/sub/favorite/description), quick shortcuts.
Examples: merge of 5,000 into a seeded workspace gives `{addedCategories:250, addedBookmarks:1225, skippedDuplicates:3775}` from **both** implementations. The second import of the same file gives `addedBookmarks:0, skippedDuplicates:12` from both.

### 8. E2E scenarios (each run against the original AND V2)
seeded render and counts · add website · pin/unpin + favorites view · delete · search · batch select-all + unpin · add shortcut · Chrome HTML import (guest) · export HTML + CSV downloads · theme persists across reload · unknown share link → not-found view.

## BLOCKED (not run) — exact blockers
| Test | Blocker |
|---|---|
| Creating the isolated Supabase dev project; applying migrations to it | No Supabase account or credentials available in this session. The migrations are ready (`supabase/migrations`) |
| Live Supabase Auth: email sign-up/confirmation/login/logout/reset, Google OAuth, token expiry, account switching | Needs a Supabase project, a Google OAuth client, and interactive browser login |
| E2E of signed-in flows: AccountSyncModal (4 choices), cloud CRUD through PostgREST, publish/open anonymously/revoke share in the browser | Same: no live Data API. Covered instead at the DB level (#6, #7) and the adapter level (#5) |
| Running the real PostgREST / GoTrue binaries locally | Downloading them was blocked by the environment's policy, and no Docker daemon is available |
| Visual capture of signed-in screens | Requires a live backend for both the original (Firebase) and V2 |
| Linked Chrome file (File System Access picker, auto-watch) | Needs a real user gesture and OS file picker |
| Firefox / Safari / Figma Make preview | Only Chromium available; Figma Make not tested |

## Outstanding defects / notes
- No functional defects are open in the tested scope.
- Bundle size warning (>500 kB) is inherited from the original. It was intentionally left unchanged to avoid visual or behaviour drift.
- `npm audit` reports advisories in dev-only tooling. They were not triaged.
