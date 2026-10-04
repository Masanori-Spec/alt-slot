# Existing workflows and AltSlot's scope

Sources checked on 2026-10-04. This is a scoped engineering comparison, not a market survey, proof of demand or novelty claim.

| Existing workflow | What its own documentation demonstrates | AltSlot's bounded emphasis |
|---|---|---|
| Word's native alt-text editing | Microsoft documents adding alternative text to pictures and other objects. It is the natural place to inspect visual context and application behavior. | Export and selectively return a separate file-bound review, with explicit before/after evidence. Native Word and assistive-technology review remain necessary. |
| Community VBA export/import example | A 2014 Microsoft-hosted community answer exports descriptions for localization. Its author explains floating-anchor ordering and uses the original description to find a returned row. This is a specific historical example, not a statement about all macros. | Identical/blank descriptions and repeated media use distinct occurrence keys; a changed source file is rejected instead of matched heuristically. |
| memoQ DOCX filter | The vendor documents an option to import image alternative text alongside a broader document-translation workflow. | A small metadata-only exchange with no translation memory, translation engine or full-document editing. |
| Grackle Office | The vendor describes an integrated Microsoft 365 accessibility task pane, guided fixes and screen-reader previews. It also states that document content stays on the client. | Exact occurrence identity, selective review return and unchanged-member evidence. Local processing alone is not the claimed difference. |

Primary links: [Microsoft native editing](https://support.microsoft.com/en-us/accessibility/office-accessibility/add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object), [historical community macro](https://learn.microsoft.com/en-ie/answers/questions/4861302/need-word-macro-to-export-and-import-alt-text), [memoQ DOCX filter](https://docs.memoq.com/current/en/Workspace/microsoft-word-2007-and-higher.html), [Grackle Office product documentation](https://www.grackledocs.com/en_ca/products-services/grackle-office/).

The defensible demonstration is a pair of identical icons with identical descriptions, used for different purposes, plus an anchored image and shared header. A returned packet can be reordered and contain only one of those identities. Only that stored occurrence changes. This demonstrates the mechanism; it does not establish whether teams prefer it or would pay for it.

The schema basis is Microsoft's [DocProperties reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.docproperties?view=openxml-3.0.1): `wp:docPr` occurs under inline/anchor and carries `descr` and `title`. Optional independent validation uses the official [Open XML SDK 3.3.0 package](https://www.nuget.org/packages/DocumentFormat.OpenXml/3.3.0). Schema validation is not an accessibility assessment.
