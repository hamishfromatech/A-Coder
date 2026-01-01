/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { SendLLMMessageParams, OnText, OnFinalMessage, OnError } from '../../common/sendLLMMessageTypes.js';
import { IMetricsService, LLMGenerationEvent } from '../../common/metricsService.js';
import { displayInfoOfProviderName } from '../../common/voidSettingsTypes.js';
import { sendLLMMessageToProviderImplementation } from './sendLLMMessage.impl.js';
import { generateUuid } from '../../../../../base/common/uuid.js';


export const sendLLMMessage = async ({
	messagesType,
	messages: messages_,
	onText: onText_,
	onFinalMessage: onFinalMessage_,
	onError: onError_,
	abortRef: abortRef_,
	logging: { loggingName, loggingExtras },
	settingsOfProvider,
	globalSettings,
	modelSelection,
	modelSelectionOptions,
	overridesOfModel,
	chatMode,
	separateSystemMessage,
	mcpTools,
}: SendLLMMessageParams,

	metricsService: IMetricsService
) => {


	const { providerName, modelName } = modelSelection

	// only captures number of messages and message "shape", no actual code, instructions, prompts, etc
	const captureLLMEvent = (eventId: string, extras?: object) => {


		metricsService.capture(eventId, {
			providerName,
			modelName,
			customEndpointURL: settingsOfProvider[providerName]?.endpoint,
			numModelsAtEndpoint: settingsOfProvider[providerName]?.models?.length,
			...messagesType === 'chatMessages' ? {
				numMessages: messages_?.length,
			} : messagesType === 'FIMMessage' ? {
				prefixLength: messages_.prefix.length,
				suffixLength: messages_.suffix.length,
			} : {},
			...loggingExtras,
			...extras,
		})
	}
	const submit_time = new Date()
	const traceId = generateUuid() // Unique ID for this LLM generation

	let _fullTextSoFar = ''
	let _aborter: (() => void) | null = null
	let _setAborter = (fn: () => void) => { _aborter = fn }
	let _didAbort = false
	let _firstTokenTime: Date | null = null

	// Helper to capture LLM generation event for observability
	const captureLLMGeneration = (status: LLMGenerationEvent['status'], extras?: Partial<LLMGenerationEvent>) => {
		const endTime = new Date()
		const latencyMs = endTime.getTime() - submit_time.getTime()
		const firstTokenLatencyMs = _firstTokenTime ? _firstTokenTime.getTime() - submit_time.getTime() : undefined

		const event: LLMGenerationEvent = {
			traceId,
			providerName,
			modelName,
			latencyMs,
			firstTokenLatencyMs,
			status,
			feature: loggingName,
			chatMode: chatMode ?? undefined,
			...messagesType === 'chatMessages' ? {
				messageCount: messages_?.length,
			} : {},
			...extras,
		}

		metricsService.captureLLMGeneration(event)
	}

	const onText: OnText = (params) => {
		const { fullText } = params
		if (_didAbort) return

		// Track time to first token
		if (!_firstTokenTime && fullText.length > 0) {
			_firstTokenTime = new Date()
		}

		onText_(params)
		_fullTextSoFar = fullText
	}

	const onFinalMessage: OnFinalMessage = (params) => {
		const { fullText, fullReasoning, toolCalls, usage } = params
		if (_didAbort) return

		// Legacy event capture (for backwards compatibility)
		captureLLMEvent(`${loggingName} - Received Full Message`, { messageLength: fullText.length, reasoningLength: fullReasoning?.length, duration: new Date().getMilliseconds() - submit_time.getMilliseconds(), toolCallName: toolCalls?.[0]?.name })

		// LLM Observability capture
		captureLLMGeneration('success', {
			responseLength: fullText.length,
			reasoningLength: fullReasoning?.length,
			hasToolCall: !!toolCalls && toolCalls.length > 0,
			toolCallName: toolCalls?.[0]?.name,
			inputTokens: usage?.promptTokens,
			outputTokens: usage?.completionTokens,
		})

		onFinalMessage_(params)
	}

	const onError: OnError = ({ message: errorMessage, fullError }) => {
		if (_didAbort) return
		console.error('sendLLMMessage onError:', errorMessage)

		// handle failed to fetch errors, which give 0 information by design
		if (errorMessage === 'TypeError: fetch failed')
			errorMessage = `Failed to fetch from ${displayInfoOfProviderName(providerName).title}. This likely means you specified the wrong endpoint in A-Coder's Settings, or your local model provider like Ollama is powered off.`

		// Legacy event capture
		captureLLMEvent(`${loggingName} - Error`, { error: errorMessage })

		// LLM Observability capture
		captureLLMGeneration('error', {
			errorMessage,
			responseLength: _fullTextSoFar.length,
		})

		onError_({ message: errorMessage, fullError })
	}

	// we should NEVER call onAbort internally, only from the outside
	const onAbort = () => {
		captureLLMEvent(`${loggingName} - Abort`, { messageLengthSoFar: _fullTextSoFar.length })

		// LLM Observability capture
		captureLLMGeneration('aborted', {
			responseLength: _fullTextSoFar.length,
		})

		try { _aborter?.() } // aborter sometimes automatically throws an error
		catch (e) { }
		_didAbort = true
	}
	abortRef_.current = onAbort


	if (messagesType === 'chatMessages')
		captureLLMEvent(`${loggingName} - Sending Message`, {})
	else if (messagesType === 'FIMMessage')
		captureLLMEvent(`${loggingName} - Sending FIM`, { prefixLen: messages_?.prefix?.length, suffixLen: messages_?.suffix?.length })


	try {
		const implementation = sendLLMMessageToProviderImplementation[providerName]
		if (!implementation) {
			onError({ message: `Error: Provider "${providerName}" not recognized.`, fullError: null })
			return
		}
		const { sendFIM, sendChat } = implementation
		if (messagesType === 'chatMessages') {
			await sendChat({ messages: messages_, onText, onFinalMessage, onError, settingsOfProvider, globalSettings, modelSelectionOptions, overridesOfModel, modelName, _setAborter, providerName, separateSystemMessage, chatMode, mcpTools })
			return
		}
		if (messagesType === 'FIMMessage') {
			if (sendFIM) {
				await sendFIM({ messages: messages_, onText, onFinalMessage, onError, settingsOfProvider, globalSettings, modelSelectionOptions, overridesOfModel, modelName, _setAborter, providerName, separateSystemMessage })
				return
			}
			onError({ message: `Error running Autocomplete with ${providerName} - ${modelName}.`, fullError: null })
			return
		}
		onError({ message: `Error: Message type "${messagesType}" not recognized.`, fullError: null })
		return
	}

	catch (error) {
		if (error instanceof Error) { onError({ message: error + '', fullError: error }) }
		else { onError({ message: `Unexpected Error in sendLLMMessage: ${error}`, fullError: error }); }
		// ; (_aborter as any)?.()
		// _didAbort = true
	}



}

