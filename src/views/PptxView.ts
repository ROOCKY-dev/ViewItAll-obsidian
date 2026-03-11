import { FileView, TFile, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { VIEW_TYPE_PPTX } from '../types';
import type ViewItAllPlugin from '../main';

/** Minimal JSZip type surface used by this view. */
interface JSZipObject {
	async(type: 'string'): Promise<string>;
	async(type: 'uint8array'): Promise<Uint8Array>;
	async(type: 'arraybuffer'): Promise<ArrayBuffer>;
	async(type: 'base64'): Promise<string>;
}

interface JSZipInstance {
	file(path: string): JSZipObject | null;
	file(regex: RegExp): { name: string }[];
	loadAsync(data: ArrayBuffer | Uint8Array): Promise<JSZipInstance>;
}

interface JSZipConstructor {
	new(): JSZipInstance;
	loadAsync(data: ArrayBuffer | Uint8Array): Promise<JSZipInstance>;
}

/** Run-level text data with formatting. */
interface RunData {
	text: string;
	bold: boolean;
	italic: boolean;
}

/** A paragraph within a shape. */
interface ParagraphData {
	runs: RunData[];
	isBullet: boolean;
}

/** A shape extracted from a slide. */
interface ShapeData {
	type: 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'other';
	paragraphs: ParagraphData[];
}

/** Parsed slide data. */
interface SlideData {
	index: number;
	shapes: ShapeData[];
	imageDataUrls: string[];
}

export class PptxView extends FileView {
	private plugin: ViewItAllPlugin;
	private currentFile: TFile | null = null;
	private slides: SlideData[] = [];
	private activeSlide = 0;

	// Zoom & panel state
	private zoomLevel = 1.0;
	private stripVisible = true;
	private isFullscreen = false;
	private readonly ZOOM_STEP = 0.2;
	private readonly ZOOM_MIN = 0.3;
	private readonly ZOOM_MAX = 2.0;

	// DOM refs
	private wrapper: HTMLElement | null = null;
	private slideContainer: HTMLElement | null = null;
	private slideStrip: HTMLElement | null = null;
	private slideCounter: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ViewItAllPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_PPTX; }
	getDisplayText(): string { return this.file?.basename ?? 'Presentation'; }
	getIcon(): string { return 'presentation'; }

	canAcceptExtension(extension: string): boolean {
		return extension === 'pptx' && this.plugin.settings.enablePptx;
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.currentFile = file;
		this.activeSlide = 0;
		this.slides = [];
		await this.renderFile(file);
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
		this.slides = [];
		this.wrapper = null;
		this.slideContainer = null;
		this.slideStrip = null;
		this.slideCounter = null;
		this.currentFile = null;
		this.zoomLevel = 1.0;
		this.stripVisible = true;
		this.isFullscreen = false;
	}

	private async renderFile(file: TFile): Promise<void> {
		this.contentEl.empty();

		const isBottom = this.plugin.settings.pptxToolbarPosition === 'bottom';

		// Read file
		let data: ArrayBuffer;
		try {
			data = await this.app.vault.adapter.readBinary(file.path);
		} catch (err) {
			this.contentEl.createEl('p', {
				cls: 'via-error',
				text: `Failed to read file: ${String(err)}`,
			});
			return;
		}

		// Show loading
		const loading = this.contentEl.createEl('div', { cls: 'via-pdf-loading' });
		loading.createEl('div', { cls: 'via-pdf-loading-spinner' });
		loading.createEl('span', { text: 'Parsing presentation...' });

		// Lazy-load JSZip + parse
		try {
			const JSZip = ((await import('jszip')) as unknown as { default: JSZipConstructor }).default;
			const zip = await JSZip.loadAsync(data);
			this.slides = await this.parseSlides(zip);
		} catch (err) {
			loading.remove();
			this.contentEl.createEl('p', {
				cls: 'via-error',
				text: `Failed to parse PPTX: ${String(err)}`,
			});
			return;
		}

		loading.remove();

		if (this.slides.length === 0) {
			this.contentEl.createEl('p', {
				cls: 'via-sheet-empty',
				text: 'This presentation has no slides.',
			});
			return;
		}

		// Wrapper
		this.wrapper = this.contentEl.createEl('div', { cls: 'via-pptx-wrapper' });
		if (isBottom) this.wrapper.classList.add('via-pptx-wrapper--toolbar-bottom');

		// Toolbar
		const toolbar = this.wrapper.createEl('div', { cls: 'via-pptx-toolbar' });

		// Strip panel toggle
		const stripToggle = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(stripToggle, 'panel-left');
		setTooltip(stripToggle, 'Toggle slide panel');
		if (this.stripVisible) stripToggle.classList.add('is-active');
		stripToggle.addEventListener('click', () => {
			this.stripVisible = !this.stripVisible;
			this.slideStrip?.classList.toggle('is-hidden', !this.stripVisible);
			stripToggle.classList.toggle('is-active', this.stripVisible);
		});

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// First slide
		const firstBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(firstBtn, 'chevrons-left');
		setTooltip(firstBtn, 'First slide');
		firstBtn.addEventListener('click', () => this.goToSlide(0));

		// Prev
		const prevBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(prevBtn, 'chevron-left');
		setTooltip(prevBtn, 'Previous slide');
		prevBtn.addEventListener('click', () => this.goToSlide(this.activeSlide - 1));

		// Slide counter
		this.slideCounter = toolbar.createEl('div', { cls: 'via-pptx-counter' });
		this.updateCounter();

		// Next
		const nextBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(nextBtn, 'chevron-right');
		setTooltip(nextBtn, 'Next slide');
		nextBtn.addEventListener('click', () => this.goToSlide(this.activeSlide + 1));

		// Last slide
		const lastBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(lastBtn, 'chevrons-right');
		setTooltip(lastBtn, 'Last slide');
		lastBtn.addEventListener('click', () => this.goToSlide(this.slides.length - 1));

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// File info
		const fileLabel = toolbar.createEl('div', { cls: 'via-pptx-file-label' });
		const fileIcon = fileLabel.createEl('div', { cls: 'clickable-icon' });
		setIcon(fileIcon, 'presentation');
		fileLabel.createEl('span', {
			text: file.basename,
			cls: 'via-pptx-file-name',
		});

		toolbar.createEl('div', { cls: 'via-toolbar-spacer' });

		// Slide count info
		toolbar.createEl('div', {
			cls: 'via-pptx-info',
			text: `${this.slides.length} slides`,
		});

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// Fullscreen toggle
		const fullscreenBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(fullscreenBtn, 'expand');
		setTooltip(fullscreenBtn, 'Fullscreen slide');
		fullscreenBtn.addEventListener('click', () => {
			this.isFullscreen = !this.isFullscreen;
			this.wrapper?.classList.toggle('via-pptx-fullscreen', this.isFullscreen);
			this.slideStrip?.classList.toggle('is-hidden', this.isFullscreen || !this.stripVisible);
			setIcon(fullscreenBtn, this.isFullscreen ? 'shrink' : 'expand');
			setTooltip(fullscreenBtn, this.isFullscreen ? 'Exit fullscreen' : 'Fullscreen slide');
			fullscreenBtn.classList.toggle('is-active', this.isFullscreen);
		});

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// Zoom out
		const zoomOutBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(zoomOutBtn, 'zoom-out');
		setTooltip(zoomOutBtn, 'Zoom out');
		zoomOutBtn.addEventListener('click', () => {
			this.zoomLevel = Math.max(this.ZOOM_MIN, this.zoomLevel - this.ZOOM_STEP);
			this.applyZoom();
		});

		// Zoom reset
		const zoomResetBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(zoomResetBtn, 'maximize-2');
		setTooltip(zoomResetBtn, 'Reset zoom');
		zoomResetBtn.addEventListener('click', () => {
			this.zoomLevel = 1.0;
			this.applyZoom();
		});

		// Zoom in
		const zoomInBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(zoomInBtn, 'zoom-in');
		setTooltip(zoomInBtn, 'Zoom in');
		zoomInBtn.addEventListener('click', () => {
			this.zoomLevel = Math.min(this.ZOOM_MAX, this.zoomLevel + this.ZOOM_STEP);
			this.applyZoom();
		});

		// Body: slide strip + main slide
		const body = this.wrapper.createEl('div', { cls: 'via-pptx-body' });

		// Slide strip (thumbnail sidebar)
		this.slideStrip = body.createEl('div', { cls: 'via-pptx-strip' });
		this.renderStrip();

		// Main slide area
		const scrollEl = body.createEl('div', { cls: 'via-pptx-scroll' });
		this.slideContainer = scrollEl.createEl('div', { cls: 'via-pptx-slide' });
		this.renderSlide();

		// Keyboard navigation
		this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				e.preventDefault();
				this.goToSlide(this.activeSlide + 1);
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
				e.preventDefault();
				this.goToSlide(this.activeSlide - 1);
			} else if (e.key === 'Home') {
				e.preventDefault();
				this.goToSlide(0);
			} else if (e.key === 'End') {
				e.preventDefault();
				this.goToSlide(this.slides.length - 1);
			}
		});
		// Make focusable for keyboard events
		this.contentEl.tabIndex = 0;
	}

	private applyZoom(): void {
		if (!this.slideContainer) return;
		this.slideContainer.style.transform = `scale(${this.zoomLevel})`;
	}

	private goToSlide(index: number): void {
		if (index < 0 || index >= this.slides.length) return;
		this.activeSlide = index;
		this.renderSlide();
		this.updateCounter();
		this.updateStripActive();
		// Scroll strip thumbnail into view
		const thumb = this.slideStrip?.children[index] as HTMLElement | undefined;
		if (thumb) thumb.scrollIntoView({ block: 'nearest' });
	}

	private updateCounter(): void {
		if (!this.slideCounter) return;
		this.slideCounter.textContent = `${this.activeSlide + 1} / ${this.slides.length}`;
	}

	private renderStrip(): void {
		if (!this.slideStrip) return;
		this.slideStrip.empty();

		for (let i = 0; i < this.slides.length; i++) {
			const thumb = this.slideStrip.createEl('div', { cls: 'via-pptx-thumb' });
			if (i === this.activeSlide) thumb.classList.add('is-active');

			const numEl = thumb.createEl('div', { cls: 'via-pptx-thumb-num' });
			numEl.textContent = String(i + 1);

			const preview = thumb.createEl('div', { cls: 'via-pptx-thumb-preview' });
			// Show first meaningful text as mini preview
			const slide = this.slides[i];
			const firstText = this.getSlidePreviewText(slide);
			preview.createEl('span', {
				text: firstText.slice(0, 60) + (firstText.length > 60 ? '…' : ''),
			});

			thumb.addEventListener('click', () => this.goToSlide(i));
		}
	}

	/** Get a short text preview for the strip thumbnail. */
	private getSlidePreviewText(slide: SlideData | undefined): string {
		if (!slide) return '';
		for (const shape of slide.shapes) {
			for (const para of shape.paragraphs) {
				const text = para.runs.map(r => r.text).join('');
				if (text.trim()) return text;
			}
		}
		return '';
	}

	private updateStripActive(): void {
		if (!this.slideStrip) return;
		const thumbs = this.slideStrip.children;
		for (let i = 0; i < thumbs.length; i++) {
			const el = thumbs[i];
			if (el) el.classList.toggle('is-active', i === this.activeSlide);
		}
	}

	private renderSlide(): void {
		if (!this.slideContainer) return;
		this.slideContainer.empty();

		const slide = this.slides[this.activeSlide];
		if (!slide) return;

		// Images
		for (const dataUrl of slide.imageDataUrls) {
			this.slideContainer.createEl('img', {
				cls: 'via-pptx-slide-img',
				attr: { src: dataUrl },
			});
		}

		// Shapes — ordered by type priority: title/ctrTitle first, then subtitle, then body, then other
		const typeOrder: Record<string, number> = { ctrTitle: 0, title: 1, subTitle: 2, body: 3, other: 4 };
		const sorted = [...slide.shapes].sort(
			(a, b) => (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4)
		);

		for (const shape of sorted) {
			const hasContent = shape.paragraphs.some(p => p.runs.some(r => r.text.trim()));
			if (!hasContent) continue;

			const shapeEl = this.slideContainer.createEl('div', { cls: `via-pptx-shape via-pptx-shape--${shape.type}` });

			// Check if the entire shape is a bullet list
			const isList = shape.paragraphs.length > 1 && shape.paragraphs.some(p => p.isBullet);

			if (isList) {
				// Render as a list: non-bullet paragraphs as regular text, bullet items as <li>
				let currentList: HTMLElement | null = null;
				for (const para of shape.paragraphs) {
					const text = para.runs.map(r => r.text).join('');
					if (!text.trim()) {
						currentList = null;
						continue;
					}
					if (para.isBullet) {
						if (!currentList) {
							currentList = shapeEl.createEl('ul', { cls: 'via-pptx-list' });
						}
						const li = currentList.createEl('li');
						this.renderRuns(li, para.runs);
					} else {
						currentList = null;
						const p = shapeEl.createEl('p');
						this.renderRuns(p, para.runs);
					}
				}
			} else {
				// Render paragraphs as <p> elements
				for (const para of shape.paragraphs) {
					const text = para.runs.map(r => r.text).join('');
					if (!text.trim()) continue;
					const p = shapeEl.createEl('p');
					this.renderRuns(p, para.runs);
				}
			}
		}

		if (slide.shapes.length === 0 && slide.imageDataUrls.length === 0) {
			this.slideContainer.createEl('div', {
				cls: 'via-pptx-slide-empty',
				text: '(empty slide)',
			});
		}
	}

	/** Render formatted runs into a container element. */
	private renderRuns(container: HTMLElement, runs: RunData[]): void {
		for (const run of runs) {
			if (!run.text) continue;
			if (run.bold && run.italic) {
				const b = container.createEl('strong');
				b.createEl('em', { text: run.text });
			} else if (run.bold) {
				container.createEl('strong', { text: run.text });
			} else if (run.italic) {
				container.createEl('em', { text: run.text });
			} else {
				container.appendText(run.text);
			}
		}
	}

	// ── PPTX Parsing ──────────────────────────────────────────────────────

	private async parseSlides(zip: JSZipInstance): Promise<SlideData[]> {
		// Discover slide files (ppt/slides/slide1.xml, slide2.xml, ...)
		const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/)
			.map(f => f.name)
			.sort((a, b) => {
				const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10);
				const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10);
				return numA - numB;
			});

		const slides: SlideData[] = [];

		for (let i = 0; i < slideFiles.length; i++) {
			const slideFile = slideFiles[i];
			if (!slideFile) continue;
			const slideXml = await this.readZipFile(zip, slideFile);
			if (!slideXml) {
				slides.push({ index: i + 1, shapes: [], imageDataUrls: [] });
				continue;
			}

			const shapes = this.extractShapes(slideXml);
			const imageDataUrls = await this.extractImages(zip, slideFile);

			slides.push({ index: i + 1, shapes, imageDataUrls });
		}

		return slides;
	}

	private async readZipFile(zip: JSZipInstance, path: string): Promise<string | null> {
		const entry = zip.file(path);
		if (!entry) return null;
		return entry.async('string');
	}

	/** Extract shapes with full text structure from slide XML. */
	private extractShapes(xml: string): ShapeData[] {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, 'application/xml');

		const shapes: ShapeData[] = [];
		const spElements = doc.getElementsByTagName('p:sp');

		for (let s = 0; s < spElements.length; s++) {
			const sp = spElements[s];
			if (!sp) continue;

			// Detect shape type from placeholder attribute
			const shapeType = this.detectShapeType(sp);

			// Get text body
			const txBody = sp.getElementsByTagName('p:txBody');
			if (txBody.length === 0) continue;
			const body = txBody[0];
			if (!body) continue;

			// Extract paragraphs
			const paragraphs: ParagraphData[] = [];
			const pElements = body.getElementsByTagName('a:p');

			for (let p = 0; p < pElements.length; p++) {
				const pEl = pElements[p];
				if (!pEl) continue;

				// Only process direct <a:p> children of this txBody (not nested)
				if (pEl.parentNode !== body) continue;

				const isBullet = this.detectBullet(pEl);
				const runs = this.extractRuns(pEl);

				paragraphs.push({ runs, isBullet });
			}

			if (paragraphs.length > 0) {
				shapes.push({ type: shapeType, paragraphs });
			}
		}

		return shapes;
	}

	/** Detect shape type from <p:ph> placeholder attributes. */
	private detectShapeType(sp: Element): ShapeData['type'] {
		const phElements = sp.getElementsByTagName('p:ph');
		if (phElements.length === 0) return 'other';
		const ph = phElements[0];
		if (!ph) return 'other';
		const type = ph.getAttribute('type') ?? '';
		if (type === 'title') return 'title';
		if (type === 'ctrTitle') return 'ctrTitle';
		if (type === 'subTitle') return 'subTitle';
		if (type === 'body') return 'body';
		return 'other';
	}

	/** Detect if a paragraph has bullet markers. */
	private detectBullet(pEl: Element): boolean {
		const pPr = pEl.getElementsByTagName('a:pPr');
		if (pPr.length === 0) return false;
		const props = pPr[0];
		if (!props) return false;

		// Has explicit bullet characters or auto-numbered bullets
		if (props.getElementsByTagName('a:buChar').length > 0) return true;
		if (props.getElementsByTagName('a:buAutoNum').length > 0) return true;
		// Has indent level but no explicit "no bullet" — treat as bullet
		const lvl = props.getAttribute('lvl');
		if (lvl && parseInt(lvl, 10) > 0 && props.getElementsByTagName('a:buNone').length === 0) return true;

		return false;
	}

	/** Extract runs with formatting from a paragraph element. */
	private extractRuns(pEl: Element): RunData[] {
		const runs: RunData[] = [];

		for (let i = 0; i < pEl.childNodes.length; i++) {
			const child = pEl.childNodes[i];
			if (!child) continue;

			// <a:r> run elements
			if (child.nodeName === 'a:r') {
				const rEl = child as Element;
				let bold = false;
				let italic = false;

				// Check <a:rPr> for formatting
				const rPr = rEl.getElementsByTagName('a:rPr');
				if (rPr.length > 0 && rPr[0]) {
					bold = rPr[0].getAttribute('b') === '1';
					italic = rPr[0].getAttribute('i') === '1';
				}

				// Get text from <a:t>
				const tEls = rEl.getElementsByTagName('a:t');
				for (let t = 0; t < tEls.length; t++) {
					const tEl = tEls[t];
					if (!tEl) continue;
					const text = tEl.textContent ?? '';
					if (text) runs.push({ text, bold, italic });
				}
			}

			// <a:fld> field elements (slide numbers, dates, etc.)
			if (child.nodeName === 'a:fld') {
				const fEl = child as Element;
				const tEls = fEl.getElementsByTagName('a:t');
				for (let t = 0; t < tEls.length; t++) {
					const tEl = tEls[t];
					if (!tEl) continue;
					const text = tEl.textContent ?? '';
					if (text) runs.push({ text, bold: false, italic: false });
				}
			}
		}

		return runs;
	}

	/** Extract images referenced in a slide's relationship file. */
	private async extractImages(zip: JSZipInstance, slidePath: string): Promise<string[]> {
		// slidePath: "ppt/slides/slide1.xml"
		// Rels file: "ppt/slides/_rels/slide1.xml.rels"
		const slideFilename = slidePath.split('/').pop() ?? '';
		const relsPath = `ppt/slides/_rels/${slideFilename}.rels`;

		const relsXml = await this.readZipFile(zip, relsPath);
		if (!relsXml) return [];

		const parser = new DOMParser();
		const doc = parser.parseFromString(relsXml, 'application/xml');
		const rels = doc.getElementsByTagName('Relationship');

		const dataUrls: string[] = [];

		for (let i = 0; i < rels.length; i++) {
			const rel = rels[i];
			if (!rel) continue;
			const type = rel.getAttribute('Type') ?? '';
			const target = rel.getAttribute('Target') ?? '';

			// Image relationship type
			if (!type.includes('/image')) continue;

			// Resolve path relative to ppt/slides/
			const imagePath = this.resolvePath('ppt/slides/', target);
			const imageEntry = zip.file(imagePath);
			if (!imageEntry) continue;

			try {
				const imgData = await imageEntry.async('base64');
				const ext = imagePath.split('.').pop()?.toLowerCase() ?? 'png';
				const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
					: ext === 'png' ? 'image/png'
					: ext === 'gif' ? 'image/gif'
					: ext === 'svg' ? 'image/svg+xml'
					: ext === 'webp' ? 'image/webp'
					: 'image/png';
				dataUrls.push(`data:${mime};base64,${imgData}`);
			} catch {
				// Skip unreadable images
			}
		}

		return dataUrls;
	}

	/** Resolve a relative path (with ../) against a base directory. */
	private resolvePath(base: string, relative: string): string {
		const baseParts = base.replace(/\/$/, '').split('/');
		const relParts = relative.split('/');

		for (const part of relParts) {
			if (part === '..') {
				baseParts.pop();
			} else if (part !== '.') {
				baseParts.push(part);
			}
		}

		return baseParts.join('/');
	}
}
