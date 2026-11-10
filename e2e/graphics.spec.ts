import { test, expect } from '@playwright/test';
import { mockPlatform, signIn } from './fixtures';
import { telemetrySample } from './telemetry-fixtures';
import { expectCurrentTint } from './telemetry-graphics';
test('Cesium ingests WGS84 geometry and survives route teardown', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockPlatform(page);
  await page.route('**/api/v1/telemetry/**', (route) => route.fulfill({ json: telemetrySample }));
  await signIn(page);
  const start = Date.now();
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  await expect(page.getByText('Geometry could not be rendered.')).toHaveCount(0);
  await expect(page.locator('.viewer-status')).toContainText('3 spatial features');
  const canvas = page.locator('.cesium-widget canvas');
  const size = await canvas.boundingBox();
  if (!size) throw new Error('Cesium canvas has no bounds');
  await expect(async () => {
    await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
    await expect(page.getByRole('heading', { name: 'B-12 · North rubber' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'B-12 · North rubber' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Block environmental readings' });
  await expect(panel.getByText('27.500000 °C')).toBeVisible();
  await panel.getByLabel('Environmental freshness overlay', { exact: true }).check();
  await expect(panel.getByLabel('Environmental freshness legend')).toContainText('CURRENT');
  await expectCurrentTint(page);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  await page.getByRole('button', { name: /B-12 North rubber/ }).click();
  await expect(
    panel.getByLabel('Environmental freshness overlay', { exact: true }),
  ).not.toBeChecked();
  expect(errors).toEqual([]);
  console.log('Fixture viewer navigation and remount ms:', Date.now() - start);
  await expect(page.locator('.viewer-status')).not.toContainText('Navigating');
  await page.screenshot({ path: 'test-results/digital-twin.png', fullPage: true });
});
