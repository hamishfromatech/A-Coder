/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// disable foreign import complaints
/* eslint-disable */
import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';
import OpenAI, { ClientOptions, AzureOpenAI } from 'openai';
import { MistralCore } from '@mistralai/mistralai/core.js';
import { fimComplete } from '@mistralai/mistralai/funcs/fimComplete.js';
import { Tool as GeminiTool, FunctionDeclaration, GoogleGenAI, ThinkingConfig, Schema, Type } from '@google/genai';
import { GoogleAuth } from 'google-auth-library'
/* eslint-enable */

import { AnthropicLLMChatMessage, AnthropicReasoning, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, ModelListParams, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj } from '../../common/sendLLMMessageTypes.js';
import { ChatMode, displayInfoOfProviderName, GlobalSettings, ModelSelectionOptions, OverridesOfModel, ProviderName, SettingsOfProvider } from '../../common/voidSettingsTypes.js';
import { getSendableReasoningInfo, getModelCapabilities, getProviderCapabilities, defaultProviderSettings, getReservedOutputTokenSpace } from '../../common/modelCapabilities.js';
import { extractReasoningWrapper } from './extractGrammar.js';
import { availableTools, InternalToolInfo } from '../../common/prompt/prompts.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

const getGoogleApiKey = async () => {
	// module‑level singleton
	const auth = new GoogleAuth({ scopes: `https://www.googleapis.com/auth/cloud-platform` });
	const key = await auth.getAccessToken()
	if (!key) throw new Error(`Google API failed to generate a key.`)
	return key
}




type InternalCommonMessageParams = {
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	globalSettings: GlobalSettings;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
}

type SendChatParams_Internal = InternalCommonMessageParams & {
	messages: LLMChatMessage[];
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
}
type SendFIMParams_Internal = InternalCommonMessageParams & { messages: LLMFIMMessage; separateSystemMessage: string | undefined; }
export type ListParams_Internal<ModelResponse> = ModelListParams<ModelResponse>


const invalidApiKeyMessage = (providerName: ProviderName) => `Invalid ${displayInfoOfProviderName(providerName).title} API key.`

// ------------ OPENAI-COMPATIBLE (HELPERS) ------------



const parseHeadersJSON = (s: string | undefined): Record<string, string | null | undefined> | undefined => {
	if (!s) return undefined
	try {
		return JSON.parse(s)
	} catch (e) {
		throw new Error(`Error parsing OpenAI-Compatible headers: ${s} is not a valid JSON.`)
	}
}

const newOpenAICompatibleSDK = async ({ settingsOfProvider, providerName, includeInPayload }: { settingsOfProvider: SettingsOfProvider, providerName: ProviderName, includeInPayload?: { [s: string]: any } }) => {
	const commonPayloadOpts: ClientOptions = {
		dangerouslyAllowBrowser: true,
		...includeInPayload,
	}
	if (providerName === 'openAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ apiKey: thisConfig.apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'ollama') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({
			baseURL: `${thisConfig.endpoint}/v1`,
			apiKey: 'noop',
			// Add specific configurations for better Ollama compatibility
			defaultHeaders: {
				'HTTP-User-Agent': 'Void/1.0.0'
			},
			// Increase timeout for Ollama models which can be slower
			timeout: 120000, // 2 minutes
			...commonPayloadOpts
		})
	}
	else if (providerName === 'vLLM') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'liteLLM') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'lmStudio') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'openRouter') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({
			baseURL: 'https://openrouter.ai/api/v1',
			apiKey: thisConfig.apiKey,
			defaultHeaders: {
				'HTTP-Referer': 'https://voideditor.com', // Optional, for including your app on openrouter.ai rankings.
				'X-Title': 'Void', // Optional. Shows in rankings on openrouter.ai.
			},
			...commonPayloadOpts,
		})
	}
	else if (providerName === 'googleVertex') {
		// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library
		const thisConfig = settingsOfProvider[providerName]
		const baseURL = `https://${thisConfig.region}-aiplatform.googleapis.com/v1/projects/${thisConfig.project}/locations/${thisConfig.region}/endpoints/${'openapi'}`
		const apiKey = await getGoogleApiKey()
		return new OpenAI({ baseURL: baseURL, apiKey: apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'microsoftAzure') {
		// https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP
		//  https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
		const thisConfig = settingsOfProvider[providerName]
		const endpoint = `https://${thisConfig.project}.openai.azure.com/`;
		const apiVersion = thisConfig.azureApiVersion ?? '2024-04-01-preview';
		const options = { endpoint, apiKey: thisConfig.apiKey, apiVersion };
		return new AzureOpenAI({ ...options, ...commonPayloadOpts });
	}
	else if (providerName === 'awsBedrock') {
		/**
		  * We treat Bedrock as *OpenAI-compatible only through a proxy*:
		  *   • LiteLLM default → http://localhost:4000/v1
		  *   • Bedrock-Access-Gateway → https://<api-id>.execute-api.<region>.amazonaws.com/openai/
		  *
		  * The native Bedrock runtime endpoint
		  *   https://bedrock-runtime.<region>.amazonaws.com
		  * is **NOT** OpenAI-compatible, so we do *not* fall back to it here.
		  */
		const { endpoint, apiKey } = settingsOfProvider.awsBedrock

		// ① use the user-supplied proxy if present
		// ② otherwise default to local LiteLLM
		let baseURL = endpoint || 'http://localhost:4000/v1'

		// Normalize: make sure we end with “/v1”
		if (!baseURL.endsWith('/v1'))
			baseURL = baseURL.replace(/\/+$/, '') + '/v1'

		return new OpenAI({ baseURL, apiKey, ...commonPayloadOpts })
	}


	else if (providerName === 'deepseek') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: thisConfig.apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'openAICompatible') {
		const thisConfig = settingsOfProvider[providerName]
		const headers = parseHeadersJSON(thisConfig.headersJSON)
		return new OpenAI({ baseURL: thisConfig.endpoint, apiKey: thisConfig.apiKey, defaultHeaders: headers, ...commonPayloadOpts })
	}
	else if (providerName === 'groq') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: thisConfig.apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'xAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: thisConfig.apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'mistral') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.mistral.ai/v1', apiKey: thisConfig.apiKey, ...commonPayloadOpts })
	}

	else throw new Error(`Void providerName was invalid: ${providerName}.`)
}


const _sendOpenAICompatibleFIM = async ({ messages: { prefix, suffix, stopTokens }, onFinalMessage, onError, settingsOfProvider, globalSettings, modelName: modelName_, _setAborter, providerName, overridesOfModel }: SendFIMParams_Internal) => {

	const {
		modelName,
		supportsFIM,
		additionalOpenAIPayload,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	if (!supportsFIM) {
		if (modelName === modelName_)
			onError({ message: `Model ${modelName} does not support FIM.`, fullError: null })
		else
			onError({ message: `Model ${modelName_} (${modelName}) does not support FIM.`, fullError: null })
		return
	}

	const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload: additionalOpenAIPayload })
	openai.completions
		.create({
			model: modelName,
			prompt: prefix,
			suffix: suffix,
			stop: stopTokens,
			max_tokens: 300,
		})
		.then(async response => {
			const fullText = response.choices[0]?.text
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		})
		.catch(error => {
			if (error instanceof OpenAI.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }); }
			else { onError({ message: error + '', fullError: error }); }
		})
}


