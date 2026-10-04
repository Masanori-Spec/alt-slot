import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openDocument } from "../../src/core.mjs";
const base = process.env.BASE_URL ?? "http://127.0.0.1:4173/",
  dir = "tests/browser/artifacts";
await mkdir(dir, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
} catch (e) {
  await writeFile(
    dir + "/results.json",
    JSON.stringify(
      { status: "blocked", reason: e.message, sandboxEnabled: true },
      null,
      2,
    ),
  );
  throw e;
}
const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  }),
  page = await context.newPage(),
  results = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, status: "passed" });
  } catch (e) {
    results.push({ name, status: "failed", error: e.message });
    await page.screenshot({ path: dir + "/failure.png", fullPage: true });
    throw e;
  }
}
async function loaded() {
  await page.waitForFunction(
    () =>
      document.querySelector("#eligible-count").textContent === "5" &&
      document.querySelector("#cancel-work").hidden,
  );
}
async function fresh() {
  await page.waitForFunction(
    () => !document.querySelector("#download-docx").disabled,
  );
}
async function download(selector, name) {
  const current = await page
    .locator("[role=tab][aria-selected=true]")
    .getAttribute("id");
  await page.locator("#tab-return").click();
  const done = page.waitForEvent("download");
  await page.locator(selector).click();
  const d = await done;
  const path = dir + "/" + (name ?? d.suggestedFilename());
  await d.saveAs(path);
  await page.locator("#" + current).click();
  return { path, bytes: await readFile(path) };
}
async function importText(text) {
  await page.locator("#tab-return").click();
  await page.locator("#open-packet").click();
  await page.locator("#packet-json").fill(text);
  await page.locator("#import-packet").click();
}
async function assertSkipLink(revealed) {
  const state = await page.locator(".skip").evaluate((node) => {
    const style = getComputedStyle(node),
      rect = node.getBoundingClientRect();
    return {
      focused: node === document.activeElement,
      opacity: style.opacity,
      clipPath: style.clipPath,
      pointerEvents: style.pointerEvents,
      inViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      focusable: node.tabIndex >= 0 && style.display !== "none" && style.visibility === "visible",
    };
  });
  assert.equal(state.focusable, true);
  assert.equal(state.focused, revealed);
  assert.equal(state.opacity, revealed ? "1" : "0");
  assert.equal(state.clipPath, revealed ? "none" : "inset(50%)");
  assert.equal(state.pointerEvents, revealed ? "auto" : "none");
  if (revealed) assert.equal(state.inViewport, true);
}
try {
  await scenario(
    "Japanese entry, keyboard navigation, English locale and local sample under subpath",
    async () => {
      await page.goto(base);
      assert.equal(await page.locator("html").getAttribute("lang"), "ja");
      await assertSkipLink(false);
      await page.keyboard.press("Tab");
      await assertSkipLink(true);
      await page.screenshot({ path: dir + "/keyboard-skip-focused.png" });
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator("#main").evaluate((node) => node === document.activeElement),
        true,
      );
      await assertSkipLink(false);
      await page.locator("#demo").click();
      await loaded();
      assert.equal(await page.locator("#occurrence-list button").count(), 5);
      await page.locator("#language").selectOption("en");
      assert.ok(
        (await page.locator("#status").textContent()).startsWith(
          "Review in progress",
        ),
      );
      await page.locator("#tab-edit").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page.locator("#tab-return").getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("Home");
      assert.equal(
        await page.locator("#tab-edit").getAttribute("aria-selected"),
        "true",
      );
      await page.locator("#occurrence-list").scrollIntoViewIfNeeded();
      await assertSkipLink(false);
      await page.screenshot({
        path: dir + "/desktop-edit-en.png",
        fullPage: true,
      });
    },
  );
  await scenario(
    "Five exact occurrences distinguish repeated image bytes and shared stories",
    async () => {
      const packet = JSON.parse((await download("#export-packet")).bytes);
      assert.equal(packet.records.length, 5);
      assert.equal(new Set(packet.records.map((r) => r.key)).size, 5);
      assert.equal(new Set(packet.records.map((r) => r.mediaSha256)).size, 1);
      await page.locator("#occurrence-list button").nth(3).click();
      assert.ok(
        (await page.locator("#reuse").textContent()).includes(
          "2 story reference",
        ),
      );
      await page.locator("#occurrence-list button").first().click();
    },
  );
  await scenario(
    "Independent repeated sibling edits do not change its neighbor",
    async () => {
      await page.locator("#descr-action").selectOption("set");
      await page.locator("#descr-value").fill("Intake ready & checked");
      await page.locator("#occurrence-list button").nth(1).click();
      assert.equal(await page.locator("#descr-action").inputValue(), "keep");
      assert.equal(
        await page.locator("#descr-original").textContent(),
        '"Status icon"',
      );
      await page.locator("#descr-action").selectOption("set");
      await page.locator("#descr-value").fill("Release pending");
      await page.locator("#title-action").selectOption("remove");
      assert.equal(await page.locator("#changed-count").textContent(), "2");
    },
  );
  await scenario(
    "Reordered subset return retains omitted occurrences",
    async () => {
      const p = JSON.parse((await download("#export-packet")).bytes);
      p.records = [p.records[1], p.records[0]];
      p.records.reverse();
      await importText(JSON.stringify(p));
      assert.equal(await page.locator("#packet-dialog").isVisible(), false);
      assert.equal(await page.locator("#changed-count").textContent(), "2");
      await page.locator("#tab-return").click();
      await page.screenshot({
        path: dir + "/desktop-return-en.png",
        fullPage: true,
      });
    },
  );
  await scenario(
    "Build outputs preserve exact literal changes with independent Python verification",
    async () => {
      await page.locator("#apply").click();
      await fresh();
      const doc = await download("#download-docx", "reviewed.docx"),
        receipt = await download("#download-receipt", "receipt.json"),
        packet = await download("#export-packet", "reviewed-review.json");
      assert.equal(JSON.parse(receipt.bytes).changedOccurrences, 2);
      assert.equal(
        JSON.parse(receipt.bytes).packetSha256,
        createHash("sha256")
          .update(JSON.stringify(JSON.parse(packet.bytes)))
          .digest("hex"),
      );
      await writeFile(
        dir + "/source.docx",
        await readFile("fixtures/bench.docx"),
      );
      const model = await openDocument(doc.bytes);
      assert.equal(
        model.occurrences[0].original.descr,
        "Intake ready & checked",
      );
      assert.equal(model.occurrences[1].original.descr, "Release pending");
      assert.equal(model.occurrences[1].original.title, null);
      const expected = [
        {
          part: "word/document.xml",
          path: "0/3/1/0/0/1",
          after: { descr: "Intake ready & checked", title: "Status" },
        },
        {
          part: "word/document.xml",
          path: "0/5/1/0/0/1",
          after: { descr: "Release pending", title: null },
        },
      ];
      await writeFile(dir + "/expected.json", JSON.stringify(expected));
      const oracle = spawnSync(
        process.env.PYTHON ?? "python3",
        [
          "tests/oracle.py",
          "verify",
          "fixtures/bench.docx",
          doc.path,
          dir + "/expected.json",
        ],
        { encoding: "utf8" },
      );
      assert.equal(oracle.status, 0, oracle.stderr);
      await writeFile(dir + "/oracle.json", oracle.stdout);
    },
  );
  await scenario(
    "Actual downloaded HTML report is inert and retained with screen and A4 print evidence",
    async () => {
      const report = await download("#download-report", "review.html"),
        r = await context.newPage();
      await r.setContent(report.bytes.toString("utf8"));
      assert.equal(await r.locator("script").count(), 0);
      assert.ok(
        (await r.locator("body").textContent()).includes(
          "Intake ready & checked",
        ),
      );
      await r.screenshot({ path: dir + "/report-screen.png", fullPage: true });
      await r.emulateMedia({ media: "print" });
      await r.pdf({
        path: dir + "/report-print.pdf",
        format: "A4",
        printBackground: true,
      });
      await r.close();
    },
  );
  await scenario(
    "Edits invalidate outputs and empty set differs from remove",
    async () => {
      await page.locator("#tab-edit").click();
      await page.locator("#occurrence-list button").nth(4).click();
      await page.locator("#descr-action").selectOption("set");
      await page.locator("#descr-value").fill("");
      assert.equal(await page.locator("#download-docx").isDisabled(), true);
      const p = JSON.parse((await download("#export-packet")).bytes);
      const footer = p.records.find((r) => r.part.includes("footer"));
      assert.deepEqual(footer.edit.descr, { action: "set", value: "" });
      await page.locator("#descr-action").selectOption("remove");
      assert.equal(await page.locator("#changed-count").textContent(), "3");
      await page.locator("#reset-record").click();
      assert.equal(await page.locator("#changed-count").textContent(), "2");
    },
  );
  await scenario(
    "Changed-file packet, identity tampering and duplicate record reject without replacing review",
    async () => {
      const before = (await download("#export-packet")).bytes.toString("utf8");
      const p = JSON.parse(before);
      p.sourceSha256 = "0".repeat(64);
      await importText(JSON.stringify(p));
      assert.equal(await page.locator("#packet-dialog").isVisible(), true);
      assert.equal(
        await page.locator("#packet-error").textContent(),
        "changed-source",
      );
      await page.locator("#cancel-packet").click();
      p.sourceSha256 = JSON.parse(before).sourceSha256;
      p.records[0].original.descr = "forged";
      await importText(JSON.stringify(p));
      assert.equal(
        await page.locator("#packet-error").textContent(),
        "record-identity",
      );
      await page.locator("#cancel-packet").click();
      const duplicate = JSON.parse(before);
      duplicate.records = [duplicate.records[0], duplicate.records[0]];
      await importText(JSON.stringify(duplicate));
      assert.equal(
        await page.locator("#packet-error").textContent(),
        "record-identity",
      );
      await page.locator("#cancel-packet").click();
      assert.equal(
        (await download("#export-packet")).bytes.toString("utf8"),
        before,
      );
    },
  );
  await scenario(
    "Malformed UTF-8 review import rejects and cancelled delayed import cannot commit",
    async () => {
      await page.locator("#open-packet").click();
      await page.locator("#packet-file").setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from([0xff]),
      });
      await page.waitForFunction(
        () => !!document.querySelector("#packet-error").textContent,
      );
      await page.locator("#cancel-packet").click();
      await page.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = async function () {
          await new Promise((r) => setTimeout(r, 350));
          return original.call(this);
        };
      });
      const before = (await download("#export-packet")).bytes;
      await page.locator("#open-packet").click();
      await page.locator("#packet-file").setInputFiles({
        name: "older.json",
        mimeType: "application/json",
        buffer: before,
      });
      const draft = '{"newer":"unfinished draft"}';
      await page.locator("#packet-json").fill(draft);
      await page.waitForTimeout(500);
      assert.equal(await page.locator("#packet-dialog").isVisible(), true);
      assert.equal(await page.locator("#packet-json").inputValue(), draft);
      await page.locator("#cancel-packet").click();
      await page.locator("#open-packet").click();
      await page.locator("#packet-file").setInputFiles({
        name: "review.json",
        mimeType: "application/json",
        buffer: before,
      });
      await page.locator("#cancel-packet").click();
      await page.waitForTimeout(500);
      assert.equal(
        (await download("#export-packet")).bytes.toString("utf8"),
        before.toString("utf8"),
      );
      for (let repeat = 0; repeat < 2; repeat++) {
        await page.locator("#open-packet").click();
        await page.locator("#packet-file").setInputFiles({
          name: "same-review.json",
          mimeType: "application/json",
          buffer: before,
        });
        await page.waitForFunction(
          () => !document.querySelector("#packet-dialog").open,
        );
        assert.equal(await page.locator("#packet-file").inputValue(), "");
      }
    },
  );
  await scenario(
    "Cancelled source import retains current review and malformed file cannot replace it",
    async () => {
      const before = (await download("#export-packet")).bytes;
      await page
        .locator("#doc-file")
        .setInputFiles("fixtures/bench-changed.docx");
      await page.locator("#cancel-work").click();
      await page.waitForTimeout(500);
      assert.equal(
        (await download("#export-packet")).bytes.toString("utf8"),
        before.toString("utf8"),
      );
      await page.evaluate(() => {
        window.savedWorkerForTest = window.Worker;
        window.Worker = class {
          constructor() {
            throw Error("Synthetic startup failure");
          }
        };
      });
      try {
        await page
          .locator("#doc-file")
          .setInputFiles("fixtures/bench-changed.docx");
        await page.waitForFunction(() =>
          document
            .querySelector("#status")
            .textContent.includes("could not start"),
        );
        assert.equal(await page.locator("#cancel-work").isVisible(), false);
        assert.equal(
          (await download("#export-packet")).bytes.toString("utf8"),
          before.toString("utf8"),
        );
      } finally {
        await page.evaluate(() => {
          window.Worker = window.savedWorkerForTest;
          delete window.savedWorkerForTest;
        });
      }
      await page.locator("#doc-file").setInputFiles({
        name: "bad.docx",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("bad"),
      });
      await page.waitForFunction(
        () => document.querySelector("#status").className === "error",
      );
      assert.equal(
        (await download("#export-packet")).bytes.toString("utf8"),
        before.toString("utf8"),
      );
    },
  );
  await scenario(
    "UTF-8 byte budget blocks oversized multilingual value without stale download",
    async () => {
      await page.locator("#tab-edit").click();
      await page.locator("#occurrence-list button").first().click();
      await page.locator("#descr-action").selectOption("set");
      await page.locator("#descr-value").fill("あ".repeat(1366));
      assert.equal(await page.locator("#apply").isDisabled(), true);
      assert.equal(await page.locator("#download-docx").isDisabled(), true);
      await page.locator("#descr-value").fill("Intake ready & checked");
      assert.equal(await page.locator("#apply").isDisabled(), false);
    },
  );
  await scenario(
    "Excluded image types are visible, uneditable and isolated",
    async () => {
      await page.locator("#doc-file").setInputFiles("fixtures/exclusions.docx");
      await page.waitForFunction(
        () =>
          document.querySelector("#eligible-count").textContent === "1" &&
          document.querySelector("#cancel-work").hidden,
      );
      assert.equal(await page.locator("#excluded-count").textContent(), "9");
      await page.locator("#tab-scope").click();
      assert.equal(await page.locator("#exclusion-list article").count(), 9);
      await page.screenshot({
        path: dir + "/desktop-exclusions-en.png",
        fullPage: true,
      });
    },
  );
  await scenario(
    "Japanese mobile390px retains labels and fits document width",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#language").selectOption("ja");
      assert.ok(
        (await page.locator("#status").textContent()).startsWith("レビュー中"),
      );
      for (const name of ["edit", "return", "scope"]) {
        await page.locator("#tab-" + name).click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
        );
        await page.screenshot({
          path: dir + "/mobile-" + name + "-ja.png",
          fullPage: true,
        });
      }
    },
  );
  await scenario(
    "No-op output is byte-identical and review reload is explicit",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.locator("#demo").click();
      await loaded();
      await page.locator("#tab-return").click();
      await page.locator("#apply").click();
      await fresh();
      const out = await download("#download-docx", "noop.docx");
      assert.deepEqual(out.bytes, await readFile("fixtures/bench.docx"));
      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path: dir + "/workspace-print.pdf",
        format: "A4",
        printBackground: true,
      });
      await page.emulateMedia({ media: "screen" });
      await page.reload();
      assert.equal(await page.locator("#eligible-count").textContent(), "—");
      assert.equal(await page.locator("#download-docx").isDisabled(), true);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    dir + "/results.json",
    JSON.stringify(
      { status: "passed", sandboxEnabled: true, base, scenarios: results },
      null,
      2,
    ),
  );
} catch (e) {
  await writeFile(
    dir + "/results.json",
    JSON.stringify(
      {
        status: "failed",
        sandboxEnabled: true,
        base,
        scenarios: results,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
