/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Skill metadata extracted from YAML frontmatter in SKILL.md files
 */
export interface SkillMetadata {
	name: string;
	description: string;
	version?: string;
	author?: string;
	tags?: string[];
	dependencies?: string[];
	minAcoderVersion?: string;
	requires?: string[];
}

/**
 * Parsed skill file with frontmatter and content
 */
export interface ParsedSkillFile {
	metadata: SkillMetadata;
	content: string; // The markdown content after frontmatter
	raw: string; // The original file content
}

/**
 * Skill structure with all optional components
 */
export interface Skill {
	name: string;
	metadata: SkillMetadata;
	instructions: string;
	scripts?: Map<string, SkillScript>;
	references?: Map<string, SkillReference>;
	assets?: Map<string, SkillAsset>;
}

/**
 * Executable script within a skill
 */
export interface SkillScript {
	name: string;
	path: string;
	language: 'python' | 'bash' | 'node' | 'unknown';
	content?: string; // Lazy loaded
}

/**
 * Reference document within a skill
 */
export interface SkillReference {
	name: string;
	path: string;
	content?: string; // Lazy loaded
}

/**
 * Asset file within a skill
 */
export interface SkillAsset {
	name: string;
	path: string;
	type: 'template' | 'image' | 'font' | 'data' | 'other';
	content?: string | Buffer; // Lazy loaded
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
	success: boolean;
	output: string;
	error?: string;
	exitCode: number;
	duration: number;
}

/**
 * Skill loading options
 */
export interface SkillLoadOptions {
	includeScripts?: boolean;
	includeReferences?: boolean;
	includeAssets?: boolean;
}

/**
 * Enhanced skill result for load_skill tool
 */
export interface LoadSkillResult {
	skill_name: string;
	instructions: string;
	metadata?: SkillMetadata;
	scripts?: Array<{ name: string; path: string; language: string }>;
	references?: Array<{ name: string; path: string }>;
	assets?: Array<{ name: string; path: string; type: string }>;
	dependencies?: string[];
	success: boolean;
}

/**
 * Enhanced skill info for list_skills tool
 */
export interface SkillInfo {
	name: string;
	description: string;
	version?: string;
	author?: string;
	tags?: string[];
	dependencies?: string[];
	hasScripts: boolean;
	hasReferences: boolean;
	hasAssets: boolean;
}