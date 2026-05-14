/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ITerminalCapabilityImplMap, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { URI } from '../../../../base/common/uri.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITerminalService, ITerminalInstance, ICreateTerminalOptions } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { MAX_TERMINAL_BG_COMMAND_TIME, MAX_TERMINAL_CHARS, MAX_TERMINAL_INACTIVE_TIME } from '../common/prompt/prompts.js';
import { TerminalResolveReason } from '../common/toolsServiceTypes.js';
import { timeout } from '../../../../base/common/async.js';

// Fast ANSI escape sequence regex for stripping inline (used in hot paths)
const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*[a-zA-Z]/g;
const fastStripAnsi = (str: string): string => str.replace(ANSI_ESCAPE_RE, '');

// Throttle helper for onData callbacks
function throttle<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
	let last = 0;
	return ((...args: any[]) => {
		const now = Date.now();
		if (now - last >= waitMs) {
			last = now;
			fn(...args);
		}
	}) as T;
}

// Command correlation interface for tracking pending commands
interface PendingCommand {
	command: string;
	resolve: (result: { exitCode: number, output: string }) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	created: number;
	terminal?: ITerminalInstance;
}

export interface ITerminalToolService {
	readonly _serviceBrand: undefined;

	listPersistentTerminalIds(): string[];
	runCommand(command: string, opts:
		| { type: 'persistent', persistentTerminalId: string, onData?: (data: string) => void, timeoutMs?: number }
		| { type: 'temporary', cwd: string | null, terminalId: string, onData?: (data: string) => void, timeoutMs?: number }
	): Promise<{ interrupt: () => void; resPromise: Promise<{ result: string, resolveReason: TerminalResolveReason }> }>;

	focusPersistentTerminal(terminalId: string): Promise<void>
	persistentTerminalExists(terminalId: string): boolean

	readTerminal(terminalId: string): Promise<string>

	createPersistentTerminal(opts: { cwd: string | null }): Promise<string>
	killPersistentTerminal(terminalId: string): Promise<void>

	wait(params: { timeoutMs: number, persistentTerminalId: string, onData?: (data: string) => void }): Promise<{ result: string, resolveReason: TerminalResolveReason }>;

	getPersistentTerminal(terminalId: string): ITerminalInstance | undefined
	getTemporaryTerminal(terminalId: string): ITerminalInstance | undefined
}
export const ITerminalToolService = createDecorator<ITerminalToolService>('TerminalToolService');

export const persistentTerminalNameOfId = (id: string) => {
	if (id === '1') return 'A-Coder Agent'
	return `A-Coder Agent (${id})`
}
export const idOfPersistentTerminalName = (name: string) => {
	if (name === 'A-Coder Agent') return '1'

	const match = name.match(/A-Coder Agent \((\d+)\)/)
	if (!match) return null
	if (Number.isInteger(match[1]) && Number(match[1]) >= 1) return match[1]
	return null
}

export class TerminalToolService extends Disposable implements ITerminalToolService {
	readonly _serviceBrand: undefined;

	private persistentTerminalInstanceOfId: Record<string, ITerminalInstance> = {}
	private temporaryTerminalInstanceOfId: Record<string, ITerminalInstance> = {}

	// Track pending commands for correlation with completion events
	private readonly pendingCommands = new Map<string, PendingCommand>();
	private nextCommandId = 0;

	// Track the last known command line for each terminal for better correlation
	private readonly lastKnownCommand = new WeakMap<ITerminalInstance, string>();

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// runs on ALL terminals for simplicity
		const initializeTerminal = (terminal: ITerminalInstance) => {
			// when exit, remove
			const d = terminal.onExit(() => {
				const terminalId = idOfPersistentTerminalName(terminal.title)
				if (terminalId !== null && (terminalId in this.persistentTerminalInstanceOfId)) delete this.persistentTerminalInstanceOfId[terminalId]

				// Clean up any pending commands for this terminal
				this._cleanupPendingCommandsForTerminal(terminal);
				d.dispose()
			})
		}


		// initialize any terminals that are already open
		for (const terminal of terminalService.instances) {
			const proposedTerminalId = idOfPersistentTerminalName(terminal.title)
			if (proposedTerminalId) this.persistentTerminalInstanceOfId[proposedTerminalId] = terminal

			initializeTerminal(terminal)
		}

