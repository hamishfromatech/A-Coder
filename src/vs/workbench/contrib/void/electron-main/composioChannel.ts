/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Composio Channel for IPC communication between renderer and main processes.
 * Uses the official @composio/core SDK for all Composio API operations.
 */

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Composio } from '@composio/core';
import * as crypto from 'node:crypto';

interface ComposioCallParams {
	apiKey: string;
	userId: string;
}

const _composioInstances = new Map<string, Composio>();

function getComposio(apiKey: string): Composio {
	let instance = _composioInstances.get(apiKey);
	if (!instance) {
		instance = new Composio({ apiKey });
		_composioInstances.set(apiKey, instance);
	}
	return instance;
}

const _sessions = new Map<string, { sessionId: string; createdAt: number }>();

export class ComposioChannel implements IServerChannel {

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	constructor() { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeState':
				return this.onDidChangeState;
			default:
				throw new Error(`Composio Channel does not support listening to event: ${event}`);
		}
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		const { apiKey, userId } = params as ComposioCallParams;
		if (!apiKey) {
			return { error: { code: 'INVALID_API_KEY', message: 'Composio API key not configured.' } };
		}

		try {
			switch (command) {
				case 'createSession': return this._createSession(apiKey, userId, params);
				case 'getSessionTools': return this._getSessionTools(apiKey, userId, params);
				case 'executeTool': return this._executeTool(apiKey, userId, params);
				case 'getSessionToolkits': return this._getSessionToolkits(apiKey, userId, params);
				case 'authorizeToolkit': return this._authorizeToolkit(apiKey, userId, params);
				case 'searchTools': return this._searchTools(apiKey, userId, params);
				case 'fetchToolkits': return this._fetchToolkits(apiKey, params);
				case 'fetchTools': return this._fetchTools(apiKey, params);
				case 'listConnections': return this._listConnections(apiKey, params);
				case 'deleteConnection': return this._deleteConnection(apiKey, params);
				case 'refreshConnection': return this._refreshConnection(apiKey, params);
				case 'listTriggerTypes': return this._listTriggerTypes(apiKey, params);
				case 'createTriggerInstance': return this._createTriggerInstance(apiKey, userId, params);
				case 'listTriggerInstances': return this._listTriggerInstances(apiKey, params);
				case 'enableTrigger': return this._enableTrigger(apiKey, params);
				case 'disableTrigger': return this._disableTrigger(apiKey, params);
				case 'deleteTrigger': return this._deleteTrigger(apiKey, params);
				case 'verifyWebhookSignature': return this._verifyWebhookSignature(params);
				default:
					throw new Error(`Unknown command: ${command}`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[ComposioChannel] ${command} failed:`, message);
			return { error: { code: 'EXECUTION_FAILED', message } };
		}
	}

	// ============================================
	// Session Management
	// ============================================

	private async _createSession(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const config: any = {};
		if (params.enabledToolkits?.length) {
			config.toolkits = params.enabledToolkits;
		}
		if (params.manageConnections !== undefined) {
			config.manageConnections = params.manageConnections;
		}

		const session = await composio.toolRouter.create(userId, config);
		_sessions.set(userId, { sessionId: session.sessionId, createdAt: Date.now() });

		console.log(`[ComposioChannel] Session created: ${session.sessionId}`);
		return { data: { session_id: session.sessionId } };
	}

	private async _getSessionTools(apiKey: string, userId: string, _params: any) {
		const composio = getComposio(apiKey);
		const cached = _sessions.get(userId);
		if (!cached) {
			return { error: { code: 'NO_SESSION', message: 'No active session. Call createSession first.' } };
		}

		const tools = await composio.tools.getRawToolRouterMetaTools(cached.sessionId);
		return { data: tools };
	}

	private async _executeTool(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const cached = _sessions.get(userId);
		if (!cached) {
			return { error: { code: 'NO_SESSION', message: 'No active session.' } };
		}

		const { toolSlug, arguments: arguments_ } = params;

		let result;
		if (toolSlug.startsWith('COMPOSIO_') || toolSlug.startsWith('composio_')) {
			// Fix argument types: SDK expects arrays but LLM may pass strings
			const fixedArgs: any = { ...arguments_ };
			if (typeof fixedArgs.toolkits === 'string') {
				fixedArgs.toolkits = [fixedArgs.toolkits];
			}
			if (typeof fixedArgs.tools === 'string') {
				fixedArgs.tools = [fixedArgs.tools];
			}
			result = await composio.tools.executeMetaTool(toolSlug, {
				sessionId: cached.sessionId,
				arguments: fixedArgs,
			});
		} else {
			result = await composio.tools.execute(toolSlug, {
				userId,
				arguments: arguments_,
			});
		}

		return { data: result };
	}

	private async _getSessionToolkits(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const cached = _sessions.get(userId);
		if (!cached) {
			return { error: { code: 'NO_SESSION', message: 'No active session.' } };
		}

		const session = await composio.toolRouter.use(cached.sessionId);
		const options: any = {};
		if (params.toolkits) { options.toolkits = params.toolkits; }
		if (params.isConnected !== undefined) { options.isConnected = params.isConnected; }
		if (params.search) { options.search = params.search; }
		if (params.limit) { options.limit = params.limit; }

		const toolkits = await session.toolkits(options);
		return { data: toolkits };
	}

	private async _authorizeToolkit(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const cached = _sessions.get(userId);
		if (!cached) {
			return { error: { code: 'NO_SESSION', message: 'No active session.' } };
		}

		const session = await composio.toolRouter.use(cached.sessionId);
		const connectionRequest = await session.authorize(params.toolkit, {
			callbackUrl: params.callbackUrl,
		});
		return { data: connectionRequest };
	}

	private async _searchTools(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const cached = _sessions.get(userId);
		if (!cached) {
			return { error: { code: 'NO_SESSION', message: 'No active session.' } };
		}

		const session = await composio.toolRouter.use(cached.sessionId);
		const results = await session.search({
			query: params.query,
			toolkits: params.toolkits,
		});
		return { data: results };
	}

	// ============================================
	// Toolkit Management (for Settings UI)
	// ============================================

	private async _fetchToolkits(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		const result = await composio.toolkits.get({
			limit: params.limit || 1000,
		});
		return { data: result };
	}

	private async _fetchTools(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		if (!params.toolkitSlug) {
			return { error: { code: 'MISSING_PARAM', message: 'toolkitSlug is required' } };
		}
		const result = await composio.tools.getRawComposioTools({
			toolkits: [params.toolkitSlug],
			limit: params.limit || 1000,
		});
		return { data: result };
	}

	// ============================================
	// Connection Management (for Settings UI)
	// ============================================

	private async _listConnections(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		const result = await composio.connectedAccounts.list({
			limit: params.limit || 100,
		});
		return { data: result };
	}

	private async _deleteConnection(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		await composio.connectedAccounts.delete(params.connectionId);
		return { data: { success: true } };
	}

	private async _refreshConnection(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		const result = await composio.connectedAccounts.refresh(params.connectionId);
		return { data: result };
	}

	// ============================================
	// Trigger Management
	// ============================================

	private async _listTriggerTypes(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		const query: any = { limit: params.limit || 1000 };
		if (params.toolkitSlug) { query.toolkits = [params.toolkitSlug]; }
		const result = await composio.triggers.listTypes(query);
		return { data: result };
	}

	private async _createTriggerInstance(apiKey: string, userId: string, params: any) {
		const composio = getComposio(apiKey);
		const result = await composio.triggers.create(userId, params.triggerSlug, {
			connectedAccountId: params.connectedAccountId,
			triggerConfig: params.config,
		});
		return { data: result };
	}

	private async _listTriggerInstances(apiKey: string, _params: any) {
		const composio = getComposio(apiKey);
		const result = await composio.triggers.listActive({});
		return { data: result };
	}

	private async _enableTrigger(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		await composio.triggers.enable(params.triggerId);
		return { data: { success: true } };
	}

	private async _disableTrigger(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		await composio.triggers.disable(params.triggerId);
		return { data: { success: true } };
	}

	private async _deleteTrigger(apiKey: string, params: any) {
		const composio = getComposio(apiKey);
		await composio.triggers.delete(params.triggerId);
		return { data: { success: true } };
	}

	// ============================================
	// Webhook Verification
	// ============================================

	private _verifyWebhookSignature(params: any) {
		const { payload, signature, secret } = params;
		if (!payload || !signature || !secret) {
			return { data: { valid: false } };
		}
		try {
			const expectedSignature = crypto
				.createHmac('sha256', secret)
				.update(payload)
				.digest('hex');
			const sigWithoutPrefix = signature.startsWith('sha256=') ? signature.slice(7) : signature;
			const isValid = crypto.timingSafeEqual(
				Buffer.from(expectedSignature, 'hex'),
				Buffer.from(sigWithoutPrefix, 'hex')
			);
			return { data: { valid: isValid } };
		} catch {
			return { data: { valid: false } };
		}
	}
}
