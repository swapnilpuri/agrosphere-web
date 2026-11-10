import { test, expect, Page } from '@playwright/test';
import { mockPlatform, signIn, estateId, blockId } from './fixtures';
const headers = {
  'Access-Control-Allow-Origin': `http://localhost:${process.env['AGRO_TEST_PORT'] ?? '4200'}`,
};
const id = '00000000-0000-4000-8000-000000000081';
const incident = {
  id,
  estateId,
  blockId,
  dataProvenance: 'SIMULATED',
  estateTimezone: 'Asia/Colombo',
  observedAt: '2026-10-31T10:00:00Z',
  version: 0,
  createdAt: '2026-10-31T11:00:00Z',
  updatedAt: '2026-10-31T11:00:00Z',
  inspectionId: null,
  category: 'TREE_DAMAGE',
  severity: 'LOW',
  summary: 'SIMULATED crop observation',
  details: 'SIMULATED evidence',
  status: 'OPEN',
  resolvedAt: null,
  resolutionNote: null,
};
async function setup(page: Page, roles = ['ESTATE_MANAGER']) {
  await mockPlatform(page, roles);
  await page.route('**/api/v1/incidents**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 500, json: {}, headers });
    return route.fulfill({
      json: path.endsWith('/history')
        ? {
            content: [
              {
                id,
                version: 0,
                previousVersion: null,
                commandKind: 'REPORT',
                reason: null,
                recordedAt: incident.createdAt,
                recordedBy: 'SIMULATED-actor',
                correlationId: id,
                snapshot: incident,
              },
            ],
            page: 0,
            size: 25,
            totalElements: 1,
          }
        : path.endsWith(id)
          ? incident
          : { content: [incident], page: 0, size: 25, totalElements: 1 },
      headers,
    });
  });
  await signIn(page);
  await page.getByRole('link', { name: 'Incidents', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Crop-health incidents', exact: true }),
  ).toBeVisible();
}
async function draft(page: Page) {
  await page.getByRole('button', { name: 'Report simulated incident' }).click();
  const editor = page.getByRole('region', { name: 'New simulated report' });
  await editor.getByRole('combobox', { name: 'Field', exact: true }).selectOption(blockId);
  await editor.getByLabel('Summary', { exact: true }).fill('SIMULATED crop observation');
  await editor.getByLabel('Details', { exact: true }).fill('SIMULATED evidence');
  return editor;
}
test('report retry freezes identical body/key and guards estate and navigation', async ({
  page,
}) => {
  await setup(page);
  const requests: { key: string; body: string }[] = [];
  await page.route('**/api/v1/incidents', async (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    return route.fulfill({
      status: requests.length === 1 ? 503 : 201,
      json: requests.length === 1 ? {} : incident,
      headers,
    });
  });
  const editor = await draft(page);
  await expect(page.getByLabel('Current estate')).toBeDisabled();
  await editor.getByRole('button', { name: 'Save simulated report' }).click();
  await expect(page.getByRole('alert')).toContainText('uncertain');
  await expect(editor.getByLabel('Summary', { exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Retry identical submission' }).click();
  await expect(page.getByRole('region', { name: 'Report details', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(JSON.parse(requests[0].body).dataProvenance).toBe('SIMULATED');
});
test('conflict preserves original version and shows current report for review', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'View report' }).click();
  await page.getByRole('button', { name: 'Correct evidence' }).click();
  await page.getByLabel('Change reason', { exact: true }).fill('SIMULATED correction');
  await page
    .getByRole('region', { name: 'Review corrections' })
    .getByLabel('Summary', { exact: true })
    .fill('SIMULATED revised');
  await page.route('**/api/v1/incidents/' + id + '/corrections', (route) =>
    route.fulfill({ status: 409, json: {}, headers }),
  );
  await page.getByRole('button', { name: 'Save simulated report' }).click();
  await expect(page.getByRole('heading', { name: 'Current record', exact: true })).toBeVisible();
  await expect(page.getByLabel('Summary', { exact: true })).toHaveValue('SIMULATED revised');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Discard and reload' }).click();
  await expect(page.getByRole('region', { name: 'Review corrections' })).toHaveCount(0);
});
test('supervisor can create but cannot change evidence or see protected history', async ({
  page,
}) => {
  await setup(page, ['FIELD_SUPERVISOR']);
  await expect(page.getByRole('button', { name: 'Report simulated incident' })).toBeVisible();
  await page.getByRole('button', { name: 'View report' }).click();
  await expect(page.getByRole('button', { name: 'Correct evidence' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View protected history' })).toHaveCount(0);
});
test('auditor can inspect immutable history without create or lifecycle controls', async ({
  page,
}) => {
  await setup(page, ['AUDITOR']);
  await expect(page.getByRole('button', { name: 'Report simulated incident' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View report' }).click();
  await page.getByRole('button', { name: 'View protected history' }).click();
  await expect(page.getByRole('region', { name: 'Protected report history' })).toContainText(
    'SIMULATED-actor',
  );
  await expect(page.getByRole('button', { name: 'Resolve incident' })).toHaveCount(0);
});
test('dirty report navigation requires discard and no report goes into browser storage', async ({
  page,
}) => {
  await setup(page);
  await draft(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Inspections', exact: true }).click();
  await expect(page.getByRole('region', { name: 'New simulated report' })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.values(localStorage), Object.values(sessionStorage)]),
  );
  expect(stored).not.toContain('SIMULATED crop observation');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Inspections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspections', exact: true })).toBeVisible();
});
test('narrow crop reports remain within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await draft(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'target/crop-health-narrow.png', fullPage: true });
});
