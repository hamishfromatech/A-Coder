/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import {
	ComposioToolkit,
	ComposioTool,
	ComposioConnection,
	ComposioConnectionInitResponse,
	ComposioToolExecutionResponse,
	ComposioTriggerTypeDefinition,
	ComposioTriggerInstance,
	ComposioWebhookSubscription,
} from './voidSettingsTypes.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { IMetricsService } from './metricsService.js';

/**
 * Composio service state for UI binding
 */
export interface ComposioServiceState {
	toolkits: ComposioToolkit[];
	isLoading: boolean;
	error: string | undefined;
	lastFetch: number | undefined;
	sessionId: string | undefined;
}

/**
 * Tool Router session response from Composio SDK (via IPC)
 */
export interface ComposioSessionResponse {
	session_id: string;
}

/**
 * Tool definition from the SDK's getRawToolRouterMetaTools.
 * Mapped from the Composio SDK's Tool type to match what consumers expect.
 */
export interface ComposioMetaTool {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, any>;
		required?: string[];
	};
}

export interface IComposioService {
	readonly _serviceBrand: undefined;
	readonly state: ComposioServiceState;
	readonly onDidChangeState: Event<void>;

	setApiKey(apiKey: string): Promise<void>;
	getApiKey(): string;

	createSession(enabledToolkits?: string[], callbackUrl?: string): Promise<ComposioSessionResponse>;
	getSessionId(): string | undefined;
	getMetaTools(sessionId: string): Promise<ComposioMetaTool[]>;
	executeToolViaSession(sessionId: string, toolSlug: string, arguments_: Record<string, unknown>): Promise<ComposioToolExecutionResponse>;
	getComposioSlug(toolName: string): string;

	fetchToolkits(): Promise<ComposioToolkit[]>;
	fetchToolkitBySlug(slug: string): Promise<ComposioToolkit | undefined>;
	fetchTools(toolkitSlug: string): Promise<ComposioTool[]>;

	initiateConnection(toolkitSlug: string, redirectUrl?: string): Promise<ComposioConnectionInitResponse>;
	waitForConnection(connectionId: string, timeoutMs?: number): Promise<ComposioConnection | undefined>;
	checkConnectionStatus(connectionId: string): Promise<ComposioConnection | undefined>;
	refreshConnection(connectionId: string): Promise<ComposioConnection | undefined>;
	deleteConnection(connectionId: string): Promise<void>;
	listConnections(): Promise<ComposioConnection[]>;
	enableToolkit(toolkitSlug: string): Promise<void>;
	disableToolkit(toolkitSlug: string): Promise<void>;

	getToolDefinitions(toolkitSlugs?: string[]): Promise<ComposioToolDefinition[]>;

	isComposioTool(toolName: string): boolean;
	isConfigured(): boolean;
	clearCache(): void;

	listTriggerTypes(toolkitSlug?: string): Promise<ComposioTriggerTypeDefinition[]>;
	getTriggerType(triggerSlug: string): Promise<ComposioTriggerTypeDefinition | undefined>;
	createTriggerInstance(triggerSlug: string, connectedAccountId: string, config: Record<string, unknown>): Promise<ComposioTriggerInstance>;
	listTriggerInstances(): Promise<ComposioTriggerInstance[]>;
	enableTrigger(triggerId: string): Promise<void>;
	disableTrigger(triggerId: string): Promise<void>;
	deleteTriggerInstance(triggerId: string): Promise<void>;

	createWebhookSubscription(webhookUrl: string, enabledEvents: string[]): Promise<ComposioWebhookSubscription>;
	listWebhookSubscriptions(): Promise<ComposioWebhookSubscription[]>;
	deleteWebhookSubscription(subscriptionId: string): Promise<void>;
	verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
}

export const IComposioService = createDecorator<IComposioService>('composioService');

export interface ComposioToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, { type: string; description?: string; enum?: string[] }>;
		required: string[];
	};
	toolkitSlug: string;
	toolSlug: string;
}

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

class ComposioService extends Disposable implements IComposioService {
	_serviceBrand: undefined;

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	private readonly channel: IChannel;

	private _state: ComposioServiceState = {
		toolkits: [],
		isLoading: false,
		error: undefined,
		lastFetch: undefined,
		sessionId: undefined,
	};

