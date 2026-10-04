import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument, applyReview } from "../src/core.mjs";
const source = await readFile("fixtures/bench.docx");
const tick = () => new Promise((r) => setImmediate(r));
async function harness() {
  const nodes = new Map(),
    workers = [],
    timers = new Map();
  let clock = 0;
  class Node {
    constructor() {
      this.value = "";
      this.textContent = "";
      this.innerHTML = "";
      this.children = [];
      this.dataset = {};
      this.attrs = {};
      this.events = {};
      this.open = false;
      this.hidden = false;
      this.disabled = false;
      this.files = [];
    }
    append(...items) {
      this.children.push(...items);
    }
    replaceChildren(...items) {
      this.children = items;
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
    addEventListener(k, v) {
      this.events[k] = v;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
      this.events.close?.();
    }
    click() {
      this.onclick?.({ preventDefault() {} });
    }
    focus() {}
    remove() {}
  }
  for (const [, id] of (await readFile("web/index.html", "utf8")).matchAll(
    /\bid="([^"]+)"/g,
  ))
    nodes.set(id, new Node());
  const tabs = new Node(),
    document = {
      getElementById: (id) => nodes.get(id),
      createElement: () => new Node(),
      querySelectorAll: () => [],
      querySelector: () => tabs,
      documentElement: new Node(),
      body: new Node(),
    };
  class Worker {
    constructor() {
      workers.push(this);
    }
    postMessage(data) {
      this.data = structuredClone(data);
    }
    terminate() {
      this.terminated = true;
    }
    async reply() {
      let data;
      if (this.data.kind === "open") {
        const d = await openDocument(this.data.bytes);
        data = {
          ok: true,
          model: Object.fromEntries(
            Object.entries(d).filter(([k]) => !k.startsWith("_")),
          ),
        };
      } else
        data = {
          ok: true,
          result: await applyReview(this.data.bytes, this.data.packet),
        };
      this.onmessage({ data });
    }
  }
  const originals = Object.fromEntries(
    ["document", "Worker", "setTimeout", "clearTimeout"].map((k) => [
      k,
      globalThis[k],
    ]),
  );
  Object.assign(globalThis, {
    document,
    Worker,
    setTimeout(fn, ms) {
      const id = ++clock;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  await import("../web/app.mjs?ui=" + Math.random());
  const $ = (id) => nodes.get(id),
    click = (id) => $(id).click();
  return {
    $,
    click,
    workers,
    timers,
    async load(bytes = source, name = "bench.docx") {
      $("doc-file").files = [
        {
          name,
          size: bytes.length,
          arrayBuffer: async () => Uint8Array.from(bytes).buffer,
        },
      ];
      $("doc-file").onchange();
      await tick();
      await workers.at(-1).reply();
    },
    locale(value) {
      $("language").value = value;
      $("language").onchange();
    },
    edit(k, action, value) {
      $(k + "-action").value = action;
      $(k + "-action").onchange();
      if (value !== undefined) {
        $(k + "-value").value = value;
        $(k + "-value").oninput();
      }
    },
    cleanup() {
      click("cancel-work");
      Object.assign(globalThis, originals);
    },
  };
}
test("actual UI handlers preserve selected sibling edits and invalidate late output after edit", async () => {
  const ui = await harness();
  try {
    await ui.load();
    assert.equal(ui.$("eligible-count").textContent, 5);
    ui.edit("descr", "set", "First context");
    ui.$("occurrence-list").children[1].click();
    assert.equal(ui.$("descr-action").value, "keep");
    ui.edit("descr", "set", "Second context");
    ui.click("apply");
    const old = ui.workers.at(-1);
    ui.edit("title", "remove");
    await old.reply();
    assert.equal(ui.$("download-docx").disabled, true);
    ui.click("apply");
    await ui.workers.at(-1).reply();
    assert.equal(ui.$("download-docx").disabled, false);
    ui.edit("descr", "set", "あ".repeat(1366));
    assert.equal(ui.$("apply").disabled, true);
    assert.equal(ui.$("download-docx").disabled, true);
  } finally {
    ui.cleanup();
  }
});
test("actual handlers cancel delayed source and review imports without replacing current work", async () => {
  const ui = await harness();
  try {
    await ui.load();
    let resolve;
    ui.$("doc-file").files = [
      {
        name: "late.docx",
        size: source.length,
        arrayBuffer: () => new Promise((r) => (resolve = r)),
      },
    ];
    ui.$("doc-file").onchange();
    ui.click("cancel-work");
    resolve(Uint8Array.from(source).buffer);
    await tick();
    assert.equal(ui.$("file-name").textContent, "bench.docx");
    const count = ui.workers.length;
    assert.equal(count, 1);
    ui.click("open-packet");
    ui.$("packet-file").files = [
      {
        name: "late.json",
        size: 2,
        arrayBuffer: () => new Promise((r) => (resolve = r)),
      },
    ];
    const pending = ui.$("packet-file").onchange();
    ui.click("cancel-packet");
    resolve(new TextEncoder().encode("{}").buffer);
    await pending;
    assert.equal(ui.$("packet-error").textContent, "");
    assert.equal(ui.$("packet-dialog").open, false);
    assert.equal(ui.$("eligible-count").textContent, 5);
  } finally {
    ui.cleanup();
  }
});
test("actual handlers reject stale completion after cancellation and timeout, then localize status", async () => {
  const ui = await harness();
  try {
    await ui.load();
    ui.click("apply");
    const pending = ui.workers.at(-1);
    ui.click("cancel-work");
    await pending.reply();
    assert.equal(ui.$("download-docx").disabled, true);
    ui.click("apply");
    const timed = ui.workers.at(-1);
    [...ui.timers.values()].find((t) => t.ms === 20000).fn();
    await timed.reply();
    assert.equal(ui.$("download-docx").disabled, true);
    assert.equal(ui.$("apply").disabled, false);
    ui.locale("en");
    assert.ok(ui.$("status").textContent.startsWith("Review in progress"));
    ui.click("apply");
    ui.locale("ja");
    assert.equal(ui.$("status").textContent, "ファイルを処理しています…");
    assert.equal(ui.$("apply").disabled, true);
    await ui.workers.at(-1).reply();
    assert.equal(ui.$("download-docx").disabled, false);
  } finally {
    ui.cleanup();
  }
});
test("newer pasted packet text supersedes an older pending file import", async () => {
  const ui = await harness();
  try {
    await ui.load();
    const old = (await openDocument(source)).packet;
    old.records[0].edit.descr = { action: "set", value: "Older file" };
    const bytes = new TextEncoder().encode(JSON.stringify(old));
    let resolve;
    ui.click("open-packet");
    ui.$("packet-file").files = [
      {
        name: "older.json",
        size: bytes.length,
        arrayBuffer: () => new Promise((r) => (resolve = r)),
      },
    ];
    const pending = ui.$("packet-file").onchange();
    const draft = '{"newer":"unfinished draft"}';
    ui.$("packet-json").value = draft;
    ui.$("packet-json").oninput();
    resolve(bytes.buffer);
    await pending;
    assert.equal(ui.$("packet-dialog").open, true);
    assert.equal(ui.$("packet-json").value, draft);
    assert.equal(ui.$("changed-count").textContent, 0);
    assert.equal(ui.$("packet-error").textContent, "");
  } finally {
    ui.cleanup();
  }
});
test("worker startup and delivery failures clear processing state and retain source", async () => {
  const ui = await harness();
  try {
    await ui.load();
    const Original = globalThis.Worker;
    for (const broken of [
      class {
        constructor() {
          throw Error("Unavailable");
        }
      },
      class extends Original {
        postMessage() {
          throw Error("Cannot clone");
        }
      },
    ]) {
      globalThis.Worker = broken;
      ui.$("doc-file").files = [
        {
          name: "new.docx",
          size: source.length,
          arrayBuffer: async () => Uint8Array.from(source).buffer,
        },
      ];
      ui.$("doc-file").onchange();
      await tick();
      assert.equal(ui.$("file-name").textContent, "bench.docx");
      assert.equal(ui.$("status").className, "error");
      assert.equal(ui.$("cancel-work").hidden, true);
      assert.equal(ui.$("apply").disabled, false);
    }
    globalThis.Worker = Original;
  } finally {
    ui.cleanup();
  }
});
