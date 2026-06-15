/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { ChatMode } from '../common/voidSettingsTypes.js';
import { orchestration_systemMessage } from '../common/prompt/prompts.js';

export type OrchestrationToolSuggestion = {
	toolName: string;
	toolParams?: Record<string, unknown>;
	reasoning: string;
	confidence: 'high' | 'medium' | 'low';
	skipOrchestration?: boolean; // Set to true if orchestration model decides main LLM should handle everything
}

export type OrchestrationResult = {
	suggestions: OrchestrationToolSuggestion[];
	reasoning: string;
	summary: string;
}

export const IToolOrchestrationService = createDecorator<IToolOrchestrationService>('toolOrchestrationService');

export interface IToolOrchestrationService {
	readonly _serviceBrand: undefined;
	/**
	 * Get orchestration suggestions for a user message
	 */
	orchestrate: (params: {
		userMessage: string;
		chatMode: ChatMode;
		onProgress?: (reasoning: string) => void;
	}) => Promise<OrchestrationResult>;
}

class ToolOrchestrationService extends Disposable implements IToolOrchestrationService {
	_serviceBrand: undefined;

	constructor(
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
	) {
		super();
	}

	async orchestrate({ userMessage, chatMode, onProgress }: { userMessage: string; chatMode: ChatMode; onProgress?: (reasoning: string) => void }): Promise<OrchestrationResult> {
		// Check if orchestration is enabled
		if (!this._settingsService.state.globalSettings.enableToolOrchestration) {
			return { suggestions: [], reasoning: '', summary: '' };
		}

		// Get orchestration model selection
		const orchestrationModel = this._settingsService.state.modelSelectionOfFeature['ToolOrchestration'];
		if (!orchestrationModel) {
			console.log('[toolOrchestrationService] No orchestration model selected, skipping orchestration');
			return { suggestions: [], reasoning: '', summary: '' };
		}

		// Check if model is disabled
		const providerSettings = this._settingsService.state.settingsOfProvider[orchestrationModel.providerName];

		if (providerSettings.models.filter(m => !m.isHidden).length === 0) {
			console.log('[toolOrchestrationService] Orchestration model is disabled, skipping orchestration');
			return { suggestions: [], reasoning: '', summary: '' };
		}

		console.log('[toolOrchestrationService] Starting orchestration with model:', orchestrationModel.modelName);

		// Build system message for orchestration
		const systemMessage = orchestration_systemMessage({ chatMode });

		// Build messages for orchestration
		const messages = [
			{ role: 'system' as const, content: systemMessage },
			{ role: 'user' as const, content: userMessage },
		];

		// Call orchestration model
		return new Promise<OrchestrationResult>((resolve, reject) => {
			const requestId = this._llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				chatMode,
				messages,
				modelSelection: orchestrationModel,
				modelSelectionOptions: undefined,
				overridesOfModel: undefined,
				logging: { loggingName: 'ToolOrchestration', loggingExtras: { chatMode } },
				separateSystemMessage: undefined,
				onText: (params) => {
					if (params.fullReasoning) {
						onProgress?.(params.fullReasoning);
					}
				},
				onFinalMessage: (params) => {
					console.log('[toolOrchestrationService] Orchestration response received');
					const result = this._parseOrchestrationResponse(params.fullText);
					resolve(result);
				},
				onError: (params) => {
					console.error('[toolOrchestrationService] Error during orchestration:', params.message);
					// On error, return empty suggestions to fall back to normal behavior
					resolve({ suggestions: [], reasoning: '', summary: `Orchestration failed: ${params.message}` });
				},
				onAbort: () => {
					console.log('[toolOrchestrationService] Orchestration aborted');
					resolve({ suggestions: [], reasoning: '', summary: 'Orchestration aborted' });
				},
			});

			if (!requestId) {
				reject(new Error('Failed to send orchestration request'));
			}
		});
	}

	private _parseOrchestrationResponse(response: string): OrchestrationResult {
		try {
			const parsed = this._extractJsonFromResponse(response);
			const parsedObj = asUnknownRecord(parsed);
			if (!parsedObj) {
				return this._parseTextResponse(response);
			}

			// Validate and extract suggestions
			const suggestions: OrchestrationToolSuggestion[] = [];
			if ('suggestions' in parsedObj && Array.isArray(parsedObj.suggestions)) {
				for (const suggestion of parsedObj.suggestions) {
					const suggestionObj = asUnknownRecord(suggestion);
					if (!suggestionObj || typeof suggestionObj.toolName !== 'string') {
						continue;
					}
					const toolParams = 'toolParams' in suggestionObj ? asUnknownRecord(suggestionObj.toolParams) : undefined;
					suggestions.push({
						toolName: suggestionObj.toolName,
						toolParams: toolParams ?? undefined,
						reasoning: typeof suggestionObj.reasoning === 'string' ? suggestionObj.reasoning : '',
						confidence: isValidConfidence(suggestionObj.confidence) ? suggestionObj.confidence : 'medium',
						skipOrchestration: suggestionObj.skipOrchestration === true,
					});
				}
			}

			// Check if orchestration decided to skip
			if (parsedObj.skipOrchestration === true) {
				return {
					suggestions: [{ toolName: '__skip__', reasoning: typeof parsedObj.reasoning === 'string' ? parsedObj.reasoning : 'Main LLM should handle this request', confidence: 'high', skipOrchestration: true }],
					reasoning: typeof parsedObj.reasoning === 'string' ? parsedObj.reasoning : '',
					summary: typeof parsedObj.summary === 'string' ? parsedObj.summary : 'Orchestration skipped - delegating to main LLM',
				};
			}

			return {
				suggestions,
				reasoning: typeof parsedObj.reasoning === 'string' ? parsedObj.reasoning : accumulatedReasoningText(response),
				summary: typeof parsedObj.summary === 'string' ? parsedObj.summary : '',
			};
		} catch (error) {
			console.error('[toolOrchestrationService] Error parsing orchestration response:', error);
			// Return empty suggestions on parse error
			return { suggestions: [], reasoning: '', summary: 'Failed to parse orchestration response' };
		}
	}

	private _extractJsonFromResponse(response: string): unknown | undefined {
		// Try parsing the raw response first
		try {
			return JSON.parse(response.trim());
		} catch {
			// fall through
		}

		// Try a fenced JSON block
		const fencedMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (fencedMatch) {
			try {
				return JSON.parse(fencedMatch[1].trim());
			} catch {
				// fall through
			}
		}

		// Fall back to the largest JSON-like object in the response
		const looseMatch = response.match(/\{[\s\S]*\}/);
		if (looseMatch) {
			try {
				return JSON.parse(looseMatch[0]);
			} catch {
				// fall through
			}
		}

		return undefined;
	}

	private _parseTextResponse(response: string): OrchestrationResult {
		// Extract reasoning from text
		const reasoning = accumulatedReasoningText(response);

		// Try to find tool mentions
		const toolPattern = /(?:tool|call|use|execute):\s*(\w+)/gi;
		const tools: string[] = [];
		let match;
		while ((match = toolPattern.exec(response)) !== null) {
			tools.push(match[1]);
		}

		const suggestions: OrchestrationToolSuggestion[] = tools.map(tool => ({
			toolName: tool,
			reasoning: '',
			confidence: 'low',
		}));

		return {
			suggestions,
			reasoning,
			summary: response.slice(0, 200) + '...',
		};
	}
}

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
};

const isValidConfidence = (value: unknown): value is 'high' | 'medium' | 'low' => {
	return value === 'high' || value === 'medium' || value === 'low';
};

// Extract reasoning text from <reasoning> or ``` tags
const accumulatedReasoningText = (response: string): string => {
	const reasoningMatch = response.match(/<reasoning>([\s\S]*?)<\/reasoning>/) ||
		response.match(/```([\s\S]*?)```/);
	return reasoningMatch ? reasoningMatch[1].trim() : '';
};

registerSingleton(IToolOrchestrationService, ToolOrchestrationService, InstantiationType.Delayed);