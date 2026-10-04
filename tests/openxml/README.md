# Optional independent Open XML SDK validation

This validator opens each DOCX read-only using the official `DocumentFormat.OpenXml` NuGet package, pinned to **3.3.0**, targeting **.NET 8**. It validates against the Office 2019 format, reports every SDK error and per-document counts, verifies unchanged file hashes, and exits 1 on any validation or operational failure. This is schema/semantic validation; it is not Microsoft Word or screen-reader testing.

From the repository root, on a machine that already has the .NET 8 SDK:

```sh
node scripts/emit_example.mjs
dotnet restore tests/openxml/AltSlot.OpenXml.csproj --configfile tests/openxml/NuGet.Config
dotnet run --project tests/openxml/AltSlot.OpenXml.csproj --no-restore -- fixtures/bench.docx tests/artifacts/reviewed.docx
```

Restore uses only the official NuGet service. The validator needs no network once its package dependencies are restored. It does not modify documents, install the runtime, accept a document as valid after an exception, or regenerate expected edit values. With no command-line paths, it checks those same two files relative to the current working directory.

Keep its JSON output as evidence of actual execution. No SDK pass or zero-error count is implied merely by including this source. The synthetic exclusion fixture is intentionally outside the supported editing subset and is not one of the default conformance targets.

Primary references:

- [Official package 3.3.0](https://www.nuget.org/packages/DocumentFormat.OpenXml/3.3.0)
- [Microsoft document validation guide](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-validate-a-word-processing-document)
- [Unlimited validator error counts](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.validation.openxmlvalidator.maxnumberoferrors?view=openxml-3.0.1)
