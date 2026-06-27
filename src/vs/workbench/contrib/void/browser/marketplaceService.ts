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
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { IPluginService } from '../common/pluginService.js'
import { MarketplaceEntry, MarketplaceJSON, MarketplaceServiceState } from '../common/marketplaceServiceTypes.js'
import { ITerminalToolService } from './terminalToolService.js'

export interface IMarketplaceService {
	readonly _serviceBrand: undefined
	readonly state: MarketplaceServiceState
	onDidChangeState: Event<void>
	addMarketplace(url: string): Promise<{ success: boolean; name?: string; error?: string }>
	removeMarketplace(name: string): Promise<void>
	refreshListing(name: string): Promise<void>
	installPlugin(name: string, marketplaceName: string): Promise<{ success: boolean; message: string }>
	uninstallPlugin(name: string): Promise<{ success: boolean; message: string }>
}

export const IMarketplaceService = createDecorator<IMarketplaceService>('marketplaceService')

class MarketplaceService extends Disposable implements IMarketplaceService {
	_serviceBrand: undefined

	state: MarketplaceServiceState = { marketplaces: [], listings: {} }
	private readonly _onDidChangeState = new Emitter<void>()
	public readonly onDidChangeState = this._onDidChangeState.event

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IPluginService private readonly pluginService: IPluginService,
		@ITerminalToolService private readonly terminalToolService: ITerminalToolService,
	) {
		super()
		this._initialize()
	}

	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState
			this.state = { ...this.state, marketplaces: [...this.voidSettingsService.state.globalSettings.marketplaces] }
			this._onDidChangeState.fire()
			// Lazily populate listings for any already-registered marketplaces.
			for (const m of this.state.marketplaces) { await this.refreshListing(m.name).catch(() => { }) }
		} catch (error) {
			console.error('Error initializing MarketplaceService:', error)
		}
	}

	private async _marketplacesDir(): Promise<URI> {
		const userHome = await this.pathService.userHome()
		return URI.joinPath(userHome, this.productService.dataFolderName, 'marketplaces')
	}

	private async _pluginsDir(): Promise<URI> {
		const userHome = await this.pathService.userHome()
		return URI.joinPath(userHome, this.productService.dataFolderName, 'plugins')
	}

	/** A URL is a git source if it uses http(s)/ssh/git protocols; otherwise treat as a local path. */
	private _isGitUrl(url: string): boolean {
		return /^(https?|git|ssh|file):\/\//.test(url) || /^git@/.test(url) || /\.git$/.test(url)
	}

	private _slugFromUrl(url: string): string {
		try {
			const u = new URL(url)
			const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
			return parts.length > 0 ? parts[parts.length - 1] : u.hostname.replace(/[^\w.-]/g, '')
		} catch {
			return url.replace(/[^\w.-]/g, '').slice(-32) || 'marketplace'
		}
	}

	private async _readMarketplaceJson(dir: URI): Promise<MarketplaceJSON | null> {
		for (const candidate of [URI.joinPath(dir, 'marketplace.json'), URI.joinPath(dir, '.claude-plugin', 'marketplace.json')]) {
			try {
				const content = await this.fileService.readFile(candidate)
				const parsed = JSON.parse(content.value.toString())
				if (parsed && Array.isArray(parsed.plugins)) return parsed as MarketplaceJSON
			} catch { /* try next */ }
		}
		return null
	}

	private async _gitClone(url: string, dest: URI, onProgress?: (s: string) => void): Promise<void> {
		// Remove any prior clone at dest so re-adding refreshes cleanly.
		try { await this.fileService.del(dest, { recursive: true }) } catch { /* didn't exist */ }
		const parent = URI.joinPath(dest, '..')
		const tempId = `mkt-clone-${Date.now()}`
		const { resPromise } = await this.terminalToolService.runCommand(
			`git clone --depth 1 "${url}" "${dest.fsPath}"`,
			{ type: 'temporary', cwd: parent.fsPath, terminalId: tempId, onData: onProgress }
		)
		const r = await resPromise
		if (!r.result.includes('Cloning into') && !r.result.toLowerCase().includes('done')) {
			throw new Error(`git clone failed: ${r.result}`)
		}
	}

	async addMarketplace(url: string): Promise<{ success: boolean; name?: string; error?: string }> {
		const trimmed = url.trim()
		if (!trimmed) return { success: false, error: 'URL is required.' }

		try {
			let marketplaceDir: URI
			if (this._isGitUrl(trimmed)) {
				const cacheBase = await this._marketplacesDir()
				const slug = this._slugFromUrl(trimmed)
				marketplaceDir = URI.joinPath(cacheBase, slug)
				try { await this.fileService.createFolder(cacheBase) } catch { /* may exist */ }
				await this._gitClone(trimmed, marketplaceDir)
			} else {
				// Local path. Use URI.file so a bare filesystem path resolves to a proper file URI.
				marketplaceDir = URI.file(trimmed)
			}

			const json = await this._readMarketplaceJson(marketplaceDir)
			if (!json) {
				return { success: false, error: 'No marketplace.json found at that URL/path.' }
			}
			const name = json.name || this._slugFromUrl(trimmed)

			const existing = this.voidSettingsService.state.globalSettings.marketplaces.filter(m => m.name !== name)
			const marketplaces: MarketplaceEntry[] = [...existing, { name, url: trimmed }]
			await this.voidSettingsService.setGlobalSetting('marketplaces', marketplaces)
			this.state = {
				marketplaces,
				listings: { ...this.state.listings, [name]: { plugins: json.plugins, loading: false } },
			}
			this._onDidChangeState.fire()
			return { success: true, name }
		} catch (error: any) {
			return { success: false, error: error?.message || String(error) }
		}
	}

	async removeMarketplace(name: string): Promise<void> {
		const marketplaces = this.voidSettingsService.state.globalSettings.marketplaces.filter(m => m.name !== name)
		await this.voidSettingsService.setGlobalSetting('marketplaces', marketplaces)
		const listings = { ...this.state.listings }
		delete listings[name]
		this.state = { marketplaces, listings }
		this._onDidChangeState.fire()
	}

	async refreshListing(name: string): Promise<void> {
		const entry = this.state.marketplaces.find(m => m.name === name)
		if (!entry) return
		this.state = {
			...this.state,
			listings: { ...this.state.listings, [name]: { ...(this.state.listings[name] || {}), loading: true } },
		}
		this._onDidChangeState.fire()
		try {
			let dir: URI
			if (this._isGitUrl(entry.url)) {
				const cacheBase = await this._marketplacesDir()
				dir = URI.joinPath(cacheBase, this._slugFromUrl(entry.url))
			} else {
				dir = URI.file(entry.url)
			}
			const json = await this._readMarketplaceJson(dir)
			this.state = {
				...this.state,
				listings: { ...this.state.listings, [name]: json ? { plugins: json.plugins, loading: false } : { error: 'marketplace.json not found', loading: false } },
			}
		} catch (error: any) {
			this.state = {
				...this.state,
				listings: { ...this.state.listings, [name]: { error: error?.message || String(error), loading: false } },
			}
		}
		this._onDidChangeState.fire()
	}

	async installPlugin(name: string, marketplaceName: string): Promise<{ success: boolean; message: string }> {
		const listing = this.state.listings[marketplaceName]
		const entry = listing?.plugins?.find(p => p.name === name)
		if (!entry) return { success: false, message: `Plugin "${name}" not found in marketplace "${marketplaceName}".` }

		try {
			const pluginsDir = await this._pluginsDir()
			try { await this.fileService.resolve(pluginsDir) } catch { await this.fileService.createFolder(pluginsDir) }
			const dest = URI.joinPath(pluginsDir, entry.name)

			const sourceIsGit = this._isGitUrl(entry.source)
			if (sourceIsGit) {
				await this._gitClone(entry.source, dest)
			} else {
				// Relative path within the marketplace clone/dir.
				const mktEntry = this.state.marketplaces.find(m => m.name === marketplaceName)!
				const mktDir = this._isGitUrl(mktEntry.url)
					? URI.joinPath(await this._marketplacesDir(), this._slugFromUrl(mktEntry.url))
					: URI.file(mktEntry.url)
				const src = URI.joinPath(mktDir, entry.source)
				try { await this.fileService.del(dest, { recursive: true }) } catch { /* didn't exist */ }
				await this.fileService.copy(src, dest, true)
			}

			// Verify it's a real plugin (has a manifest).
			try {
				await this.fileService.readFile(URI.joinPath(dest, '.claude-plugin', 'plugin.json'))
			} catch {
				return { success: false, message: `Installed directory has no .claude-plugin/plugin.json — not a valid plugin.` }
			}

			await this.pluginService.rescan()
			await this.pluginService.enable(entry.name)
			return { success: true, message: `Plugin "${entry.name}" installed and enabled.` }
		} catch (error: any) {
			return { success: false, message: `Failed to install plugin: ${error?.message || String(error)}` }
		}
	}

	async uninstallPlugin(name: string): Promise<{ success: boolean; message: string }> {
		try {
			const pluginsDir = await this._pluginsDir()
			const dest = URI.joinPath(pluginsDir, name)
			try { await this.fileService.del(dest, { recursive: true }) } catch { /* didn't exist */ }
			await this.pluginService.disable(name)
			await this.pluginService.rescan()
			return { success: true, message: `Plugin "${name}" uninstalled.` }
		} catch (error: any) {
			return { success: false, message: `Failed to uninstall plugin: ${error?.message || String(error)}` }
		}
	}
}

registerSingleton(IMarketplaceService, MarketplaceService, InstantiationType.Delayed)