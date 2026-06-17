/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

export interface CompressionEvent {
	timestamp: number;
	threadId: string;
	originalMessages: number;
	finalMessages: number;
	originalTokens: number;
	finalTokens: number;
	compressionRatio: number;
	messagesRemoved: number;
	messagesSummarized: number;
}

let compressionEventState: CompressionEvent | null = null;
const compressionEventListeners: Set<(event: CompressionEvent | null) => void> = new Set();

export const updateCompressionEventState = (event: CompressionEvent | null) => {
	compressionEventState = event;
	compressionEventListeners.forEach(l => l(compressionEventState));
};

export const getCompressionEventState = () => compressionEventState;

export const subscribeCompressionEvent = (listener: (event: CompressionEvent | null) => void) => {
	compressionEventListeners.add(listener);
	return {
		dispose: () => {
			compressionEventListeners.delete(listener);
		}
	};
};

export const triggerCompressionNotification = (stats: {
	originalMessageCount: number;
	finalMessageCount: number;
	originalTokens: number;
	finalTokens: number;
	compressionRatio: number;
	messagesRemoved: number;
	messagesSummarized: number;
}, threadId: string) => {
	updateCompressionEventState({
		timestamp: Date.now(),
		threadId,
		originalMessages: stats.originalMessageCount,
		finalMessages: stats.finalMessageCount,
		originalTokens: stats.originalTokens,
		finalTokens: stats.finalTokens,
		compressionRatio: stats.compressionRatio,
		messagesRemoved: stats.messagesRemoved,
		messagesSummarized: stats.messagesSummarized,
	});
};
