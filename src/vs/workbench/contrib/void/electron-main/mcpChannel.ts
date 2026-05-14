/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts
// can't make a service responsible for this, because it needs
// to be connected to the main process and node dependencies

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { MCPConfigFileJSON, MCPConfigFileEntryJSON, MCPServer, RawMCPToolCall, MCPToolErrorResponse, MCPServerEventResponse, MCPToolCallParams } from '../common/mcpServiceTypes.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCPUserStateOfName } from '../common/voidSettingsTypes.js';
import { platform } from 'os'
import { existsSync, readdirSync } from 'fs';

const getClientConfig = (serverName: string) => {
	return {
		name: `${serverName}-client`,
		version: '0.1.0',
		// debug: true,
	}
}


type MCPServerNonError = MCPServer & { status: Omit<MCPServer['status'], 'error'> }
type MCPServerError = MCPServer & { status: 'error' }



type ClientInfo = {
	_client: Client, // _client is the client that connects with an mcp client. We're calling mcp clients "server" everywhere except here for naming consistency.
	mcpServerEntryJSON: MCPConfigFileEntryJSON,
	mcpServer: MCPServerNonError,
} | {
	_client?: undefined,
	mcpServerEntryJSON: MCPConfigFileEntryJSON,
	mcpServer: MCPServerError,
}

type InfoOfClientId = {
	[clientId: string]: ClientInfo
}

export class MCPChannel implements IServerChannel {

	private readonly infoOfClientId: InfoOfClientId = {}
	private readonly _refreshingServerNames: Set<string> = new Set()

	// mcp emitters
	private readonly mcpEmitters = {
		serverEvent: {
			onAdd: new Emitter<MCPServerEventResponse>(),
			onUpdate: new Emitter<MCPServerEventResponse>(),
			onDelete: new Emitter<MCPServerEventResponse>(),
		}
	} satisfies {
		serverEvent: {
			onAdd: Emitter<MCPServerEventResponse>,
			onUpdate: Emitter<MCPServerEventResponse>,
			onDelete: Emitter<MCPServerEventResponse>,
		}
	}

	constructor(
	) { }

	// browser uses this to listen for changes
	listen(_: unknown, event: string): Event<any> {

		// server events
		if (event === 'onAdd_server') return this.mcpEmitters.serverEvent.onAdd.event;
		else if (event === 'onUpdate_server') return this.mcpEmitters.serverEvent.onUpdate.event;
		else if (event === 'onDelete_server') return this.mcpEmitters.serverEvent.onDelete.event;
		// else if (event === 'onLoading_server') return this.mcpEmitters.serverEvent.onChangeLoading.event;

		// tool call events

		// handle unknown events
		else throw new Error(`Event not found: ${event}`);
	}

