/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { LLMChatMessage } from './sendLLMMessageTypes.js';
import { TokenCountingService } from './tokenCountingService.js';

/**
 * Configuration for context compression with rolling window support
 */
export interface CompressionConfig {
	/** Target percentage of context window to use (0-1) - lower means more aggressive compression */
	targetUsage: number;
	/** Minimum number of recent messages to always keep (preserves recency) */
	keepLastNMessages: number;
	/** Whether to summarize old messages vs removing them */
	enableSummarization: boolean;
	/** Maximum length for tool results before truncation */
	maxToolResultLength: number;
	/** Reserved tokens for system message and output */
	reservedTokens: number;
	/** Emergency fallback: if still over limit, keep only last N messages */
	emergencyKeepLastN: number;
}

/**
 * Default compression configuration - optimized for rolling window approach
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
	targetUsage: 0.85, // Use 85% of context window (more aggressive)
	keepLastNMessages: 10, // Keep last 10 messages (5 turns) for better context
	enableSummarization: true,
	maxToolResultLength: 50000, // Allow larger tool results for file operations (was 1500, too aggressive)
	reservedTokens: 8192, // Reserve 8K tokens for system + output (adjustable per model)
	emergencyKeepLastN: 4, // In emergency, keep only last 4 messages
};

/**
 * Statistics about the compression operation
 */
export interface CompressionStats {
	originalTokens: number;
	originalMessageCount: number;
	targetTokens: number;
	finalTokens: number;
	finalMessageCount: number;
	messagesRemoved: number;
	messagesSummarized: number;
	toolResultsTruncated: number;
	compressionRatio: number; // Percentage of original tokens retained
}

/**
 * Service for compressing message context using a rolling window approach
 *
 * Strategy (in order):
 * 1. Truncate large tool results
 * 2. Summarize middle messages (preserving recent and system)
 * 3. Remove oldest messages if still over limit (rolling window)
 * 4. Emergency: keep only the most recent messages
 */
export class ContextCompressionService {
	constructor(
		private tokenCountingService: TokenCountingService
	) { }

