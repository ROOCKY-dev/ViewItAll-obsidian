import { FileView, Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { VIEW_TYPE_SPREADSHEET } from '../types';
import type ViewItAllPlugin from '../main';

// ── SheetJS type surface ──────────────────────────────────────────────────────

type CellValue = string | number | boolean | null | undefined;

interface XLSXCell {
	v?: CellValue;  // primitive value
	f?: string;     // formula (without leading '=')
	t?: string;     // type: 'n' | 's' | 'b' | 'e' | 'z'
	w?: string;     // formatted text
}

/**
 * Opaque sheet record: cell refs like "A1" map to XLSXCell,
 * and special keys "!ref", "!cols", etc. map to metadata.
 */
type XLSXSheet = Record<string, unknown>;

interface XLSXWorkBook {
	SheetNames: string[];
	Sheets: Record<string, XLSXSheet>;
}

interface SheetRange {
	s: { r: number; c: number };
	e: { r: number; c: number };
}

interface XLSXModule {
	read(data: Uint8Array | ArrayBuffer, opts: { type: 'array' }): XLSXWorkBook;
	write(wb: XLSXWorkBook, opts: { type: 'array'; bookType: string }): Uint8Array;
	utils: {
		encode_cell(addr: { r: number; c: number }): string;
		decode_cell(addr: string): { r: number; c: number };
		encode_range(range: SheetRange): string;
		decode_range(range: string): SheetRange;
	};
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function sheetGetRef(sheet: XLSXSheet): string | undefined {
	return sheet['!ref'] as string | undefined;
}

function sheetSetRef(sheet: XLSXSheet, ref: string): void {
	(sheet as Record<string, unknown>)['!ref'] = ref;
}

function sheetGetCell(sheet: XLSXSheet, ref: string): XLSXCell | undefined {
	return sheet[ref] as XLSXCell | undefined;
}

function sheetSetCell(sheet: XLSXSheet, ref: string, cell: XLSXCell): void {
	(sheet as Record<string, unknown>)[ref] = cell;
}

// ── View ──────────────────────────────────────────────────────────────────────

export class SpreadsheetView extends FileView {
	private plugin: ViewItAllPlugin;
	private currentFile: TFile | null = null;
	private workbook: XLSXWorkBook | null = null;
	private xlsx: XLSXModule | null = null;
	private activeSheet = 0;
	private isDirty = false;

	// Selection
	private selRow = -1;
	private selCol = -1;

	// DOM refs
	private wrapper: HTMLElement | null = null;
	private tabBar: HTMLElement | null = null;
	private tableContainer: HTMLElement | null = null;
	private formulaRef: HTMLElement | null = null;
	private formulaInput: HTMLInputElement | null = null;
	private saveBtn: HTMLElement | null = null;
	private infoEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ViewItAllPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_SPREADSHEET; }
	getDisplayText(): string { return this.file?.basename ?? 'Spreadsheet'; }
	getIcon(): string { return 'table'; }

	canAcceptExtension(extension: string): boolean {
		if (extension === 'xlsx') return this.plugin.settings.enableXlsx;
		if (extension === 'csv') return this.plugin.settings.enableCsv;
		return false;
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.currentFile = file;
		this.activeSheet = 0;
		this.isDirty = false;
		this.selRow = -1;
		this.selCol = -1;

		if (!this.xlsx) {
			this.xlsx = (await import('xlsx')) as unknown as XLSXModule;
		}
		await this.renderFile(file);
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
		this.workbook = null;
		this.wrapper = null;
		this.tabBar = null;
		this.tableContainer = null;
		this.formulaRef = null;
		this.formulaInput = null;
		this.saveBtn = null;
		this.infoEl = null;
		this.currentFile = null;
	}

	// ── Render ────────────────────────────────────────────────────────────────

	private async renderFile(file: TFile): Promise<void> {
		this.contentEl.empty();
		if (!this.xlsx) return;

		const isBottom = this.plugin.settings.spreadsheetToolbarPosition === 'bottom';
		const isCsv = file.extension === 'csv';

		// Read raw bytes
		let data: ArrayBuffer;
		try {
			data = await this.app.vault.adapter.readBinary(file.path);
		} catch (err) {
			this.contentEl.createEl('p', { cls: 'via-error', text: `Failed to read file: ${String(err)}` });
			return;
		}

		// Parse workbook
		try {
			this.workbook = this.xlsx.read(new Uint8Array(data), { type: 'array' });
		} catch (err) {
			this.contentEl.createEl('p', { cls: 'via-error', text: `Failed to parse spreadsheet: ${String(err)}` });
			return;
		}

		// Root wrapper
		this.wrapper = this.contentEl.createEl('div', { cls: 'via-sheet-wrapper' });
		if (isBottom) this.wrapper.classList.add('via-sheet-wrapper--toolbar-bottom');

		// ── Toolbar ───────────────────────────────────────────────────────────
		const toolbar = this.wrapper.createEl('div', { cls: 'via-sheet-toolbar' });

		// File label
		const fileLabel = toolbar.createEl('div', { cls: 'via-sheet-file-label' });
		setIcon(fileLabel.createEl('div', { cls: 'clickable-icon' }), isCsv ? 'file-text' : 'table');
		fileLabel.createEl('span', { text: file.basename, cls: 'via-sheet-file-name' });

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// Sheet tabs (multi-sheet xlsx)
		this.tabBar = toolbar.createEl('div', { cls: 'via-sheet-tabs' });
		if (!isCsv && this.workbook.SheetNames.length > 1) {
			this.renderTabs();
		}

		toolbar.createEl('div', { cls: 'via-toolbar-spacer' });

		// Add Row
		const addRowBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(addRowBtn, 'plus-square');
		setTooltip(addRowBtn, 'Add row at bottom');
		addRowBtn.addEventListener('click', () => this.addRow());

		// Add Column
		const addColBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(addColBtn, 'between-vertical-start');
		setTooltip(addColBtn, 'Add column at right');
		addColBtn.addEventListener('click', () => this.addColumn());

		toolbar.createEl('div', { cls: 'via-toolbar-sep' });

		// Save button
		this.saveBtn = toolbar.createEl('div', { cls: 'clickable-icon' });
		setIcon(this.saveBtn, 'save');
		setTooltip(this.saveBtn, 'Save  (Ctrl+S)');
		this.saveBtn.addEventListener('click', () => this.saveFile());

		// Row × Col info
		this.infoEl = toolbar.createEl('div', { cls: 'via-sheet-info' });
		this.updateInfo();

		// ── Formula bar ───────────────────────────────────────────────────────
		const fbar = this.wrapper.createEl('div', { cls: 'via-sheet-formula-bar' });
		this.formulaRef = fbar.createEl('div', { cls: 'via-sheet-formula-ref' });
		fbar.createEl('div', { cls: 'via-sheet-formula-sep' });
		this.formulaInput = fbar.createEl('input', {
			cls: 'via-sheet-formula-input',
			type: 'text',
			placeholder: 'Select a cell to edit…',
		});
		this.formulaInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); this.commitFormulaBar(); }
			if (e.key === 'Escape') { e.preventDefault(); this.refreshFormulaBar(); this.formulaInput?.blur(); }
		});

		// Ctrl/Cmd+S — save
		this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				void this.saveFile();
			}
		});
		this.contentEl.tabIndex = 0;

		// ── Scroll + table ────────────────────────────────────────────────────
		const scrollEl = this.wrapper.createEl('div', { cls: 'via-sheet-scroll' });
		this.tableContainer = scrollEl.createEl('div', { cls: 'via-sheet-table-wrap' });
		this.renderSheet();
	}

	private renderTabs(): void {
		if (!this.tabBar || !this.workbook) return;
		this.tabBar.empty();
		for (let i = 0; i < this.workbook.SheetNames.length; i++) {
			const name = this.workbook.SheetNames[i] ?? `Sheet ${i + 1}`;
			const tab = this.tabBar.createEl('div', { cls: 'via-sheet-tab', text: name });
			if (i === this.activeSheet) tab.classList.add('is-active');
			setTooltip(tab, name);
			tab.addEventListener('click', () => {
				if (i === this.activeSheet) return;
				this.activeSheet = i;
				this.selRow = -1;
				this.selCol = -1;
				this.renderTabs();
				this.renderSheet();
				this.updateInfo();
				this.refreshFormulaBar();
			});
		}
	}

	private renderSheet(): void {
		if (!this.tableContainer || !this.workbook || !this.xlsx) return;
		this.tableContainer.empty();

		const sheetName = this.workbook.SheetNames[this.activeSheet];
		if (!sheetName) return;
		const sheet = this.workbook.Sheets[sheetName];
		if (!sheet) {
			this.tableContainer.createEl('p', { cls: 'via-sheet-empty', text: 'This sheet is empty.' });
			return;
		}

		const ref = sheetGetRef(sheet);
		if (!ref) {
			this.tableContainer.createEl('p', { cls: 'via-sheet-empty', text: 'This sheet is empty.' });
			return;
		}

		const range = this.xlsx.utils.decode_range(ref);
		const rowCount = range.e.r + 1;
		const colCount = range.e.c + 1;

		const table = this.tableContainer.createEl('table', { cls: 'via-sheet-table' });

		// Column header row
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { cls: 'via-sheet-row-num', text: '' });
		for (let c = 0; c < colCount; c++) {
			const th = headerRow.createEl('th', { text: colLetter(c) });
			if (c === this.selCol) th.classList.add('is-selected-col');
		}

		// Data rows
		const tbody = table.createEl('tbody');
		for (let r = 0; r < rowCount; r++) {
			const tr = tbody.createEl('tr');
			const rowNumTd = tr.createEl('td', { cls: 'via-sheet-row-num', text: String(r + 1) });
			if (r === this.selRow) rowNumTd.classList.add('is-selected-row');

			for (let c = 0; c < colCount; c++) {
				const cellRef = this.xlsx.utils.encode_cell({ r, c });
				const cell = sheetGetCell(sheet, cellRef);
				const td = tr.createEl('td');
				td.textContent = this.getCellDisplay(cell);
				if (r === this.selRow && c === this.selCol) td.classList.add('is-selected');

				td.addEventListener('click', () => this.selectCell(r, c));
				td.addEventListener('dblclick', () => this.beginInlineEdit(td, r, c));
			}
		}
	}

	private getCellDisplay(cell: XLSXCell | undefined): string {
		if (!cell) return '';
		if (cell.w !== undefined) return cell.w;
		if (cell.v !== undefined) return String(cell.v);
		return '';
	}

	// ── Selection ─────────────────────────────────────────────────────────────

	private selectCell(row: number, col: number): void {
		this.selRow = row;
		this.selCol = col;
		this.updateSelectionHighlight();
		this.refreshFormulaBar();
	}

	private updateSelectionHighlight(): void {
		if (!this.tableContainer) return;
		this.tableContainer
			.querySelectorAll('.is-selected, .is-selected-col, .is-selected-row')
			.forEach(el => el.classList.remove('is-selected', 'is-selected-col', 'is-selected-row'));

		if (this.selRow < 0 || this.selCol < 0) return;
		const table = this.tableContainer.querySelector('.via-sheet-table');
		if (!table) return;

		// Column header highlight
		const ths = table.querySelectorAll('thead th');
		ths[this.selCol + 1]?.classList.add('is-selected-col');

		// Row header + cell highlight
		const rows = table.querySelectorAll('tbody tr');
		const row = rows[this.selRow];
		if (row) {
			row.querySelector('.via-sheet-row-num')?.classList.add('is-selected-row');
			row.querySelectorAll('td')[this.selCol + 1]?.classList.add('is-selected');
		}
	}

	// ── Formula bar ───────────────────────────────────────────────────────────

	private refreshFormulaBar(): void {
		if (!this.formulaRef || !this.formulaInput || !this.xlsx) return;
		if (this.selRow < 0 || this.selCol < 0) {
			this.formulaRef.textContent = '';
			this.formulaInput.value = '';
			return;
		}
		const cellRef = this.xlsx.utils.encode_cell({ r: this.selRow, c: this.selCol });
		this.formulaRef.textContent = cellRef;
		const sheetName = this.workbook?.SheetNames[this.activeSheet];
		const sheet = sheetName ? this.workbook?.Sheets[sheetName] : undefined;
		const cell = sheet ? sheetGetCell(sheet, cellRef) : undefined;
		this.formulaInput.value = cell?.f ? '=' + cell.f : this.getCellDisplay(cell);
	}

	private commitFormulaBar(): void {
		if (!this.formulaInput || this.selRow < 0 || this.selCol < 0) return;
		this.writeCell(this.selRow, this.selCol, this.formulaInput.value);
		this.formulaInput.blur();
	}

	// ── Inline cell editing ───────────────────────────────────────────────────

	private beginInlineEdit(td: HTMLElement, row: number, col: number): void {
		if (!this.xlsx) return;
		const sheetName = this.workbook?.SheetNames[this.activeSheet];
		const sheet = sheetName ? this.workbook?.Sheets[sheetName] : undefined;
		const cellRef = this.xlsx.utils.encode_cell({ r: row, c: col });
		const cell = sheet ? sheetGetCell(sheet, cellRef) : undefined;
		const rawValue = cell?.f ? '=' + cell.f : this.getCellDisplay(cell);

		td.empty();
		const input = td.createEl('input', { cls: 'via-sheet-cell-input', type: 'text' });
		input.value = rawValue;
		input.focus();
		input.select();

		let committed = false;
		const commit = () => {
			if (committed) return;
			committed = true;
			this.writeCell(row, col, input.value);
		};

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); commit(); }
			if (e.key === 'Escape') {
				e.preventDefault();
				committed = true;
				this.renderSheet();
				this.refreshFormulaBar();
			}
		});
		input.addEventListener('blur', commit);
	}

	private writeCell(row: number, col: number, value: string): void {
		if (!this.workbook || !this.xlsx) return;
		const sheetName = this.workbook.SheetNames[this.activeSheet];
		if (!sheetName) return;
		const sheet = this.workbook.Sheets[sheetName];
		if (!sheet) return;

		const cellRef = this.xlsx.utils.encode_cell({ r: row, c: col });
		let cell: XLSXCell;
		if (value.startsWith('=')) {
			cell = { f: value.slice(1), t: 'n', v: 0 };
		} else if (value.trim() !== '' && !isNaN(Number(value))) {
			cell = { v: Number(value), t: 'n', w: value };
		} else {
			cell = { v: value, t: 's', w: value };
		}
		sheetSetCell(sheet, cellRef, cell);

		// Expand sheet !ref if needed
		const ref = sheetGetRef(sheet);
		if (!ref) {
			sheetSetRef(sheet, this.xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: col } }));
		} else {
			const range = this.xlsx.utils.decode_range(ref);
			if (row > range.e.r) range.e.r = row;
			if (col > range.e.c) range.e.c = col;
			sheetSetRef(sheet, this.xlsx.utils.encode_range(range));
		}

		this.markDirty();
		this.renderSheet();
		this.refreshFormulaBar();
	}

	// ── Add Row / Column ──────────────────────────────────────────────────────

	private addRow(): void {
		if (!this.workbook || !this.xlsx) return;
		const sheetName = this.workbook.SheetNames[this.activeSheet];
		if (!sheetName) return;
		const sheet = this.workbook.Sheets[sheetName];
		if (!sheet) return;

		const ref = sheetGetRef(sheet) ?? 'A1:A1';
		const range = this.xlsx.utils.decode_range(ref);
		range.e.r += 1;
		sheetSetRef(sheet, this.xlsx.utils.encode_range(range));

		this.markDirty();
		this.renderSheet();
		new Notice('Row added', 1500);
	}

	private addColumn(): void {
		if (!this.workbook || !this.xlsx) return;
		const sheetName = this.workbook.SheetNames[this.activeSheet];
		if (!sheetName) return;
		const sheet = this.workbook.Sheets[sheetName];
		if (!sheet) return;

		const ref = sheetGetRef(sheet) ?? 'A1:A1';
		const range = this.xlsx.utils.decode_range(ref);
		range.e.c += 1;
		sheetSetRef(sheet, this.xlsx.utils.encode_range(range));

		this.markDirty();
		this.renderSheet();
		new Notice('Column added', 1500);
	}

	// ── Dirty state & Save ────────────────────────────────────────────────────

	private markDirty(): void {
		this.isDirty = true;
		this.saveBtn?.classList.add('is-dirty');
	}

	private async saveFile(): Promise<void> {
		if (!this.workbook || !this.xlsx || !this.currentFile) return;
		const bookType = this.currentFile.extension === 'csv' ? 'csv' : 'xlsx';
		try {
			const out = this.xlsx.write(this.workbook, { type: 'array', bookType });
			const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
			await this.app.vault.modifyBinary(this.currentFile, ab as ArrayBuffer);
			this.isDirty = false;
			this.saveBtn?.classList.remove('is-dirty');
			new Notice('Saved ✓', 2000);
		} catch (err) {
			new Notice(`Save failed: ${String(err)}`);
		}
	}

	private updateInfo(): void {
		if (!this.infoEl || !this.workbook || !this.xlsx) return;
		const sheetName = this.workbook.SheetNames[this.activeSheet];
		if (!sheetName) { this.infoEl.textContent = '—'; return; }
		const sheet = this.workbook.Sheets[sheetName];
		if (!sheet) { this.infoEl.textContent = '—'; return; }
		const ref = sheetGetRef(sheet);
		if (!ref) { this.infoEl.textContent = '0 rows'; return; }
		const range = this.xlsx.utils.decode_range(ref);
		this.infoEl.textContent = `${range.e.r + 1} × ${range.e.c + 1}`;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert 0-based column index to spreadsheet letter (A, B, …, Z, AA, AB…). */
function colLetter(index: number): string {
	let s = '';
	let n = index;
	while (n >= 0) {
		s = String.fromCharCode((n % 26) + 65) + s;
		n = Math.floor(n / 26) - 1;
	}
	return s;
}