const toOpenAICompatibleTool = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo

	const paramsWithType: { [s: string]: { description: string; type: 'string' } } = {}
	for (const key in params) { paramsWithType[key] = { ...params[key], type: 'string' } }

	return {
		type: 'function',
		function: {
			name: name,
			// strict: true, // strict mode - https://platform.openai.com/docs/guides/function-calling?api-mode=chat
			description: description,
			parameters: {
				type: 'object',
				properties: paramsWithType, // ✅ FIX: Use paramsWithType instead of params to include type field for llama.cpp compatibility
				// required: Object.keys(params), // in strict mode, all params are required and additionalProperties is false
				// additionalProperties: false,
			},
		}
	} satisfies OpenAI.Chat.Completions.ChatCompletionTool
}

const openAITools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined, options?: { enableMorphFastContext?: boolean }) => {
	const allowedTools = availableTools(chatMode, mcpTools, options)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null

	const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []
	for (const t in allowedTools ?? {}) {
		openAITools.push(toOpenAICompatibleTool(allowedTools[t]))
	}
	return openAITools
}


// Find the end of a JSON object, handling nested braces
const findJsonObjectEnd = (str: string): number => {
	let depth = 0
	let inString = false
	let escape = false

	for (let i = 0; i < str.length; i++) {
		const char = str[i]

		if (escape) {
			escape = false
			continue
		}

		if (char === '\\' && inString) {
			escape = true
			continue
		}

		if (char === '"') {
			inString = !inString
			continue
		}

		if (inString) continue

		if (char === '{') depth++
		if (char === '}') {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

// convert LLM tool call to our tool format
const rawToolCallObjOfParamsStr = (name: string, toolParamsStr: string, id: string, thought_signature?: string): RawToolCallObj | null => {
	if (!toolParamsStr) {
		console.log(`[sendLLMMessage] ⚠️ Tool call "${name}" has empty parameters string`)
		return null
	}

	let input: unknown
	try {
		input = JSON.parse(toolParamsStr)
	}
	catch (e) {
		// Try to handle concatenated JSON objects like {"uri":"a"}{"uri":"b"}
		// This happens when LLMs try to call multiple tools at once incorrectly
		const firstObjectEnd = findJsonObjectEnd(toolParamsStr)
		if (firstObjectEnd !== -1 && firstObjectEnd < toolParamsStr.length - 1) {
			const firstObject = toolParamsStr.substring(0, firstObjectEnd + 1)
			try {
				input = JSON.parse(firstObject)
				console.log(`[sendLLMMessage] ⚠️ LLM sent concatenated tool calls, extracting first one for "${name}"`)
			} catch (e2) {
				console.log(`[sendLLMMessage] ⚠️ Failed to parse tool parameters for "${name}":`, e)
				console.log(`[sendLLMMessage] Raw params string:`, toolParamsStr.substring(0, 500))
				return null
			}
		} else {
			console.log(`[sendLLMMessage] ⚠️ Failed to parse tool parameters for "${name}":`, e)
			console.log(`[sendLLMMessage] Raw params string:`, toolParamsStr.substring(0, 500))
			return null
		}
	}

	if (input === null) {
		console.log(`[sendLLMMessage] ⚠️ Tool call "${name}" parsed to null`)
		return null
	}
	if (typeof input !== 'object') {
		console.log(`[sendLLMMessage] ⚠️ Tool call "${name}" params is not an object, got:`, typeof input)
		return null
	}

	const rawParams: RawToolParamsObj = input
	console.log(`[sendLLMMessage] ✓ Successfully parsed tool call "${name}" with ${Object.keys(rawParams).length} parameters`)
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true, thought_signature }
}


const rawToolCallObjOfAnthropicParams = (toolBlock: Anthropic.Messages.ToolUseBlock): RawToolCallObj | null => {
	const { id, name, input } = toolBlock

	if (input === null) return null
	if (typeof input !== 'object') return null

	const rawParams: RawToolParamsObj = input
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true }
}


// ------------ OPENAI-COMPATIBLE ------------


const _sendOpenAICompatibleChat = async ({ messages, onText, onFinalMessage, onError, settingsOfProvider, globalSettings, modelSelectionOptions, modelName: modelName_, _setAborter, providerName, chatMode, separateSystemMessage, overridesOfModel, mcpTools }: SendChatParams_Internal) => {
	const {
		modelName,
		reasoningCapabilities,
		additionalOpenAIPayload,
		specialToolFormat,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	const { canIOReasoning, openSourceThinkTags } = reasoningCapabilities || {}
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here

	const includeInPayload = {
		...providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo),
		...additionalOpenAIPayload
	}

	console.log(`[sendLLMMessage] Reasoning config:`, {
		reasoningCapabilities,
		reasoningInfo,
		includeInPayload: providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo),
		finalPayload: includeInPayload
	})

	// tools - only send if model supports native tool calling (specialToolFormat === 'openai-style')
	// Models without specialToolFormat will use XML tool calling instead
	const potentialTools = openAITools(chatMode, mcpTools, { enableMorphFastContext: (modelSelectionOptions?.morphFastContext ?? globalSettings.enableMorphFastContext) && !!globalSettings.morphApiKey })
	const nativeToolsObj = potentialTools && specialToolFormat === 'openai-style' ?
		{ tools: potentialTools } as const
		: {}
	const hasTools = potentialTools && potentialTools.length > 0

	console.log(`[sendLLMMessage] OpenAI-compatible - chatMode: ${chatMode}, tools count: ${potentialTools?.length ?? 0}, model: ${modelName}, provider: ${providerName}, specialToolFormat: ${specialToolFormat}`)
	if (potentialTools && potentialTools.length > 0 && specialToolFormat === 'openai-style') {
		console.log(`[sendLLMMessage] ✅ Sending ${potentialTools.length} tools via native API`)
		console.log(`[sendLLMMessage] Tool names:`, potentialTools.map(t => t.function.name).join(', '))
	} else if (potentialTools && potentialTools.length > 0) {
		console.log(`[sendLLMMessage] ⚠️ NOT sending tools - specialToolFormat is '${specialToolFormat}', will use XML tool calling instead`)
	} else {
		console.log(`[sendLLMMessage] ⚠️ NO TOOLS - chatMode: ${chatMode}, mcpTools: ${mcpTools?.length ?? 0}`)
	}

	// instance
	const openai: OpenAI = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload })
	if (providerName === 'microsoftAzure') {
		// Required to select the model
		(openai as AzureOpenAI).deploymentName = modelName;
	}
	const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: modelName,
		messages: messages as any,
		stream: true,
		...nativeToolsObj,
		...additionalOpenAIPayload
		// max_completion_tokens: maxTokens,
	}

	console.log(`[sendLLMMessage] Request options:`, JSON.stringify({
		model: options.model,
		messageCount: options.messages.length,
		hasTools: 'tools' in options,
		toolCount: (options as any).tools?.length ?? 0,
		stream: options.stream
	}))

	// Debug: Log full payload size and check for issues at position 17371
	const fullPayload = JSON.stringify(options)
	console.log(`[sendLLMMessage] Full payload size: ${fullPayload.length} chars`)
	if (fullPayload.length > 17000) {
		console.log(`[sendLLMMessage] Payload around position 17371: "${fullPayload.substring(17350, 17400)}"`)
	}

	// open source models - manually parse think tokens
	const { needsManualParse: needsManualReasoningParse, nameOfFieldInDelta: nameOfReasoningFieldInDelta } = providerReasoningIOSettings?.output ?? {}
	const manuallyParseReasoning = needsManualReasoningParse && canIOReasoning && openSourceThinkTags
	let fullReasoningSoFar = ''
	let fullTextSoFar = ''

	let toolName = ''
	let toolId = ''
	let toolParamsStr = ''
	let thoughtSignature = ''
	let finalUsage: { promptTokens: number; completionTokens: number } | undefined = undefined

	console.log(`[sendLLMMessage] Reasoning extraction config:`, {
		needsManualReasoningParse,
		canIOReasoning,
		hasOpenSourceThinkTags: !!openSourceThinkTags,
		openSourceThinkTags,
		manuallyParseReasoning
	})

	// Use manual parsing ONLY if we need to parse <think> tags from content
	// Do NOT use extractReasoningWrapper if there's a direct reasoning field (like delta.reasoning or delta.thinking)
	// because extractReasoningWrapper will overwrite the accumulated reasoning from the direct field
	if (manuallyParseReasoning && openSourceThinkTags && !nameOfReasoningFieldInDelta) {
		console.log(`[sendLLMMessage] ✅ Enabling reasoning extraction with tags:`, openSourceThinkTags)
		const { newOnText, newOnFinalMessage } = extractReasoningWrapper(onText, onFinalMessage, openSourceThinkTags)
		onText = newOnText
		onFinalMessage = newOnFinalMessage
	}
	if (nameOfReasoningFieldInDelta) {
		console.log(`[sendLLMMessage] ✅ Using direct reasoning field:`, nameOfReasoningFieldInDelta)
	}

	const toText = (content: unknown): string => {
		if (!content) {
			return ''
		}
		if (typeof content === 'string') {
			return content
		}
		if (Array.isArray(content)) {
			return content
				.map(part => {
					if (typeof part === 'string') {
						return part
					}
					if (part && typeof part === 'object' && 'text' in part) {
						return String(part.text ?? '')
					}
					return ''
				})
				.join('')
		}
		return ''
	}

	const applyToolCall = (toolCall: any, { isFinal }: { isFinal: boolean }) => {
		if (!toolCall || (typeof toolCall === 'object' && 'index' in toolCall && toolCall.index !== 0)) {
			return
		}

		const fn = toolCall.function ?? {}

		// Set tool name if we don't have one yet
		if (fn.name && !toolName) {
			toolName = fn.name
			console.log(`[sendLLMMessage] Tool call detected: ${toolName}`)
		}

		// Process arguments (can come in subsequent chunks after tool name)
		if (typeof fn.arguments === 'string') {
			if (isFinal) {
				toolParamsStr = fn.arguments
				console.log(`[sendLLMMessage] Tool arguments (final): ${toolParamsStr.substring(0, 200)}${toolParamsStr.length > 200 ? '...' : ''}`)
			}
			else {
				toolParamsStr += fn.arguments
			}
		} else if (fn.arguments && typeof fn.arguments === 'object') {
			// Some models might return arguments as object instead of string
			console.log(`[sendLLMMessage] ⚠️ Tool arguments received as object, converting to JSON string`)
			const argsStr = JSON.stringify(fn.arguments)
			if (isFinal) {
				toolParamsStr = argsStr
			} else {
				toolParamsStr += argsStr
			}
		}

		// Set tool ID if provided
		if (toolCall.id && !toolId) {
			toolId = toolCall.id
		}

		// Capture thought_signature (used by Gemini 2.0 via OpenRouter)
		if (fn.thought_signature) {
			thoughtSignature = fn.thought_signature
		}
		if (toolCall.thought_signature) {
			thoughtSignature = toolCall.thought_signature
		}
	}

	console.log(`[sendLLMMessage] Creating request with options:`, JSON.stringify({
		model: options.model,
		messageCount: options.messages?.length,
		hasTools: !!options.tools,
		toolCount: options.tools?.length,
		stream: options.stream
	}))

	// Log the actual messages being sent (first 3 for debugging)
	if (options.messages && options.messages.length > 0) {
		console.log(`[sendLLMMessage] Message sequence (${options.messages.length} messages):`)
		options.messages.forEach((m: any, idx: number) => {
			const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
			const hasTools = !!m.tool_calls
			const toolCount = m.tool_calls?.length ?? 0
			const toolId = m.tool_call_id ?? ''
			console.log(`  [${idx}] role: ${m.role}${toolId ? ` (id: ${toolId})` : ''}${hasTools ? ` (${toolCount} tools)` : ''}, content length: ${contentStr?.length ?? 0}`)
		})

		console.log(`[sendLLMMessage] First message:`, JSON.stringify(options.messages[0], null, 2).substring(0, 500))
		if (options.messages.length > 1) {
			console.log(`[sendLLMMessage] Last message:`, JSON.stringify(options.messages[options.messages.length - 1], null, 2).substring(0, 500))
		}
	}

	openai.chat.completions
		.create(options)
		.then(async response => {
			console.log(`[sendLLMMessage] Request created successfully, starting to read stream`)
			_setAborter(() => response.controller.abort())

			// Import XML stripping function for streaming
			const { stripXMLBlocks } = await import('../../common/helpers/extractXMLTools.js')

			// when receive text
			let chunkCount = 0
			for await (const chunk of response) {
				chunkCount++
				if (chunkCount <= 3) {
					console.log(`[sendLLMMessage] Chunk ${chunkCount} received:`, JSON.stringify(chunk, null, 2))
				}
				const choice = chunk.choices?.[0]
				if (!choice) {
					console.log(`[sendLLMMessage] Chunk ${chunkCount} has no choice, skipping`)
					continue
				}

				if (choice.finish_reason && choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') {
					console.log(`[sendLLMMessage] Unexpected finish_reason: ${choice.finish_reason}, chunk:`, JSON.stringify(chunk))
					onError({ message: `Model ended response with finish_reason "${choice.finish_reason}"`, fullError: null })
					return
				}

				// Capture usage statistics if available
				if (chunk.usage) {
					finalUsage = {
						promptTokens: chunk.usage.prompt_tokens,
						completionTokens: chunk.usage.completion_tokens
					};
					console.log(`[sendLLMMessage] Usage stats received:`, finalUsage);
				}

				const delta = choice.delta ?? {}
				const newText = toText(delta.content)
				fullTextSoFar += newText

				for (const toolDelta of delta.tool_calls ?? []) {
					if (toolName && toolDelta.function?.name) {
						console.log(`[sendLLMMessage] ⚠️ Multiple tool calls detected, skipping additional tool: ${toolDelta.function.name}`)
					}
					applyToolCall(toolDelta, { isFinal: false })
				}
				if (choice.finish_reason === 'tool_calls') {
					applyToolCall({ function: { name: toolName, arguments: toolParamsStr }, id: toolId, index: 0 }, { isFinal: true })
				}

				if (nameOfReasoningFieldInDelta) {
					// Check configured field first, then fallback to common alternatives
					// Different providers use different field names for reasoning content
					const deltaAny = delta as any
					const reasoningDelta = (
						deltaAny?.[nameOfReasoningFieldInDelta] ||
						deltaAny?.reasoning ||  // Ollama Cloud uses 'reasoning' for some models
						deltaAny?.thinking ||   // Ollama uses 'thinking' for local models
						''
					) + ''
					if (reasoningDelta && chunkCount <= 5) {
						console.log(`[sendLLMMessage] Chunk ${chunkCount} reasoning delta:`, reasoningDelta.substring(0, 100))
					}
					// Accumulate reasoning if reasoning is enabled in settings, OR if it's an unrecognized model (reasoningInfo is null)
					if (!reasoningInfo || reasoningInfo.isReasoningEnabled) {
						fullReasoningSoFar += reasoningDelta
					}
				}

				// Strip XML blocks from text during streaming if model doesn't support native tools
				const displayText = !specialToolFormat ? stripXMLBlocks(fullTextSoFar) : fullTextSoFar

				onText({
					fullText: displayText,
					fullReasoning: fullReasoningSoFar,
					toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
					// Pass raw text so chatThreadService can detect XML tool calls for repetition detection
					_rawTextBeforeStripping: !specialToolFormat ? fullTextSoFar : undefined,
				})
			}
			// on final
			const truncatedFullText = fullTextSoFar.length > 500 ? fullTextSoFar.substring(0, 500) + '...' : fullTextSoFar;
			const truncatedReasoning = fullReasoningSoFar.length > 500 ? fullReasoningSoFar.substring(0, 500) + '...' : fullReasoningSoFar;
			const truncatedToolParams = toolParamsStr.length > 500 ? toolParamsStr.substring(0, 500) + '...' : toolParamsStr;
			
			console.log(`[sendLLMMessage] Stream completed. Total chunks: ${chunkCount}, fullText: "${truncatedFullText}", reasoning: "${truncatedReasoning}", toolName: "${toolName}", toolParams: "${truncatedToolParams}"`)

			// Fallback: If no native tool call detected, check for XML tool calls in both content and reasoning
			if (!toolName && (fullTextSoFar || fullReasoningSoFar)) {
				const { extractXMLToolCalls, stripXMLBlocks } = await import('../../common/helpers/extractXMLTools.js')
				
				// 1. Check main content
				const xmlToolCallsInText = extractXMLToolCalls(fullTextSoFar)
				if (xmlToolCallsInText.length > 0) {
					const firstCall = xmlToolCallsInText[0]
					toolName = firstCall.toolName
					toolParamsStr = JSON.stringify(firstCall.parameters)
					toolId = 'xml-tool-call-text-1'
					fullTextSoFar = stripXMLBlocks(fullTextSoFar)
					console.log(`[sendLLMMessage] ✅ Extracted XML tool call from text: ${toolName}`, firstCall.parameters)
				}
				
				// 2. Check reasoning (Nemotron and other models sometimes put tools here)
				if (!toolName && fullReasoningSoFar) {
					const xmlToolCallsInReasoning = extractXMLToolCalls(fullReasoningSoFar)
					if (xmlToolCallsInReasoning.length > 0) {
						const firstCall = xmlToolCallsInReasoning[0]
						toolName = firstCall.toolName
						toolParamsStr = JSON.stringify(firstCall.parameters)
						toolId = 'xml-tool-call-reasoning-1'
						fullReasoningSoFar = stripXMLBlocks(fullReasoningSoFar)
						console.log(`[sendLLMMessage] ✅ Extracted XML tool call from reasoning: ${toolName}`, firstCall.parameters)
					}
				}
			}

			// Enhanced empty response detection for Ollama
			const hasEmptyResponse = !fullTextSoFar && !fullReasoningSoFar && !toolName
			const hasToolCallWithEmptyContent = toolName && !fullTextSoFar && !fullReasoningSoFar

			if (hasEmptyResponse) {
				console.log(`[sendLLMMessage] ❌ Empty response detected`)
				console.log(`[sendLLMMessage] Diagnostic info:`)
				console.log(`  - fullText: "${fullTextSoFar}" (${fullTextSoFar.length} chars)`)
				console.log(`  - reasoning: "${fullReasoningSoFar}" (${fullReasoningSoFar.length} chars)`)
				console.log(`  - toolName: "${toolName}"`)
				console.log(`  - toolParams: "${toolParamsStr}" (${toolParamsStr.length} chars)`)
				console.log(`  - Provider: ${providerName}`)
				console.log(`  - Model: ${modelName}`)
				console.log(`  - specialToolFormat: ${specialToolFormat}`)
				console.log(`  - hasTools: ${hasTools}`)

				// For Ollama models with tool calling, provide specific guidance
				if (providerName === 'ollama' && hasTools) {
					const modelLower = modelName.toLowerCase()
					let specificGuidance = ''

					// Model-specific guidance based on research
					if (modelLower.includes('llama') && (modelLower.includes('3.2') || modelLower.includes('8b') || modelLower.includes('3b'))) {
						specificGuidance = ' Smaller Llama models (3.2, 8B, 3B) often struggle with tool calling. Try using Llama 3.1 70B or Llama 3.3 for better results.'
					} else if (modelLower.includes('gemma') && !modelLower.includes('tool')) {
						specificGuidance = ' Gemma models may need the "gemma-tools" or "gemma2-tools" variant for reliable tool calling.'
					} else if (modelLower.includes('qwen') && (modelLower.includes('0.5b') || modelLower.includes('1.5b'))) {
						specificGuidance = ' Very small Qwen models are unreliable for tool calling. Try Qwen 2.5-coder:7b or Qwen 3 series.'
					} else if (modelLower.includes('mistral')) {
						specificGuidance = ' Mistral models may hang on tool calls. Ensure you\'re using a recent version with tool calling support.'
					} else if (modelLower.includes('cloud') || modelLower.includes('kimi') || modelLower.includes('gpt-oss')) {
						specificGuidance = ' Cloud/Kimi/GPT-OSS models often have strict protocol requirements or missing IDs. The system will attempt XML fallback.'
					} else if (modelLower.includes('deepseek')) {
						specificGuidance = ' DeepSeek models may require specific prompting or "thinking" mode handling. XML fallback is often more reliable.'
					}

					if (specialToolFormat === 'openai-style') {
						console.warn(`[sendLLMMessage] ⚠️ Ollama native tool calling failed - model may not support it properly`)
						onError({
							message: `Ollama model "${modelName}" returned empty response with native tool calling.${specificGuidance}\n\nSuggestions:\n1. The model may be falling back to XML tool calling automatically\n2. Try a larger model (70B+ for complex tasks)\n3. Check Ollama logs for errors\n4. Ensure model is fully downloaded`,
							fullError: null
						})
					} else {
						console.warn(`[sendLLMMessage] ⚠️ Ollama XML tool calling returned empty response`)
						onError({
							message: `Ollama model "${modelName}" returned empty response with XML tool calling.${specificGuidance}\n\nThis may indicate:\n1. Model doesn't understand tool calling instructions\n2. Insufficient GPU/RAM resources\n3. Model needs to be updated\n\nTry a different model or check Ollama server logs.`,
							fullError: null
						})
					}
				} else {
					// Generic empty response error for non-Ollama or non-tool cases
					onError({ message: 'A-Coder: Response from model was empty.', fullError: null })
				}
			}
			else if (hasToolCallWithEmptyContent && providerName === 'ollama') {
				// This is actually EXPECTED behavior for successful tool calls
				// When a tool is called, content field should be empty and tool_calls should be populated
				console.log(`[sendLLMMessage] ℹ️ Tool call detected with empty content - this is expected behavior`)
				console.log(`[sendLLMMessage] Tool: ${toolName}, Params length: ${toolParamsStr.length}`)

				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId, thoughtSignature)
				const toolCallObj = toolCall ? { toolCall } : {}
				const anthropicReasoning: AnthropicReasoning[] | null = fullReasoningSoFar ? [{ type: 'thinking', thinking: fullReasoningSoFar, signature: thoughtSignature }] : null
				console.log(`[sendLLMMessage] Final message - text length: ${fullTextSoFar.length}, reasoning length: ${fullReasoningSoFar.length}, toolName: ${toolName}, hasToolCall: ${!!toolCall}`)
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning, ...toolCallObj, usage: finalUsage });
			}
			else {
				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId, thoughtSignature)
				const toolCallObj = toolCall ? { toolCall } : {}
				const anthropicReasoning: AnthropicReasoning[] | null = fullReasoningSoFar ? [{ type: 'thinking', thinking: fullReasoningSoFar, signature: thoughtSignature }] : null
				console.log(`[sendLLMMessage] Final message - text length: ${fullTextSoFar.length}, reasoning length: ${fullReasoningSoFar.length}, toolName: ${toolName}, hasToolCall: ${!!toolCall}`)
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning, ...toolCallObj, usage: finalUsage });
			}
		})
		// when error/fail - this catches errors of both .create() and .then(for await)
		.catch(async error => {
			console.log(`[sendLLMMessage] Error caught:`, error)
			console.log(`[sendLLMMessage] Error type:`, error?.constructor?.name)
			console.log(`[sendLLMMessage] Error status:`, error?.status)
			console.log(`[sendLLMMessage] Error message:`, error?.message)

			// Retry on 500 errors (server-side issues) - wait 3 seconds and try once more
			// Don't call onError yet - let the UI keep showing "thinking" state
			if (error instanceof OpenAI.APIError && error.status === 500 && !(options as any)._isRetry) {
				console.log(`[sendLLMMessage] ⏳ Server returned 500 error, retrying in 3 seconds...`)
				await new Promise(resolve => setTimeout(resolve, 3000))
				console.log(`[sendLLMMessage] 🔄 Retrying request...`)

				// Retry the request with a flag to prevent infinite retries
				const retryOptions = { ...options, _isRetry: true } as typeof options & { _isRetry: boolean }
				openai.chat.completions
					.create(retryOptions)
					.then(async retryResponse => {
						console.log(`[sendLLMMessage] ✅ Retry succeeded, processing response`)
						_setAborter(() => (retryResponse as any).controller?.abort?.())

						// Reset state for retry
						fullTextSoFar = ''
						fullReasoningSoFar = ''
						toolName = ''
						toolParamsStr = ''
						toolId = ''
						thoughtSignature = ''

						const { stripXMLBlocks } = await import('../../common/helpers/extractXMLTools.js')

						let chunkCount = 0
						for await (const chunk of retryResponse as any) {
							chunkCount++
							const choice = chunk.choices?.[0]
							if (!choice) continue

							if (choice.finish_reason && choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') {
								onError({ message: `Model ended response with finish_reason "${choice.finish_reason}"`, fullError: null })
								return
							}

							const delta = choice.delta ?? {}
							fullTextSoFar += toText(delta.content)

							for (const toolDelta of delta.tool_calls ?? []) {
								applyToolCall(toolDelta, { isFinal: false })
							}
							if (choice.finish_reason === 'tool_calls') {
								applyToolCall({ function: { name: toolName, arguments: toolParamsStr }, id: toolId, index: 0 }, { isFinal: true })
							}

							if (nameOfReasoningFieldInDelta && (!reasoningInfo || reasoningInfo.isReasoningEnabled)) {
								const deltaAny = delta as any
								const reasoningDelta = (deltaAny?.[nameOfReasoningFieldInDelta] || deltaAny?.reasoning || deltaAny?.thinking || '') + ''
								fullReasoningSoFar += reasoningDelta
							}

							const displayText = !specialToolFormat ? stripXMLBlocks(fullTextSoFar) : fullTextSoFar
							onText({
								fullText: displayText,
								fullReasoning: fullReasoningSoFar,
								toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
								_rawTextBeforeStripping: !specialToolFormat ? fullTextSoFar : undefined,
							})
						}

						console.log(`[sendLLMMessage] Retry stream completed. Chunks: ${chunkCount}`)

						// Fallback: If no native tool call detected, check for XML tool calls in both content and reasoning
						if (!toolName && (fullTextSoFar || fullReasoningSoFar)) {
							const { extractXMLToolCalls, stripXMLBlocks } = await import('../../common/helpers/extractXMLTools.js')
							
							const xmlToolCallsInText = extractXMLToolCalls(fullTextSoFar)
							if (xmlToolCallsInText.length > 0) {
								const firstCall = xmlToolCallsInText[0]
								toolName = firstCall.toolName
								toolParamsStr = JSON.stringify(firstCall.parameters)
								toolId = 'xml-tool-call-text-retry-1'
								fullTextSoFar = stripXMLBlocks(fullTextSoFar)
							} else if (fullReasoningSoFar) {
								const xmlToolCallsInReasoning = extractXMLToolCalls(fullReasoningSoFar)
								if (xmlToolCallsInReasoning.length > 0) {
									const firstCall = xmlToolCallsInReasoning[0]
									toolName = firstCall.toolName
									toolParamsStr = JSON.stringify(firstCall.parameters)
									toolId = 'xml-tool-call-reasoning-retry-1'
									fullReasoningSoFar = stripXMLBlocks(fullReasoningSoFar)
								}
							}
						}

						const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId, thoughtSignature)
						const toolCallObj = toolCall ? { toolCall } : {}
						const anthropicReasoning: AnthropicReasoning[] | null = fullReasoningSoFar ? [{ type: 'thinking', thinking: fullReasoningSoFar, signature: thoughtSignature }] : null
						onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning, ...toolCallObj })
					})
					.catch(retryError => {
						console.log(`[sendLLMMessage] ❌ Retry also failed:`, retryError?.message)
						onError({ message: retryError + '', fullError: retryError })
					})
				return
			}

			if (error instanceof OpenAI.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }); }
			else { onError({ message: error + '', fullError: error }); }
		})
}