	/**
	 * Compress messages to fit within target token limit using rolling window approach
	 *
	 * This method ensures we never exceed the context window by:
	 * - Preserving system message (if any)
	 * - Preserving the most recent N messages (recency bias)
	 * - Summarizing or removing older messages
	 */
	public async compressMessages(
		messages: LLMChatMessage[],
		modelName: string,
		config: Partial<CompressionConfig> = {}
	): Promise<{
		compressedMessages: LLMChatMessage[];
		stats: CompressionStats;
	}> {
		const fullConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
		const contextWindow = this.tokenCountingService.getContextWindowSize(modelName);

		// For large context windows (1M+ tokens), use conservative buffer for non-linear tokenization
		const largeContextBuffer = this.tokenCountingService.getLargeContextBuffer(contextWindow);
		const effectiveContextWindow = contextWindow - largeContextBuffer;

		// Calculate effective target (accounting for reserved tokens and large context buffer)
		const effectiveTarget = effectiveContextWindow - fullConfig.reservedTokens;
		const targetTokens = Math.floor(effectiveTarget * fullConfig.targetUsage);

		// Count tokens (use async for accuracy)
		let originalTokens: number;
		try {
			originalTokens = await this.tokenCountingService.countMessagesTokensAsync(messages, modelName);
		} catch (error) {
			// Fallback to character estimation — avoid JSON.stringify due to circular ref risk
			const safeStr = messages.map(m => {
				if ('content' in m && typeof m.content === 'string') return m.content
				if ('parts' in m && Array.isArray(m.parts)) return m.parts.map((p: any) => p.text || '').join(' ')
				return ''
			}).join(' ')
			originalTokens = this.estimateTokens(safeStr);
		}

		const stats: CompressionStats = {
			originalTokens,
			originalMessageCount: messages.length,
			targetTokens,
			finalTokens: 0,
			finalMessageCount: 0,
			messagesRemoved: 0,
			messagesSummarized: 0,
			toolResultsTruncated: 0,
			compressionRatio: 0,
		};

		// If already under target, no compression needed
		if (originalTokens <= targetTokens) {
			stats.finalTokens = originalTokens;
			stats.finalMessageCount = messages.length;
			stats.compressionRatio = 100;
			return { compressedMessages: messages, stats };
		}

		console.log(`[ContextCompression] Compressing ${messages.length} messages (${originalTokens} tokens) to target ${targetTokens} tokens (context: ${contextWindow})`);

		// Step 1: Identify system message, split messages, and identify critical messages
		const { systemMessage, recentMessages, oldMessages, criticalMessages } = this.splitMessages(messages);

		console.log(`[ContextCompression] Identified ${criticalMessages.size} critical messages to preserve`);

		// Step 2: Truncate large tool results in all message categories
		let processedRecent = this.truncateToolResults(recentMessages, fullConfig.maxToolResultLength);
		let processedOld = this.truncateToolResults(oldMessages, fullConfig.maxToolResultLength);


		// Count truncated messages
		const recentTruncated = processedRecent.length - recentMessages.length;
		const oldTruncated = processedOld.length - oldMessages.length;
		stats.toolResultsTruncated = Math.max(recentTruncated, oldTruncated);

		// Step 3: Calculate target for recent + system (keep more for recency)
		const recentTargetTokens = Math.floor(targetTokens * 0.7); // 70% for recent messages
		const summaryTargetTokens = Math.floor(targetTokens * 0.25); // 25% for summary

		let currentTokens = await this.tokenCountingService.countMessagesTokensAsync(processedRecent, modelName);

		// If recent messages alone exceed target, we need emergency compression
		if (currentTokens > recentTargetTokens) {
			console.log(`[ContextCompression] Recent messages too large (${currentTokens} > ${recentTargetTokens}), applying emergency compression`);

			// Emergency: progressively reduce recent messages until fit
			processedRecent = await this.emergencyCompress(
				processedRecent,
				modelName,
				recentTargetTokens,
				fullConfig.emergencyKeepLastN
			);
			currentTokens = await this.tokenCountingService.countMessagesTokensAsync(processedRecent, modelName);
		}

		// Step 4: Create summary of old messages if we have room
		let summaryMessage: LLMChatMessage | null = null;
		const availableForSummary = targetTokens - currentTokens;

		if (availableForSummary > 500 && processedOld.length > 0 && fullConfig.enableSummarization) {
			summaryMessage = this.createSummaryMessage(processedOld, Math.min(availableForSummary, summaryTargetTokens));
			stats.messagesSummarized = processedOld.length;
		} else if (processedOld.length > 0 && fullConfig.enableSummarization) {
			// No room for summary, but we still need to remove old messages
			stats.messagesRemoved = processedOld.length;
		}

		// Step 5: Combine messages (system + summary + recent)
		let finalMessages: LLMChatMessage[] = [];

		if (systemMessage) {
			finalMessages.push(systemMessage);
		}

		if (summaryMessage) {
			finalMessages.push(summaryMessage);
		}

		finalMessages = finalMessages.concat(processedRecent);

		// Final safety check - if still over, emergency truncate recent messages
		let finalTokens = await this.tokenCountingService.countMessagesTokensAsync(finalMessages, modelName);
		if (finalTokens > targetTokens) {
			console.warn(`[ContextCompression] Still over target after compression (${finalTokens} > ${targetTokens}), applying emergency truncation`);
			finalMessages = await this.emergencyCompress(finalMessages, modelName, targetTokens, fullConfig.emergencyKeepLastN);
			finalTokens = await this.tokenCountingService.countMessagesTokensAsync(finalMessages, modelName);
		}

		stats.finalTokens = finalTokens;
		stats.finalMessageCount = finalMessages.length;
		stats.compressionRatio = Math.round((finalTokens / originalTokens) * 100);

		console.log(`[ContextCompression] Result: ${stats.finalMessageCount} messages, ${stats.finalTokens} tokens (${stats.compressionRatio}% of original), removed ${stats.messagesRemoved}, summarized ${stats.messagesSummarized}`);

		return { compressedMessages: finalMessages, stats };
	}

