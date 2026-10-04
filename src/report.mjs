const h = (s) =>
  String(s ?? "∅").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const displayValue = (value) =>
  value === null
    ? "<em>Attribute absent</em>"
    : '<span class="value-type">String</span> <code>' +
      h(JSON.stringify(value)) +
      "</code>";
export function reviewHTML(model, result) {
  const rows = result.beforeAfter.filter((r) => r.changed);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>AltSlot metadata review</title><style>body{font:14px/1.55 system-ui;max-width:1050px;margin:40px auto;padding:0 22px;color:#213a44}h1{font-size:34px}h2{margin-top:32px}small,.muted{color:#596a70}.note{padding:18px;background:#f4eddb;border-radius:8px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border-bottom:1px solid #bdced2;padding:10px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#e9f0f0}code{overflow-wrap:anywhere;font-size:10px}article{margin:24px 0}article>p{font-size:11px}@page{size:A4;margin:16mm 14mm}@media print{body{margin:0;padding:0;font-size:11px}h1,h2,h3{break-after:avoid}tr{break-inside:avoid}p{orphans:3;widows:3}}</style><body><small>ALTSLOT / EXACT-OCCURRENCE REVIEW</small><h1>Image metadata return</h1><p>${rows.length} changed occurrences · ${model.occurrences.length} eligible occurrences · ${model.exclusions.length} excluded objects</p><p class="note">This review records metadata edits only. It does not evaluate whether descriptions are meaningful or establish accessibility compliance, reading order, native Word behavior or screen-reader results. A SHA-256 digest identifies bytes; it does not authenticate a reviewer.</p><p>Source <code>${h(result.receipt.sourceSha256)}</code><br>Output <code>${h(result.receipt.outputSha256)}</code></p>${rows.map((r) => `<article><h2>${h(r.name || "Unnamed image occurrence")}</h2><p>${h(r.part)} · element path ${h(r.path)}<br>Occurrence key <code>${h(r.key)}</code></p><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${["descr", "title"].map((k) => `<tr><td>${k === "descr" ? "Description" : "Title"}</td><td>${displayValue(r.before[k])}</td><td>${displayValue(r.after[k])}</td></tr>`).join("")}</tbody></table></article>`).join("") || "<p>No metadata changed. The DOCX is byte-identical to the input.</p>"}<h2>Excluded objects</h2><table><thead><tr><th>Part / path</th><th>Reason</th></tr></thead><tbody>${model.exclusions.map((e) => `<tr><td>${h(e.part)}<br>${h(e.path)}</td><td>${h(e.reason)}</td></tr>`).join("") || '<tr><td colspan="2">None observed within the scanned stories.</td></tr>'}</tbody></table><h2>Unscanned parts</h2>${model.outside.length ? "<ul>" + model.outside.map((part) => "<li><code>" + h(part) + "</code></li>").join("") + "</ul>" : "<p>No additional known story parts were found outside the scanned scope.</p>"}<p>The main document and reachable headers and footers were scanned. Unscanned parts were preserved without image-metadata inspection.</p><h2>Preservation evidence</h2><p>${result.receipt.members.length - result.receipt.changedParts.length} member payloads retained identical bytes. Changed XML was patched only at the selected docPr title/descr attributes. Other ZIP local member records were copied unchanged; central offsets may change. No-op whole-file equality: ${result.receipt.noOpByteIdentical}.</p></body></html>`;
  if (new TextEncoder().encode(html).length > 8 * 1024 * 1024)
    throw Error("Report exceeds 8 MiB");
  return html;
}
