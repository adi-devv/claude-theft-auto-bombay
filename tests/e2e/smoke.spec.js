import { test, expect, boot } from './helpers.js';

test('loads, WebGL works, renders frames within the draw-call budget', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__game.webgl)).toBe(true);
  await expect(page.locator('#game')).toBeVisible();
  await page.waitForFunction(() => window.__game.frame >= 10);
  const dc = await page.evaluate(() => window.__game.drawCalls);
  expect(dc).toBeGreaterThan(0);
  expect(dc).toBeLessThan(100);
  expect(await page.title()).toContain('Claude Theft Auto Bombay');
  expect(await page.evaluate(() => window.__game.state)).toBe('title');
});
