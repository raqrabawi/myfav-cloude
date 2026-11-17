# MyFav V2

A Supabase-first rebuild of **MyFav — Personal Web Curator**. The user interface is the original MyFav UI, unchanged (verified pixel-identical; see `VISUAL_PARITY.md`). Underneath, Firebase Auth, the Express API, Drizzle and the self-managed PostgreSQL server are replaced by **Supabase Auth + PostgreSQL + Row Level Security + transactional RPCs**.

> The original MyFav repository, Firebase project and database are **not touched** by this project. Use a **new, isolated Supabase project**. Never point V2 at the original production database.

## Architecture
```
Browser (React 19 + Vite + Tailwind 4 + Lucide + Motion — original UI)
 ├─ src/App.tsx, src/components/*        original UI (unchanged except 4 import lines + 1 OAuth line)
 ├─ src/lib/auth.ts                      Supabase Auth adapter with the Firebase-compatible surface the UI uses
 ├─ src/lib/apiClient.ts                 same exported contract as the original apiClient → Supabase tables/RPCs
 ├─ src/lib/repositories/mappers.ts      snake_case rows ⇄ original camelCase domain types
 ├─ src/lib/supabaseClient.ts            client + startup env validation (refuses secret keys)
 └─ src/components/PasswordRecoveryModal.tsx   V2-only (Firebase hosted this page itself)
Supabase
 ├─ supabase/migrations/…_schema.sql     tables, CHECKs, composite FKs, deferred relation triggers, RLS
 └─ supabase/migrations/…_rpc.sql        transactional RPCs (import, sync, tree reorder, delete, batch, share…)
```
No server of your own is needed: deploy the static `dist/` folder.

## 1. Supabase setup (new dev project)
1. Create a new project at supabase.com. Do not reuse the original database.
2. Apply the migrations, either with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   or by pasting the two files from `supabase/migrations/` into the SQL editor, in order.
   **Do not** apply `supabase/tests/shim/*`: it is for local plain-PostgreSQL testing only.
3. **Authentication → Providers → Email:** enabled. **Confirm email: ON** (the security model requires verified emails). Minimum password length 6 or more.
4. **Authentication → Providers → Google:** enable it, then paste a Google OAuth client ID and secret. In Google Cloud Console, add the authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
5. **Authentication → URL Configuration:** set the Site URL to your production origin. Add every origin you use to *Redirect URLs*, for example `http://localhost:3000/**` and `https://myfav.example.com/**`. Sign-in, confirmation and password-reset links return to these.
6. Run **Advisors → Security Advisor** after migrating.

## 2. Local development
```bash
cp .env.example .env.local     # set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm ci
npm run dev                    # http://localhost:3000
```
Without the env vars the app still runs in guest (local-only) mode and logs a configuration error.

## 3. Build & deploy
```bash
npm run build                  # outputs dist/
```
Host `dist/` on any static host (Vercel, Netlify, Cloudflare Pages, Supabase-adjacent hosting…):
- configure an SPA fallback (all paths → `index.html`); share links use `/?share=<id>`
- set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (and optionally `VITE_GA_MEASUREMENT_ID`, `VITE_GTM_ID`) as **build-time** env vars
- add the deployed origin to Supabase Redirect URLs
- recommended CSP `connect-src`: `https://<ref>.supabase.co wss://<ref>.supabase.co https://www.google-analytics.com`

**Figma Make:** copying this code into Figma Make does **not** configure env vars, OAuth redirects or a Supabase project. Set those up there separately. Compatibility with Figma Make has not been verified.

## 4. Tests
| Command | What |
|---|---|
| `npm run lint` | typecheck + check that no Firebase/Express/Drizzle/pg runtime or hard-coded secrets are present |
| `npm test` | unit tests (parser, export, mappers, auth adapter, apiClient, env validation) |
| `bash scripts/local-db.sh && npm run test:db` | RLS / security / RPC / transaction tests on a local PostgreSQL (env `PGHOST`, `PGPORT`, `PGUSER`) |
| `ORIGINAL_ROOT=../MyFav-main $ORIGINAL_ROOT/node_modules/.bin/tsx tests/parity/diff-original.ts` | differential test: original server import/sync code vs V2 RPCs |
| `npx playwright test` | the same guest E2E spec against the original build (`ORIG_URL`) and the V2 build (`V2_URL`) |
| `node tests/visual/compare.mjs` | pixel diff of 42 screens/viewports/themes, original vs V2 |

Results: `TEST_REPORT.md`. Security: `SECURITY_REPORT.md`. Feature mapping: `FEATURE_PARITY.md`.

## Route → Supabase mapping
See the header comment in `src/lib/apiClient.ts`. Every original Express route has an equivalent, and every multi-record operation is a single-transaction RPC.
