/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { shouldInterruptAfterDeadline, QuickJSAsyncContext, QuickJSAsyncRuntime, newAsyncRuntime, QuickJSHandle } from 'quickjs-emscripten';

/**
 * Code Execution Service
 *
 * Implements Anthropic's "Code Execution with MCP" pattern for 98% token reduction.
 * Instead of passing large data through the model context, code runs in a sandbox
 * and only returns small summaries/results.
 *
 * Key benefits:
 * - Large data stays in execution environment (never enters model context)
 * - Tools can be composed in code (no round-trips through model)
 * - Local processing (filter, transform, aggregate without token cost)
 * - Progressive tool discovery (load only needed tools)
 */

export interface CodeExecutionOptions {
	/** Maximum memory in MB (default: 128) */
	memoryLimit?: number;
	/** Execution timeout in ms (default: 30000) */
	timeout?: number;
	/** Language to execute (default: 'typescript') */
	language?: 'typescript' | 'javascript';
	/** Callback function for tool calls (called via IPC) */
	toolCallback?: (toolName: string, params: any) => Promise<any>;
}

export interface CodeExecutionResult {
	/** Success or error */
	success: boolean;
	/** Return value from code (if success) */
	result?: any;
	/** Error message (if failure) */
	error?: string;
	/** Console output captured during execution */
	logs?: string[];
}

export class CodeExecutionService {

	constructor() {
		// Tool calling is handled via IPC callbacks passed to executeCode
	}

	/**
	 * Execute TypeScript/JavaScript code in an isolated sandbox.
	 *
	 * Example:
	 * ```typescript
	 * const data = [1, 2, 3, 4, 5];
	 * const sum = data.reduce((a, b) => a + b, 0);
	 * return { sum, average: sum / data.length };
	 * ```
	 */
	async executeCode(
		code: string,
		options: CodeExecutionOptions = {}
	): Promise<CodeExecutionResult> {
		const {
			memoryLimit = 128,
			timeout = 30000,
			toolCallback
		} = options;

		const logs: string[] = [];

		let runtime: QuickJSAsyncRuntime | undefined;
		let context: QuickJSAsyncContext | undefined;

		try {
			runtime = await newAsyncRuntime();

			// Set memory limit (QuickJS takes bytes)
			runtime.setMemoryLimit(memoryLimit * 1024 * 1024);

			// Set interrupt handler for timeout
			runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeout));

			context = runtime.newContext();

			// Create console.log for capturing output
			const logHandle = context.newFunction('log', (...args) => {
				const message = args.map(arg => {
					if (context) {
						const dumped = context.dump(arg);
						return typeof dumped === 'object' ? JSON.stringify(dumped) : String(dumped);
					}
					return '';
				}).join(' ');
				logs.push(message);
			});
			context.setProp(context.global, 'log', logHandle);
			logHandle.dispose();

			// Create console object
			const consoleResult = await context.evalCodeAsync(`
				globalThis.console = {
					log: (...args) => log(...args),
					error: (...args) => log('ERROR:', ...args),
					warn: (...args) => log('WARN:', ...args),
					info: (...args) => log('INFO:', ...args)
				};
			`);
			if (consoleResult.error) {
				consoleResult.error.dispose();
			} else if (consoleResult.value) {
				consoleResult.value.dispose();
			}

			// Create tools object if callback provided
			if (toolCallback) {
				await this.injectTools(context, toolCallback);
			}

			// Wrap code in async function and execute
			// Note: We use a return statement to capture the final value
			const wrappedCode = `(async () => {
				${code}
			})()`;

			const result = await context.evalCodeAsync(wrappedCode);

			if (result.error) {
				const error = context.dump(result.error);
				result.error.dispose();
				return {
					success: false,
					error: typeof error === 'object' ? JSON.stringify(error) : String(error),
					logs
				};
			}

			const value = context.dump(result.value);
			result.value.dispose();

			return {
				success: true,
				result: value,
				logs
			};

		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				logs
			};
		} finally {
			if (context) context.dispose();
			if (runtime) runtime.dispose();
		}
	}

	/**
	 * Inject tools into the QuickJS context
	 */
	private async injectTools(
		context: QuickJSAsyncContext,
		toolCallback: (toolName: string, params: any) => Promise<any>
	): Promise<void> {
		const toolsHandle = context.newObject();

		const toolNames = [
			'read_file', 'outline_file', 'ls_dir', 'get_dir_tree',
			'search_pathnames_only', 'search_for_files', 'search_in_file',
			'read_lint_errors', 'create_file_or_folder', 'delete_file_or_folder',
			'edit_file', 'rewrite_file', 'run_command', 'run_persistent_command',
			'open_persistent_terminal', 'kill_persistent_terminal'
		];

		for (const toolName of toolNames) {
			const toolFn = context.newAsyncifiedFunction(toolName, async (...args: QuickJSHandle[]) => {
				try {
					const dumpedArgs = args.map(arg => context.dump(arg));
					const result = await toolCallback(toolName, dumpedArgs);
					// Return result as a JSON string to avoid complex object transfer issues
					return context.newString(JSON.stringify(result));
				} catch (error) {
					const errorMsg = `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
					throw new Error(errorMsg);
				}
			});
			context.setProp(toolsHandle, toolName, toolFn);
			toolFn.dispose();
		}

		context.setProp(context.global, 'tools', toolsHandle);
		toolsHandle.dispose();
	}
}
