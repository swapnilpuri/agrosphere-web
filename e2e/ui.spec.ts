import { test, expect } from '@playwright/test';
import { mockPlatform, blockId } from './fixtures';
test('PKCE session, dashboard, UUID selection, layer controls, search and logout', async ({
  page,
}) => {
  await mockPlatform(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
  await page.getByRole('link', { name: 'Continue as estate viewer' }).click();
  await expect(page.getByRole('heading', { name: 'Your estates, connected.' })).toBeVisible();
  await expect(page.getByText('6,250', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Digital twin' }).click();
  await page.getByLabel('Find a block').fill('b-12');
  await page.getByRole('button', { name: /B-12 North rubber/ }).click();
  await expect(page.locator('.viewer-status')).toContainText('WebGL is unavailable');
  const details = page.getByRole('complementary', { name: 'Block details' });
  await expect(details.getByText('RRIC-100')).toBeVisible();
  await details.getByText('Canonical identity').click();
  await expect(details.getByText(blockId, { exact: true })).toBeVisible();
  await expect(details.getByText('12.4 ha', { exact: true })).toBeVisible();
  await page.getByLabel('BLOCK', { exact: true }).uncheck();
  await expect(page.getByLabel('BLOCK', { exact: true })).not.toBeChecked();
  await page.getByLabel('BLOCK', { exact: true }).check();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Keycloak' })).toBeVisible();
});
test('403 is actionable and does not fabricate estate metadata', async ({ page }) => {
  await mockPlatform(page);
  await page.route('http://localhost:8080/api/v1/estates?**', (route) =>
    route.fulfill({ status: 403, json: { correlationId: 'denied-request' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
  await page.getByRole('link', { name: 'Continue as estate viewer' }).click();
  await expect(page.getByRole('alert').first()).toContainText('permission');
  await expect(page.getByText('North rubber')).toHaveCount(0);
});
