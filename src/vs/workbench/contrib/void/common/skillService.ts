/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import type {
	SkillMetadata,
	ParsedSkillFile,
	SkillLoadOptions,
	LoadSkillResult,
	SkillInfo
} from './skillTypes.js';

/**
 * SkillService handles loading, parsing, and managing A-Coder skills.
 *
 * Skills are stored in ~/.a-coder/skills/{skill_name}/
 * Each skill has:
 * - SKILL.md (required) - YAML frontmatter + markdown instructions
 * - scripts/ (optional) - Executable scripts for deterministic tasks
 * - references/ (optional) - Documentation loaded on demand
 * - assets/ (optional) - Templates and resources
 */
export class SkillService {
	private readonly _fileService: IFileService;
	private readonly _skillsDir: URI;

	constructor(fileService: IFileService, userHome: URI) {
		this._fileService = fileService;
		this._skillsDir = URI.joinPath(userHome, '.a-coder', 'skills');
	}

	/**
	 * Parse YAML frontmatter from SKILL.md content
	 */
	parseSkillFile(content: string): ParsedSkillFile {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
		const match = content.match(frontmatterRegex);

		if (match) {
			// Has YAML frontmatter
			const yamlContent = match[1];
			const markdownContent = match[2];
			const metadata = this.parseYamlFrontmatter(yamlContent);
			return {
				metadata,
				content: markdownContent.trim(),
				raw: content
			};
		}

		// No frontmatter - use entire content as instructions
		// Extract name from first heading if present
		const nameMatch = content.match(/^#\s+(.+)$/m);
		const name = nameMatch ? nameMatch[1].trim() : 'Unknown';

		// Extract description from first non-heading paragraph
		const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
		const description = lines.length > 0 ? lines[0].substring(0, 150) : 'No description available.';

		return {
			metadata: { name, description },
			content: content,
			raw: content
		};
	}

	/**
	 * Parse YAML frontmatter string into metadata object
	 */
	private parseYamlFrontmatter(yaml: string): SkillMetadata {
		const metadata: SkillMetadata = {
			name: 'Unknown',
			description: 'No description available.'
		};

		// Simple YAML parser for key: value pairs and arrays
		const lines = yaml.split('\n');
		let currentKey: string | null = null;
		let currentArray: string[] | null = null;

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines
			if (!trimmed) continue;

			// Array item (starts with -)
			if (trimmed.startsWith('- ') && currentKey && currentArray) {
				currentArray.push(trimmed.substring(2).trim());
				continue;
			}

			// Key: value pair
			const colonIndex = trimmed.indexOf(':');
			if (colonIndex > 0) {
				const key = trimmed.substring(0, colonIndex).trim();
				const value = trimmed.substring(colonIndex + 1).trim();

				// Handle different keys
				switch (key) {
					case 'name':
						metadata.name = value || 'Unknown';
						currentKey = null;
						currentArray = null;
						break;
					case 'description':
						metadata.description = value || 'No description available.';
						currentKey = null;
						currentArray = null;
						break;
					case 'version':
						metadata.version = value;
						currentKey = null;
						currentArray = null;
						break;
					case 'author':
						metadata.author = value;
						currentKey = null;
						currentArray = null;
						break;
					case 'min_acoder_version':
						metadata.minAcoderVersion = value;
						currentKey = null;
						currentArray = null;
						break;
					case 'tags':
						metadata.tags = [];
						currentKey = 'tags';
						currentArray = metadata.tags;
						// Check if inline array: [tag1, tag2]
						if (value.startsWith('[') && value.endsWith(']')) {
							metadata.tags = value.slice(1, -1).split(',').map(t => t.trim().replace(/['"]/g, ''));
							currentArray = null;
						} else if (value) {
							// Single value on same line
							metadata.tags.push(value);
						}
						break;
					case 'dependencies':
						metadata.dependencies = [];
						currentKey = 'dependencies';
						currentArray = metadata.dependencies;
						if (value.startsWith('[') && value.endsWith(']')) {
							metadata.dependencies = value.slice(1, -1).split(',').map(d => d.trim().replace(/['"]/g, ''));
							currentArray = null;
						} else if (value) {
							metadata.dependencies.push(value);
						}
						break;
					case 'requires':
						metadata.requires = [];
						currentKey = 'requires';
						currentArray = metadata.requires;
						if (value.startsWith('[') && value.endsWith(']')) {
							metadata.requires = value.slice(1, -1).split(',').map(d => d.trim().replace(/['"]/g, ''));
							currentArray = null;
						} else if (value) {
							metadata.requires.push(value);
						}
						break;
					default:
						// Unknown key, skip
						currentKey = null;
						currentArray = null;
				}
			}
		}

		return metadata;
	}

	/**
	 * List all available skills
	 */
	async listSkills(): Promise<SkillInfo[]> {
		const skills: SkillInfo[] = [];

		try {
			const stat = await this._fileService.resolve(this._skillsDir);
			if (!stat.children) return skills;

			for (const child of stat.children) {
				if (!child.isDirectory) continue;

				const skillName = child.name;
				const skillFolder = URI.joinPath(this._skillsDir, skillName);
				const skillPath = URI.joinPath(skillFolder, 'SKILL.md');

				try {
					const content = await this._fileService.readFile(skillPath);
					const text = content.value.toString();
					const parsed = this.parseSkillFile(text);

					// Check for optional directories
					const hasScripts = await this.hasDirectory(skillFolder, 'scripts');
					const hasReferences = await this.hasDirectory(skillFolder, 'references');
					const hasAssets = await this.hasDirectory(skillFolder, 'assets');

					skills.push({
						name: parsed.metadata.name,
						description: parsed.metadata.description,
						version: parsed.metadata.version,
						author: parsed.metadata.author,
						tags: parsed.metadata.tags,
						dependencies: parsed.metadata.dependencies,
						hasScripts,
						hasReferences,
						hasAssets
					});
				} catch (e) {
					// Skip if SKILL.md is missing or invalid
				}
			}
		} catch (error) {
			// Skills directory doesn't exist yet
		}

		return skills;
	}

	/**
	 * Check if a directory exists within a path
	 */
	private async hasDirectory(parentUri: URI, dirname: string): Promise<boolean> {
		try {
			const dirUri = URI.joinPath(parentUri, dirname);
			const stat = await this._fileService.resolve(dirUri);
			return stat.isDirectory;
		} catch {
			return false;
		}
	}

	/**
	 * Load a skill with optional components
	 */
	async loadSkill(skillName: string, options: SkillLoadOptions = {}): Promise<LoadSkillResult> {
		const skillPath = URI.joinPath(this._skillsDir, skillName, 'SKILL.md');

		try {
			// Read and parse SKILL.md
			const content = await this._fileService.readFile(skillPath);
			const text = content.value.toString();
			const parsed = this.parseSkillFile(text);
			const skillDir = URI.joinPath(this._skillsDir, skillName);

			const result: LoadSkillResult = {
				skill_name: skillName,
				instructions: parsed.content,
				metadata: parsed.metadata,
				success: true
			};

			// Load scripts if requested
			if (options.includeScripts) {
				result.scripts = await this.loadScriptsList(skillDir);
			}

			// Load references if requested
			if (options.includeReferences) {
				result.references = await this.loadReferencesList(skillDir);
			}

			// Load assets if requested
			if (options.includeAssets) {
				result.assets = await this.loadAssetsList(skillDir);
			}

			// Include dependencies
			if (parsed.metadata.dependencies && parsed.metadata.dependencies.length > 0) {
				result.dependencies = parsed.metadata.dependencies;
			}

			return result;
		} catch (error) {
			// Try to list available skills for error message
			const availableSkills = await this.listAvailableSkillNames();
			const errorMsg = `Skill "${skillName}" not found. ${
				availableSkills.length > 0
					? `Available skills: ${availableSkills.join(', ')}`
					: 'No skills are currently installed.'
			}`;
			return {
				skill_name: skillName,
				instructions: errorMsg,
				success: false
			};
		}
	}

	/**
	 * Load reference file content
	 */
	async loadReference(skillName: string, referenceName: string): Promise<string | null> {
		const refPath = URI.joinPath(this._skillsDir, skillName, 'references', referenceName);
		try {
			const content = await this._fileService.readFile(refPath);
			return content.value.toString();
		} catch {
			return null;
		}
	}

	/**
	 * Load asset file content
	 */
	async loadAsset(skillName: string, assetName: string): Promise<string | Buffer | null> {
		const assetPath = URI.joinPath(this._skillsDir, skillName, 'assets', assetName);
		try {
			const content = await this._fileService.readFile(assetPath);
			return content.value.toString();
		} catch {
			return null;
		}
	}

	/**
	 * Get list of available skill names
	 */
	private async listAvailableSkillNames(): Promise<string[]> {
		try {
			const stat = await this._fileService.resolve(this._skillsDir);
			if (!stat.children) return [];
			return stat.children
				.filter(child => child.isDirectory)
				.map(child => child.name);
		} catch {
			return [];
		}
	}

	/**
	 * Load list of scripts in a skill
	 */
	private async loadScriptsList(skillDir: URI): Promise<Array<{ name: string; path: string; language: string }>> {
		const scripts: Array<{ name: string; path: string; language: string }> = [];
		const scriptsDir = URI.joinPath(skillDir, 'scripts');

		try {
			const stat = await this._fileService.resolve(scriptsDir);
			if (!stat.children) return scripts;

			for (const child of stat.children) {
				if (child.isDirectory) continue;
				const name = child.name;
				const language = this.getScriptLanguage(name);
				scripts.push({
					name,
					path: URI.joinPath(scriptsDir, name).fsPath,
					language
				});
			}
		} catch {
			// Scripts directory doesn't exist
		}

		return scripts;
	}

	/**
	 * Load list of references in a skill
	 */
	private async loadReferencesList(skillDir: URI): Promise<Array<{ name: string; path: string }>> {
		const references: Array<{ name: string; path: string }> = [];
		const refsDir = URI.joinPath(skillDir, 'references');

		try {
			const stat = await this._fileService.resolve(refsDir);
			if (!stat.children) return references;

			for (const child of stat.children) {
				if (child.isDirectory) continue;
				references.push({
					name: child.name,
					path: URI.joinPath(refsDir, child.name).fsPath
				});
			}
		} catch {
			// References directory doesn't exist
		}

		return references;
	}

	/**
	 * Load list of assets in a skill
	 */
	private async loadAssetsList(skillDir: URI): Promise<Array<{ name: string; path: string; type: string }>> {
		const assets: Array<{ name: string; path: string; type: string }> = [];
		const assetsDir = URI.joinPath(skillDir, 'assets');

		try {
			const stat = await this._fileService.resolve(assetsDir);
			if (!stat.children) return assets;

			for (const child of stat.children) {
				if (child.isDirectory) continue;
				const name = child.name;
				const type = this.getAssetType(name);
				assets.push({
					name,
					path: URI.joinPath(assetsDir, name).fsPath,
					type
				});
			}
		} catch {
			// Assets directory doesn't exist
		}

		return assets;
	}

	/**
	 * Determine script language from filename
	 */
	private getScriptLanguage(filename: string): 'python' | 'bash' | 'node' | 'unknown' {
		const ext = filename.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'py':
				return 'python';
			case 'sh':
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
	 * Determine asset type from filename
	 */
	private getAssetType(filename: string): 'template' | 'image' | 'font' | 'data' | 'other' {
		const ext = filename.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'json':
			case 'yaml':
			case 'yml':
			case 'toml':
				return 'template';
			case 'png':
			case 'jpg':
			case 'jpeg':
			case 'gif':
			case 'svg':
			case 'webp':
				return 'image';
			case 'ttf':
			case 'otf':
			case 'woff':
			case 'woff2':
				return 'font';
			case 'csv':
			case 'xml':
				return 'data';
			default:
				return 'other';
		}
	}
}