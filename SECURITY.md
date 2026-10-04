# Local processing and limits

AltSlot reads files explicitly selected in the browser and downloads new artifacts. It does not upload source bytes, follow document relationships, fetch external images, run macros, execute review strings, infer descriptions or connect to Word/cloud storage. Same-origin application assets and the sample are ordinary network requests. No browser localStorage/IndexedDB/sessionStorage is used.

The parser and writer use explicit ZIP/XML/packet bounds, checksums, namespace resolution and descriptor-first validation of direct JavaScript packet objects. File imports use fatal UTF-8 for review JSON. Stale/cancelled worker callbacks cannot publish an output. These are tested handling boundaries, not a claim that all hostile files are safe or that the implementation is a complete archive/schema validator.

Source and return identity use SHA-256 but no signature. Anyone with a source can create a new valid packet. Use a separate trusted review process if authorship or approval matters. Unchanged parts retain their original metadata, embedded files and private information; this is not a redaction tool. Downloaded outputs should still be handled with the same care as the source document.

See [the bounded profile](docs/FORMAT.md) and [verification evidence](docs/VERIFICATION.md). No native Word, screen-reader or accessibility-conformance certification is included.
