# SECURITY_REPORT.md — MyFav V2 (Neon)

## Model
- **Identity:** Neon Managed Better Auth (users in `neon_auth."user"`). The browser holds only the public HTTPS database URL. Startup validation refuses `postgres://` connection strings, embedded credentials and query strings (`src/lib/neonClient.ts`, unit-tested).
- **Requests:** the Neon Data API verifies the JWT against Neon Auth's JWKS and runs each request as role `authenticated` (signed in) or `anonymous` (signed out, short-lived anonymous JWT). `auth.uid()` (pg_session_jwt) returns the JWT `sub`.
- **Authorization:** Postgres Row Level Security on all 5 tables. Every policy requires `owner_id = auth.uid()` **and** `private.is_verified()`, meaning `neon_auth."user"."emailVerified"` is true (security_spec invariant 1).
- **No anonymous table access.** `anonymous` has no table privileges. Its only entry point is `public.get_public_share(share_id)`: `SECURITY DEFINER`, `search_path = ''`, a single-id lookup, published rows only, and whitelisted fields. It returns `ownerId` as `""`.
- **RPCs:** every write RPC is `SECURITY INVOKER` (RLS applies to each statement), pins `search_path = ''`, takes the owner from the JWT (never from input) and runs in one transaction. Multi-record RPCs take a per-user advisory lock. Execute rights are revoked from `public`/`anonymous` and granted to `authenticated` only. Default privileges stop future `public` functions from being exposed to `anonymous`.
- **Helpers** live in schema `private`, which the Data API does not expose (it exposes `public` only).

### Neon-specific finding (fixed)
On Neon the API roles may **execute** `auth.uid()` but have **no USAGE on schema `auth`** (owned by `cloud_admin`; `neondb_owner` cannot grant it). Policies and column defaults are unaffected because they store function references by internal ID. PL/pgSQL, however, resolves names when it runs, so every RPC failed with `permission denied for schema auth`. **Fix:** `private.current_uid()`, a 1-line `SECURITY DEFINER` wrapper that returns the caller's own JWT subject. `require_uid()` uses it. The local test shim now reproduces Neon's exact permissions, so this cannot regress unnoticed. A mutation test confirmed it: without the fix, 21 of 23 RPC tests fail.

## Database constraints
| Rule | Mechanism |
|---|---|
| ID format `^[A-Za-z0-9_-]{1,128}$` | CHECK on every id / reference column |
| Per-owner keys | composite PK `(owner_id, id)`; FKs `(owner_id, category_id)` → categories |
| Owner must be a real Neon Auth user; data removed with the user | FK `owner_id → neon_auth."user"(id) ON DELETE CASCADE` |
| Bookmark → own **root** category; subcategory belongs to that root | deferred constraint trigger + composite FK |
| Exactly 2 levels, parent is own root, no orphan children | deferred constraint trigger |
| Shares reference own root category; `category_id` immutable | deferred trigger + BEFORE UPDATE trigger + composite FK |
| `owner_id`, `id`, `created_at` immutable; timestamps server-assigned | BEFORE INSERT/UPDATE trigger |
| Lengths: title ≤120 (shortcut ≤80), url ≤500, description ≤400, name ≤80, custom icon ≤500 | CHECK |
| URL must be `http(s)://` (case-insensitive) | CHECK |
| Enums: theme, glass, density, icon type; favicon ⇒ empty custom icon; colour `^[A-Za-z0-9#]{1,32}$` | CHECK |
| Share snapshot: arrays, ≤100 subcategories, ≤500 bookmarks, ≤600 KB, exact key whitelist, typed values, http(s) URLs | CHECK |
| Import size limits | 50,000 bookmarks / 5,000 categories per plan |