type OpenAIModel = {
	id: string;
	created: number;
	object: 'model';
	owned_by: string;
}
const _openaiCompatibleList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider, providerName }: ListParams_Internal<OpenAIModel>) => {
	const onSuccess = ({ models }: { models: OpenAIModel[] }) => {
		onSuccess_({ models })
	}
	const onError = ({ error }: { error: string }) => {
		onError_({ error })
	}
	try {
		const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider })
		openai.models.list()
			.then(async (response) => {
				const models: OpenAIModel[] = []
				models.push(...response.data)
				while (response.hasNextPage()) {
					models.push(...(await response.getNextPage()).data)
				}
				onSuccess({ models })
			})
			.catch((error) => {
				onError({ error: error + '' })
			})
	}
	catch (error) {
		onError({ error: error + '' })
	}
}




// ------------ ANTHROPIC (HELPERS) ------------
const toAnthropicTool = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo
	const paramsWithType: { [s: string]: { description: string; type: 'string' } } = {}
	for (const key in params) { paramsWithType[key] = { ...params[key], type: 'string' } }
	return {
		name: name,
		description: description,
		input_schema: {
			type: 'object',
			properties: paramsWithType,
			// required: Object.keys(params),
		},
	} satisfies Anthropic.Messages.Tool
}

const anthropicTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined, options?: { enableMorphFastContext?: boolean }) => {
	const allowedTools = availableTools(chatMode, mcpTools, options)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null

	const anthropicTools: Anthropic.Messages.ToolUnion[] = []
	for (const t in allowedTools ?? {}) {
		anthropicTools.push(toAnthropicTool(allowedTools[t]))
	}
	return anthropicTools
}



// ------------ ANTHROPIC ------------
const sendAnthropicChat = async ({ messages, providerName, onText, onFinalMessage, onError, settingsOfProvider, globalSettings, modelSelectionOptions, overridesOfModel, modelName: modelName_, _setAborter, separateSystemMessage, chatMode, mcpTools }: SendChatParams_Internal) => {
	const {
		modelName,
		specialToolFormat,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	const thisConfig = settingsOfProvider.anthropic
	const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here
	const includeInPayload = providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo) || {}

	// anthropic-specific - max tokens
	const maxTokens = getReservedOutputTokenSpace(providerName, modelName_, { isReasoningEnabled: !!reasoningInfo?.isReasoningEnabled, overridesOfModel })

	// tools
	const potentialTools = anthropicTools(chatMode, mcpTools, { enableMorphFastContext: (modelSelectionOptions?.morphFastContext ?? globalSettings.enableMorphFastContext) && !!globalSettings.morphApiKey })
	const nativeToolsObj = potentialTools && specialToolFormat === 'anthropic-style' ?
		{ tools: potentialTools, tool_choice: { type: 'auto' } } as const
		: {}

	console.log(`[sendLLMMessage] Anthropic - chatMode: ${chatMode}, tools count: ${potentialTools?.length ?? 0}, specialToolFormat: ${specialToolFormat}`)
	if (potentialTools && potentialTools.length > 0 && specialToolFormat === 'anthropic-style') {
		console.log(`[sendLLMMessage] Tool names:`, potentialTools.map(t => t.name).join(', '))
	} else if (potentialTools && potentialTools.length > 0) {
		console.log(`[sendLLMMessage] ⚠️ TOOLS NOT SENT - specialToolFormat is ${specialToolFormat}, expected 'anthropic-style'`)
	}

	// instance
	const anthropic = new Anthropic({
		apiKey: thisConfig.apiKey,
		dangerouslyAllowBrowser: true
	});

	const stream = anthropic.messages.stream({
		system: separateSystemMessage ?? undefined,
		messages: messages as AnthropicLLMChatMessage[],
		model: modelName,
		max_tokens: maxTokens ?? 4_096, // anthropic requires this
		...includeInPayload,
		...nativeToolsObj,
	})

	// when receive text
	let fullText = ''
	let fullReasoning = ''

	let fullToolName = ''
	let fullToolParams = ''


	const runOnText = () => {
		onText({
			fullText,
			fullReasoning,
			toolCall: !fullToolName ? undefined : { name: fullToolName, rawParams: {}, isDone: false, doneParams: [], id: 'dummy' },
		})
	}
	// there are no events for tool_use, it comes in at the end
	stream.on('streamEvent', e => {
		// start block
		if (e.type === 'content_block_start') {
			if (e.content_block.type === 'text') {
				if (fullText) fullText += '\n\n' // starting a 2nd text block
				fullText += e.content_block.text
				runOnText()
			}
			else if (e.content_block.type === 'thinking') {
				if (fullReasoning) fullReasoning += '\n\n' // starting a 2nd reasoning block
				fullReasoning += e.content_block.thinking
				runOnText()
			}
			else if (e.content_block.type === 'redacted_thinking') {
				console.log('delta', e.content_block.type)
				if (fullReasoning) fullReasoning += '\n\n' // starting a 2nd reasoning block
				fullReasoning += '[redacted_thinking]'
				runOnText()
			}
			else if (e.content_block.type === 'tool_use') {
				fullToolName += e.content_block.name ?? '' // anthropic gives us the tool name in the start block
				runOnText()
			}
		}

		// delta
		else if (e.type === 'content_block_delta') {
			if (e.delta.type === 'text_delta') {
				fullText += e.delta.text
				runOnText()
			}
			else if (e.delta.type === 'thinking_delta') {
				fullReasoning += e.delta.thinking
				runOnText()
			}
			else if (e.delta.type === 'input_json_delta') { // tool use
				fullToolParams += e.delta.partial_json ?? '' // anthropic gives us the partial delta (string) here - https://docs.anthropic.com/en/api/messages-streaming
				runOnText()
			}
		}
	})

	// on done - (or when error/fail) - this is called AFTER last streamEvent
	stream.on('finalMessage', (response) => {
		const anthropicReasoning = response.content.filter(c => c.type === 'thinking' || c.type === 'redacted_thinking')
		const tools = response.content.filter(c => c.type === 'tool_use')
		// console.log('TOOLS!!!!!!', JSON.stringify(tools, null, 2))
		// console.log('TOOLS!!!!!!', JSON.stringify(response, null, 2))
		const toolCall = tools[0] && rawToolCallObjOfAnthropicParams(tools[0])
		const toolCallObj = toolCall ? { toolCall } : {}

		onFinalMessage({ fullText, fullReasoning, anthropicReasoning, ...toolCallObj })
	})
	// on error
	stream.on('error', (error) => {
		if (error instanceof Anthropic.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }) }
		else { onError({ message: error + '', fullError: error }) }
	})
	_setAborter(() => stream.controller.abort())
}



