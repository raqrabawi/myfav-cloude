# Live Neon verification — 17 Nov 2026

Target: project `MyFav` (`raspy-butterfly-68832580`), branch `v2-dev` (`br-proud-breeze-becq3350`), database `neondb`, PostgreSQL 18.7.
Method: SQL executed on the branch through the Neon MCP tools (`run_sql` / `run_sql_transaction`). User requests were simulated exactly as the Data API runs them: `SET LOCAL ROLE authenticated|anonymous` plus the JWT claims (`request.jwt.claims`) for real Neon Auth users created with `create_auth_user`.
Test users: A = `cec01b4c-1cd7-4c8e-9b7c-2ca7d30577e7` (myfav.test.a@example.com), B = `fbd0feef-611f-4ecd-bc73-5609f8811ca4` (myfav.test.b@example.com).

| # | Check | Observed result | Verdict |
|---|---|---|---|
| 1 | Provisioning | Neon Auth (better_auth) + Data API enabled on v2-dev; `production` untouched | OK |
| 2 | Apply `0001` (50 statements) and `0002` (25 statements) in transactions | all succeeded | PASS |
| 3 | Catalogue | 5 tables, 5 with RLS, 20 policies, 13 public functions, 9 triggers; `anonymous` executes only `get_public_share`, 0 table grants | PASS |
| 4 | First RPC call as `authenticated` | `permission denied for schema auth` | **Defect found** |
| 5 | Fix: `private.current_uid()` SECURITY DEFINER wrapper, applied to Neon and to `0001` | RPCs work | FIXED |
| 6 | User A unverified → `myfav_create_category` | `Email address is not verified` (42501) | PASS |
| 7 | A verified (test users only) → create 3 categories, 2 bookmarks, 1 shortcut, publish share | all succeeded; shortcut order 0 | PASS |
| 8 | A merge-imports a plan containing a duplicate (different case) and a `javascript:` URL | `{addedCategories:1, addedBookmarks:1, skippedDuplicates:1}`; existing "Design & UI" reused | PASS |
| 9 | Row counts for A | 4 categories, 3 bookmarks, 1 shortcut, 1 share | PASS |
| 10 | User B reads all tables | 0 rows visible in every table | PASS |
| 11 | B: UPDATE/DELETE on A's rows, `batch_delete`, `delete_category`, `clear_workspace` with A's ids | no rows affected; A still 4/3, 0 rows titled 'pwned' | PASS |
| 12 | B overwrites A's share via `existingShareId` | rejected (FK; no row of B's matches) | PASS |
| 13 | A moves a bookmark into B's category | FK violation `bookmarks_owner_id_category_id_fkey` | PASS |
| 14 | A inserts a category with `owner_id` = B | `new row violates row-level security policy` | PASS |
| 15 | `anonymous` selects from `bookmarks` | `permission denied for table bookmarks` | PASS |
| 16 | `anonymous` calls `myfav_clear_workspace` | `permission denied for function` | PASS |
| 17 | `anonymous` calls `get_public_share(<id>)` | snapshot with `ownerId:""`, `javascript:` bookmark removed, whitelisted keys only | PASS |
| 18 | `anonymous` calls `get_public_share('share_does_not_exist')` | `null` | PASS |
| 19 | Auth config | email/password on, verification required (6-digit code on sign-up and sign-in), revoke sessions on reset, localhost allowed, Google (shared dev credentials) | SET |
| 20 | Data API schema cache | refreshed after migrations | OK |

Observation: one early impersonation attempt returned a null `auth.uid()`. It did not reproduce in later runs (including switching users on the same backend). This applies only to direct sessions; Data API requests use signed JWTs.

Not covered here (needs a browser that can reach Neon): real sign-up/sign-in/Google/reset round-trips and Data API HTTP calls.
