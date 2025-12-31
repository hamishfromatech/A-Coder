/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { encodingForModel } from 'js-tiktoken';

/**
 * IPC Channel for Token Counting using js-tiktoken
 * Handles token counting requests from renderer process
 */
export class TokenCountingChannel implements IServerChannel {
	private encoderCache: Map<string, any> = new Map();
	private readonly MAX_ENCODERS = 5;

	private getEncoder(modelName: string) {
		if (this.encoderCache.has(modelName)) {
			// MRU: Move to end of map
			const encoder = this.encoderCache.get(modelName);
			this.encoderCache.delete(modelName);
			this.encoderCache.set(modelName, encoder);
			return encoder;
		}

		// Enforce limit
		if (this.encoderCache.size >= this.MAX_ENCODERS) {
			const oldestKey = this.encoderCache.keys().next().value;
			if (oldestKey) {
				this.encoderCache.delete(oldestKey);
			}
		}

		try {
			const encoder = encodingForModel(modelName as any);
			this.encoderCache.set(modelName, encoder);
			return encoder;
		} catch (error) {
			// If model not found, use cl100k_base (GPT-3.5/4 default)
			console.warn(`[TokenCountingChannel] Model ${modelName} not found, using cl100k_base`);
			const encoder = encodingForModel('gpt-3.5-turbo' as any);
			this.encoderCache.set(modelName, encoder);
			return encoder;
		}
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'countTokens': {
				const { text, modelName } = arg as { text: string; modelName: string };

				try {
					const encoder = this.getEncoder(modelName);
					const tokens = encoder.encode(text);
					const count = tokens.length;
					return count;
				} catch (error) {
					console.error('[TokenCountingChannel] Error counting tokens:', error);
					// Fallback to character estimation
					return Math.ceil(text.length / 4);
				}
			}

			case 'countMessagesTokens': {
				const { messages, modelName } = arg as {
					messages: Array<{ role: string; content: string }>;
					modelName: string;
				};

				try {
					const encoder = this.getEncoder(modelName);
					let totalTokens = 0;

					// Count tokens for each message
					// Add overhead for message formatting (role, delimiters, etc.)
					for (const message of messages) {
						const contentTokens = encoder.encode(message.content);
						const roleTokens = encoder.encode(message.role);

						// OpenAI format overhead: ~4 tokens per message
						totalTokens += contentTokens.length + roleTokens.length + 4;
					}

					// Add 3 tokens for reply priming
					totalTokens += 3;

					return totalTokens;
				} catch (error) {
					console.error('[TokenCountingChannel] Error counting message tokens:', error);
					// Fallback to character estimation
					const totalChars = messages.reduce((sum, msg) => sum + msg.content.length + msg.role.length, 0);
					return Math.ceil(totalChars / 4);
				}
			}

			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not supported: ${event}`);
	}

	dispose(): void {
		// Clear encoder cache
		this.encoderCache.clear();
	}
}
