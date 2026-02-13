/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extracts a code outline from file contents showing function/class signatures
 * Similar to Cursor's outline mode for large files
 */

export interface OutlineItem {
	type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'const' | 'let' | 'var' | 'import' | 'export';
	name: string;
	line: number;
	signature: string;
}

/**
 * Extract outline from TypeScript/JavaScript files
 */
function extractTSOutline(content: string): OutlineItem[] {
	const lines = content.split('\n');
	const items: OutlineItem[] = [];

	// Patterns for different code structures
	const patterns = [
		// Classes
		{ regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, type: 'class' as const },
		// Interfaces
		{ regex: /^(?:export\s+)?interface\s+(\w+)/, type: 'interface' as const },
		// Type aliases
		{ regex: /^(?:export\s+)?type\s+(\w+)/, type: 'type' as const },
		// Functions
		{ regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' as const },
		// Arrow functions assigned to const/let/var
		{ regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, type: 'const' as const },
		// Methods (inside classes)
		{ regex: /^\s+(?:public|private|protected|static|async)?\s*(\w+)\s*\(/, type: 'method' as const },
		// Imports (first 20 only to avoid spam)
		{ regex: /^import\s+.*from\s+['"](.+)['"]/, type: 'import' as const },
	];

	let importCount = 0;
	const MAX_IMPORTS = 20;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
			continue;
		}

		for (const { regex, type } of patterns) {
			const match = line.match(regex);
			if (match) {
				// Limit imports
				if (type === 'import') {
					if (importCount >= MAX_IMPORTS) continue;
					importCount++;
				}

				const name = match[1] || 'unknown';
				items.push({
					type,
					name,
					line: i + 1,
					signature: trimmed.length > 120 ? trimmed.substring(0, 120) + '...' : trimmed
				});
				break;
			}
		}
	}

	return items;
}

/**
 * Extract outline from Python files
 */
function extractPythonOutline(content: string): OutlineItem[] {
	const lines = content.split('\n');
	const items: OutlineItem[] = [];

	const patterns = [
		// Classes
		{ regex: /^class\s+(\w+)/, type: 'class' as const },
		// Functions
		{ regex: /^def\s+(\w+)/, type: 'function' as const },
		// Methods (indented def)
		{ regex: /^\s+def\s+(\w+)/, type: 'method' as const },
		// Imports
		{ regex: /^(?:from\s+\S+\s+)?import\s+(.+)/, type: 'import' as const },
	];

	let importCount = 0;
	const MAX_IMPORTS = 20;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith('#')) continue;

		for (const { regex, type } of patterns) {
			const match = line.match(regex);
			if (match) {
				if (type === 'import') {
					if (importCount >= MAX_IMPORTS) continue;
					importCount++;
				}

				const name = match[1] || 'unknown';
				items.push({
					type,
					name,
					line: i + 1,
					signature: trimmed.length > 120 ? trimmed.substring(0, 120) + '...' : trimmed
				});
				break;
			}
		}
	}

	return items;
}

/**
 * Extract outline from any file based on extension
 */
export function extractFileOutline(content: string, fileExtension: string): OutlineItem[] {
	const ext = fileExtension.toLowerCase();

	// TypeScript/JavaScript
	if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
		return extractTSOutline(content);
	}

	// Python
	if (['.py', '.pyw'].includes(ext)) {
		return extractPythonOutline(content);
	}

	// For other files, return empty (will fall back to full file or chunks)
	return [];
}

/**
 * Format outline items into a readable string for the LLM
 */
export function formatOutline(items: OutlineItem[], filePath: string): string {
	if (items.length === 0) {
		return `No outline available for this file type.`;
	}

	const sections: { [key: string]: OutlineItem[] } = {
		'Imports': [],
		'Classes': [],
		'Interfaces': [],
		'Types': [],
		'Functions': [],
		'Methods': [],
		'Variables': [],
	};

	for (const item of items) {
		if (item.type === 'import') sections['Imports'].push(item);
		else if (item.type === 'class') sections['Classes'].push(item);
		else if (item.type === 'interface') sections['Interfaces'].push(item);
		else if (item.type === 'type') sections['Types'].push(item);
		else if (item.type === 'function') sections['Functions'].push(item);
		else if (item.type === 'method') sections['Methods'].push(item);
		else sections['Variables'].push(item);
	}

	let output = `\u{1F4CB} FILE OUTLINE - ${filePath}\n\n`;
	output += `\u{26A0}\u{FE0F} YOU RECEIVED AN OUTLINE, NOT THE FULL FILE CODE\n\n`;
	output += `This shows the file structure (imports, classes, functions) with line numbers.\n`;
	output += `You can see WHAT exists, but NOT the implementation details.\n\n`;
	output += `To read the actual code:\n`;
	output += `• read_file(uri="${filePath}", mode="full") - Get complete file\n`;
	output += `• read_file(uri="${filePath}", start_line=X, end_line=Y) - Get specific section\n\n`;
	output += `---\n\n`;

	for (const [section, sectionItems] of Object.entries(sections)) {
		if (sectionItems.length === 0) continue;

		output += `## ${section} (${sectionItems.length})\n\n`;
		for (const item of sectionItems) {
			output += `Line ${item.line}: ${item.signature}\n`;
		}
		output += `\n`;
	}

	output += `\n\u{1F4A1} TIP: To see the full implementation of any item, use read_file with start_line and end_line parameters.`;

	return output;
}
