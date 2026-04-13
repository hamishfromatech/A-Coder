/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Position } from '../../../../editor/common/core/position.js';
import { EndOfLinePreference, ITextModel } from '../../../../editor/common/model.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IConvertToLLMMessageService } from './convertToLLMMessageService.js';
import { FeatureName } from '../common/voidSettingsTypes.js';

export const IProactiveLearningService = createDecorator<IProactiveLearningService>('proactiveLearningService');

export interface ProactiveCoachObservation {
	message: string;
	severity: 'info' | 'warning' | 'error';
	uri: URI;
	lineNumber: number;
	timestamp: number;
}

export interface IProactiveLearningService {
	readonly _serviceBrand: undefined;
	onObservation: Event<ProactiveCoachObservation>;
	dismissObservation(): void;
}

export class ProactiveLearningService extends Disposable implements IProactiveLearningService {
	readonly _serviceBrand = undefined;

	private readonly _onObservation = new Emitter<ProactiveCoachObservation>();
	readonly onObservation = this._onObservation.event;

	private readonly _debounceTimers = new Map<string, NodeJS.Timeout>();
	private readonly _lastCheckTime = new Map<string, number>();
	private _currentRequestId: string | null = null;

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly _voidSettingsService: IVoidSettingsService,
		@IConvertToLLMMessageService private readonly _convertToLLMMessageService: IConvertToLLMMessageService,
	) {
		super();

		// Initialize all existing models
		for (const model of this._modelService.getModels()) {
			this._initializeModel(model);
		}

		// Listen for new models
		this._register(this._modelService.onModelAdded(model => this._initializeModel(model)));

		// Listen for settings changes to enable/disable
		this._register(this._voidSettingsService.onDidChangeState(() => this._onSettingsChanged()));
	}

	private _onSettingsChanged(): void {
		const { enableProactiveCoach } = this._voidSettingsService.state.globalSettings;
		if (!enableProactiveCoach) {
			for (const timer of this._debounceTimers.values()) {
				clearTimeout(timer);
			}
			this._debounceTimers.clear();
		}
	}

	private _initializeModel(model: ITextModel): void {
		if (model.uri.scheme !== 'file') {
			return;
		}

		const uriKey = model.uri.fsPath;
		if (this._debounceTimers.has(uriKey)) {
			return;
		}

		this._register(
			model.onDidChangeContent(() => {
				this._onModelContentChanged(model);
			})
		);
	}

	private _onModelContentChanged(model: ITextModel): void {
		const { enableProactiveCoach, proactiveCoachIntervalSeconds } = this._voidSettingsService.state.globalSettings;

		if (!enableProactiveCoach) {
			return;
		}

		const uriKey = model.uri.fsPath;
		const now = Date.now();
		const lastCheck = this._lastCheckTime.get(uriKey) ?? 0;
		const intervalMs = proactiveCoachIntervalSeconds * 1000;

		// Rate limit
		if (now - lastCheck < intervalMs) {
			return;
		}

		// Debounce: wait 3 seconds after last keystroke before checking
		const existingTimer = this._debounceTimers.get(uriKey);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		const timer = setTimeout(() => {
			this._debounceTimers.delete(uriKey);
			this._checkCode(model);
		}, 3000);

		this._debounceTimers.set(uriKey, timer);
	}

	private async _checkCode(model: ITextModel): Promise<void> {
		const { enableProactiveCoach, studentLevel } = this._voidSettingsService.state.globalSettings;

		if (!enableProactiveCoach) {
			return;
		}

		const uriKey = model.uri.fsPath;
		this._lastCheckTime.set(uriKey, Date.now());

		// Get the active editor and cursor position
		const editor = this._codeEditorService.getActiveCodeEditor();
		if (!editor || editor.getModel() !== model) {
			return;
		}

		const position = editor.getPosition();
		if (!position) {
			return;
		}

		// Capture context around cursor
		const context = this._captureContext(model, position);

		// Skip if context is too small
		if (context.prefix.length < 50 && context.suffix.length < 50) {
			return;
		}

		// Build the LLM request
		const systemMessage = this._buildSystemMessage(studentLevel);
		const userMessage = this._buildUserMessage(context, model.getLanguageId());

		// Prepare messages
		const featureName: FeatureName = 'Chat';
			const modelSelection = this._voidSettingsService.state.modelSelectionOfFeature[featureName];
			if (!modelSelection) return;
		const { messages } = this._convertToLLMMessageService.prepareLLMSimpleMessages({
			simpleMessages: [{ role: 'user', content: userMessage }],
			systemMessage,
			modelSelection,
			featureName,
		});

		if (messages.length === 0) {
			return;
		}

		// Abort any existing request
		if (this._currentRequestId) {
			this._llmMessageService.abort(this._currentRequestId);
		}

		// Send to LLM
		const requestId = this._llmMessageService.sendLLMMessage({
			messagesType: 'chatMessages',
			messages,
			separateSystemMessage: undefined,
			chatMode: 'learn',
			onText: () => {},
			onFinalMessage: ({ fullText }) => {
				this._handleLLMResponse(fullText, model.uri, position.lineNumber);
			},
			onError: ({ message }) => {
				console.error('[ProactiveCoach] LLM error:', message);
			},
			onAbort: () => {},
			logging: {
				loggingName: 'proactiveCoach',
				loggingExtras: { uri: model.uri.fsPath },
			},
			modelSelection,
			modelSelectionOptions: undefined,
			overridesOfModel: this._voidSettingsService.state.overridesOfModel,
		});

		this._currentRequestId = requestId;
	}

	private _captureContext(model: ITextModel, position: Position): { prefix: string; suffix: string } {
		const fullText = model.getValue(EndOfLinePreference.LF);
		const cursorOffset = model.getOffsetAt(position);

		const maxContext = 2000;
		const prefix = fullText.substring(Math.max(0, cursorOffset - maxContext), cursorOffset);
		const suffix = fullText.substring(cursorOffset, Math.min(fullText.length, cursorOffset + maxContext));

		return { prefix, suffix };
	}

	private _buildSystemMessage(studentLevel: string): string {
		const levelInstructions = {
			beginner: 'Use simple language, avoid jargon, and provide gentle guidance.',
			intermediate: 'Use clear explanations with some technical terms.',
			advanced: 'Be concise and direct, assume strong technical knowledge.',
		};

		return `You are a proactive coding tutor watching a student write code. Your role is to provide brief, helpful observations about their code.

${levelInstructions[studentLevel as keyof typeof levelInstructions] || levelInstructions.intermediate}

Guidelines:
- Keep observations to ONE sentence maximum
- Focus on potential bugs, anti-patterns, or learning opportunities
- Be encouraging, not critical
- If the code looks fine, respond with exactly "CODE_LOOKS_GOOD"
- Do NOT provide full solutions or code fixes
- Do NOT ask questions - just make an observation

You are watching in real-time, so be brief and non-intrusive.`;
	}

	private _buildUserMessage(context: { prefix: string; suffix: string }, language: string): string {
		return `Review this code snippet (language: ${language}) and provide a brief observation if you notice anything worth mentioning.

Code before cursor:
\`\`\`
${context.prefix}
\`\`\`

Code after cursor:
\`\`\`
${context.suffix}
\`\`\`

Respond with just your observation, or "CODE_LOOKS_GOOD" if everything looks fine.`;
	}

	private _handleLLMResponse(response: string, uri: URI, lineNumber: number): void {
		const trimmed = response.trim();

		// Skip if the LLM says code looks good
		if (trimmed === 'CODE_LOOKS_GOOD' || trimmed.toLowerCase().includes('looks good')) {
			return;
		}

		// Determine severity based on keywords
		let severity: 'info' | 'warning' | 'error' = 'info';
		const lower = trimmed.toLowerCase();
		if (lower.includes('bug') || lower.includes('error') || lower.includes('incorrect') || lower.includes('wrong')) {
			severity = 'error';
		} else if (lower.includes('consider') || lower.includes('might') || lower.includes('could') || lower.includes('suggestion')) {
			severity = 'warning';
		}

		const observation: ProactiveCoachObservation = {
			message: trimmed,
			severity,
			uri,
			lineNumber,
			timestamp: Date.now(),
		};

		this._onObservation.fire(observation);
	}

	dismissObservation(): void {
		// Called when user dismisses the bubble
	}
}

registerSingleton(IProactiveLearningService, ProactiveLearningService, InstantiationType.Delayed);