	/**
	 * Split messages into system, recent, and old categories
	 * Also identifies critical user intent messages to preserve
	 */
	private splitMessages(messages: LLMChatMessage[]): {
		systemMessage: LLMChatMessage | null;
		recentMessages: LLMChatMessage[];
		oldMessages: LLMChatMessage[];
		criticalMessages: Set<number>; // Indices of messages to always preserve
	} {
		if (messages.length === 0) {
			return { systemMessage: null, recentMessages: [], oldMessages: [], criticalMessages: new Set() };
		}

		const criticalMessages = new Set<number>();

		// Check if first message is system message
		const firstMsg = messages[0];
		const hasSystemMessage = 'role' in firstMsg &&
			(firstMsg.role === 'system' || firstMsg.role === 'developer');

		// Always mark system message as critical
		if (hasSystemMessage) {
			criticalMessages.add(0);
		}

		// Mark recent user messages (especially the most recent user intent) as critical
		// Go backwards from the end to find the most recent user message
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			const role = ('role' in msg) ? msg.role : undefined;
			if (role === 'user') {
				criticalMessages.add(i);
				// Only mark the most recent user message as critical for intent preservation
				break;
			}
		}

		if (hasSystemMessage) {
			// System message is first, then we have user/assistant/tool
			const systemMessage = firstMsg;
			const contentMessages = messages.slice(1);

			// Adjust critical indices for content messages (shift by 1)
			const adjustedCritical = new Set<number>();
			for (const idx of criticalMessages) {
				if (idx > 0) adjustedCritical.add(idx - 1);
			}

			// Last half of content messages are "recent", first half are "old"
			const midpoint = Math.floor(contentMessages.length / 2);
			const recentMessages = contentMessages.slice(midpoint);
			const oldMessages = contentMessages.slice(0, midpoint);

			return { systemMessage, recentMessages, oldMessages, criticalMessages: adjustedCritical };
		} else {
			// No system message, all messages are content
			const midpoint = Math.floor(messages.length / 2);
			const recentMessages = messages.slice(midpoint);
			const oldMessages = messages.slice(0, midpoint);

			return { systemMessage: null, recentMessages, oldMessages, criticalMessages };
		}
	}

	/**
	 * Emergency compression: progressively reduce messages until they fit
	 * Preserves critical messages (system, most recent user intent)
	 */
	private async emergencyCompress(
		messages: LLMChatMessage[],
		modelName: string,
		maxTokens: number,
		minKeepMessages: number
	): Promise<LLMChatMessage[]> {
		if (messages.length <= minKeepMessages) {
			return messages;
		}

		// Identify critical messages that should never be removed
		const criticalIndices = new Set<number>();

		// Check if first message is system/developer message
		const firstMsg = messages[0];
		if ('role' in firstMsg && (firstMsg.role === 'system' || firstMsg.role === 'developer')) {
			criticalIndices.add(0);
		}

		// Find the most recent user message (preserves user intent)
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			const role = ('role' in msg) ? msg.role : undefined;
			if (role === 'user') {
				criticalIndices.add(i);
				break; // Only preserve most recent user message
			}
		}

		let currentMessages = [...messages];
		let iterations = 0;
		const maxIterations = 30; // Prevent infinite loops

		while (iterations < maxIterations) {
			const currentTokens = await this.tokenCountingService.countMessagesTokensAsync(currentMessages, modelName);

			if (currentTokens <= maxTokens) {
				break;
			}

			// Early break if we've already reduced to minimum
			if (currentMessages.length <= minKeepMessages) {
				break;
			}

			// Recompute critical indices based on the CURRENT array state
			const currentCriticalIndices = new Set<number>();
			const currentFirstMsg = currentMessages[0];
			if ('role' in currentFirstMsg && (currentFirstMsg.role === 'system' || currentFirstMsg.role === 'developer')) {
				currentCriticalIndices.add(0);
			}
			for (let i = currentMessages.length - 1; i >= 0; i--) {
				const msg = currentMessages[i];
				const role = ('role' in msg) ? msg.role : undefined;
				if (role === 'user') {
					currentCriticalIndices.add(i);
					break;
				}
			}

			// Remove oldest non-critical messages first
			let keepStartIndex = 0;
			for (let i = 0; i < currentMessages.length; i++) {
				if (!currentCriticalIndices.has(i)) {
					keepStartIndex = i + 1;
					break;
				}
			}

			// Calculate how many to keep, ensuring we keep all critical messages
			const nonCriticalCount = currentMessages.length - keepStartIndex;
			const targetKeepCount = Math.max(minKeepMessages, Math.floor(nonCriticalCount * 0.7));
			const finalKeepStart = Math.max(keepStartIndex, currentMessages.length - targetKeepCount - keepStartIndex);

			currentMessages = currentMessages.slice(finalKeepStart);
			iterations++;
		}

		if (iterations >= maxIterations) {
			console.warn(`[ContextCompression] Emergency compression hit max iterations, preserving critical messages`);
			// Recompute critical indices one final time from the current state
			const finalCriticalIndices = new Set<number>();
			const finalFirstMsg = currentMessages[0];
			if ('role' in finalFirstMsg && (finalFirstMsg.role === 'system' || finalFirstMsg.role === 'developer')) {
				finalCriticalIndices.add(0);
			}
			for (let i = currentMessages.length - 1; i >= 0; i--) {
				const msg = currentMessages[i];
				const role = ('role' in msg) ? msg.role : undefined;
				if (role === 'user') {
					finalCriticalIndices.add(i);
					break;
				}
			}

			// At minimum, return critical messages if available
			if (finalCriticalIndices.size > 0) {
				const firstCriticalIdx = finalCriticalIndices.values().next().value;
				if (firstCriticalIdx !== undefined && finalCriticalIndices.size === 1) {
					return [currentMessages[firstCriticalIdx]];
				}
				return currentMessages.filter((_, i) => finalCriticalIndices.has(i));
			}
			return currentMessages.slice(-minKeepMessages);
		}

		return currentMessages;
	}

	/**
	 * Create a summary message from old messages
	 */
	private createSummaryMessage(oldMessages: LLMChatMessage[], maxTokens: number): LLMChatMessage {
		// Extract key information from old messages
		const summaryParts: string[] = [];
		let totalLength = 0;

		for (const msg of oldMessages) {
			// Extract content based on message format
			let content = '';

			// Handle string content
			if ('content' in msg && typeof msg.content === 'string') {
				content = msg.content;
			}
			// Handle array content (OpenAI/Anthropic format)
			else if ('content' in msg && Array.isArray(msg.content)) {
				content = msg.content
					.map((part: any) => {
						if ('text' in part) return part.text;
						if ('thinking' in part) return `[thinking: ${part.thinking.substring(0, 100)}...]`;
						if ('tool_result' in part) return `[result for ${(msg as any).name || 'tool'}]`;
						return '';
					})
					.join(' | ');
			}
			// Handle parts format (Gemini)
			else if ('parts' in msg) {
				content = msg.parts
					.map((part: any) => {
						if ('text' in part) return part.text;
						if ('functionCall' in part) return `[called ${part.functionCall.name}]`;
						if ('functionResponse' in part) return `[response from ${part.functionResponse.name}]`;
						return '';
					})
					.join(' | ');
			}

			// Truncate each message to a preview
			const preview = content.split(/\n\n|\n/).slice(0, 2).join(' ').substring(0, 500);
			if (preview.length > 10) {
				const role = (msg as any).role || 'msg';
				const entry = `[${role}]: ${preview}`;

				if (totalLength + entry.length < maxTokens * 4) { // Rough char estimate
					summaryParts.push(entry);
					totalLength += entry.length;
				} else {
					break;
				}
			}
		}

		const summaryText = summaryParts.length > 0
			? `[PREVIOUS CONVERSATION SUMMARY - ${oldMessages.length} messages condensed]\n\n${summaryParts.join('\n')}\n\n[End of summary]`
			: '[Previous conversation context condensed]';

		// Return as user message (will be combined with actual recent messages)
		return {
			role: 'user',
			content: summaryText
		} as LLMChatMessage;
	}

	/**
	 * Fallback token estimation when IPC fails
	 */
	private estimateTokens(text: string): number {
		// More accurate estimation: ~4 chars per token for English, but varies
		return Math.ceil(text.length / 4) + 10;
	}

	/**
	 * Smart truncate JSON string to avoid context overflow
	 */
	private truncateJsonString(jsonStr: string, maxLength: number): string {
		if (jsonStr.length <= maxLength) return jsonStr;

		try {
			const obj = JSON.parse(jsonStr);
			let modified = false;

			const truncateRecursive = (o: any) => {
				if (!o || typeof o !== 'object') return;

				for (const key of Object.keys(o)) {
					if (typeof o[key] === 'string' && o[key].length > maxLength) {
						o[key] = o[key].substring(0, maxLength) + `\n... [truncated ${o[key].length - maxLength} chars]`;
						modified = true;
					} else if (typeof o[key] === 'object') {
						truncateRecursive(o[key]);
					}
				}
			};

			truncateRecursive(obj);

			if (modified) {
				return JSON.stringify(obj);
			}
		} catch (e) {
			// If invalid JSON, fallback to simple truncation if significantly larger
			if (jsonStr.length > maxLength * 2) {
				return jsonStr.substring(0, maxLength * 2) + `\n... [truncated raw string]`;
			}
		}
		return jsonStr;
	}

	/**
	 * Truncate large tool results and tool calls to reduce token usage
	 */
	private truncateToolResults(messages: LLMChatMessage[], maxLength: number): LLMChatMessage[] {
		return messages.map(msg => {
			// OpenAI tool format (role: tool)
			if ('role' in msg && msg.role === 'tool' && 'content' in msg) {
				if (typeof msg.content === 'string' && msg.content.length > maxLength) {
					return {
						...msg,
						content: msg.content.substring(0, maxLength) + `\n\n[... truncated ${msg.content.length - maxLength} characters for context window management]`
					};
				}
			}

			// OpenAI tool calls (role: assistant)
			if ('role' in msg && msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
				const newToolCalls = msg.tool_calls.map(tc => {
					if (tc.function.arguments.length > maxLength) {
						return {
							...tc,
							function: {
								...tc.function,
								arguments: this.truncateJsonString(tc.function.arguments, maxLength)
							}
						};
					}
					return tc;
				});
				return { ...msg, tool_calls: newToolCalls } as LLMChatMessage;
			}

			// Anthropic format
			if ('content' in msg && Array.isArray(msg.content)) {
				const newContent = msg.content.map(part => {
					// Tool result
					if ('type' in part && part.type === 'tool_result' && 'content' in part) {
						if (part.content.length > maxLength) {
							return {
								...part,
								content: part.content.substring(0, maxLength) + `\n\n[... truncated for context window]`
							};
						}
					}
					// Tool use (assistant)
					if ('type' in part && part.type === 'tool_use' && 'input' in part) {
						let modified = false;
						const newInput = { ...part.input };
						for (const key of Object.keys(newInput)) {
							if (typeof newInput[key] === 'string' && newInput[key].length > maxLength) {
								newInput[key] = newInput[key].substring(0, maxLength) + `\n... [truncated]`;
								modified = true;
							}
						}
						if (modified) {
							return { ...part, input: newInput };
						}
					}
					return part;
				});
				return { ...msg, content: newContent } as LLMChatMessage;
			}

			// Gemini format
			if ('parts' in msg) {
				const newParts = msg.parts.map(part => {
					// Function response
					if ('functionResponse' in part) {
						const output = part.functionResponse.response.output;
						if (output.length > maxLength) {
							return {
								...part,
								functionResponse: {
									...part.functionResponse,
									response: {
										output: output.substring(0, maxLength) + `\n\n[... truncated for context window]`
									}
								}
							};
						}
					}
					// Function call
					if ('functionCall' in part) {
						let modified = false;
						const newArgs = { ...part.functionCall.args };
						for (const key of Object.keys(newArgs)) {
							if (typeof newArgs[key] === 'string' && (newArgs[key] as string).length > maxLength) {
								newArgs[key] = (newArgs[key] as string).substring(0, maxLength) + `\n... [truncated]`;
								modified = true;
							}
						}
						if (modified) {
							return {
								...part,
								functionCall: { ...part.functionCall, args: newArgs }
							};
						}
					}
					return part;
				});
				return { ...msg, parts: newParts } as LLMChatMessage;
			}

			return msg;
		});
	}

	/**
	 * Check if compression is needed (async version for accuracy)
	 */
	public async needsCompression(
		messages: LLMChatMessage[],
		modelName: string,
		threshold: number = 0.8
	): Promise<boolean> {
		const currentTokens = await this.tokenCountingService.countMessagesTokensAsync(messages, modelName);
		const contextWindow = this.tokenCountingService.getContextWindowSize(modelName);
		const usage = currentTokens / contextWindow;

		return usage > threshold;
	}

	/**
	 * Get compression statistics without actually compressing (async version for accuracy)
	 */
	public async getCompressionPreview(
		messages: LLMChatMessage[],
		modelName: string,
		config: Partial<CompressionConfig> = {}
	): Promise<CompressionStats> {
		const { stats } = await this.compressMessages(messages, modelName, config);
		return stats;
	}
}
