// Fails if the V2 runtime still references the removed original backend stack
// or contains likely hard-coded secrets.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const forbiddenDeps = ['firebase', 'firebase-admin', 'express', 'drizzle-orm', 'drizzle-kit', '@google/genai', 'dotenv', '@supabase/supabase-js'];
const problems = [];
for (const d of forbiddenDeps) {
  if (pkg.dependencies?.[d]) problems.push(`runtime dependency "${d}" must not be present`);
}
if (pkg.dependencies?.pg) problems.push('runtime dependency "pg" must not be present (test-only devDependency is allowed)');

const forbiddenImport = /from\s+['"](firebase(\/[^'"]*)?|firebase-admin(\/[^'"]*)?|express|drizzle-orm(\/[^'"]*)?|pg|@supabase\/supabase-js)['"]/;
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /service_role/i,
  /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
  /npg_[A-Za-z0-9]{8,}/, // Neon role password
  /postgres(ql)?:\/\/[^\s'"]+:[^\s'"@]+@/, // connection string with password
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs|js|html|json)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      const rel = relative(root, p);
      if (forbiddenImport.test(text)) problems.push(`${rel}: imports a removed backend package`);
      for (const re of secretPatterns) {
        // neonClient.ts legitimately mentions these patterns to *reject* them.
        if (rel.endsWith('neonClient.ts')) continue;
        if (re.test(text)) problems.push(`${rel}: matches secret pattern ${re}`);
      }
    }
  }
}
walk(join(root, 'src'));
walk(join(root, 'public'));
for (const f of ['index.html', 'vite.config.ts']) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const re of secretPatterns) if (re.test(text)) problems.push(`${f}: matches secret pattern ${re}`);
}

if (problems.length) {
  console.error('Forbidden-content check FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('Forbidden-content check passed (no Firebase/Express/Drizzle/pg/Supabase runtime, no hard-coded secrets).');
