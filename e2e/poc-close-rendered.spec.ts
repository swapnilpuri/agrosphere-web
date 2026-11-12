import { chromium, expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

type Probe = {
  runId: string;
  rows: { featureId: string; blockId: string; geometryVersion: number; rings: number[][][] }[];
  renderer: string;
  canvas: { width: number; height: number };
  renderTimesMs: number[];
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const readProbe = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as Window & { __agroPocClose?: () => unknown }).__agroPocClose;
    return probe?.();
  }) as Promise<Probe | undefined>;

test('owned hardware browser useful view, loaded geometry and sustained navigation', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(35 * 60 * 1000);
  const file = process.env['POC_CLOSE_OWNER'];
  test.skip(!file, 'Requires the supervised POC-CLOSE owner');
  if (!file) return;
  const owner = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(owner.runId).toMatch(/^[a-f0-9]{32}$/);
  expect(owner.project).toBe('agrosphere-poc-close-' + owner.runId);
  expect(path.dirname(path.resolve(owner.privateDirectory))).toBe(path.resolve(os.tmpdir()));
  expect(await fs.readFile(path.join(owner.privateDirectory, '.poc-close-owner'), 'utf8')).toBe(
    owner.runId,
  );
  const expiry = Date.parse(owner.expiresUtc);
  expect(expiry - Date.now()).toBeGreaterThan(40 * 60 * 1000);
  expect(new URL(owner.webOrigin).hostname).toBe('localhost');
  const executable = owner.browserExecutable as string;
  expect(
    createHash('sha256')
      .update(await fs.readFile(executable))
      .digest('hex'),
  ).toBe(owner.browserExecutableSha256);
  const clients = JSON.parse(
    await fs.readFile(path.join(owner.privateDirectory, 'generated-clients.json'), 'utf8'),
  );
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const publicReport = path.join(path.dirname(file), 'web-rendered.json');
  const checkLease = async () => {
    const fresh = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(fresh.runId).toBe(owner.runId);
    expect(fresh.status).not.toMatch(/CLEAN|FAILED/);
    expect(expiry - Date.now()).toBeGreaterThan(15 * 60 * 1000);
  };
  const report = async () =>
    fs.writeFile(
      publicReport,
      JSON.stringify(
        {
          runId: owner.runId,
          kind: 'actual foreground hardware browser; no software renderer fallback',
          results,
          failures,
          result: failures.length ? 'FAIL' : 'IN_PROGRESS',
        },
        null,
        2,
      ),
    );
  try {
    for (const scene of [
      {
        name: 'story',
        estate: owner.canonical.estateId,
        count: 10,
        geometry: 'canonical-geometry.json',
      },
      {
        name: 'maximum',
        estate: owner.rendererFixtures.maximumEstateId,
        count: 100,
        geometry: 'maximum-geometry.json',
      },
    ]) {
      const loads: Record<string, unknown>[] = [];
      const sceneResult: Record<string, unknown> = { scene: scene.name, loads };
      results.push(sceneResult);
      for (let cold = 0; cold < 5; cold++) {
        await checkLease();
        const launchStart = Date.now();
        const browser = await chromium.launch({
          executablePath: executable,
          headless: false,
          args: ['--disable-features=LocalNetworkAccessChecks', '--window-size=1920,1080'],
        });
        try {
          const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
          });
          const page = await context.newPage();
          await page.bringToFront();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          let transferred = 0;
          cdp.on('Network.loadingFinished', (event) => {
            transferred += event.encodedDataLength;
          });
          let authenticated = 0;
          page.on('framenavigated', (frame) => {
            if (
              frame === page.mainFrame() &&
              !authenticated &&
              frame.url().startsWith(owner.webOrigin + '/dashboard')
            )
              authenticated = Date.now();
          });
          await page.goto(owner.webOrigin + '/login');
          await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
          await page.locator('#username').fill(clients.admin.username);
          await page.locator('#password').fill(clients.admin.password);
          await page.locator('#kc-login').click();
          await expect(
            page.getByRole('heading', { name: 'Your estates, connected.' }),
          ).toBeVisible();
          if (!authenticated)
            throw new Error('Successful-authentication callback timestamp unavailable');
          await page.getByLabel('Current estate').selectOption(scene.estate);
          await page.getByRole('link', { name: 'Digital twin', exact: true }).click();
          await expect.poll(async () => (await readProbe(page))?.rows.length).toBe(scene.count);
          await expect(page.locator('.viewer-status')).toContainText(
            scene.count + ' spatial features',
          );
          await expect(page.locator('.viewer-status')).not.toContainText('Navigating');
          const coldMs = Date.now() - authenticated;
          const probe = (await readProbe(page))!;
          if (
            /swiftshader|llvmpipe|software/i.test(probe.renderer) ||
            probe.renderer === 'UNAVAILABLE'
          ) {
            throw new Error('Hardware renderer unavailable: ' + probe.renderer);
          }
          if (coldMs > 10000) failures.push(scene.name + ' cold useful-view >10s: ' + coldMs);
          if (transferred > 100 * 1024 * 1024)
            failures.push(scene.name + ' first-view transfer >100MiB');
          loads.push({
            cold,
            coldUsefulMs: coldMs,
            launchToUsefulMs: Date.now() - launchStart,
            firstViewTransferredBytes: transferred,
            renderer: probe.renderer,
            canvas: probe.canvas,
          });
          await page.getByRole('link', { name: 'Overview', exact: true }).click();
          const warmStart = Date.now();
          await page.getByRole('link', { name: 'Digital twin', exact: true }).click();
          await expect.poll(async () => (await readProbe(page))?.rows.length).toBe(scene.count);
          await expect(page.locator('.viewer-status')).not.toContainText('Navigating');
          const warmMs = Date.now() - warmStart;
          loads.push({ cold, warmUsefulMs: warmMs });
          await report();
          if (warmMs > 10000) failures.push(scene.name + ' warm useful-view >10s: ' + warmMs);
          if (cold !== 4) continue;
          const browserCdp = await browser.newBrowserCDPSession();
          const hardware = await browserCdp.send('SystemInfo.getInfo');
          const version = browser.version();
          const samples: unknown[] = [];
          const sampleMemory = async () => {
            try {
              const processes = await browserCdp.send('SystemInfo.getProcessInfo');
              const ids = processes.processInfo.map((p) => p.id);
              if (!ids.every((id) => Number.isSafeInteger(id) && id > 0))
                throw new Error('Invalid browser process identity');
              const expression =
                '$ids=@(' +
                ids.join(',') +
                '); $p=Get-Process -Id $ids -ErrorAction SilentlyContinue; ' +
                '$gpu=Get-Counter "\\GPU Process Memory(*)\\Dedicated Usage" -ErrorAction SilentlyContinue; ' +
                '$sum=0; foreach($s in $gpu.CounterSamples){if($s.InstanceName -match "pid_(\\d+)_" -and $ids -contains [int]$Matches[1]){$sum+=$s.CookedValue}}; ' +
                '[pscustomobject]@{privateBytes=($p | Measure-Object PrivateMemorySize64 -Sum).Sum; dedicatedGpuBytes=$sum; gpuCounterAvailable=($null -ne $gpu); processIds=$ids} | ConvertTo-Json -Compress';
              const result = await promisify(execFile)(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-Command', expression],
                { timeout: 15000 },
              );
              samples.push({ at: Date.now(), ...JSON.parse(result.stdout) });
            } catch {
              samples.push({ at: Date.now(), unavailable: true });
            }
          };
          const canvas = page.locator('.cesium-widget canvas');
          const bounds = await canvas.boundingBox();
          if (!bounds) throw new Error('Rendered canvas has no bounds');
          let memoryPending = false;
          let memoryTask: Promise<void> | undefined;
          const navigate = async (duration: number) => {
            const end = Date.now() + duration;
            let iteration = 0;
            while (Date.now() < end) {
              await checkLease();
              await page.bringToFront();
              const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
              await page.mouse.move(center.x, center.y);
              await page.mouse.down();
              await page.mouse.move(center.x + (iteration % 2 ? -45 : 45), center.y + 12, {
                steps: 30,
              });
              await page.mouse.up();
              await page.mouse.wheel(0, iteration % 2 ? -35 : 35);
              if (++iteration % 10 === 0 && !memoryPending) {
                memoryPending = true;
                memoryTask = sampleMemory().finally(() => {
                  memoryPending = false;
                });
              }
            }
            await memoryTask;
          };
          await navigate(120000);
          const startProbe = (await readProbe(page))!;
          const begin = startProbe.renderTimesMs.at(-1) ?? 0;
          await navigate(600000);
          const last = (await readProbe(page))!;
          const times = last.renderTimesMs.filter((t) => t >= begin);
          const intervals = times.slice(1).map((t, i) => t - times[i]);
          const p95 = percentile(intervals, 0.95);
          if (p95 > 33.3) failures.push(scene.name + ' p95 inter-render >33.3ms: ' + p95);
          if (!samples.length || samples.some((s) => (s as { unavailable?: boolean }).unavailable))
            failures.push(scene.name + ' memory samples unavailable');
          const memories = samples as {
            privateBytes?: number;
            dedicatedGpuBytes?: number;
            gpuCounterAvailable?: boolean;
          }[];
          const peakPrivate = Math.max(...memories.map((s) => s.privateBytes ?? 0));
          const peakDedicatedGpu = Math.max(...memories.map((s) => s.dedicatedGpuBytes ?? 0));
          if (peakPrivate > 4 * 1024 ** 3)
            failures.push(scene.name + ' browser private bytes >4GiB');
          if (peakDedicatedGpu > 4 * 1024 ** 3) failures.push(scene.name + ' dedicated GPU >4GiB');
          if (!memories.every((s) => s.gpuCounterAvailable))
            failures.push(scene.name + ' dedicated GPU counter unavailable');
          const source = JSON.parse(
            await fs.readFile(path.join(owner.privateDirectory, scene.geometry), 'utf8'),
          );
          await fs.writeFile(
            path.join(path.dirname(file), 'web-' + scene.name + '-geometry.json'),
            JSON.stringify({
              runId: owner.runId,
              kind: last.renderer,
              rows: last.rows,
              authoritativeDtoSha256: createHash('sha256')
                .update(JSON.stringify(source))
                .digest('hex'),
            }),
          );
          await page.screenshot({ path: info.outputPath(scene.name + '-hardware.png') });
          Object.assign(sceneResult, {
            scene: scene.name,
            loads,
            version,
            viewport: page.viewportSize(),
            os: {
              platform: os.platform(),
              release: os.release(),
              cpu: os.cpus()[0]?.model,
              memoryBytes: os.totalmem(),
            },
            gpu: hardware.gpu,
            frameSamples: intervals.length,
            durationSeconds: 600,
            warmupSeconds: 120,
            p50Ms: percentile(intervals, 0.5),
            p95Ms: p95,
            maxMs: Math.max(...intervals),
            intervalsMs: intervals,
            memorySamples: samples,
            peakPrivate,
            peakDedicatedGpu,
          });
          await report();
        } finally {
          await browser.close();
        }
      }
    }
    await report();
    const final = JSON.parse(await fs.readFile(publicReport, 'utf8'));
    final.result = failures.length ? 'FAIL' : 'PASS';
    await fs.writeFile(publicReport, JSON.stringify(final, null, 2));
    expect(failures).toEqual([]);
  } catch (error) {
    failures.push('Capture did not complete: ' + (error instanceof Error ? error.name : 'Error'));
    await report();
    throw error;
  }
});
