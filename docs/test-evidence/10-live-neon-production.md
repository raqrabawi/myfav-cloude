# Live Neon verification — production branch — 17 Nov 2026

Target: project `MyFav` (`raspy-butterfly-68832580`), branch **`production`** (`br-raspy-wind-be816ncw`), database `neondb`.

## Setup applied
| Item | Result |
|---|---|
| Managed Better Auth | already enabled (by `neon deploy`); configured: email/password, **required email verification (6-digit code)** on sign-up and sign-in, revoke sessions on password reset, localhost allowed, Google (Neon shared dev credentials) |
| Data API | enabled with Neon Auth: `https://ep-icy-firefly-be63sv9l.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1` (schema `public`, anon role `anonymous`) |
| `db/migrations/0001` (53 statements) + `0002` (25 statements) | applied in transactions, no errors |
| Schema cache | refreshed |
| Catalogue | 5 tables, 5 with RLS, 20 policies, 13 public functions, 9 triggers; `anonymous` can execute only `get_public_share`, 0 table grants |

## Verification without residue
All checks ran in **one transaction**, which created 3 temporary Neon Auth users (A and B verified, U unverified), simulated Data API requests (`role` + JWT claims), recorded results, and then raised an exception, so **everything rolled back**. Afterwards: 0 users, 0 rows in every table.

| # | Check | Result |
|---|---|---|
| 1 | Unverified user writes | PASS — `Email address is not verified` (re-run; see note) |
| 2 | A: categories, subcategory, bookmarks, shortcut, share, Chrome import merge | PASS — `{addedCategories:1, addedBookmarks:1, skippedDuplicates:1}` |
| 3 | A: batch edit (move + unpin) | PASS |
| 4 | A: category tree reorder | PASS |
| 5 | B: can see A's rows | PASS — 0 |
| 6 | B: hijack A's share link | PASS — rejected |
| 7 | A: move bookmark into B's category | PASS — rejected |
| 8 | A: insert row owned by B | PASS — RLS violation |
| 9 | A's data after all of B's update/delete/clear attempts | PASS — intact (3 bookmarks) |
| 10 | anonymous: read a table | PASS — denied |
| 11 | anonymous: call a write RPC | PASS — denied |
| 12 | anonymous: public share | PASS — whitelisted fields, `ownerId:""`, `javascript:` URL removed |
| 13 | anonymous: unknown share | PASS — null |

Note on #1: in the first combined run, the first `auth.uid()` call in that direct session returned NULL, so the request was refused as "Not authenticated" rather than "not verified". It was still blocked; the failure is safe. A dedicated re-run returned the correct uid on the first and second calls and produced `Email address is not verified`. The same intermittent behaviour was seen once on `v2-dev`. It affects only the claims fallback used for direct SQL sessions; the Data API validates signed JWTs through a different path. Keep an eye on "Not authenticated" errors during the first browser tests.

## Not covered (needs a machine that can reach Neon)
A real browser or HTTP round-trip: SDK sign-up → 6-digit code → sign-in, Google, password reset, Data API calls with real JWTs. Run `npm run auth:smoke -- <your inbox>` and `npm run dev` locally.
