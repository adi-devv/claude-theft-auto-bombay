import { test as base, expect } from '@playwright/test';

/** Playwright test with an error collector: any console error, page error, failed request or HTTP >= 400 fails the test. */
export const test = base.extend({
  errors: [
    async ({ page }, use) => {
      const errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
      });
      await use(errors);
    },
    { auto: true },
  ],
});

test.afterEach(async ({ errors }) => {
  expect(errors, 'no console/page/network errors').toEqual([]);
});

export { expect };

export async function boot(page, query = 'seed=1&test=1') {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 45_000 });
}

export async function startGame(page) {
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'playing');
}