// ------------ MISTRAL ------------
// https://docs.mistral.ai/api/#tag/fim
const sendMistralFIM = ({ messages, onFinalMessage, onError, settingsOfProvider, globalSettings, overridesOfModel, modelName: modelName_, _setAborter, providerName }: SendFIMParams_Internal) => {
	const { modelName, supportsFIM } = getModelCapabilities(providerName, modelName_, overridesOfModel)
	if (!supportsFIM) {
		if (modelName === modelName_)
			onError({ message: `Model ${modelName} does not support FIM.`, fullError: null })
		else
			onError({ message: `Model ${modelName_} (${modelName}) does not support FIM.`, fullError: null })
		return
	}

	const mistral = new MistralCore({ apiKey: settingsOfProvider.mistral.apiKey })
	fimComplete(mistral,
		{
			model: modelName,
			prompt: messages.prefix,
			suffix: messages.suffix,
			stream: false,
			maxTokens: 300,
			stop: messages.stopTokens,
		})
		.then(async response => {

			// unfortunately, _setAborter() does not exist
			let content = response?.ok ? response.value.choices?.[0]?.message?.content ?? '' : '';
			const fullText = typeof content === 'string' ? content
				: content.map(chunk => (chunk.type === 'text' ? chunk.text : '')).join('')

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		})
		.catch(error => {
			onError({ message: error + '', fullError: error });
		})
}


