import { test, expect } from '@playwright/test';
import { mockPlatform, signIn, blockId } from './fixtures';
import { productionSample } from './production-fixtures';
async function choose(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Production history', exact: true }).click();
  await page.getByLabel('Production block').selectOption(blockId);
  await page.getByLabel('From collection date').fill('2026-01-01');
  await page.getByLabel('To collection date').fill('2026-01-02');
}
test('materialized values preserve pending DRC, absence, evidence and selection clearing', async ({
  page,
}) => {
  await mockPlatform(page, ['ESTATE_MANAGER']);
  await page.route('**/api/v1/analytics/**', (route) =>
    route.fulfill({ json: productionSample() }),
  );
  await signIn(page);
  await choose(page);
  await page.getByRole('button', { name: 'Read history' }).click();
  await expect(page.getByText('10.000', { exact: true })).toBeVisible();
  await expect(page.getByText('Unknown DRC', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No observed collection roots · actual production unknown'),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Observed wet and known dry production trend' }),
  ).toBeVisible();
  await page.getByLabel('From collection date').fill('2026-01-02');
  await expect(page.getByText('10.000', { exact: true })).toHaveCount(0);
});
test('incomplete evidence and unavailable response are not complete or zero production', async ({
  page,
}) => {
  await mockPlatform(page, ['ESTATE_MANAGER']);
  let status = 200;
  await page.route('**/api/v1/analytics/**', (route) =>
    route.fulfill({
      status,
      json:
        status === 200
          ? { ...productionSample(), projectionState: 'INCOMPLETE', missingSourceVersionCount: '1' }
          : {},
    }),
  );
  await signIn(page);
  await choose(page);
  await page.getByRole('button', { name: 'Read history' }).click();
  await expect(page.getByText(/Incomplete source evidence:/)).toBeVisible();
  status = 503;
  await page.getByRole('button', { name: 'Read history' }).click();
  await expect(page.getByText(/Materialized production history is unavailable/)).toBeVisible();
  await expect(page.getByText('10.000', { exact: true })).toHaveCount(0);
});
test('viewer has no production-summary navigation or direct route access', async ({ page }) => {
  await mockPlatform(page);
  await signIn(page);
  await expect(page.getByRole('link', { name: 'Production history', exact: true })).toHaveCount(0);
  await page.goto('/production-history');
  await expect(page.getByRole('heading', { name: 'Daily production history' })).toHaveCount(0);
});
