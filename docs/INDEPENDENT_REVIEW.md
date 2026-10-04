# AltSlot independent review

Reviewed 2026-10-04. The corrected source is ready for an authorized hosted CI run, with the browser, Open XML SDK and hosted-renderer jobs treated as release gates. No blocker remains in the locally exercised occurrence-matching, packet, selective-edit, preservation or interruption scope. Native Word behavior, spoken descriptions, reading order and accessibility conformance are not established by this review.

## Executed checks

The final `npm run check` passed the static build, syntax/runtime checks and **48 tests with no failures or skips**. The review added **13 tests** in `tests/reviewer.test.mjs`. These run alongside the existing independent Python integration cases and the real Node-worker open/apply/error parity test. Built core modules were also compared byte-for-byte with source, imported directly, and exercised for exact no-op output.

The additional Python oracle uses `zipfile`, ElementTree and Expat independently of the JavaScript implementation and the existing oracle. Across **64 batches**, it checks literal part/element paths for all five benchmark occurrences: two repeated body icons with identical image bytes and original metadata, a floating occurrence with no description, a twice-referenced stored header, and a footer with an empty description. Each batch selects a different subset and uses removal or replacement of description/title, including empty strings, XML metacharacters, Unicode and control whitespace. Record order is varied.

For each output, the oracle checks exact expected attributes; XML bytes outside permitted attribute edits; all unchanged member payloads and raw local ZIP records; ZIP member set/order; source/output/member hashes; selected, changed and unlisted counts; and whole-file equality for no-ops. A negative control applies an extra unlisted sibling edit, retains genuine output/member hashes, and falsifies the receipt's selected count. The oracle rejects it because the unlisted XML changed.

The remaining added cases cover packet ownership, stale/duplicate worker callbacks, typed-draft versus delayed-file ordering, worker construction failure, successful same-file input reset, real malformed UTF-8 versus literal U+FFFD, unscanned parts, namespace declarations, packet expansion limits, and the exact 4,096-byte description boundary. Actual handlers run with a deliberately limited DOM double; this does not establish browser rendering or native file-picker behavior.

## Corrected findings

### Mutable packet aliases affected previews and async evidence

`makePacket` initially shared original attributes/values with its inspection baseline. Mutating the returned identity could therefore change that baseline. `applyReview` also read the caller's packet after asynchronous work and returned the same object: a mutation after invocation changed the applied intent, and a mutation after completion could change `result.packet` without changing its receipt digest.

Packet identities and preview rows are now owned copies. Application validates and snapshots the packet before its first await, and uses that snapshot for edits, receipt and returned evidence. Tests mutate each caller-visible object and verify stable original values, applied intent and packet hash. Reopening the source for application remains the output identity boundary; hashes do not authenticate a reviewer.

### Packet import ordering and repeated selection

Typing a newer pasted review did not invalidate an older pending packet-file read. The old file could then import and close the dialog over the typed draft. Input now advances the file-read ticket. A deterministic delayed-read regression verifies that the newer draft remains in the open dialog until deliberately imported.

Successful import also advanced the ticket while closing the dialog, preventing the old ticket-dependent cleanup from clearing the file input. The File is now captured and the input cleared at handler entry, enabling same-file reselection. Stale read errors and completions remain ticket-gated.

### Worker startup failures did not finish the source-import state

If constructing a Worker threw, the nested job had already changed generation, so the outer file-read catch ignored the exception. The UI retained a reading state. Worker construction and message-delivery failures are now handled within the job, clear processing controls and show an error while preserving the existing review. The independent constructor-failure case and builder delivery-failure case pass.

### The human review conflated absence with a literal value

Setting an absent description to the literal string `∅` produced visually identical before/after cells. The report now labels absent attributes separately and quotes string values, including `""` and `"∅"`. The UI uses the same distinction. This preserves the schema's meaningful difference between missing, empty and literal values without interpreting description quality.

### Unscanned glossary evidence was omitted

The outside-scope matcher looked for `wordprocessingml.glossary`, missing the registered `wordprocessingml.document.glossary+xml` type. It now recognizes that type. The receipt includes `unscannedParts`, and standalone HTML lists those parts rather than dropping the inspection's outside-scope evidence. A separately constructed Python ZIP fixture checks a related glossary part and an unreferenced header; neither becomes editable and both retain identical payloads. The registered type is confirmed by [IANA](https://www.iana.org/assignments/media-types/application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary%2Bxml).

### Namespace declarations were mistaken for competing metadata

An otherwise supported picture became excluded after adding the harmless declaration `xmlns:descr="urn:unrelated"`. The competing-carrier test examined lexical attribute names and confused that namespace declaration with a namespaced description. It now examines expanded non-namespace attributes. Tests accept declarations named `descr`/`title` and continue excluding an actual custom namespaced description. This follows the distinction between namespace bindings and data attributes; XML attribute normalization is checked separately. [Namespaces in XML](https://www.w3.org/TR/xml-names/), [XML 1.0 attribute normalization](https://www.w3.org/TR/xml/#AVNormalize)

### Exported JSON could exceed its own import limit

The builder identified an adjacent round-trip issue during review: validation bounded compact JSON, but the UI always emitted indented JSON. The serializer now emits indented output only when it fits the 4 MiB import bound, otherwise compact output. Its boundary regression parses the emitted result successfully; matching semantics and schema are unchanged.

## Preservation and render evidence

The implementation limits edits to unqualified `descr` and `title` on supported `wp:docPr` occurrences. Microsoft documents these DrawingML object properties; this does not establish how a particular Word or assistive-technology version presents them. [Microsoft DocProperties reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.docproperties?view=openxml-3.0.1)

Unchanged local ZIP member records remain byte-identical. Changed XML members can use different compression and central offsets; the promise is selective XML edits and preservation of the other payloads, not whole-archive equality after a real edit. Shared-header reference counts describe stored relationship uses, not page count or reading order. Unsupported/excluded objects and unscanned parts remain distinct concepts.

Current application of the recorded example packet reproduces the stored reviewed DOCX byte-for-byte:

- Source SHA-256: `73be1f00904e3bcf26c0e77e060f78088496bebcdeaec247cbfbfb2ad9e3ec66`
- Output SHA-256: `423966230e077be8661bb3ca5d6657e997bbc356fce9d98fed4309c195d3ee52`

The review independently recalculated the existing two 1547 × 2002 RGBA page hashes and verified both source/output pixel pairs equal the recorded values. These are the builder's retained LibreOffice render artifacts, not a new rendering or native Word test. The evidence applies to these synthetic fixtures and this renderer.

## Remaining gates

- Execute the **14 authored sandboxed browser scenarios** at the nested deployment path and inspect actual downloads, JA/EN screenshots, narrow layouts and print artifacts
- Compile and run the .NET 8 / Open XML SDK 3.3.0 read-only validator on the original and emitted benchmark; no SDK execution or zero-error result is claimed locally
- Run and inspect the distinct hosted LibreOffice/Poppler evidence against the final output
- Check real Word, relevant screen readers, reading order and description meaning separately before making claims about them
- Refresh source/static archives and manifests after including this report and the reviewer tests

No browser or publication action was performed by this review. The scoped recommendation is to proceed to hosted verification while keeping the current explicit limits and preserving original documents.
