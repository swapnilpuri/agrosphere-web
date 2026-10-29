import { test, expect } from '@playwright/test';
import { mockPlatform, signIn, estateId } from './fixtures';

test('waits for initial estate loading before opening a new record form', async ({ page }) => {
  await mockPlatform(page, ['PLATFORM_ADMIN']);
  let release!: () => void;
  const initial = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://localhost:8080/api/v1/estates?**', async (route) => {
    await initial;
    await route.fallback();
  });
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  const create = page.getByRole('button', { name: 'Create estate', exact: true });
  await expect(create).toBeDisabled();
  release();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('heading', { name: 'Create estate', exact: true })).toBeVisible();
  await expect(page.getByLabel('Country code')).toHaveValue('');
  await expect(page.getByLabel('Current estate')).toBeDisabled();
});

test('boundary validation failures retain the preview and show the atomic job report', async ({
  page,
}) => {
  await mockPlatform(page, ['PLATFORM_ADMIN']);
  await page.route('http://localhost:8080/api/v1/spatial/estates/*/features?**', (route) =>
    route.fulfill({
      json: { content: [], page: 0, size: 100, totalElements: 0 },
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
    }),
  );
  const job = {
    id: 'failed-import',
    estateId,
    status: 'PENDING',
    importedCount: 0,
    rejectedCount: 0,
    validationReport: { errors: [] },
  };
  await page.route('http://localhost:8080/api/v1/spatial/imports/geojson', (route) =>
    route.fulfill({
      status: 202,
      json: job,
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
    }),
  );
  await page.route('http://localhost:8080/api/v1/spatial/imports/failed-import', (route) =>
    route.fulfill({
      json: {
        ...job,
        status: 'FAILED',
        rejectedCount: 1,
        validationReport: { errors: ['Feature[0]: Self-intersection'] },
      },
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
    }),
  );
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  const file = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'SIMULATED invalid polygon' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [9, 0],
              [10, 1],
              [9, 1],
              [10, 0],
              [9, 0],
            ],
          ],
        },
      },
    ],
  };
  await page.getByLabel('GeoJSON boundary file').setInputFiles({
    name: 'invalid.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page
    .getByLabel('Target for boundary 1', { exact: true })
    .selectOption('ESTATE:' + estateId);
  await page.getByLabel('Data provenance').selectOption('SIMULATED');
  await page.getByRole('button', { name: 'Import 1 boundaries' }).click();
  await expect(page.getByText('Import FAILED', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Self-intersection');
  await expect(page.getByRole('heading', { name: 'Preview 1 boundaries' })).toBeVisible();
});

test('viewers can inspect administration but cannot create, edit or import', async ({ page }) => {
  await mockPlatform(page);
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  await expect(page.getByRole('heading', { name: 'Estate administration' })).toBeVisible();
  await expect(page.getByText('Read-only access.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^(Create|Edit) (estate|division|field)$/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Boundary import' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Field records' })).toContainText('North rubber');
});

test('scoped managers maintain assigned estates without global estate-creation rights', async ({
  page,
}) => {
  await mockPlatform(page, ['ESTATE_MANAGER'], [estateId]);
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  await expect(page.getByRole('button', { name: 'Create estate', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create division', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit field', exact: true }).click();
  await expect(page.getByLabel('Current estate')).toBeDisabled();
  await expect(page.getByLabel('Rubber clone', { exact: true })).toHaveValue('RRIC-100');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Edit field' })).toBeVisible();
});

test('administration fails closed when the trusted estate scope is missing', async ({ page }) => {
  await mockPlatform(page, ['ESTATE_MANAGER'], []);
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  await expect(page.getByRole('button', { name: 'Create division', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit field', exact: true })).toHaveCount(0);
});

test('create estate/division/field, resolve a stale edit and preview/import supplied boundaries', async ({
  page,
}) => {
  await mockPlatform(page, ['PLATFORM_ADMIN']);
  const newEstate = '00000000-0000-4000-8000-000000000101';
  const newDivision = '00000000-0000-4000-8000-000000000102';
  const newBlock = '00000000-0000-4000-8000-000000000103';
  const jobId = '00000000-0000-4000-8000-000000000104';
  const initial = {
    id: estateId,
    estateCode: 'SIM-01',
    name: 'Synthetic rubber estate',
    countryCode: 'LK',
    timezone: 'Asia/Colombo',
    totalAreaHectares: 100,
    status: 'ACTIVE',
    version: 0,
  };
  const estates: Record<string, unknown>[] = [initial];
  const divisions: Record<string, unknown>[] = [];
  const blocks: Record<string, unknown>[] = [];
  let features: Record<string, unknown>[] = [];
  let stale = true;
  let imported: Record<string, unknown> | undefined;
  const mutations: { method: string; body: Record<string, unknown> }[] = [];
  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (json: unknown, status = 200) =>
      route.fulfill({
        status,
        json,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4200',
          'Access-Control-Allow-Headers': 'authorization,content-type,x-correlation-id',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        },
      });
    const pageOf = (content: unknown[]) => ({
      content,
      page: 0,
      size: 100,
      totalElements: content.length,
    });
    if (method === 'OPTIONS') return reply({});
    if (method === 'GET' && path === '/api/v1/rubber-clones')
      return reply(pageOf([{ cloneCode: 'TEST', status: 'ACTIVE' }]));
    if (method === 'GET' && path === '/api/v1/estates') return reply(pageOf(estates));
    if (method === 'POST' && path === '/api/v1/estates') {
      const body = request.postDataJSON();
      expect(body).not.toHaveProperty('version');
      expect(body.countryCode).toBe('GA');
      expect(body.timezone).toBe('Africa/Libreville');
      expect(body.totalAreaHectares).toBeNull();
      mutations.push({ method, body });
      const value = { ...body, id: newEstate, version: 0 };
      estates.push(value);
      return reply(value, 201);
    }
    if (path === `/api/v1/estates/${newEstate}/divisions`) {
      if (method === 'GET') return reply(pageOf(divisions));
      const body = request.postDataJSON();
      expect(body.estateId).toBe(newEstate);
      expect(body).not.toHaveProperty('version');
      mutations.push({ method, body });
      const value = { ...body, id: newDivision, version: 0 };
      divisions.push(value);
      return reply(value, 201);
    }
    if (method === 'GET' && path === `/api/v1/estates/${newEstate}/blocks`)
      return reply(pageOf(blocks));
    if (method === 'POST' && path === `/api/v1/divisions/${newDivision}/blocks`) {
      const body = request.postDataJSON();
      expect(body.estateId).toBe(newEstate);
      expect(body.divisionId).toBe(newDivision);
      expect(body.plantedAreaHectares).toBe(12.3456);
      expect(body.plantedTreeCount).toBe(100);
      expect(body.tappableTreeCount).toBe(80);
      expect(body.rubberCloneCode).toBeNull();
      mutations.push({ method, body });
      const value = { ...body, id: newBlock, version: 0 };
      blocks.push(value);
      return reply(value, 201);
    }
    if (method === 'PUT' && path === `/api/v1/blocks/${newBlock}`) {
      const body = request.postDataJSON();
      mutations.push({ method, body });
      if (stale) {
        expect(body.version).toBe(0);
        stale = false;
        blocks[0]['version'] = 1;
        return reply({ status: 409, title: 'Conflict' }, 409);
      }
      expect(body.version).toBe(1);
      blocks[0] = { ...body, id: newBlock, version: 2 };
      return reply(blocks[0]);
    }
    if (method === 'GET' && path === `/api/v1/spatial/estates/${newEstate}/features`)
      return reply(pageOf(features));
    if (method === 'POST' && path === '/api/v1/spatial/imports/geojson') {
      const body = request.postDataJSON();
      expect(body.estateId).toBe(newEstate);
      expect(body.geojson.features[0].properties).toMatchObject({
        estateId: newEstate,
        referenceEntityId: newBlock,
        referenceEntityType: 'BLOCK',
        dataProvenance: 'SIMULATED',
        sourceType: 'IMPORT',
      });
      imported = body;
      features = [
        {
          ...body.geojson.features[0].properties,
          id: 'geometry',
          geometry: body.geojson.features[0].geometry,
          status: 'ACTIVE',
        },
      ];
      return reply(
        {
          id: jobId,
          estateId: newEstate,
          status: 'COMPLETED',
          importedCount: 1,
          rejectedCount: 0,
          validationReport: { errors: [] },
        },
        202,
      );
    }
    if (method === 'GET' && path === `/api/v1/spatial/imports/${jobId}`)
      return reply({
        id: jobId,
        estateId: newEstate,
        status: 'COMPLETED',
        importedCount: 1,
        rejectedCount: 0,
        validationReport: { errors: [] },
      });
    return route.fallback();
  });
  await signIn(page);
  await page.getByRole('link', { name: 'Estate administration' }).click();
  await page.getByRole('button', { name: 'Create estate', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Record editor' });
  await editor.getByLabel('Code', { exact: false }).first().fill('GA-TEST');
  await editor.getByLabel('Name', { exact: false }).fill('SIMULATED Gabon browser fixture');
  await editor.getByLabel('Country code').fill('GA');
  await editor.getByLabel('Timezone').fill('Africa/Libreville');
  expect(
    await editor.locator('input,select').evaluateAll((controls) =>
      controls
        .filter((control) => !(control as HTMLInputElement).validity.valid)
        .map((control) => ({
          name: (control as HTMLInputElement).name,
          message: (control as HTMLInputElement).validationMessage,
        })),
    ),
  ).toEqual([]);
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByLabel('Current estate')).toHaveValue(newEstate);
  await page.getByRole('button', { name: 'Create division', exact: true }).click();
  await editor.getByLabel('Code', { exact: false }).fill('D1');
  await editor.getByLabel('Name', { exact: false }).fill('SIMULATED North division');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('region', { name: 'Division records' })).toContainText(
    'SIMULATED North division',
  );
  await page.getByRole('button', { name: 'Create field', exact: true }).click();
  await editor.getByLabel('Field code').fill('F1');
  await editor.getByLabel('Name', { exact: false }).fill('SIMULATED North field');
  await editor.getByLabel('Division', { exact: false }).selectOption(newDivision);
  await editor.getByLabel('Planted area').fill('12.3456');
  await editor.getByLabel('Planted trees').fill('100');
  await editor.getByLabel('Tappable trees').fill('101');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('alert')).toContainText('cannot exceed');
  await editor.getByLabel('Tappable trees').fill('80');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('region', { name: 'Field records' })).toContainText(
    'SIMULATED North field',
  );
  await page.getByRole('button', { name: 'Edit field', exact: true }).click();
  await editor.getByLabel('Name', { exact: false }).fill('SIMULATED updated field');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('alert')).toContainText('record changed');
  await expect(editor.getByLabel('Name', { exact: false })).toHaveValue('SIMULATED updated field');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Refresh records' }).click();
  await page.getByRole('button', { name: 'Edit field', exact: true }).click();
  await editor.getByLabel('Name', { exact: false }).fill('SIMULATED updated field');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('region', { name: 'Field records' })).toContainText(
    'SIMULATED updated field',
  );
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'SIMULATED supplied boundary' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [9.4, 0.4],
              [9.41, 0.4],
              [9.41, 0.41],
              [9.4, 0.4],
            ],
          ],
        },
      },
    ],
  };
  await page.getByLabel('GeoJSON boundary file').setInputFiles({
    name: 'simulated-survey.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(geojson)),
  });
  await expect(page.getByRole('heading', { name: 'Preview 1 boundaries' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 boundaries' })).toBeDisabled();
  await page.getByLabel('Target for boundary 1', { exact: true }).selectOption('BLOCK:' + newBlock);
  await page.getByLabel('Data provenance').selectOption('SIMULATED');
  await page.getByRole('button', { name: 'Import 1 boundaries' }).click();
  await expect(page.getByText('Import COMPLETED', { exact: true })).toBeVisible();
  expect(imported).toBeDefined();
  expect(mutations.filter((m) => m.method === 'POST')).toHaveLength(3);
  await page.screenshot({ path: 'test-results/estate-administration.png', fullPage: true });
});
