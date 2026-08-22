import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createConfig } from '../src/core/config.js';

test('createConfig centralizes aliases and security limits', () => {
  const config = createConfig({
    NODE_ENV: 'production',
    AWS_S3_BUCKET_NAME: 'bucket',
    VERIFICATION_UPLOAD_MAX_BYTES: '1048576',
    BADGE_GENERATION_DAILY_LIMIT: '2',
    SESSION_TTL_SEC: '3600',
  });
  assert.equal(config.auth.secureCookie, true);
  assert.equal(config.auth.allowBearerAuth, false);
  assert.equal(config.auth.sessionTtlMs, 3_600_000);
  assert.equal(config.storage.bucket, 'bucket');
  assert.equal(config.storage.verificationMaxBytes, 1_048_576);
  assert.equal(config.badges.dailyGenerationLimit, 2);
});

test('createConfig keeps somoim automation safe by default', () => {
  const config = createConfig({});

  assert.equal(config.somoimAutomation.allowSubmit, false, 'final submit must stay off unless enabled');
  assert.equal(config.somoimAutomation.staleClaimSeconds, 900);
  assert.equal(config.somoimAutomation.maxAttempts, 3);
});

test('createConfig ignores out of range somoim automation retry settings', () => {
  const tooSmall = createConfig({
    SOMOIM_AUTOMATION_STALE_CLAIM_SEC: '5',
    SOMOIM_AUTOMATION_MAX_ATTEMPTS: '0',
  });
  assert.equal(tooSmall.somoimAutomation.staleClaimSeconds, 900, 'a tiny window would requeue running jobs');
  assert.equal(tooSmall.somoimAutomation.maxAttempts, 3);

  const tooLarge = createConfig({ SOMOIM_AUTOMATION_MAX_ATTEMPTS: '99' });
  assert.equal(tooLarge.somoimAutomation.maxAttempts, 3, 'endless retries must not be configurable');

  const custom = createConfig({
    SOMOIM_AUTOMATION_STALE_CLAIM_SEC: '300',
    SOMOIM_AUTOMATION_MAX_ATTEMPTS: '2',
  });
  assert.equal(custom.somoimAutomation.staleClaimSeconds, 300);
  assert.equal(custom.somoimAutomation.maxAttempts, 2);
});

test('runtime modules do not read process.env outside the composition root', async () => {
  const allowed = new Set([
    path.normalize('src/server.js'),
    path.normalize('src/core/config.js'),
  ]);
  const files = await collect('src');
  const offenders = [];
  for (const file of files.filter((value) => value.endsWith('.js'))) {
    if (allowed.has(path.normalize(file))) continue;
    if ((await readFile(file, 'utf8')).includes('process.env')) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

async function collect(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const full = path.join(directory, entry);
    if ((await stat(full)).isDirectory()) output.push(...await collect(full));
    else output.push(full);
  }
  return output;
}
