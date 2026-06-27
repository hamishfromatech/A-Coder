/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { MCPServerOfName, MCPConfigFileJSON, MCPConfigFileEntryJSON, MCPServer, MCPToolCallParams, RawMCPToolCall, MCPServerEventResponse } from './mcpServiceTypes.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { InternalToolInfo, ToolParamInfo } from './prompt/prompts.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { MCPUserStateOfName } from './voidSettingsTypes.js';
import { ToonService } from './toonService.js';
import { IPluginService } from './pluginService.js';


type MCPServiceState = {
	mcpServerOfName: MCPServerOfName,
	error: string | undefined, // global parsing error
}

export interface IMCPService {
	readonly _serviceBrand: undefined;
	revealMCPConfigFile(): Promise<void>;
	toggleServerIsOn(serverName: string, isOn: boolean): Promise<void>;

	readonly state: MCPServiceState; // NOT persisted
	onDidChangeState: Event<void>;

	getMCPTools(): InternalToolInfo[] | undefined;
	callMCPTool(toolData: MCPToolCallParams): Promise<{ result: RawMCPToolCall }>;
	stringifyResult(result: RawMCPToolCall): string
}

export const IMCPService = createDecorator<IMCPService>('mcpConfigService');



const MCP_CONFIG_FILE_NAME = 'mcp.json';

// Default MCP servers that come pre-configured with A-Coder
const MCP_CONFIG_SAMPLE = {
	mcpServers: {
		'chrome-devtools': {
			command: 'npx',
			args: ['-y', 'chrome-devtools-mcp@latest'],
		}
	}
}
const MCP_CONFIG_SAMPLE_STRING = JSON.stringify(MCP_CONFIG_SAMPLE, null, 2);


// export interface MCPCallToolOfToolName {
// 	[toolName: string]: (params: any) => Promise<{
// 		result: any | Promise<any>,
// 		interruptTool?: () => void
// 	}>;
// }


class MCPService extends Disposable implements IMCPService {
	_serviceBrand: undefined;


	private readonly channel: IChannel // MCPChannel
	private readonly toonService: ToonService;

	// list of MCP servers pulled from mcpChannel
	state: MCPServiceState = {
		mcpServerOfName: {},
		error: undefined,
	}

	/** Namespaced plugin server name → provenance label (`plugin:<pluginName>`).
	 *  Rebuilt on every refresh; used to attach `source` to MCPServer state. */
	private readonly _pluginServerOfName: Map<string, string> = new Map();

