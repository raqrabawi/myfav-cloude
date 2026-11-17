# MyFav V2

A rebuild of **MyFav — Personal Web Curator** on **Neon**. The user interface is the original MyFav UI, unchanged (verified pixel-identical; see `VISUAL_PARITY.md`). Underneath, Firebase Auth, the Express API, Drizzle and the self-managed PostgreSQL server are replaced by **Neon Managed Better Auth + Neon Data API + Postgres Row Level Security + transactional RPCs**.

> The original MyFav repository, Firebase project and database are **not touched** by this project.

## Architecture
```
Browser (React 19 + Vite + Tailwind 4 + Lucide + Motion — original UI)
 ├─ src/App.tsx, src/components/*      original UI (unchanged except 4 import lines + 1 sign-in line)
 ├─ src/lib/neonClient.ts              @neon/neon-js (Supabase-compatible adapter) + startup env validation
 ├─ src/lib/auth.ts                    Neon Auth adapter exposing the Firebase-compatible surface the UI uses
 ├─ src/lib/apiClient.ts               same exported contract as the original apiClient → Data API tables/RPCs
 ├─ src/lib/repositories/mappers.ts    snake_case rows ⇄ original camelCase domain types
 ├─ src/components/EmailVerificationModal.tsx   V2-only: 6-digit email code entry
 └─ src/components/PasswordRecoveryModal.tsx    V2-only: choose a new password from the reset link
Neon (project "MyFav", branch v2-dev)
 ├─ Managed Better Auth (users in neon_auth.user; email/password + Google)
 ├─ Data API (PostgREST-compatible; roles authenticated / anonymous; JWT → auth.uid())
 ├─ db/migrations/0001_myfav_v2_schema.sql   tables, CHECKs, composite FKs, deferred relation triggers, RLS
 └─ db/migrations/0002_myfav_v2_rpc.sql      transactional RPCs (import, sync, tree reorder, delete, batch, share…)
```
No server of your own is needed: deploy the static `dist/` folder.

## Current Neon setup (already done)
| Item | Value |
|---|---|
| Project | `MyFav` (`raspy-butterfly-68832580`, AWS us-east-2, Postgres 18) |
| Branch | `v2-dev` (`br-proud-breeze-becq3350`), created from `production`. **`production` is untouched and still empty.** |
| Auth | Managed Better Auth: email/password with **required email verification (6-digit code)**, Google (Neon's shared dev credentials), sessions revoked on password reset, localhost allowed |
| Data API | `https://ep-floral-violet-bewnf699.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1`, exposes `public` only, anon role `anonymous` |
| Migrations | `0001` + `0002` applied; schema cache refreshed |
| App URL value | `VITE_NEON_URL=https://ep-floral-violet-bewnf699.c-9.us-east-2.aws.neon.tech/neondb` |
| Test users | `myfav.test.a@example.com`, `myfav.test.b@example.com` (no password; created for database checks) plus a little test data. Delete them in Neon Console → Auth → Users when you like. |

## 1. Run locally against Neon
```bash
cp .env.example .env.local     # VITE_NEON_URL is pre-filled for the v2-dev branch
npm ci
npm run dev                    # http://localhost:3000 (Neon Auth allows localhost on v2-dev)
```
Without `VITE_NEON_URL` the app still runs in guest (local-only) mode and logs a configuration error.

## 2. Going to production (later, with your approval)
1. Apply `db/migrations/0001…` and `0002…` to the `production` branch, in order. Use the Neon SQL Editor, or `psql "$DATABASE_URL" -f …` from a machine that can reach Neon.
2. Enable **Auth** and the **Data API** on `production` (Neon Console → Auth / Data API). Use Neon Auth as the provider.
3. **Auth settings:**
   - Require email verification, sending a code on sign-up and on sign-in.
   - Revoke sessions on password reset.
   - **Turn localhost off.**
   - Add your production domain to **trusted domains**.
4. **Google:** replace Neon's shared dev credentials with your own Google OAuth client (Neon Console → Auth → OAuth providers). Add the redirect URI that Neon shows there in Google Cloud Console.
5. **Email:** for branded emails or verification *links*, configure a custom email provider. The shared sender (`auth@mail.myneon.app`) supports codes and password-reset links and is meant for development.
6. Run the Data API advisors and refresh the schema cache.

## 3. Build & deploy
```bash
npm run build                  # outputs dist/
```
Host `dist/` on any static host (Vercel, Netlify, Cloudflare Pages…):
- configure an SPA fallback (all paths → `index.html`); share links use `/?share=<id>`, password-reset links return with `/?token=<…>`
- set `VITE_NEON_URL` (and optionally `VITE_GA_MEASUREMENT_ID`, `VITE_GTM_ID`) as **build-time** env vars
- add the deployed origin to Neon Auth trusted domains (and the Data API CORS origins if you restrict them)
- recommended CSP `connect-src`: `https://*.neonauth.<region>.aws.neon.tech https://*.apirest.<region>.aws.neon.tech https://www.google-analytics.com`

**Figma Make:** copying this code into Figma Make does **not** configure env vars, trusted domains or the Neon project. Set those up there separately. Compatibility with Figma Make has not been verified.

## 4. Tests
| Command | What |
|---|---|
| `npm run lint` | typecheck + check that no Firebase/Express/Drizzle/pg/Supabase runtime or hard-coded secrets are present |
| `npm test` | unit tests (parser, export, mappers, Neon auth adapter, apiClient, env validation) |
| `bash scripts/local-db.sh && npm run test:db` | RLS / security / RPC / transaction tests on local PostgreSQL with a Neon-equivalent shim (`db/tests/shim`); env `PGHOST`, `PGPORT`, `PGUSER` |
| `ORIGINAL_ROOT=../MyFav-main $ORIGINAL_ROOT/node_modules/.bin/tsx tests/parity/diff-original.ts` | differential test: original server import/sync code vs V2 RPCs |
| `npx playwright test` | the same guest E2E spec against the original build (`ORIG_URL`) and the V2 build (`V2_URL`) |
| `node tests/visual/compare.mjs` | pixel diff of 42 screens/viewports/themes, original vs V2 |

Results: `TEST_REPORT.md`. Security: `SECURITY_REPORT.md`. Feature mapping: `FEATURE_PARITY.md`.

## Route → Neon mapping
See the header comment in `src/lib/apiClient.ts`. Every original Express route has an equivalent, and every multi-record operation is a single-transaction RPC.
