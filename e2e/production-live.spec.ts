import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
test.use({ trace: 'off' });

test('generated real Operations/broker/Analytics/Gateway daily production', async ({ page }) => {
  const fixturePath = process.env['ANALYTICS_LIVE_FIXTURE'];
  test.skip(!fixturePath, 'Run only through the owned generated Analytics drill');
  if (!fixturePath) return;
  const file = await fs.realpath(fixturePath);
  const root = path.dirname(file);
  const fixture = JSON.parse(await fs.readFile(file, 'utf8')) as {
    runId: string;
    webOrigin: string;
    gateway: string;
    oidc: string;
    username: string;
    password: string;
    estateId: string;
    blockId: string;
    day: string;
  };
  expect((await fs.readFile(path.join(root, '.generated-analytics-owner'), 'utf8')).trim()).toBe(
    fixture.runId,
  );
  expect(new URL(fixture.gateway).hostname).toBe('127.0.0.1');
  expect(['localhost', '127.0.0.1']).toContain(new URL(fixture.oidc).hostname);
  const dist = path.resolve('dist/web/browser');
  const errors: string[] = [];
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    try {
      const url = new URL(frame.url());
      navigations.push(url.origin + url.pathname);
    } catch {
      /* about:blank */
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // A real, new loopback listener is needed for OIDC iframe redirects; never reuse a server.
  const origin = new URL(fixture.webOrigin);
  expect(origin.hostname).toBe('localhost');
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
  };
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url ?? '/', fixture.webOrigin).pathname);
      if (name === '/config.json') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            apiBaseUrl: fixture.gateway,
            keycloak: { url: fixture.oidc, realm: 'agrosphere', clientId: 'agrosphere-web' },
            cesium: {},
          }),
        );
        return;
      }
      let target = path.resolve(dist, '.' + name);
      if (target !== dist && !target.startsWith(dist + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        if (!(await fs.stat(target)).isFile()) target = path.join(dist, 'index.html');
      } catch {
        target = path.join(dist, 'index.html');
      }
      res.setHeader('Content-Type', types[path.extname(target)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(await fs.readFile(target));
    } catch {
      res.writeHead(500);
      res.end('Generated preview unavailable');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(origin.port), '127.0.0.1', resolve);
  });
  try {
    await page.goto(fixture.webOrigin + '/login');
    await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
    try {
      await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });
    } catch {
      throw new Error(
        'Generated login form unavailable; frame paths: ' + JSON.stringify(navigations),
      );
    }
    await page.locator('#username').fill(fixture.username);
    await page.locator('#password').fill(fixture.password);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { name: 'Your estates, connected.' })).toBeVisible();
    await page.getByLabel('Current estate').selectOption(fixture.estateId);
    await page.getByRole('link', { name: 'Production history', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Daily production history' })).toBeVisible();
    await page.getByLabel('Current estate').selectOption(fixture.estateId);
    await page.getByLabel('Production block').selectOption(fixture.blockId);
    await page.getByLabel('From collection date').fill(fixture.day);
    await page.getByLabel('To collection date').fill(fixture.day);
    await page.getByRole('button', { name: 'Read history' }).click();
    await expect(page.getByRole('cell', { name: '3.000', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '0.000', exact: true })).toBeVisible();
    await expect(page.getByText('Pending DRC remains', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Production history', exact: true })
        .locator('.badge')
        .filter({ hasText: /SIMULATED.*POC/ }),
    ).toBeVisible();
    await expect(page.getByText(/Incomplete source evidence:/)).toBeVisible();
    await page.getByText('Source version sample (3)', { exact: true }).click();
    await expect(page.locator('details li')).toHaveCount(3);
    await page.screenshot({ path: 'test-results/analytics-generated-live.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
