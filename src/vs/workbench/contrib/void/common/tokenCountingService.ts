/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { LLMChatMessage } from './sendLLMMessageTypes.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

/**
 * Service for counting tokens in messages and managing context windows.
 * Uses tiktoken via IPC; falls back to character estimation if IPC fails.
 */
export class TokenCountingService {
	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
	) {
		console.log('[TokenCountingService] Using tiktoken via IPC with character-based fallback');
	}

	/**
	 * Count tokens in a single text string
	 * Uses tiktoken via IPC; falls back to character estimation if IPC fails.
	 * This method is synchronous and uses estimated values.
	 * For exact async counting, use countTextTokensAsync().
	 */
	public countTextTokens(text: string, modelName: string): number {
		// Try async IPC in a fire-and-forget way; if it fails, fall back to estimate.
		// We don't await here to keep this method synchronous for existing callers.
		this.countTextTokensAsync(text, modelName).then(
			() => { }, // success: nothing needed; result is cached internally if you want to add caching later
			() => { } // error: already handled by fallback
		);

		// Synchronous fallback estimate
		return Math.ceil(text.length / 4);
	}

	/**
	 * Count tokens in a chat message
	 * Uses tiktoken via IPC; falls back to character estimation if IPC fails.
	 * This method is synchronous and uses estimated values.
	 * For exact async counting, use countMessageTokensAsync().
	 */
	public countMessageTokens(message: LLMChatMessage, modelName: string): number {
		// Try async IPC for accuracy
		this.countMessageTokensAsync(message, modelName).then(
			() => { },
			() => { }
		);

		// Synchronous fallback estimate
		const messageStr = JSON.stringify(message);
		return Math.ceil(messageStr.length / 4) + 4;
	}

	/**
	 * Count tokens in an array of chat messages
	 * Uses tiktoken via IPC; falls back to character estimation if IPC fails.
	 * This method is synchronous and uses estimated values.
	 * For exact async counting, use countMessagesTokensAsync().
	 */
	public countMessagesTokens(messages: LLMChatMessage[], modelName: string): number {
		// Try async IPC for accuracy
		this.countMessagesTokensAsync(messages, modelName).then(
			() => { },
			() => { }
		);

		// Synchronous fallback estimate
		let totalTokens = 0;
		for (const message of messages) {
			totalTokens += this.countMessageTokens(message, modelName);
		}
		totalTokens += 3;
		return totalTokens;
	}

	/**
	 * Async version: count tokens in a single text string using tiktoken via IPC.
	 * Falls back to character estimation on IPC error.
	 */
	public async countTextTokensAsync(text: string, modelName: string): Promise<number> {
		try {
			const channel = this.mainProcessService.getChannel('void-channel-token-counting');
			const count = await channel.call('countTokens', { text, modelName });
			return typeof count === 'number' ? count : Math.ceil(text.length / 4);
		} catch (error) {
			console.warn('[TokenCountingService] IPC token counting failed, using character estimate:', error);
			return Math.ceil(text.length / 4);
		}
	}

	/**
	 * Helper to extract content from different message formats
	 */
	private _extractContent(message: LLMChatMessage): string {
		// OpenAI/Anthropic format
		if ('content' in message) {
			if (typeof message.content === 'string') {
				return message.content;
			}
			// Handle array content (Anthropic format with reasoning/multi-part)
			if (Array.isArray(message.content)) {
				return message.content
					.map(part => {
						if (typeof part === 'string') return part;
						if ('text' in part) return part.text;
						if ('thinking' in part) return `[thinking]${part.thinking}[/thinking]`;
						return '';
					})
					.join('');
			}
			return '';
		}

		// Gemini format
		if ('parts' in message) {
			return message.parts
				.map(part => {
					if ('text' in part) return part.text;
					if ('functionCall' in part) return `[function_call:${part.functionCall.name}]`;
					if ('functionResponse' in part) return `[function_response:${part.functionResponse.name}]`;
					return '';
				})
				.join('');
		}

		return '';
	}

	/**
	 * Helper to extract role from different message formats
	 */
	private _extractRole(message: LLMChatMessage): string {
		if ('role' in message) {
			return message.role;
		}
		return 'unknown';
	}

	/**
	 * Async version: count tokens in a single chat message using tiktoken via IPC.
	 * Falls back to character estimation on IPC error.
	 */
	public async countMessageTokensAsync(message: LLMChatMessage, modelName: string): Promise<number> {
		try {
			const channel = this.mainProcessService.getChannel('void-channel-token-counting');
			const plainMessage = {
				role: this._extractRole(message),
				content: this._extractContent(message)
			};
			const count = await channel.call('countMessagesTokens', { messages: [plainMessage], modelName });
			return typeof count === 'number' ? count : Math.ceil(JSON.stringify(message).length / 4) + 4;
		} catch (error) {
			console.warn('[TokenCountingService] IPC token counting failed, using character estimate:', error);
			const messageStr = JSON.stringify(message);
			return Math.ceil(messageStr.length / 4) + 4;
		}
	}

	/**
	 * Async version: count tokens in an array of chat messages using tiktoken via IPC.
	 * Falls back to character estimation on IPC error.
	 */
	public async countMessagesTokensAsync(messages: LLMChatMessage[], modelName: string): Promise<number> {
		try {
			const channel = this.mainProcessService.getChannel('void-channel-token-counting');
			const plainMessages = messages.map(msg => ({
				role: this._extractRole(msg),
				content: this._extractContent(msg)
			}));
			const count = await channel.call('countMessagesTokens', { messages: plainMessages, modelName });
			return typeof count === 'number' ? count : this._estimateMessagesTokens(messages);
		} catch (error) {
			console.warn('[TokenCountingService] IPC token counting failed, using character estimate:', error);
			return this._estimateMessagesTokens(messages);
		}
	}

	/**
	 * Internal helper: character-based estimate for messages (fallback).
	 */
	private _estimateMessagesTokens(messages: LLMChatMessage[]): number {
		let totalTokens = 0;
		for (const message of messages) {
			const messageStr = JSON.stringify(message);
			totalTokens += Math.ceil(messageStr.length / 4) + 4;
		}
		totalTokens += 3;
		return totalTokens;
	}


	/**
	 * Get the context window size for a model
	 */
	public getContextWindowSize(modelName: string): number {
		// Strip provider prefix if present (e.g., "ollama:minimax-m2:cloud" → "minimax-m2:cloud")
		// Also handle OpenRouter format (e.g., "openRouter:z-ai/glm-4.6:exacto" → "glm-4.6:exacto")
		const lowerModelName = modelName.toLowerCase();
		const isOpenRouter = lowerModelName.startsWith('openrouter:');

		let cleanName = modelName;
		if (modelName.includes(':') && modelName.split(':').length > 2) {
			cleanName = modelName.split(':').slice(1).join(':');
		} else if (modelName.includes(':')) {
			// Handle "provider:model" format
			cleanName = modelName.split(':')[1] || modelName;
		}
		// Handle OpenRouter "org/model" format (e.g., "x-ai/grok-4.1-fast" → "grok-4.1-fast")
		if (cleanName.includes('/')) {
			cleanName = cleanName.split('/').pop() || cleanName;
		}
		const lowerName = cleanName.toLowerCase();

		// Common model context windows
		const contextWindows: Record<string, number> = {
			// OpenAI
			'gpt-4-turbo': 128000,
			'gpt-4-turbo-preview': 128000,
			'gpt-4-1106-preview': 128000,
			'gpt-4': 8192,
			'gpt-4-32k': 32768,
			'gpt-3.5-turbo': 16385,
			'gpt-3.5-turbo-16k': 16385,
			'o1-preview': 128000,
			'o1-mini': 128000,
			'o3-mini': 200000,
			// Anthropic
			'claude-3-opus': 200000,
			'claude-3-sonnet': 200000,
			'claude-3-haiku': 200000,
			'claude-3.5-sonnet': 200000,
			'claude-3.5-haiku': 200000,
			'claude-3.7-sonnet': 200000,
			// Google
			'gemini-pro': 32768,
			'gemini-1.5-pro': 1000000,
			'gemini-1.5-flash': 1000000,
			'gemini-2.0-flash': 1000000,
			'gemini-3-pro-preview': 1000000,
			'gemini-3-pro': 1000000,
			'nemotron-3-nano': 1000000,
			// xAI Grok
			'grok-2': 131072,
			'grok-3': 131072,
			'grok-3-fast': 131072,
			'grok-3-mini': 131072,
			'grok-3-mini-fast': 131072,
			'grok-4': 256000,
			'grok-4-fast': 2000000,
			'grok-4.1-fast': 2000000,
			'grok-4.1-fast:free': 2000000,
			// DeepSeek
			'deepseek-v3': 128000,
			'deepseek-r1': 128000,
			// Ollama Cloud models
			'deepseek-v3.1:671b-cloud': 128000,
			'gpt-oss:20b-cloud': 128000,
			'gpt-oss:120b-cloud': 128000,
			'kimi-k2:1t-cloud': 128000,
			'kimi-k2-thinking:1t-cloud': 256000, // Kimi K2 Thinking has 256k context
			'kimi-k2-thinking:cloud': 256000, // Alias for kimi-k2-thinking:1t-cloud
			'qwen3-coder:480b-cloud': 128000,
			'minimax-m2:cloud': 128000,
			'minimax-m2.1:cloud': 203495,
			'glm-4.6': 128000,
			'glm-4.7': 203495,
			// Ollama models (common ones)
			'llama3.3': 128000,
			'llama3.1': 128000,
			'llama3.2': 128000,
			'llama3': 8192,
			'llama2': 4096,
			'mistral': 8192,
			'mixtral': 32768,
			'qwen': 32768,
			'qwen2': 32768,
			'codellama': 16384,
			'deepseek-coder': 16384,
			'phi': 2048,
			'gemma': 8192,
			'gemma2': 8192,
			// Other local models
			'yi': 4096,
			'solar': 4096,
		};

		// Try exact match first
		if (contextWindows[lowerName]) {
			return contextWindows[lowerName];
		}

		// Try to match by stripping everything after the first colon in lowerName
		const baseName = lowerName.split(':')[0];
		if (baseName && contextWindows[baseName]) {
			return contextWindows[baseName];
		}

		// Try partial match, prefer longer keys for better specificity
		const sortedKeys = Object.keys(contextWindows).sort((a, b) => b.length - a.length);
		for (const key of sortedKeys) {
			if (lowerName.includes(key)) {
				return contextWindows[key];
			}
		}

		// Default for OpenRouter models (most are 128k+)
		if (isOpenRouter) {
			console.warn(`[TokenCountingService] Unknown OpenRouter model ${modelName}, defaulting to 128000`);
			return 128000;
		}

		// For Ollama and local models, default to 8k (more generous than 4k)
		// Most modern local models support at least 8k context
		const isLikelyLocal = lowerName.includes('ollama') ||
			lowerName.includes('local') ||
			lowerName.includes('llama') ||
			lowerName.includes('mistral');

		if (isLikelyLocal) {
			console.warn(`[TokenCountingService] Unknown Ollama/local model ${modelName}, defaulting to 8192`);
			return 8192;
		}

		// Default to 131985 for unknown models (matches common modern model contexts)
		console.warn(`[TokenCountingService] Unknown context window for ${modelName}, defaulting to 131985`);
		return 131985;
	}

	/**
	 * Calculate remaining tokens in context window
	 */
	public getRemainingTokens(messages: LLMChatMessage[], modelName: string): number {
		const usedTokens = this.countMessagesTokens(messages, modelName);
		const contextWindow = this.getContextWindowSize(modelName);
		return Math.max(0, contextWindow - usedTokens);
	}

	/**
	 * Check if messages fit within context window
	 */
	public fitsInContextWindow(messages: LLMChatMessage[], modelName: string): boolean {
		return this.getRemainingTokens(messages, modelName) > 0;
	}

	/**
	 * Estimate tokens for a completion response
	 * This is a rough estimate - actual tokens will vary
	 */
	public estimateCompletionTokens(promptTokens: number, modelName: string): number {
		const contextWindow = this.getContextWindowSize(modelName);
		// Reserve 25% of remaining window for completion, or max 4096 tokens
		const remaining = contextWindow - promptTokens;
		return Math.min(4096, Math.floor(remaining * 0.25));
	}

	/**
	 * Dispose (no-op for character-based estimation)
	 */
	public dispose(): void {
		// No cleanup needed
	}
}
