/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { RawToolCallObj, RawToolParamsObj } from '../common/sendLLMMessageTypes.js';

export interface ReActPhase {
	type: 'thought' | 'action' | 'observation' | 'idle';
	content?: string;
	immersionHint?: string; // Short "flavor text" for UX
	detectedAt: number;
	lastTransitionAt?: number;
}

export interface StreamingReActResult {
	phase: ReActPhase;
	toolCall?: RawToolCallObj | null;
	isComplete?: boolean;
}

export class StreamingXMLParser {
	private buffer: string = '';
	private state: 'IDLE' | 'SEARCHING_INVOKE' | 'SEARCHING_PARAM' | 'READING_PARAM_VALUE' = 'IDLE';
	private currentToolName: string | null = null;
	private currentParamName: string | null = null;
	private currentParamValue: string = '';
	private accumulatedParams: RawToolParamsObj = {};
	private toolCallId: string = 'streaming-tool-call'; // We might generate a UUID if needed

	// ReAct phase tracking
	private currentPhase: ReActPhase = { type: 'idle', detectedAt: Date.now() };
	private thoughtContent: string = '';
	private hasDetectedAction: boolean = false;

	constructor(toolCallId?: string) {
		if (toolCallId) this.toolCallId = toolCallId;
	}

	/**
	 * Parse streaming content for ReAct phases and tool calls
	 * Returns immediately when phases are detected, doesn't wait for complete blocks
	 */
	public parseReAct(chunk: string): StreamingReActResult | null {
		this.buffer += chunk;

		// Check for Thought: phase (at start of line or after previous action)
		if (!this.hasDetectedAction) {
			const thoughtMatch = this.buffer.match(/^Thought:\s*(.*)$/m);
			if (thoughtMatch) {
				const prevType = this.currentPhase.type;
				this.currentPhase = {
					type: 'thought',
					content: thoughtMatch[1]?.trim() || '',
					immersionHint: 'Analyzing the request...',
					detectedAt: Date.now(),
					lastTransitionAt: prevType !== 'thought' ? Date.now() : this.currentPhase.lastTransitionAt
				};
				this.thoughtContent = this.currentPhase.content || '';

				return { phase: this.currentPhase, toolCall: null, isComplete: false };
			}
		}

		// Check for Action phase (start of function_calls)
		if (!this.hasDetectedAction) {
			const actionStartMatch = this.buffer.match(/<function_calls>/);
			if (actionStartMatch) {
				const prevType = this.currentPhase.type;
				this.currentPhase = {
					type: 'action',
					content: 'Starting tool execution...',
					immersionHint: 'Preparing to take action...',
					detectedAt: Date.now(),
					lastTransitionAt: prevType !== 'action' ? Date.now() : this.currentPhase.lastTransitionAt
				};
				this.hasDetectedAction = true;

				// Create a preliminary tool call object for immediate UI feedback
				const preliminaryToolCall: RawToolCallObj = {
					name: 'detecting...',
					rawParams: {},
					doneParams: [],
					id: this.toolCallId,
					isDone: false
				};

				// Immediately return action detection with preliminary tool call for UI updates
				const result: StreamingReActResult = {
					phase: this.currentPhase,
					toolCall: preliminaryToolCall,
					isComplete: false
				};

				// Continue parsing the tool call - buffer already has the data
				const toolCall = this.parse('', true); // skipBufferAppend since we already added to buffer
				if (toolCall && toolCall.name !== 'detecting...') {
					result.toolCall = toolCall;
					result.isComplete = toolCall.isDone;
				}

				return result;
			}
		}

		// Continue parsing tool calls if we're in action phase
		if (this.hasDetectedAction) {
			const toolCall = this.parse('', true); // skipBufferAppend since we already added to buffer
			if (toolCall) {
				return {
					phase: this.currentPhase,
					toolCall,
					isComplete: toolCall.isDone
				};
			}
		}

		return null;
	}

