import { test, expect } from '@playwright/test';
import { mockPlatform, signIn } from './fixtures';
import { telemetrySample } from './telemetry-fixtures';
test('selected block shows exact values, clocks, coverage and freshness legend without a surveyed sensor claim', async ({
  page,
}) => {
  await mockPlatform(page);
  await page.route('**/api/v1/telemetry/**', (route) => route.fulfill({ json: telemetrySample }));
  await signIn(page);
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await page.getByRole('button', { name: /B-12 North rubber/ }).click();
  const panel = page.getByRole('region', { name: 'Block environmental readings' });
  await expect(panel.getByText('27.500000 °C')).toBeVisible();
  await expect(panel.getByText('45.125 %')).toBeVisible();
  await expect(panel.getByText('2.125 mm')).toBeVisible();
  await expect(panel.getByText('COMPLETE', { exact: true })).toBeVisible();
  await expect(panel.getByText('SIMULATED · POC')).toBeVisible();
  await expect(panel.getByText(/Interval Jan/)).toBeVisible();
  await panel.getByLabel('Environmental freshness overlay', { exact: true }).check();
  await expect(panel.getByLabel('Environmental freshness legend')).toContainText('CURRENT');
  await expect(panel.getByText(/not crop-health severity/)).toBeVisible();
});
test('absent, stale, ahead-of-clock and denied responses are explicit and do not invent zero values', async ({
  page,
}) => {
  await mockPlatform(page);
  let response: object = { ...telemetrySample, coverage: 'NONE', readings: [] };
  let status = 200;
  await page.route('**/api/v1/telemetry/**', (route) => route.fulfill({ status, json: response }));
  await signIn(page);
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await page.getByRole('button', { name: /B-12 North rubber/ }).click();
  const panel = page.getByRole('region', { name: 'Block environmental readings' });
  await expect(panel.getByText('NONE · no reading supplied')).toHaveCount(3);
  response = { ...telemetrySample, generatedAt: '2026-01-01T12:10:00Z' };
  await panel.getByRole('button', { name: 'Refresh readings' }).click();
  await expect(panel.getByText('STALE', { exact: true })).toHaveCount(3);
  response = {
    ...telemetrySample,
    generatedAt: '2026-01-01T11:59:00Z',
    readings: telemetrySample.readings.map((r) => ({ ...r, receivedAt: '2026-01-01T11:59:00Z' })),
  };
  await panel.getByRole('button', { name: 'Refresh readings' }).click();
  await expect(panel.getByText('CLOCK_AHEAD', { exact: true })).toHaveCount(3);
  status = 403;
  response = {};
  await panel.getByRole('button', { name: 'Refresh readings' }).click();
  await expect(panel.getByText(/not permitted/)).toBeVisible();
  await expect(panel.getByText('27.500000 °C')).toHaveCount(0);
});
