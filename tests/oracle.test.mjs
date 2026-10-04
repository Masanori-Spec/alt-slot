import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { applyReview, makePacket, openDocument } from '../src/core.mjs';

const fixture = name => fileURLToPath(new URL(`../fixtures/${name}.docx`, import.meta.url));
const source = readFileSync(fixture('bench'));
const oraclePath = fileURLToPath(new URL('./oracle.py', import.meta.url));
const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || process.env.PYTHON || 'python3';
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
function oracle(...args) {
  const child = spawnSync(python, [oraclePath, ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
function verifyOutput(name, bytes, expected, noop = false) {
  const directory = mkdtempSync(join(tmpdir(), 'altslot-oracle-'));
  try {
    const output = join(directory, 'output.docx'), literals = join(directory, 'expected.json');
    writeFileSync(output, bytes);
    writeFileSync(literals, JSON.stringify(expected));
    return oracle('verify', fixture(name), output, literals, ...(noop ? ['--noop'] : []));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function refreshedKey(record) {
  const { sourceSha256, part, path, originalAttributes, mediaSha256 } = record;
  return hash(JSON.stringify({ sourceSha256, part, path, originalAttributes, mediaSha256 }));
}
const identityKeys = ['sourceSha256', 'part', 'path', 'originalAttributes', 'mediaSha256', 'key', 'original'];
const identity = record => Object.fromEntries(identityKeys.map(key => [key, record[key]]));

test('Python ZIP and ElementTree independently confirm five distinct literal occurrences', async () => {
  const independent = oracle('inspect', fixture('bench'));
  const app = await openDocument(source);
  assert.equal(app.occurrences.length, 5);
  assert.deepEqual(app.occurrences.map(identity), independent.occurrences.map(identity));
  assert.deepEqual(independent.occurrences.map(o => [o.name, o.original, o.placement, o.references]), [
    ['Intake icon', { descr: 'Status icon', title: 'Status' }, 'inline', 1],
    ['Release icon', { descr: 'Status icon', title: 'Status' }, 'inline', 1],
    ['Floating summary icon', { descr: null, title: 'Floating marker' }, 'floating', 1],
    ['Shared header icon', { descr: 'Header symbol', title: null }, 'inline', 2],
    ['Footer icon', { descr: '', title: 'Footer badge' }, 'inline', 2],
  ]);
  assert.equal(new Set(app.occurrences.map(o => o.key)).size, 5);
  assert.equal(new Set(app.occurrences.map(o => o.mediaSha256)).size, 1);
  assert.ok(independent.members['customXml/witness.bin']);
  assert.match(independent.occurrences[0].openingTag, /descr='Status\ticon'/);
  assert.ok(!independent.occurrences[2].openingTag.endsWith('/>'));
  assert.match(independent.occurrences[3].openingTag, /Header&#x20;symbol/);
});

test('keep-only, empty subset and same-value actions preserve whole ZIP bytes', async () => {
  const doc = await openDocument(source);
  const unchanged = makePacket(doc);
  const sameValue = clone(unchanged);
  sameValue.records[0].edit.descr = { action: 'set', value: 'Status icon' };
  sameValue.records[2].edit.descr = { action: 'remove' };
  for (const packet of [unchanged, { ...unchanged, records: [] }, sameValue]) {
    const result = await applyReview(source, packet);
    assert.deepEqual(Buffer.from(result.bytes), source);
    assert.equal(result.receipt.noOpByteIdentical, true);
    assert.equal(verifyOutput('bench', result.bytes, [], true).noOpByteIdentical, true);
  }
});

test('Buffer and nonzero-offset views remain unmodified and no-op returns owned bytes', async () => {
  const padded = new Uint8Array(source.length + 64);
  padded.set(source, 32);
  for (const input of [Buffer.from(source), padded.subarray(32, 32 + source.length)]) {
    const originalHash = hash(input), doc = await openDocument(input), packet = makePacket(doc);
    packet.records[0].edit.descr = { action: 'set', value: 'Ownership check' };
    await applyReview(input, packet);
    assert.equal(hash(input), originalHash, 'Editing mutated caller-owned bytes');
    const noop = await applyReview(input, makePacket(doc));
    noop.bytes[0] ^= 1;
    assert.equal(hash(input), originalHash, 'No-op result aliases caller-owned bytes');
  }
});

test('reordered review applies distinct repeated-image edits and independent literal attrs only', async () => {
  const doc = await openDocument(source), packet = makePacket(doc);
  const edits = {
    'Intake icon': { descr: { action: 'set', value: 'Intake approved & checked <today>' }, title: { action: 'remove' } },
    'Release icon': { descr: { action: 'set', value: 'Release pending' }, title: { action: 'keep' } },
    'Floating summary icon': { descr: { action: 'set', value: 'Summary "quoted" \'marker\'\tline\n日本語 🧭' }, title: { action: 'set', value: '' } },
    'Shared header icon': { descr: { action: 'keep' }, title: { action: 'set', value: 'Shared context' } },
    'Footer icon': { descr: { action: 'remove' }, title: { action: 'set', value: 'Review copy' } },
  };
  const expected = [
    { part: 'word/document.xml', path: '0/3/1/0/0/1', after: { descr: 'Intake approved & checked <today>', title: null } },
    { part: 'word/document.xml', path: '0/5/1/0/0/1', after: { descr: 'Release pending', title: 'Status' } },
    { part: 'word/document.xml', path: '0/7/1/0/0/5', after: { descr: 'Summary "quoted" \'marker\'\tline\n日本語 🧭', title: '' } },
    { part: 'word/header1.xml', path: '0/2/0/0/1', after: { descr: 'Header symbol', title: 'Shared context' } },
    { part: 'word/footer1.xml', path: '0/2/0/0/1', after: { descr: null, title: 'Review copy' } },
  ];
  for (const record of packet.records) record.edit = edits[doc.occurrences.find(o => o.key === record.key).name];
  packet.records.reverse();
  const result = await applyReview(source, packet);
  const proof = verifyOutput('bench', result.bytes, expected);
  assert.deepEqual(proof.changedParts, ['word/document.xml', 'word/footer1.xml', 'word/header1.xml']);
  assert.equal(result.receipt.changedOccurrences, 5);
  assert.equal(result.receipt.verification.nativeWordTested, false);
  assert.equal(result.receipt.verification.screenReaderTested, false);
});

test('selective packet changes one occurrence and leaves identical sibling unmodified', async () => {
  const doc = await openDocument(source), packet = makePacket(doc);
  packet.records = [packet.records[1]];
  packet.records[0].edit.descr = { action: 'set', value: 'Only release changed' };
  const result = await applyReview(source, packet);
  const proof = verifyOutput('bench', result.bytes, [{ part: 'word/document.xml', path: '0/5/1/0/0/1', after: { descr: 'Only release changed', title: 'Status' } }]);
  assert.deepEqual(proof.changedParts, ['word/document.xml']);
  assert.equal(result.receipt.keptUnlisted, 4);
});

test('all unsupported objects are visible and an editable control remains isolated', async () => {
  const bytes = readFileSync(fixture('exclusions')), doc = await openDocument(bytes);
  const independent = oracle('inspect', fixture('exclusions'));
  assert.equal(independent.occurrences.length, 9);
  assert.equal(doc.occurrences.length, 1);
  assert.equal(doc.occurrences[0].name, 'Control');
  assert.deepEqual(doc.exclusions.map(x => [x.name, x.reason]).sort(), [
    ['', 'legacy-or-embedded'], ['Tracked', 'tracked-context'], ['Chart', 'non-picture-or-grouped'],
    ['SmartArt', 'non-picture-or-grouped'], ['Grouped', 'non-picture-or-grouped'],
    ['External', 'external-or-missing-image'], ['AlternateContent', 'alternate-content'],
    ['Decorative', 'decorative'], ['Conflicting', 'conflicting-carrier'],
  ].sort());
  const packet = makePacket(doc);
  packet.records[0].edit.descr = { action: 'set', value: 'Plain control reviewed' };
  const result = await applyReview(bytes, packet);
  verifyOutput('exclusions', result.bytes, [{ part: 'word/document.xml', path: '0/3/1/0/0/1', after: { descr: 'Plain control reviewed', title: 'Control' } }]);
});

test('changed source is rejected even if only packet source digests are refreshed', async () => {
  const packet = makePacket(await openDocument(source));
  const changed = readFileSync(fixture('bench-changed'));
  await assert.rejects(() => applyReview(changed, packet));
  const refreshed = clone(packet);
  refreshed.sourceSha256 = hash(changed);
  for (const record of refreshed.records) record.sourceSha256 = refreshed.sourceSha256;
  await assert.rejects(() => applyReview(changed, refreshed));
});

test('tampered originals, paths, media and attrs fail even with self-refreshed record digests', async () => {
  const packet = makePacket(await openDocument(source));
  const cases = [
    record => { record.original.descr = 'Forged original'; },
    record => { record.originalAttributes.find(x => x[0] === '{}descr')[1] = 'Forged original'; },
    record => { record.mediaSha256 = '0'.repeat(64); },
    record => { record.path = '0/999'; },
    record => { record.part = 'word/header1.xml'; },
    record => { record.originalAttributes.push(['{}surprise', 'yes']); },
  ];
  for (const mutate of cases) {
    const tampered = clone(packet);
    mutate(tampered.records[0]);
    tampered.records[0].key = refreshedKey(tampered.records[0]);
    await assert.rejects(() => applyReview(source, tampered));
  }
});

test('duplicate identities and malformed or out-of-scope edit actions reject', async () => {
  const packet = makePacket(await openDocument(source));
  const duplicate = clone(packet);
  duplicate.records.push(clone(duplicate.records[0]));
  await assert.rejects(() => applyReview(source, duplicate));
  for (const edit of [{ action: 'set' }, { action: 'keep', value: 'ignored' }, { action: 'remove', value: '' },
    { action: 'append', value: 'x' }, { action: 'set', value: '\u0000' }, { action: 'set', value: '\ud800' }]) {
    const malformed = clone(packet);
    malformed.records[0].edit.descr = edit;
    await assert.rejects(() => applyReview(source, malformed));
  }
  const extra = clone(packet);
  extra.records[0].edit.name = { action: 'set', value: 'Out of scope' };
  await assert.rejects(() => applyReview(source, extra));
});

test('independent oracle rejects unrelated changed content rather than trusting output receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'altslot-oracle-negative-'));
  try {
    const literals = join(directory, 'expected.json');
    writeFileSync(literals, '[]');
    const child = spawnSync(python, [oraclePath, 'verify', fixture('bench'), fixture('bench-changed'), literals], { encoding: 'utf8', timeout: 30000 });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /Untouched member changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
