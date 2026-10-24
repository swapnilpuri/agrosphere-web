import { Page, expect } from '@playwright/test';
export const estateId = '00000000-0000-4000-8000-000000000001',
  divisionId = '00000000-0000-4000-8000-000000000002',
  blockId = '00000000-0000-4000-8000-000000000003';
export const block = {
  id: blockId,
  estateId,
  divisionId,
  blockCode: 'B-12',
  name: 'North rubber',
  cropType: 'RUBBER',
  rubberCloneCode: 'RRIC-100',
  plantingDate: '2017-03-01',
  plantedAreaHectares: 12.5,
  plantedTreeCount: 6250,
  tappableTreeCount: 5100,
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [80, 6],
      [80.02, 6],
      [80.02, 6.01],
      [80, 6.01],
      [80, 6],
    ],
  ],
};
export const features = ['ESTATE', 'DIVISION', 'BLOCK'].map((type, index) => ({
  id: '00000000-0000-4000-8000-00000000050' + index,
  estateId,
  referenceEntityId: [estateId, divisionId, blockId][index],
  referenceEntityType: type,
  featureCode: type,
  geometry:
    type === 'BLOCK' ? { type: 'MultiPolygon', coordinates: [polygon.coordinates] } : polygon,
  geometryType: type === 'BLOCK' ? 'MULTIPOLYGON' : 'POLYGON',
  srid: 4326,
  geometryVersion: 1,
  status: 'ACTIVE',
  sourceType: 'GENERATED',
  sourceReference: 'Deterministic browser fixture',
  dataProvenance: 'SIMULATED',
  boundingBox: [80, 6, 80.02, 6.01],
  centroid: { type: 'Point', coordinates: [80.01, 6.005] },
  calculatedAreaHectares: 12.4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}));
export async function mockPlatform(page: Page) {
  let nonce = '';
  const jwt = (value: object) =>
    'eyJhbGciOiJSUzI1NiJ9.' +
    Buffer.from(JSON.stringify(value)).toString('base64url') +
    '.test-signature';
  await page.route('http://localhost:8180/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/3p-cookies/')) {
      await route.fulfill({
        contentType: 'text/html',
        body: '<script>parent.postMessage("unsupported","*")</script>',
      });
      return;
    }
    if (url.pathname.endsWith('/auth')) {
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      callback.searchParams.set('iss', 'http://localhost:8180/realms/agrosphere');
      if (url.searchParams.get('prompt') === 'none') {
        callback.searchParams.set('error', 'login_required');
        await route.fulfill({
          contentType: 'text/html',
          body: '<script>location.href=' + JSON.stringify(callback.href) + '</script>',
        });
        return;
      }
      nonce = url.searchParams.get('nonce')!;
      callback.searchParams.set('code', 'test-code');
      callback.searchParams.set('session_state', 'test-session');
      await route.fulfill({
        contentType: 'text/html',
        body:
          '<h1>Test identity provider</h1><a href="' +
          callback.href.replaceAll('&', '&amp;') +
          '">Continue as estate viewer</a>',
      });
      return;
    }
    if (url.pathname.endsWith('/token')) {
      const claims = {
        sub: 'test-viewer',
        preferred_username: 'Estate viewer',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        nonce,
        realm_access: { roles: ['VIEWER'] },
        session_state: 'test-session',
      };
      await route.fulfill({
        json: {
          access_token: jwt(claims),
          id_token: jwt(claims),
          refresh_token: jwt(claims),
          token_type: 'Bearer',
          expires_in: 300,
          session_state: 'test-session',
        },
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4200',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
      return;
    }
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({
        contentType: 'text/html',
        body: '<script>location.href="http://localhost:4200/login"</script>',
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    const url = new URL(route.request().url());
    const p = url.pathname;
    const pageOf = (content: unknown[]) => ({
      content,
      page: 0,
      size: 100,
      totalElements: content.length,
    });
    let body: unknown;
    if (p === '/api/v1/estates')
      body = pageOf([
        {
          id: estateId,
          estateCode: 'SIM-01',
          name: 'Synthetic rubber estate',
          countryCode: 'LK',
          timezone: 'Asia/Colombo',
          totalAreaHectares: 100,
          status: 'ACTIVE',
          version: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
    else if (p.endsWith('/divisions'))
      body = pageOf([
        {
          id: divisionId,
          estateId,
          divisionCode: 'D-1',
          name: 'North division',
          status: 'ACTIVE',
          version: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
    else if (p.endsWith('/blocks')) body = pageOf([block]);
    else if (p === '/api/v1/blocks/' + blockId) body = block;
    else if (p.endsWith('/features')) body = pageOf(features);
    else if (p.endsWith('/layers') || p.endsWith('/assets')) body = pageOf([]);
    else {
      await route.fulfill({ status: 404, json: { title: 'Unexpected fixture route' } });
      return;
    }
    await route.fulfill({
      json: body,
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
    });
  });
}
export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
  await page.getByRole('link', { name: 'Continue as estate viewer' }).click();
  await expect(page.getByRole('heading', { name: 'Your estates, connected.' })).toBeVisible();
}
