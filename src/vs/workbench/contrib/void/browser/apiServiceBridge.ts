/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChatThreadService } from './chatThreadService.js';
import { IToolsService } from './toolsService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IMCPService } from '../common/mcpService.js';
import { ChatMode } from '../common/voidSettingsTypes.js';

// console.log('[Void] Loading apiServiceBridge.ts');

export const IApiServiceBridge = createDecorator<IApiServiceBridge>('apiServiceBridge');

export interface IApiServiceBridge {
	readonly _serviceBrand: undefined;
	handleApiCall(method: string, params: any): Promise<any>;
}

/**
 * API Service Bridge (Renderer Process)
 * Handles API requests from the main process and forwards them to actual services
 */
export class ApiServiceBridge extends Disposable implements IApiServiceBridge {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
		@IToolsService private readonly toolsService: IToolsService,
		@IVoidSettingsService private readonly settingsService: IVoidSettingsService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IEditorService private readonly editorService: IEditorService,
		@IMCPService private readonly mcpService: IMCPService,
	) {
		super();
		this.initializeApiServer();
	}

	/**
	 * Handle API method calls from main process
	 */
	async handleApiCall(method: string, params: any): Promise<any> {
		switch (method) {
			// ===== Chat/Thread Methods =====
			case 'getThreads':
				return this.getThreads();

			case 'getThread':
				return this.getThread(params.threadId);

			case 'createThread':
				return this.createThread(params.name);

			case 'sendMessage':
				return this.sendMessage(params.threadId, params.message);

			case 'deleteThread':
				return this.deleteThread(params.threadId);

			case 'getThreadStatus':
				return this.getThreadStatus(params.threadId);

			case 'cancelThread':
				return this.cancelThread(params.threadId);

			case 'approveToolCall':
				return this.approveToolCall(params.threadId, params.toolId);

			case 'rejectToolCall':
				return this.rejectToolCall(params.threadId, params.toolId);

			// ===== Workspace Methods =====
			case 'getWorkspace':
				return this.getWorkspace();

			case 'getFiles':
				return this.getFiles(params.page, params.limit, params.filter);

			case 'getFileTree':
				return this.getFileTree();

			case 'getFolderContents':
				return this.getFolderContents(params.path);

			case 'readFile':
				return this.readFile(params.path);

			case 'readFileBinary':
				return this.readFileBinary(params.path);

			case 'getFileOutline':
				return this.getFileOutline(params.path);

			case 'searchFiles':
				return this.searchFiles(params.query, params.type);

			case 'getDiagnostics':
				return this.getDiagnostics();

			// ===== Planning Methods =====
			case 'getCurrentPlan':
				return this.getCurrentPlan();

			case 'createPlan':
				return this.createPlan(params.goal, params.tasks);

			case 'updateTaskStatus':
				return this.updateTaskStatus(params.taskId, params.status, params.notes);

			// ===== Settings Methods =====
			case 'getSettings':
				return this.getSettings();

			case 'getModels':
				return this.getModels();

			case 'getCurrentModel':
				return this.getCurrentModel();

			case 'setCurrentModel':
				return this.setCurrentModel(params.providerName, params.modelName);

			case 'getChatMode':
				return this.getChatMode();

			case 'setChatMode':
				return this.setChatMode(params.mode);

			// ===== MCP Methods =====
			case 'getMCPServers':
				return this.getMCPServers();

			case 'getMCPTools':
				return this.getMCPToolsList();

			case 'toggleMCPServer':
				return this.toggleMCPServer(params.serverName, params.isOn);

			default:
				throw new Error(`Unknown API method: ${method}`);
		}
	}

	/**
	 * Initialize API server and set up IPC communication
	 */
	private async initializeApiServer() {
		// console.log('[ApiServiceBridge] Initializing...');
		// Get API channel from main process
		const apiChannel = this.mainProcessService.getChannel('void-channel-api');

		// Subscribe to stream state changes and broadcast to WebSocket clients
		this._register(this.chatThreadService.onDidChangeStreamState(({ threadId }) => {
			this.broadcastStreamUpdate(threadId, apiChannel);
		}));

		// Also subscribe to thread changes for message updates
		this._register(this.chatThreadService.onDidChangeCurrentThread(() => {
			const currentThreadId = this.chatThreadService.state.currentThreadId;
			if (currentThreadId) {
				this.broadcastThreadUpdate(currentThreadId, apiChannel);
			}
		}));

		// Listen for API requests from main process using the event system
		this._register((apiChannel.listen('onApiRequest'))(async (e: unknown) => {
			const request = e as { method: string, params: any, requestId: string };
			try {
				// console.log(`[ApiServiceBridge] Handling API request: ${request.method}`);
				const result = await this.handleApiCall(request.method, request.params);

				// Send response back to main process
				await apiChannel.call('apiResponse', { requestId: request.requestId, result });
			} catch (error) {
				console.error(`[ApiServiceBridge] Error handling ${request.method}:`, error);

				// Send error back to main process
				await apiChannel.call('apiResponse', {
					requestId: request.requestId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}));

		// Register with the main process
		await apiChannel.call('registerRenderer', {});
		// console.log('[ApiServiceBridge] Registered with main process');
		// Check if API is enabled and start server
		const settings = this.settingsService.state.globalSettings;
		// console.log('[ApiServiceBridge] Current settings:', JSON.stringify(settings));

		// Send initial settings to main process
		await this.updateMainProcessSettings(settings);

		if (settings.apiEnabled) {
			// console.log('[ApiServiceBridge] API enabled, sending start command...');
			await apiChannel.call('startApiServer', {}).catch(err => {
				console.error('[API Bridge] Failed to start API server:', err);
			});
		} else {
			// console.log('[ApiServiceBridge] API disabled by default');
		}

		// Listen for settings changes
		this._register(this.settingsService.onDidChangeState(() => {
			const newSettings = this.settingsService.state.globalSettings;
			// console.log('[ApiServiceBridge] Settings changed:', newSettings.apiEnabled);

			// Update main process settings first
			this.updateMainProcessSettings(newSettings);

			if (newSettings.apiEnabled) {
				// console.log('[ApiServiceBridge] Starting API server...');
				apiChannel.call('startApiServer', {}).catch(err => {
					console.error('[API Bridge] Failed to start API server:', err);
				});
			} else {
				// console.log('[ApiServiceBridge] Stopping API server...');
				apiChannel.call('stopApiServer', {}).catch(err => {
					console.error('[API Bridge] Failed to stop API server:', err);
				});
			}
		}));
	}

	/**
	 * Update main process settings via IPC
	 */
	private async updateMainProcessSettings(settings: any) {
		try {
			// Use the existing void-channel-api instead of a separate settings channel
			const apiChannel = this.mainProcessService.getChannel('void-channel-api');
			const updateData = {
				enabled: settings.apiEnabled,
				port: settings.apiPort,
				tokens: settings.apiTokens,
				tunnelUrl: settings.apiTunnelUrl,
			};
			await apiChannel.call('updateApiSettings', updateData);
			console.log('[API Bridge] Updated main process API settings:', {
				enabled: updateData.enabled,
				port: updateData.port,
				tokensCount: updateData.tokens?.length || 0
			});
		} catch (err) {
			console.error('[API Bridge] Failed to update main process settings:', err);
		}
	}

	// ===== WebSocket Broadcasting =====

	/**
	 * Broadcast stream state updates to WebSocket clients
	 */
	private broadcastStreamUpdate(threadId: string, apiChannel: any) {
		const streamState = this.chatThreadService.streamState[threadId];
		if (!streamState) return;

		const event = {
			type: 'stream_update',
			channel: 'chat',
			event: 'stream_state_changed',
			data: {
				threadId,
				isRunning: streamState.isRunning,
				// LLM streaming info
				content: streamState.llmInfo?.displayContentSoFar || null,
				reasoning: streamState.llmInfo?.reasoningSoFar || null,
				toolCalls: streamState.llmInfo?.toolCallsSoFar || null,
				// Tool execution info
				toolInfo: streamState.toolInfo ? {
					toolName: streamState.toolInfo.toolName,
					toolParams: streamState.toolInfo.toolParams,
					content: streamState.toolInfo.content,
				} : null,
				// Error info
				error: streamState.error ? {
					message: streamState.error.message,
				} : null,
				// Token usage
				tokenUsage: streamState.tokenUsage || null,
			}
		};

		// Send to main process for WebSocket broadcast
		apiChannel.call('broadcast', event).catch((err: any) => {
			// Silently ignore broadcast errors (e.g., no clients connected)
		});
	}

	/**
	 * Broadcast thread updates (new messages, etc.) to WebSocket clients
	 */
	private broadcastThreadUpdate(threadId: string, apiChannel: any) {
		const thread = this.chatThreadService.state.allThreads[threadId];
		if (!thread) return;

		// Get the last message for the update
		const lastMessage = thread.messages[thread.messages.length - 1];
		if (!lastMessage) return;

		const event = {
			type: 'thread_update',
			channel: 'chat',
			event: 'message_added',
			data: {
				threadId,
				messageCount: thread.messages.length,
				lastMessage: {
					role: lastMessage.role,
					// Include content based on role
					...(lastMessage.role === 'user' && {
						content: (lastMessage as any).displayContent || (lastMessage as any).content,
					}),
					...(lastMessage.role === 'assistant' && {
						content: (lastMessage as any).displayContent,
						reasoning: (lastMessage as any).reasoning,
					}),
					...(lastMessage.role === 'tool' && {
						name: (lastMessage as any).name,
						type: (lastMessage as any).type,
						content: (lastMessage as any).content,
					}),
				},
				lastModified: thread.lastModified,
			}
		};

		// Send to main process for WebSocket broadcast
		apiChannel.call('broadcast', event).catch((err: any) => {
			// Silently ignore broadcast errors
		});
	}

	// ===== Chat/Thread Implementations =====

	private async getThreads() {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads) return [];
		return Object.values(allThreads).map((thread: any) => {
			// Get thread title from first user message (matches desktop UI behavior)
			let title = '';
			const firstUserMsg = thread.messages?.find((msg: any) => msg.role === 'user');
			if (firstUserMsg) {
				title = firstUserMsg.displayContent || firstUserMsg.content || '';
			}

			return {
				id: thread.id,
				title,
				createdAt: thread.createdAt,
				lastModified: thread.lastModified,
				messageCount: thread.messages?.length || 0,
			};
		});
	}

	private async getThread(threadId: string) {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads) throw new Error('No threads available');
		const thread = allThreads[threadId];
		if (!thread) {
			throw new Error('Thread not found');
		}
		return {
			id: thread.id,
			createdAt: thread.createdAt,
			lastModified: thread.lastModified,
			messages: thread.messages.map((msg: any) => {
				// Base message fields
				const message: any = {
					role: msg.role,
					timestamp: msg.timestamp,
				};

				// Handle different message types
				if (msg.role === 'user') {
					message.content = msg.content || '';
					message.displayContent = msg.displayContent || '';
					message.selections = msg.selections || null;
					message.images = msg.images || [];
					message.visionAnalysis = msg.visionAnalysis || undefined;
				} else if (msg.role === 'assistant') {
					message.content = msg.displayContent || '';
					message.displayContent = msg.displayContent || '';
					message.reasoning = msg.reasoning || '';
					message.anthropicReasoning = msg.anthropicReasoning || null;
				} else if (msg.role === 'tool') {
					// Tool messages contain planning/walkthrough results
					message.name = msg.name;
					message.content = msg.content || '';
					message.type = msg.type;
					message.params = msg.params || null;
					message.result = msg.result || null;
					message.id = msg.id || '';
					message.rawParams = msg.rawParams || {};
					message.mcpServerName = msg.mcpServerName || undefined;
				} else if (msg.role === 'interrupted_streaming_tool') {
					message.name = msg.name;
					message.mcpServerName = msg.mcpServerName || undefined;
				} else if (msg.role === 'checkpoint') {
					message.type = msg.type;
					message.voidFileSnapshotOfURI = msg.voidFileSnapshotOfURI || {};
					message.userModifications = msg.userModifications || { voidFileSnapshotOfURI: {} };
				}

				return message;
			}),
		};
	}

	private async createThread(_name?: string) {
		this.chatThreadService.openNewThread();
		const currentThread = this.chatThreadService.getCurrentThread();
		return {
			id: currentThread.id,
			createdAt: currentThread.createdAt,
		};
	}

	private async sendMessage(threadId: string, message: string) {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads || !allThreads[threadId]) {
			throw new Error('Thread not found');
		}

		// Send message via chat service
		await this.chatThreadService.addUserMessageAndStreamResponse({
			userMessage: message,
			threadId
		});

		return { success: true, threadId };
	}

	private async deleteThread(threadId: string) {
		this.chatThreadService.deleteThread(threadId);
		return { success: true };
	}

	private async getThreadStatus(threadId: string) {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads) throw new Error('No threads available');
		const thread = allThreads[threadId];
		if (!thread) {
			throw new Error('Thread not found');
		}

		// Check stream state for running status
		const streamState = this.chatThreadService.streamState[threadId];
		const isRunning = streamState?.isRunning === 'LLM' || streamState?.isRunning === 'tool';
		return {
			threadId,
			isRunning,
			lastActivity: thread.lastModified,
		};
	}

	private async cancelThread(threadId: string) {
		// Cancel any running operations for this thread
		await this.chatThreadService.abortRunning(threadId);
		return { success: true };
	}

	private async approveToolCall(threadId: string, toolId?: string) {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads || !allThreads[threadId]) {
			throw new Error('Thread not found');
		}

		// Check if thread is awaiting user approval
		const streamState = this.chatThreadService.streamState[threadId];
		if (streamState?.isRunning !== 'awaiting_user') {
			throw new Error('Thread is not awaiting user approval');
		}

		// Approve the pending tool call
		this.chatThreadService.approveLatestToolRequest(threadId, toolId);
		return { success: true };
	}

	private async rejectToolCall(threadId: string, toolId?: string) {
		const allThreads = this.chatThreadService.state.allThreads;
		if (!allThreads || !allThreads[threadId]) {
			throw new Error('Thread not found');
		}

		// Check if thread is awaiting user approval
		const streamState = this.chatThreadService.streamState[threadId];
		if (streamState?.isRunning !== 'awaiting_user') {
			throw new Error('Thread is not awaiting user approval');
		}

		// Reject the pending tool call
		this.chatThreadService.rejectLatestToolRequest(threadId, toolId);
		return { success: true };
	}

	// ===== Workspace Implementations =====

	private async getWorkspace() {
		// Get workspace root folders
		const workspace = this.workspaceContextService.getWorkspace();

		// Get open editors/files
		const openEditors = this.editorService.editors.map(editor => {
			const resource = editor.resource;
			return resource ? {
				uri: resource.toString(),
				path: resource.fsPath,
				name: resource.path.split('/').pop() || resource.path,
			} : null;
		}).filter(Boolean);

		// Get active editor
		const activeEditor = this.editorService.activeEditor;
		const activeFile = activeEditor?.resource ? {
			uri: activeEditor.resource.toString(),
			path: activeEditor.resource.fsPath,
			name: activeEditor.resource.path.split('/').pop() || activeEditor.resource.path,
		} : null;

		return {
			folders: workspace.folders.map((folder: any) => ({
				uri: folder.uri.toString(),
				name: folder.name,
				path: folder.uri.fsPath,
			})),
			openFiles: openEditors,
			activeFile,
		};
	}

	private async getFiles(page: number = 1, limit: number = 50, filter?: string) {
		const workspace = this.workspaceContextService.getWorkspace();
		const allFiles: Array<{ uri: string; name: string; path: string; type: 'file' | 'folder'; size?: number }> = [];

		// Recursively collect files from workspace folders
		const collectFiles = async (folderUri: URI, depth: number = 0): Promise<void> => {
			if (depth > 10) return; // Limit recursion depth
			try {
				const contents = await this.fileService.resolve(folderUri);
				if (contents.children) {
					for (const child of contents.children) {
						// Skip hidden files and common non-essential directories
						if (child.name.startsWith('.') ||
							child.name === 'node_modules' ||
							child.name === '__pycache__' ||
							child.name === 'dist' ||
							child.name === 'build') {
							continue;
						}

						const fileInfo = {
							uri: child.resource.toString(),
							name: child.name,
							path: child.resource.path,
							type: (child.isDirectory ? 'folder' : 'file') as 'file' | 'folder',
							size: child.isDirectory ? undefined : child.size,
						};

						// Apply filter if provided
						if (!filter || child.name.toLowerCase().includes(filter.toLowerCase())) {
							allFiles.push(fileInfo);
						}

						// Recurse into directories
						if (child.isDirectory) {
							await collectFiles(child.resource, depth + 1);
						}
					}
				}
			} catch (e) {
				console.error(`[apiServiceBridge] Error reading folder ${folderUri.toString()}:`, e);
			}
		};

		// Collect files from all workspace folders
		for (const folder of workspace.folders) {
			await collectFiles(folder.uri);
		}

		// Paginate results
		const startIdx = (page - 1) * limit;
		const endIdx = startIdx + limit;
		const paginatedFiles = allFiles.slice(startIdx, endIdx);

		return {
			files: paginatedFiles,
			page,
			limit,
			total: allFiles.length,
		};
	}

	private async getFileTree() {
		// Simplified - return workspace structure
		const workspace = this.workspaceContextService.getWorkspace();
		return {
			roots: workspace.folders.map((folder: any) => ({
				uri: folder.uri.toString(),
				name: folder.name,
			})),
		};
	}

	private async getFolderContents(folderPath: string) {
		try {
			// If no path provided, return root folders
			if (!folderPath) {
				const workspace = this.workspaceContextService.getWorkspace();
				return {
					path: '',
					name: 'workspace',
					type: 'folder',
					children: workspace.folders.map((folder: any) => ({
						name: folder.name,
						path: folder.name,
						type: 'folder',
						uri: folder.uri.toString(),
					})),
				};
			}

			// Parse the folder path and get contents
			const uri = URI.file(folderPath);
			const folderContents = await this.fileService.resolve(uri);

			const children = [];
			if (folderContents.children) {
				for (const child of folderContents.children) {
					children.push({
						name: child.name,
						path: child.resource.path,
						type: child.isDirectory ? 'folder' : 'file',
						uri: child.resource.toString(),
						size: child.isDirectory ? undefined : child.size,
					});
				}
			}

			return {
				path: folderPath,
				name: folderContents.name || folderPath.split('/').pop() || 'folder',
				type: 'folder',
				children,
			};
		} catch (err) {
			throw new Error(`Failed to get folder contents: ${err}`);
		}
	}

	private async readFile(path: string) {
		try {
			const uri = URI.parse(path);
			const content = await this.fileService.readFile(uri);
			return {
				path,
				content: content.value.toString(),
				size: content.value.byteLength,
			};
		} catch (err) {
			throw new Error(`Failed to read file: ${err}`);
		}
	}

	private async readFileBinary(path: string) {
		try {
			const uri = URI.parse(path);
			const content = await this.fileService.readFile(uri);

			// Get filename from path
			const filename = path.split('/').pop() || 'file';

			// Determine content type from extension
			const ext = filename.split('.').pop()?.toLowerCase() || '';
			const contentTypeMap: Record<string, string> = {
				// Audio
				'mp3': 'audio/mpeg',
				'wav': 'audio/wav',
				'ogg': 'audio/ogg',
				'flac': 'audio/flac',
				'm4a': 'audio/mp4',
				'aac': 'audio/aac',
				'webm': 'audio/webm',
				// Video
				'mp4': 'video/mp4',
				// 'webm' already defined above as audio/webm (can be both)
				'mkv': 'video/x-matroska',
				'avi': 'video/x-msvideo',
				'mov': 'video/quicktime',
				// Images
				'png': 'image/png',
				'jpg': 'image/jpeg',
				'jpeg': 'image/jpeg',
				'gif': 'image/gif',
				'webp': 'image/webp',
				'svg': 'image/svg+xml',
				// Documents
				'pdf': 'application/pdf',
				'zip': 'application/zip',
			};
			const contentType = contentTypeMap[ext] || 'application/octet-stream';

			// Convert to base64 for IPC transfer (binary data can't be sent directly)
			const base64Data = Buffer.from(content.value.buffer).toString('base64');

			return {
				path,
				filename,
				contentType,
				data: base64Data,
				size: content.value.byteLength,
			};
		} catch (err) {
			throw new Error(`Failed to read binary file: ${err}`);
		}
	}

	private async getFileOutline(path: string) {
		// This would require integration with the outline service
		// For now, return a placeholder
		return {
			path,
			outline: [],
		};
	}

	private async searchFiles(query: string, type: string = 'content') {
		// This would require integration with the search service
		// For now, return empty results
		return {
			query,
			type,
			results: [],
		};
	}

	private async getDiagnostics() {
		// This would require integration with the diagnostics service
		// For now, return empty diagnostics
		return {
			diagnostics: [],
		};
	}

	// ===== Planning Implementations =====

	private async getCurrentPlan() {
		const planningService = this.toolsService.getPlanningService();
		const plan = planningService.getPlanStatus();
		return plan;
	}

	private async createPlan(goal: string, tasks: any[]) {
		const planningService = this.toolsService.getPlanningService();
		const plan = planningService.createPlan(goal, tasks);
		return plan;
	}

	private async updateTaskStatus(taskId: string, status: string, notes?: string) {
		const planningService = this.toolsService.getPlanningService();
		const task = planningService.updateTaskStatus(taskId, status as any, notes);
		return task;
	}

	// ===== Settings Implementations =====

	private async getSettings() {
		const state = this.settingsService.state;
		return {
			globalSettings: state.globalSettings,
			modelSelectionOfFeature: state.modelSelectionOfFeature,
		};
	}

	private async getModels() {
		const state = this.settingsService.state;
		return {
			models: state._modelOptions,
		};
	}

	private async getCurrentModel() {
		const state = this.settingsService.state;
		const modelSelection = state.modelSelectionOfFeature?.['Chat'] || state.modelSelectionOfFeature?.['Ctrl+K'];

		if (!modelSelection) {
			return {
				providerName: null,
				modelName: null,
				available: false,
			};
		}

		return {
			providerName: modelSelection.providerName,
			modelName: modelSelection.modelName,
			available: true,
		};
	}

	private async setCurrentModel(providerName: string, modelName: string) {
		const modelSelection = { providerName, modelName } as any;
		// Update model selection for Chat (main chat) and Ctrl+K (inline)
		this.settingsService.setModelSelectionOfFeature('Chat', modelSelection);
		this.settingsService.setModelSelectionOfFeature('Ctrl+K', modelSelection);

		return {
			providerName,
			modelName,
			success: true,
		};
	}

	private async getChatMode() {
		const state = this.settingsService.state;
		const mode = state.globalSettings?.chatMode || 'chat';

		// Map internal mode names to display names for API consumers
		const modeInfo = {
			'chat': { mode: 'chat', displayName: 'Chat', description: 'Conversation only, no tools' },
			'plan': { mode: 'plan', displayName: 'Plan', description: 'Research, plan & document' },
			'code': { mode: 'code', displayName: 'Code', description: 'Edit files & run commands' },
			'learn': { mode: 'learn', displayName: 'Learn', description: 'Interactive learning & practice' },
		};

		return {
			...modeInfo[mode as keyof typeof modeInfo] || modeInfo['chat'],
			availableModes: [
				{ mode: 'chat', displayName: 'Chat', description: 'Conversation only, no tools' },
				{ mode: 'plan', displayName: 'Plan', description: 'Research, plan & document' },
				{ mode: 'code', displayName: 'Code', description: 'Edit files & run commands' },
				{ mode: 'learn', displayName: 'Learn', description: 'Interactive learning & practice' },
			],
		};
	}

	private async setChatMode(mode: ChatMode) {
		this.settingsService.setGlobalSetting('chatMode', mode);

		const modeInfo = {
			'chat': { displayName: 'Chat', description: 'Conversation only, no tools' },
			'plan': { displayName: 'Plan', description: 'Research, plan & document' },
			'code': { displayName: 'Code', description: 'Edit files & run commands' },
			'learn': { displayName: 'Learn', description: 'Interactive learning & practice' },
		};

		return {
			mode,
			...modeInfo[mode],
			success: true,
		};
	}

	// ===== MCP Implementations =====

	private async getMCPServers() {
		const mcpState = this.mcpService.state;
		const servers = Object.entries(mcpState.mcpServerOfName).map(([name, server]) => ({
			name,
			status: server.status,
			toolCount: server.tools?.length || 0,
			tools: server.tools?.map(tool => ({
				name: tool.name,
				description: tool.description || '',
			})) || [],
		}));

		return {
			servers,
			error: mcpState.error || null,
		};
	}

	private async getMCPToolsList() {
		const tools = this.mcpService.getMCPTools();
		if (!tools) {
			return { tools: [] };
		}

		return {
			tools: tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				serverName: tool.mcpServerName,
				params: tool.params,
			})),
		};
	}

	private async toggleMCPServer(serverName: string, isOn: boolean) {
		await this.mcpService.toggleServerIsOn(serverName, isOn);
		return { success: true, serverName, isOn };
	}
}

registerSingleton(IApiServiceBridge, ApiServiceBridge, InstantiationType.Delayed);

/**
 * Workbench Contribution to ensure ApiServiceBridge is instantiated on startup
 */
export class ApiServiceBridgeContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.apiServiceBridge';

	constructor(
		@IApiServiceBridge _apiServiceBridge: IApiServiceBridge,
	) {
		// console.log('[ApiServiceBridgeContribution] Initialized, forcing ApiServiceBridge instantiation');
	}
}

registerWorkbenchContribution2(ApiServiceBridgeContribution.ID, ApiServiceBridgeContribution, WorkbenchPhase.AfterRestored);
