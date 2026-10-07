import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'fixtures');

function cli(args) {
  return spawnSync(process.execPath, ['src/cli.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000 });
}

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'stocky-demo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI generates forecasts, three supplier POs, CSVs, email drafts and verifiable run hashes', async t => {
  // Given
  const output = join(await temporary(t), 'run');
  // When
  const result = cli(['generate', '--input', fixtures, '--out', output]);
  // Then
  assert.equal(result.status, 0, result.stderr);
  const run = JSON.parse(await readFile(join(output, 'run.json'), 'utf8'));
  assert.equal(run.ordersRead, 94);
  assert.equal(run.purchaseOrders.length, 3);
  assert.equal(run.files.length, 11);
  for (const entry of run.files) {
    const content = await readFile(join(output, entry.file));
    assert.equal(sha256(content), entry.sha256);
    assert.deepEqual(content, await readFile(join(root, 'examples', entry.file)));
  }
  assert.equal(run.networkRequests, 0);
  assert.equal(run.stockWrites, 0);
  assert.equal(run.emailsSent, 0);
});

test('CLI approves a reviewed draft into a separate receipt without modifying the PO', async t => {
  // Given
  const directory = await temporary(t);
  const poFile = join(root, 'examples', 'PO-2026-10-01-demo-supplier-home.json');
  const original = await readFile(poFile);
  const receiptFile = join(directory, 'approval.json');
  // When
  const result = cli(['approve', '--po', poFile, '--sha256', sha256(original), '--reviewer', 'demo-operator', '--out', receiptFile]);
  // Then
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  assert.equal(receipt.status, 'approved_locally');
  assert.equal(receipt.poSha256, sha256(original));
  assert.deepEqual(await readFile(poFile), original);
  assert.deepEqual(await readdir(directory), ['approval.json']);
});

test('CLI refuses changed reviewed bytes and leaves no approval artifact', async t => {
  // Given
  const directory = await temporary(t);
  const poFile = join(root, 'examples', 'PO-2026-10-01-demo-supplier-home.json');
  // When
  const result = cli(['approve', '--po', poFile, '--sha256', '0'.repeat(64), '--reviewer', 'demo-operator', '--out', join(directory, 'approval.json')]);
  // Then
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 mismatch/);
  assert.deepEqual(await readdir(directory), []);
});

test('CLI refuses supplier minimum shortfalls and leaves no approval artifact', async t => {
  // Given
  const directory = await temporary(t);
  const poFile = join(root, 'examples', 'PO-2026-10-01-demo-supplier-light.json');
  const content = await readFile(poFile);
  // When
  const result = cli(['approve', '--po', poFile, '--sha256', sha256(content), '--reviewer', 'demo-operator', '--out', join(directory, 'approval.json')]);
  // Then
  assert.equal(result.status, 1);
  assert.match(result.stderr, /minimum not met/);
  assert.deepEqual(await readdir(directory), []);
});

test('CLI preserves an existing output directory and its review records', async t => {
  // Given
  const output = await temporary(t);
  await writeFile(join(output, 'review.txt'), 'demo review record');
  // When
  const result = cli(['generate', '--input', fixtures, '--out', output]);
  // Then
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(await readFile(join(output, 'review.txt'), 'utf8'), 'demo review record');
  assert.deepEqual(await readdir(output), ['review.txt']);
});

test('CLI preserves an existing approval receipt', async t => {
  // Given
  const directory = await temporary(t);
  const receiptFile = join(directory, 'approval.json');
  await writeFile(receiptFile, 'existing demo approval');
  const poFile = join(root, 'examples', 'PO-2026-10-01-demo-supplier-home.json');
  const content = await readFile(poFile);
  // When
  const result = cli(['approve', '--po', poFile, '--sha256', sha256(content), '--reviewer', 'demo-operator', '--out', receiptFile]);
  // Then
  assert.equal(result.status, 1);
  assert.equal(await readFile(receiptFile, 'utf8'), 'existing demo approval');
});

test('CLI does not offer a send mode', () => {
  // Given / When
  const result = cli(['generate', '--input', fixtures, '--out', 'unused', '--send']);
  // Then
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option/);
});
