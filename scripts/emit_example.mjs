// Emit a real reviewed DOCX through the same exported core used by the UI.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReview, makePacket, openDocument } from '../src/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'tests', 'artifacts');
const original = join(root, 'fixtures', 'bench.docx');
const source = readFileSync(original);
const doc = await openDocument(source);
assert.equal(doc.occurrences.length, 5, 'The example fixture changed; review the literal expectations');
const changes = new Map([
  ['Release icon', { descr: { action: 'set', value: 'Release checkpoint ready for review' }, title: { action: 'keep' } }],
  ['Floating summary icon', { descr: { action: 'set', value: 'Summary marker showing the review checkpoint' }, title: { action: 'remove' } }],
  ['Shared header icon', { descr: { action: 'set', value: 'Shared report context symbol' }, title: { action: 'set', value: 'Shared header' } }],
]);
const names = new Map(doc.occurrences.map(record => [record.key, record.name]));
const packet = makePacket(doc);
packet.records = packet.records.filter(record => changes.has(names.get(record.key)));
assert.equal(packet.records.length, 3);
for (const record of packet.records) record.edit = changes.get(names.get(record.key));
packet.records.reverse();
const expected = [
  { part: 'word/document.xml', path: '0/5/1/0/0/1', after: { descr: 'Release checkpoint ready for review', title: 'Status' } },
  { part: 'word/document.xml', path: '0/7/1/0/0/5', after: { descr: 'Summary marker showing the review checkpoint', title: null } },
  { part: 'word/header1.xml', path: '0/2/0/0/1', after: { descr: 'Shared report context symbol', title: 'Shared header' } },
];
const result = await applyReview(source, packet);
assert.equal(result.receipt.changedOccurrences, 3);
assert.equal(result.receipt.keptUnlisted, 2);
mkdirSync(destination, { recursive: true });
const output = join(destination, 'reviewed.docx');
const expectations = join(destination, 'expected.json');
writeFileSync(output, result.bytes);
for (const [name, value] of [['review.json', packet], ['receipt.json', result.receipt], ['expected.json', expected]]) {
  writeFileSync(join(destination, name), JSON.stringify(value, null, 2) + '\n');
}
const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || process.env.PYTHON || 'python3';
const child = spawnSync(python, [join(root, 'tests', 'oracle.py'), 'verify', original, output, expectations], {
  encoding: 'utf8', timeout: 30000,
});
assert.equal(child.status, 0, child.error?.message || child.stderr);
const proof = JSON.parse(child.stdout);
assert.deepEqual(proof.changedParts, ['word/document.xml', 'word/header1.xml']);
console.log(JSON.stringify({ ok: true, output: 'tests/artifacts/reviewed.docx', selectedOccurrences: 3,
  keptUnlisted: 2, proof }, null, 2));
