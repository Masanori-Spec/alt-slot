import { VERSION, LIMITS, fail } from "./limits.mjs";
import { openZip, writeZip, encode, decode, sha256, safePath } from "./zip.mjs";
import { xml, is, direct, attr, walk } from "./xml.mjs";
import {
  validateData,
  parsePacket,
  serializePacket,
  exactKeys,
  same,
} from "./packet.mjs";
export { VERSION, LIMITS, parsePacket, serializePacket };
export const NS = Object.freeze({
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  pkg: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  adec: "http://schemas.microsoft.com/office/drawing/2017/decorative",
});
const MAIN =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  STORY = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
const sole = (list, code) => {
  if (list.length !== 1) fail(code);
  return list[0];
};
const bounded = (v, n = 512) => {
  if (typeof v !== "string" || v.length > n) fail("metadata-limit");
  return v;
};
export const escapeXML = (s) =>
  s.replace(
    /[&<>"'\t\r\n]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
        "\t": "&#9;",
        "\r": "&#13;",
        "\n": "&#10;",
      })[c],
  );
export function resolvePart(source, target) {
  if (
    !target ||
    target.startsWith("//") ||
    target.length > LIMITS.pathChars ||
    /[\\\x00-\x20\x7f?#]/.test(target) ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    /%(?:2f|5c|00)/i.test(target)
  )
    fail("relationship-target");
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    fail("relationship-target");
  }
  const segments = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const p of decoded.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") {
      if (!segments.length) fail("relationship-target");
      segments.pop();
    } else segments.push(p);
  }
  const result = segments.join("/");
  if (!safePath(result) || result.endsWith("/")) fail("relationship-target");
  return result;
}
const relSource = (part) => {
  if (part === "_rels/.rels") return "";
  const p = part.split("/");
  if (p.at(-2) !== "_rels" || !p.at(-1).endsWith(".rels"))
    fail("relationship-part");
  p.splice(-2, 1);
  p[p.length - 1] = p.at(-1).slice(0, -5);
  return p.join("/");
};
function parseEntry(entry, budget) {
  if (!entry || entry.size > LIMITS.xmlBytes) fail("xml-size");
  budget.bytes += entry.size;
  if (budget.bytes > LIMITS.xmlBytesTotal) fail("xml-total-limit");
  const text = decode(entry.bytes),
    root = xml(text),
    all = walk(root);
  budget.nodes += all.length;
  budget.units += root.namespaceWorkUnits;
  if (
    budget.nodes > LIMITS.xmlNodesTotal ||
    budget.units > LIMITS.namespaceWorkUnitsTotal
  )
    fail("xml-total-limit");
  return { text, root, all };
}
function relationships(zip, budget) {
  const map = new Map();
  let total = 0;
  for (const e of zip.entries.values()) {
    if (!e.name.endsWith(".rels")) continue;
    const source = relSource(e.name),
      doc = parseEntry(e, budget);
    if (!is(doc.root, NS.pkg, "Relationships")) fail("relationship-root");
    const byId = new Map();
    for (const n of doc.root.children) {
      if (!is(n, NS.pkg, "Relationship") || n.children.length || n.text.trim())
        fail("relationship-element");
      const id = bounded(n.attrs.Id ?? "", 128),
        type = bounded(n.attrs.Type ?? "", 2048),
        target = bounded(n.attrs.Target ?? "", 2048),
        mode = n.attrs.TargetMode ?? "Internal";
      if (
        !/^[A-Za-z_][\w.-]*$/.test(id) ||
        byId.has(id) ||
        !type ||
        !target ||
        !["Internal", "External"].includes(mode)
      )
        fail("relationship-id");
      if (++total > LIMITS.relationships) fail("relationship-limit");
      if (/vbaProject|digital-signature|attachedTemplate/i.test(type))
        fail("excluded-package");
      const part = mode === "Internal" ? resolvePart(source, target) : null;
      if (part && !zip.entries.has(part)) fail("missing-relationship-target");
      byId.set(id, { id, type, target, mode, part });
    }
    map.set(source, byId);
  }
  return map;
}
function contentTypes(zip, budget) {
  const doc = parseEntry(zip.entries.get("[Content_Types].xml"), budget);
  if (!is(doc.root, NS.ct, "Types")) fail("content-types");
  const defaults = new Map(),
    overrides = new Map();
  for (const n of doc.root.children) {
    if (n.children.length || n.text.trim()) fail("content-types");
    const type = bounded(n.attrs.ContentType ?? "", 2048);
    if (
      !type ||
      /macroenabled|vbaproject|digital-signature|encrypted/i.test(type)
    )
      fail("excluded-package");
    if (is(n, NS.ct, "Default")) {
      const ext = bounded(n.attrs.Extension ?? "", 128).toLowerCase();
      if (!ext || defaults.has(ext)) fail("content-types");
      defaults.set(ext, type);
    } else if (is(n, NS.ct, "Override")) {
      const part = resolvePart("", n.attrs.PartName);
      if (overrides.has(part)) fail("content-types");
      overrides.set(part, type);
    } else fail("content-types");
  }
  return (part) =>
    overrides.get(part) ?? defaults.get(part.split(".").at(-1).toLowerCase());
}
const ancestors = (n) => {
  const out = [];
  for (let p = n.parent; p; p = p.parent) out.push(p);
  return out;
};
function unsupportedContext(node) {
  for (const p of ancestors(node)) {
    if (is(p, NS.mc, "AlternateContent")) return "alternate-content";
    if (
      p.ns === NS.w &&
      [
        "ins",
        "del",
        "moveFrom",
        "moveTo",
        "sectPrChange",
        "rPrChange",
        "pPrChange",
      ].includes(p.local)
    )
      return "tracked-context";
    if (p.ns === NS.w && ["txbxContent", "object", "pict"].includes(p.local))
      return "nested-or-legacy";
  }
  return null;
}
function originalAttributes(node) {
  return Object.entries(node.expandedAttrs)
    .map(([k, v]) => [k, v.value])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
const cleanOccurrence = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));
export async function openDocument(input) {
  const zip = await openZip(input),
    budget = { bytes: 0, nodes: 0, units: 0 };
  for (const e of zip.entries.values())
    if (
      /(?:^|\/)(?:_xmlsignatures|vbaProject\.bin|EncryptionInfo|EncryptedPackage)(?:\/|$)/i.test(
        e.name,
      )
    )
      fail("excluded-package");
  const typeOf = contentTypes(zip, budget),
    rels = relationships(zip, budget),
    office = sole(
      [...(rels.get("")?.values() ?? [])].filter(
        (r) => r.type === NS.r + "/officeDocument" && r.mode === "Internal",
      ),
      "document-root",
    );
  if (typeOf(office.part) !== MAIN) fail("document-type");
  const main = parseEntry(zip.entries.get(office.part), budget);
  if (
    !is(main.root, NS.w, "document") ||
    direct(main.root, NS.w, "body").length !== 1
  )
    fail("document-namespace");
  const stories = [{ part: office.part, kind: "main", references: 1, ...main }],
    byPart = new Map([[office.part, stories[0]]]);
  for (const node of main.all.filter(
    (n) =>
      n.ns === NS.w &&
      ["headerReference", "footerReference"].includes(n.local) &&
      is(n.parent, NS.w, "sectPr") &&
      !unsupportedContext(n),
  )) {
    const kind = node.local === "headerReference" ? "header" : "footer",
      r = rels.get(office.part)?.get(attr(node, NS.r, "id"));
    if (
      !r ||
      r.mode !== "Internal" ||
      r.type !== NS.r + "/" + kind ||
      typeOf(r.part) !== STORY + kind + "+xml"
    )
      fail("story-reference");
    if (byPart.has(r.part)) {
      if (byPart.get(r.part).kind !== kind) fail("story-reference");
      byPart.get(r.part).references++;
      continue;
    }
    const story = {
      part: r.part,
      kind,
      references: 1,
      ...parseEntry(zip.entries.get(r.part), budget),
    };
    if (!is(story.root, NS.w, kind === "header" ? "hdr" : "ftr"))
      fail("story-root");
    stories.push(story);
    byPart.set(r.part, story);
  }
  const sourceSha256 = await sha256(zip.bytes),
    occurrences = [],
    exclusions = [],
    mediaHashes = new Map();
  let observed = 0;
  const excluded = (story, node, reason) => {
    if (++observed > LIMITS.occurrences) fail("occurrence-limit");
    exclusions.push({
      part: story.part,
      path: node.path.join("/"),
      kind: story.kind,
      reason,
      name: (node.attrs.name ?? "").slice(0, 200),
      original: {
        descr: (node.attrs.descr ?? "").slice(0, 500),
        title: (node.attrs.title ?? "").slice(0, 200),
      },
    });
  };
  for (const story of stories) {
    const docs = story.all.filter((n) => is(n, NS.wp, "docPr"));
    for (const drawing of story.all.filter((n) => is(n, NS.w, "drawing"))) {
      if (!walk(drawing).some((n) => is(n, NS.wp, "docPr")))
        excluded(story, drawing, "missing-carrier");
    }
    for (const n of story.all.filter(
      (n) => is(n, NS.w, "pict") || is(n, NS.w, "object"),
    )) {
      if (
        !ancestors(n).some((p) => is(p, NS.w, "pict") || is(p, NS.w, "object"))
      )
        excluded(story, n, "legacy-or-embedded");
    }
    for (const node of docs) {
      let reason = unsupportedContext(node),
        container = node.parent,
        blip = null,
        media = null;
      const all = walk(container);
      if (
        !reason &&
        !(
          container?.ns === NS.wp &&
          ["inline", "anchor"].includes(container.local) &&
          is(container.parent, NS.w, "drawing") &&
          is(container.parent.parent, NS.w, "r") &&
          is(container.parent.parent.parent, NS.w, "p")
        )
      )
        reason = "carrier-context";
      if (!reason && direct(container, NS.wp, "docPr").length !== 1)
        reason = "duplicate-carrier";
      if (!reason && all.some((n) => is(n, NS.adec, "decorative")))
        reason = "decorative";
      if (!reason && all.some((n) => is(n, NS.mc, "AlternateContent")))
        reason = "alternate-content";
      const graphics = direct(container, NS.a, "graphic");
      const datas =
        graphics.length === 1 ? direct(graphics[0], NS.a, "graphicData") : [];
      const pics = datas.length === 1 ? direct(datas[0], NS.pic, "pic") : [];
      if (
        !reason &&
        (datas.length !== 1 ||
          datas[0].attrs.uri !== NS.pic ||
          pics.length !== 1 ||
          datas[0].children.length !== 1)
      )
        reason = "non-picture-or-grouped";
      const pic = pics[0];
      if (!reason) {
        const blips = walk(pic).filter((n) => is(n, NS.a, "blip"));
        if (blips.length !== 1) reason = "ambiguous-image";
        else blip = blips[0];
      }
      if (!reason) {
        const others = walk(pic).filter((n) => is(n, NS.pic, "cNvPr"));
        if (
          others.length !== 1 ||
          others.some((n) =>
            ["descr", "title"].some(
              (k) => Object.hasOwn(n.attrs, k) && n.attrs[k] !== "",
            ),
          )
        )
          reason = "conflicting-carrier";
      }
      if (
        !reason &&
        (Object.values(node.expandedAttrs).some(
          ({ name: k }) =>
            k !== "descr" &&
            k !== "title" &&
            k.includes(":") &&
            ["descr", "title"].includes(k.split(":").at(-1)),
        ) ||
          node.children.some((n) => is(n, NS.a, "extLst")))
      )
        reason = "extension-carrier";
      if (!reason) {
        const rid = attr(blip, NS.r, "embed"),
          link = attr(blip, NS.r, "link"),
          r = rels.get(story.part)?.get(rid);
        if (link !== null || !rid || !r || r.mode !== "Internal")
          reason = "external-or-missing-image";
        else if (
          r.type !== NS.r + "/image" ||
          !typeOf(r.part)?.startsWith("image/")
        )
          reason = "non-image-relationship";
        else media = r.part;
      }
      if (
        !reason &&
        Object.values(node.attrs).some(
          (v) => encode(v).length > LIMITS.descriptionBytes,
        )
      )
        reason = "metadata-limit";
      if (reason) {
        excluded(story, node, reason);
        continue;
      }
      if (++observed > LIMITS.occurrences) fail("occurrence-limit");
      if (!mediaHashes.has(media))
        mediaHashes.set(media, await sha256(zip.entries.get(media).bytes));
      const original = {
          descr: node.attrs.descr ?? null,
          title: node.attrs.title ?? null,
        },
        identity = {
          sourceSha256,
          part: story.part,
          path: node.path.join("/"),
          originalAttributes: originalAttributes(node),
          mediaSha256: mediaHashes.get(media),
        },
        key = await sha256(encode(JSON.stringify(identity)));
      occurrences.push({
        ...identity,
        key,
        original,
        kind: story.kind,
        placement: container.local === "anchor" ? "floating" : "inline",
        name: node.attrs.name ?? "",
        mediaPart: media,
        mediaType: typeOf(media),
        references: story.references,
        context:
          ancestors(node)
            .find((n) => is(n, NS.w, "p"))
            ?.children.filter((n) => is(n, NS.w, "r"))
            .flatMap((n) =>
              n.children.filter((c) => is(c, NS.w, "t")).map((c) => c.text),
            )
            .join(" ")
            .slice(0, 300) ?? "",
        _node: node,
      });
    }
  }
  const outside = [...zip.entries.keys()].filter(
    (p) =>
      !byPart.has(p) &&
      /wordprocessingml\.(?:footnotes|endnotes|comments|document\.glossary|header|footer)/.test(
        typeOf(p) ?? "",
      ),
  );
  const ctx = {
    sha256: sourceSha256,
    occurrences: occurrences.map(cleanOccurrence),
    exclusions,
    stories: stories.map(({ part, kind, references }) => ({
      part,
      kind,
      references,
    })),
    outside,
    bytes: zip.bytes.length,
    _zip: zip,
    _stories: stories,
    _occurrences: occurrences,
  };
  ctx.packet = makePacket(ctx);
  return ctx;
}
export function makePacket(doc) {
  const packet = {
    schema: "altslot/review-v1",
    sourceSha256: doc.sha256,
    records: doc.occurrences.map((o) => ({
      key: o.key,
      sourceSha256: o.sourceSha256,
      part: o.part,
      path: o.path,
      originalAttributes: o.originalAttributes.map((pair) => [...pair]),
      mediaSha256: o.mediaSha256,
      original: { ...o.original },
      edit: { descr: { action: "keep" }, title: { action: "keep" } },
    })),
  };
  validateData(packet);
  return packet;
}
function textValue(v) {
  if (
    typeof v !== "string" ||
    encode(v).length > LIMITS.descriptionBytes ||
    /[\uD800-\uDFFF]/u.test(v) ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/u.test(v)
  )
    fail("description-limit");
  return v;
}
function afterAction(old, action) {
  if (!action || typeof action !== "object") fail("edit-action");
  if (action.action === "set") {
    exactKeys(action, ["action", "value"]);
    return textValue(action.value);
  }
  exactKeys(action, ["action"]);
  if (action.action === "keep") return old;
  if (action.action === "remove") return null;
  fail("edit-action");
}
export function previewReview(doc, input) {
  const packet =
    typeof input === "string"
      ? parsePacket(input)
      : structuredClone(validateData(input));
  exactKeys(packet, ["schema", "sourceSha256", "records"]);
  if (
    packet.schema !== "altslot/review-v1" ||
    packet.sourceSha256 !== doc.sha256
  )
    fail("changed-source");
  if (
    !Array.isArray(packet.records) ||
    packet.records.length > LIMITS.occurrences
  )
    fail("packet-records");
  const byKey = new Map(doc.occurrences.map((o) => [o.key, o])),
    seen = new Set(),
    rows = [];
  for (const record of packet.records) {
    exactKeys(record, [
      "key",
      "sourceSha256",
      "part",
      "path",
      "originalAttributes",
      "mediaSha256",
      "original",
      "edit",
    ]);
    const o = byKey.get(record.key);
    if (!o || seen.has(record.key)) fail("record-identity");
    seen.add(record.key);
    for (const key of [
      "sourceSha256",
      "part",
      "path",
      "originalAttributes",
      "mediaSha256",
    ])
      if (!same(record[key], o[key])) fail("record-identity");
    exactKeys(record.original, ["descr", "title"]);
    if (
      record.original.descr !== o.original.descr ||
      record.original.title !== o.original.title
    )
      fail("record-identity");
    exactKeys(record.edit, ["descr", "title"]);
    const after = {
      descr: afterAction(o.original.descr, record.edit.descr),
      title: afterAction(o.original.title, record.edit.title),
    };
    rows.push({
      key: o.key,
      part: o.part,
      path: o.path,
      name: o.name,
      before: { ...o.original },
      after,
      changed:
        after.descr !== o.original.descr || after.title !== o.original.title,
    });
  }
  return {
    packet,
    rows,
    changed: rows.filter((r) => r.changed).length,
    keptUnlisted: doc.occurrences.length - rows.length,
  };
}
function patchText(text, patches) {
  let boundary = text.length;
  for (const p of patches.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (p.start < 0 || p.end > boundary || p.end < p.start)
      fail("patch-overlap");
    text = text.slice(0, p.start) + p.value + text.slice(p.end);
    boundary = p.start;
  }
  return text;
}
export async function applyReview(input, packet) {
  // Capture the requested intent before any asynchronous ZIP/hash work begins.
  const ownedPacket =
    typeof packet === "string"
      ? parsePacket(packet)
      : structuredClone(validateData(packet));
  const doc = await openDocument(input),
    review = previewReview(doc, ownedPacket),
    patches = new Map(),
    byKey = new Map(doc._occurrences.map((o) => [o.key, o]));
  for (const row of review.rows) {
    if (!row.changed) continue;
    const o = byKey.get(row.key),
      node = o._node,
      list = patches.get(o.part) ?? [];
    let additions = "";
    for (const field of ["descr", "title"]) {
      if (row.before[field] === row.after[field]) continue;
      const info = node.attrInfo[field];
      if (info) {
        if (row.after[field] === null)
          list.push({ start: info.start, end: info.end, value: "" });
        else
          list.push({
            start: info.valueStart,
            end: info.valueEnd,
            value: escapeXML(row.after[field]),
          });
      } else if (row.after[field] !== null)
        additions += ` ${field}="${escapeXML(row.after[field])}"`;
    }
    if (additions) {
      const at = node.openEnd - (node.end === node.openEnd ? 2 : 1);
      list.push({ start: at, end: at, value: additions });
    }
    patches.set(o.part, list);
  }
  const changed = new Map();
  for (const [part, list] of patches) {
    const story = doc._stories.find((s) => s.part === part);
    changed.set(part, encode(patchText(story.text, list)));
  }
  const bytes = writeZip(doc._zip, changed),
    after = await openDocument(bytes);
  if (
    after.occurrences.length !== doc.occurrences.length ||
    !same(after.exclusions, doc.exclusions)
  )
    fail("output-verification");
  const expected = new Map(
    review.rows.map((r) => [r.part + "#" + r.path, r.after]),
  );
  for (let i = 0; i < doc.occurrences.length; i++) {
    const before = doc.occurrences[i],
      actual = after.occurrences[i];
    if (
      before.part !== actual.part ||
      before.path !== actual.path ||
      before.mediaSha256 !== actual.mediaSha256 ||
      !same(
        actual.original,
        expected.get(before.part + "#" + before.path) ?? before.original,
      )
    )
      fail("output-verification");
  }
  const members = [];
  for (const [part, e] of doc._zip.entries) {
    const next = after._zip.entries.get(part);
    if (!next) fail("output-verification");
    const beforeSha256 = await sha256(e.bytes),
      afterSha256 = await sha256(next.bytes);
    if (!changed.has(part) && beforeSha256 !== afterSha256)
      fail("untouched-member-changed");
    members.push({
      part,
      beforeSha256,
      afterSha256,
      changed: changed.has(part),
    });
  }
  const receipt = {
    schema: "altslot/receipt-v1",
    engineVersion: VERSION,
    sourceSha256: doc.sha256,
    outputSha256: after.sha256,
    packetSha256: await sha256(encode(JSON.stringify(review.packet))),
    selectedRecords: review.rows.length,
    changedOccurrences: review.changed,
    keptUnlisted: review.keptUnlisted,
    changedParts: [...changed.keys()],
    members,
    noOpByteIdentical: changed.size === 0 && doc.sha256 === after.sha256,
    verification: {
      reopened: true,
      unaffectedMemberBytesIdentical: true,
      mediaBytesIdentical: true,
      nativeWordTested: false,
      screenReaderTested: false,
    },
    exclusions: doc.exclusions,
    unscannedParts: [...doc.outside],
  };
  return { bytes, receipt, beforeAfter: review.rows, packet: review.packet };
}
