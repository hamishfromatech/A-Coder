/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js'
import { Disposable } from '../../../../base/common/lifecycle.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js'
import { IFileService } from '../../../../platform/files/common/files.js'
import { IPathService } from '../../../services/path/common/pathService.js'
import { IProductService } from '../../../../platform/product/common/productService.js'
import { IPluginService } from './pluginService.js'

/**
 * Result of locating a skill on disk. `source` records which root the skill was
 * found in so `list_skills`/`load_skill` can report provenance.
 */
export interface SkillResolution {
	root: URI
	folder: URI
	source: string
}

/**
 * ISkillService owns multi-root skill discovery. Skills are searched across, in
 * precedence order:
 *   1. ~/.a-coder/skills   (A-Coder personal skills — install target for install_skill)
 *   2. ~/.claude/skills    (Claude Code personal skills — read for compatibility)
 *   3. each enabled plugin's `skills/` dir (plugin-bundled skills)
 * The first root containing `<skillName>/SKILL.md` wins. Parsing of SKILL.md and
 * scanning of scripts/references/assets stays in the ToolsService tool handlers
 * (which delegate folder resolution here); YAML frontmatter parsing lives in
 * `skillParser.ts`.
 */
export interface ISkillService {
	readonly _serviceBrand: undefined
	/** Ordered skill-root URIs (precedence order). */
	getSkillRoots(): Promise<URI[]>
	/** Ordered skill roots with a source label ('a-coder' | 'claude' | 'plugin'). */
	getSkillRootsWithSource(): Promise<{ uri: URI; source: string }[]>
	/** Resolve a skill name to its folder across all roots, or null if not found. */
	resolveSkillFolder(skillName: string): Promise<SkillResolution | null>
	/** All unique skill folder names across all roots (for "not found" error messages). */
	listAllSkillNames(): Promise<string[]>
}

export const ISkillService = createDecorator<ISkillService>('skillService')

class SkillService extends Disposable implements ISkillService {
	_serviceBrand: undefined

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IPluginService private readonly pluginService: IPluginService,
	) {
		super()
	}

	private async _allRootsWithSource(): Promise<{ uri: URI; source: string }[]> {
		const userHome = await this.pathService.userHome()
		const roots: { uri: URI; source: string }[] = [
			{ uri: URI.joinPath(userHome, this.productService.dataFolderName, 'skills'), source: 'a-coder' },
			{ uri: URI.joinPath(userHome, '.claude', 'skills'), source: 'claude' },
		]
		for (const r of this.pluginService.getSkillRoots()) roots.push({ uri: r, source: 'plugin' })
		return roots
	}

	async getSkillRoots(): Promise<URI[]> {
		const roots = await this._allRootsWithSource()
		return roots.map(r => r.uri)
	}

	async getSkillRootsWithSource(): Promise<{ uri: URI; source: string }[]> {
		return this._allRootsWithSource()
	}

	async resolveSkillFolder(skillName: string): Promise<SkillResolution | null> {
		// Reject path traversal in the skill name — it must be a single path segment.
		if (!skillName || /[\\/]/.test(skillName) || skillName === '.' || skillName === '..') return null
		const roots = await this._allRootsWithSource()
		for (const { uri, source } of roots) {
			const folder = URI.joinPath(uri, skillName)
			// Re-check the folder is still a descendant of the root (defense in depth).
			if (!folder.fsPath.startsWith(uri.fsPath + '/')) continue
			const skillMd = URI.joinPath(folder, 'SKILL.md')
			try {
				await this.fileService.stat(skillMd)
				return { root: uri, folder, source }
			} catch { /* not in this root */ }
		}
		return null
	}

	async listAllSkillNames(): Promise<string[]> {
		const roots = await this._allRootsWithSource()
		const seen = new Set<string>()
		const names: string[] = []
		for (const { uri } of roots) {
			try {
				const stat = await this.fileService.resolve(uri)
				if (!stat.children) continue
				for (const child of stat.children) {
					if (child.isDirectory && !seen.has(child.name)) {
						seen.add(child.name)
						names.push(child.name)
					}
				}
			} catch { /* root doesn't exist yet */ }
		}
		return names
	}
}

registerSingleton(ISkillService, SkillService, InstantiationType.Delayed)