	// browser uses this to call (see this.channel.call() in mcpConfigService.ts for all usages)
	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			if (command === 'refreshMCPServers') {
				await this._refreshMCPServers(params)
			}
			else if (command === 'closeAllMCPServers') {
				await this._closeAllMCPServers()
			}
			else if (command === 'toggleMCPServer') {
				await this._toggleMCPServer(params.serverName, params.isOn)
			}
			else if (command === 'callTool') {
				const p: MCPToolCallParams = params
				const response = await this._safeCallTool(p.serverName, p.toolName, p.params)
				return response
			}
			else {
				throw new Error(`Void sendLLM: command "${command}" not recognized.`)
			}
		}
		catch (e) {
			console.error('mcp channel: Call Error:', e)
			throw e // Re-throw so the caller knows there was an error
		}
	}

	/**
	 * Dispose the channel and clean up all resources
	 */
	dispose() {
		this._closeAllMCPServers().catch(err => console.error('[MCP] Error during dispose:', err));
		this.mcpEmitters.serverEvent.onAdd.dispose();
		this.mcpEmitters.serverEvent.onUpdate.dispose();
		this.mcpEmitters.serverEvent.onDelete.dispose();
	}

	// server functions


	private async _refreshMCPServers(params: { mcpConfigFileJSON: MCPConfigFileJSON, userStateOfName: MCPUserStateOfName, addedServerNames: string[], removedServerNames: string[], updatedServerNames: string[] }) {

		const {
			mcpConfigFileJSON,
			userStateOfName,
			addedServerNames,
			removedServerNames,
			updatedServerNames,
		} = params

		const { mcpServers: mcpServersJSON } = mcpConfigFileJSON

		const allChanges: { type: 'added' | 'removed' | 'updated', serverName: string }[] = [
			...addedServerNames.map(n => ({ serverName: n, type: 'added' }) as const),
			...removedServerNames.map(n => ({ serverName: n, type: 'removed' }) as const),
			...updatedServerNames.map(n => ({ serverName: n, type: 'updated' }) as const),
		]

		await Promise.all(
			allChanges.map(async ({ serverName, type }) => {

				// check if already refreshing
				if (this._refreshingServerNames.has(serverName)) return
				this._refreshingServerNames.add(serverName)

				try {
					const prevServer = this.infoOfClientId[serverName]?.mcpServer;

					// close and delete the old client
					if (type === 'removed' || type === 'updated') {
						await this._closeClient(serverName)
						delete this.infoOfClientId[serverName]
						this.mcpEmitters.serverEvent.onDelete.fire({ response: { prevServer, name: serverName, } })
					}

					// create a new client
					if (type === 'added' || type === 'updated') {
						const serverConfig = mcpServersJSON[serverName]
						if (!serverConfig) {
							throw new Error(`Missing config for server ${serverName}`)
						}
						const clientInfo = await this._createClient(serverConfig, serverName, userStateOfName[serverName]?.isOn)
						this.infoOfClientId[serverName] = clientInfo
						this.mcpEmitters.serverEvent.onAdd.fire({ response: { newServer: clientInfo.mcpServer, name: serverName, } })
					}
				} finally {
					this._refreshingServerNames.delete(serverName)
				}
			})
		)

	}

	private async _createClientUnsafe(server: MCPConfigFileEntryJSON, serverName: string, isOn: boolean): Promise<ClientInfo> {

		const clientConfig = getClientConfig(serverName)
		const client = new Client(clientConfig)
		let transport: Transport | undefined;
		let info: MCPServerNonError;

		if (server.url) {
			// first try HTTP, fall back to SSE
			try {
				console.log(`[MCP] Attempting HTTP connection to ${serverName} at ${server.url}`);
				transport = new StreamableHTTPClientTransport(server.url);
				await client.connect(transport);
				console.log(`[MCP] Connected via HTTP to ${serverName}`);
				const { tools } = await client.listTools()
				const toolsWithUniqueName = tools.map(({ name, ...rest }: { name: string, [key: string]: any }) => ({ name: this._addUniquePrefix(name, serverName), mcpServerName: serverName, ...rest }))
				console.log(`\u{2705} Loaded ${toolsWithUniqueName.length} tools from ${serverName} via HTTP`);
				info = {
					status: isOn ? 'success' : 'offline',
					tools: toolsWithUniqueName,
					command: server.url.toString(),
				}
			} catch (httpErr) {
				// Clean up failed transport and client before retry
				try { await client.close(); } catch { /* ignore */ }
				try { transport?.close?.(); } catch { /* ignore */ }

				console.warn(`[MCP] HTTP failed for ${serverName}, trying SSE…`, httpErr);
				// Create a fresh client for SSE to avoid re-using a used client
				const sseClient = new Client(clientConfig);
				let sseTransport: Transport | undefined;
				try {
					sseTransport = new SSEClientTransport(server.url);
					await sseClient.connect(sseTransport);
					console.log(`[MCP] Connected via SSE to ${serverName}`);
					const { tools } = await sseClient.listTools()
					const toolsWithUniqueName = tools.map(({ name, ...rest }: { name: string, [key: string]: any }) => ({ name: this._addUniquePrefix(name, serverName), mcpServerName: serverName, ...rest }))
					console.log(`\u{2705} Loaded ${toolsWithUniqueName.length} tools from ${serverName} via SSE`);
					info = {
						status: isOn ? 'success' : 'offline',
						tools: toolsWithUniqueName,
						command: server.url.toString(),
					}
					// Return with the SSE client as the active client
					return { _client: sseClient, mcpServerEntryJSON: server, mcpServer: info }
				} catch (sseErr) {
					try { await sseClient.close(); } catch { /* ignore */ }
					try { sseTransport?.close?.(); } catch { /* ignore */ }
					console.error(`[MCP] \u{274C} Both HTTP and SSE failed for ${serverName}:`, {
						httpError: httpErr,
						sseError: sseErr,
						url: server.url
					});
					throw sseErr; // Re-throw to be caught by outer try-catch
				}
			}
		} else if (server.command) {
			// SECURITY: Avoid shell command injection by using StdioClientTransport directly
			// with an enhanced PATH in the environment, rather than constructing shell strings.
			const isProduction = process.env.NODE_ENV === 'production' || !process.env.VSCODE_DEV;
			let enhancedPath = process.env.PATH || '';

			if (isProduction && platform() === 'darwin') {
				// In production on macOS, add common npm global bin paths
				const homeDir = process.env.HOME || '';
				const additionalPaths = [
					'/usr/local/bin',
					'/opt/homebrew/bin',
					`${homeDir}/.npm-global/bin`,
					'/usr/bin',
					'/bin'
				];
				// Try to expand NVM paths manually
				const nvmBase = `${homeDir}/.nvm/versions/node`;
				try {
					if (existsSync(nvmBase)) {
						const versions = readdirSync(nvmBase);
						for (const version of versions) {
							const binPath = `${nvmBase}/${version}/bin`;
							if (existsSync(binPath)) {
								additionalPaths.push(binPath);
							}
						}
					}
				} catch {
					// Ignore fs errors
				}
				enhancedPath = `${additionalPaths.join(':')}:${enhancedPath}`;
				console.log(`[MCP] Production mode - enhanced PATH for npx: ${enhancedPath.substring(0, 200)}...`);
			}

			const env: Record<string, string> = {};
			for (const [key, value] of Object.entries({ ...server.env, ...process.env })) {
				if (value !== undefined) {
					env[key] = String(value);
				}
			}
			env['PATH'] = enhancedPath;

			transport = new StdioClientTransport({
				command: server.command,
				args: server.args || [],
				env,
			});

			await client.connect(transport)

			// Get the tools from the server
			const { tools } = await client.listTools()
			const toolsWithUniqueName = tools.map(({ name, ...rest }: { name: string, [key: string]: any }) => ({ name: this._addUniquePrefix(name, serverName), mcpServerName: serverName, ...rest }))
			console.log(`\u{2705} Loaded ${toolsWithUniqueName.length} tools from ${serverName} (stdio)`);

			// Create a full command string for display
			const fullCommand = `${server.command} ${server.args?.join(' ') || ''}`

			// Format server object
			info = {
				status: isOn ? 'success' : 'offline',
				tools: toolsWithUniqueName,
				command: fullCommand,
			}
		} else {
			throw new Error(`No url or command for server ${serverName}`);
		}

		return { _client: client, mcpServerEntryJSON: server, mcpServer: info }
	}

	private _addUniquePrefix(base: string, serverName: string) {
		// Don't add any prefix - just use the original tool name
		// The mcpServerName property will handle routing to the correct server
		return base;
	}

	private async _createClient(serverConfig: MCPConfigFileEntryJSON, serverName: string, isOn = true): Promise<ClientInfo> {
		try {
			const c: ClientInfo = await this._createClientUnsafe(serverConfig, serverName, isOn)
			return c
		} catch (err) {
			console.error(`\u{274C} Failed to connect to server "${serverName}":`, err)
			const fullCommand = !serverConfig.command ? '' : `${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`
			const c: MCPServerError = { status: 'error', error: err + '', command: fullCommand, }
			return { mcpServerEntryJSON: serverConfig, mcpServer: c, }
		}
	}

	private async _closeAllMCPServers() {
		const closePromises = Object.keys(this.infoOfClientId).map(async (serverName) => {
			try {
				await this._closeClient(serverName)
			} catch (err) {
				console.error(`[MCP] Error closing server ${serverName}:`, err)
			}
			delete this.infoOfClientId[serverName]
		})
		await Promise.all(closePromises)
		console.log('Closed all MCP servers');
	}

	private async _closeClient(serverName: string) {
		const info = this.infoOfClientId[serverName]
		if (!info) return
		const { _client: client } = info
		if (client) {
			try {
				await client.close()
			} catch (err) {
				console.error(`[MCP] Error closing client for ${serverName}:`, err)
			}
		}
		console.log(`Closed MCP server ${serverName}`);
	}


	private async _toggleMCPServer(serverName: string, isOn: boolean) {
		// Guard against concurrent refresh
		if (this._refreshingServerNames.has(serverName)) {
			console.warn(`[MCP] Cannot toggle server ${serverName}: refresh already in progress`);
			throw new Error(`Server ${serverName} is currently being refreshed`);
		}

		const existing = this.infoOfClientId[serverName];
		if (!existing) {
			throw new Error(`Server ${serverName} not found, cannot toggle`);
		}

		const prevServer = existing.mcpServer
		// Handle turning on the server
		if (isOn) {
			// this.mcpEmitters.serverEvent.onChangeLoading.fire(getLoadingServerObject(serverName, isOn))
			const clientInfo = await this._createClientUnsafe(existing.mcpServerEntryJSON, serverName, isOn)
			// IMPORTANT: Store the new client info in the map
			this.infoOfClientId[serverName] = clientInfo
			this.mcpEmitters.serverEvent.onUpdate.fire({
				response: {
					name: serverName,
					newServer: clientInfo.mcpServer,
					prevServer: prevServer,
				}
			})
		}
		// Handle turning off the server
		else {
			// this.mcpEmitters.serverEvent.onChangeLoading.fire(getLoadingServerObject(serverName, isOn))
			await this._closeClient(serverName)
			// Keep the server entry but mark it as offline (error state)
			if (this.infoOfClientId[serverName]) {
				const offlineServer: MCPServerError = {
					status: 'error',
					error: 'Server is offline',
					command: this.infoOfClientId[serverName].mcpServerEntryJSON.command || this.infoOfClientId[serverName].mcpServerEntryJSON.url?.toString() || '',
				}
				this.infoOfClientId[serverName] = {
					mcpServerEntryJSON: this.infoOfClientId[serverName].mcpServerEntryJSON,
					mcpServer: offlineServer,
				}
			}

			this.mcpEmitters.serverEvent.onUpdate.fire({
				response: {
					name: serverName,
					newServer: {
						status: 'offline',
						tools: [],
						command: '',
						// Explicitly set error to undefined to reset the error state
						error: undefined,
					},
					prevServer: prevServer,
				}
			})
		}
	}

	// tool call functions

	private async _callTool(serverName: string, toolName: string, params: any): Promise<RawMCPToolCall> {
		const server = this.infoOfClientId[serverName]
		if (!server) throw new Error(`Server ${serverName} not found`)
		const { _client: client } = server
		if (!client) throw new Error(`Client for server ${serverName} not found`)

		console.log(`[mcpChannel] Calling tool "${toolName}" on server "${serverName}"`)
		
		// Call the tool with the provided parameters
		// Use the tool name as-is since we're not adding prefixes anymore
		const response = await client.callTool({
			name: toolName,
			arguments: params
		})
		const { content } = response as CallToolResult
		
		// Guard against empty content array
		if (!content || content.length === 0) {
			throw new Error(`Tool "${toolName}" on server "${serverName}" returned empty content`)
		}
		
		const returnValue = content[0]
		
		if (!returnValue || !returnValue.type) {
			throw new Error(`Tool "${toolName}" on server "${serverName}" returned invalid content: missing type`)
		}

		if (returnValue.type === 'text') {
			// handle text response

			if (response.isError) {
				throw new Error(`Tool call error: ${returnValue.text}`)
			}

			// handle success
			return {
				event: 'text',
				text: returnValue.text,
				toolName,
				serverName,
			}
		}

		// if (returnValue.type === 'audio') {
		// 	// handle audio response
		// }

		// if (returnValue.type === 'image') {
		// 	// handle image response
		// }

		// if (returnValue.type === 'resource') {
		// 	// handle resource response
		// }

		throw new Error(`Tool call error: We don\'t support ${returnValue.type} tool response yet for tool ${toolName} on server ${serverName}`)
	}

	// tool call error wrapper
	private async _safeCallTool(serverName: string, toolName: string, params: any): Promise<RawMCPToolCall> {
		try {
			const response = await this._callTool(serverName, toolName, params)
			return response
		} catch (err) {

			let errorMessage: string;

			if (typeof err === 'object' && err !== null && err['code']) {
				const code = err.code
				let codeDescription = ''
				if (code === -32700)
					codeDescription = 'Parse Error';
				if (code === -32600)
					codeDescription = 'Invalid Request';
				if (code === -32601)
					codeDescription = 'Method Not Found';
				if (code === -32602)
					codeDescription = 'Invalid Parameters';
				if (code === -32603)
					codeDescription = 'Internal Error';
				errorMessage = `${codeDescription}. Full response:\n${JSON.stringify(err, null, 2)}`
			}
			// Check if it's an MCP error with a code
			else if (typeof err === 'string') {
				// String error
				errorMessage = err;
			} else {
				// Unknown error format
				errorMessage = JSON.stringify(err, null, 2);
			}

			const fullErrorMessage = `\u{274C} Failed to call tool "${toolName}" on server "${serverName}": ${errorMessage}`;
			const errorResponse: MCPToolErrorResponse = {
				event: 'error',
				text: fullErrorMessage,
				toolName,
				serverName,
			}
			return errorResponse
		}
	}
}


