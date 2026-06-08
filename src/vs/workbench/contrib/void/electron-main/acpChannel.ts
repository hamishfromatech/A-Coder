/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts
// can't make a service responsible for this, because it needs
// to be connected to the main process and node dependencies

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ACPConfigFileJSON, ACPConfigFileEntryJSON, ACPAgentState, ACPRunAgentResponse, ACPAgent } from '../common/acpServiceTypes.js';
import { MCPUserStateOfName } from '../common/voidSettingsTypes.js';
import fetch from 'node-fetch';

// ACP Server Event Types
export type ACPServerEvent = {
	name: string;
	prevServer?: ACPAgentState;
	newServer?: ACPAgentState;
};

export type ACPServerEventResponse = { response: ACPServerEvent };

// Client info for tracking connections
interface ACPConnectionInfo {
	url: string;
	isOn: boolean;
	agents: ACPAgent[];
	status: 'success' | 'error' | 'offline';
	error?: string;
}

type InfoOfConnectionId = {
	[connectionId: string]: ACPConnectionInfo | undefined;
};

export class ACPChannel implements IServerChannel {

	private readonly infoOfConnectionId: InfoOfConnectionId = {};
	private readonly _refreshingServerNames: Set<string> = new Set();

	// ACP emitters
	private readonly acpEmitters = {
		serverEvent: {
			onAdd: new Emitter<ACPServerEventResponse>(),
			onUpdate: new Emitter<ACPServerEventResponse>(),
			onDelete: new Emitter<ACPServerEventResponse>(),
		}
	} satisfies {
		serverEvent: {
			onAdd: Emitter<ACPServerEventResponse>;
			onUpdate: Emitter<ACPServerEventResponse>;
			onDelete: Emitter<ACPServerEventResponse>;
		};
	};

	constructor() { }

	// browser uses this to listen for changes
	listen(_: unknown, event: string): Event<any> {
		if (event === 'onAdd_server') return this.acpEmitters.serverEvent.onAdd.event;
		else if (event === 'onUpdate_server') return this.acpEmitters.serverEvent.onUpdate.event;
		else if (event === 'onDelete_server') return this.acpEmitters.serverEvent.onDelete.event;
		else throw new Error(`Event not found: ${event}`);
	}

