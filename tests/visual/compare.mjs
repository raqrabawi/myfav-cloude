/**
 * VISUAL PARITY — original MyFav build vs MyFav V2 build.
 *
 * Drives both apps with identical Playwright steps (guest/local mode, seeded
 * localStorage, fixed clock, external network blocked so fonts/favicons/
 * analytics fall back identically) and pixel-diffs every captured state.
 *
 *   ORIG_URL=http://127.0.0.1:3101 V2_URL=http://127.0.0.1:3102 node tests/visual/compare.mjs
 *
 * Output: tests/visual/output/{original,v2,diff}/<state>.png and results.json
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SEED, settings } from './seed.mjs';

const ORIG = process.env.ORIG_URL || 'http://127.0.0.1:3101';
const V2 = process.env.V2_URL || 'http://127.0.0.1:3102';
const OUT = join(import.meta.dirname, 'output');
for (const d of ['original', 'v2', 'diff']) mkdirSync(join(OUT, d), { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};
const FIXED_NOW = new Date('2026-11-17T09:00:00Z');

/** Each state: seed + actions. `all` = capture at every viewport. */
const STATES = [
  { name: 'home-empty', all: true, seed: null },
  { name: 'home-seeded', all: true },
  { name: 'home-seeded-fullpage', full: true },
  { name: 'category-design', act: async (p) => clickSidebarCategory(p, 'Design & UI') },
  { name: 'favorites', act: async (p) => p.getByRole('button', { name: 'Pinned Websites' }).first().click() },
  { name: 'categories-view', all: true, act: async (p) => p.getByRole('button', { name: /^Categories$/ }).first().click() },
  { name: 'settings', all: true, act: async (p) => p.getByRole('button', { name: /^Settings$/ }).first().click() },
  { name: 'auth-login', all: true, act: async (p) => p.getByRole('button', { name: /Log in/ }).first().click() },
  {
    name: 'auth-register',
    act: async (p) => {
      await p.getByRole('button', { name: /Log in/ }).first().click();
      await p.getByRole('tab', { name: /Create account/ }).click();
    },
  },
  {
    name: 'auth-reset',
    act: async (p) => {
      await p.getByRole('button', { name: /Log in/ }).first().click();
      await p.getByRole('button', { name: 'Forgot password?' }).click();
    },
  },
  {
    name: 'auth-validation-error',
    act: async (p) => {
      await p.getByRole('button', { name: /Log in/ }).first().click();
      await p.getByRole('tab', { name: /Create account/ }).click();
      await p.fill('#auth-email', 'a@b.co');
      await p.fill('#auth-password', '123');
      await p.locator('form button[type="submit"]').click();
    },
  },
  { name: 'add-website-modal', all: true, act: async (p) => p.getByRole('button', { name: /Add Website/ }).first().click() },
  { name: 'add-shortcut-modal', act: async (p) => p.getByRole('button', { name: /Add Shortcut/ }).first().click() },
  { name: 'category-manager', act: async (p) => p.locator('[title="Add or Manage Categories"]').first().click() },
  {
    name: 'batch-edit-selected',
    act: async (p) => {
      await p.getByRole('button', { name: /Batch Edit/ }).first().click();
      await p.getByRole('button', { name: 'Select Figma' }).click();
      await p.getByRole('button', { name: 'Select Hugging Face' }).click();
    },
  },
  { name: 'move-website-modal', act: async (p) => p.locator('[title="Move to another category or subcategory"]').first().click() },
  { name: 'edit-website-modal', act: async (p) => p.locator('[title="Edit website details"]').first().click() },
  { name: 'chrome-sync-empty', seed: null, act: async (p) => p.getByRole('button', { name: /Sync Chrome/ }).last().click() },
  { name: 'compact-density', settings: { cardDensity: 'compact' } },
  { name: 'light-theme', all: true, settings: { themeMode: 'light' } },
  { name: 'theme-rose-frosted', settings: { primaryColor: 'rose', glassIntensity: 'frosted' } },
  { name: 'theme-custom-hex-subtle', settings: { primaryColor: '#14B8A6', glassIntensity: 'subtle' } },
  { name: 'sidebar-expanded', act: async (p) => p.getByRole('button', { name: 'Expand Categories Panel' }).first().click() },
  { name: 'search-no-results', act: async (p) => p.getByPlaceholder(/Search saved websites/).fill('zzzz-not-found') },
  { name: 'search-results', act: async (p) => p.getByPlaceholder(/Search saved websites/).fill('icons') },
  { name: 'shared-link-not-found', path: '/?share=share_does_not_exist', all: true },
];

async function clickSidebarCategory(p, name) {
  await p.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')) }).first().click();
}

async function capture(browser, base, state, vpName) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_NOW);
  const seed = state.seed === null ? null : SEED;
  const s = settings(state.settings || {});
  await page.addInitScript(
    ([seedData, settingsData]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      if (seedData) for (const [k, v] of Object.entries(seedData)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem('aethermark_settings_v1', JSON.stringify(settingsData));
    },
    [seed, s]
  );
  await page.goto(base + (state.path || '/'));
  await page.waitForTimeout(1200);
  let error = null;
  if (state.act) {
    try {
      await state.act(page);
    } catch (e) {
      error = String(e.message || e).split('\n')[0];
    }
  }
  await page.waitForTimeout(1200);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const buf = await page.screenshot({ fullPage: Boolean(state.full), animations: 'disabled', caret: 'hide' });
  await ctx.close();
  return { buf, error };
}

const browser = await chromium.launch();
const results = [];
for (const state of STATES) {
  const vps = state.all ? Object.keys(VIEWPORTS) : ['desktop'];
  for (const vp of vps) {
    const id = `${state.name}--${vp}`;
    const o = await capture(browser, ORIG, state, vp);
    const v = await capture(browser, V2, state, vp);
    writeFileSync(join(OUT, 'original', `${id}.png`), o.buf);
    writeFileSync(join(OUT, 'v2', `${id}.png`), v.buf);
    const a = PNG.sync.read(o.buf);
    const b = PNG.sync.read(v.buf);
    let diffPixels = null;
    let ratio = null;
    if (a.width === b.width && a.height === b.height) {
      const diff = new PNG({ width: a.width, height: a.height });
      diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
      ratio = diffPixels / (a.width * a.height);
      writeFileSync(join(OUT, 'diff', `${id}.png`), PNG.sync.write(diff));
    }
    const status =
      o.error || v.error ? 'ACTION_ERROR' : ratio === null ? 'SIZE_MISMATCH' : diffPixels === 0 ? 'IDENTICAL' : ratio < 0.001 ? 'NEAR_IDENTICAL' : 'DIFFERENT';
    results.push({ id, viewport: vp, size: `${a.width}x${a.height}`, sizeV2: `${b.width}x${b.height}`, diffPixels, ratio, status, origError: o.error, v2Error: v.error });
    console.log(`${status.padEnd(14)} ${id} ${diffPixels ?? ''}${o.error ? ' orig:' + o.error : ''}${v.error ? ' v2:' + v.error : ''}`);
  }
}
await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: 'chromium (Playwright 1.63)', results }, null, 2));
const bad = results.filter((r) => r.status !== 'IDENTICAL');
console.log(`\n${results.length} captures, ${results.length - bad.length} pixel-identical, ${bad.length} not identical`);
void readFileSync;
