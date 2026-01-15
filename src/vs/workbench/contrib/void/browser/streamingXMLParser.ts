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
	toolCalls?: RawToolCallObj[] | null;
	isComplete?: boolean;
}

export class StreamingXMLParser {
	private buffer: string = '';
	private state: 'IDLE' | 'SEARCHING_INVOKE' | 'SEARCHING_PARAM' | 'READING_PARAM_VALUE' | 'READING_MARKER_JSON' = 'IDLE';
	private currentToolName: string | null = null;
	private currentParamName: string | null = null;
	private currentParamValue: string = '';
	private accumulatedParams: RawToolParamsObj = {};
	private toolCalls: RawToolCallObj[] = [];
	private toolCallId: string = 'streaming-tool-call';

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
		if (!chunk && this.buffer.length > 0 && !this.hasDetectedAction) return null; // No new data and not in action phase
		
		this.buffer += chunk;

		// Check for Action phase (start of function_calls or tool_call_start)
		if (!this.hasDetectedAction) {
			// Look for the tag in the new part of the buffer (plus a small overlap to handle split tags)
			const lookback = 20; // Enough for <function_calls> or <|tool_call_start|>
			const searchStart = Math.max(0, this.buffer.length - chunk.length - lookback);
			const actionStartMatch = this.buffer.substring(searchStart).match(/<function_calls>|<\|tool_call_start\|>/);
			
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
					id: `${this.toolCallId}-0`,
					isDone: false
				};

				const result: StreamingReActResult = {
					phase: this.currentPhase,
					toolCalls: [preliminaryToolCall],
					isComplete: false
				};

				// Continue parsing to see if there's already more data in the buffer
				const toolCalls = this.parse('', true);
				if (toolCalls && toolCalls.length > 0) {
					result.toolCalls = toolCalls;
					result.isComplete = toolCalls.every(tc => tc.isDone);
				}

				return result;
			}
		}

		// Check for Thought: phase only if we haven't reached Action yet
		if (!this.hasDetectedAction) {
			// Optimization: only check if the new chunk contains "Thought:" or if we're near the start of the buffer
			const lookback = 15; // Enough for "Thought:"
			const searchStart = Math.max(0, this.buffer.length - chunk.length - lookback);
			const newContent = this.buffer.substring(searchStart);
			
			if (newContent.includes('Thought:') || (this.buffer.length < 500 && this.buffer.includes('Thought:'))) {
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

					return { phase: this.currentPhase, toolCalls: null, isComplete: false };
				}
			}
		}

		// Continue parsing tool calls if we're in action phase
		if (this.hasDetectedAction) {
			const toolCalls = this.parse('', true);
			if (toolCalls) {
				return {
					phase: this.currentPhase,
					toolCalls,
					isComplete: toolCalls.every(tc => tc.isDone)
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
		this.toolCalls = [];
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

	/**
	 * Returns true if the parser is in the middle of an XML or marker block
	 */
	public isParsingIncomplete(): boolean {
		return this.state !== 'IDLE';
	}

	public parse(chunk: string, skipBufferAppend: boolean = false): RawToolCallObj[] | null {
		if (!skipBufferAppend) {
			this.buffer += chunk;
		}

		let loop = true;
		while (loop) {
			loop = false; // Default to stop unless we make a state transition that requires re-checking

			switch (this.state) {
				case 'IDLE': {
					// Look for <function_calls> or <|tool_call_start|>
					const startTag = '<function_calls>';
					const markerTag = '<|tool_call_start|>';
					
					const idx = this.buffer.indexOf(startTag);
					const markerIdx = this.buffer.indexOf(markerTag);

					// Prioritize whichever comes first
					if (idx !== -1 && (markerIdx === -1 || idx < markerIdx)) {
						this.buffer = this.buffer.slice(idx + startTag.length);
						this.state = 'SEARCHING_INVOKE';
						loop = true;
					} else if (markerIdx !== -1) {
						this.buffer = this.buffer.slice(markerIdx + markerTag.length);
						this.state = 'READING_MARKER_JSON';
						this.accumulatedParams = {};
						this.currentParamValue = ''; // Re-use for JSON string
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
						// End of invoke - save the tool call
						if (this.currentToolName) {
							this.toolCalls.push({
								name: this.currentToolName as any,
								rawParams: { ...this.accumulatedParams },
								doneParams: Object.keys(this.accumulatedParams) as any[],
								id: `${this.toolCallId}-${this.toolCalls.length}`,
								isDone: true
							});
						}
						
						this.buffer = this.buffer.slice(endInvokeMatch.index! + endInvokeMatch[0].length);
						this.state = 'SEARCHING_INVOKE'; // Ready for next invoke
						this.currentToolName = null;
						this.accumulatedParams = {};
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

				case 'READING_MARKER_JSON': {
					const endTag = '<|tool_call_end|>';
					const endIdx = this.buffer.indexOf(endTag);

					if (endIdx !== -1) {
						// Found end tag
						const jsonStr = this.currentParamValue + this.buffer.slice(0, endIdx);
						this.buffer = this.buffer.slice(endIdx + endTag.length);
						
						try {
							// Try to parse the JSON
							const callObj = JSON.parse(jsonStr);
							if (callObj.name && callObj.arguments) {
								this.currentToolName = callObj.name;
								this.accumulatedParams = callObj.arguments;
								
								this.toolCalls.push({
									name: this.currentToolName as any,
									rawParams: { ...this.accumulatedParams },
									doneParams: Object.keys(this.accumulatedParams) as any[],
									id: `${this.toolCallId}-${this.toolCalls.length}`,
									isDone: true
								});
							}
						} catch (e) {
							console.log('Failed to parse marker tool call JSON:', e);
						}
						
						this.state = 'IDLE'; // Ready for next block (or more text)
						this.currentToolName = null;
						this.accumulatedParams = {};
						this.currentParamValue = '';
						loop = true;
					} else {
						// No end tag yet. Consume safe amount.
						const safeLength = this.buffer.length - endTag.length + 1;
						if (safeLength > 0) {
							const valuePart = this.buffer.slice(0, safeLength);
							this.currentParamValue += valuePart;
							this.buffer = this.buffer.slice(safeLength);

							// Try to parse partial JSON to update UI
							try {
								// This is tricky with raw JSON string, but we can try basic heuristics
								// or just expose the raw string if we wanted to (but rawParams expects object)
								// For now, we wait for full JSON to populate params fully
								// But we can try to extract "name" if it appears early
								if (!this.currentToolName) {
									const nameMatch = this.currentParamValue.match(/"name":\s*"([^"]+)"/);
									if (nameMatch) {
										this.currentToolName = nameMatch[1];
									}
								}
							} catch (e) {}
						}
						// Don't loop
					}
					break;
				}
			}
		}

		// Return all completed tool calls PLUS the one currently being parsed
		const allCalls = [...this.toolCalls];
		if (this.currentToolName) {
			allCalls.push({
				name: this.currentToolName as any,
				rawParams: { ...this.accumulatedParams },
				doneParams: [],
				id: `${this.toolCallId}-${this.toolCalls.length}`,
				isDone: false
			});
		}

		return allCalls.length > 0 ? allCalls : null;
	}
}