// ------------ OLLAMA ------------
const newOllamaSDK = ({ endpoint }: { endpoint: string }) => {
	// if endpoint is empty, normally ollama will send to 11434, but we want it to fail - the user should type it in
	if (!endpoint) throw new Error(`Ollama Endpoint was empty (please enter ${defaultProviderSettings.ollama.endpoint} in A-Coder if you want the default url).`)
	const ollama = new Ollama({ host: endpoint })
	return ollama
}

const ollamaList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider }: ListParams_Internal<OllamaModelResponse>) => {
	const onSuccess = ({ models }: { models: OllamaModelResponse[] }) => {
		onSuccess_({ models })
	}
	const onError = ({ error }: { error: string }) => {
		onError_({ error })
	}
	try {
		const thisConfig = settingsOfProvider.ollama
		const ollama = newOllamaSDK({ endpoint: thisConfig.endpoint })
		ollama.list()
			.then((response) => {
				const { models } = response
				onSuccess({ models })
			})
			.catch((error) => {
				onError({ error: error + '' })
			})
	}
	catch (error) {
		onError({ error: error + '' })
	}
}

const sendOllamaFIM = ({ messages, onFinalMessage, onError, settingsOfProvider, modelName, _setAborter }: SendFIMParams_Internal) => {
	const thisConfig = settingsOfProvider.ollama
	const ollama = newOllamaSDK({ endpoint: thisConfig.endpoint })

	let fullText = ''
	ollama.generate({
		model: modelName,
		prompt: messages.prefix,
		suffix: messages.suffix,
		options: {
			stop: messages.stopTokens,
			num_predict: 300, // max tokens
			// repeat_penalty: 1,
		},
		raw: true,
		stream: true, // stream is not necessary but lets us expose the
	})
		.then(async stream => {
			_setAborter(() => stream.abort())
			for await (const chunk of stream) {
				const newText = chunk.response
				fullText += newText
			}
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null })
		})
		// when error/fail
		.catch((error) => {
			onError({ message: error + '', fullError: error })
		})
}

