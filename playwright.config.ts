import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/preview.mjs',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
  },
  projects: [
    {
      name: 'ui',
      testMatch: ['ui.spec.ts', 'administration.spec.ts', 'workforce.spec.ts'],
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
