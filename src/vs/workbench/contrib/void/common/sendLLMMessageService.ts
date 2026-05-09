/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { EventLLMMessageOnTextParams, EventLLMMessageOnErrorParams, EventLLMMessageOnFinalMessageParams, ServiceSendLLMMessageParams, MainSendLLMMessageParams, MainLLMMessageAbortParams, ServiceModelListParams, EventModelListOnSuccessParams, EventModelListOnErrorParams, MainModelListParams, OllamaModelResponse, OpenaiCompatibleModelResponse, } from './sendLLMMessageTypes.js';

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { IMCPService } from './mcpService.js';
import { IComposioService } from './composioService.js';
import { InternalToolInfo } from './prompt/prompts.js';

// calls channel to implement features
export const ILLMMessageService = createDecorator<ILLMMessageService>('llmMessageService');

export interface ILLMMessageService {
	readonly _serviceBrand: undefined;
	sendLLMMessage: (params: ServiceSendLLMMessageParams) => string | null;
	abort: (requestId: string) => void;
	ollamaList: (params: ServiceModelListParams<OllamaModelResponse>) => void;
	openAICompatibleList: (params: ServiceModelListParams<OpenaiCompatibleModelResponse>) => void;
}


// open this file side by side with llmMessageChannel
export class LLMMessageService extends Disposable implements ILLMMessageService {

	readonly _serviceBrand: undefined;
	private readonly channel: IChannel // LLMMessageChannel

	// sendLLMMessage
	private readonly llmMessageHooks = {
		onText: {} as { [eventId: string]: ((params: EventLLMMessageOnTextParams) => void) },
		onFinalMessage: {} as { [eventId: string]: ((params: EventLLMMessageOnFinalMessageParams) => void) },
		onError: {} as { [eventId: string]: ((params: EventLLMMessageOnErrorParams) => void) },
		onAbort: {} as { [eventId: string]: (() => void) }, // NOT sent over the channel, result is instant when we call .abort()
	}

	// Track inflight Composio promises for abort safety
	private readonly _composioPromises = new Map<string, Promise<unknown>>()
	private readonly _abortedRequestIds = new Set<string>()

