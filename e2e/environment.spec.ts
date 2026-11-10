import { test, expect } from '@playwright/test';
import { mockPlatform, signIn, blockId } from './fixtures';
import { environmentSample } from './environment-fixtures';
async function choose(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Production history', exact: true }).click();
  await page.getByLabel('Production block').selectOption(blockId);
  await page.getByLabel('From observation UTC').fill('2026-01-01T00:00:00Z');
  await page.getByLabel('To observation UTC').fill('2026-01-02T00:00:00Z');
}
test('environmental samples preserve exact values, intervals and sources independently of production dates', async ({
  page,
}) => {
  await mockPlatform(page, ['ESTATE_MANAGER']);
  await page.route('**/api/v1/analytics/**/environment/observations?*', (route) =>
    route.fulfill({ json: environmentSample() }),
  );
  await signIn(page);
  await choose(page);
  await page.getByRole('button', { name: 'Read environmental history', exact: true }).click();
  await expect(page.getByText('-2.125000', { exact: true })).toBeVisible();
  await expect(page.getByText('0.000', { exact: true })).toBeVisible();
  await expect(page.getByText(/2025-12-31T23:00:00Z to/)).toBeVisible();
  await expect(page.getByText(/Exact matching count 3/)).toBeVisible();
  await page.screenshot({ path: 'test-results/environment-ui.png', fullPage: true });
  await page.getByLabel('From observation UTC').fill('2026-01-01T01:00:00Z');
  await expect(page.getByText('-2.125000', { exact: true })).toHaveCount(0);
});
test('none with outside-window conflict remains unknown and outage clears data', async ({
  page,
}) => {
  await mockPlatform(page, ['ESTATE_MANAGER']);
  let unavailable = false;
  const none = environmentSample();
  none.observations = [];
  none.totalMatchingCount = '0';
  none.availability = 'NONE';
  none.projectionState = 'INCOMPLETE';
  none.conflictCount = 1;
  none.returnedKindCounts = { AIR_TEMPERATURE: 0, SOIL_MOISTURE: 0, INTERVAL_RAINFALL: 0 };
  await page.route('**/api/v1/analytics/**/environment/observations?*', (route) =>
    route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? {} : none }),
  );
  await signIn(page);
  await choose(page);
  await page.getByRole('button', { name: 'Read environmental history', exact: true }).click();
  await expect(page.getByText(/No observed matching facts/)).toBeVisible();
  await expect(page.getByText(/Unresolved environmental conflicts:/)).toBeVisible();
  unavailable = true;
  await page.getByRole('button', { name: 'Read environmental history', exact: true }).click();
  await expect(page.getByText(/environmental history is unavailable/i)).toBeVisible();
  await expect(page.getByText(/Unresolved environmental conflicts:/)).toHaveCount(0);
});