	// browser uses this to call (see this.channel.call() in acpService.ts for all usages)
	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			if (command === 'refreshACPServers') {
				await this._refreshACPServers(params);
			}
			else if (command === 'closeAllACPServers') {
				await this._closeAllACPServers();
			}
			else if (command === 'toggleACPServer') {
				await this._toggleACPServer(params.serverName, params.isOn);
			}
			else if (command === 'runAgent') {
				const { serverName, agentName, input, contentType } = params;
				return await this._runAgent(serverName, agentName, input, contentType || 'text/plain');
			}
			else {
				throw new Error(`Void ACP: command "${command}" not recognized.`);
			}
		}
		catch (e) {
			console.error('ACP channel: Call Error:', e);
			throw e;
		}
	}

	/**
	 * Dispose the channel and clean up all resources
	 */
	dispose() {
		this._closeAllACPServers().catch(err => console.error('[ACP] Error during dispose:', err));
		this.acpEmitters.serverEvent.onAdd.dispose();
		this.acpEmitters.serverEvent.onUpdate.dispose();
		this.acpEmitters.serverEvent.onDelete.dispose();
	}

	// server functions

	private async _refreshACPServers(params: { acpConfigFileJSON: ACPConfigFileJSON; userStateOfName: MCPUserStateOfName; addedServerNames: string[]; removedServerNames: string[]; updatedServerNames: string[] }) {
		const {
			acpConfigFileJSON,
			userStateOfName,
			addedServerNames,
			removedServerNames,
			updatedServerNames,
		} = params;

		const { acpServers: acpServersJSON } = acpConfigFileJSON;

		const allChanges: { type: 'added' | 'removed' | 'updated'; serverName: string }[] = [
			...addedServerNames.map(n => ({ serverName: n, type: 'added' as const })),
			...removedServerNames.map(n => ({ serverName: n, type: 'removed' as const })),
			...updatedServerNames.map(n => ({ serverName: n, type: 'updated' as const })),
		];

		await Promise.all(
			allChanges.map(async ({ serverName, type }) => {
				if (this._refreshingServerNames.has(serverName)) return;
				this._refreshingServerNames.add(serverName);

				try {
					const prevServer = this.infoOfConnectionId[serverName];

					// close and delete the old connection
					if (type === 'removed' || type === 'updated') {
						delete this.infoOfConnectionId[serverName];
						this.acpEmitters.serverEvent.onDelete.fire({ response: { prevServer: prevServer ? this._infoToAgentState(prevServer) : undefined, name: serverName } });
					}

					// create a new connection
					if (type === 'added' || type === 'updated') {
						const serverConfig = acpServersJSON[serverName];
						if (!serverConfig) {
							throw new Error(`Missing config for ACP server ${serverName}`);
						}
						const isOn = userStateOfName[serverName]?.isOn ?? true;
						const clientInfo = await this._createConnection(serverConfig, serverName, isOn);
						this.infoOfConnectionId[serverName] = clientInfo;
						this.acpEmitters.serverEvent.onAdd.fire({ response: { newServer: this._infoToAgentState(clientInfo), name: serverName } });
					}
				} finally {
					this._refreshingServerNames.delete(serverName);
				}
			})
		);
	}

	private async _createConnectionUnsafe(server: ACPConfigFileEntryJSON, serverName: string, isOn: boolean): Promise<ACPConnectionInfo> {
		const urlStr = typeof server.url === 'string' ? server.url : (server.url as any)?.toString?.() || '';
		if (!urlStr) {
			throw new Error(`ACP server "${serverName}" has no URL configured`);
		}

		// Normalize URL
		const baseUrl = urlStr.endsWith('/') ? urlStr.slice(0, -1) : urlStr;

		// Discover agents from the ACP server
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...server.headers,
		};

		console.log(`[ACP] Discovering agents from ${serverName} at ${baseUrl}`);

		// ACP spec: GET /agents to list agents
		const agentsUrl = `${baseUrl}/agents`;
		const agentsResponse = await fetch(agentsUrl, { headers, timeout: 15000 } as any);

		if (!agentsResponse.ok) {
			throw new Error(`ACP server "${serverName}" returned ${agentsResponse.status} ${agentsResponse.statusText}`);
		}

		const agentsData = await agentsResponse.json() as any;
		// Handle both { agents: [...] } and direct array response
		const agents: ACPAgent[] = Array.isArray(agentsData) ? agentsData : (agentsData.agents || agentsData.items || []);

		console.log(`[ACP] Discovered ${agents.length} agents from ${serverName}`);

		return {
			url: baseUrl,
			isOn,
			agents,
			status: isOn ? 'success' : 'offline',
		};
	}

	private async _createConnection(serverConfig: ACPConfigFileEntryJSON, serverName: string, isOn = true): Promise<ACPConnectionInfo> {
		try {
			return await this._createConnectionUnsafe(serverConfig, serverName, isOn);
		} catch (err) {
			console.error(`[ACP] Failed to connect to server "${serverName}":`, err);
			return {
				url: typeof serverConfig.url === 'string' ? serverConfig.url : (serverConfig.url as any)?.toString?.() || '',
				isOn,
				agents: [],
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	private _infoToAgentState(info: ACPConnectionInfo): ACPAgentState {
		if (info.status === 'error') {
		return {
			status: 'error',
			error: info.error || 'Unknown error',
			url: info.url,
		};
		}
		return {
			status: info.status === 'success' ? (info.isOn ? 'success' : 'offline') : 'offline',
			agents: info.agents,
			url: info.url,
		};
	}

	private async _closeAllACPServers() {
		const serverNames = Object.keys(this.infoOfConnectionId);
		for (const serverName of serverNames) {
			delete this.infoOfConnectionId[serverName];
		}
		console.log('Closed all ACP server connections');
	}

	private async _toggleACPServer(serverName: string, isOn: boolean) {
		if (this._refreshingServerNames.has(serverName)) {
			console.warn(`[ACP] Cannot toggle server ${serverName}: refresh already in progress`);
			throw new Error(`Server ${serverName} is currently being refreshed`);
		}

		const existing = this.infoOfConnectionId[serverName];
		if (!existing) {
			throw new Error(`ACP server ${serverName} not found, cannot toggle`);
		}

		const prevState = this._infoToAgentState(existing);
		existing.isOn = isOn;
		existing.status = isOn ? 'success' : 'offline';

		this.acpEmitters.serverEvent.onUpdate.fire({
			response: {
				name: serverName,
				newServer: this._infoToAgentState(existing),
				prevServer: prevState,
			}
		});
	}

	// Run an ACP agent synchronously
	private async _runAgent(serverName: string, agentName: string, input: string, contentType: string): Promise<ACPRunAgentResponse> {
		const connection = this.infoOfConnectionId[serverName];
		if (!connection) {
			throw new Error(`ACP server "${serverName}" not found`);
		}
		if (connection.status !== 'success' || !connection.isOn) {
			throw new Error(`ACP server "${serverName}" is offline or errored`);
		}

		const agentExists = connection.agents.some(a => a.name === agentName);
		if (!agentExists) {
			throw new Error(`Agent "${agentName}" not found on ACP server "${serverName}". Available agents: ${connection.agents.map(a => a.name).join(', ')}`);
		}

		console.log(`[ACP] Running agent "${agentName}" on server "${serverName}"`);

		const baseUrl = connection.url;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		// ACP spec: POST /runs to create a run
		const runsUrl = `${baseUrl}/runs`;
		const requestBody = {
			agent: agentName,
			input: [
				{
					parts: [
						{
							content: input,
							content_type: contentType,
						}
					]
				}
			]
		};

		const response = await fetch(runsUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody),
			timeout: 120000, // 2 minutes for agent execution
		} as any);

		if (!response.ok) {
			const errorText = await response.text().catch(() => `HTTP ${response.status}`);
			throw new Error(`ACP run failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const result = await response.json() as any;

		// Parse output messages into a single text
		let outputText = '';
		if (result.output && Array.isArray(result.output)) {
			for (const msg of result.output) {
				if (msg.parts && Array.isArray(msg.parts)) {
					for (const part of msg.parts) {
						if (part.content) {
							outputText += part.content;
						}
					}
				}
			}
		}

		return {
			text: outputText || JSON.stringify(result, null, 2),
			status: result.status || 'completed',
			event: 'text',
			agentName,
			serverName,
		};
	}
}
