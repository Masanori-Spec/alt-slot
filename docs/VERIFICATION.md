# Verification record

Verified on 2026-10-04. The retained evidence is from functional commit `477beeaa7397de178acbc68729ff658ffa46a3d8` and [GitHub Actions run 37185453748](https://github.com/Masanori-Spec/alt-slot/actions/runs/37185453748). The later evidence/documentation commit runs the same workflow again.

## Executed engine checks

Both Ubuntu 22.04 engine jobs, Node 22 and 24 with Python 3.12, passed clean installation, build/static checks and **48 tests with zero failures or skips**:

- 19 core ZIP/XML/packet tests
- 10 independent Python integration cases
- 5 actual-handler cases using a deliberately limited DOM double
- 1 real Node-worker open/apply/error parity case
- 13 independent reviewer cases

The independent reviewer cases include **64 selective-edit oracle batches** using Python `zipfile`, ElementTree and Expat. They verify literal expected occurrence attributes, unchanged XML outside the selected spans, unchanged member payloads and local ZIP records, receipt counts/hashes and no-op whole-file identity. The negative control rejects an unlisted sibling edit even when genuine output/member hashes and a falsified receipt accompany it. See the unchanged [independent review](INDEPENDENT_REVIEW.md).

The real worker and DOM-double checks are distinct from the browser checks below. Passing known cases is not exhaustive correctness.

## Executed browser checks

All **14 sandboxed Chromium scenarios** passed beneath `/alt-slot/` using Playwright 1.56.0 and `chromiumSandbox: true`:

1. Japanese entry, keyboard skip link/roving tabs, English locale and local sample
2. Five exact occurrences distinguish repeated image bytes and stored shared stories
3. Repeated sibling edits remain independent
4. Reordered subset return retains omitted occurrences
5. Actual downloaded DOCX and receipt pass literal independent Python expectations
6. Downloaded HTML report is inert and retained with screen/A4 print capture
7. Edits invalidate old downloads; empty set differs from attribute removal
8. Changed-file packet, identity tampering and duplicate-record rejection are atomic
9. Invalid UTF-8, typed-draft precedence, cancelled delayed reads and repeated file selection
10. Cancelled/malformed source imports and worker-start failure retain the current review
11. UTF-8 byte budget blocks oversized multilingual values without stale output
12. Excluded image types remain visible and uneditable
13. Japanese 390 px layouts fit the document width with localized status
14. No-op DOCX is byte-identical and reload visibly clears the session

The first scenario also asserts skip-link hiding, keyboard reveal, hiding after focus moves, and hiding after scrolling. Eight screenshots were inspected, including a focused keyboard-state capture. The workspace and exported-review PDFs each occupy one A4 page for these examples. [Browser results](evidence/browser/results.json) and [visual review](VISUAL_REVIEW.md) retain the evidence.

## Actual downloaded files

The browser review changes **two occurrences** in `word/document.xml`, leaving **three unlisted occurrences** unchanged. Of 23 ZIP members, the other 22 payloads remain identical. The independently supplied [expected edits](evidence/browser/expected.json) and [Python oracle result](evidence/browser/oracle.json) verify exact chosen attributes and unchanged surrounding XML.

The dedicated [review packet](evidence/browser/reviewed-review.json), [receipt](evidence/browser/receipt.json), [reviewed DOCX](evidence/browser/reviewed.docx) and [source DOCX](evidence/browser/source.docx) are retained together. The suite verifies that the canonical packet hash matches the receipt. It saves this packet separately so later scenario exports cannot overwrite the evidence that produced the DOCX. Source/output hashes were checked again after downloading the CI artifact; the independent Python oracle was rerun successfully.

The separately retained [no-op download](evidence/browser/noop.docx) equals the source byte-for-byte. The emitted integration example is a different test: **three selected edits**, **two unlisted occurrences**, and two changed XML parts. Its packet, receipt and DOCX are in `evidence/document/`.

## Executed SDK validation

The hosted document job compiles and runs the pinned **Open XML SDK 3.3.0** validator on .NET 8, targeting Office 2019 constraints. It consumes the successful browser job's actual artifact.

The [SDK report](evidence/document/openxml-validation.json) records:

- Four files validated: original benchmark, emitted edited output, browser-downloaded edited output and browser no-op
- **Zero validation errors and zero operational failures**
- Read-only opening; each file's SHA-256 unchanged after validation

This is a supplemental structural/semantic SDK check. It does not run Microsoft Word, evaluate description meaning, or establish assistive-technology behavior or universal OOXML compatibility.

## Executed rendering and inspection

The hosted distribution LibreOffice/Poppler job rendered both the emitted output and actual browser-downloaded output, each against the same source. Both comparisons contain two pages and exact matching PNG hashes:

- [Emitted-output comparison](evidence/document/ci-emitted-render-comparison.json)
- [Browser-output comparison](evidence/document/ci-browser-render-comparison.json)

The actual downloaded browser DOCX was also rendered through the packaged document renderer. Its two 1547 × 2002 RGBA pages match the local source render exactly.

Every distinct retained page was inspected. The hosted renderer shows a small portion of the shared-header image at the top edge of source page 2, identically retained in the edited output; the bundled renderer places this differently. Equality is within each source/output pair, not across renderer versions, and does not assert that the source has ideal layout in every application. The source fixture was not silently restyled to conceal that difference.

## Release repairs and remaining limits

Actual UI captures exposed the offscreen skip link in full-page screenshots. It now remains clipped and transparent until focus, without removing keyboard access. Print-only report spacing was tightened so the short two-edit example fits one page while retaining its A4 margins, labels and preservation information. The full workflow passed after these changes; core matching/edit behavior and reviewer files were unchanged.

No native Microsoft Word, screen reader, reading order, description-quality, accessibility-conformance, physical-printer or broad real-world-document compatibility result is claimed. Unsupported object types and unscanned stories remain explicit boundaries. No real user documents, external document connections or public website deployment were used. No project license grant was added.
