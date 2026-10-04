using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

// Read-only supplemental schema/semantic validation. It is deliberately separate
// from the JavaScript parser and Python preservation oracle; it does not run Word.
var paths = args.Length == 0
    ? new[] { "fixtures/bench.docx", "tests/artifacts/reviewed.docx" }
    : args;
var results = new List<DocumentResult>();
foreach (var path in paths)
{
    string? before = null;
    try
    {
        before = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();
        List<ValidationIssue> issues;
        using (var document = WordprocessingDocument.Open(path, false))
        {
            var validator = new OpenXmlValidator(FileFormatVersions.Office2019)
            {
                MaxNumberOfErrors = 0, // Return the full count, not a truncated sample.
            };
            issues = validator.Validate(document).Select(error => new ValidationIssue(
                error.Id,
                error.ErrorType.ToString(),
                error.Description,
                error.Part?.Uri.ToString(),
                error.Path?.XPath
            )).ToList();
        }
        var after = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();
        results.Add(new DocumentResult(path, before, after, before == after, issues.Count, issues, null));
    }
    catch (Exception error)
    {
        // Opening, SDK and I/O failures are failures, never a misleading zero.
        results.Add(new DocumentResult(path, before, null, false, null, new(), error.GetType().Name + ": " + error.Message));
    }
}

var passed = results.All(result => result.RunError is null && result.ErrorCount == 0 && result.ByteIdentical);
var report = new
{
    schema = "altslot/openxml-validation-v1",
    ok = passed,
    package = "DocumentFormat.OpenXml",
    packageVersion = "3.3.0",
    assemblyVersion = typeof(WordprocessingDocument).Assembly.GetName().Version?.ToString(),
    targetFramework = "net8.0",
    fileFormatVersion = "Office2019",
    readOnly = true,
    documentsValidated = results.Count(result => result.ErrorCount.HasValue),
    validationErrorCount = results.Sum(result => result.ErrorCount ?? 0),
    operationalFailureCount = results.Count(result => result.RunError is not null),
    nativeWordTested = false,
    screenReaderTested = false,
    documents = results,
};
Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions
{
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
}));
return passed ? 0 : 1;

sealed record ValidationIssue(string? Id, string ErrorType, string? Description, string? Part, string? XPath);
sealed record DocumentResult(string Path, string? BeforeSha256, string? AfterSha256, bool ByteIdentical,
    int? ErrorCount, List<ValidationIssue> Errors, string? RunError);
