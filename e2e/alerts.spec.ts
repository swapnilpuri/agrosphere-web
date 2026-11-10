import { test, expect, Page } from '@playwright/test';
import type { AlertRow } from '../src/app/features/alerts/alerts.api';
import { mockPlatform, signIn, estateId, blockId } from './fixtures';
const id = '00000000-0000-4000-8000-000000000091';
const headers = {
  'Access-Control-Allow-Origin': `http://localhost:${process.env['AGRO_TEST_PORT'] ?? '4200'}`,
  'Cache-Control': 'no-store',
};
const initial: AlertRow = {
  id,
  policyVersion: 'AN_PRIVACY_PROVISIONAL_1',
  readState: 'UNREAD',
  readExpiresAt: null,
  acknowledgementState: 'NONE',
  incidentId: '00000000-0000-4000-8000-000000000092',
  estateId,
  blockId,
  ruleVersion: 'CROP_HEALTH_HIGH_V1',
  sourceVersion: 0,
  alertVersion: 1,
  attentionVersion: 1,
  state: 'ACTIVE',
  inactiveReason: null,
  category: 'TREE_DAMAGE',
  severity: 'HIGH',
  incidentStatus: 'OPEN',
  dataProvenance: 'SIMULATED',
  estateTimezone: 'Asia/Colombo',
  observedAt: '2026-10-31T10:00:00Z',
  raisedAt: '2026-10-31T11:00:00Z',
  attentionAt: '2026-10-31T11:00:00Z',
  updatedAt: '2026-10-31T11:00:00Z',
  readAttentionVersion: 0,
  readAt: null,
  unreadForMe: true,
  acknowledged: false,
  acknowledgedAt: null,
};
async function setup(page: Page, roles = ['ESTATE_MANAGER']) {
  await mockPlatform(page, roles);
  let alert = { ...initial };
  const writes: { key: string; body: string; path: string }[] = [];
  await page.route('**/api/v2/alerts**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      writes.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postData()!,
        path,
      });
      alert = {
        ...alert,
        unreadForMe: false,
        readState: 'READ',
        readAttentionVersion: 1,
        readAt: initial.updatedAt,
      };
      return route.fulfill({ json: alert, headers });
    }
    return route.fulfill({
      headers,
      json: path.endsWith('/counts')
        ? {
            activeTotal: 1,
            activeUnreadForMe: alert.unreadForMe ? 1 : 0,
            activeUnacknowledged: 1,
            generatedAt: initial.updatedAt,
          }
        : path.endsWith('/history')
          ? { content: [], page: 0, size: 20, totalElements: 0, generatedAt: initial.updatedAt }
          : path.endsWith(id)
            ? alert
            : {
                content: [alert],
                page: 0,
                size: 20,
                totalElements: 1,
                generatedAt: initial.updatedAt,
              },
    });
  });
  await signIn(page);
  await page.getByRole('link', { name: 'Alerts', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Crop-health alerts', exact: true }),
  ).toBeVisible();
  return writes;
}
async function open(page: Page) {
  await page.getByRole('button', { name: /Review HIGH alert/ }).click();
  await expect(page.getByRole('region', { name: 'Alert details' })).toBeVisible();
}
test('polling and detail fetch never mark read; explicit read remains separate from ack', async ({
  page,
}) => {
  const writes = await setup(page);
  await open(page);
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toContain('/read');
  await expect(page.getByRole('region', { name: 'Alert details' })).toContainText('Unacknowledged');
  await expect(page.getByRole('link', { name: 'Open source incident' })).toHaveAttribute(
    'href',
    '/incidents?report=' + initial.incidentId,
  );
});
test('unknown outcome freezes original body and key; estate and navigation are protected', async ({
  page,
}) => {
  await setup(page);
  await open(page);
  const writes: { key: string; body: string }[] = [];
  await page.route('**/api/v2/alerts/' + id + '/read', async (route) => {
    writes.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    await route.fulfill({
      status: writes.length === 1 ? 503 : 200,
      json: writes.length === 1 ? {} : initial,
      headers,
    });
  });
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('uncertain');
  await expect(page.getByLabel('Current estate')).toBeDisabled();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Incidents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crop-health alerts' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical submission' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0]).toEqual(writes[1]);
});
test('supervisor sees own-read controls without shared acknowledgement or protected history', async ({
  page,
}) => {
  await setup(page, ['FIELD_SUPERVISOR']);
  await open(page);
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge for estate team' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View alert history' })).toHaveCount(0);
});
test('stale acknowledgement refreshes facts without silently acknowledging a new episode', async ({
  page,
}) => {
  await setup(page);
  await open(page);
  let writes = 0;
  await page.route('**/api/v2/alerts/' + id + '/acknowledgements', async (route) => {
    writes++;
    await route.fulfill({ status: 409, json: {}, headers });
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Acknowledge for estate team' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Review the refreshed facts' }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByRole('button', { name: 'Retry identical submission' })).toHaveCount(0);
});
test('unavailable list is not reported as empty or zero; retry remains explicit', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/v2/alerts?**', (route) =>
    route.fulfill({ status: 503, json: {}, headers }),
  );
  await page.getByRole('button', { name: 'Refresh alerts' }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByText('No matching alerts', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Stale', { exact: false })).toBeVisible();
});
test('narrow layout, keyboard focus and protected history remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await open(page);
  await expect(page.getByRole('region', { name: 'Alert details' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Alert details' })).toContainText('—');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Alerts');
  await page.getByRole('button', { name: 'View alert history' }).click();
  await expect(page.getByRole('heading', { name: 'Protected alert history' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'target/an1-alerts-narrow.png', fullPage: true });
});

test('expired personal read state is explained without claiming the user read it', async ({
  page,
}) => {
  const writes = await setup(page);
  await page.route('**/api/v2/alerts/' + id, (route) =>
    route.fulfill({
      headers,
      json: {
        ...initial,
        state: 'INACTIVE',
        incidentStatus: 'RESOLVED',
        inactiveReason: 'RESOLVED',
        readState: 'EXPIRED',
        readExpiresAt: initial.updatedAt,
        unreadForMe: false,
      },
    }),
  );
  await open(page);
  await expect(page.getByRole('region', { name: 'Alert details' })).toContainText(
    'Read state expired',
  );
  await expect(page.getByRole('region', { name: 'Alert details' })).not.toContainText(
    'Read by you',
  );
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test('410 discards frozen retry and never submits a replacement automatically', async ({
  page,
}) => {
  await setup(page);
  await open(page);
  let commands = 0;
  await page.route('**/api/v2/alerts/' + id + '/read', (route) => {
    commands++;
    expect(route.request().headers()['idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    return route.fulfill({
      status: 410,
      headers,
      json: { status: 410, code: 'ALERT_COMMAND_EXPIRED', title: 'Expired' },
    });
  });
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'This command or read state expired' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry identical submission' })).toHaveCount(0);
  await expect(page.getByLabel('Current estate')).toBeEnabled();
  expect(commands).toBe(1);
});

test('protected history explains expiry and later partial history', async ({ page }) => {
  await setup(page);
  await open(page);
  let partial = false;
  await page.route('**/api/v2/alerts/' + id + '/history**', (route) =>
    route.fulfill({
      headers,
      json: {
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        generatedAt: initial.updatedAt,
        retentionState: partial ? 'PARTIAL' : 'EXPIRED',
        lastExpiredAt: initial.updatedAt,
      },
    }),
  );
  await page.getByRole('button', { name: 'View alert history' }).click();
  await expect(page.getByText(/Alert history expired/)).toBeVisible();
  partial = true;
  await page.getByRole('button', { name: 'View alert history' }).click();
  await expect(page.getByText(/Only newer entries are available/)).toBeVisible();
});
