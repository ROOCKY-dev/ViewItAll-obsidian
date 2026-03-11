# ViewItAll-md — TODO

## v0.1.0 MVP

### Completed
- [x] Scaffolded plugin structure (`src/main.ts`, `src/types.ts`, `src/settings.ts`)
- [x] Installed npm dependencies: `mammoth`, `html-to-docx`, `pdfjs-dist`
- [x] Updated `manifest.json` (name, version, isDesktopOnly)
- [x] Created `src/utils/fileUtils.ts` — file path helpers
- [x] Created `src/utils/docxUtils.ts` — mammoth read + html-to-docx save
- [x] Created `src/utils/pdfAnnotations.ts` — load/save companion `.annotations.json`
- [x] Created `src/views/DocxView.ts` — DOCX viewer/editor with toolbar
- [x] Created `src/views/PdfView.ts` — PDF viewer with freehand annotation layer
- [x] Rewrote `src/main.ts` — registers views, extensions, settings tab
- [x] Rewrote `src/settings.ts` — full settings UI
- [x] Updated `styles.css` — scoped styles for all components

### Pending / Future

#### v0.1.x polish
- [ ] Zoom in/out for PDF pages (currently fixed 1.5× scale)
- [ ] Scroll-to-page via keyboard shortcut or page-number input
- [ ] DOCX: undo/redo via native browser `execCommand` or `document.execCommand`
- [ ] Show page numbers below each PDF page canvas
- [ ] Display total pages count in PDF toolbar

#### v0.2.0
- [ ] PDF text search (using pdfjs-dist `getTextContent`)
- [ ] PDF table of contents / outline sidebar
- [ ] Annotation color picker per-stroke (currently uses global settings)
- [ ] Export annotated PDF (merge canvas annotations into PDF via pdf-lib)

#### Longer term
- [ ] DOCX: track-changes support
- [ ] DOCX: print via `window.print()` or Electron dialog
- [ ] Excel (.xlsx) viewer (read-only, render as HTML table via SheetJS)
- [ ] PowerPoint (.pptx) viewer (read-only slide thumbnails)

## Known Limitations

- **DOCX round-trip is lossy**: Complex formatting (merged table cells, embedded objects,
  custom styles) may be simplified when saving. A warning is shown before saving.
- **PDF annotation is additive only**: Annotations are stored in a sidecar
  `{filename}.pdf.annotations.json` file and drawn as canvas overlays. They are NOT
  embedded into the PDF file itself.
- **Desktop only**: The plugin is marked `isDesktopOnly: true`. Binary file I/O and
  pdfjs-dist canvas rendering require the Electron renderer environment.
