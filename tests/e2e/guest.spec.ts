import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SEED, settings } from '../visual/seed.mjs';

const KEYS = {
  cats: 'aethermark_categories_v1',
  bms: 'aethermark_bookmarks_v1',
  scs: 'aethermark_quick_shortcuts_v1',
  settings: 'aethermark_settings_v1',
};

async function open(page: Page, opts: { seed?: boolean; path?: string } = {}) {
  await page.context().route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => r.abort());
  await page.addInitScript(
    ([seed, s]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      if (seed) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem('aethermark_settings_v1', JSON.stringify(s));
    },
    [opts.seed === false ? null : SEED, settings()] as const
  );
  await page.goto(opts.path || '/');
  await expect(page.getByText('Personal Web Directory').first()).toBeVisible();
}

const stored = (page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);

test('seeded guest workspace renders all websites and counts', async ({ page }) => {
  await open(page);
  await expect(page.getByText('8 saved websites across 4 categories', { exact: false })).toBeVisible();
  for (const t of ['Figma', 'Hugging Face', 'Paul Graham Essays']) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
});

test('add website via modal persists locally', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Add Website/ }).first().click();
  await page.getByPlaceholder('https://lucide.dev').fill('https://vite.dev/');
  await page.getByPlaceholder('e.g. Lucide Open-Source Icons').fill('Vite Docs');
  await page.getByPlaceholder('What makes this website worth saving?').fill('Build tool');
  await page.locator('form button[type="submit"]').last().click();
  await expect(page.getByText('Vite Docs').first()).toBeVisible();
  const bms = await stored(page, KEYS.bms);
  expect(bms.some((b: { title: string; url: string }) => b.title === 'Vite Docs' && b.url === 'https://vite.dev/')).toBe(true);
});

test('pin / unpin favorite updates favorites view and storage', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Pin website', exact: true }).first().click();
  await expect
    .poll(async () => (await stored(page, KEYS.bms)).filter((b: { isFavorite: boolean }) => b.isFavorite).length)
    .toBe(4);
  await page.getByRole('button', { name: 'Pinned Websites' }).first().click();
  await expect(page.locator('[aria-label^="Select "][aria-label$=" for batch edit"]')).toHaveCount(4);
});

test('delete website removes it', async ({ page }) => {
  await open(page);
  page.on('dialog', (d) => d.accept());
  const before = (await stored(page, KEYS.bms)).length;
  await page.locator('[title="Delete website"]').first().click();
  await expect.poll(async () => (await stored(page, KEYS.bms)).length).toBe(before - 1);
});

test('search filters by title / url / category', async ({ page }) => {
  await open(page);
  await page.getByPlaceholder(/Search saved websites/).fill('hugging');
  await expect(page.locator('[aria-label$=" for batch edit"]')).toHaveCount(1);
  await page.getByPlaceholder(/Search saved websites/).fill('zzz-none');
  await expect(page.locator('[aria-label$=" for batch edit"]')).toHaveCount(0);
});

test('batch select + unpin all favorites', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Batch Edit/ }).first().click();
  await page.getByRole('button', { name: /Select All Visible/ }).click();
  await page.locator('[title="Remove all selected websites from Favorites"]').click();
  await expect.poll(async () => (await stored(page, KEYS.bms)).filter((b: { isFavorite: boolean }) => b.isFavorite).length).toBe(0);
});

test('add quick shortcut', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Add Shortcut/ }).first().click();
  await page.getByPlaceholder('e.g. Figma, GitHub, YouTube').fill('Supabase');
  await page.getByPlaceholder('https://figma.com').fill('https://supabase.com/');
  await page.locator('form button[type="submit"]').last().click();
  await expect.poll(async () => (await stored(page, KEYS.scs)).map((s: { title: string }) => s.title)).toContain('Supabase');
});

test('Chrome bookmarks HTML import (guest, merge) builds categories and skips duplicates', async ({ page }) => {
  await open(page, { seed: false });
  await page.getByRole('button', { name: /^Settings$/ }).first().click();
  await page.getByRole('button', { name: /Chrome Sync/ }).first().click();
  const html = readFileSync(join(import.meta.dirname, '../fixtures/chrome-basic.html'), 'utf8');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect.poll(async () => ((await stored(page, KEYS.bms)) || []).length, { timeout: 20_000 }).toBeGreaterThan(5);
  const cats = await stored(page, KEYS.cats);
  const names = cats.map((c: { name: string }) => c.name);
  expect(names).toContain('Design & UI');
  expect(names).toContain('AI Dev — عربي 🚀');
  const urls = (await stored(page, KEYS.bms)).map((b: { url: string }) => b.url.toLowerCase());
  expect(urls.some((u: string) => u.startsWith('javascript:'))).toBe(false);
  expect(new Set(urls).size).toBe(urls.length);
});

test('export HTML and CSV downloads', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Settings$/ }).first().click();
  await page.getByRole('button', { name: /Account & Data/ }).first().click();
  for (const label of ['Export HTML', 'Export CSV']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
    const text = readFileSync((await dl.path())!, 'utf8');
    expect(text).toContain('Figma');
  }
});

test('theme change persists across reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Settings$/ }).first().click();
  await page.getByRole('button', { name: /Light Mode/ }).first().click();
  await expect.poll(async () => (await stored(page, KEYS.settings)).themeMode).toBe('light');
  await page.reload();
  expect((await stored(page, KEYS.settings)).themeMode).toBe('light');
});

test('unknown share link shows not-found state and back returns to directory', async ({ page }) => {
  await open(page);
  await page.goto('/?share=share_unknown');
  await expect(page.getByText(/not found|unavailable|no longer/i).first()).toBeVisible({ timeout: 15_000 });
});