// ---------------- GEMINI NATIVE IMPLEMENTATION ----------------

const toGeminiFunctionDecl = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo
	return {
		name,
		description,
		parameters: {
			type: Type.OBJECT,
			properties: Object.entries(params).reduce((acc, [key, value]) => {
				acc[key] = {
					type: Type.STRING,
					description: value.description
				};
				return acc;
			}, {} as Record<string, Schema>)
		}
	} satisfies FunctionDeclaration
}

const geminiTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined, options?: { enableMorphFastContext?: boolean }): GeminiTool[] | null => {
	const allowedTools = availableTools(chatMode, mcpTools, options)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null
	const functionDecls: FunctionDeclaration[] = []
	for (const t in allowedTools ?? {}) {
		functionDecls.push(toGeminiFunctionDecl(allowedTools[t]))
	}
	const tools: GeminiTool = { functionDeclarations: functionDecls, }
	return [tools]
}



// Enhanced Ollama chat with fallback for better tool calling reliability
const _sendOllamaChatWithFallback = async (params: SendChatParams_Internal) => {
	const { chatMode, mcpTools, modelName, globalSettings, modelSelectionOptions } = params

	// Check if model supports native tool calling
	const { specialToolFormat } = getModelCapabilities('ollama', modelName, params.overridesOfModel)
	const hasNativeTools = specialToolFormat === 'openai-style'
	const potentialTools = openAITools(chatMode, mcpTools, { enableMorphFastContext: (modelSelectionOptions?.morphFastContext ?? globalSettings.enableMorphFastContext) && !!globalSettings.morphApiKey })
	const hasTools = potentialTools && potentialTools.length > 0

	console.log(`[sendOllamaChatWithFallback] Model: ${modelName}, specialToolFormat: ${specialToolFormat}, hasTools: ${hasTools}`)

	// For models with native tool support, try OpenAI-compatible endpoint first
	if (hasNativeTools && hasTools) {
		console.log(`[sendOllamaChatWithFallback] 🚀 Trying OpenAI - compatible endpoint with native tools`)

		try {
			// Try the OpenAI-compatible endpoint
			await _sendOpenAICompatibleChat(params)
			console.log(`[sendOllamaChatWithFallback] ✅ OpenAI - compatible endpoint succeeded`)
			return
		} catch (error) {
			console.warn(`[sendOllamaChatWithFallback] ⚠️ OpenAI - compatible endpoint failed: `, error)

			// Check if it's a transient server error (5xx) that might be worth retrying
			const isTransientServerError = error?.status >= 500 && error?.status < 600
			if (isTransientServerError) {
				console.log(`[sendOllamaChatWithFallback] 🔄 Detected transient server error(${error.status}), retrying once...`)
				try {
					// Wait a moment before retry
					await new Promise(resolve => setTimeout(resolve, 1000))
					await _sendOpenAICompatibleChat(params)
					console.log(`[sendOllamaChatWithFallback] ✅ Retry succeeded`)
					return
				} catch (retryError) {
					console.warn(`[sendOllamaChatWithFallback] ⚠️ Retry also failed: `, retryError)
				}
			}

			console.log(`[sendOllamaChatWithFallback] 🔄 Retrying without native tool format`)
		}
	}

	// Fallback: Try without native tools if the first attempt failed
	if (hasTools) {
		try {
			// For the fallback, we'll just try the same function but let it naturally fall back
			// to XML tool calling if the model doesn't support native tools
			await _sendOpenAICompatibleChat(params)
			console.log(`[sendOllamaChatWithFallback] ✅ Fallback succeeded`)
		} catch (error) {
			// Check if it's a transient server error that might be worth retrying
			const isTransientServerError = error?.status >= 500 && error?.status < 600
			if (isTransientServerError) {
				console.log(`[sendOllamaChatWithFallback] 🔄 Detected transient server error in fallback(${error.status}), retrying once...`)
				try {
					// Wait a moment before retry
					await new Promise(resolve => setTimeout(resolve, 2000))
					await _sendOpenAICompatibleChat(params)
					console.log(`[sendOllamaChatWithFallback] ✅ Fallback retry succeeded`)
					return
				} catch (retryError) {
					console.warn(`[sendOllamaChatWithFallback] ⚠️ Fallback retry also failed: `, retryError)
				}
			}

			console.error(`[sendOllamaChatWithFallback] ❌ Both attempts failed: `, error)
			params.onError({ message: `Model produced a result A - Coder couldn't apply`, fullError: error })
		}
	} else {
		// No tools needed, use standard OpenAI-compatible chat
		console.log(`[sendOllamaChatWithFallback] 💬 No tools needed, using standard chat`)
		await _sendOpenAICompatibleChat(params)
	}
}

