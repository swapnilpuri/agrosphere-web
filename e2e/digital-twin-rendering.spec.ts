import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mockPlatform, signIn, features } from './fixtures';

type Probe = {
  sceneMode: number;
  morphTime: number;
  renderErrors: string[];
  renderTimesMs: number[];
  camera: {
    cartographic: { longitude: number; latitude: number };
    groundCentre: { longitude: number; latitude: number } | null;
    pitch: number;
  };
  dimensions: unknown;
};

for (const region of ['north', 'south', 'origin'] as const) {
  test('generated Digital Twin mode, focus and resize rendering: ' + region, async ({ page }) => {
    test.setTimeout(60000);
    page.setDefaultTimeout(10000);
    const manifest = process.env['POC_CLOSE_OWNER'];
    test.skip(!manifest, 'Requires an explicitly owned disposable run');
    const owner = JSON.parse(await fs.readFile(manifest!, 'utf8'));
    expect(Date.parse(owner.expiresUtc)).toBeGreaterThan(Date.now());
    await mockPlatform(page);
    if (region !== 'north') {
      const [x, y] = region === 'south' ? [35, -15] : [-0.01, -0.005];
      await page.route('**/spatial/estates/*/features**', (route) =>
        route.fulfill({
          json: {
            content: features.map((feature) => ({
              ...feature,
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [x, y],
                    [x + 0.02, y],
                    [x + 0.02, y + 0.01],
                    [x, y + 0.01],
                    [x, y],
                  ],
                ],
              },
              geometryType: 'POLYGON',
              boundingBox: [x, y, x + 0.02, y + 0.01],
              centroid: { type: 'Point', coordinates: [x + 0.01, y + 0.005] },
            })),
            page: 0,
            size: 100,
            totalElements: 3,
          },
        }),
      );
    }
    await page.route('**/config.json', (route) =>
      route.fulfill({
        json: {
          apiBaseUrl: 'http://localhost:8080',
          keycloak: {
            url: 'http://localhost:8180',
            realm: 'agrosphere',
            clientId: 'agrosphere-web',
          },
          cesium: {},
          verification: { runId: owner.runId },
        },
      }),
    );
    const samples: unknown[] = [];
    const read = () =>
      page.evaluate(() =>
        (window as Window & { __agroPocClose?: () => unknown }).__agroPocClose?.(),
      ) as Promise<Probe>;
    const capture = async (action: string) => {
      const probe = await read();
      samples.push({ action, ...probe, renderTimesMs: probe.renderTimesMs.slice(-10) });
      expect(probe.renderErrors, action).toEqual([]);
      await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
    };
    try {
      await signIn(page);
      await page.getByRole('link', { name: /Digital twin$/ }).click();
      await expect(page.getByRole('button', { name: '2D', exact: true })).toBeEnabled();
      for (const mode of ['2D', '3D', '2D', '3D']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await page.waitForTimeout(80);
        await capture('opening mode switch ' + mode);
      }
      await expect(page.locator('.viewer-status')).toContainText('3 spatial features');
      await expect.poll(async () => (await read())?.renderTimesMs.length ?? 0).toBeGreaterThan(2);
      await expect.poll(async () => (await read()).sceneMode).toBe(3);
      await capture('initial 3D');
      await page.getByRole('button', { name: '2D', exact: true }).click();
      await expect.poll(async () => (await read()).sceneMode).toBe(2);
      await capture('completed 2D');
      await page.getByRole('button', { name: 'Reset view', exact: true }).click();
      await page.waitForTimeout(1300);
      await capture('2D focus');
      await page.getByRole('button', { name: '3D', exact: true }).click();
      await expect.poll(async () => (await read()).sceneMode).toBe(3);
      await capture('completed 3D');
      for (let index = 0; index < 8; index++) {
        await page.getByRole('button', { name: '2D', exact: true }).click();
        await page.getByRole('button', { name: 'Reset view', exact: true }).click();
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await page.getByRole('button', { name: /B-12 North rubber/ }).click();
        await page.setViewportSize({ width: index % 2 ? 1920 : 900, height: 1080 });
        await capture('rapid mode/focus/resize ' + index);
      }
      await page.waitForTimeout(2000);
      await capture('rapid actions settled');
      const picker = page.locator('.cesium-sceneModePicker-wrapper');
      for (const { name, mode } of [
        { name: '2D', mode: 2 },
        { name: '3D', mode: 3 },
        { name: 'Columbus View', mode: 1 },
      ]) {
        await page.getByRole('button', { name: /B-12 North rubber/ }).click();
        await picker.locator('button').first().click();
        await picker
          .locator('button[title="' + name + '"]')
          .last()
          .click();
        await page.getByRole('button', { name: 'Reset view', exact: true }).click();
        await expect.poll(async () => (await read()).sceneMode).toBe(mode);
        const centre =
          region === 'north' ? [80.01, 6.005] : region === 'south' ? [35.01, -14.995] : [0, 0];
        await expect
          .poll(async () => {
            const camera = (await read()).camera.groundCentre;
            if (!camera) return Infinity;
            return Math.max(
              Math.abs((camera.longitude * 180) / Math.PI - centre[0]),
              Math.abs((camera.latitude * 180) / Math.PI - centre[1]),
            );
          })
          .toBeLessThan(0.00001);
        if (mode === 1)
          await expect.poll(async () => (await read()).camera.pitch).toBeCloseTo(-Math.PI / 4, 3);
        await capture('native picker ' + name);
      }
      await page.locator('agro-cesium-viewer').evaluate((element) => {
        (element as HTMLElement).style.display = 'none';
      });
      await page
        .getByRole('button', { name: '2D', exact: true, includeHidden: true })
        .dispatchEvent('click');
      await page.waitForTimeout(500);
      await page
        .getByRole('button', { name: '3D', exact: true, includeHidden: true })
        .dispatchEvent('click');
      await page.locator('agro-cesium-viewer').evaluate((element) => {
        (element as HTMLElement).style.display = '';
      });
      await page.waitForTimeout(2000);
      await capture('hidden container mode changes and reveal');
      await page.getByRole('link', { name: /Overview$/ }).click();
      await page.getByRole('link', { name: /Digital twin$/ }).click();
      await expect(page.locator('.viewer-status')).toContainText('3 spatial features');
      await capture('route re-entry');
    } finally {
      // Restore the test layout even on failure, allowing normal browser teardown.
      await page
        .locator('agro-cesium-viewer')
        .evaluateAll((elements) => {
          for (const element of elements) (element as HTMLElement).style.display = '';
        })
        .catch(() => {});
      await fs.writeFile(
        path.join(path.dirname(manifest!), 'twin-rendering-' + region + '.json'),
        JSON.stringify(
          {
            runId: owner.runId,
            environment: 'isolated generated API fixture; actual hardware browser/WebGL',
            samples,
          },
          null,
          2,
        ),
      );
    }
  });
}
