# Integration

The browser uses the same dependency-free ES modules as the Node tests. Node 22+ must provide Web Crypto and `DecompressionStream('deflate-raw')`.

```js
import {readFile, writeFile} from 'node:fs/promises';
import {openDocument, makePacket, parsePacket, serializePacket, applyReview} from './src/core.mjs';

const bytes = await readFile('source.docx');
const document = await openDocument(bytes);
const packet = makePacket(document);
// Have a person edit only record.edit actions; preserve every identity field.
await writeFile('review.json', serializePacket(packet));

const returned = parsePacket(await readFile('review.json', 'utf8'));
const result = await applyReview(bytes, returned);
await writeFile('reviewed.docx', result.bytes);
await writeFile('receipt.json', JSON.stringify(result.receipt, null, 2));
```

This short example assumes a trusted, bounded UTF-8 input source. For arbitrary files, bound bytes before reading, reject nonregular files as appropriate to your host, and decode bytes with `new TextDecoder('utf-8',{fatal:true,ignoreBOM:true})`. The browser input path does both file-size checks and fatal UTF-8 decoding. The pure API does not open, overwrite or automatically discover user files.

`previewReview(document, packet)` validates a returned review and provides before/after rows without writing the package. `applyReview` always parses the supplied source again, validates identities, writes a fresh byte array and reopens it for verification. It does not trust a caller-provided receipt. Keep your original file and save the output under another name.

The exact operation demonstrated in CI is `node scripts/emit_example.mjs`. It creates independently specified edits and runs the separate Python oracle against the resulting DOCX. `tests/oracle.py verify before.docx after.docx expected.json` is read-only and expects literal part/path/new-value assertions. See `tests/openxml/README.md` for the optional SDK validation command.

Application integration must add its own storage transactions, permissions, reviewer identity and native-editor testing. A SHA-256 review key is not an approval signature. No pass here authorizes modifying a real organization's source documents automatically.
