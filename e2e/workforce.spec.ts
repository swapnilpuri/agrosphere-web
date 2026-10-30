import { test, expect, Page } from '@playwright/test';
import { mockPlatform, signIn, estateId } from './fixtures';
const worker = {
  id: '00000000-0000-4000-8000-000000000091',
  estateId,
  workerCode: 'SIM-01',
  displayName: 'SIMULATED Worker One',
  divisionId: null,
  dataProvenance: 'SIMULATED',
  version: 0,
  activePeriods: [
    {
      id: '00000000-0000-4000-8000-000000000092',
      activeFrom: '2026-01-01',
      activeTo: null,
      introducedVersion: 0,
      closedVersion: null,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200' };
async function setup(page: Page, roles = ['ESTATE_MANAGER']) {
  await mockPlatform(page, roles);
  await page.route('**/api/v1/workers**', async (route) => {
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 500, json: {}, headers });
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith(worker.id)
        ? worker
        : { content: [worker], page: 0, size: 20, totalElements: 1 },
      headers,
    });
  });
  await page.route('**/api/v1/attendance/roster?**', (route) =>
    route.fulfill({
      json: {
        content: [
          {
            worker: {
              id: worker.id,
              code: worker.workerCode,
              displayName: worker.displayName,
              divisionId: null,
              provenance: 'SIMULATED',
              version: 0,
            },
            attendance: null,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        estateId,
        date: new URL(route.request().url()).searchParams.get('date'),
        estateTimezone: 'Asia/Colombo',
        dataProvenance: 'SIMULATED',
        eligibleCount: 1,
        markedCount: 0,
        unmarkedCount: 1,
        voidedCount: 0,
        outsideRosterRecordedCount: 0,
      },
      headers,
    }),
  );
  await signIn(page);
}
test('registration retries the identical command and locks the estate while dirty', async ({
  page,
}) => {
  await setup(page);
  const requests: { key: string; body: string }[] = [];
  await page.route('**/api/v1/workers', async (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    await route.fulfill({
      status: requests.length === 1 ? 503 : 201,
      json: requests.length === 1 ? {} : worker,
      headers,
    });
  });
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await page.getByRole('button', { name: 'Register simulated worker' }).click();
  await page
    .getByRole('region', { name: 'Workforce draft' })
    .getByLabel('Worker code')
    .fill('sim-01');
  await page.getByLabel('Display name').fill('SIMULATED Worker One');
  await expect(page.getByLabel('Current estate')).toBeDisabled();
  await page.getByRole('button', { name: 'Save command' }).click();
  await expect(page.getByRole('alert')).toContainText('uncertain');
  await expect(page.getByLabel('Display name')).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same command' }).click();
  await expect(page.getByText('Saved. The list has been refreshed.')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(JSON.parse(requests[0].body)).toMatchObject({
    dataProvenance: 'SIMULATED',
    workerCode: 'SIM-01',
  });
});
test('supervisor records an explicit status without profile or history authority', async ({
  page,
}) => {
  await setup(page, ['FIELD_SUPERVISOR']);
  let recorded: unknown;
  await page.route('**/api/v1/attendance/days', (route) => {
    recorded = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: {}, headers });
  });
  await page.getByRole('link', { name: 'Attendance', exact: true }).click();
  await expect(page.getByText('UNMARKED', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Record attendance for SIM-01' }).click();
  await page.getByRole('button', { name: 'Save command' }).click();
  await expect(page.getByRole('alert')).toContainText('explicit attendance');
  expect(recorded).toBeUndefined();
  await page.getByLabel('Attendance status').selectOption('EXCUSED');
  await page.getByRole('button', { name: 'Save command' }).click();
  await expect(page.getByText('Saved. The list has been refreshed.')).toBeVisible();
  expect(recorded).toMatchObject({ workerRegistrationId: worker.id, status: 'EXCUSED' });
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View worker details' }).click();
  await expect(page.getByRole('button', { name: 'View protected history' })).toHaveCount(0);
});
test('conflict keeps the original version and draft; denial clears protected data', async ({
  page,
}) => {
  await setup(page);
  let body: Record<string, unknown> = {};
  await page.route('**/api/v1/workers/' + worker.id, async (route) => {
    if (route.request().method() === 'PATCH') {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: {}, headers });
    }
    return route.fulfill({ status: 403, json: {}, headers });
  });
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.getByLabel('Display name').fill('SIMULATED Changed');
  await page.getByLabel('Reason', { exact: true }).fill('SIMULATED correction');
  await page.getByRole('button', { name: 'Save command' }).click();
  await expect(page.getByRole('alert')).toContainText('nothing was overwritten');
  expect(body['version']).toBe(0);
  await expect(page.getByLabel('Display name')).toHaveValue('SIMULATED Changed');
  await page.getByRole('button', { name: 'Inspect latest record' }).click();
  await expect(page.getByRole('alert')).toContainText('cleared');
  await expect(page.getByText('SIMULATED Worker One', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveCount(0);
});
test('viewer and plantation admin have no workforce navigation', async ({ page }) => {
  await setup(page, ['VIEWER', 'PLANTATION_ADMIN']);
  await expect(page.getByRole('link', { name: 'Workers', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toHaveCount(0);
});

test('narrow-screen draft focus, unsaved navigation and changed dates cannot submit a stale roster', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole('link', { name: 'Attendance', exact: true }).click();
  await page.getByRole('button', { name: 'Record attendance for SIM-01' }).click();
  await expect(page.getByLabel('Attendance status')).toBeFocused();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Workforce draft' })).toBeVisible();
  await page.screenshot({ path: 'target/workforce-narrow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByRole('button', { name: 'Record attendance for SIM-01' })).toBeVisible();
  await page.getByLabel('Attendance date', { exact: true }).fill('2026-01-02');
  await expect(page.getByRole('button', { name: 'Record attendance for SIM-01' })).toHaveCount(0);
  await expect(
    page.getByText('Filters changed. Apply filters to load matching records.'),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((k) => /worker|attendance/i.test(k))),
  ).toBe(false);
});

test('auditor can inspect protected history and a 401 clears the session', async ({ page }) => {
  await setup(page, ['AUDITOR']);
  await page.route('**/api/v1/workers/' + worker.id + '/history?**', (route) =>
    route.fulfill({
      headers,
      json: {
        content: [
          {
            id: worker.id,
            version: 0,
            commandKind: 'REGISTER',
            reason: null,
            recordedAt: worker.createdAt,
            recordedBy: 'SIMULATED-subject',
            correlationId: worker.id,
            snapshot: worker,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
      },
    }),
  );
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Register simulated worker' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View worker details' }).click();
  await page.getByRole('button', { name: 'View protected history' }).click();
  await expect(page.getByRole('region', { name: 'Protected history' })).toContainText(
    'SIMULATED-subject',
  );
  await page.route('**/api/v1/workers?**', (route) =>
    route.fulfill({ status: 401, json: {}, headers }),
  );
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Keycloak' })).toBeVisible();
  await expect(page.getByText('SIMULATED Worker One', { exact: false })).toHaveCount(0);
});