	// Emitters for server events
	private readonly _onDidChangeState = new Emitter<void>();
	public readonly onDidChangeState = this._onDidChangeState.event;;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IEditorService private readonly editorService: IEditorService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IPluginService private readonly pluginService: IPluginService,
	) {
		super();
		this.channel = this.mainProcessService.getChannel('void-channel-mcp');
		this.toonService = new ToonService();


		const onEvent = (e: MCPServerEventResponse) => {
			// console.log('GOT EVENT', e)
			this._setMCPServerState(e.response.name, e.response.newServer)
		}
		this._register((this.channel.listen('onAdd_server') satisfies Event<MCPServerEventResponse>)(onEvent));
		this._register((this.channel.listen('onUpdate_server') satisfies Event<MCPServerEventResponse>)(onEvent));
		this._register((this.channel.listen('onDelete_server') satisfies Event<MCPServerEventResponse>)(onEvent));

		// Re-merge when the set of enabled plugins changes (their mcpServers come and go).
		this._register(this.pluginService.onDidChangeState(() => { this._refreshMCPServers(); }));

		this._initialize();
	}


	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState;

			// Create .mcpConfig if it doesn't exist
			const mcpConfigUri = await this._getMCPConfigFilePath();
			const fileExists = await this._configFileExists(mcpConfigUri);
			if (!fileExists) {
				await this._createMCPConfigFile(mcpConfigUri);
				console.log('MCP Config file created:', mcpConfigUri.toString());
			}
			await this._addMCPConfigFileWatcher();
			await this._refreshMCPServers();
		} catch (error) {
			console.error('Error initializing MCPService:', error);
		}
	}

	private readonly _setMCPServerState = (serverName: string, newServer: MCPServer | undefined) => {
		if (newServer === undefined) {
			// Remove the server from the state
			const { [serverName]: removed, ...remainingServers } = this.state.mcpServerOfName;
			this.state = {
				...this.state,
				mcpServerOfName: remainingServers
			}
		} else {
			// Add or update the server. Plugin-contributed servers (namespaced
			// `<pluginName>__<serverName>`) get a `source` label for the UI.
			const source = this._pluginServerOfName.get(serverName)
			const enriched = source ? { ...newServer, source } : newServer
			this.state = {
				...this.state,
				mcpServerOfName: {
					...this.state.mcpServerOfName,
					[serverName]: enriched
				}
			}
		}
		this._onDidChangeState.fire();
	}

	private readonly _setHasError = (errMsg: string | undefined) => {
		this.state = {
			...this.state,
			error: errMsg,
		}
		this._onDidChangeState.fire();
	}

	// Create the file/directory if it doesn't exist
	private async _createMCPConfigFile(mcpConfigUri: URI): Promise<void> {
		await this.fileService.createFile(mcpConfigUri.with({ path: mcpConfigUri.path }));
		const buffer = VSBuffer.fromString(MCP_CONFIG_SAMPLE_STRING);
		await this.fileService.writeFile(mcpConfigUri, buffer);
	}


	private async _addMCPConfigFileWatcher(): Promise<void> {
		const mcpConfigUri = await this._getMCPConfigFilePath();
		this._register(
			this.fileService.watch(mcpConfigUri)
		)

		this._register(this.fileService.onDidFilesChange(async e => {
			if (!e.contains(mcpConfigUri)) return
			await this._refreshMCPServers();
		}));
	}

	// Client-side functions

	public async revealMCPConfigFile(): Promise<void> {
		try {
			const mcpConfigUri = await this._getMCPConfigFilePath();
			await this.editorService.openEditor({
				resource: mcpConfigUri,
				options: {
					pinned: true,
					revealIfOpened: true,
				}
			});
		} catch (error) {
			console.error('Error opening MCP config file:', error);
		}
	}

	public getMCPTools(): InternalToolInfo[] | undefined {
		const allTools: InternalToolInfo[] = []
		for (const serverName in this.state.mcpServerOfName) {
			const server = this.state.mcpServerOfName[serverName];
			server.tools?.forEach(tool => {
				allTools.push({
					description: tool.description || '',
					params: this._transformInputSchemaToParams(tool.inputSchema),
					name: tool.name,
					mcpServerName: serverName,
				})
			})
		}
		if (allTools.length === 0) return undefined
		return allTools
	}

	private _transformInputSchemaToParams(inputSchema?: Record<string, any>): { [paramName: string]: ToolParamInfo } {

		// Check if inputSchema is valid
		if (!inputSchema || !inputSchema.properties) return {};

		const params: { [paramName: string]: ToolParamInfo } = {};
		Object.keys(inputSchema.properties).forEach(paramName => {
			const propertyValues = inputSchema.properties[paramName];

			// Check if propertyValues is not an object (guard against null too)
			if (!propertyValues || typeof propertyValues !== 'object') {
				console.warn(`Invalid property value for ${paramName}: expected object, got ${typeof propertyValues}`);
				return; // in forEach the return is equivalent to continue
			}

			// Preserve the JSON-Schema shape so schema-aware OpenAI-compatible servers
			// (llama.cpp, vLLM, etc.) receive accurate tool parameter types instead of every
			// param being flattened to `type: 'string'`. `description` keeps its existing
			// stringified form to avoid changing what other providers already see.
			params[paramName] = {
				description: JSON.stringify(propertyValues.description || '', null, 2) || '',
				...(propertyValues.type ? { type: propertyValues.type } : {}),
				...(propertyValues.enum ? { enum: propertyValues.enum } : {}),
				...(propertyValues.items ? { items: propertyValues.items } : {}),
			}
		});
		return params;
	}

	private async _getMCPConfigFilePath(): Promise<URI> {
		const appName = this.productService.dataFolderName
		const userHome = await this.pathService.userHome();
		const uri = URI.joinPath(userHome, appName, MCP_CONFIG_FILE_NAME)
		return uri
	}

	private async _configFileExists(mcpConfigUri: URI): Promise<boolean> {
		try {
			await this.fileService.stat(mcpConfigUri);
			return true;
		} catch (error) {
			return false;
		}
	}


	private async _parseMCPConfigFile(): Promise<MCPConfigFileJSON | null> {
		const mcpConfigUri = await this._getMCPConfigFilePath();
		try {
			const fileContent = await this.fileService.readFile(mcpConfigUri);
			const contentString = fileContent.value.toString();
			const configFileJson = JSON.parse(contentString);
			if (!configFileJson.mcpServers) {
				throw new Error('Missing mcpServers property');
			}
			return configFileJson as MCPConfigFileJSON;
		} catch (error) {
			const fullError = `Error parsing MCP config file: ${error}`;
			this._setHasError(fullError)
			return null;
		}
	}


	// Handle server state changes
	private async _refreshMCPServers(): Promise<void> {

		this._setHasError(undefined)

		// User-declared servers from ~/.a-coder/mcp.json. On a parse error, bail entirely
		// (preserve existing servers — never tear down working servers on a transient
		// config-syntax error). Plugin-contributed servers load on the next successful
		// refresh (e.g. when the user fixes mcp.json or a plugin is toggled).
		const userConfig = await this._parseMCPConfigFile();
		if (!userConfig) { return }
		const userServers = userConfig.mcpServers

		// Plugin-contributed servers (namespaced `<pluginName>__<serverName>` so they
		// can never collide with user server names). Also rebuilds the provenance map.
		const pluginServers = await this._collectPluginMcpServers();

		// Merge — no key collision because plugin servers are namespaced.
		const mergedServers: Record<string, MCPConfigFileEntryJSON> = { ...pluginServers, ...userServers };
		const newConfigFileJSON: MCPConfigFileJSON = { mcpServers: mergedServers };

		const oldConfigFileNames = Object.keys(this.state.mcpServerOfName)
		const newConfigFileNames = Object.keys(newConfigFileJSON.mcpServers)

		const addedServerNames = newConfigFileNames.filter(serverName => !oldConfigFileNames.includes(serverName)); // in new and not in old
		const removedServerNames = oldConfigFileNames.filter(serverName => !newConfigFileNames.includes(serverName)); // in old and not in new

		// set isOn to any new servers in the config. New servers default to OFF
		// so first launch (and the bundled sample servers) don't `npx -y` download
		// / spawn a process without explicit consent — the user toggles them on.
		// This applies to plugin servers too — a plugin's MCP servers never auto-start.
		const addedUserStateOfName: MCPUserStateOfName = {}
		for (const name of addedServerNames) { addedUserStateOfName[name] = { isOn: false } }
		await this.voidSettingsService.addMCPUserStateOfNames(addedUserStateOfName);

		// delete isOn for any servers that no longer show up in the config
		await this.voidSettingsService.removeMCPUserStateOfNames(removedServerNames);

		// set all servers to loading
		for (const serverName in newConfigFileJSON.mcpServers) {
			this._setMCPServerState(serverName, { status: 'loading', tools: [] })
		}
		const updatedServerNames = Object.keys(newConfigFileJSON.mcpServers).filter(serverName => !addedServerNames.includes(serverName) && !removedServerNames.includes(serverName))

		try {
			await this.channel.call('refreshMCPServers', {
				mcpConfigFileJSON: newConfigFileJSON,
				addedServerNames,
				removedServerNames,
				updatedServerNames,
				userStateOfName: this.voidSettingsService.state.mcpUserStateOfName,
			})
		} catch (err) {
			this._setHasError(String(err))
		}
	}

	/**
	 * Collect MCP servers contributed by every enabled plugin. Each server is
	 * namespaced as `<pluginName>__<serverName>` and has `${CLAUDE_PLUGIN_ROOT}`
	 * substituted with the plugin directory (so plugins can reference their own
	 * bundled server scripts). Also rebuilds `_pluginServerOfName` so the UI can
	 * show provenance. Env-var placeholders (`${VAR}`, `${VAR:-default}`) are left
	 * for the main-process channel to resolve, where `process.env` is available.
	 */
	private async _collectPluginMcpServers(): Promise<Record<string, MCPConfigFileEntryJSON>> {
		const out: Record<string, MCPConfigFileEntryJSON> = {}
		this._pluginServerOfName.clear()

		for (const p of this.pluginService.getEnabledPlugins()) {
			const mcpField = p.manifest.mcpServers
			if (!mcpField) continue

			let serversObj: Record<string, MCPConfigFileEntryJSON> = {}
			if (typeof mcpField === 'string') {
				// Path to a .mcp.json file, resolved relative to the plugin dir.
				// Accept both wrapped `{ mcpServers: {...} }` and bare `Record<...>` forms.
				try {
					const fileUri = URI.joinPath(p.dir, mcpField)
					const content = await this.fileService.readFile(fileUri)
					const parsed = JSON.parse(content.value.toString())
					if (parsed && typeof parsed === 'object') {
						serversObj = (parsed.mcpServers && typeof parsed.mcpServers === 'object')
							? parsed.mcpServers as Record<string, MCPConfigFileEntryJSON>
							: parsed as Record<string, MCPConfigFileEntryJSON>
					}
				} catch { /* invalid/missing .mcp.json — skip this plugin's MCP servers */ }
			} else {
				serversObj = mcpField
			}

			const pluginRoot = p.dir.fsPath
			const sourceLabel = `plugin:${p.manifest.name}`
			for (const [serverName, entry] of Object.entries(serversObj)) {
				if (!entry || typeof entry !== 'object') continue
				const namespaced = `${p.manifest.name}__${serverName}`
				out[namespaced] = this._substitutePluginRoot(entry, pluginRoot)
				this._pluginServerOfName.set(namespaced, sourceLabel)
			}
		}
		return out
	}

	/** Replace `${CLAUDE_PLUGIN_ROOT}` with `pluginRoot` in an MCP server entry's
	 *  command/args/env/headers string values. Returns a new entry; original untouched. */
	private _substitutePluginRoot(entry: MCPConfigFileEntryJSON, pluginRoot: string): MCPConfigFileEntryJSON {
		const repl = (s: string | undefined): string | undefined =>
			s === undefined ? undefined : s.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot)
		const mapValues = (rec: Record<string, string> | undefined): Record<string, string> | undefined =>
			rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, repl(v) as string])) : rec
		return {
			...entry,
			command: repl(entry.command),
			args: entry.args?.map(repl) as string[] | undefined,
			env: mapValues(entry.env),
			headers: mapValues(entry.headers),
		}
	}

	stringifyResult(result: RawMCPToolCall): string {
		let toolResultStr: string
		if (result.event === 'text') {
			toolResultStr = result.text
		} else if (result.event === 'image') {
			toolResultStr = `[Image: ${result.image.mimeType}]`
		} else if (result.event === 'audio') {
			toolResultStr = `[Audio content]`
		} else if (result.event === 'resource') {
			toolResultStr = `[Resource content]`
		} else {
			toolResultStr = JSON.stringify(result)
		}

		// Try TOON encoding for structured MCP results
		return this._maybeEncodeToon(result, toolResultStr);
	}

	private _maybeEncodeToon(data: any, fallbackStr: string): string {
		const enableToon = this.voidSettingsService.state.globalSettings.enableToolResultTOON;

		if (!enableToon) {
			return fallbackStr;
		}

		// Check if TOON would be beneficial
		if (this.toonService.shouldUseToon(data)) {
			try {
				const toonEncoded = this.toonService.encode(data);
				// Only use TOON if it actually saves space
				if (toonEncoded.length < fallbackStr.length * 0.9) {
					return `[TOON]\n${toonEncoded}`;
				}
			} catch (e) {
				// Fall back to regular format if encoding fails
				console.warn('[MCPService] TOON encoding failed:', e);
			}
		}

		return fallbackStr;
	}

	// toggle MCP server and update isOn in void settings
	public async toggleServerIsOn(serverName: string, isOn: boolean): Promise<void> {
		this._setMCPServerState(serverName, { status: 'loading', tools: [] })

		await this.voidSettingsService.setMCPServerState(serverName, { isOn });
		await this.channel.call('toggleMCPServer', { serverName, isOn })
	}


	public async callMCPTool(toolData: MCPToolCallParams): Promise<{ result: RawMCPToolCall }> {
		const result = await this.channel.call<RawMCPToolCall>('callTool', toolData);
		if (result.event === 'error') {
			throw new Error(`Error: ${result.text}`)
		}
		return { result };
	}

	// public getMCPToolFns(): MCPToolResultType {
	// 	const tools = this.getMCPTools();
	// 	const toolFns: MCPToolResultType = {};

	// 	tools.forEach((tool) => {
	// 		const name = tool.name;
	// 		// Define the tool call function
	// 		const toolFn = async (params: {
	// 			serverName: string,
	// 			toolName: string,
	// 			args: any
	// 		}) => {
	// 			const { serverName, toolName, args } = params;
	// 			const response = await this.callMCPTool({
	// 				serverName,
	// 				toolName,
	// 				params: args,
	// 			});
	// 			return { result: response }
	// 		};
	// 		toolFns[name] = toolFn;
	// 	});

	// 	return toolFns
	// }
}

registerSingleton(IMCPService, MCPService, InstantiationType.Eager);
