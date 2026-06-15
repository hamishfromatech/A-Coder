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
import { ACPAgentOfServerName, ACPConfigFileJSON, ACPAgentState, ACPRunAgentResponse, ACPServerEventResponse } from './acpServiceTypes.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { InternalToolInfo } from './prompt/prompts.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { MCPUserStateOfName } from './voidSettingsTypes.js';


type ACPServiceState = {
	acpServerOfName: ACPAgentOfServerName;
	error: string | undefined; // global parsing error
}

export interface IACPService {
	readonly _serviceBrand: undefined;
	revealACPConfigFile(): Promise<void>;
	toggleServerIsOn(serverName: string, isOn: boolean): Promise<void>;

	readonly state: ACPServiceState; // NOT persisted
	onDidChangeState: Event<void>;

	getACPAgents(): InternalToolInfo[] | undefined;
	callACPAgent(agentData: { serverName: string; agentName: string; input: string }): Promise<{ result: ACPRunAgentResponse }>;
	stringifyResult(result: ACPRunAgentResponse): string;
}

export const IACPService = createDecorator<IACPService>('acpConfigService');



const ACP_CONFIG_FILE_NAME = 'acp.json';

// Default ACP servers that come pre-configured with A-Coder
const ACP_CONFIG_SAMPLE = {
	acpServers: {
		'agent-hub': {
			url: 'http://localhost:8000',
		},
	}
}
const ACP_CONFIG_SAMPLE_STRING = JSON.stringify(ACP_CONFIG_SAMPLE, null, 2);


class ACPService extends Disposable implements IACPService {
	_serviceBrand: undefined;


	private readonly channel: IChannel // ACPChannel

	// list of ACP servers pulled from acpChannel
	state: ACPServiceState = {
		acpServerOfName: {},
		error: undefined,
	}

	// Emitters for server events
	private readonly _onDidChangeState = new Emitter<void>();
	public readonly onDidChangeState = this._onDidChangeState.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IEditorService private readonly editorService: IEditorService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
		this.channel = this.mainProcessService.getChannel('void-channel-acp');

		const onEvent = (e: ACPServerEventResponse) => {
			this._setACPServerState(e.response.name, e.response.newServer)
		}
		this._register((this.channel.listen('onAdd_server') satisfies Event<ACPServerEventResponse>)(onEvent));
		this._register((this.channel.listen('onUpdate_server') satisfies Event<ACPServerEventResponse>)(onEvent));
		this._register((this.channel.listen('onDelete_server') satisfies Event<ACPServerEventResponse>)(onEvent));

