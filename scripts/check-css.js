#!/usr/bin/env node
/**
 * CSS hardcoded-value check.
 * Fails if styles.css contains hardcoded colours, px font-sizes, or raw hex values.
 * Run: node scripts/check-css.js
 */

const fs = require('fs');
const path = require('path');

const cssPath = path.resolve(__dirname, '..', 'styles.css');

if (!fs.existsSync(cssPath)) {
	console.error('check-css: styles.css not found at', cssPath);
	process.exit(1);
}

const css = fs.readFileSync(cssPath, 'utf8');

// Strip CSS comments before checking to avoid false positives in comments
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

const violations = [];

const patterns = [
	{
		// Hex colours NOT inside a conic-gradient or linear-gradient (decorative swatches are OK)
		// Also skip hex values that follow a CSS variable declaration
		pattern: /(?<!var\s*\([^)]*?)(?<!--[\w-]*)#[0-9a-fA-F]{3,8}\b/g,
		label: 'hardcoded hex colour',
		lineFilter: (line) => !/conic-gradient|linear-gradient/.test(line),
	},
	{
		// Hardcoded named colours used directly as values — NOT inside var(...)
		// Matches: `color: red` but NOT `color: var(--color-red)`
		pattern: /(?:^|[;\s{])(?:color|background(?:-color)?|border(?:-color)?|outline(?:-color)?)\s*:\s*(?!var\s*\()(?!rgba?\s*\()(?!hsla?\s*\()(?!transparent)(?!inherit)(?!initial)(?!currentColor)(red|green|blue|white|black|yellow|orange|purple|pink|gray|grey|cyan|magenta)\b/gm,
		label: 'hardcoded named colour',
	},
	{
		// Hardcoded font-size in px (should use --font-size-* vars)
		pattern: /font-size\s*:\s*\d+(\.\d+)?px/g,
		label: 'hardcoded px font-size',
	},
];

for (const { pattern, label, lineFilter } of patterns) {
	let match;
	while ((match = pattern.exec(stripped)) !== null) {
		// Find line number and line content
		const before = stripped.slice(0, match.index);
		const lineNum = before.split('\n').length;
		const lineContent = stripped.split('\n')[lineNum - 1] ?? '';

		if (lineFilter && !lineFilter(lineContent)) continue;

		violations.push(`  Line ${lineNum}: [${label}] ${match[0].trim()}`);
	}
}

if (violations.length > 0) {
	console.error('\n❌  check-css: hardcoded values found in styles.css\n');
	violations.forEach(v => console.error(v));
	console.error('\n  Use Obsidian CSS variables instead (var(--color-*), var(--background-*), etc.)');
	console.error('  See: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables\n');
	process.exit(1);
} else {
	console.log('✅  check-css: styles.css looks clean');
}