// Implementation for Gemini using Google's native API
const sendGeminiChat = async ({
	messages,
	separateSystemMessage,
	onText,
	onFinalMessage,
	onError,
	settingsOfProvider,
	globalSettings,
	overridesOfModel,
	modelName: modelName_,
	_setAborter,
	providerName,
	modelSelectionOptions,
	chatMode,
	mcpTools,
}: SendChatParams_Internal) => {

	if (providerName !== 'gemini') throw new Error(`Sending Gemini chat, but provider was ${providerName}`)

	const thisConfig = settingsOfProvider[providerName]

	const {
		modelName,
		specialToolFormat,
		// reasoningCapabilities,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	// const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here

	const thinkingConfig: ThinkingConfig | undefined = !reasoningInfo?.isReasoningEnabled ? undefined
		: reasoningInfo.type === 'budget_slider_value' ?
			{ thinkingBudget: reasoningInfo.reasoningBudget }
			: undefined // Gemini only supports budget_slider, not effort_slider

	console.log(`[sendLLMMessage] Gemini reasoning config:`, {
		reasoningInfo,
		thinkingConfig
	})

	// tools
	const potentialTools = geminiTools(chatMode, mcpTools, { enableMorphFastContext: (modelSelectionOptions?.morphFastContext ?? globalSettings.enableMorphFastContext) && !!globalSettings.morphApiKey })
	const toolConfig = potentialTools && specialToolFormat === 'gemini-style' ?
		potentialTools
		: undefined

	// instance
	const genAI = new GoogleGenAI({ apiKey: thisConfig.apiKey });


	// when receive text
	let fullReasoningSoFar = ''
	let fullTextSoFar = ''

	let toolName = ''
	let toolParamsStr = ''
	let toolId = ''
	let thoughtSignature = ''


	genAI.models.generateContentStream({
		model: modelName,
		config: {
			systemInstruction: separateSystemMessage,
			thinkingConfig: thinkingConfig,
			tools: toolConfig,
		},
		contents: messages as GeminiLLMChatMessage[],
	})
		.then(async (stream) => {
			_setAborter(() => { stream.return(fullTextSoFar); });

			// Process the stream
			for await (const chunk of stream) {
				// message
				const newText = chunk.text ?? ''
				fullTextSoFar += newText

				// reasoning and thought signature
				const candidates = (chunk as any).candidates
				if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
					for (const part of candidates[0].content.parts) {
						if (part.thought) {
							fullReasoningSoFar += part.text ?? ''
						}
					}
				}

				// tool call
				const functionCalls = chunk.functionCalls
				if (functionCalls && functionCalls.length > 0) {
					const functionCall = functionCalls[0] // Get the first function call
					toolName = functionCall.name ?? ''
					toolParamsStr = JSON.stringify(functionCall.args ?? {})
					toolId = functionCall.id ?? ''
					if ((functionCall as any).thought_signature) {
						thoughtSignature = (functionCall as any).thought_signature
					}
				}

				// call onText
				onText({
					fullText: fullTextSoFar,
					fullReasoning: fullReasoningSoFar,
					toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
				})
			}

			// on final
			if (!fullTextSoFar && !fullReasoningSoFar && !toolName) {
				onError({ message: 'A-Coder: Response from model was empty.', fullError: null })
			} else {
				if (!toolId) toolId = generateUuid() // ids are empty, but other providers might expect an id
				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId, thoughtSignature)
				const toolCallObj = toolCall ? { toolCall } : {}
				const anthropicReasoning: AnthropicReasoning[] | null = fullReasoningSoFar ? [{ type: 'thinking', thinking: fullReasoningSoFar, signature: thoughtSignature }] : null
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning, ...toolCallObj });
			}
		})
		.catch(error => {
			const message = error?.message
			if (typeof message === 'string') {

				if (error.message?.includes('API key')) {
					onError({ message: invalidApiKeyMessage(providerName), fullError: error });
				}
				else if (error?.message?.includes('429')) {
					onError({ message: 'Rate limit reached. ' + error, fullError: error });
				}
				else
					onError({ message: error + '', fullError: error });
			}
			else {
				onError({ message: error + '', fullError: error });
			}
		})
};



type CallFnOfProvider = {
	[providerName in ProviderName]: {
		sendChat: (params: SendChatParams_Internal) => Promise<void>;
		sendFIM: ((params: SendFIMParams_Internal) => void) | null;
		list: ((params: ListParams_Internal<any>) => void) | null;
	}
}

export const sendLLMMessageToProviderImplementation = {
	anthropic: {
		sendChat: sendAnthropicChat,
		sendFIM: null,
		list: null,
	},
	openAI: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	xAI: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	gemini: {
		sendChat: (params) => sendGeminiChat(params),
		sendFIM: null,
		list: null,
	},
	mistral: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => sendMistralFIM(params),
		list: null,
	},
	ollama: {
		sendChat: (params) => _sendOllamaChatWithFallback(params),
		sendFIM: sendOllamaFIM,
		list: ollamaList,
	},
	openAICompatible: {
		sendChat: (params) => _sendOpenAICompatibleChat(params), // using openai's SDK is not ideal (your implementation might not do tools, reasoning, FIM etc correctly), talk to us for a custom integration
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	openRouter: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	vLLM: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: (params) => _openaiCompatibleList(params),
	},
	deepseek: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	groq: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},

	lmStudio: {
		// lmStudio has no suffix parameter in /completions, so sendFIM might not work
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: (params) => _openaiCompatibleList(params),
	},
	liteLLM: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	googleVertex: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	microsoftAzure: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	awsBedrock: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},

} satisfies CallFnOfProvider




/*
FIM info (this may be useful in the future with vLLM, but in most cases the only way to use FIM is if the provider explicitly supports it):

qwen2.5-coder https://ollama.com/library/qwen2.5-coder/blobs/e94a8ecb9327
<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>

codestral https://ollama.com/library/codestral/blobs/51707752a87c
[SUFFIX]{{ .Suffix }}[PREFIX] {{ .Prompt }}

deepseek-coder-v2 https://ollama.com/library/deepseek-coder-v2/blobs/22091531faf0
<｜fim▁begin｜>{{ .Prompt }}<｜fim▁hole｜>{{ .Suffix }}<｜fim▁end｜>

starcoder2 https://ollama.com/library/starcoder2/blobs/3b190e68fefe
<file_sep>
<fim_prefix>
{{ .Prompt }}<fim_suffix>{{ .Suffix }}<fim_middle>
<|end_of_text|>

codegemma https://ollama.com/library/codegemma:2b/blobs/48d9a8140749
<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>

*/
