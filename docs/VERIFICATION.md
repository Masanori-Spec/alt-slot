# Verification status at source freeze

Local evidence was produced on Node 24.19.0 and Python 3.12.14. Browser and SDK checks below are deliberately separate gates.

## Executed

- Clean `npm ci --ignore-scripts` from the official npm registry, with Playwright 1.56.0 pinned
- Build, ES-module syntax and static runtime checks; 48 local tests passed (19 core, 10 independent Python integration, 5 actual-handler cases, 1 real Node-worker case, 13 independent reviewer cases)
- Core ZIP/XML/packet tests, including Buffer/ArrayBuffer/offset ownership, bounded processing, Unicode, duplicate keys, descriptor validation, exact attribute edits and unchanged local ZIP records
- Ten independent Python integration cases using standard-library zipfile, ElementTree and Expat; literal fixture expectations do not come from the JavaScript implementation
- Actual application-handler tests with a minimal DOM double: cancelled delayed imports, timeout/late completions, locale changes, sibling edits and stale outputs. These are not browser/layout tests
- `scripts/emit_example.mjs` executed the same exported core as the UI. Three selected occurrences changed, two unlisted occurrences stayed intact, and only `word/document.xml` and `word/header1.xml` changed among 23 ZIP members
- Source, changed-source and exclusion fixtures rendered with the installed LibreOffice via the document renderer; all six fixture pages inspected
- Actual emitted reviewed DOCX rendered and compared with the source: both 1547×2002 pages have identical RGBA pixel hashes

The real worker module was also executed in a Node worker with a small message adapter and matched source-API success/error behavior. This is worker-module evidence, not a browser pass.

The independent review exercised 64 oracle batches and rejected an unlisted sibling edit even when output/member hashes and a receipt were refreshed. The render proof and generated source/output review artifacts are retained with the build output. Pixel equality is evidence for these synthetic fixtures with this renderer, not a broad layout or native-Word guarantee.

## Authored, not executed at this freeze

- Fourteen sandboxed Chromium scenarios at `/alt-slot/`, including JA/EN, 390px layout, keyboard tabs, repeated image selection, selective/reordered review returns, actual downloaded outputs, invalid UTF-8, interrupted imports and print evidence
- GitHub Actions on Ubuntu 22.04, engine matrix Node 22/24, plus browser and document jobs
- Open XML SDK 3.3.0, .NET 8 read-only validator. dotnet is not installed in the local build environment, so compilation, execution and error counts are unverified
- CI renderer via distribution LibreOffice/Poppler, distinct from the installed local renderer. The document job consumes the browser artifact; SDK validation includes the original, emitted, browser-downloaded and no-op DOCX, while separate render proofs retain both emitted and browser-downloaded output comparisons
- Hosted application verification, visual UI review, browser screenshot/PDF inspection and deployment verification

Local browser execution was outside the assigned environment scope and was not attempted. No security bypass or disabled Chromium sandbox is part of the workflow.

## Interpretation limits

No native Microsoft Word, screen reader, document reading order or accessibility-conformance result is claimed. The renderer cannot prove that descriptions are meaningful or spoken as intended. The optional SDK validator checks structural/semantic constraints and does not replace those user-agent checks.

The exclusion fixture contains synthetic unsupported structures used to test handling boundaries; it is not offered as a universally valid exemplar of every object type. The supported benchmark and actual reviewed output are the default SDK-validation targets.

The independent source review found no remaining blocker in its tested scope; see [the review report](INDEPENDENT_REVIEW.md). Browser, SDK and native-editor gates remain open. Known tests passing is not evidence of exhaustive correctness.
