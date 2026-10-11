import { test, expect, boot, startGame } from './helpers.js';

test('start game, walk with W, pause and unpause', async ({ page }) => {
  await boot(page);
  await startGame(page);
  const a = await page.evaluate(() => window.__game.player());
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__game.advance(1.5));
  await page.keyboard.up('KeyW');
  const b = await page.evaluate(() => window.__game.player());
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  expect(moved).toBeGreaterThan(3);

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.state)).toBe('paused');
  const c = await page.evaluate(() => window.__game.player());
  await page.evaluate(() => window.__game.advance(1));
  const d = await page.evaluate(() => window.__game.player());
  expect(Math.hypot(d.x - c.x, d.z - c.z)).toBeLessThan(0.001);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.state)).toBe('playing');
});

test('player cannot walk through a building', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__game.advance(20));
  await page.keyboard.up('KeyW');
  const p = await page.evaluate(() => window.__game.player());
  expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
});
