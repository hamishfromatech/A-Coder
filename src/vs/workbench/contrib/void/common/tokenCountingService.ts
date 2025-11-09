/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { LLMChatMessage } from './sendLLMMessageTypes.js';

/**
 * Service for counting tokens in messages and managing context windows.
 * Uses character-based estimation (~4 chars per token).
 * For exact counting, use the IPC channel directly in main process.
 */
export class TokenCountingService {
	constructor() {
		console.log('[TokenCountingService] Using character-based token estimation');
	}

	/**
	 * Count tokens in a single text string
	 * Uses character-based estimation: ~4 characters per token
	 */
	public countTextTokens(text: string, modelName: string): number {
		// Fallback: estimate ~4 characters per token
		return Math.ceil(text.length / 4);
	}

	/**
	 * Count tokens in a chat message
	 * Uses character-based estimation
	 */
	public countMessageTokens(message: LLMChatMessage, modelName: string): number {
		// Estimate based on JSON string length
		const messageStr = JSON.stringify(message);
		// Add overhead for message formatting (~4 tokens per message)
		return Math.ceil(messageStr.length / 4) + 4;
	}

	/**
	 * Count tokens in an array of chat messages
	 */
	public countMessagesTokens(messages: LLMChatMessage[], modelName: string): number {
		let totalTokens = 0;
		
		for (const message of messages) {
			totalTokens += this.countMessageTokens(message, modelName);
		}
		
		// Every reply is primed with assistant message tokens
		totalTokens += 3;
		
		return totalTokens;
	}


	/**
	 * Get the context window size for a model
	 */
	public getContextWindowSize(modelName: string): number {
		// Strip provider prefix if present (e.g., "ollama:minimax-m2:cloud" → "minimax-m2:cloud")
		const cleanName = modelName.includes(':') && modelName.split(':').length > 2
			? modelName.split(':').slice(1).join(':')
			: modelName;
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
			// Anthropic
			'claude-3-opus': 200000,
			'claude-3-sonnet': 200000,
			'claude-3-haiku': 200000,
			'claude-3.5-sonnet': 200000,
			// Google
			'gemini-pro': 32768,
			'gemini-1.5-pro': 1000000,
			'gemini-1.5-flash': 1000000,
			// Ollama Cloud models
			'deepseek-v3.1:671b-cloud': 128000,
			'gpt-oss:20b-cloud': 128000,
			'gpt-oss:120b-cloud': 128000,
			'kimi-k2:1t-cloud': 128000,
			'kimi-k2-thinking:1t-cloud': 256000, // Kimi K2 Thinking has 256k context
			'qwen3-coder:480b-cloud': 128000,
			'minimax-m2:cloud': 128000,
			'glm-4.6:cloud': 128000,
			// Ollama models (common ones)
			'llama3': 8192,
			'llama3.1': 128000,
			'llama3.2': 128000,
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
		
		// Try partial match
		for (const [key, value] of Object.entries(contextWindows)) {
			if (lowerName.includes(key)) {
				return value;
			}
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
		
		// Default to 4096 for unknown cloud models (conservative)
		console.warn(`[TokenCountingService] Unknown context window for ${modelName}, defaulting to 4096`);
		return 4096;
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
