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
import { Event, Emitter } from '../../../../base/common/event.js'
import { IVoidSettingsService } from './voidSettingsService.js'
import { InstalledPlugin, PluginManifest, PluginServiceState } from './pluginServiceTypes.js'
import { SlashCommandDef } from './slashCommandTypes.js'

export interface IPluginService {
	readonly _serviceBrand: undefined
	readonly state: PluginServiceState
	onDidChangeState: Event<void>
	/** All plugins discovered on disk (enabled + disabled). */
	getAllPlugins(): InstalledPlugin[]
	/** Plugins that are currently enabled (contribute skills/commands). */
	getEnabledPlugins(): InstalledPlugin[]
	/** Resolved skill-root URIs from every enabled plugin. */
	getSkillRoots(): URI[]
	/** Slash commands from every enabled plugin + personal command dirs. Built-ins are NOT included here. */
	getCommands(): Promise<SlashCommandDef[]>
	enable(name: string): Promise<void>
	disable(name: string): Promise<void>
	rescan(): Promise<void>
}

export const IPluginService = createDecorator<IPluginService>('pluginService')

class PluginService extends Disposable implements IPluginService {
	_serviceBrand: undefined

	state: PluginServiceState = { plugins: [], error: undefined }
	private readonly _onDidChangeState = new Emitter<void>()
	public readonly onDidChangeState = this._onDidChangeState.event

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super()
		this._initialize()
	}

	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState
			await this.rescan()
			await this._addWatchers()
		} catch (error) {
			console.error('Error initializing PluginService:', error)
		}
	}

	private async _pluginRoots(): Promise<{ root: URI; source: 'a-coder' | 'claude' }[]> {
		const userHome = await this.pathService.userHome()
		return [
			{ root: URI.joinPath(userHome, this.productService.dataFolderName, 'plugins'), source: 'a-coder' },
			{ root: URI.joinPath(userHome, '.claude', 'plugins'), source: 'claude' },
		]
	}

	private async _personalCommandDirs(): Promise<URI[]> {
		const userHome = await this.pathService.userHome()
		return [
			URI.joinPath(userHome, this.productService.dataFolderName, 'commands'),
			URI.joinPath(userHome, '.claude', 'commands'),
		]
	}

	async rescan(): Promise<void> {
		const roots = await this._pluginRoots()
		const discovered: InstalledPlugin[] = []
		for (const { root, source } of roots) {
			const found = await this._scanRoot(root, source)
			discovered.push(...found)
		}

		// Auto-enable newly discovered plugins on first sighting so a user's existing
		// Claude Code plugins work seamlessly out of the box. The user can disable any
		// they don't want. We only persist when the list actually changes.
		const enabledList = this.voidSettingsService.state.globalSettings.pluginsEnabled
		const enabledSet = new Set(enabledList)
		const known = new Set(discovered.map(p => p.manifest.name))
		let changed = false
		for (const p of discovered) {
			if (!enabledSet.has(p.manifest.name)) {
				// Only auto-enable if the name isn't already recorded as a known-but-disabled
				// plugin. Since we don't keep a disabled list, first sighting => enable.
				enabledSet.add(p.manifest.name)
				changed = true
			}
		}
		// Drop enabled names that no longer exist on disk.
		for (const name of [...enabledSet]) {
			if (!known.has(name)) { enabledSet.delete(name); changed = true }
		}
		if (changed) {
			await this.voidSettingsService.setGlobalSetting('pluginsEnabled', [...enabledSet])
		}

		const finalEnabled = new Set(this.voidSettingsService.state.globalSettings.pluginsEnabled)
		this.state = {
			plugins: discovered.map(p => ({ ...p, enabled: finalEnabled.has(p.manifest.name) })),
			error: undefined,
		}
		this._onDidChangeState.fire()
	}

	/**
	 * Scan a plugin root directory. Claude Code stores plugins either as
	 * `<root>/<plugin>/.claude-plugin/plugin.json` or
	 * `<root>/<marketplace>/<plugin>/.claude-plugin/plugin.json`, so we scan up to two
	 * levels deep for a `.claude-plugin/plugin.json` file.
	 */
	private async _scanRoot(root: URI, source: 'a-coder' | 'claude'): Promise<InstalledPlugin[]> {
		const out: InstalledPlugin[] = []
		let top: { children?: { name: string; isDirectory: boolean }[] }
		try {
			top = await this.fileService.resolve(root)
		} catch { return out } // root doesn't exist yet
		if (!top.children) return out

		for (const child of top.children) {
			if (!child.isDirectory) continue
			const childUri = URI.joinPath(root, child.name)
			const manifest = await this._tryReadManifest(childUri)
			if (manifest) {
				out.push({ manifest, dir: childUri, source, enabled: false })
				continue
			}
			// Descend one level (marketplace grouping).
			let nested: { children?: { name: string; isDirectory: boolean }[] }
			try { nested = await this.fileService.resolve(childUri) } catch { continue }
			if (!nested.children) continue
			for (const grand of nested.children) {
				if (!grand.isDirectory) continue
				const grandUri = URI.joinPath(childUri, grand.name)
				const m = await this._tryReadManifest(grandUri)
				if (m) out.push({ manifest: m, dir: grandUri, source, enabled: false })
			}
		}
		return out
	}

	private async _tryReadManifest(pluginDir: URI): Promise<PluginManifest | null> {
		const manifestUri = URI.joinPath(pluginDir, '.claude-plugin', 'plugin.json')
		try {
			const content = await this.fileService.readFile(manifestUri)
			const parsed = JSON.parse(content.value.toString())
			if (!parsed || typeof parsed.name !== 'string' || !parsed.name) return null
			return parsed as PluginManifest
		} catch { return null }
	}

	private async _addWatchers(): Promise<void> {
		const roots = await this._pluginRoots()
		for (const { root } of roots) {
			try { this._register(this.fileService.watch(root)) } catch { /* root may not exist */ }
		}
		const personalDirs = await this._personalCommandDirs()
		for (const dir of personalDirs) {
			try { this._register(this.fileService.watch(dir)) } catch { /* dir may not exist */ }
		}
		this._register(this.fileService.onDidFilesChange(async e => {
			const watched = [...roots.map(r => r.root), ...personalDirs]
			if (watched.some(u => e.contains(u))) await this.rescan()
		}))
	}

	getAllPlugins(): InstalledPlugin[] { return this.state.plugins }
	getEnabledPlugins(): InstalledPlugin[] { return this.state.plugins.filter(p => p.enabled) }

	getSkillRoots(): URI[] {
		const roots: URI[] = []
		for (const p of this.getEnabledPlugins()) {
			const skillFields = Array.isArray(p.manifest.skills) ? p.manifest.skills : (p.manifest.skills ? [p.manifest.skills] : ['./skills'])
			for (const f of skillFields) roots.push(URI.joinPath(p.dir, f || './skills'))
		}
		return roots
	}

	async getCommands(): Promise<SlashCommandDef[]> {
		const commands: SlashCommandDef[] = []

		// Personal command dirs (always active, not gated by plugin enable).
		const personalDirs = await this._personalCommandDirs()
		for (const dir of personalDirs) {
			const cmds = await this._loadCommandsFromDir(dir, 'personal')
			commands.push(...cmds)
		}

		// Each enabled plugin's commands dir(s).
		for (const p of this.getEnabledPlugins()) {
			const cmdFields = Array.isArray(p.manifest.commands) ? p.manifest.commands : (p.manifest.commands ? [p.manifest.commands] : undefined)
			const dirs = cmdFields ?? ['./commands']
			for (const f of dirs) {
				const cmds = await this._loadCommandsFromDir(URI.joinPath(p.dir, f || './commands'), `plugin:${p.manifest.name}`)
				commands.push(...cmds)
			}
		}
		return commands
	}

	private async _loadCommandsFromDir(dir: URI, source: string): Promise<SlashCommandDef[]> {
		const out: SlashCommandDef[] = []
		let stat: { children?: { name: string; isDirectory: boolean }[] }
		try { stat = await this.fileService.resolve(dir) } catch { return out }
		if (!stat.children) return out
		for (const child of stat.children) {
			if (child.isDirectory) continue
			if (!child.name.toLowerCase().endsWith('.md')) continue
			const label = child.name.replace(/\.md$/i, '')
			try {
				const content = await this.fileService.readFile(URI.joinPath(dir, child.name))
				const parsed = parseCommandFile(content.value.toString())
				out.push({
					label,
					description: parsed.description || `Plugin command from ${source}`,
					argumentHint: parsed.argumentHint,
					prompt: parsed.prompt,
					source,
				})
			} catch { /* skip invalid command file */ }
		}
		return out
	}

	async enable(name: string): Promise<void> {
		const enabled = new Set(this.voidSettingsService.state.globalSettings.pluginsEnabled)
		if (!enabled.has(name)) {
			enabled.add(name)
			await this.voidSettingsService.setGlobalSetting('pluginsEnabled', [...enabled])
		}
		await this.rescan()
	}

	async disable(name: string): Promise<void> {
		const enabled = new Set(this.voidSettingsService.state.globalSettings.pluginsEnabled)
		if (enabled.has(name)) {
			enabled.delete(name)
			await this.voidSettingsService.setGlobalSetting('pluginsEnabled', [...enabled])
		}
		await this.rescan()
	}
}

/**
 * Parse a `commands/*.md` file: optional YAML frontmatter (`description`,
 * `argument-hint`) followed by the markdown body used as the prompt. `$ARGUMENTS`
 * in the body is substituted with the user's args at invocation time.
 */
function parseCommandFile(content: string): { description?: string; argumentHint?: string; prompt: string } {
	const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
	const match = content.match(fmRegex)
	if (!match) return { prompt: content.trim() }
	const yaml = match[1]
	const prompt = match[2].trim()
	let description: string | undefined
	let argumentHint: string | undefined
	for (const line of yaml.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const idx = trimmed.indexOf(':')
		if (idx === -1) continue
		const key = trimmed.substring(0, idx).trim()
		const value = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '')
		if (key === 'description') description = value
		else if (key === 'argument-hint' || key === 'argumentHint') argumentHint = value
	}
	return { description, argumentHint, prompt }
}

registerSingleton(IPluginService, PluginService, InstantiationType.Delayed)