/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ApiRouter } from './apiRouter.js';

/**
 * API Routes Handler
 * Implements all REST API endpoints
 */
export class ApiRoutes {
	constructor(
		private readonly router: ApiRouter,
		private readonly callRenderer: (method: string, params: any) => Promise<any>
	) {
		this.registerRoutes();
	}

	private registerRoutes(): void {
		// ===== Chat/Thread Endpoints =====

		// GET /api/v1/threads - List all threads
		this.router.register('GET', '/api/v1/threads', async (req, res, params) => {
			try {
				const threads = await this.callRenderer('getThreads', {});
				this.router.sendJson(res, 200, { threads });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get threads', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/threads/:id - Get specific thread
		this.router.register('GET', '/api/v1/threads/:id', async (req, res, params) => {
			try {
				const thread = await this.callRenderer('getThread', { threadId: params.id });
				if (!thread) {
					this.router.sendError(res, 404, 'Thread not found');
					return;
				}
				this.router.sendJson(res, 200, { thread });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get thread', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/threads - Create new thread
		this.router.register('POST', '/api/v1/threads', async (req, res, params) => {
			try {
				const { name } = params.body || {};
				const thread = await this.callRenderer('createThread', { name });
				this.router.sendJson(res, 201, { thread });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to create thread', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/threads/:id/messages - Send message to thread
		this.router.register('POST', '/api/v1/threads/:id/messages', async (req, res, params) => {
			try {
				const { message } = params.body || {};
				if (!message) {
					this.router.sendError(res, 400, 'Message is required');
					return;
				}
				const result = await this.callRenderer('sendMessage', {
					threadId: params.id,
					message
				});
				this.router.sendJson(res, 200, { result });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to send message', err instanceof Error ? err.message : String(err));
			}
		});

		// DELETE /api/v1/threads/:id - Delete thread
		this.router.register('DELETE', '/api/v1/threads/:id', async (req, res, params) => {
			try {
				await this.callRenderer('deleteThread', { threadId: params.id });
				this.router.sendJson(res, 200, { success: true });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to delete thread', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/threads/:id/status - Get agent status
		this.router.register('GET', '/api/v1/threads/:id/status', async (req, res, params) => {
			try {
				const status = await this.callRenderer('getThreadStatus', { threadId: params.id });
				this.router.sendJson(res, 200, { status });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get status', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/threads/:id/cancel - Cancel running agent
		this.router.register('POST', '/api/v1/threads/:id/cancel', async (req, res, params) => {
			try {
				await this.callRenderer('cancelThread', { threadId: params.id });
				this.router.sendJson(res, 200, { success: true });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to cancel', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/threads/:id/approve - Approve pending tool call
		this.router.register('POST', '/api/v1/threads/:id/approve', async (req, res, params) => {
			try {
				await this.callRenderer('approveToolCall', { threadId: params.id });
				this.router.sendJson(res, 200, { success: true });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to approve', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/threads/:id/reject - Reject pending tool call
		this.router.register('POST', '/api/v1/threads/:id/reject', async (req, res, params) => {
			try {
				await this.callRenderer('rejectToolCall', { threadId: params.id });
				this.router.sendJson(res, 200, { success: true });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to reject', err instanceof Error ? err.message : String(err));
			}
		});

		// ===== Workspace Endpoints =====

		// GET /api/v1/workspace - Get workspace info
		this.router.register('GET', '/api/v1/workspace', async (req, res, params) => {
			try {
				const workspace = await this.callRenderer('getWorkspace', {});
				this.router.sendJson(res, 200, { workspace });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get workspace', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/files - List files
		this.router.register('GET', '/api/v1/workspace/files', async (req, res, params) => {
			try {
				const { page = '1', limit = '50', filter } = params.query || {};
				const files = await this.callRenderer('getFiles', {
					page: parseInt(page as string),
					limit: parseInt(limit as string),
					filter
				});
				this.router.sendJson(res, 200, { files });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get files', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/files/tree - Get directory tree
		this.router.register('GET', '/api/v1/workspace/files/tree', async (req, res, params) => {
			try {
				const tree = await this.callRenderer('getFileTree', {});
				this.router.sendJson(res, 200, { tree });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get file tree', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/folder/:path - Get folder contents
		this.router.register('GET', '/api/v1/workspace/folder/*', async (req, res, params) => {
			try {
				const folderPath = params['*'] || ''; // Capture everything after /folder/
				const contents = await this.callRenderer('getFolderContents', { path: folderPath });
				this.router.sendJson(res, 200, { contents });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get folder contents', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/files/:path - Read file
		this.router.register('GET', '/api/v1/workspace/files/:path', async (req, res, params) => {
			try {
				const content = await this.callRenderer('readFile', { path: params.path });
				this.router.sendJson(res, 200, { content });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to read file', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/files/:path/outline - Get file outline
		this.router.register('GET', '/api/v1/workspace/files/:path/outline', async (req, res, params) => {
			try {
				const outline = await this.callRenderer('getFileOutline', { path: params.path });
				this.router.sendJson(res, 200, { outline });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get outline', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/workspace/search - Search files
		this.router.register('POST', '/api/v1/workspace/search', async (req, res, params) => {
			try {
				const { query, type = 'content' } = params.body || {};
				if (!query) {
					this.router.sendError(res, 400, 'Query is required');
					return;
				}
				const results = await this.callRenderer('searchFiles', { query, type });
				this.router.sendJson(res, 200, { results });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to search', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/workspace/diagnostics - Get diagnostics
		this.router.register('GET', '/api/v1/workspace/diagnostics', async (req, res, params) => {
			try {
				const diagnostics = await this.callRenderer('getDiagnostics', {});
				this.router.sendJson(res, 200, { diagnostics });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get diagnostics', err instanceof Error ? err.message : String(err));
			}
		});

		// ===== Planning Endpoints =====

		// GET /api/v1/planning/current - Get current plan
		this.router.register('GET', '/api/v1/planning/current', async (req, res, params) => {
			try {
				const plan = await this.callRenderer('getCurrentPlan', {});
				this.router.sendJson(res, 200, { plan });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get plan', err instanceof Error ? err.message : String(err));
			}
		});

		// POST /api/v1/planning/create - Create new plan
		this.router.register('POST', '/api/v1/planning/create', async (req, res, params) => {
			try {
				const { goal, tasks } = params.body || {};
				if (!goal || !tasks) {
					this.router.sendError(res, 400, 'Goal and tasks are required');
					return;
				}
				const plan = await this.callRenderer('createPlan', { goal, tasks });
				this.router.sendJson(res, 201, { plan });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to create plan', err instanceof Error ? err.message : String(err));
			}
		});

		// PATCH /api/v1/planning/tasks/:id - Update task status
		this.router.register('PATCH', '/api/v1/planning/tasks/:id', async (req, res, params) => {
			try {
				const { status, notes } = params.body || {};
				if (!status) {
					this.router.sendError(res, 400, 'Status is required');
					return;
				}
				const task = await this.callRenderer('updateTaskStatus', {
					taskId: params.id,
					status,
					notes
				});
				this.router.sendJson(res, 200, { task });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to update task', err instanceof Error ? err.message : String(err));
			}
		});

		// ===== Settings Endpoints (Read-only) =====

		// GET /api/v1/settings - Get settings
		this.router.register('GET', '/api/v1/settings', async (req, res, params) => {
			try {
				const settings = await this.callRenderer('getSettings', {});
				this.router.sendJson(res, 200, { settings });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get settings', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/settings/models - Get available models
		this.router.register('GET', '/api/v1/settings/models', async (req, res, params) => {
			try {
				const models = await this.callRenderer('getModels', {});
				this.router.sendJson(res, 200, { models });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get models', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/settings/model - Get current model selection
		this.router.register('GET', '/api/v1/settings/model', async (req, res, params) => {
			try {
				const model = await this.callRenderer('getCurrentModel', {});
				this.router.sendJson(res, 200, { model });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get current model', err instanceof Error ? err.message : String(err));
			}
		});

		// PUT /api/v1/settings/model - Set current model
		this.router.register('PUT', '/api/v1/settings/model', async (req, res, params) => {
			try {
				const { providerName, modelName } = params.body || {};
				if (!providerName || !modelName) {
					this.router.sendError(res, 400, 'Missing required fields: providerName, modelName');
					return;
				}
				const result = await this.callRenderer('setCurrentModel', { providerName, modelName });
				this.router.sendJson(res, 200, { success: true, model: result });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to set model', err instanceof Error ? err.message : String(err));
			}
		});

		// GET /api/v1/settings/mode - Get current chat mode
		this.router.register('GET', '/api/v1/settings/mode', async (req, res, params) => {
			try {
				const mode = await this.callRenderer('getChatMode', {});
				this.router.sendJson(res, 200, { mode });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to get chat mode', err instanceof Error ? err.message : String(err));
			}
		});

		// PUT /api/v1/settings/mode - Set chat mode
		this.router.register('PUT', '/api/v1/settings/mode', async (req, res, params) => {
			try {
				const { mode } = params.body || {};
				if (!mode || !['normal', 'gather', 'agent'].includes(mode)) {
					this.router.sendError(res, 400, 'Invalid mode. Must be one of: normal, gather, agent');
					return;
				}
				const result = await this.callRenderer('setChatMode', { mode });
				this.router.sendJson(res, 200, { success: true, mode: result });
			} catch (err) {
				this.router.sendError(res, 500, 'Failed to set chat mode', err instanceof Error ? err.message : String(err));
			}
		});

		// ===== Health Check =====

		// GET /api/v1/health - Health check
		this.router.register('GET', '/api/v1/health', async (req, res, params) => {
			this.router.sendJson(res, 200, {
				status: 'ok',
				version: '1.0.0',
				timestamp: new Date().toISOString()
			});
		});
	}
}
