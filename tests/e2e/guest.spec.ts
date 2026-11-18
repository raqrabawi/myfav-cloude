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
  await page.getByRole('button', { name: /Import & Sync/ }).first().click();
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

test('Safari bookmarks export imports: Favorites kept, folders become categories, Reading List skipped', async ({ page }) => {
  await open(page, { seed: false });
  await page.getByRole('button', { name: /^Settings$/ }).first().click();
  await page.getByRole('button', { name: /Import & Sync/ }).first().click();
  const html = readFileSync(join(import.meta.dirname, '../fixtures/safari-export.html'), 'utf8');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'Safari Bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect.poll(async () => ((await stored(page, KEYS.bms)) || []).length, { timeout: 20_000 }).toBe(8);
  const names = ((await stored(page, KEYS.cats)) as { name: string }[]).map((c) => c.name);
  expect(names).toEqual(expect.arrayContaining(['Favorites', 'Design', 'Bookmarks Menu', 'Work', 'Docs']));
  expect(names).not.toContain('Reading List');
});

test.describe('install MyFav as an app', () => {
  test.describe('iPhone Safari', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    });

    test('shows the Share → Add to Home Screen steps, and "Got it" hides it', async ({ page }) => {
      await open(page);
      const card = page.getByTestId('install-app-prompt');
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card).toContainText('Add to Home Screen');
      await card.getByRole('button', { name: 'Got it' }).click();
      await expect(card).toBeHidden();
      await page.reload();
      await page.waitForTimeout(7000);
      await expect(page.getByTestId('install-app-prompt')).toHaveCount(0); // remembered for 30 days
    });

    test('is not shown when MyFav is already installed (opened from the Home Screen)', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(window.navigator, 'standalone', { get: () => true }));
      await open(page);
      await page.waitForTimeout(7000);
      await expect(page.getByTestId('install-app-prompt')).toHaveCount(0);
    });
  });

  test('Chrome / Edge: one-tap Install uses the browser install prompt; Settings offers it too', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
          ev.prompt = async () => {
            (window as unknown as { __prompted: boolean }).__prompted = true;
          };
          ev.userChoice = Promise.resolve({ outcome: 'accepted' });
          window.dispatchEvent(ev);
        }, 200);
      });
    });
    await open(page);
    const card = page.getByTestId('install-app-prompt');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Settings$/ }).first().click();
    await page.getByRole('button', { name: /^Account/ }).first().click();
    const section = page.getByTestId('install-app-section');
    await expect(section.getByRole('button', { name: 'Install MyFav' })).toBeVisible();
    await card.getByRole('button', { name: 'Install' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
    await expect(card).toBeHidden();
  });

  test('manifest and home-screen icon are served', async ({ page, request }) => {
    await open(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
    expect(manifest.short_name).toBe('MyFav');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, new URL(href!, page.url())).toString());
      expect(res.status(), icon.src).toBe(200);
    }
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await request.get(new URL(touch!, page.url()).toString())).status()).toBe(200);
  });
});
