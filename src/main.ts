import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings, ViewItAllSettingTab } from './settings';
import { VIEW_TYPE_DOCX, VIEW_TYPE_PDF } from './types';
import { DocxView } from './views/DocxView';
import { PdfView } from './views/PdfView';

export default class ViewItAllPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_DOCX, leaf => new DocxView(leaf, this));
		this.registerView(VIEW_TYPE_PDF, leaf => new PdfView(leaf, this));

		this.registerExtensions(['docx'], VIEW_TYPE_DOCX);

		// Obsidian's built-in PDF viewer already owns the 'pdf' extension.
		// We must unregister it first before claiming it ourselves.
		this.overridePdfExtension();

		this.addSettingTab(new ViewItAllSettingTab(this.app, this));
	}

	onunload() {
		// Restore Obsidian's built-in PDF viewer when this plugin is disabled.
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const reg = (this.app as any).viewRegistry;
			reg.unregisterExtensions(['pdf']);
			reg.registerExtensions(['pdf'], 'pdf');
		} catch {
			// ignore — built-in will be re-registered on app restart
		}
	}

	private overridePdfExtension() {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this.app as any).viewRegistry.unregisterExtensions(['pdf']);
		} catch {
			// already unregistered or API unavailable — proceed anyway
		}
		this.registerExtensions(['pdf'], VIEW_TYPE_PDF);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PluginSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
