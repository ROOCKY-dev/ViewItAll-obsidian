# ViewItAll — UI/UX Constraints & Design Standards

> **Status:** Living document — update before implementing any UI change.  
> **Principle:** Quality over quantity. Every pixel earns its place.

---

## 0. Core Tenets

| # | Tenet | What it means in practice |
|---|-------|---------------------------|
| 1 | **Theme-first** | No hard-coded colours. Every visual token comes from an Obsidian CSS variable. |
| 2 | **Non-intrusive** | The plugin's chrome disappears when you don't need it; content fills the view. |
| 3 | **Keyboard parity** | Every pointer action has an equivalent keyboard shortcut. |
| 4 | **Progressive disclosure** | Advanced options hide until invoked; the default state is clean. |
| 5 | **Responsive inside the leaf** | Panels reflow at any leaf width, including narrow side-by-side splits. |

---

## 1. Theme Adaptability

### 1.1 Colour Tokens (mandatory)

All colours **must** reference Obsidian's CSS custom properties. Hard-coded hex/rgb values are **forbidden** except for transparent/inherit/currentColor.

| Purpose | CSS Variable |
|---------|-------------|
| Primary background | `var(--background-primary)` |
| Secondary background | `var(--background-secondary)` |
| Modifier background | `var(--background-modifier-border)` |
| Primary text | `var(--text-normal)` |
| Muted / secondary text | `var(--text-muted)` |
| Accent (highlights, active states) | `var(--color-accent)` |
| Destructive actions | `var(--color-red)` |
| Success / save actions | `var(--color-green)` |
| Interactive hover | `var(--background-modifier-hover)` |
| Interactive active | `var(--background-modifier-active-hover)` |
| Input borders | `var(--input-border-color)` |
| Modal background | `var(--background-primary)` |

### 1.2 Typography

- Font family: `var(--font-interface)` for UI chrome, `var(--font-text)` for document content.  
- Font size: `var(--font-ui-small)` (toolbar labels), `var(--font-ui-medium)` (body), `var(--font-ui-large)` (headings).  
- Never set font-size in `px`; use `em` or the CSS vars above.

### 1.3 Spacing & Radius

- Use `var(--size-4-1)` … `var(--size-4-8)` for padding/margin steps (4 px grid).  
- Border radius: `var(--radius-s)` for small chips, `var(--radius-m)` for panels/modals.  
- Shadows: `var(--shadow-s)` / `var(--shadow-l)` only.

### 1.4 Dark/Light Mode

- Never use `prefers-color-scheme` media queries — Obsidian handles this via `.theme-dark` / `.theme-light` body classes.  
- Verify every component against the default Light, default Dark, and at least one community theme (e.g. Minimal, AnuPpuccin).

---

## 2. Toolbar

### 2.1 Anatomy

```
┌─────────────────────────────────────────────────────────┐
│ [Tool group] │ [Zoom group] │ [Action group] │ [Settings]│
└─────────────────────────────────────────────────────────┘
```

- Groups are visually separated by `via-toolbar-sep` (1 px divider, `var(--background-modifier-border)`).  
- Each button is `32 × 32 px` minimum hit area (WCAG 2.5.5).  
- Active tool is shown with `var(--color-accent)` background, not just an outline.

### 2.2 Location

The toolbar position is **user-configurable** via plugin settings:

| Option | Description |
|--------|-------------|
| `top` (default) | Horizontal bar pinned to the top of the leaf |
| `bottom` | Horizontal bar pinned to the bottom |
| `left` | Vertical bar pinned to the left edge |
| `right` | Vertical bar pinned to the right edge |
| `floating` | Draggable floating panel; position persisted per file-type |

Orientation (`horizontal` / `vertical`) auto-adjusts to the chosen edge.

### 2.3 Customisation

- Users can **show/hide individual tool groups** in settings (e.g. hide annotation tools when only reading).  
- Toolbar can be **toggled hidden** with a keyboard shortcut (`Ctrl/Cmd + Shift + T`); a thin grab-bar remains so it can be shown again.  
- Icon vs. icon+label display controlled by settings (`compact` / `labeled`).

---

## 3. PDF Viewer Tools

### 3.1 Annotation Tools

| Tool | Icon | Shortcut | Behaviour |
|------|------|----------|-----------|
| View / select | 👁 | `V` | Pan only; pointer events pass through |
| Pen | ✏️ | `P` | Freehand stroke, configurable colour + width |
| Highlighter | 🖊 | `H` | Semi-transparent fill (`globalAlpha 0.35`), wide width |
| Eraser | ⬜ | `E` | Composite `destination-out`; size controlled by width slider |
| Text note | `T` | `N` | Inline text box anchored to PDF coordinates |
| Shape snap | ▭ | `S` | Detects near-rectangle/circle gesture; snaps to perfect shape |

### 3.2 Colour Picker

- **Swatch row** (quick access): 6 pre-defined swatches + 1 custom slot.  
- **Full picker**: native `<input type="color">` popover on long-press / right-click swatch.  
- Last-used colour persisted per tool type (pen colour ≠ highlighter colour).  
- Colour stored as 6-digit hex in annotation JSON; display adapts to theme.

### 3.3 Width / Opacity Editor

- Displayed as a **slider** inside the toolbar (expands inline when the width button is active).  
- Range: `1–20 px` for pen/eraser; `10–40 px` for highlighter.  
- Opacity: `0.1–1.0` for highlighter (independent of colour alpha).  
- Last-used width persisted per tool type.

