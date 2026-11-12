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
  const privateRoot = await fs.realpath(owner.privateDirectory);
  expect(path.basename(privateRoot)).toMatch(new RegExp('^' + owner.project + '-'));
  expect(await fs.realpath(os.tmpdir())).toBe(path.join(privateRoot, 'playwright-temp'));
  expect((await fs.lstat(owner.privateDirectory)).isSymbolicLink()).toBe(false);
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
      const authoritative = JSON.parse(
        await fs.readFile(path.join(owner.privateDirectory, scene.geometry), 'utf8'),
      ) as { featureCode: string; referenceEntityId: string }[];
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
          page.setDefaultTimeout(20000);
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
          await page.getByRole('link', { name: /Digital twin$/ }).click();
          await page.getByLabel('Current estate').selectOption(scene.estate);
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
          await page.getByRole('link', { name: /Overview$/ }).click();
          const warmStart = Date.now();
          await page.getByRole('link', { name: /Digital twin$/ }).click();
          await page.getByLabel('Current estate').selectOption(scene.estate);
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
          const focusSamples = { focused: 0, unfocused: 0, hidden: 0 };
          const selectionRequests: Record<string, unknown>[] = [];
          let selectionStep = 0;
          let nextSelection = Date.now();
          const navigate = async (duration: number) => {
            const end = Date.now() + duration;
            let iteration = 0;
            while (Date.now() < end) {
              await checkLease();
              await page.bringToFront();
              const focus = await page.evaluate(() => ({
                focused: document.hasFocus(),
                visible: document.visibilityState === 'visible',
              }));
              if (focus.focused) focusSamples.focused++;
              else focusSamples.unfocused++;
              if (!focus.visible) focusSamples.hidden++;
              if (Date.now() >= nextSelection) {
                const started = Date.now();
                if (selectionStep % 2) {
                  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
                  selectionRequests.push({ action: 'reset', elapsedMs: Date.now() - started });
                } else {
                  const button = page.locator('.block-list button').nth((selectionStep / 2) % 2);
                  const code = (await button.locator('strong').innerText()).trim();
                  const expected = authoritative.find(
                    (feature) => feature.featureCode === code,
                  )?.referenceEntityId;
                  if (!expected)
                    throw new Error('Explorer block has no authoritative geometry identity');
                  await button.click();
                  await expect(page.locator('.detail .uuid')).toHaveText(expected);
                  selectionRequests.push({
                    action: 'select',
                    blockId: expected,
                    elapsedMs: Date.now() - started,
                  });
                }
                selectionStep++;
                nextSelection = Date.now() + 15000;
              }
              const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
              await page.mouse.move(center.x, center.y);
              await page.mouse.down();
              await page.mouse.move(
                center.x + (iteration % 2 ? -45 : 45),
                center.y + (iteration % 2 ? -12 : 12),
                {
                  steps: 30,
                },
              );
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
          const captureStarted = Date.now();
          await navigate(600000);
          const last = (await readProbe(page))!;
          const times = last.renderTimesMs.filter((t) => t >= begin);
          const intervals = times.slice(1).map((t, i) => t - times[i]);
          const p95 = percentile(intervals, 0.95);
          const renderSpanMs = (times.at(-1) ?? 0) - (times[0] ?? 0);
          if (intervals.length < 2 || !Number.isFinite(p95) || renderSpanMs < 599000)
            failures.push(scene.name + ' render timestamps do not cover the ten-minute capture');
          if (focusSamples.unfocused || focusSamples.hidden)
            failures.push(scene.name + ' foreground focus/visibility was lost');
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
            maxMs: intervals.reduce((maximum, value) => Math.max(maximum, value), 0),
            actualCaptureSeconds: (Date.now() - captureStarted) / 1000,
            renderSpanMs,
            intervalsMs: intervals,
            memorySamples: samples,
            focusSamples,
            selectionRequests,
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

test('connected production, environment, assistant and manager alert views', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(5 * 60 * 1000);
  const file = process.env['POC_CLOSE_OWNER'];
  test.skip(!file, 'Requires the supervised POC-CLOSE owner');
  if (!file) return;
  const owner = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(await fs.readFile(path.join(owner.privateDirectory, '.poc-close-owner'), 'utf8')).toBe(
    owner.runId,
  );
  expect(Date.parse(owner.expiresUtc) - Date.now()).toBeGreaterThan(15 * 60 * 1000);
  const clients = JSON.parse(
    await fs.readFile(path.join(owner.privateDirectory, 'generated-clients.json'), 'utf8'),
  );
  const directories = (await fs.readdir(owner.privateDirectory, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('agrosphere-'),
  );
  const fixture = async (name: string) => {
    for (const directory of directories) {
      try {
        return JSON.parse(
          await fs.readFile(path.join(owner.privateDirectory, directory.name, name), 'utf8'),
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
    }
    throw new Error('Required owned browser fixture is unavailable');
  };
  const production = await fixture('browser-fixture.json');
  const ai = await fixture('m4-browser.json');
  const browser = await chromium.launch({
    executablePath: owner.browserExecutable,
    headless: false,
    args: ['--disable-features=LocalNetworkAccessChecks'],
  });
  const report: Record<string, unknown> = { runId: owner.runId, result: 'IN_PROGRESS' };
  const output = path.join(path.dirname(file), 'connected-web.json');
  const save = () => fs.writeFile(output, JSON.stringify(report, null, 2));
  const login = async (person: { username: string; password: string }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(owner.webOrigin + '/login');
    await page.getByRole('button', { name: 'Sign in with Keycloak' }).click();
    await page.locator('#username').fill(person.username);
    await page.locator('#password').fill(person.password);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { name: 'Your estates, connected.' })).toBeVisible();
    await page.getByLabel('Current estate').selectOption(owner.canonical.estateId);
    return page;
  };
  try {
    const page = await login(clients.admin);
    let bearer = '';
    page.on('request', async (request) => {
      if (request.url().startsWith(owner.gateway + '/api/'))
        bearer = (await request.headerValue('authorization')) ?? bearer;
    });
    await page.getByRole('link', { name: 'Production history', exact: true }).click();
    await page.getByLabel('Current estate').selectOption(owner.canonical.estateId);
    await expect(page.getByLabel('Current estate')).toHaveValue(owner.canonical.estateId);
    await expect(
      page
        .getByLabel('Production block')
        .locator('option[value="' + owner.canonical.blockId + '"]'),
    ).toHaveCount(1);
    await page.getByLabel('Production block').selectOption(owner.canonical.blockId);
    await page.getByLabel('From collection date').fill(production.day);
    await page.getByLabel('To collection date').fill(production.day);
    let started = Date.now();
    await page.getByRole('button', { name: 'Read history', exact: true }).click();
    await expect(page.getByRole('cell', { name: '3.000', exact: true })).toBeVisible();
    await expect(page.getByText('Pending DRC remains', { exact: true })).toBeVisible();
    report.productionRefreshMs = Date.now() - started;
    const window = owner.continuity.environmentWindow;
    await page.getByLabel('From observation UTC').fill(window.from);
    await page.getByLabel('To observation UTC').fill(window.to);
    started = Date.now();
    await page.getByRole('button', { name: 'Read environmental history', exact: true }).click();
    const environment = page.getByRole('region', {
      name: 'Environmental observation history',
      exact: true,
    });
    await expect(environment.locator('tbody tr')).toHaveCount(20);
    await expect(environment.getByText('-2.125', { exact: true })).toBeVisible();
    await expect(environment.getByText(/Unresolved environmental conflicts:/)).toBeVisible();
    report.environmentRefreshMs = Date.now() - started;
    await page.getByLabel('AI dataset fingerprint').fill(ai.datasetId);
    await page.getByLabel('AI forecast cutoff').fill(ai.asOf);
    await page.getByLabel('AI label cutoff').fill(ai.labelAsOf);
    started = Date.now();
    await page.getByRole('button', { name: 'Read forecast', exact: true }).click();
    const assistant = page.getByRole('region', { name: 'Forecasts and evidence assistant' });
    await expect(assistant.getByRole('cell', { name: '68.000', exact: true })).toBeVisible();
    await expect(assistant.getByRole('cell', { name: '82.000', exact: true })).toBeVisible();
    report.aiRefreshMs = Date.now() - started;
    await page.getByRole('button', { name: 'Explain anomaly', exact: true }).click();
    await expect(assistant.getByText(/deterministic evidence templates/)).toBeVisible();
    const prefix =
      '/api/v1/ai/estates/' + owner.canonical.estateId + '/blocks/' + owner.canonical.blockId;
    expect(bearer).toMatch(/^Bearer /);
    const response = await page.request.post(owner.gateway + prefix + '/assistant', {
      headers: { Authorization: bearer },
      data: {
        datasetId: ai.datasetId,
        mode: 'GENERATED_POINT_IN_TIME',
        asOf: ai.asOf,
        labelAsOf: ai.labelAsOf,
        intent: 'EVIDENCE_INSPECTION',
        environmentFrom: window.from,
        environmentTo: window.to,
      },
    });
    expect(response.status()).toBe(200);
    const answer = await response.json();
    expect(answer.scope).toEqual({
      estateId: owner.canonical.estateId,
      blockId: owner.canonical.blockId,
    });
    expect(answer.provider).toBe('DETERMINISTIC_EVIDENCE_V1');
    expect(answer.status).toBe('PARTIAL');
    expect(answer.limitations.join(' ')).toContain(
      'Environmental evidence is missing, incomplete or truncated',
    );
    const links = new Set<string>();
    for (const statement of answer.statements)
      for (const reference of statement.evidenceRefs) links.add(reference.href);
    for (const href of links) {
      expect(
        href.startsWith(prefix) ||
          href.startsWith(
            '/api/v1/analytics/estates/' +
              owner.canonical.estateId +
              '/blocks/' +
              owner.canonical.blockId,
          ),
      ).toBeTruthy();
      expect(
        (
          await page.request.get(owner.gateway + href, { headers: { Authorization: bearer } })
        ).status(),
      ).toBe(200);
    }
    report.assistantWithEnvironment = {
      status: answer.status,
      provider: answer.provider,
      window,
      limitations: answer.limitations,
      sameScopeLinksVerified: links.size,
    };
    await page.screenshot({
      path: info.outputPath('connected-production-environment-ai.png'),
      fullPage: true,
    });
    await save();

    const managerA = await login(clients.managerA);
    const managerB = await login(clients.managerB);
    let managerBearer = '';
    let listUrl = '';
    managerB.on('request', async (request) => {
      if (request.url().startsWith(owner.gateway + '/api/v2/alerts?')) {
        listUrl = request.url();
        managerBearer = (await request.headerValue('authorization')) ?? '';
      }
    });
    await managerB.getByRole('link', { name: 'Alerts', exact: true }).click();
    await expect(
      managerB.getByRole('heading', { name: 'Crop-health alerts', exact: true }),
    ).toBeVisible();
    await expect.poll(() => managerBearer.length).toBeGreaterThan(10);
    await managerA.bringToFront();
    await managerA.getByRole('link', { name: 'Incidents', exact: true }).click();
    await managerA.getByRole('button', { name: 'Report simulated incident', exact: true }).click();
    const editor = managerA.getByRole('region', { name: 'New simulated report', exact: true });
    await editor
      .getByRole('combobox', { name: 'Field', exact: true })
      .selectOption(owner.canonical.blockId);
    await editor.getByLabel('Severity', { exact: true }).selectOption('HIGH');
    await editor
      .getByLabel('Summary', { exact: true })
      .fill('SIMULATED connected foreground alert');
    await editor
      .getByLabel('Details', { exact: true })
      .fill('SIMULATED finite POC-CLOSE UI verification');
    const saved = managerA.waitForResponse(
      (response) =>
        response.url() === owner.gateway + '/api/v1/incidents' &&
        response.request().method() === 'POST',
    );
    await editor.getByRole('button', { name: 'Save simulated report', exact: true }).click();
    const committed = await saved;
    expect(committed.status()).toBe(201);
    const incident = await committed.json();
    const acceptedResponseAt = Date.now();
    const visible = await managerB.request.get(listUrl, {
      headers: { Authorization: managerBearer },
    });
    expect(visible.status()).toBe(200);
    const visiblePage = await visible.json();
    const visibleRow = visiblePage.content.find(
      (row: { incidentId: string }) => row.incidentId === incident.id,
    );
    expect(visibleRow).toBeTruthy();
    const apiVisibleAt = Date.now();
    await managerB.bringToFront();
    const refreshed = await managerB.waitForResponse(
      async (response) =>
        response.url().startsWith(owner.gateway + '/api/v2/alerts?') &&
        response.status() === 200 &&
        (await response.json()).content.some((row: { id: string }) => row.id === visibleRow.id),
      { timeout: 35000 },
    );
    const rows = (await refreshed.json()).content;
    await expect(managerB.locator('.alert-list li')).toHaveCount(rows.length);
    await managerB
      .locator('.alert-list li')
      .nth(rows.findIndex((row: { id: string }) => row.id === visibleRow.id))
      .getByRole('button')
      .click();
    const bDetails = managerB.getByRole('region', { name: 'Alert details', exact: true });
    await expect(bDetails.getByRole('link', { name: 'Open source incident' })).toHaveAttribute(
      'href',
      '/incidents?report=' + incident.id,
    );
    const observedAt = Date.now();
    report.alertPropagation = {
      incidentId: incident.id,
      alertId: visibleRow.id,
      acceptedResponseAt,
      apiVisibleAt,
      observedAt,
      apiVisibleToUiMs: observedAt - apiVisibleAt,
    };
    await managerA.bringToFront();
    await managerA.getByRole('link', { name: 'Alerts', exact: true }).click();
    await managerA.locator('.alert-list li').first().getByRole('button').click();
    const aDetails = managerA.getByRole('region', { name: 'Alert details', exact: true });
    await expect(aDetails.getByRole('link', { name: 'Open source incident' })).toHaveAttribute(
      'href',
      '/incidents?report=' + incident.id,
    );
    await aDetails.getByRole('button', { name: 'Mark read', exact: true }).click();
    await expect(aDetails).toContainText('Read by you');
    await expect(bDetails).toContainText('Unread by you');
    await aDetails
      .getByRole('button', { name: 'Acknowledge for estate team', exact: true })
      .click();
    await expect(
      aDetails.getByRole('button', { name: 'Acknowledge for estate team', exact: true }),
    ).toBeDisabled();
    await managerB.bringToFront();
    await managerB.getByRole('button', { name: 'Refresh alerts', exact: true }).click();
    await managerB.locator('.alert-list li').first().getByRole('button').click();
    await expect(bDetails).toContainText('Acknowledged');
    await expect(bDetails).toContainText('Unread by you');
    report.distinctManagerReadAndSharedAck = true;
    await managerB.screenshot({
      path: info.outputPath('connected-manager-alert.png'),
      fullPage: true,
    });
    expect(Number(report.productionRefreshMs)).toBeLessThanOrEqual(10000);
    expect(Number(report.environmentRefreshMs)).toBeLessThanOrEqual(10000);
    expect(Number(report.aiRefreshMs)).toBeLessThanOrEqual(10000);
    expect(observedAt - apiVisibleAt).toBeLessThanOrEqual(35000);
    report.result = 'PASS';
    await save();
  } catch (error) {
    report.result = 'FAIL';
    report.errorType = error instanceof Error ? error.name : 'Error';
    await save();
    throw error;
  } finally {
    await browser.close();
  }
});
