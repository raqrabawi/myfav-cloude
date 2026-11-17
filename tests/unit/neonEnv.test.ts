import { describe, expect, it } from 'vitest';
import { validateNeonEnv } from '../../src/lib/neonClient';

describe('startup env validation (Neon)', () => {
  it('accepts the https database URL', () => {
    expect(validateNeonEnv('https://ep-floral-violet-bewnf699.c-9.us-east-2.aws.neon.tech/neondb').ok).toBe(true);
  });
  it('allows http only for localhost', () => {
    expect(validateNeonEnv('http://localhost:5173/neondb').ok).toBe(true);
    expect(validateNeonEnv('http://ep-x.aws.neon.tech/neondb').ok).toBe(false);
  });
  it('rejects missing value', () => {
    const r = validateNeonEnv('');
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/VITE_NEON_URL/);
  });
  it('refuses a postgres connection string (contains a password)', () => {
    const r = validateNeonEnv('postgresql://neondb_owner:secret@ep-x.aws.neon.tech/neondb?sslmode=require');
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/connection string/);
  });
  it('refuses credentials, query strings and missing database name', () => {
    expect(validateNeonEnv('https://user:pw@ep-x.aws.neon.tech/neondb').ok).toBe(false);
    expect(validateNeonEnv('https://ep-x.aws.neon.tech/neondb?sslmode=require').ok).toBe(false);
    expect(validateNeonEnv('https://ep-x.aws.neon.tech/').ok).toBe(false);
  });
});

import { DEFAULT_NEON_URL } from '../../src/lib/neonClient';

describe('built-in default (hosts without build-time env, e.g. Figma Sites)', () => {
  it('is a valid public production URL with no credentials', () => {
    expect(validateNeonEnv(DEFAULT_NEON_URL).ok).toBe(true);
    expect(DEFAULT_NEON_URL).toMatch(/^https:\/\/ep-icy-firefly-be63sv9l\.c-9\.us-east-2\.aws\.neon\.tech\/neondb$/);
  });
});
