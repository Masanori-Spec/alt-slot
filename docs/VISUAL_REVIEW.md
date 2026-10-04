# Visual and document review

Inspected on 2026-10-04 from the actual artifacts of [run 37185453748](https://github.com/Masanori-Spec/alt-slot/actions/runs/37185453748), commit `477beeaa7397de178acbc68729ff658ffa46a3d8`.

## Browser screens

Eight actual Chromium captures were inspected:

- [English occurrence editor](evidence/browser/desktop-edit-en.png): separate repeated images, original metadata, action choices and byte counters
- [English selective return](evidence/browser/desktop-return-en.png): two changed rows, untouched omissions and stale-output state
- [English exclusions](evidence/browser/desktop-exclusions-en.png): nine excluded objects remain visible
- Japanese mobile [editor](evidence/browser/mobile-edit-ja.png), [return](evidence/browser/mobile-return-ja.png) and [scope](evidence/browser/mobile-scope-ja.png): stacked 390 px layout, readable labels and no page-wide overflow
- [Keyboard skip-link focus](evidence/browser/keyboard-skip-focused.png): visible focus state; the other captures confirm it hides when focus moves
- [Downloaded HTML report](evidence/browser/report-screen.png): exact before/after values, explicit absent attributes, source/output identity and preservation scope

The UI text and user-supplied document metadata remain distinct. Synthetic occurrence names and stored values are not translated.

## Printed reviews

The actual [workspace print](evidence/browser/workspace-print.pdf) and [downloaded-report print](evidence/browser/report-print.pdf) were rendered to images and inspected. Each occupies one A4 page for the retained example, with 16 mm vertical and 14 mm horizontal margins. The report retains both edited occurrences and the exclusions, unscanned-parts and preservation statements. Longer imported reviews may need more pages; this is not a universal one-page promise.

## DOCX evidence

The [browser source](evidence/browser/source.docx), [reviewed output](evidence/browser/reviewed.docx), [exact applied packet](evidence/browser/reviewed-review.json) and [receipt](evidence/browser/receipt.json) are bound by the recorded hashes. The downloaded output passed the independent literal Python expectations again after download. Its no-op counterpart is byte-identical to the source.

The SDK validated the source, emitted output, browser output and no-op with zero errors, read-only. [Full SDK result](evidence/document/openxml-validation.json).

The hosted source and reviewed renders have identical pixels in each two-page comparison. Retained pages:

- Browser source [page 1](evidence/document/browser-source/page-1.png), [page 2](evidence/document/browser-source/page-2.png)
- Browser output [page 1](evidence/document/browser-reviewed/page-1.png), [page 2](evidence/document/browser-reviewed/page-2.png)
- Emitted output [page 1](evidence/document/emitted-reviewed/page-1.png), [page 2](evidence/document/emitted-reviewed/page-2.png)

The separate bundled-renderer check also preserves both source pages exactly. The renderers differ in shared-header placement on the second synthetic page: the hosted source has a small image edge at the top, unchanged in its reviewed output. This is retained and disclosed, not presented as universally perfect layout.

Pixel equality tests visual preservation for these inputs in the named renderer. It cannot prove spoken descriptions, reading order, meaningful wording, native Word behavior or accessibility conformance. Those checks remain outside this release.
