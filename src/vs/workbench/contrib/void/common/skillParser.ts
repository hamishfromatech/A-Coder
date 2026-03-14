/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import type { SkillMetadata, ParsedSkillFile, SkillScript, SkillAsset } from './skillTypes.js';

/**
 * Parses YAML frontmatter from a skill file
 * Supports both YAML frontmatter (---) and plain markdown files
 */
export function parseSkillFile(content: string): ParsedSkillFile {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (match) {
		// Has YAML frontmatter
		const yamlContent = match[1];
		const markdownContent = match[2].trim();
		const metadata = parseYamlFrontmatter(yamlContent);
		return {
			metadata,
			content: markdownContent,
			raw: content
		};
	}

	// No frontmatter - treat entire content as markdown
	// Extract description from first paragraph
	const lines = content.split('\n');
	let description = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.length === 0) continue;
		if (line.startsWith('#')) {
			// Skip title line
			continue;
		}
		// First non-empty, non-header line is description
		description = line.substring(0, 150);
		break;
	}

	return {
		metadata: {
			name: '',
			description: description || 'No description available.'
		},
		content: content.trim(),
		raw: content
	};
}

/**
 * Simple YAML parser for frontmatter
 * Handles common YAML constructs used in skill metadata
 */
function parseYamlFrontmatter(yaml: string): SkillMetadata {
	const metadata: SkillMetadata = {
		name: '',
		description: ''
	};

	const lines = yaml.split('\n');
	let currentArray: string[] | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines
		if (trimmed.length === 0) continue;

		// Handle array items
		if (trimmed.startsWith('- ') && currentArray !== null) {
			currentArray.push(trimmed.substring(2).trim());
			continue;
		}

		// Reset current array if we hit a new key
		currentArray = null;

		// Find key-value separator
		const colonIndex = trimmed.indexOf(':');
		if (colonIndex === -1) continue;

		const key = trimmed.substring(0, colonIndex).trim();
		const value = trimmed.substring(colonIndex + 1).trim();

		switch (key) {
			case 'name':
				metadata.name = value;
				break;
			case 'description':
				metadata.description = value;
				break;
			case 'version':
				metadata.version = value;
				break;
			case 'author':
				metadata.author = value;
				break;
			case 'tags':
				if (value) {
					// Inline array: tags: [tag1, tag2]
					const match = value.match(/^\[(.*)\]$/);
					if (match) {
						metadata.tags = match[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
					} else {
						// Array on next lines
						metadata.tags = [];
						currentArray = metadata.tags;
					}
				} else {
					metadata.tags = [];
					currentArray = metadata.tags;
				}
				break;
			case 'dependencies':
				if (value) {
					const match = value.match(/^\[(.*)\]$/);
					if (match) {
						metadata.dependencies = match[1].split(',').map(d => d.trim().replace(/['"]/g, ''));
					} else {
						metadata.dependencies = [];
						currentArray = metadata.dependencies;
					}
				} else {
					metadata.dependencies = [];
					currentArray = metadata.dependencies;
				}
				break;
			case 'requires':
				if (value) {
					const match = value.match(/^\[(.*)\]$/);
					if (match) {
						metadata.requires = match[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
					} else {
						metadata.requires = [];
						currentArray = metadata.requires;
					}
				} else {
					metadata.requires = [];
					currentArray = metadata.requires;
				}
				break;
			case 'min_acoder_version':
			case 'minAcoderVersion':
				metadata.minAcoderVersion = value;
				break;
		}
	}

	// If no name was provided, it will be set from folder name later
	return metadata;
}

/**
 * Detects script language from file extension
 */
export function detectScriptLanguage(filename: string): SkillScript['language'] {
	const ext = filename.toLowerCase().split('.').pop();
	switch (ext) {
		case 'py':
			return 'python';
		case 'sh':
		case 'bash':
			return 'bash';
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'node';
		default:
			return 'unknown';
	}
}

/**
 * Detects asset type from file extension
 */
export function detectAssetType(filename: string): SkillAsset['type'] {
	const ext = filename.toLowerCase().split('.').pop();

	// Templates
	if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) {
		return 'template';
	}

	// Images
	if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext || '')) {
		return 'image';
	}

	// Fonts
	if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext || '')) {
		return 'font';
	}

	// Data files
	if (['csv', 'xml', 'txt', 'md'].includes(ext || '')) {
		return 'data';
	}

	return 'other';
}

/**
 * Creates default skill metadata from folder name and content
 */
export function createDefaultSkillMetadata(name: string, content: string): SkillMetadata {
	const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
	const description = lines.length > 0 ? lines[0].substring(0, 150) : 'No description available.';

	return {
		name,
		description
	};
}