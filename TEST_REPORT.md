# TEST_REPORT.md — MyFav V2 (Neon)

**Date:** 17 Nov 2026. Every result below comes from a command or query that was actually run. Nothing is claimed for tests that were not run. Raw logs: `docs/test-evidence/`.

## Environment
- Linux, Node 22, npm 10
- Local: PostgreSQL 16 + `db/tests/shim/00_local_neon_shim.sql`, which mirrors Neon:
  - `authenticated`/`anonymous` roles and `neon_auth."user"`
  - `auth.uid()` from JWT claims
  - **no USAGE on schema `auth`**, like Neon
- Live: Neon project `MyFav`, branch `v2-dev` (PostgreSQL 18.7), reached through the Neon MCP tools
- Playwright 1.63 / Chromium; original reference = `MyFav-main.zip`, built unmodified

## Summary
| # | Suite | Command | Result |
|---|---|---|---|
| 1 | UI-source identity vs original | `diff -ru` (`docs/UI_DIFF_vs_original.patch`) | 14/17 original components byte-identical; 3 differ by one type import; App.tsx by imports + 1 line. Two V2-only dialogs added (verification code, password reset) |
| 2 | Migrations on a clean DB | `bash scripts/local-db.sh` | **PASS** |
| 3 | Typecheck + forbidden-content check | `npm run lint` | **PASS** |
| 4 | Production build | `npm run build` | **PASS** (>500 kB chunk warning, inherited from the original) |
| 5 | Unit tests | `npm test` | **PASS 50/50** (parser 8, export 3, mappers 5, Neon env 5, auth adapter 24, apiClient 5) |
| 6 | DB security / RLS / RPC / transactions (Neon-equivalent permissions) | `npm run test:db` | **PASS 52/52** |
| 7 | Differential parity vs original server code | `tsx tests/parity/diff-original.ts` | **PASS 48/48** checks over 10 scenarios (incl. 5,000-bookmark imports) |
| 8 | E2E guest flows, same spec on both builds | `npx playwright test` | **PASS 22/22** |
| 9 | Visual parity | `node tests/visual/compare.mjs` | **PASS 42/42 pixel-identical** |
| 10 | **Live Neon** database checks, `v2-dev` | Neon MCP (`docs/test-evidence/09-live-neon.md`) | **PASS** (20 checks; 1 defect found and fixed) |
| 10b | **Live Neon** database checks, `production` | Neon MCP, single rolled-back transaction (`docs/test-evidence/10-live-neon-production.md`) | **PASS 13/13**; branch left empty |
| 10c | Real-user sign-up script (`npm run auth:smoke`) | exercised against a local mock of Neon Auth (sign-up → code → sign-in → get-session) | **PASS** (mock); a run against real Neon needs a machine that can reach Neon |
| 11 | Mutation checks | manual | weakening RLS/constraints → 4 security tests fail. Breaking import dedupe → 5 parity checks fail. Removing the Neon `auth`-schema fix → 21 RPC tests fail. All restored |

## Defect found during the Neon migration
`permission denied for schema auth` on every RPC (Neon's API roles can't look up names in schema `auth`). It was fixed with `private.current_uid()`. The local shim was tightened so the suite now catches this (see SECURITY_REPORT).

## BLOCKED (not run) — exact blockers
| Test | Blocker |
|---|---|
| Browser E2E against live Neon: sign-up → 6-digit code → sign-in, Google OAuth, password-reset link, Data API HTTP calls, AccountSyncModal with real cloud data | This environment's network allowlist blocks every Neon host (Postgres and HTTPS). Artifact pages also can't call external hosts. Run `npm run dev` locally (README §1) to complete this check |
| Visual capture of signed-in screens | needs the above |
| Linked Chrome file (File System Access picker) | needs a real user gesture + OS picker |
| Firefox / Safari / Figma Make | only Chromium available; Figma Make not tested |
| Real sign-up against Neon (`npm run auth:smoke`) | network block here; run it locally |

## Notes
- No functional defects are open in the tested scope.
- `npm audit` advisories in dev-only tooling were not triaged.
