// Builds a Figma-Make-safe upload package of MyFav:
//   dist-figma/myfav-figma-make/      (folder to upload)
//   dist-figma/myfav-figma-make.zip   (same, zipped)
//
// Why: Figma Make's Publish fails with "Server errors detected" when the
// project contains server code (the original app's server.ts / Express /
// pg / Drizzle / Firebase Admin). Uploading files into Figma Make adds and
// replaces, but never deletes, so the package also ships a DELETE list.
// See docs/FIGMA_MAKE.md.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outRoot = join(root, 'dist-figma');
const out = join(outRoot, 'myfav-figma-make');

// Only these go to Figma Make: the browser app and what is needed to build it.
const ROOT_FILES = ['index.html', 'favicon.ico', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
const ROOT_DIRS = ['src', 'public'];

// Never upload: tests, backups, editor leftovers, env files.
const EXCLUDE = [/\.test\.[cm]?[jt]sx?$/, /\.spec\.[cm]?[jt]sx?$/, /-old(\.[\w.]+)?$/, /\.(bak|orig|old)$/, /(^|\/)\.env/, /\.DS_Store$/];

// Paths that must NOT exist in the Figma Make project. Old Firebase/Express
// leftovers caused the publish error on 2026-11-18.
const MUST_NOT_EXIST = [
  'server.ts',
  'server.js',
  'server/',
  'api/',
  'functions/',
  'supabase/',
  'utils/supabase/',
  'src/db/',
  'src/middleware/',
  'src/server/',
  'src/lib/firebase-admin.ts',
  'src/firebase.ts',
  'src/utils/supabase/',
  'firebase-applet-config.json',
  'firebase-blueprint.json',
  'firebase.json',
  'firestore.rules',
  'firestore.rules.test.ts',
  'security_spec.md',
  'metadata.json',
  'bun.lock',
  'drizzle.config.ts',
  'eslint.config.js',
  '.env',
  '.env.local',
  // Not server code, but never needed in Figma Make; they only confuse its AI.
  'src/App-old.tsx',
  'src/lib/auth.ts-old',
  'src/assets/images/myfav_app_logo_1794774931445.jpg',
  'UPLOAD_NOTES.txt',
  'tests/',
  'db/',
  'docs/',
  'scripts/',
  'test-results/',
  'neon.ts',
  'playwright.config.ts',
  'vitest.config.ts',
  'README.md',
  'FEATURE_PARITY.md',
  'SECURITY_REPORT.md',
  'TEST_REPORT.md',
  'VISUAL_PARITY.md',
];

const SERVER_IMPORT =
  /from\s+['"](express|pg|drizzle-orm(\/[^'"]*)?|drizzle-kit|firebase-admin(\/[^'"]*)?|firebase(\/[^'"]*)?|@supabase\/supabase-js|dotenv(\/config)?|node:[\w/]+|fs|path|http|child_process)['"]|require\(\s*['"](express|pg|firebase-admin|fs|path)['"]\s*\)|Deno\.serve|createServer\(/;
const SERVER_DEPS = ['express', 'pg', 'drizzle-orm', 'drizzle-kit', 'firebase', 'firebase-admin', 'dotenv', 'tsx', '@supabase/supabase-js', 'hono'];

const problems = [];
const copied = [];

function excluded(rel) {
  const posix = rel.split(sep).join('/');
  return EXCLUDE.some((re) => re.test(posix));
}

function copyTree(srcDir) {
  for (const name of readdirSync(join(root, srcDir))) {
    const rel = join(srcDir, name);
    const abs = join(root, rel);
    if (statSync(abs).isDirectory()) {
      copyTree(rel);
      continue;
    }
    if (excluded(rel)) continue;
    mkdirSync(join(out, srcDir), { recursive: true });
    cpSync(abs, join(out, rel));
    copied.push(rel.split(sep).join('/'));
  }
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ROOT_FILES) {
  if (!existsSync(join(root, f))) {
    problems.push(`missing required file ${f}`);
    continue;
  }
  cpSync(join(root, f), join(out, f));
  copied.push(f);
}
for (const d of ROOT_DIRS) copyTree(d);

// --- Safety checks on what will be uploaded -------------------------------
for (const rel of copied) {
  for (const bad of MUST_NOT_EXIST) {
    if (bad.endsWith('/') ? rel.startsWith(bad) : rel === bad) problems.push(`${rel}: must not be uploaded to Figma Make`);
  }
  // Build config (vite.config.ts) runs at build time and may use node: modules.
  if ((rel.startsWith('src/') || rel.startsWith('public/')) && /\.(tsx?|jsx?|mjs|cjs)$/.test(rel)) {
    const text = readFileSync(join(out, rel), 'utf8');
    if (SERVER_IMPORT.test(text)) problems.push(`${rel}: contains server-side code (${text.match(SERVER_IMPORT)[0]})`);
  }
}
const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
for (const d of SERVER_DEPS) if (pkg.dependencies?.[d]) problems.push(`package.json: runtime dependency "${d}" is server-side`);
for (const s of ['dev', 'start']) {
  if (/\b(tsx|node)\s+server\b/.test(pkg.scripts?.[s] ?? '')) problems.push(`package.json: script "${s}" starts a server`);
}
if (!/vite\s+build/.test(pkg.scripts?.build ?? '')) problems.push('package.json: "build" must be "vite build"');

if (problems.length) {
  rmSync(outRoot, { recursive: true, force: true }); // never leave a bad package behind
  console.error('Figma Make package check FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// --- Instructions shipped inside the package --------------------------------
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
writeFileSync(
  join(out, 'FIGMA_DELETE_LIST.txt'),
  [
    'Delete these from the Figma Make project if they exist (uploading never deletes files).',
    'Leftover server code here makes Publish fail with "Server errors detected".',
    '',
    ...MUST_NOT_EXIST,
    '',
  ].join('\n')
);
writeFileSync(
  join(out, 'FIGMA_UPLOAD.md'),
  `# MyFav: Figma Make upload (commit ${commit})

1. In Figma Make, **delete** every path listed in \`FIGMA_DELETE_LIST.txt\` that exists in the project.
2. Upload / replace the project files with everything in this folder (keep the same paths).
3. Do not let Figma Make's AI add a backend, connect Supabase, or "fix" code: this app is browser-only and talks to Neon directly.
4. Publish, then check https://myfav.aqrabawi.com shows the expected changes.

Full guide: docs/FIGMA_MAKE.md in https://github.com/raqrabawi/myfav-cloude
`
);
copied.push('FIGMA_DELETE_LIST.txt', 'FIGMA_UPLOAD.md');

try {
  execFileSync('zip', ['-qr', join(outRoot, 'myfav-figma-make.zip'), '.'], { cwd: out });
} catch {
  console.warn('zip not available: folder created without the .zip');
}
console.log(`Figma Make package OK: ${copied.length} files, no server code (commit ${commit}).`);
console.log(`  folder: ${relative(root, out)}`);
console.log(`  zip:    ${relative(root, join(outRoot, 'myfav-figma-make.zip'))}`);