	private _toolkitCache: Map<string, CacheEntry<ComposioToolkit>> = new Map();
	private _toolsCache: Map<string, CacheEntry<ComposioTool[]>> = new Map();
	private _sessionCache: Map<string, CacheEntry<ComposioMetaTool[]>> = new Map();
	private readonly _cacheTTL = 5 * 60 * 1000;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IMetricsService private readonly metricsService: IMetricsService,
	) {
		super();
		this.channel = this.mainProcessService.getChannel('void-channel-composio');
	}

	get state(): ComposioServiceState {
		return this._state;
	}

	private _setState(newState: Partial<ComposioServiceState>): void {
		this._state = { ...this._state, ...newState };
		this._onDidChangeState.fire();
	}

	private async _call<T>(command: string, params: Record<string, unknown>): Promise<{ data?: T; error?: { code: string; message: string } }> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			return { error: { code: 'INVALID_API_KEY', message: 'Composio API key not configured.' } };
		}
		try {
			const result = await this.channel.call<{ data?: T; error?: { code: string; message: string } }>(command, {
				...params,
				apiKey,
				userId: 'default',
			});
			return result;
		} catch (err) {
			return { error: { code: 'IPC_ERROR', message: `IPC error: ${err instanceof Error ? err.message : 'Unknown error'}` } };
		}
	}

	// ============================================
	// API Key Management
	// ============================================

	async setApiKey(apiKey: string): Promise<void> {
		await this.voidSettingsService.setGlobalSetting('composioApiKey', apiKey);
		this.metricsService.capture('Composio API Key Set', { hasKey: !!apiKey });
	}

	getApiKey(): string {
		return this.voidSettingsService.state.globalSettings.composioApiKey || '';
	}

	// ============================================
	// Session Management
	// ============================================

	async createSession(enabledToolkits?: string[], callbackUrl?: string): Promise<ComposioSessionResponse> {
		const { data, error } = await this._call<ComposioSessionResponse>('createSession', {
			enabledToolkits,
			manageConnections: callbackUrl ? { enabled: true, callbackUrl } : true,
		});
		if (error) { throw new Error(error.message); }
		if (!data) { throw new Error('Failed to create Tool Router session'); }

		this._setState({ sessionId: data.session_id });
		this.metricsService.capture('Composio Session Created', {
			sessionId: data.session_id,
			toolkits: enabledToolkits?.length || 0,
		});
		return data;
	}

	getSessionId(): string | undefined {
		return this._state.sessionId;
	}

	async getMetaTools(sessionId: string): Promise<ComposioMetaTool[]> {
		const cached = this._sessionCache.get(sessionId);
		if (cached && Date.now() - cached.timestamp < this._cacheTTL) {
			return cached.data;
		}

		const { data, error } = await this._call<any[]>('getSessionTools', {});
		if (error) { throw new Error(error.message); }
		if (!data) { throw new Error('Failed to get tools from session'); }

		// Map SDK Tool format to our ComposioMetaTool format
		const metaTools: ComposioMetaTool[] = data.map((tool: any) => {
			// Use slug (which has COMPOSIO_ prefix) as the tool name for proper routing
			const name = tool.slug || tool.name;
			return {
				name,
				description: tool.description || '',
				parameters: {
					type: 'object' as const,
					properties: tool.inputParameters?.properties || tool.parameters?.properties || {},
					required: tool.inputParameters?.required || tool.parameters?.required || [],
				},
			};
		});

		this._sessionCache.set(sessionId, { data: metaTools, timestamp: Date.now() });
		return metaTools;
	}

	async executeToolViaSession(
		sessionId: string,
		toolSlug: string,
		arguments_: Record<string, unknown>
	): Promise<ComposioToolExecutionResponse> {
		const { data, error } = await this._call<ComposioToolExecutionResponse>('executeTool', {
			toolSlug,
			arguments: arguments_,
		});

		if (error) {
			return { successful: false, error: error.message };
		}

		this.metricsService.capture('Composio Tool Executed', { toolSlug, sessionId });
		return {
			successful: data?.successful ?? true,
			data: data?.data,
			error: data?.error,
			logId: data?.logId,
		};
	}

	// ============================================
	// Toolkit Management (for Settings UI)
	// ============================================

	async fetchToolkits(): Promise<ComposioToolkit[]> {
		this._setState({ isLoading: true, error: undefined });

		const { data, error } = await this._call<{ items: any[] }>('fetchToolkits', {
			limit: 1000,
		});

		if (error) {
			this._setState({ isLoading: false, error: error.message });
			return [];
		}

		// SDK returns ToolKitListResponse: array directly, fields nested under meta
			const items = Array.isArray(data) ? data : (data?.items || []);
			const toolkits: ComposioToolkit[] = items.map((item: any): ComposioToolkit => ({
			slug: item.slug,
			name: item.name,
			description: item.meta?.description || item.description,
			logo: item.meta?.logo || item.logo,
			categories: item.meta?.categories?.map((c: any) => typeof c === 'string' ? c : c.name) || item.categories || [],
			authSchemes: item.authSchemes || [],
			composioManagedAuthSchemes: item.composioManagedAuthSchemes || [],
			toolsCount: item.meta?.toolsCount || item.toolsCount || 0,
			triggersCount: item.meta?.triggersCount || item.triggersCount,
			status: 'active' as const,
			appUrl: item.meta?.appUrl || item.appUrl || item.meta?.description,
		}));

		toolkits.forEach(t => {
			this._toolkitCache.set(t.slug, { data: t, timestamp: Date.now() });
		});

		this._setState({ toolkits, isLoading: false, lastFetch: Date.now() });
		this.metricsService.capture('Composio Toolkits Fetched', { count: toolkits.length });
		return toolkits;
	}

	async fetchToolkitBySlug(slug: string): Promise<ComposioToolkit | undefined> {
		const cached = this._toolkitCache.get(slug);
		if (cached && Date.now() - cached.timestamp < this._cacheTTL) {
			return cached.data;
		}
		const toolkits = await this.fetchToolkits();
		return toolkits.find(t => t.slug === slug);
	}

	async fetchTools(toolkitSlug: string): Promise<ComposioTool[]> {
		const cached = this._toolsCache.get(toolkitSlug);
		if (cached && Date.now() - cached.timestamp < this._cacheTTL) {
			return cached.data;
		}

		const { data, error } = await this._call<any>('fetchTools', { toolkitSlug, limit: 1000 });
		if (error || !data) { return []; }

		const tools: ComposioTool[] = (Array.isArray(data) ? data : data?.items || []).map((item: any): ComposioTool => ({
			slug: item.slug,
			name: item.name,
			description: item.description,
			toolkitSlug: item.toolkit?.slug || toolkitSlug,
			toolkitName: item.toolkit?.name || '',
			inputParameters: item.inputParameters || {},
			outputParameters: item.outputParameters,
			scopes: item.scopes,
			tags: item.tags,
			noAuth: item.noAuth,
			status: item.isDeprecated ? 'inactive' : 'active',
		}));

		this._toolsCache.set(toolkitSlug, { data: tools, timestamp: Date.now() });
		return tools;
	}

	// ============================================
	// Connection Management (for Settings UI)
	// ============================================

	async initiateConnection(toolkitSlug: string, redirectUrl?: string): Promise<ComposioConnectionInitResponse> {
		const { data, error } = await this._call<any>('authorizeToolkit', {
			toolkit: toolkitSlug,
			callbackUrl: redirectUrl,
		});

		if (error) {
			return { id: '', status: 'failed', redirectUrl: undefined, error: error.message };
		}
		if (!data) {
			return { id: '', status: 'failed', redirectUrl: undefined, error: 'No response from connection request' };
		}

		this.metricsService.capture('Composio Connection Initiated', { toolkitSlug });

		return {
			id: data.id || data.connectedAccountId || '',
			status: 'pending',
			redirectUrl: data.redirectUrl || data.redirect_url,
			connectedAccountId: data.connectedAccountId,
		};
	}

	async waitForConnection(connectionId: string, timeoutMs: number = 60000): Promise<ComposioConnection | undefined> {
		const startTime = Date.now();
		while (Date.now() - startTime < timeoutMs) {
			const connection = await this.checkConnectionStatus(connectionId);
			if (connection?.status === 'active') { return connection; }
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
		return undefined;
	}

	async checkConnectionStatus(connectionId: string): Promise<ComposioConnection | undefined> {
		const connections = await this.listConnections();
		return connections.find(c => c.id === connectionId);
	}

	async refreshConnection(connectionId: string): Promise<ComposioConnection | undefined> {
		const { data, error } = await this._call<any>('refreshConnection', { connectionId });
		if (error || !data) { return undefined; }
		return {
			id: data.id || connectionId,
			toolkitSlug: data.toolkit?.slug || '',
			toolkitName: data.toolkit?.name || '',
			status: data.status === 'ACTIVE' ? 'active' : 'pending',
			connectedAccountId: data.id,
			authScheme: 'oauth2',
			createdAt: Date.now(),
		};
	}

	async deleteConnection(connectionId: string): Promise<void> {
		await this._call('deleteConnection', { connectionId });

		const connections = { ...this.voidSettingsService.state.globalSettings.composioConnections };
		for (const [slug, id] of Object.entries(connections)) {
			if (id === connectionId) { delete connections[slug]; }
		}
		await this.voidSettingsService.setGlobalSetting('composioConnections', connections);
		this.metricsService.capture('Composio Connection Deleted', { connectionId });
	}

	async listConnections(): Promise<ComposioConnection[]> {
		const { data, error } = await this._call<{ items: any[] }>('listConnections', { limit: 100 });
		if (error || !data) { return []; }

		return (data.items || []).map((item: any): ComposioConnection => ({
			id: item.id,
			toolkitSlug: item.toolkit?.slug || '',
			toolkitName: item.toolkit?.name || '',
			status: this._mapConnectionStatus(item.status),
			connectedAccountId: item.id,
			authScheme: 'oauth2' as const,
			createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
		}));
	}

	async enableToolkit(toolkitSlug: string): Promise<void> {
		const enabled = [...this.voidSettingsService.state.globalSettings.composioEnabledToolkits];
		if (!enabled.includes(toolkitSlug)) {
			enabled.push(toolkitSlug);
			await this.voidSettingsService.setGlobalSetting('composioEnabledToolkits', enabled);
		}
	}

	async disableToolkit(toolkitSlug: string): Promise<void> {
		const enabled = this.voidSettingsService.state.globalSettings.composioEnabledToolkits.filter(s => s !== toolkitSlug);
		await this.voidSettingsService.setGlobalSetting('composioEnabledToolkits', enabled);
	}

	// ============================================
	// Agent Integration
	// ============================================

	async getToolDefinitions(toolkitSlugs?: string[]): Promise<ComposioToolDefinition[]> {
		const slugs = toolkitSlugs || this.voidSettingsService.state.globalSettings.composioEnabledToolkits;
		if (slugs.length === 0) { return []; }

		const allTools: ComposioToolDefinition[] = [];
		for (const slug of slugs) {
			const tools = await this.fetchTools(slug);
			for (const tool of tools) {
				if (tool.status !== 'active') continue;

				const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
				const required: string[] = [];

				for (const [key, param] of Object.entries(tool.inputParameters || {})) {
					const p = param as any;
					properties[key] = { type: p.type || 'string', description: p.description };
					if (p.required) { required.push(key); }
				}

				allTools.push({
					name: `composio_${tool.slug.toLowerCase()}`,
					description: `${tool.description} (from ${tool.toolkitName})`,
					parameters: { type: 'object', properties, required },
					toolkitSlug: tool.toolkitSlug,
					toolSlug: tool.slug,
				});
			}
		}
		return allTools;
	}

	// ============================================
	// Utility
	// ============================================

	private static readonly META_TOOL_NAMES = [
		'search_tools', 'manage_connections', 'get_tool_schemas', 'execute_tools',
		'get_enabled_connections', 'multi_execute_tool', 'remote_bash_tool', 'remote_workbench',
	];

	isComposioTool(toolName: string): boolean {
		// Meta tools from SDK have COMPOSIO_ prefix or lowercase names
		if (toolName.startsWith('COMPOSIO_')) return true;
		if (toolName.startsWith('composio_')) return true;
		// Known Composio meta tool names (lowercase, without COMPOSIO_ prefix)
		const isMeta = ComposioService.META_TOOL_NAMES.includes(toolName);
		if (isMeta) console.log(`[ComposioService] isComposioTool: "${toolName}" -> true (meta tool)`);
		return isMeta;
	}

	// Map SDK tool name to Composio internal slug for executeMetaTool
	getComposioSlug(toolName: string): string {
		// executeMetaTool expects the COMPOSIO_ prefixed slug (e.g., COMPOSIO_SEARCH_TOOLS)
		return toolName;
	}

	isConfigured(): boolean {
		return !!this.getApiKey();
	}

	clearCache(): void {
		this._toolkitCache.clear();
		this._toolsCache.clear();
		this._sessionCache.clear();
		this._setState({ lastFetch: undefined, sessionId: undefined });
	}

	private _mapConnectionStatus(status: string): ComposioConnection['status'] {
		switch ((status || '').toUpperCase()) {
			case 'ACTIVE': return 'active';
			case 'PENDING': return 'pending';
			case 'EXPIRED': return 'expired';
			default: return 'failed';
		}
	}

	// ============================================
	// Trigger Management
	// ============================================

	async listTriggerTypes(toolkitSlug?: string): Promise<ComposioTriggerTypeDefinition[]> {
		const { data, error } = await this._call<any>('listTriggerTypes', { toolkitSlug, limit: 1000 });
		if (error || !data) { return []; }

		const items = Array.isArray(data) ? data : data?.items || [];
		return items.map((item: any): ComposioTriggerTypeDefinition => ({
			slug: item.slug,
			name: item.name,
			description: item.description || '',
			instructions: item.instructions,
			type: item.type as 'webhook' | 'poll',
			toolkit: {
				slug: item.toolkit?.slug || '',
				name: item.toolkit?.name || '',
				logo: item.toolkit?.logo,
			},
			config: item.config,
			payload: item.payload,
			version: item.version,
		}));
	}

	async getTriggerType(triggerSlug: string): Promise<ComposioTriggerTypeDefinition | undefined> {
		const types = await this.listTriggerTypes();
		return types.find(t => t.slug === triggerSlug);
	}

	async createTriggerInstance(
		triggerSlug: string,
		connectedAccountId: string,
		config: Record<string, unknown>
	): Promise<ComposioTriggerInstance> {
		const { data, error } = await this._call<any>('createTriggerInstance', {
			triggerSlug,
			connectedAccountId,
			config,
		});

		if (error) { throw new Error(error.message); }
		if (!data) { throw new Error('Failed to create trigger instance'); }

		this.metricsService.capture('Composio Trigger Created', { triggerSlug });
		return {
			id: data.id || data.triggerId,
			slug: triggerSlug,
			toolkitSlug: triggerSlug.split('_')[0]?.toLowerCase() || '',
			connectedAccountId,
			config,
			enabled: true,
			createdAt: Date.now(),
		};
	}

	async listTriggerInstances(): Promise<ComposioTriggerInstance[]> {
		const { data, error } = await this._call<any>('listTriggerInstances', {});
		if (error || !data) { return []; }

		const items = Array.isArray(data) ? data : data?.items || [];
		return items.map((item: any): ComposioTriggerInstance => ({
			id: item.id,
			slug: item.triggerSlug || item.slug || '',
			toolkitSlug: item.toolkitSlug || '',
			connectedAccountId: item.connectedAccountId,
			config: item.triggerConfig || item.config || {},
			enabled: item.enabled ?? true,
			createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
			updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : undefined,
			webhookId: item.webhookId,
		}));
	}

	async enableTrigger(triggerId: string): Promise<void> {
		const { error } = await this._call('enableTrigger', { triggerId });
		if (error) { throw new Error(error.message); }
		this.metricsService.capture('Composio Trigger Enabled', { triggerId });
	}

	async disableTrigger(triggerId: string): Promise<void> {
		const { error } = await this._call('disableTrigger', { triggerId });
		if (error) { throw new Error(error.message); }
		this.metricsService.capture('Composio Trigger Disabled', { triggerId });
	}

	async deleteTriggerInstance(triggerId: string): Promise<void> {
		const { error } = await this._call('deleteTrigger', { triggerId });
		if (error) { throw new Error(error.message); }
		this.metricsService.capture('Composio Trigger Deleted', { triggerId });
	}

	// ============================================
	// Webhook Management
	// ============================================

	async createWebhookSubscription(webhookUrl: string, enabledEvents: string[]): Promise<ComposioWebhookSubscription> {
		// The SDK's triggers.subscribe handles this, but for now we store locally
		// since the webhook endpoint is managed by A-Coder's API server
		const subscription: ComposioWebhookSubscription = {
			id: crypto.randomUUID(),
			webhookUrl,
			enabledEvents,
			secret: '',
			createdAt: Date.now(),
			status: 'active',
		};
		return subscription;
	}

	async listWebhookSubscriptions(): Promise<ComposioWebhookSubscription[]> {
		return [];
	}

	async deleteWebhookSubscription(subscriptionId: string): Promise<void> {
		// No-op: webhook subscriptions are managed by the trigger system
	}

	verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
		try {
			const { data } = this._callSynchronous<{ valid: boolean }>('verifyWebhookSignature', { payload, signature, secret });
			return data?.valid ?? false;
		} catch {
			return false;
		}
	}

	/** Synchronous call for webhook verification (called from API route, no await needed) */
	private _callSynchronous<T>(command: string, params: Record<string, unknown>): { data?: T; error?: { code: string; message: string } } {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			return { error: { code: 'INVALID_API_KEY', message: 'Composio API key not configured.' } };
		}
		try {
			return this.channel.call(command, { ...params, apiKey, userId: 'default' }) as any;
		} catch (err) {
			return { error: { code: 'IPC_ERROR', message: `IPC error: ${err instanceof Error ? err.message : 'Unknown error'}` } };
		}
	}
}

registerSingleton(IComposioService, ComposioService, InstantiationType.Eager);
