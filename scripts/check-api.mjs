import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agrosphere-api-'));
for (const name of ['estate', 'spatial', 'operations']) {
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
  operationsRelease.release !== '0.6.0' ||
  createHash('sha256')
    .update(await fs.readFile('contracts/operations.openapi.json'))
    .digest('hex') !== operationsRelease.operationsOpenapiSha256
)
  throw new Error('Operations release pin mismatch');