	/**
	 * Reset parser state for new message
	 */
	public reset(): void {
		this.buffer = '';
		this.state = 'IDLE';
		this.currentToolName = null;
		this.currentParamName = null;
		this.currentParamValue = '';
		this.accumulatedParams = {};
		this.currentPhase = { type: 'idle', detectedAt: Date.now() };
		this.thoughtContent = '';
		this.hasDetectedAction = false;
	}

	/**
	 * Get current ReAct phase
	 */
	public getCurrentPhase(): ReActPhase {
		return this.currentPhase;
	}

	/**
	 * Get accumulated thought content
	 */
	public getThoughtContent(): string {
		return this.thoughtContent;
	}

	public parse(chunk: string, skipBufferAppend: boolean = false): RawToolCallObj | null {
		if (!skipBufferAppend) {
			this.buffer += chunk;
		}

		let loop = true;
		while (loop) {
			loop = false; // Default to stop unless we make a state transition that requires re-checking

			switch (this.state) {
				case 'IDLE': {
					// Look for <function_calls>
					const startTag = '<function_calls>';
					const idx = this.buffer.indexOf(startTag);
					if (idx !== -1) {
						this.buffer = this.buffer.slice(idx + startTag.length);
						this.state = 'SEARCHING_INVOKE';
						loop = true;
					}
					break;
				}

				case 'SEARCHING_INVOKE': {
					// Look for <invoke name="...">
					// We need to be careful about partial matches, but regex on buffer is okay
					const match = this.buffer.match(/<invoke\s+name="([^"]+)"\s*>/);
					if (match && match.index !== undefined) {
						this.currentToolName = match[1];
						this.buffer = this.buffer.slice(match.index + match[0].length);
						this.state = 'SEARCHING_PARAM';
						this.accumulatedParams = {}; // Reset params for new invoke
						loop = true;
					}
					break;
				}

				case 'SEARCHING_PARAM': {
					// Check for </invoke> first
					const endInvokeMatch = this.buffer.match(/<\/invoke>/);
					// Check for <parameter name="...">
					const paramMatch = this.buffer.match(/<parameter\s+name="([^"]+)"\s*>/);

					// We take whichever comes first
					if (endInvokeMatch && (!paramMatch || (endInvokeMatch.index! < paramMatch.index!))) {
						// End of invoke
						this.buffer = this.buffer.slice(endInvokeMatch.index! + endInvokeMatch[0].length);
						this.state = 'SEARCHING_INVOKE'; // Ready for next invoke
						this.currentToolName = null;
						loop = true;
					} else if (paramMatch && paramMatch.index !== undefined) {
						// Start of parameter
						this.currentParamName = paramMatch[1];
						this.buffer = this.buffer.slice(paramMatch.index + paramMatch[0].length);
						this.state = 'READING_PARAM_VALUE';
						this.currentParamValue = '';
						loop = true;
					}
					break;
				}

				case 'READING_PARAM_VALUE': {
					const endTag = '</parameter>';
					const endIdx = this.buffer.indexOf(endTag);

					if (endIdx !== -1) {
						// Found end tag
						const valuePart = this.buffer.slice(0, endIdx);
						this.currentParamValue += valuePart;
						if (this.currentParamName) {
							this.accumulatedParams[this.currentParamName] = this.currentParamValue;
						}
						this.buffer = this.buffer.slice(endIdx + endTag.length);
						this.state = 'SEARCHING_PARAM';
						loop = true;
					} else {
						// No end tag yet. Consume safe amount.
						// Keep enough chars to not split the end tag
						const safeLength = this.buffer.length - endTag.length + 1;
						if (safeLength > 0) {
							const valuePart = this.buffer.slice(0, safeLength);
							this.currentParamValue += valuePart;
							this.buffer = this.buffer.slice(safeLength);

							// Update accumulated params with partial value for streaming UI
							if (this.currentParamName) {
								this.accumulatedParams[this.currentParamName] = this.currentParamValue;
							}
						}
						// Don't loop, wait for more data
					}
					break;
				}
			}
		}

		if (this.currentToolName) {
			return {
				name: this.currentToolName,
				rawParams: { ...this.accumulatedParams },
				doneParams: [], // We don't track done params individually yet
				id: this.toolCallId,
				isDone: false
			};
		}

		return null;
	}
}