	// list hooks
	private readonly listHooks = {
		ollama: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OllamaModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OllamaModelResponse>) => void) },
		},
		openAICompat: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OpenaiCompatibleModelResponse>) => void) },
		}
	} satisfies {
		[providerName in 'ollama' | 'openAICompat']: {
			success: { [eventId: string]: ((params: EventModelListOnSuccessParams<any>) => void) },
			error: { [eventId: string]: ((params: EventModelListOnErrorParams<any>) => void) },
		}
	}

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService, // used as a renderer (only usable on client side)
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		// @INotificationService private readonly notificationService: INotificationService,
		@IMCPService private readonly mcpService: IMCPService,
		@IComposioService private readonly composioService: IComposioService,
	) {
		super()

		// const service = ProxyChannel.toService<LLMMessageChannel>(mainProcessService.getChannel('void-channel-sendLLMMessage')); // lets you call it like a service
		// see llmMessageChannel.ts
		this.channel = this.mainProcessService.getChannel('void-channel-llmMessage')

		// .listen sets up an IPC channel and takes a few ms, so we set up listeners immediately and add hooks to them instead
		// llm
		this._register((this.channel.listen('onText_sendLLMMessage') satisfies Event<EventLLMMessageOnTextParams>)(e => {
			this.llmMessageHooks.onText[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onFinalMessage_sendLLMMessage') satisfies Event<EventLLMMessageOnFinalMessageParams>)(e => {
			this.llmMessageHooks.onFinalMessage[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId)
		}))
		this._register((this.channel.listen('onError_sendLLMMessage') satisfies Event<EventLLMMessageOnErrorParams>)(e => {
			this.llmMessageHooks.onError[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId);
			console.error('Error in LLMMessageService:', JSON.stringify(e))
		}))
		// .list()
		this._register((this.channel.listen('onSuccess_list_ollama') satisfies Event<EventModelListOnSuccessParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.success[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onError_list_ollama') satisfies Event<EventModelListOnErrorParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.error[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onSuccess_list_openAICompatible') satisfies Event<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.success[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onError_list_openAICompatible') satisfies Event<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.error[e.requestId]?.(e)
		}))

	}

	sendLLMMessage(params: ServiceSendLLMMessageParams) {
		const { onText, onFinalMessage, onError, onAbort, modelSelection, ...proxyParams } = params;

		// throw an error if no model/provider selected (this should usually never be reached, the UI should check this first, but might happen in cases like Apply where we haven't built much UI/checks yet, good practice to have check logic on backend)
		if (modelSelection === null) {
			const message = `Please add a provider in Void's Settings.`
			onError({ message, fullError: null })
			return null
		}

		if (params.messagesType === 'chatMessages' && (params.messages?.length ?? 0) === 0) {
			const message = `No messages detected.`
			onError({ message, fullError: null })
			return null
		}

		const { settingsOfProvider, globalSettings } = this.voidSettingsService.state

		const mcpTools = this.mcpService.getMCPTools()

		// Get Composio meta tools if API key is configured
		// Using Tool Router approach: agent self-manages connections via meta tools
		const composioToolsPromise = this._getComposioTools(globalSettings.composioApiKey, globalSettings.composioEnabledToolkits);

		// add state for request id
		const requestId = generateUuid();
		this.llmMessageHooks.onText[requestId] = onText
		this.llmMessageHooks.onFinalMessage[requestId] = onFinalMessage
		this.llmMessageHooks.onError[requestId] = onError
		this.llmMessageHooks.onAbort[requestId] = onAbort // used internally only

		// Track the Composio promise for safe abort handling
		this._composioPromises.set(requestId, composioToolsPromise)

		// Handle Composio tools asynchronously
		composioToolsPromise.then(composioTools => {
			// Check if the request was already aborted while we were fetching tools
			if (this._abortedRequestIds.has(requestId)) {
				this._abortedRequestIds.delete(requestId)
				this._composioPromises.delete(requestId)
				return
			}
			this._composioPromises.delete(requestId)
			// params will be stripped of all its functions over the IPC channel
			this.channel.call('sendLLMMessage', {
				...proxyParams,
				requestId,
				settingsOfProvider,
				globalSettings,
				modelSelection,
				mcpTools,
				composioTools,
			} satisfies MainSendLLMMessageParams);
		}).catch(err => {
			// Check if the request was already aborted while we were fetching tools
			if (this._abortedRequestIds.has(requestId)) {
				this._abortedRequestIds.delete(requestId)
				this._composioPromises.delete(requestId)
				return
			}
			this._composioPromises.delete(requestId)
			// If Composio tools fail, proceed without them
			console.error('Failed to get Composio tools:', err);
			this.channel.call('sendLLMMessage', {
				...proxyParams,
				requestId,
				settingsOfProvider,
				globalSettings,
				modelSelection,
				mcpTools,
				composioTools: undefined,
			} satisfies MainSendLLMMessageParams);
		});

		return requestId
	}

	/**
	 * Get Composio tools for the agent.
	 * Uses Tool Router meta tools for self-managed connections and tool discovery.
	 */
	private async _getComposioTools(
		apiKey: string | undefined,
		enabledToolkits: string[]
	): Promise<InternalToolInfo[] | undefined> {
		if (!apiKey) {
			console.log('[Composio] No API key configured, skipping Composio tools');
			return undefined;
		}

		try {
			if (!this.composioService.isConfigured()) {
				console.log('[Composio] Service not configured, skipping Composio tools');
				return undefined;
			}

			// Create or get a Tool Router session
			// The session provides meta tools like COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_SEARCH_TOOLS
			// that allow the agent to self-manage connections and discover tools
			const sessionId = this.composioService.getSessionId();
			let session;

			if (sessionId) {
				// Use existing session
				console.log('[Composio] Using existing session:', sessionId);
				session = { session_id: sessionId };
			} else {
				// Create new session with enabled toolkits (or all if empty)
				console.log('[Composio] Creating new session with toolkits:', enabledToolkits.length > 0 ? enabledToolkits : 'all');
				session = await this.composioService.createSession(
					enabledToolkits.length > 0 ? enabledToolkits : undefined
				);
				console.log('[Composio] Session created:', session.session_id);
			}

			// Get meta tools from the session
			const metaTools = await this.composioService.getMetaTools(session.session_id);
			console.log('[Composio] Got', metaTools.length, 'meta tools');

			// Convert meta tools to InternalToolInfo format
			// These meta tools allow the agent to:
			// - COMPOSIO_MANAGE_CONNECTIONS: Connect/disconnect apps
			// - COMPOSIO_SEARCH_TOOLS: Search for appropriate tools
			// - COMPOSIO_GET_TOOL_SCHEMAS: Get input schemas for tools
			// - COMPOSIO_EXECUTE_TOOLS: Execute tools
			return metaTools.map(tool => {
				// Transform params to match InternalToolInfo format
				// InternalToolInfo.params requires { description: string } for each param
				const params: { [paramName: string]: { description: string } } = {};
				for (const [paramName, param] of Object.entries(tool.parameters.properties)) {
					params[paramName] = {
						description: param.description || `Parameter ${paramName}`,
					};
				}

				return {
					name: tool.name,
					description: tool.description,
					params,
					mcpServerName: 'composio_tool_router',
				};
			});
		} catch (e) {
			console.error('[Composio] Error getting Composio tools:', e);
			return undefined;
		}
	}

	abort(requestId: string) {
		// Mark this request as aborted so any inflight Composio tool fetch is dropped
		this._abortedRequestIds.add(requestId)
		// Cancel the Composio promise tracking
		this._composioPromises.delete(requestId)
		// Fire the local abort hook
		this.llmMessageHooks.onAbort[requestId]?.() // calling the abort hook here is instant (doesn't go over a channel)
		// Send abort to the main process
		this.channel.call('abort', { requestId } satisfies MainLLMMessageAbortParams).catch(() => {
			// Ignore abort channel errors — the request may already be done
		});
		this._clearChannelHooks(requestId)
	}


	ollamaList = (params: ServiceModelListParams<OllamaModelResponse>) => {
		const { onSuccess, onError, ...proxyParams } = params

		const { settingsOfProvider } = this.voidSettingsService.state

		// add state for request id
		const requestId_ = generateUuid();
		this.listHooks.ollama.success[requestId_] = onSuccess
		this.listHooks.ollama.error[requestId_] = onError

		this.channel.call('ollamaList', {
			...proxyParams,
			settingsOfProvider,
			providerName: 'ollama',
			requestId: requestId_,
		} satisfies MainModelListParams<OllamaModelResponse>)
	}


	openAICompatibleList = (params: ServiceModelListParams<OpenaiCompatibleModelResponse>) => {
		const { onSuccess, onError, providerName, ...proxyParams } = params

		const { settingsOfProvider } = this.voidSettingsService.state

		// add state for request id
		const requestId_ = generateUuid();
		this.listHooks.openAICompat.success[requestId_] = onSuccess
		this.listHooks.openAICompat.error[requestId_] = onError

		this.channel.call('openAICompatibleList', {
			...proxyParams,
			settingsOfProvider,
			providerName, // Pass providerName so backend knows which endpoint to use
			requestId: requestId_,
		} satisfies MainModelListParams<OpenaiCompatibleModelResponse>)
	}

	private _clearChannelHooks(requestId: string) {
		delete this.llmMessageHooks.onText[requestId]
		delete this.llmMessageHooks.onFinalMessage[requestId]
		delete this.llmMessageHooks.onError[requestId]

		delete this.listHooks.ollama.success[requestId]
		delete this.listHooks.ollama.error[requestId]

		delete this.listHooks.openAICompat.success[requestId]
		delete this.listHooks.openAICompat.error[requestId]
	}
}

registerSingleton(ILLMMessageService, LLMMessageService, InstantiationType.Eager);

