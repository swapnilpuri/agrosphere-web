import { defineConfig, devices } from '@playwright/test';
const port = process.env['AGRO_TEST_PORT'] ?? '4200';
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: process.env['AGRO_NO_PREVIEW']
    ? undefined
    : {
        command: 'node scripts/preview.mjs',
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env['CI'] && !process.env['AGRO_TEST_PORT'],
      },
  projects: [
    {
      name: 'poc-close-rendered',
      testMatch: 'poc-close-rendered.spec.ts',
      use: { trace: 'off', headless: false },
    },
    {
      name: 'environment-live',
      testMatch: 'environment-live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'm4-live',
      testMatch: 'm4-live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'production-live',
      testMatch: 'production-live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'telemetry-live',
      testMatch: 'telemetry-live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'ui',
      testMatch: [
        'ui.spec.ts',
        'administration.spec.ts',
        'workforce.spec.ts',
        'crop-health.spec.ts',
        'alerts.spec.ts',
        'telemetry.spec.ts',
        'production.spec.ts',
        'environment.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks', '--disable-webgl'] },
      },
    },
    {
      name: 'graphics',
      testMatch: 'graphics.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'live',
      testMatch: 'live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
});
