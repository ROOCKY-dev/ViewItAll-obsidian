# ViewItAll

> Open **PDF** and **Word (.docx)** files directly inside [Obsidian](https://obsidian.md) — no external apps, no context switching.

![Version](https://img.shields.io/badge/version-0.1.4-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.0%2B-purple)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### PDF Viewer
- 📄 Renders all pages inline with correct sizing (including landscape pages)
- �� **Zoom controls** — snap steps 25 / 50 / 75 / **100** / 125 / 150 / 200 / 300 / 400 %
- ✏️ **Freehand annotation tools** — pen, highlighter, eraser
- 💾 Annotations saved as a companion `.annotations.json` sidecar file
- 🌀 Loading spinner while the PDF parses
- ⌨️ Keyboard-friendly navigation

### DOCX Viewer / Editor
- 📝 Renders Word documents as clean HTML via [mammoth](https://github.com/mwilliamson/mammoth.js)
- ✏️ Toggle **Edit mode** to make changes in a rich-text area
- 💾 Save back to `.docx` via [html-to-docx](https://github.com/privateOmega/html-to-docx)
- ⚠️ Warns once per session about lossy serialisation (custom styles / tracked changes are not preserved)

---

## Installation

### Manual (development)
1. Clone this repo into your vault's plugin folder:
   ```
   .obsidian/plugins/ViewItAll-md/
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build:
   ```bash
   npm run build
   ```
4. Enable the plugin in **Settings → Community plugins**.

---

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode — rebuilds on save
npm run build     # production build
```

Requires **Node 18+** and **npm**.

---

## Architecture

```
src/
  main.ts              # Plugin lifecycle, view registration
  types.ts             # Shared interfaces & view-type constants
  settings.ts          # Settings UI + defaults
  utils/
    fileUtils.ts       # Vault path helpers
    docxUtils.ts       # mammoth read + html-to-docx write
    pdfAnnotations.ts  # Annotation sidecar load/save
  views/
    DocxView.ts        # DOCX FileView
    PdfView.ts         # PDF FileView (pdfjs-dist v3)
styles.css             # All scoped via-* CSS classes
```

See [`UI-UX_constraints.md`](./UI-UX_constraints.md) for design standards.

---

## Known Limitations

- DOCX round-trip is **lossy** — custom paragraph styles, macros, tracked changes, and complex tables may not survive save.
- PDF annotation coordinates are stored **normalised** (0–1); annotations from versions < 0.1.4 (which used absolute px) will render incorrectly.
- Obsidian's built-in PDF viewer is temporarily replaced while this plugin is active; it is restored on plugin unload.

---

## License

MIT © [ROOCKY.dev](https://github.com/ROOCKY-dev)
