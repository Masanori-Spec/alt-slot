# Data model and preservation contract

## Stored occurrence identity

Each eligible occurrence is a `wp:docPr` under an ordinary `wp:inline` or `wp:anchor`. The surrounding drawing must be in a WordprocessingML run/paragraph, contain a single ordinary picture, and resolve one internal image relationship. Namespace URIs, rather than literal prefixes, identify elements and attributes.

`path` is a slash-separated sequence of zero-based **element-child indexes** from that XML part's root. The root path is empty. Comments, text and processing instructions are not path components. This is a stored-element locator, not visual page order or reading order.

The record key is SHA-256 over UTF-8 `JSON.stringify` of these fields in this order:

```js
{ sourceSha256, part, path, originalAttributes, mediaSha256 }
```

`originalAttributes` is the lexically sorted array of `[expandedName, value]` for every non-namespace-declaration attribute on `docPr`. Unqualified attributes use names such as `{}descr`; a namespaced attribute uses `{namespaceURI}localName`. XML attribute values follow XML normalization, including character references. The file digest protects the exact lexical source as well.

## Review packet

```json
{
  "schema": "altslot/review-v1",
  "sourceSha256": "...",
  "records": [{
    "key": "...",
    "sourceSha256": "...",
    "part": "word/document.xml",
    "path": "0/3/1/0/0/1",
    "originalAttributes": [["{}descr", "Status icon"]],
    "mediaSha256": "...",
    "original": {"descr": "Status icon", "title": null},
    "edit": {"descr": {"action": "set", "value": "Intake checkpoint"}, "title": {"action": "keep"}}
  }]
}
```

The example abbreviates the full original attribute list and hash values; it is illustrative, not a directly importable packet. Export an actual packet from the source document.

Each action is exactly `{"action":"keep"}`, `{"action":"remove"}` or `{"action":"set","value":"..."}`. Null originals mean absent attributes. Empty strings and absent attributes are different. A subset of records is accepted; missing records mean keep. Reordered records are accepted. Duplicate, unknown or altered identities, extra fields, unexpected actions and stale source digests reject the entire return. The operation has no partial-output success state.

The packet parser rejects duplicate object keys, malformed JSON and UTF-8, unpaired surrogates and unsupported data types. Direct API objects must be plain descriptor-backed JSON data, without getters, symbols, hidden properties, subclass arrays or holes. Packet data has no numeric or boolean fields in this schema.

## Preservation and verification

Source bytes are copied into owned buffers. Attribute updates replace only an existing value span, insert an absent attribute immediately before the start-tag terminator, or remove the attribute lexeme while preserving surrounding whitespace. XML escapes preserve tabs/newlines in attribute values. Unknown attributes and content elsewhere remain intact.

Unchanged ZIP local member records are copied verbatim. Changed XML members are emitted using STORE compression; central offsets/size/CRC fields are recomputed as necessary. The output is reopened and each occurrence's new values, media hashes, exclusions and unaffected member hashes are checked. The receipt lists every member's before/after payload digest. An unchanged action set returns an owned copy of the original ZIP bytes.

The independent Python oracle checks both parsed XML and lexical bytes outside the permitted attribute edits. Its lexical comparison normalizes only separator whitespace inside selected `docPr` opening tags after masking the allowed attributes; it does not normalize the rest of the document.

## Resource profile

| Boundary | Limit |
|---|---:|
| Input/output DOCX | 25 MiB each |
| Expanded ZIP total | 100 MiB |
| ZIP entries | 2,500 |
| Single expanded member | 30 MiB |
| Expansion ratio | 200x, with 1 KiB floor |
| XML member / parsed XML total | 4 MiB / 20 MiB |
| XML nodes per part / total | 100,000 / 250,000 |
| XML depth / attributes per element | 80 / 128 |
| Namespace bindings / URI length | 128 / 512 characters |
| Observed eligible + excluded occurrences | 300 |
| Description or title | 4,096 UTF-8 bytes |
| Review JSON / nodes / depth | 4 MiB / 30,000 / 12 |
| Browser operation timeout | 20 seconds |
| HTML review | 8 MiB |

Additional bounds apply to names, relationship counts and namespace-processing work; the exact constants are in `src/limits.mjs`. Unsupported limits never silently truncate an editable field. UI context/name previews may be shortened and are not occurrence identifiers.

UTF-8 XML 1.0 with an optional BOM is supported. DTDs, declared entities, duplicate expanded attributes and malformed namespaces are rejected. The XML-name profile is intentionally narrower than all legal XML names. ZIP64, encryption, multipart archives, unsupported compression, symlinks, ambiguous paths/names and overlapping/gapped records are rejected. Attached-template relationships are outside this package profile.

## Application boundaries

The original document may contain sensitive metadata in untouched parts; this tool does not scrub it. A shared header's edits affect every rendering of that stored header. Header/footer reference counts are relationship-use observations, not page counts. Missing carriers and unsupported objects are reported; the absence of an exclusion is not proof of complete document validity.

Image previews are intentionally omitted in this version. Identify an occurrence through its part/path, metadata, nearby paragraph text and original Word document. No image decoding, OCR or pixel transformation occurs in the application.
