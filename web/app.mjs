import {
  LIMITS,
  previewReview,
  parsePacket,
  serializePacket,
} from "../src/core.mjs";
import { reviewHTML } from "../src/report.mjs";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
let lang = "ja",
  model = null,
  sourceBytes = null,
  sourceName = "",
  packet = null,
  selected = null,
  result = null,
  worker = null,
  timer = null,
  generation = 0,
  packetTicket = 0,
  tab = "edit";
const originalText = new Map(
  [...document.querySelectorAll("[data-t]")].map((n) => [
    n.dataset.t,
    n.innerHTML,
  ]),
);
const en = {
  skip: "Skip to workspace",
  language: "Display language",
  headerNote: "DOCUMENT TOOLS / MEANING IN CONTEXT",
  hero: "Same image.<br>Its own meaning.",
  lede: "The same image can need a different description in each place. Review DOCX image metadata by exact occurrence, then return only the edits you chose.",
  local: "Processed on your device",
  exact: "Exact file and occurrence matching",
  selective: "Only selected attributes change",
  illustration1: "An icon in the main story",
  illustration2: "Same image, another occurrence",
  illustration3: "Return the description<br>to its exact place.",
  scopeTitle: "Small edits, checked on return",
  scope:
    "For ordinary DrawingML image descriptions and titles. Image bytes stay unchanged. Meaning, reading order and accessibility conformance need separate human and application review.",
  noFile: "Start with a document",
  open: "Open DOCX",
  demo: "Try an example",
  cancel: "Cancel",
  eligible: "Editable occurrences",
  excluded: "Excluded objects",
  changed: "Planned changes",
  source: "Source file match",
  editTab: "01 / Review occurrences",
  returnTab: "02 / Return the changes",
  scopeTab: "03 / Check exclusions",
  emptyTitle: "Start with the places an image appears.",
  emptyBody:
    "Open a DOCX or try the sample. Files stay in this tab’s memory and are never uploaded.",
  limits: "DOCX 25 MiB / expanded 100 MiB / max 300 occurrences",
  occurrences: "Occurrences",
  part: "Document part",
  path: "Element position",
  reuse: "References / same image",
  description: "Description / descr",
  title: "Title / title",
  keep: "Keep original value",
  set: "Set value",
  remove: "Remove attribute",
  original: "Original value",
  newDescription: "New description",
  newTitle: "New title",
  emptyHint:
    "Setting an empty string and removing the attribute are different actions. Document text, image bytes and other attributes stay unchanged.",
  reset: "Reset this occurrence",
  returnTitle: "Take the review out. Bring selected edits back.",
  returnBody:
    "Reorder the review JSON or return a subset of its records. It only applies to the exact source DOCX. Omitted occurrences stay unchanged.",
  exportPacket: "Save review JSON",
  openPacket: "Import review JSON",
  diffEmpty: "Open a DOCX to see the planned changes.",
  occurrence: "Occurrence",
  before: "Before",
  after: "After",
  buildTitle: "Return the reviewed changes",
  buildBody:
    "The source is matched again and the output is reopened for verification. Further edits invalidate the previous output.",
  apply: "Build and verify DOCX",
  downloadDocx: "Updated document",
  downloadReceipt: "Verification receipt",
  downloadReport: "Before and after review",
  scopeHeading: "Excluded objects remain visible.",
  scopeBody:
    "Excluded objects stay untouched. The main story and referenced headers and footers are scanned. A shared header is one stored occurrence, regardless of page count.",
  unsupportedTitle: "Outside this version’s scope",
  unsupported:
    "Tracked contexts, VML, SmartArt, charts, grouped objects, external images, AlternateContent, decorative metadata and competing description carriers. Footnotes, endnotes, comments, glossary and unreferenced headers are not scanned. Strict, signed, encrypted and macro-enabled packages are rejected.",
  g1title: "Identify the place",
  g1: "Identical image bytes and descriptions can belong to different occurrences. An image hash alone never chooses a target.",
  g2title: "Let people decide meaning",
  g2: "Write the description for its context. There is no generated description, OCR or conformance verdict.",
  g3title: "Keep the source fixed",
  g3: "Even saving the file again in Word can change its bytes. Create a new review for a changed document.",
  footer: "Session memory only. Save the review JSON before closing this tab.",
  packetTitle: "Import review JSON",
  packetHint:
    "File, occurrence, original attributes and media hash are checked. An error leaves your current review unchanged.",
  packetFile: "JSON file",
  pastePacket: "Or paste JSON",
  importPacket: "Match and import",
};
const choose = (ja, en) => (lang === "ja" ? ja : en);
function status(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
}
function localizedState() {
  status(
    worker
      ? choose("ファイルを処理しています…", "Processing the file…")
      : !model
        ? choose(
            "DOCXを開くか、例を試してください。",
            "Open a DOCX or try the example.",
          )
        : result
          ? choose(
              "出力を再読込し、変更と保持を検証しました。",
              "Output reopened; edits and preserved members were verified.",
            )
          : choose(
              "レビュー中。差分を確認してDOCXを作成してください。",
              "Review in progress. Check the changes, then build the DOCX.",
            ),
  );
}
function stop() {
  generation++;
  if (worker) worker.terminate();
  worker = null;
  clearTimeout(timer);
  $("cancel-work").hidden = true;
  $("apply").disabled = !model;
}
function invalidate() {
  result = null;
  for (const id of ["download-docx", "download-receipt", "download-report"])
    $(id).disabled = true;
  $("freshness").textContent = model
    ? choose("編集後 / 出力を再作成", "STALE / BUILD AGAIN")
    : "NO DOCUMENT";
}
function busyJob(kind, bytes, review, onSuccess) {
  stop();
  const ticket = generation;
  try {
    worker = new Worker(new URL("../src/worker.mjs", import.meta.url), {
      type: "module",
    });
  } catch {
    stop();
    status(
      choose(
        "処理ワーカーを開始できませんでした。",
        "The processing worker could not start.",
      ),
      true,
    );
    return;
  }
  $("cancel-work").hidden = false;
  $("apply").disabled = true;
  status(choose("ファイルを処理しています…", "Processing the file…"));
  const finish = () => {
    worker?.terminate();
    worker = null;
    clearTimeout(timer);
    $("cancel-work").hidden = true;
    $("apply").disabled = !model;
  };
  worker.onmessage = ({ data }) => {
    if (ticket !== generation) return;
    generation++;
    finish();
    if (!data.ok) {
      status(
        choose(
          "現在のレビューは変更されていません: ",
          "Current review unchanged: ",
        ) + data.error.code,
        true,
      );
      return;
    }
    try {
      onSuccess(data);
    } catch (e) {
      status(e.message, true);
    }
  };
  worker.onerror = () => {
    if (ticket !== generation) return;
    generation++;
    finish();
    status(
      choose(
        "処理ワーカーを実行できませんでした。",
        "The processing worker could not run.",
      ),
      true,
    );
  };
  timer = setTimeout(() => {
    if (ticket !== generation) return;
    stop();
    status(
      choose(
        "20秒の処理予算を超えました。現在のレビューは保持しています。",
        "The 20-second processing budget was exceeded. The current review is retained.",
      ),
      true,
    );
  }, 20000);
  try {
    worker.postMessage({ id: ticket, kind, bytes, packet: review });
  } catch {
    stop();
    status(
      choose(
        "処理ワーカーへデータを渡せませんでした。",
        "The processing worker could not receive the data.",
      ),
      true,
    );
  }
}
function safe(fn) {
  return (...args) => {
    try {
      fn(...args);
    } catch (e) {
      status(e.message, true);
    }
  };
}
function activate(name) {
  tab = name;
  for (const n of ["edit", "return", "scope"]) {
    $("tab-" + n).setAttribute("aria-selected", String(n === name));
    $("tab-" + n).tabIndex = n === name ? 0 : -1;
    $("panel-" + n).hidden = n !== name;
  }
}
for (const n of ["edit", "return", "scope"])
  $("tab-" + n).onclick = () => activate(n);
