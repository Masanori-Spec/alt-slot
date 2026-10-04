# Third-party notices

No project license grant is added by this file.

The application runtime has no third-party JavaScript packages. ZIP/XML utility code was adapted from the same user's DeckRelay project, with owned-buffer handling added here.

Development-only dependencies:

- Playwright and @playwright/test 1.56.0, Microsoft: Apache License 2.0. [Project](https://github.com/microsoft/playwright), [license](https://github.com/microsoft/playwright/blob/v1.56.0/LICENSE)
- Optional macOS fsevents 2.3.2: MIT License. [Project and license](https://github.com/fsevents/fsevents/tree/v2.3.2)
- Optional DocumentFormat.OpenXml 3.3.0 and its framework dependency, Microsoft/.NET Foundation contributors: MIT License. [Official package](https://www.nuget.org/packages/DocumentFormat.OpenXml/3.3.0), [project license](https://github.com/dotnet/Open-XML-SDK/blob/v3.3.0/LICENSE)

The fixture generator uses the environment's python-docx 1.2.0 / lxml 6.1.1 tooling. python-docx is MIT-licensed; lxml is BSD-licensed. Neither library is shipped with the runtime or needed for tests against the committed fixtures. The independent oracle uses only Python standard-library ZIP/XML parsers. Fixture graphics are generated geometric shapes and contain no third-party artwork.

LibreOffice is used only as an installed external renderer; it is not bundled. Rendered comparisons are layout evidence, not a LibreOffice, Microsoft or accessibility endorsement. Dependency licenses remain in their installed package distributions; copied notice texts for packaged development components are in `tests/vendor/`.