## security_spec.md "Dirty Dozen" → local results (`tests/db/security.test.ts`, PostgreSQL 16 + Neon-equivalent shim)
| # | Attack | Defence | Local | Live Neon |
|---|---|---|---|---|
| 1 | Owner spoofing on create | RLS `WITH CHECK` | PASS | **PASS** (`new row violates row-level security policy`) |
| 2 | Unverified email write | `require_uid()` + RLS on `emailVerified` | PASS | **PASS** (`Email address is not verified`) |
| 3 | Shadow field `isAdmin` | unknown column rejected | PASS | — |
| 4 | Orphan bookmark | composite FK + deferred trigger | PASS | — |
| 5 | Cross-tenant move | composite FK | PASS | **PASS** (FK violation) |
| 6 | `ownerId` tampering | immutability trigger | PASS | — |
| 7 | `createdAt` backdating | immutability trigger | PASS | — |
| 8 | Forged timestamps on create | server overwrites | PASS | — |
| 9 | 10,000-char description | CHECK / RPC truncation | PASS | — |
| 10 | `javascript:` URL | CHECK + RPC validation | PASS | **PASS** (dropped from import and from share snapshot) |
| 11 | ID poisoning | CHECK | PASS | — |
| 12 | Unfiltered cross-user list | RLS | PASS | **PASS** (user B sees 0 of A's rows) |

Plus, locally: two-user isolation; anonymous access denied to tables, write RPCs and private helpers; same client id usable by two users; 3rd hierarchy level; foreign parent; mismatched sub/root; settings enums; snapshot key injection. **24/24 PASS.**

Plus, live on Neon:
- B's UPDATE, DELETE, batch delete, category delete and workspace clear affected 0 of A's rows (verified afterwards by row counts).
- B's attempt to overwrite A's share via `existingShareId` was rejected.
- `anonymous`: table read denied, write RPC denied, public share returned the whitelisted snapshot, unknown share returned `null`.
- Catalogue check: 5 tables / 5 with RLS / 20 policies / 13 functions. `anonymous` can execute only `get_public_share` and has 0 table grants.

## Transactions (local)
- A REPLACE import cancelled mid-flight leaves the previous workspace intact. **PASS**
- An error later in the same request rolls back a completed `clear_workspace`. **PASS**
- Two simultaneous MERGE imports produce no duplicates (advisory lock). **PASS**
- Concurrent shortcut creates produce gap-free orders. **PASS**
- An inconsistent tree move rolls back. Batch edit to an invalid target is all-or-nothing. **PASS**
- Live on Neon, the import RPC (which uses a temp table) ran successfully as `authenticated`, with correct merge, duplicate and invalid-URL counts.

## Client-side fix: sign-out left cloud data on the page and in guest storage (2026-11-17)
- **Cause:** the original app's sign-out handler kept the in-memory workspace when the user became `null`. The guest auto-save effects then wrote that cloud workspace into this browser's guest `localStorage`, where it survived reloads.
- **Fix (`src/App.tsx`):** on a signed-in → signed-out change in the same tab, the page reloads the guest workspace from storage in the same render batch as `setUser(null)`, so cloud data is never auto-saved as guest data. Signing out of a cloud-linked account also resets guest storage to empty, which removes any copy left by the earlier bug. Guest data of an account that was never linked is kept.
- **Tests:** `tests/unit/signOutFlow.test.tsx` (3 tests) renders the whole app. With the fix reverted, 2 of the 3 fail.

## Residual risks / required settings
- **Not verified end-to-end in a browser:** JWT issuance by Neon Auth → Data API → RLS. This environment cannot reach Neon over HTTP. Every database rule was verified live by setting the same JWT claims the Data API sets. Please run the app locally (README §1) for the final browser check.
- `auth.uid()`'s fallback to `request.jwt.claims` applies to **direct** database sessions only. The Data API validates real JWTs. Never give end users a direct Postgres role.
- Before production: turn localhost off, set trusted domains, use your own Google OAuth client, and preferably your own email provider (README §2). Run the Data API advisors.
- CSP: `index.html` loads Google Fonts and gtag (unchanged from the original). Add a host CSP allowing the Neon Auth/Data API hosts and those domains.
