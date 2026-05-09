/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { CodeExecutionService, CodeExecutionOptions } from './codeExecutionService.js';

/**
 * Tool call request from sandbox to browser
 */
interface ToolCallRequest {
	requestId: string;
	toolName: string;
	params: any;
}

/**
 * Tool call response from browser back to sandbox
 */
interface ToolCallResponse {
	requestId: string;
	success: boolean;
	result?: any;
	error?: string;
}

/**
 * IPC Channel for code execution
 * Handles bidirectional communication for tool calls:
 * 1. Browser sends code to execute
 * 2. Sandbox calls tools → emits toolCall event
 * 3. Browser handles tool → sends response
 * 4. Sandbox receives response → continues execution
 */
export class CodeExecutionChannel implements IServerChannel {
	
	private codeExecutionService: CodeExecutionService;
	
	// Event emitter for tool call requests from sandbox
	private readonly _onToolCall = new Emitter<ToolCallRequest>();
	readonly onToolCall = this._onToolCall.event;
	
	// Map to store pending tool call promises
	private pendingToolCalls = new Map<string, {
		resolve: (result: any) => void;
		reject: (error: Error) => void;
		timer?: ReturnType<typeof setTimeout>;
	}>();

	constructor() {
		this.codeExecutionService = new CodeExecutionService();
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'executeCode': {
				const { code, options } = arg as { 
					code: string; 
					options?: Omit<CodeExecutionOptions, 'toolCallback'>; 
				};
				
				// Create callback that emits IPC events for tool calls
				const toolCallback = async (toolName: string, params: any): Promise<any> => {
					const requestId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
					
					// Create promise that will be resolved when browser sends response
					let timer: ReturnType<typeof setTimeout> | undefined;
					const resultPromise = new Promise<any>((resolve, reject) => {
						// Timeout after 60 seconds
						timer = setTimeout(() => {
							if (this.pendingToolCalls.has(requestId)) {
								this.pendingToolCalls.delete(requestId);
								reject(new Error(`Tool call timeout: ${toolName}`));
							}
						}, 60000);
						this.pendingToolCalls.set(requestId, { resolve, reject, timer });
					});
					
					// Emit event to browser
					this._onToolCall.fire({ requestId, toolName, params });
					
					// Wait for browser to respond
					return await resultPromise;
				};
				
				return await this.codeExecutionService.executeCode(code, { ...options, toolCallback });
			}
			
			case 'respondToToolCall': {
				const { requestId, success, result, error } = arg as ToolCallResponse;
				
				const pending = this.pendingToolCalls.get(requestId);
				if (!pending) {
					throw new Error(`No pending tool call found for requestId: ${requestId}`);
				}
				
				// Clear the timeout timer before resolving/rejecting
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
				
				this.pendingToolCalls.delete(requestId);
				
				if (success) {
					pending.resolve(result);
				} else {
					pending.reject(new Error(error || 'Tool call failed'));
				}
				
				return { success: true };
			}
			
			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onToolCall':
				return this.onToolCall;
			default:
				throw new Error(`Event not supported: ${event}`);
		}
	}
	
	dispose(): void {
		this._onToolCall.dispose();
		// Reject all pending tool calls
		for (const { reject } of this.pendingToolCalls.values()) {
			reject(new Error('Channel disposed'));
		}
		this.pendingToolCalls.clear();
	}
}
