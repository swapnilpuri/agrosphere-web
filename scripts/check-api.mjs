import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agrosphere-api-'));
for (const name of ['estate', 'spatial', 'operations', 'telemetry', 'analytics', 'ai']) {
  const generated = path.join(temp, name + '.ts');
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/openapi-typescript/bin/cli.js',
      'contracts/' + name + '.openapi.json',
      '-o',
      generated,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(1);
  const [actual, expected] = await Promise.all([
    fs.readFile(generated, 'utf8'),
    fs.readFile('src/api/' + name + '.generated.ts', 'utf8'),
  ]);
  if (actual.replaceAll('\r\n', '\n') !== expected.replaceAll('\r\n', '\n'))
    throw new Error('Generated ' + name + ' types are stale; run npm run api:generate');
  await fs.unlink(generated);
}
await fs.rmdir(temp);

const operationsRelease = JSON.parse(
  await fs.readFile('contracts/operations.release.json', 'utf8'),
);
if (
  operationsRelease.release !== '0.9.0' ||
  createHash('sha256')
    .update(await fs.readFile('contracts/operations.openapi.json'))
    .digest('hex') !== operationsRelease.operationsOpenapiSha256
)
  throw new Error('Operations release pin mismatch');

const telemetryRelease = JSON.parse(await fs.readFile('contracts/telemetry.release.json', 'utf8'));
if (
  telemetryRelease.release !== '0.10.0' ||
  telemetryRelease.sourceManifestSha256 !==
    '174140bc1db129ab879d9e431e9065a6715746c31c70fa0ec2bb7992063f01b0' ||
  telemetryRelease.telemetryOpenapiSha256 !==
    '140ec8ce185dee4e62d5ef53309f06b3319d4be77d28d8078fd5cb9126c58ffa' ||
  createHash('sha256')
    .update(await fs.readFile('contracts/telemetry.openapi.json'))
    .digest('hex') !== telemetryRelease.telemetryOpenapiSha256
)
  throw new Error('Telemetry release pin mismatch');

const analyticsRelease = JSON.parse(await fs.readFile('contracts/analytics.release.json', 'utf8'));
if (
  analyticsRelease.release !== '0.12.0' ||
  analyticsRelease.sourceManifestSha256 !==
    '1759e5d95fb3602b623b995e4650f035b67dbb550760116587f46c031ca7d111' ||
  analyticsRelease.analyticsOpenapiSha256 !==
    '7ab8ff23db5c81e3ba1ad537fdab6037f908bc815ca7c90a1d117d573a44e432' ||
  createHash('sha256')
    .update(await fs.readFile('contracts/analytics.openapi.json'))
    .digest('hex') !== analyticsRelease.analyticsOpenapiSha256
)
  throw new Error('Analytics release pin mismatch');

// Preserve the exact previously accepted Analytics pin while current types use 0.12.0.
if (
  createHash('sha256')
    .update(await fs.readFile('docs/analytics-previous-0.11.0/analytics.openapi.json'))
    .digest('hex') !== 'f84ce861b7f6ed1b287ca3a5e8430061a568f9c22cac280d52fbb574117df300'
)
  throw new Error('Previous Analytics pin archive mismatch');
if (
  createHash('sha256')
    .update(await fs.readFile('docs/analytics-previous-0.11.0/analytics.release.json'))
    .digest('hex') !== '2aa82532b0e0544b27046d25375bf3335d0b8520dd0e4b684ab1d38f0bcd6a21'
)
  throw new Error('Previous Analytics pin archive mismatch');

const aiRelease = JSON.parse(await fs.readFile('contracts/ai.release.json', 'utf8'));
if (
  aiRelease.release !== '0.13.0' ||
  aiRelease.sourceManifestSha256 !==
    'a6b4d93666d8e2cdb83c826315edaabe2d48d73fe93ec147c76a8f26f1cd3914' ||
  aiRelease.aiOpenapiSha256 !==
    '14ef1d81d40eebb0e528dd0cea356545ff41c0cc0e881ed1b5e1f44c07e6631e' ||
  createHash('sha256')
    .update(await fs.readFile('contracts/ai.openapi.json'))
    .digest('hex') !== aiRelease.aiOpenapiSha256
)
  throw new Error('AI release pin mismatch');
