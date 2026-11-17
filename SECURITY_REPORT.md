# SECURITY_REPORT.md — MyFav V2 (Supabase)

## Model
- **Identity:** Supabase Auth (`auth.users`). The browser holds only the public URL and the publishable/anon key. Startup validation refuses `sb_secret_…` and service-role JWTs (`src/lib/supabaseClient.ts`, unit-tested).
- **Authorization:** PostgreSQL Row Level Security on all 5 tables. Every policy requires `owner_id = auth.uid()` **and** `private.is_verified()`, meaning the email is confirmed (security_spec invariant 1).
- **No anonymous table access.** `anon` has no table privileges at all. The only anonymous entry point is `public.get_public_share(share_id)`: `SECURITY DEFINER`, `search_path = ''`, a single-id lookup, published rows only, and whitelisted fields. It returns `ownerId` as `""`.
- **RPCs:** every write RPC is `SECURITY INVOKER` (RLS applies to each statement), pins `search_path = ''`, takes the owner from `auth.uid()` (never from input) and runs in one transaction. Multi-record RPCs take a per-user advisory lock. Execute rights are revoked from `public`/`anon` and granted to `authenticated` only. Default privileges prevent future functions in `public` from being exposed to `anon`.
- **Helpers** live in schema `private`, which is not exposed through the Data API.

## Database constraints
| Rule | Mechanism |
|---|---|
| ID format `^[A-Za-z0-9_-]{1,128}$` | CHECK on every id / reference column |
| Per-owner keys | composite PK `(owner_id, id)`; FKs `(owner_id, category_id)` → categories |
| Bookmark → own **root** category; subcategory belongs to that root | deferred constraint trigger `bookmarks_relations` + composite FK |
| Exactly 2 levels, parent is own root, no orphan children | deferred constraint trigger `categories_relations` |
| Shares reference own root category; `category_id` immutable | deferred trigger + BEFORE UPDATE trigger + composite FK |
| `owner_id`, `id`, `created_at` immutable; `created_at`/`updated_at` server-assigned | BEFORE INSERT/UPDATE trigger |
| Lengths: title ≤120 (shortcut ≤80), url ≤500, description ≤400, name ≤80, custom icon ≤500 | CHECK |
| URL must be `http(s)://` (case-insensitive) | CHECK `private.is_http_url` |
| Enums: theme, glass, density, icon type; favicon ⇒ empty custom icon; colour `^[A-Za-z0-9#]{1,32}$` | CHECK |
| Share snapshot: arrays, ≤100 subcategories, ≤500 bookmarks, ≤600 KB, exact key whitelist, typed values, http(s) URLs | CHECK `private.is_valid_share_snapshot` |
| Import size limits | 50,000 bookmarks / 5,000 categories per plan |

## security_spec.md "Dirty Dozen" → results (`tests/db/security.test.ts`, real PostgreSQL 16)
| # | Attack | V2 defence | Result |
|---|---|---|---|
| 1 | Owner spoofing on create | RLS `WITH CHECK owner_id = auth.uid()` | **PASS** (rejected) |
| 2 | Unverified email write | RLS + `require_uid()` check `email_confirmed_at` | **PASS** (table and RPC rejected; reads return 0 rows) |
| 3 | Shadow field `isAdmin` | No such column (PostgREST rejects unknown columns, PGRST204; SQL 42703) | **PASS** |
| 4 | Orphan bookmark | composite FK + deferred trigger | **PASS** |
| 5 | Cross-tenant move | composite FK `(owner_id, category_id)` | **PASS** (table + batch RPC) |
| 6 | `ownerId` tampering | immutability trigger | **PASS** |
| 7 | `createdAt` backdating | immutability trigger | **PASS** |
| 8 | Forged timestamps on create | server overwrites with `now()` | **PASS** (Firestore rejected these; V2 discards them, which is equally protective) |
| 9 | 10,000-char description | CHECK (table) / truncation to 400 (RPC, same as original server) | **PASS** |
| 10 | `javascript:` URL | CHECK + RPC validation; also `JAVASCRIPT:`, `data:`, `ftp:`, `https://` (empty host) | **PASS** |
| 11 | ID poisoning | CHECK; RPC replaces bad ids with generated ones | **PASS** |
| 12 | Unfiltered cross-user list | RLS | **PASS** (only own rows) |

Plus: two-user isolation (read/update/delete/RPC with other user's ids → 0 rows affected), anonymous access to all tables / write RPCs / private helpers denied, same client id usable by two users, 3rd hierarchy level, foreign parent, mismatched sub/root, settings enums, snapshot key injection. **24/24 PASS.**

**Mutation check:** the test suite was re-run against a deliberately weakened database (bookmark SELECT policy `using (true)`, relation trigger dropped, URL CHECK dropped). 4 tests failed as expected, and the composite FKs still blocked the cross-tenant moves. The database was then restored from the migrations.

## Transactions (`tests/db/transactions.test.ts`, `rpc.test.ts`)
- A REPLACE import cancelled mid-flight (statement timeout) leaves the previous workspace intact. **PASS**
- An error later in the same request rolls back a completed `clear_workspace`. **PASS**
- Two simultaneous MERGE imports produce no duplicate URLs or root names (advisory lock). **PASS**
- 6 concurrent shortcut creates produce gap-free orders 0..5. **PASS**
- An inconsistent tree move rolls back completely. Batch edit to an invalid target is all-or-nothing. **PASS**

## Improvements over the original runtime
- The original Express server **did not check email verification** (only Firestore rules did, and Firestore wasn't the live store). V2 enforces it in the database.
- Original IDs were global primary keys, so user A could collide with or detect user B's IDs. V2 scopes them per owner.
- The original did not validate subcategory ownership, hierarchy depth or share snapshot shape on the server. V2 does.
- Original share IDs were predictable; V2 uses 128-bit random IDs, and the public read cannot enumerate shares.

## Residual risks / required project settings
- **Auth settings must be configured in the Supabase dashboard:** Confirm email ON, minimum password length ≥ 6, Google provider, Site URL and redirect allow-list (see README). These were not testable here.
- The live Supabase Data API (PostgREST), GoTrue and the hosted `postgres` role privileges were **not** exercised. Tests used plain PostgreSQL 16 with a local shim of `auth.uid()`/roles (`supabase/tests/shim`), which mirrors how PostgREST sets `role` and `request.jwt.claims`. Run `supabase db reset` plus the test suite against a dev project before go-live.
- Run Supabase's Security Advisor after applying the migrations.
- CSP: `index.html` loads Google Fonts and gtag (unchanged from the original). Add a CSP at the host that allows `*.supabase.co`, `fonts.googleapis.com`, `fonts.gstatic.com`, `www.googletagmanager.com`.
