import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  openDocument,
  makePacket,
  applyReview,
  previewReview,
  parsePacket,
  LIMITS,
} from "../src/core.mjs";
import {
  openZip,
  writeZip,
  encode,
  decode,
  directory,
  crc32,
} from "../src/zip.mjs";
import { xml } from "../src/xml.mjs";
import { reviewHTML } from "../src/report.mjs";
const source = await readFile("fixtures/bench.docx");
const clone = structuredClone;
async function mutate(part, fn) {
  const z = await openZip(source);
  return writeZip(
    z,
    new Map([[part, encode(fn(decode(z.entries.get(part).bytes)))]]),
  );
}
test("XML namespace aliases, entities and alternate quote styles retain exact metadata", () => {
  const n = xml(
    `<q:docPr xmlns:q="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" id='9' name="icon" descr='A&#9;B&#10;C&amp;&lt;&gt;&quot;&apos;'/>`,
  );
  assert.equal(n.local, "docPr");
  assert.equal(n.attrs.descr, "A\tB\nC&<>\"'");
  assert.ok(n.attrInfo.descr.start < n.attrInfo.descr.valueStart);
});
test("XML rejects ambiguous attrs, bindings, declarations, doctype and bad code points", () => {
  for (const s of [
    '<!DOCTYPE x [<!ENTITY a "boom">]><x/>',
    '<x a="1" a="2"/>',
    "<p:x/>",
    '<x xmlns:p="u" xmlns:q="u" p:a="1" q:a="2"/>',
    '<x a="&#0;"/>',
    '<x a="&missing;"/>',
    "<x>bad]]></x>",
    '<x/><?XML version="1.0"?>',
    '<x xmlns:xml="wrong"/>',
    '<x xmlns:p=""/>',
    "<x>\ud800</x>",
  ])
    assert.throws(() => xml(s), undefined, s);
});
test("XML resource limits are explicit", () => {
  assert.throws(() => xml("<x>".repeat(81) + "</x>".repeat(81)));
  assert.throws(() =>
    xml(
      "<x " +
        Array.from({ length: 129 }, (_, i) => `a${i}=""`).join(" ") +
        "/>",
    ),
  );
  assert.throws(() => xml("<x>" + "a".repeat(LIMITS.xmlBytes) + "</x>"));
});
test("ZIP input limits, encryption signature, CRC and directory corruption reject", async () => {
  assert.throws(() => directory(new Uint8Array(LIMITS.inputBytes + 1)));
  assert.throws(() => directory(new Uint8Array(24).fill(0xd0)));
  const bad = Uint8Array.from(source);
  const z = directory(bad);
  const entry = [...z.entries.values()].find((e) => e.compressed > 20);
  bad[entry.data + 5] ^= 0x40;
  await assert.rejects(openDocument(bad));
  const duplicate = Uint8Array.from(source);
  duplicate[duplicate.length - 22] = 0;
  await assert.rejects(openDocument(duplicate));
});
test("strict namespaces, macro types and signature types reject the package", async () => {
  await assert.rejects(
    openDocument(
      await mutate("word/document.xml", (s) =>
        s.replaceAll(
          "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
          "http://purl.oclc.org/ooxml/wordprocessingml/main",
        ),
      ),
    ),
  );
  for (const type of [
    "application/vnd.ms-word.document.macroEnabled.main+xml",
    "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml",
  ])
    await assert.rejects(
      openDocument(
        await mutate("[Content_Types].xml", (s) =>
          s.replace(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            type,
          ),
        ),
      ),
    );
});
test("packet parser rejects duplicate keys, malformed UTF8-decoded/BOM JSON, deep values and trailing data", () => {
  for (const s of [
    '{"schema":"x","schema":"y"}',
    '{"schema":"x","\\u0073chema":"y"}',
    "\ufeff{}",
    "{}garbage",
    "[1]",
    "[true]",
    "[".repeat(14) + "null" + "]".repeat(14),
  ])
    assert.throws(() => parsePacket(s), undefined, s);
  assert.throws(() => parsePacket(" ".repeat(LIMITS.packetBytes + 1)));
});
test("packet API rejects getters, subclass arrays, hidden and symbol props before evaluation", async () => {
  const doc = await openDocument(source);
  let calls = 0;
  const p = makePacket(doc);
  Object.defineProperty(p, "records", {
    enumerable: true,
    get() {
      calls++;
      return [];
    },
  });
  assert.throws(() => previewReview(doc, p));
  assert.equal(calls, 0);
  const hidden = makePacket(doc);
  Object.defineProperty(hidden, "extra", { value: null });
  assert.throws(() => previewReview(doc, hidden));
  const symbol = makePacket(doc);
  symbol[Symbol()] = null;
  assert.throws(() => previewReview(doc, symbol));
  class Strange extends Array {
    toJSON() {
      calls++;
      return [];
    }
  }
  const subclass = makePacket(doc);
  subclass.records = new Strange();
  assert.throws(() => previewReview(doc, subclass));
  const sparse = makePacket(doc);
  delete sparse.records[0];
  assert.throws(() => previewReview(doc, sparse));
  assert.equal(calls, 0);
});
test("attributes distinguish absent, empty, keep, set and remove while encoding control whitespace", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  p.records = [p.records[2]];
  for (const value of ["", "A\tB\rC\nD & < > \" ' 日本語 🧭"]) {
    p.records[0].edit.descr = { action: "set", value };
    const out = await applyReview(source, p),
      after = await openDocument(out.bytes);
    assert.equal(after.occurrences[2].original.descr, value);
    assert.equal(after.occurrences[2].original.title, "Floating marker");
  }
  for (const value of [
    "x".repeat(4097),
    "あ".repeat(1366),
    "\u0001",
    "\ud800",
  ]) {
    p.records[0].edit.descr = { action: "set", value };
    await assert.rejects(applyReview(source, p));
  }
});
test("extra action fields and unknown records reject atomically", async () => {
  const doc = await openDocument(source);
  for (const action of [
    { action: "keep", value: "ignored" },
    { action: "remove", value: "" },
    { action: "set" },
    { action: "invent", value: "x" },
  ]) {
    const p = makePacket(doc);
    p.records[0].edit.descr = action;
    await assert.rejects(applyReview(source, p));
  }
  const p = makePacket(doc);
  p.records[0].edit.extra = { action: "keep" };
  await assert.rejects(applyReview(source, p));
  assert.deepEqual(Buffer.from(source), await readFile("fixtures/bench.docx"));
});
test("record subsets and ordering produce same planned fields and output bytes", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  for (const [i, r] of p.records.entries())
    r.edit.descr = { action: "set", value: "Context " + i };
  const a = await applyReview(source, p);
  p.records.reverse();
  const b = await applyReview(source, p);
  assert.deepEqual(a.bytes, b.bytes);
});
test("receipt lists all members and report escapes text without scripts", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  p.records[0].edit.descr = {
    action: "set",
    value: '</td><script>alert("x")</script>',
  };
  const out = await applyReview(source, p);
  const html = reviewHTML(doc, out);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.equal(out.receipt.members.filter((m) => m.changed).length, 1);
  assert.ok(
    out.receipt.members.some(
      (m) => m.part === "customXml/witness.bin" && !m.changed,
    ),
  );
  assert.equal(out.receipt.verification.nativeWordTested, false);
});
test("unmodified ZIP local member records remain byte-identical after edits", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  p.records[0].edit.descr = { action: "set", value: "New context" };
  const out = await applyReview(source, p),
    before = directory(source),
    after = directory(out.bytes);
  for (const [name, e] of before.entries)
    if (name !== "word/document.xml")
      assert.deepEqual(e.local, after.entries.get(name).local, name);
});
test("media and unknown members are not inferred from filenames as editable", async () => {
  const doc = await openDocument(source);
  assert.equal(doc.occurrences.length, 5);
  assert.ok(doc.occurrences.every((o) => o.part.endsWith(".xml")));
  assert.equal(new Set(doc.occurrences.map((o) => o.key)).size, 5);
});
test("ArrayBuffer and direct directory snapshots own their original source bytes", async () => {
  const buffer = Uint8Array.from(source).buffer;
  const doc = await openDocument(buffer),
    snapshot = Uint8Array.from(doc._zip.bytes);
  new Uint8Array(buffer).fill(0);
  assert.deepEqual(doc._zip.bytes, snapshot);
  const input = Uint8Array.from(source),
    d = directory(input);
  input.fill(0);
  assert.deepEqual(d.bytes, Uint8Array.from(source));
});
test("drawing objects without docPr are visible exclusions instead of disappearing", async () => {
  const bytes = await mutate("word/document.xml", (s) =>
    s.replace(/<wp:docPr\b[^>]*\/>/, ""),
  );
  const doc = await openDocument(bytes);
  assert.ok(doc.exclusions.some((e) => e.reason === "missing-carrier"));
  assert.equal(doc.occurrences.length, 4);
});
test("review packet identity objects cannot mutate the inspection baseline", async () => {
  const doc = await openDocument(source),
    original = structuredClone(doc.occurrences[0]),
    p = makePacket(doc);
  p.records[0].original.descr = "altered";
  p.records[0].originalAttributes[0][1] = "altered";
  assert.deepEqual(doc.occurrences[0], original);
  assert.throws(() => previewReview(doc, p));
  assert.deepEqual(makePacket(doc), doc.packet);
});
test("standalone report distinguishes absent, empty and sentinel-looking literal strings", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  p.records = [p.records[2]];
  for (const value of ["∅", "", "(attribute absent)"]) {
    p.records[0].edit.descr = { action: "set", value };
    const result = await applyReview(source, p),
      html = reviewHTML(doc, result);
    assert.ok(html.includes("<em>Attribute absent</em>"));
    assert.ok(
      html.includes(
        '<span class="value-type">String</span> <code>&quot;' +
          value +
          "&quot;</code>",
      ),
    );
  }
});
test("packet JSON export falls back to compact representation within the import byte cap", async () => {
  const { serializePacket } = await import("../src/packet.mjs");
  const value = Array.from({ length: 1024 }, () => "x".repeat(4091));
  assert.ok(encode(JSON.stringify(value)).length <= LIMITS.packetBytes);
  assert.ok(encode(JSON.stringify(value, null, 2)).length > LIMITS.packetBytes);
  const text = serializePacket(value);
  assert.ok(encode(text).length <= LIMITS.packetBytes);
  assert.deepEqual(parsePacket(text), value);
  const doc = await openDocument(source);
  assert.deepEqual(
    JSON.parse(serializePacket(makePacket(doc))),
    makePacket(doc),
  );
});
test("async apply snapshots caller intent and returned evidence does not alias the caller packet", async () => {
  const doc = await openDocument(source),
    p = makePacket(doc);
  p.records[0].edit.descr = { action: "set", value: "First intent" };
  const pending = applyReview(source, p);
  p.records[0].edit.descr.value = "Later mutation";
  const result = await pending;
  assert.equal(
    (await openDocument(result.bytes)).occurrences[0].original.descr,
    "First intent",
  );
  assert.equal(result.packet.records[0].edit.descr.value, "First intent");
  p.records[0].edit.descr.value = "After completion";
  assert.equal(result.packet.records[0].edit.descr.value, "First intent");
  const preview = previewReview(doc, makePacket(doc));
  preview.rows[0].before.descr = "Mutated preview";
  preview.packet.records[0].original.descr = "Mutated packet";
  assert.equal(doc.occurrences[0].original.descr, "Status icon");
});
