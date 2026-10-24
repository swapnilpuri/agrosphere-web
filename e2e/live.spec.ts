import { test, expect } from '@playwright/test';
test.use({ trace: 'off' });
test('real Keycloak and Gateway seeded estate workflow', async ({ page }) => {
  test.skip(
    !process.env['E2E_USERNAME'] || !process.env['E2E_PASSWORD'],
    'Provide private integration credentials through environment variables',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
  await page.locator('#username').fill(process.env['E2E_USERNAME']!);
  await page.locator('#password').fill(process.env['E2E_PASSWORD']!);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Your estates, connected.' })).toBeVisible();
  const estate = process.env['E2E_ESTATE_ID'];
  if (estate) await page.getByLabel('Current estate').selectOption(estate);
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  await expect(page.locator('.block-list button').first()).toBeVisible();
  const code = process.env['E2E_BLOCK_CODE'];
  if (code) await page.getByLabel('Find a block').fill(code);
  const detailResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/blocks\/[^/]+$/.test(new URL(response.url()).pathname) && response.ok(),
  );
  await page.locator('.block-list button').first().click();
  const actualBlock = await (await detailResponse).json();
  const detail = page.getByRole('complementary', { name: 'Block details' });
  await expect(
    detail.getByRole('heading', { name: actualBlock.blockCode + ' · ' + actualBlock.name }),
  ).toBeVisible();
  await page.getByLabel('Find a block').fill(actualBlock.blockCode);
  await expect(page.locator('.block-list button')).toHaveCount(1);
  await expect(page.locator('.viewer-status')).toContainText('spatial features');
  await expect(page.locator('.viewer-status')).not.toContainText('0 spatial features');
  await expect(page.locator('.viewer-status')).not.toContainText('Navigating');
  await page.screenshot({ path: 'test-results/live-before-pick.png', fullPage: true });
  await detail.getByRole('button', { name: 'Clear selection' }).click();
  const canvas = page.locator('.cesium-widget canvas');
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) throw new Error('No live Cesium canvas');
  await expect(async () => {
    await Promise.all([
      page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/v1/blocks/' + actualBlock.id && r.ok(),
        { timeout: 2000 },
      ),
      canvas.click({ position: { x: canvasBounds.width / 2, y: canvasBounds.height / 2 } }),
    ]);
  }).toPass({ timeout: 15000 });
  await expect(
    detail.getByRole('heading', { name: actualBlock.blockCode + ' · ' + actualBlock.name }),
  ).toBeVisible();
  await expect(page.locator('.viewer-status')).not.toContainText('Navigating');
  await page.screenshot({ path: 'test-results/live-digital-twin.png', fullPage: true });
  await expect(
    page.getByRole('complementary', { name: 'Block details' }).locator('dl').first(),
  ).toBeVisible();
  await page.getByLabel('BLOCK', { exact: true }).uncheck();
  await page.getByLabel('BLOCK', { exact: true }).check();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Keycloak' })).toBeVisible();
});
