# Publishing MyFav from Figma Make

The live site **https://myfav.aqrabawi.com** is published from the Figma Make file
**MyFav** (`figma.com/make/wUGM7XcK8ariJdsx6YMn8R`). This repo is the source of truth;
Figma Make only receives copies of the files.

## The rule that keeps Publish working

**The Figma Make project must contain only browser code.** MyFav talks to Neon directly from the
browser (`src/lib/neonClient.ts`), so it has no server of its own.

If the project contains server code, Figma Make's **Publish** fails with
**"Server errors detected"**. That happened on 2026-11-18. Server code means:
- `server.ts`
- Express
- `pg` / Drizzle
- Firebase Admin
- `src/db/`, `src/middleware/`
- Supabase functions

The cause was leftovers from the original Firebase + Express app. Removing them fixed it.

**Uploading files into Figma Make adds and replaces files but never deletes them.** Old files stay
until someone removes them, so every update must also say what to delete.

## How to update the live site

1. Get the package. Use either of these:
   - **Locally:** run `npm run package:figma`. It writes `dist-figma/myfav-figma-make/` and
     `dist-figma/myfav-figma-make.zip`.
   - **From GitHub:** open the latest **CI** run on `main` and download the **myfav-figma-make**
     artifact.
2. In Figma Make, **delete** every path in `FIGMA_DELETE_LIST.txt` that exists in the project.
   The list is inside the package.
3. Upload / replace the files with the package contents, keeping the same paths.
4. **Publish.**
5. Check **https://myfav.aqrabawi.com** shows the change. Opening it in a private window avoids the
   old cached version.

## What the package contains, and what it refuses

`scripts/package-figma.mjs` copies only:
- `index.html`, `favicon.ico`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vite.config.ts`
- `src/`, `public/`

It leaves out:
- tests and `-old` backups
- `.env` files
- `tests/`, `db/`, `docs/`, `scripts/` and the reports

It then **fails** (CI goes red) if any of these is true:
- an uploaded app file imports server-side code: `express`, `pg`, `drizzle-*`, `firebase-admin`,
  `firebase`, `@supabase/supabase-js`, `dotenv`, or `node:`, `fs`, `path`, `http`
- an app file starts a server (`createServer(`, `Deno.serve`)
- `package.json` has a server runtime dependency, or a `dev`/`start` script that runs `server.*`
- the package would include a path from the do-not-upload list
- `build` is not `vite build`

## Don'ts in Figma Make

- Don't let Figma Make's AI **add a backend, connect Supabase, or create `supabase/functions`**.
- Don't ask it to "fix" or rewrite code in general. Upload exact files from this repo instead,
  because its edits can quietly undo changes (for example, revert `App.tsx`).
- Don't keep backup copies such as `App-old.tsx` or `auth.ts-old`. They aren't used, but they
  confuse the AI and make it unclear which file is live.
- No environment variables are needed. The Neon URL is built in (`DEFAULT_NEON_URL`), and Neon
  only allows sign-in from `https://myfav.aqrabawi.com` and `https://raqrabawi.github.io`.
