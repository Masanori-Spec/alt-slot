import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { openDocument, applyReview } from "../src/core.mjs";
test("actual worker module opens and returns the same verified artifact as the source API", async () => {
  const path = new URL("../src/worker.mjs", import.meta.url).href;
  const bridge = `import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};await import(${JSON.stringify(path)});parentPort.on('message',data=>self.onmessage({data}));`;
  const worker = new Worker(
    new URL(
      "data:text/javascript;base64," + Buffer.from(bridge).toString("base64"),
    ),
  );
  const call = (data) =>
    new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage(data);
    });
  try {
    const bytes = await readFile("fixtures/bench.docx"),
      doc = await openDocument(bytes),
      opened = await call({ id: 1, kind: "open", bytes });
    assert.equal(opened.ok, true);
    assert.equal(opened.model.sha256, doc.sha256);
    assert.deepEqual(opened.model.packet, doc.packet);
    opened.model.packet.records[1].edit.descr = {
      action: "set",
      value: "Worker parity",
    };
    const returned = await call({
        id: 2,
        kind: "apply",
        bytes,
        packet: opened.model.packet,
      }),
      expected = await applyReview(bytes, opened.model.packet);
    assert.equal(returned.ok, true);
    assert.deepEqual(returned.result, expected);
    assert.deepEqual(bytes, await readFile("fixtures/bench.docx"));
    const bad = await call({ id: 3, kind: "open", bytes: new Uint8Array([0]) });
    assert.equal(bad.ok, false);
    assert.equal(typeof bad.error.code, "string");
  } finally {
    await worker.terminate();
  }
});
