# Demonstration and engineering discussion

## A three minute walkthrough

Open the synthetic sample. Two main-story icons share exactly the same image bytes and original description. A third image is floating. The shared header and footer each have two section references but one stored occurrence.

Change only the second icon's description. Save the review JSON, reorder its records and keep only that one record. Import it against the original DOCX. The before/after table shows one change. The receipt identifies the exact XML part and occurrence and shows all other member payload hashes unchanged. The first icon retains its original description.

Try returning the same packet against `bench-changed.docx`. It fails because the source hash differs, even though the images remain similar. Open `exclusions.docx` to show why unsupported carriers are visible rather than guessed.

## Decisions worth explaining

The matching unit is a stored drawing occurrence, not a media object, description string, visual order or mutable Word ID. The file hash binds a positional element path to one exact source. The price is deliberate: saving the file again requires a fresh review. There is no fuzzy rebase.

Selective updates are attribute-span patches. Reserializing the whole XML tree would make unrelated byte preservation harder to establish. XML namespace resolution and entity normalization still matter, so a text-only regular-expression replacement is insufficient.

The writer copies unchanged ZIP member records and recomputes central offsets. An initial reused helper incorrectly treated Node Buffer slices as owned arrays. Independent tests exposed input mutation; explicit ownership now covers Buffer, ArrayBuffer and offset views. That is a concrete example of why a passing browser-oriented path is not enough evidence for a Node API.

The Python oracle does not ask the application to produce expected values. It uses literal fixture assertions and independently parses ZIP/XML; it also checks unrelated lexical bytes. LibreOffice raster equality supports unchanged visible layout for the fixture, while the SDK check, native Word and screen readers answer different questions. None can be silently substituted for the others.

## What remains to learn

The utility of a separate metadata-only review exchange needs user observation. Compare it with working directly in Word, memoQ or an integrated accessibility tool. Measure reviewer effort and mis-targeted edits on realistic repeated-image documents before making adoption or time-saving claims. Description quality and reading order require human review with the intended application and assistive technology.
