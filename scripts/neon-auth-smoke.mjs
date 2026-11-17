#!/usr/bin/env node
/**
 * Neon Managed Better Auth smoke test — signs up a REAL user on the branch in
 * NEON_AUTH_BASE_URL, then reads the current user back from the session.
 * Uses the same Better Auth endpoints the @neon/neon-js SDK calls
 * (POST /sign-up/email, GET /get-session), per Neon's Data API docs.
 *
 * Never prints secrets: the generated password, session cookie and JWT stay
 * in memory; only the user id/email/verification state and "JWT issued: yes"
 * are shown.
 *
 *   npm run auth:smoke                       # random test address
 *   npm run auth:smoke -- you+test@mail.com  # a real inbox (needed if the
 *                                            # branch requires email codes)
 */
import { randomBytes } from 'node:crypto';

const base = String(process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/+$/, '');
const origin = process.env.NEON_AUTH_TEST_ORIGIN || 'http://localhost:3000';
const allowAnyUrl = process.env.NEON_AUTH_SMOKE_ALLOW_ANY_URL === '1'; // local mock tests only
if (!allowAnyUrl && !/^https:\/\/[^/]+\.neonauth\.[^/]+\/.+\/auth$/.test(base)) {
  console.error('NEON_AUTH_BASE_URL is missing or not a Neon Auth URL (expected https://<ep>.neonauth.<region>.../<db>/auth). Check .env.local.');
  process.exit(2);
}

const email = process.argv[2] || `myfav.smoke.${Date.now()}@example.com`;
const password = randomBytes(18).toString('base64url'); // never printed
const name = 'MyFav Smoke Test';

const cookieJar = new Map();
function keepCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) cookieJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookieJar.size ? { Cookie: cookieHeader() } : {}),
      ...(init.headers || {}),
    },
    });
  } catch (err) {
    console.error(`   Could not reach Neon Auth (${err?.cause?.code || err?.message || 'network error'}). Check your internet connection / VPN.`);
    process.exit(3);
  }
  keepCookies(res);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

const redact = (s) => String(s ?? '').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>');

console.log(`Neon Auth: ${new URL(base).host}`);
console.log(`1) Sign up ${email} ...`);
const signUp = await call('/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ email, password, name, callbackURL: origin }),
});
if (!signUp.res.ok) {
  console.error(`   FAILED (${signUp.res.status}): ${redact(signUp.body?.message || signUp.body?.code || 'no message')}`);
  process.exit(1);
}
const createdId = signUp.body?.user?.id;
console.log(`   OK — user created: id=${createdId ?? '?'}`);
if (!signUp.body?.token) {
  console.log('   No session yet: this branch requires email verification.');
  console.log('   Enter the 6-digit code in the app (or use a real inbox and the app\'s verification dialog), then sign in.');
  process.exit(0);
}

console.log('2) Read the current user back (GET /get-session) ...');
const session = await call('/get-session', { method: 'GET' });
const user = session.body?.user;
const jwtIssued = Boolean(session.res.headers.get('set-auth-jwt'));
if (!session.res.ok || !user) {
  console.error(`   FAILED (${session.res.status}): no user in session`);
  process.exit(1);
}
const same = user.id === createdId && String(user.email).toLowerCase() === email.toLowerCase();
console.log(`   OK — current user: id=${user.id} email=${user.email} name="${user.name}" emailVerified=${user.emailVerified}`);
console.log(`   Data API JWT issued: ${jwtIssued ? 'yes' : 'no'} (value not printed)`);
console.log(same ? '\nPASS: signed up a real user and read the same user back.' : '\nFAIL: session user does not match the created user.');
process.exit(same ? 0 : 1);