		this._register(
			terminalService.onDidCreateInstance(terminal => { initializeTerminal(terminal) })
		)

	}

	private _cleanupPendingCommandsForTerminal(terminal: ITerminalInstance) {
		// Reject all pending commands for this terminal efficiently
		for (const [id, pending] of this.pendingCommands.entries()) {
			if (pending.terminal === terminal) {
				pending.reject(new Error('Terminal was closed'));
				clearTimeout(pending.timeoutId);
				this.pendingCommands.delete(id);
			}
		}
	}

	listPersistentTerminalIds() {
		return Object.keys(this.persistentTerminalInstanceOfId)
	}

	getValidNewTerminalId(): string {
		// {1 2 3} # size 3, new=4
		// {1 3 4} # size 3, new=2
		// 1 <= newTerminalId <= n + 1
		const n = Object.keys(this.persistentTerminalInstanceOfId).length;
		if (n === 0) return '1'

		for (let i = 1; i <= n + 1; i++) {
			const potentialId = i + '';
			if (!(potentialId in this.persistentTerminalInstanceOfId)) return potentialId;
		}
		throw new Error('This should never be reached by pigeonhole principle');
	}

	private async _createTerminal(props: { cwd: string | null, config: ICreateTerminalOptions['config'], hidden?: boolean }) {
		const { cwd: override_cwd, config, hidden } = props;

		const cwd: URI | string | undefined = (override_cwd ?? undefined) ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;

		const options: ICreateTerminalOptions = {
			cwd,
			location: hidden ? undefined : TerminalLocation.Panel,
			config: {
				name: config && 'name' in config ? config.name : undefined,
				forceShellIntegration: true,
				hideFromUser: hidden ? true : undefined,
				// Copy any other properties from the provided config
				...config,
			},
			// Skip profile check to ensure the terminal is created quickly
			skipContributedProfileCheck: true,
		};

		const terminal = await this.terminalService.createTerminal(options)

		return terminal

	}

	createPersistentTerminal: ITerminalToolService['createPersistentTerminal'] = async ({ cwd }) => {
		const terminalId = this.getValidNewTerminalId();
		const config = { name: persistentTerminalNameOfId(terminalId), title: persistentTerminalNameOfId(terminalId) }
		const terminal = await this._createTerminal({ cwd, config, })
		this.persistentTerminalInstanceOfId[terminalId] = terminal

		// Set up shell integration listeners for this terminal
		this._setupShellIntegrationListeners(terminal);

		return terminalId
	}

	/**
	 * Set up shell integration listeners for proper command correlation.
	 * Uses event-based waiting instead of polling for better performance.
	 */
	private _setupShellIntegrationListeners(terminal: ITerminalInstance) {
		// Use event-based waiting instead of polling
		const shellIntegration = (terminal as any).shellIntegration;
		if (shellIntegration && shellIntegration.onDidExecuteCommand) {
			const listener = shellIntegration.onDidExecuteCommand?.((event: any) => {
				const commandLine = event?.commandLine;
				if (!commandLine) return;

				// Store the last known command for this terminal
				this.lastKnownCommand.set(terminal, commandLine);

				// Find matching pending command
				this._matchPendingCommand(terminal, commandLine, event?.exitCode, event?.output);
			});
			if (listener) this._register(listener);
		} else {
			// Fallback: wait for capability addition event with a timeout
			const disposable = terminal.capabilities.onDidAddCapability((e) => {
				if (e.id !== TerminalCapability.CommandDetection) return;
				// Capability added, try to attach listeners now
				const si = (terminal as any).shellIntegration;
				if (si && si.onDidExecuteCommand) {
					const listener = si.onDidExecuteCommand?.((event: any) => {
						const commandLine = event?.commandLine;
						if (!commandLine) return;
						this.lastKnownCommand.set(terminal, commandLine);
						this._matchPendingCommand(terminal, commandLine, event?.exitCode, event?.output);
					});
					if (listener) this._register(listener);
				}
				disposable.dispose();
			});
			this._register(disposable);
			// Safety timeout to not leak the disposable forever
			setTimeout(() => disposable.dispose(), 15000);
		}
	}

	/**
	 * Match a completed command with its pending request.
	 */
	private _matchPendingCommand(terminal: ITerminalInstance, commandLine: string, exitCode: number | undefined, output: string | undefined) {
		// Try to match by exact command
		for (const [id, pending] of this.pendingCommands.entries()) {
			// Simple matching: compare command strings
			if (this._commandsMatch(pending.command, commandLine)) {
				// Found a match!
				clearTimeout(pending.timeoutId);
				this.pendingCommands.delete(id);

				const cleanOutput = output ? removeAnsiEscapeCodes(output) : '';
				pending.resolve({
					exitCode: exitCode ?? 0,
					output: cleanOutput
				});
				return true;
			}
		}
		return false;
	}

	/**
	 * Compare two command strings to see if they likely represent the same command.
	 * Uses simple string operations instead of regex for better performance.
	 */
	private _commandsMatch(cmd1: string, cmd2: string): boolean {
		const normalize = (cmd: string) => {
			let s = cmd.trim();
			// Fast whitespace collapse
			let res = '';
			for (let i = 0; i < s.length; i++) {
				if (s[i] === ' ' || s[i] === '\t') {
					if (res.length === 0 || res[res.length - 1] !== ' ') res += ' ';
				} else {
					res += s[i];
				}
			}
			// Simple quote removal (handles matched pairs only)
			let out = '';
			for (let i = 0; i < res.length; i++) {
				const c = res[i];
				if (c === '"' || c === "'") {
					// Check if there's a matching quote later
					const close = res.indexOf(c, i + 1);
					if (close !== -1) {
						// Skip past content of quotes
						out += res.slice(i + 1, close);
						i = close;
					} else {
						out += c;
					}
				} else {
					out += c;
				}
			}
			return out;
		};

		return normalize(cmd1) === normalize(cmd2);
	}

	/**
	 * Create a pending command that waits for completion.
	 * Returns a promise that resolves when the command completes.
	 */
	private _createPendingCommand(command: string, timeoutMs: number, terminal?: ITerminalInstance): Promise<{ exitCode: number, output: string }> {
		return new Promise((resolve, reject) => {
			const commandId = `${this.nextCommandId++}`;
			const created = Date.now();

			const timeoutId = setTimeout(() => {
				this.pendingCommands.delete(commandId);
				reject(new Error(`Command timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			this.pendingCommands.set(commandId, {
				command,
				resolve,
				reject,
				timeoutId,
				created,
				terminal,
			});
		});
	}

	/**
	 * Execute a command using shellIntegration.executeCommand for reliable correlation.
	 */
	private async _executeCommandWithShellIntegration(
		terminal: ITerminalInstance,
		command: string,
		timeoutMs: number
	): Promise<{ exitCode: number, output: string }> {
		// Wait for shell integration using event-based approach with a short timeout
		if (!(terminal as any).shellIntegration) {
			await new Promise<void>((resolve) => {
				let resolved = false;
				const listener = terminal.capabilities.onDidAddCapability((e) => {
					if (e.id === TerminalCapability.CommandDetection) {
						resolved = true;
						listener.dispose();
						resolve();
					}
				});
				setTimeout(() => {
					if (!resolved) {
						resolved = true;
						listener.dispose();
						resolve();
					}
				}, 5000);
			});
		}

		// Try to use executeCommand if shell integration is available
		if ((terminal as any).shellIntegration) {
			try {
				// Create a pending command to wait for completion
				const pendingPromise = this._createPendingCommand(command, timeoutMs, terminal);
				this.lastKnownCommand.set(terminal, command);

				// Execute the command
				(terminal as any).shellIntegration.executeCommand?.({ commandLine: command });

				// Wait for completion
				const result = await pendingPromise;
				return result;
			} catch (e) {
				// Fallback to sendText if executeCommand fails
				throw e;
			}
		}

		// Fallback: use the old approach with CommandDetection
		return this._executeCommandWithCommandDetection(terminal, command, timeoutMs);
	}

	/**
	 * Fallback method using CommandDetection for older VSCode versions.
	 */
	private async _executeCommandWithCommandDetection(
		terminal: ITerminalInstance,
		command: string,
		timeoutMs: number
	): Promise<{ exitCode: number, output: string }> {
		return new Promise((resolve, reject) => {
			let resolved = false;
			const disposables: IDisposable[] = [];
			let outputBuffer = '';

			// Stream output
			const dataDisposable = terminal.onData((data) => {
				outputBuffer += data;
			});
			disposables.push(dataDisposable);

			// Wait for command detection capability
			this._waitForCommandDetectionCapability(terminal).then((cmdCap) => {
				if (!cmdCap) {
					// If no command detection, just send text and wait a bit
					terminal.sendText(command, true);
					setTimeout(() => {
						if (!resolved) {
							resolved = true;
							disposables.forEach(d => d.dispose());
							resolve({
								exitCode: 0,
								output: removeAnsiEscapeCodes(outputBuffer)
							});
						}
					}, 5000);
					return;
				}

				// Listen for command completion
				const listener = cmdCap.onCommandFinished((cmd) => {
					if (resolved) return;

					// Use the command output from CommandDetection
					const output = cmd.getOutput() ?? outputBuffer;
					const exitCode = cmd.exitCode ?? 0;

					resolved = true;
					listener.dispose();
					disposables.forEach(d => d.dispose());

					resolve({
						exitCode,
						output: removeAnsiEscapeCodes(output)
					});
				});
				disposables.push(listener);

				// Send the command
				terminal.sendText(command, true);

				// Timeout fallback
				setTimeout(() => {
					if (!resolved) {
						resolved = true;
						disposables.forEach(d => d.dispose());
						resolve({
							exitCode: 0,
							output: removeAnsiEscapeCodes(outputBuffer)
						});
					}
				}, timeoutMs);
			});
		});
	}

	async killPersistentTerminal(terminalId: string) {
		const terminal = this.persistentTerminalInstanceOfId[terminalId]
		if (!terminal) throw new Error(`Kill Terminal: Terminal with ID ${terminalId} did not exist.`);
		// Clean up pending commands for this terminal before killing
		this._cleanupPendingCommandsForTerminal(terminal);
		terminal.dispose()
		delete this.persistentTerminalInstanceOfId[terminalId]
		return
	}

	async wait(params: { timeoutMs: number, persistentTerminalId: string, onData?: (data: string) => void }) {
		const { timeoutMs, persistentTerminalId, onData } = params;
		const terminal = this.persistentTerminalInstanceOfId[persistentTerminalId];
		if (!terminal) throw new Error(`Wait Terminal: Terminal with ID ${persistentTerminalId} does not exist.`);

		const disposables: IDisposable[] = [];
		let result: string = '';
		let resolveReason: TerminalResolveReason | undefined;
		let outputBuffer = '';

		// Throttle onData callbacks to avoid overwhelming the renderer
		const throttledOnData = onData ? throttle(onData, 250) : undefined;
		const waitUntilDone = new Promise<void>(resolve => {
			if (throttledOnData) {
				const d = terminal.onData(data => {
					outputBuffer += data;
					throttledOnData(fastStripAnsi(data));
				});
				disposables.push(d);
			}

			// Try shell integration first
			if ((terminal as any).shellIntegration) {
				// Listen for command completion
				const listener = (terminal as any).shellIntegration.onDidExecuteCommand?.((event: any) => {
					if (resolveReason) return;
					resolveReason = { type: 'done', exitCode: event?.exitCode ?? 0 };
					result = event?.output || outputBuffer;
					if (listener) listener.dispose();
					resolve();
				});
				if (listener) disposables.push(listener);
			} else {
				// Fallback to CommandDetection
				this._waitForCommandDetectionCapability(terminal).then(cmdCap => {
					if (!cmdCap) return;
					const l = cmdCap.onCommandFinished(cmd => {
						if (resolveReason) return;
						resolveReason = { type: 'done', exitCode: cmd.exitCode ?? 0 };
						result = cmd.getOutput() ?? '';
						l.dispose();
						resolve();
					});
					disposables.push(l);
				});
			}
		});

		const waitUntilTimeout = new Promise<void>(res => {
			setTimeout(() => {
				if (resolveReason) return;
				resolveReason = { type: 'timeout' };
				res();
			}, timeoutMs);
		});

		await Promise.any([waitUntilDone, waitUntilTimeout])
			.finally(() => disposables.forEach(d => d.dispose()));

		if (resolveReason?.type === 'timeout') {
			result = await this.readTerminal(persistentTerminalId);
		}

		result = removeAnsiEscapeCodes(result);
		if (result.length > MAX_TERMINAL_CHARS) {
			const half = MAX_TERMINAL_CHARS / 2;
			result = result.slice(0, half) + '\n...\n' + result.slice(result.length - half, Infinity);
		}

		return { result, resolveReason: resolveReason! };
	}

	persistentTerminalExists(terminalId: string): boolean {
		return terminalId in this.persistentTerminalInstanceOfId
	}

	getTemporaryTerminal(terminalId: string): ITerminalInstance | undefined {
		if (!terminalId) return
		const terminal = this.temporaryTerminalInstanceOfId[terminalId]
		if (!terminal) return // should never happen
		return terminal
	}

	getPersistentTerminal(terminalId: string): ITerminalInstance | undefined {
		if (!terminalId) return
		const terminal = this.persistentTerminalInstanceOfId[terminalId]
		if (!terminal) return // should never happen
		return terminal
	}

	focusPersistentTerminal: ITerminalToolService['focusPersistentTerminal'] = async (terminalId) => {
		if (!terminalId) return
		const terminal = this.persistentTerminalInstanceOfId[terminalId]
		if (!terminal) return // should never happen
		this.terminalService.setActiveInstance(terminal)
		await this.terminalService.focusActiveInstance()
	}

	readTerminal: ITerminalToolService['readTerminal'] = async (terminalId) => {
		// Try persistent first, then temporary
		const terminal = this.getPersistentTerminal(terminalId) ?? this.getTemporaryTerminal(terminalId);
		if (!terminal) {
			throw new Error(`Read Terminal: Terminal with ID ${terminalId} does not exist.`);
		}

		// Ensure the xterm.js instance has been created – otherwise we cannot access the buffer.
		if (!terminal.xterm) {
			throw new Error('Read Terminal: The requested terminal has not yet been rendered and therefore has no scrollback buffer available.');
		}

		// Collect lines from the buffer iterator (oldest to newest) directly into a string
		let result = '';
		for (const line of terminal.xterm.getBufferReverseIterator()) {
			result = line + '\n' + result;
		}
		// Trim trailing newline
		if (result.endsWith('\n')) {
			result = result.slice(0, -1);
		}

		result = removeAnsiEscapeCodes(result);

		if (result.length > MAX_TERMINAL_CHARS) {
			const half = MAX_TERMINAL_CHARS / 2;
			result = result.slice(0, half) + '\n...\n' + result.slice(result.length - half);
		}

		return result
	};

	private async _waitForCommandDetectionCapability(terminal: ITerminalInstance) {
		const cmdCap = terminal.capabilities.get(TerminalCapability.CommandDetection);
		if (cmdCap) return cmdCap

		const disposables: IDisposable[] = []

		const waitTimeout = timeout(5000) // Reduced from 10s to 5s
		const waitForCapability = new Promise<ITerminalCapabilityImplMap[TerminalCapability.CommandDetection]>((res) => {
			disposables.push(
				terminal.capabilities.onDidAddCapability((e) => {
					if (e.id === TerminalCapability.CommandDetection) res(e.capability)
				})
			)
		})

		const capability = await Promise.any([waitTimeout, waitForCapability])
			.finally(() => { disposables.forEach((d) => d.dispose()) })

		return capability ?? undefined
	}

	runCommand: ITerminalToolService['runCommand'] = async (command, params): Promise<{ interrupt: () => void; resPromise: Promise<{ result: string, resolveReason: TerminalResolveReason }> }> => {
		const { type } = params
		const isPersistent = type === 'persistent'

		// Handle temporary terminals using VSCode Terminal API
		if (!isPersistent) {
			await this.terminalService.whenConnected;

			// Create a temporary terminal using the helper method
			const terminalId = params.terminalId;
			const terminal = await this._createTerminal({
				cwd: params.cwd,
				config: { name: `Temp-${terminalId}`, forceShellIntegration: true }
			});
			this.temporaryTerminalInstanceOfId[terminalId] = terminal;

			// Focus the terminal
			this.terminalService.setActiveInstance(terminal);

			// Create AbortController for interrupt functionality
			const abortController = new AbortController();
			let wasInterrupted = false;

			// Throttle onData callbacks to avoid overwhelming the renderer
			const throttledOnData = params.onData ? throttle(params.onData, 250) : undefined;
			let dataDisposable: IDisposable | undefined;
			if (throttledOnData) {
				dataDisposable = terminal.onData((data) => {
					throttledOnData(fastStripAnsi(data));
				});
			}

			const interrupt = () => {
				if (wasInterrupted) return;
				wasInterrupted = true;

				// Send SIGINT (Ctrl+C) to interrupt the running command
				terminal.sendText('\x03', false);

				// Abort any pending command
				for (const [id, pending] of this.pendingCommands.entries()) {
					if (pending.terminal === terminal) {
						pending.reject(new Error('Command was interrupted'));
						clearTimeout(pending.timeoutId);
						this.pendingCommands.delete(id);
					}
				}
			};

			// Execute the command
			const waitForResult = async (): Promise<{ result: string, resolveReason: TerminalResolveReason }> => {
				try {
					const timeoutMs = params.timeoutMs ?? MAX_TERMINAL_INACTIVE_TIME * 1000;

					const result = await Promise.race([
						this._executeCommandWithShellIntegration(terminal, command, timeoutMs),
						new Promise<{ exitCode: number, output: string }>((_, reject) => {
							abortController.signal.addEventListener('abort', () => {
								reject(new Error('Interrupted'));
							});
						})
					]);

					// Clean up the temporary terminal after command completes
					if (this.temporaryTerminalInstanceOfId[terminalId]) {
						delete this.temporaryTerminalInstanceOfId[terminalId];
						terminal.dispose();
					}
					dataDisposable?.dispose();

					// Format the result
					let output = result.output;
					if (output.length > MAX_TERMINAL_CHARS) {
						const half = MAX_TERMINAL_CHARS / 2;
						output = output.slice(0, half) + '\n...\n' + output.slice(output.length - half, Infinity);
					}

					return {
						result: output,
						resolveReason: { type: 'done', exitCode: result.exitCode }
					};
				} catch (error) {
					// Clean up the temporary terminal on error
					if (this.temporaryTerminalInstanceOfId[terminalId]) {
						delete this.temporaryTerminalInstanceOfId[terminalId];
						terminal.dispose();
					}
					dataDisposable?.dispose();

					if (wasInterrupted) {
						return {
							result: 'Command was interrupted',
							resolveReason: { type: 'timeout' }
						};
					}

					// Handle timeout
					return {
						result: 'Command timed out',
						resolveReason: { type: 'timeout' }
					};
				}
			};

			return {
				interrupt,
				resPromise: waitForResult()
			};
		}

		// Persistent terminals
		await this.terminalService.whenConnected;

		const { persistentTerminalId } = params
		const terminal = this.persistentTerminalInstanceOfId[persistentTerminalId];
		if (!terminal) throw new Error(`Unexpected internal error: Terminal with ID ${persistentTerminalId} did not exist.`);

		// Focus the terminal about to run
		this.terminalService.setActiveInstance(terminal);
		await this.terminalService.focusActiveInstance();

		// Create AbortController for interrupt functionality
		const abortController = new AbortController();
		let wasInterrupted = false;

		const interrupt = () => {
			if (wasInterrupted) return;
			wasInterrupted = true;

			// Send SIGINT (Ctrl+C) to interrupt the running command
			terminal.sendText('\x03', false);

			// Abort any pending command
			for (const [id, pending] of this.pendingCommands.entries()) {
				if (pending.terminal === terminal) {
					pending.reject(new Error('Command was interrupted'));
					clearTimeout(pending.timeoutId);
					this.pendingCommands.delete(id);
				}
			}
		};

		// Execute the command with proper correlation
		const waitForResult = async (): Promise<{ result: string, resolveReason: TerminalResolveReason }> => {
			try {
				// Use the timeout based on the type
				const timeoutMs = params.timeoutMs ?? MAX_TERMINAL_BG_COMMAND_TIME * 1000;

				const result = await Promise.race([
					this._executeCommandWithShellIntegration(terminal, command, timeoutMs),
					new Promise<{ exitCode: number, output: string }>((_, reject) => {
						abortController.signal.addEventListener('abort', () => {
							reject(new Error('Interrupted'));
						});
					})
				]);

				// Format the result
				let output = result.output;
				if (output.length > MAX_TERMINAL_CHARS) {
					const half = MAX_TERMINAL_CHARS / 2;
					output = output.slice(0, half) + '\n...\n' + output.slice(output.length - half, Infinity);
				}

				return {
					result: output,
					resolveReason: { type: 'done', exitCode: result.exitCode }
				};
			} catch (error) {
				if (wasInterrupted) {
					// Read the current terminal output
					const terminalId = persistentTerminalId;
					const result = await this.readTerminal(terminalId);
					return {
						result,
						resolveReason: { type: 'timeout' }
					};
				}

				// Handle timeout
				const terminalId = persistentTerminalId;
				const result = await this.readTerminal(terminalId);
				return {
					result,
					resolveReason: { type: 'timeout' }
				};
			}
		};

		return {
			interrupt,
			resPromise: waitForResult()
		};
	}

}

registerSingleton(ITerminalToolService, TerminalToolService, InstantiationType.Delayed);