document.querySelector(".tabs").onkeydown = (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const names = ["edit", "return", "scope"],
    i = names.indexOf(tab),
    next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 2
          : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
  activate(names[next]);
  $("tab-" + names[next]).focus();
};
$("language").onchange = () => {
  lang = $("language").value;
  document.documentElement.lang = lang;
  for (const n of document.querySelectorAll("[data-t]"))
    n.innerHTML =
      lang === "ja"
        ? originalText.get(n.dataset.t)
        : (en[n.dataset.t] ?? originalText.get(n.dataset.t));
  render();
  localizedState();
};
function snapshot() {
  return previewReview(model, packet);
}
function recordFor(key) {
  return packet.records.find((r) => r.key === key);
}
function ensureRecord() {
  let r = recordFor(selected);
  if (!r) {
    r = structuredClone(model.packet.records.find((r) => r.key === selected));
    packet.records.push(r);
  }
  return r;
}
const showValue = (v) =>
  v === null ? choose("（属性なし）", "(attribute absent)") : JSON.stringify(v);
function render() {
  if (!model) {
    $("empty").hidden = false;
    $("editor").hidden = true;
    return;
  }
  $("file-name").textContent = sourceName;
  $("empty").hidden = !!model.occurrences.length;
  if (!model.occurrences.length)
    $("empty").replaceChildren(
      el(
        "h3",
        choose(
          "編集できる画像はありません。",
          "No editable image occurrences.",
        ),
      ),
      el(
        "p",
        choose(
          "対象外の一覧を確認してください。文書は変更していません。",
          "Check the exclusions. The document is unchanged.",
        ),
      ),
    );
  $("editor").hidden = !model.occurrences.length;
  $("eligible-count").textContent = model.occurrences.length;
  $("excluded-count").textContent = model.exclusions.length;
  $("source-state").textContent = "SHA-256 ✓";
  $("source-state").title = model.sha256;
  $("story-count").textContent =
    model.stories.length + choose("パーツ", " parts");
  $("export-packet").disabled = false;
  $("open-packet").disabled = false;
  $("apply").disabled = !!worker;
  $("occurrence-list").replaceChildren();
  let changes = new Map();
  try {
    const p = snapshot();
    $("changed-count").textContent = p.changed;
    changes = new Map(p.rows.map((r) => [r.key, r.changed]));
  } catch {
    $("changed-count").textContent = "!";
    $("apply").disabled = true;
  }
  for (const [i, o] of model.occurrences.entries()) {
    const b = el("button", undefined, o.key === selected ? "selected" : "");
    b.setAttribute("aria-pressed", String(o.key === selected));
    b.append(
      el(
        "small",
        `${String(i + 1).padStart(2, "0")} / ${o.kind.toUpperCase()} · ${o.placement}`,
      ),
      el("strong", o.name || choose("名前のない画像", "Unnamed image")),
    );
    if (changes.get(o.key)) b.append(el("em", choose("変更予定", "CHANGED")));
    b.onclick = () => {
      selected = o.key;
      render();
    };
    $("occurrence-list").append(b);
  }
  renderEditor();
  renderDiff();
  renderExclusions();
  if (result) {
    $("freshness").textContent = choose(
      "現行のレビューで検証済み",
      "CURRENT REVIEW VERIFIED",
    );
    for (const id of ["download-docx", "download-receipt", "download-report"])
      $(id).disabled = false;
  } else
    $("freshness").textContent = choose(
      "未作成 / 編集後は再作成",
      "STALE / BUILD REQUIRED",
    );
}
function renderEditor() {
  const o = model?.occurrences.find((o) => o.key === selected);
  if (!o) return;
  const r = recordFor(selected);
  $("occurrence-title").textContent =
    o.name || choose("名前のない画像", "Unnamed image");
  $("placement").textContent =
    `${o.kind.toUpperCase()} / ${o.placement.toUpperCase()}`;
  $("context").textContent =
    o.context ||
    choose(
      "この段落には周辺テキストがありません。位置情報と元文書で確認してください。",
      "No nearby text in this paragraph. Check the position and original document.",
    );
  $("part").textContent = o.part;
  $("path").textContent = o.path;
  $("reuse").textContent = choose(
    `${o.references}か所から参照 / 同じ画像が${model.occurrences.filter((x) => x.mediaSha256 === o.mediaSha256).length}出現`,
    `${o.references} story reference(s) / ${model.occurrences.filter((x) => x.mediaSha256 === o.mediaSha256).length} occurrences share image bytes`,
  );
  $("record-state").textContent = r
    ? choose("個別レビュー", "EXACT OCCURRENCE")
    : choose("省略 / 保持", "OMITTED / KEEP");
  for (const k of ["descr", "title"]) {
    const a = r?.edit[k] ?? { action: "keep" };
    $(k + "-original").textContent = showValue(o.original[k]);
    $(k + "-action").value = a.action;
    $(k + "-value").disabled = a.action !== "set";
    $(k + "-value").value =
      a.action === "set" ? a.value : (o.original[k] ?? "");
    $(k + "-bytes").textContent =
      new TextEncoder().encode($(k + "-value").value).length +
      " / 4096 UTF-8 bytes";
  }
}
function renderDiff() {
  if (!model) return;
  $("diff-empty").hidden = true;
  const tbody = $("diff-rows");
  tbody.replaceChildren();
  try {
    const review = snapshot();
    $("diff-table").hidden = false;
    if (!review.changed) {
      const row = el("tr"),
        td = el(
          "td",
          choose(
            "変更なし。DOCXの出力は元ファイルとバイト単位で一致します。",
            "No changes. The DOCX output will be byte-identical to the original.",
          ),
        );
      td.colSpan = 3;
      row.append(td);
      tbody.append(row);
    }
    for (const r of review.rows.filter((r) => r.changed)) {
      const tr = el("tr"),
        name = el("td", r.name || choose("名前のない画像", "Unnamed image"));
      name.append(el("small", r.part + "\n" + r.path));
      tr.append(name);
      for (const v of [r.before, r.after])
        tr.append(
          el(
            "td",
            `descr: ${showValue(v.descr)}\n\ntitle: ${showValue(v.title)}`,
          ),
        );
      tbody.append(tr);
    }
  } catch (e) {
    $("diff-table").hidden = true;
    $("diff-empty").hidden = false;
    $("diff-empty").textContent = e.code ?? e.message;
  }
}
const reasons = {
  "tracked-context": ["変更履歴内", "Tracked context"],
  "legacy-or-embedded": ["VML・埋め込みオブジェクト", "VML or embedded object"],
  "alternate-content": ["代替表現", "AlternateContent"],
  decorative: ["装飾指定あり", "Decorative metadata"],
  "conflicting-carrier": [
    "別のキャリアに説明あり",
    "Competing description carrier",
  ],
  "non-picture-or-grouped": [
    "通常の画像ではない・グループ",
    "Non-picture or grouped object",
  ],
  "external-or-missing-image": [
    "外部参照または画像参照不明",
    "External or missing image reference",
  ],
  "extension-carrier": ["拡張キャリア", "Extension carrier"],
  "metadata-limit": ["メタデータ上限超過", "Metadata over limit"],
};
function renderExclusions() {
  $("exclusion-list").replaceChildren();
  if (!model.exclusions.length)
    $("exclusion-list").append(
      el(
        "p",
        choose(
          "走査対象の中に除外オブジェクトはありません。",
          "No excluded objects observed in scanned stories.",
        ),
      ),
    );
  for (const x of model.exclusions) {
    const a = el("article");
    a.append(
      el("strong", reasons[x.reason] ? choose(...reasons[x.reason]) : x.reason),
      el("small", x.part + " · " + x.path),
    );
    $("exclusion-list").append(a);
  }
  for (const p of model.outside) {
    const a = el("article");
    a.append(
      el("strong", choose("走査対象外のパーツ", "Unscanned part")),
      el("small", p),
    );
    $("exclusion-list").append(a);
  }
}
function editField(k, fromAction) {
  stop();
  invalidate();
  const r = ensureRecord(),
    action = $(k + "-action").value;
  r.edit[k] =
    action === "set"
      ? {
          action,
          value: fromAction
            ? (r.edit[k].value ??
              model.occurrences.find((o) => o.key === selected).original[k] ??
              "")
            : $(k + "-value").value,
        }
      : { action };
  if (fromAction) render();
  else {
    $(k + "-bytes").textContent =
      new TextEncoder().encode($(k + "-value").value).length +
      " / 4096 UTF-8 bytes";
    renderDiff();
    try {
      $("changed-count").textContent = snapshot().changed;
      $("apply").disabled = false;
    } catch (e) {
      $("apply").disabled = true;
      $("changed-count").textContent = "!";
      status(
        choose(
          "値を4096 UTF-8バイト以内にしてください。",
          "Keep the value within 4096 UTF-8 bytes.",
        ),
        true,
      );
    }
  }
}
for (const k of ["descr", "title"]) {
  $(k + "-action").onchange = safe(() => editField(k, true));
  $(k + "-value").oninput = safe(() => editField(k, false));
}
$("reset-record").onclick = safe(() => {
  stop();
  const r = ensureRecord();
  r.edit = { descr: { action: "keep" }, title: { action: "keep" } };
  invalidate();
  render();
  localizedState();
});
$("open-file").onclick = () => $("doc-file").click();
async function loadFile(file) {
  if (!file) return;
  stop();
  const ticket = generation;
  $("cancel-work").hidden = false;
  status(choose("元ファイルを読み込んでいます…", "Reading source file…"));
  try {
    if (file.size > LIMITS.inputBytes) throw Error("DOCX exceeds 25 MiB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ticket !== generation) return;
    busyJob("open", bytes, null, ({ model: next }) => {
      model = next;
      sourceBytes = bytes;
      sourceName = file.name;
      packet = structuredClone(next.packet);
      selected = next.occurrences[0]?.key ?? null;
      invalidate();
      render();
      activate("edit");
      localizedState();
    });
  } catch (e) {
    if (ticket === generation) {
      $("cancel-work").hidden = true;
      status(e.message, true);
    }
  }
}
$("doc-file").onchange = () => {
  const file = $("doc-file").files[0];
  $("doc-file").value = "";
  loadFile(file);
};
$("demo").onclick = async () => {
  stop();
  const ticket = generation;
  try {
    const r = await fetch(new URL("./fixtures/bench.docx", import.meta.url));
    if (!r.ok) throw Error("Example unavailable");
    const blob = await r.blob();
    if (ticket !== generation) return;
    await loadFile(new File([blob], "harbor-image-review.docx"));
  } catch (e) {
    if (ticket === generation) status(e.message, true);
  }
};
$("cancel-work").onclick = () => {
  stop();
  status(
    choose(
      "処理を中止しました。現在のレビューは保持しています。",
      "Processing cancelled. The current review is retained.",
    ),
  );
};
$("apply").onclick = safe(() => {
  const valid = snapshot().packet;
  invalidate();
  busyJob("apply", sourceBytes, valid, ({ result: next }) => {
    result = next;
    render();
    status(
      choose(
        "出力を再読込し、変更と保持を検証しました。",
        "Output reopened; edits and preserved members were verified.",
      ),
    );
  });
});
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type }),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-packet").onclick = safe(() => {
  const p = snapshot().packet;
  download("altslot-review.json", serializePacket(p), "application/json");
});
$("download-docx").onclick = safe(() => {
  if (!result) throw Error("Output is stale");
  download(
    sourceName.replace(/\.docx$/i, "") + "-reviewed.docx",
    result.bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});
$("download-receipt").onclick = safe(() => {
  if (!result) throw Error("Output is stale");
  download(
    "altslot-receipt.json",
    JSON.stringify(result.receipt, null, 2),
    "application/json",
  );
});
$("download-report").onclick = safe(() => {
  if (!result) throw Error("Output is stale");
  download("altslot-review.html", reviewHTML(model, result), "text/html");
});
const dialog = $("packet-dialog");
$("open-packet").onclick = () => {
  packetTicket++;
  $("packet-json").value = "";
  $("packet-error").textContent = "";
  dialog.showModal();
};
const closePacket = () => {
  packetTicket++;
  dialog.close();
};
$("close-packet").onclick = closePacket;
$("cancel-packet").onclick = closePacket;
dialog.addEventListener("cancel", () => packetTicket++);
dialog.addEventListener("close", () => packetTicket++);
$("packet-json").oninput = () => {
  packetTicket++;
  $("packet-file").value = "";
  $("packet-error").textContent = "";
};
function importPacket(text) {
  const incoming = parsePacket(text);
  previewReview(model, incoming);
  stop();
  packet = incoming;
  invalidate();
  render();
  closePacket();
  status(
    choose(
      "レビューを照合して読み込みました。省略された箇所は保持されます。",
      "Review matched and imported. Omitted occurrences remain unchanged.",
    ),
  );
}
$("import-packet").onclick = () => {
  try {
    importPacket($("packet-json").value);
  } catch (e) {
    $("packet-error").textContent = e.code ?? e.message;
  }
};
$("packet-file").onchange = async () => {
  const file = $("packet-file").files[0];
  $("packet-file").value = "";
  if (!file) return;
  const ticket = ++packetTicket;
  try {
    if (file.size > LIMITS.packetBytes)
      throw Error("Review JSON exceeds 4 MiB");
    const bytes = await file.arrayBuffer();
    if (ticket !== packetTicket || !dialog.open) return;
    importPacket(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    );
  } catch (e) {
    if (ticket === packetTicket && dialog.open)
      $("packet-error").textContent = e.code ?? e.message;
  }
};
localizedState();