### 3.4 Zoom Controls

| Control | Behaviour |
|---------|-----------|
| `−` / `+` buttons | Step through snap levels: 25 50 75 **100** 125 150 200 300 400 % |
| Percentage label | Click to reset to 100%; scroll wheel over label to fine-adjust |
| `Ctrl/Cmd + scroll` | Smooth zoom centred on pointer position |
| `Ctrl/Cmd + 0` | Reset to 100% |
| `Ctrl/Cmd + =/-` | Keyboard step zoom |

Zoom is applied **per-leaf**; annotation coordinates are stored normalised (0–1) so they survive zoom changes.

### 3.5 Page Navigation

- Page indicator (`N / Total`) displayed in the toolbar; click to jump.  
- Arrow keys navigate pages when the view is focused and no annotation tool is active.  
- Smooth scroll within a page; snap to page boundary on keyboard nav.

### 3.6 PDF Snap

- **Snap grid**: optional 12×16 grid overlay, toggled via toolbar; grid opacity configurable.  
- **Shape snap**: when a drawn path's bounding box is within 10° of horizontal/vertical and aspect ratio within 10% of 1:1, 2:1, or √2:1 — offer to snap.  
- Snap behaviour is opt-in per session; remembered in settings.

---

## 4. DOCX Editor Tools

### 4.1 Formatting Toolbar (Edit mode only)

Groups (left → right):

1. **Text style**: Bold `B`, Italic `I`, Underline `U`, Strikethrough `S`  
2. **Headings**: `H1` `H2` `H3` dropdown  
3. **Lists**: Unordered, Ordered, Indent, Outdent  
4. **Alignment**: Left, Centre, Right, Justify  
5. **Insert**: Link, Image (from vault), Horizontal rule  
6. **Edit controls**: `✏️ Edit / 👁 View` toggle, `💾 Save` button

Toolbar is **hidden in View mode** to maximise reading space.

### 4.2 Save Warning Modal

- Shown once per session (not every save) unless the user dismisses with "Don't show again".  
- Copy: *"DOCX is saved via re-serialisation. Custom styles, tracked changes, and macros will be removed."*  
- Actions: **Save anyway**, **Cancel**, **Don't show again this session**.

### 4.3 Edit Mode Visual Cue

- A thin `var(--color-accent)` top-border on the scroll area indicates edit mode is active.  
- The leaf tab title gains an asterisk `*` prefix when there are unsaved changes.

---

## 5. Loading & Error States

### 5.1 Loading

- Full-area spinner centred in the scroll region (not blocking the toolbar).  
- Copy: `"Loading…"` — never show a file path or technical detail during loading.  
- Minimum display time: 200 ms (prevents flash for fast files).

### 5.2 Errors

- Error message inline in the content area (never a native alert).  
- Friendly copy + technical detail in a collapsible `<details>` element.  
- Provide an actionable suggestion: *"Try reopening the file, or check if it's valid."*

### 5.3 Empty State

- When no file is open: show plugin name + version, with a hint: *"Click any .pdf or .docx file in the Explorer to open it here."*

---

## 6. Accessibility

| Requirement | Standard |
|-------------|----------|
| Colour contrast | WCAG AA (4.5:1 text, 3:1 UI components) |
| Focus visible | All interactive elements have a `2 px` `var(--color-accent)` focus ring |
| Screen reader | `aria-label` on all icon-only buttons; live regions for save/error notices |
| Keyboard navigation | Full `Tab` order; no keyboard trap except modals (Esc closes) |
| Pointer target size | Minimum 32 × 32 px (WCAG 2.5.5) |
| Motion | Respect `prefers-reduced-motion`; disable spinner animation if set |

---

## 7. CSS Class Naming Conventions

All classes **must** be prefixed with `via-` to prevent collisions with Obsidian or other plugins.

| Pattern | Example | Usage |
|---------|---------|-------|
| `via-{component}` | `via-pdf-wrapper` | Root component containers |
| `via-{component}-{element}` | `via-pdf-toolbar` | Sub-elements of a component |
| `via-{modifier}` | `via-btn-active` | State/modifier classes |
| `via-btn` | — | All toolbar buttons (shared base) |
| `via-btn-{variant}` | `via-btn-save` | Button variants |

Never use `!important`. Specificity must be manageable — max two class selectors deep.

---

## 8. Animation & Motion

- Transitions: `150 ms ease` for hover/focus state changes.  
- Page renders: no transition (instant swap prevents layout thrash).  
- Modals: `200 ms ease-out` slide-in from top.  
- Spinner: CSS `animation: via-spin 1s linear infinite` — paused when `prefers-reduced-motion: reduce`.

---

## 9. Settings Panel Standards

- Each setting group has a `<h3>` heading and a horizontal rule separator.  
- Setting descriptions are concise (≤ 2 sentences); link to docs for more.  
- Destructive settings (e.g. "Clear all annotations") are in a separate **Danger Zone** group at the bottom, styled with `var(--color-red)` border.  
- Settings changes take effect immediately without requiring a reload unless unavoidable.

---

## 10. Versioning & Changelog

- `manifest.json` version bumped on every user-visible change.  
- Format: `0.MINOR.PATCH` during pre-release; `MAJOR.MINOR.PATCH` post-release.  
- `CHANGELOG.md` kept at project root; entries grouped by `[Unreleased]`, `[x.y.z]`.

---

*Last updated: 2026-03-11 | Maintained by ROOCKY.dev*