		this._initialize();
	}


	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState;

			// Create acp.json if it doesn't exist
			const acpConfigUri = await this._getACPConfigFilePath();
			const fileExists = await this._configFileExists(acpConfigUri);
			if (!fileExists) {
				await this._createACPConfigFile(acpConfigUri);
				console.log('ACP Config file created:', acpConfigUri.toString());
			}
			await this._addACPConfigFileWatcher();
			await this._refreshACPServers();
		} catch (error) {
			console.error('Error initializing ACPService:', error);
		}
	}

	private readonly _setACPServerState = (serverName: string, newServer: ACPAgentState | undefined) => {
		if (newServer === undefined) {
			// Remove the server from the state
			const { [serverName]: removed, ...remainingServers } = this.state.acpServerOfName;
			this.state = {
				...this.state,
				acpServerOfName: remainingServers
			}
		} else {
			// Add or update the server
			this.state = {
				...this.state,
				acpServerOfName: {
					...this.state.acpServerOfName,
					[serverName]: newServer
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
	private async _createACPConfigFile(acpConfigUri: URI): Promise<void> {
		const buffer = VSBuffer.fromString(ACP_CONFIG_SAMPLE_STRING);
		await this.fileService.createFile(acpConfigUri, buffer);
	}


	private async _addACPConfigFileWatcher(): Promise<void> {
		const acpConfigUri = await this._getACPConfigFilePath();
		this._register(
			this.fileService.watch(acpConfigUri)
		)

		this._register(this.fileService.onDidFilesChange(async e => {
			if (!e.contains(acpConfigUri)) return
			await this._refreshACPServers();
		}));
	}

	// Client-side functions

	public async revealACPConfigFile(): Promise<void> {
		try {
			const acpConfigUri = await this._getACPConfigFilePath();
			await this.editorService.openEditor({
				resource: acpConfigUri,
				options: {
					pinned: true,
					revealIfOpened: true,
				}
			});
		} catch (error) {
			console.error('Error opening ACP config file:', error);
		}
	}

	public getACPAgents(): InternalToolInfo[] | undefined {
		const allTools: InternalToolInfo[] = []
		for (const serverName in this.state.acpServerOfName) {
			const server = this.state.acpServerOfName[serverName];
			if (!server.agents) continue;
			for (const agent of server.agents) {
				allTools.push({
					description: agent.description || `ACP agent "${agent.name}" on server "${serverName}"`,
					params: {
						input: {
							description: 'The prompt or task to send to this agent',
						}
					},
					name: `acp_${serverName}_${agent.name}`,
					acpServerName: serverName,
					acpAgentName: agent.name,
				})
			}
		}
		if (allTools.length === 0) return undefined
		return allTools
	}

	private async _getACPConfigFilePath(): Promise<URI> {
		const appName = this.productService.dataFolderName
		const userHome = await this.pathService.userHome();
		const uri = URI.joinPath(userHome, appName, ACP_CONFIG_FILE_NAME)
		return uri
	}

	private async _configFileExists(acpConfigUri: URI): Promise<boolean> {
		try {
			await this.fileService.stat(acpConfigUri);
			return true;
		} catch (error) {
			return false;
		}
	}


	private async _parseACPConfigFile(): Promise<ACPConfigFileJSON | null> {
		const acpConfigUri = await this._getACPConfigFilePath();
		try {
			const fileContent = await this.fileService.readFile(acpConfigUri);
			const contentString = fileContent.value.toString();
			const configFileJson = JSON.parse(contentString);
			if (!configFileJson.acpServers) {
				throw new Error('Missing acpServers property');
			}
			return configFileJson as ACPConfigFileJSON;
		} catch (error) {
			const fullError = `Error parsing ACP config file: ${error}`;
			this._setHasError(fullError)
			return null;
		}
	}


	// Handle server state changes
	private async _refreshACPServers(): Promise<void> {

		this._setHasError(undefined)

		const newConfigFileJSON = await this._parseACPConfigFile();
		if (!newConfigFileJSON) { console.log(`Not setting state: ACP config file not found`); return }
		if (!newConfigFileJSON?.acpServers) { console.log(`Not setting state: ACP config file did not have an 'acpServers' field`); return }


		const oldConfigFileNames = Object.keys(this.state.acpServerOfName)
		const newConfigFileNames = Object.keys(newConfigFileJSON.acpServers)

		const addedServerNames = newConfigFileNames.filter(serverName => !oldConfigFileNames.includes(serverName)); // in new and not in old
		const removedServerNames = oldConfigFileNames.filter(serverName => !newConfigFileNames.includes(serverName)); // in old and not in new

		// set isOn to any new servers in the config
		const addedUserStateOfName: MCPUserStateOfName = {}
		for (const name of addedServerNames) { addedUserStateOfName[name] = { isOn: true } }
		await this.voidSettingsService.addMCPUserStateOfNames(addedUserStateOfName);

		// delete isOn for any servers that no longer show up in the config
		await this.voidSettingsService.removeMCPUserStateOfNames(removedServerNames);

		// set all servers to loading
		for (const serverName in newConfigFileJSON.acpServers) {
			this._setACPServerState(serverName, { status: 'loading', agents: [] })
		}
		const updatedServerNames = Object.keys(newConfigFileJSON.acpServers).filter(serverName => !addedServerNames.includes(serverName) && !removedServerNames.includes(serverName))

		try {
			await this.channel.call('refreshACPServers', {
				acpConfigFileJSON: newConfigFileJSON,
				addedServerNames,
				removedServerNames,
				updatedServerNames,
				userStateOfName: this.voidSettingsService.state.mcpUserStateOfName,
			})
		} catch (err) {
			this._setHasError(String(err))
		}
	}

	stringifyResult(result: ACPRunAgentResponse): string {
		if (result.event === 'error') {
			return `Error: ${result.text}`
		}
		return result.text || ''
	}

	// toggle ACP server and update isOn in void settings
	public async toggleServerIsOn(serverName: string, isOn: boolean): Promise<void> {
		this._setACPServerState(serverName, { status: 'loading', agents: [] })

		await this.voidSettingsService.setMCPServerState(serverName, { isOn });
		await this.channel.call('toggleACPServer', { serverName, isOn })
	}


	public async callACPAgent(agentData: { serverName: string; agentName: string; input: string }): Promise<{ result: ACPRunAgentResponse }> {
		const result = await this.channel.call<ACPRunAgentResponse>('runAgent', {
			serverName: agentData.serverName,
			agentName: agentData.agentName,
			input: agentData.input,
			contentType: 'text/plain',
		});
		if (result.event === 'error') {
			throw new Error(`Error: ${result.text}`)
		}
		return { result };
	}
}

registerSingleton(IACPService, ACPService, InstantiationType.Eager);
