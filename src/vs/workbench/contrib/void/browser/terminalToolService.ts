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
import { MAX_TERMINAL_CHARS, MAX_TERMINAL_INACTIVE_TIME, MAX_TERMINAL_BG_COMMAND_TIME } from '../common/prompt/prompts.js';
import { TerminalResolveReason } from '../common/toolsServiceTypes.js';
import { timeout } from '../../../../base/common/async.js';


// Throttle helper for onData callbacks. Leading-edge with a trailing flush so
// the final chunk before a pause is still delivered to the live UI.
function throttle<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
	let last = 0;
	let trailingTimer: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: any[] | undefined;
	return ((...args: any[]) => {
		const now = Date.now();
		lastArgs = args;
		if (now - last >= waitMs) {
			last = now;
			if (trailingTimer) { clearTimeout(trailingTimer); trailingTimer = undefined; }
			fn(...args);
		} else if (!trailingTimer) {
			const delay = waitMs - (now - last);
			trailingTimer = setTimeout(() => {
				last = Date.now();
				trailingTimer = undefined;
				if (lastArgs) fn(...lastArgs);
			}, delay);
		}
	}) as T;
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
	// match[1] is a string; coerce to a number before the integer check.
	const n = Number(match[1])
	if (Number.isInteger(n) && n >= 1) return match[1]
	return null
}

export class TerminalToolService extends Disposable implements ITerminalToolService {
	readonly _serviceBrand: undefined;

	private persistentTerminalInstanceOfId: Record<string, ITerminalInstance> = {}
	private temporaryTerminalInstanceOfId: Record<string, ITerminalInstance> = {}

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

		return terminalId
	}

	async killPersistentTerminal(terminalId: string) {
		const terminal = this.persistentTerminalInstanceOfId[terminalId]
		if (!terminal) throw new Error(`Kill Terminal: Terminal with ID ${terminalId} did not exist.`)
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
		if (throttledOnData) {
			const d = terminal.onData(data => {
				outputBuffer += data;
				throttledOnData(removeAnsiEscapeCodes(data));
			});
			disposables.push(d);
		}

		// Wait for command detection via the (typed) capability store, then listen
		// for the next command completion in this terminal. The browser-side
		// IShellIntegration does not expose onDidExecuteCommand, so we go through
		// CommandDetection directly.
		const cmdCap = await this._waitForCommandDetectionCapability(terminal);

		const waitUntilDone = new Promise<void>(resolve => {
			if (!cmdCap) return; // no shell integration -> rely on timeout
			const l = cmdCap.onCommandFinished(cmd => {
				if (resolveReason) return;
				resolveReason = { type: 'done', exitCode: cmd.exitCode ?? 0 };
				result = cmd.getOutput() ?? outputBuffer;
				l.dispose();
				resolve();
			});
			disposables.push(l);
		});

		const waitUntilTimeout = new Promise<void>(res => {
			const id = setTimeout(() => {
				if (resolveReason) return;
				resolveReason = { type: 'timeout' };
				res();
			}, timeoutMs);
			disposables.push({ dispose: () => clearTimeout(id) });
		});

		await Promise.any([waitUntilDone, waitUntilTimeout])
			.finally(() => disposables.forEach(d => d.dispose()));

		if (resolveReason?.type === 'timeout') {
			// readTerminal can throw if the xterm instance hasn't been rendered yet;
			// fall back to whatever we streamed so we still return something useful.
			try {
				result = await this.readTerminal(persistentTerminalId);
			} catch {
				result = outputBuffer;
			}
		}

		result = removeAnsiEscapeCodes(result);
		if (result.length > MAX_TERMINAL_CHARS) {
			const half = MAX_TERMINAL_CHARS / 2;
			result = result.slice(0, half) + '\n...\n' + result.slice(result.length - half);
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

		// Collect lines from the buffer iterator (oldest to newest) directly into a string.
		// Stop early once we exceed the cap so we don't concatenate an arbitrarily large
		// scrollback only to throw most of it away.
		let result = '';
		const half = MAX_TERMINAL_CHARS / 2;
		for (const line of terminal.xterm.getBufferReverseIterator()) {
			result = line + '\n' + result;
			if (result.length > MAX_TERMINAL_CHARS) break;
		}
		// Trim trailing newline
		if (result.endsWith('\n')) {
			result = result.slice(0, -1);
		}

		result = removeAnsiEscapeCodes(result);

		if (result.length > MAX_TERMINAL_CHARS) {
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

	/**
	 * Execute a command in a terminal and wait for it to finish (or time out / be
	 * interrupted). Uses `sendText` to type the command and the CommandDetection
	 * capability's `onCommandFinished` event to correlate completion — this is the
	 * browser-side mechanism that actually works. The previous implementation
	 * called `shellIntegration.executeCommand` / `onDidExecuteCommand`, which only
	 * exist on the extension-host proposed API and are `undefined` here, so
	 * commands were never sent and always timed out.
	 *
	 * If an `abortSignal` is provided it is used to clean up listeners and the
	 * timeout timer when the caller interrupts the command (Ctrl+C).
	 */
	private async _executeCommand(
		terminal: ITerminalInstance,
		command: string,
		timeoutMs: number,
		abortSignal?: AbortSignal
	): Promise<{ exitCode: number, output: string }> {
		let outputBuffer = '';
		// Stream raw terminal data as a fallback for shells that don't populate
		// `cmd.getOutput()` (e.g. when shell integration reports no output).
		const dataDisposable = terminal.onData(data => { outputBuffer += data; });

		// Wait for the CommandDetection capability (up to 5s) before sending, so
		// that completion correlation is reliable when shell integration is active.
		const cmdCap = await this._waitForCommandDetectionCapability(terminal);

		// If already aborted while waiting for the capability, bail out cleanly.
		if (abortSignal?.aborted) {
			dataDisposable.dispose();
			return { exitCode: 0, output: removeAnsiEscapeCodes(outputBuffer) };
		}

		return new Promise((resolve) => {
			let resolved = false;
			let listener: IDisposable | undefined;
			let timeoutId: ReturnType<typeof setTimeout> | undefined;

			const onAbort = () => finish(0, outputBuffer);

			const cleanup = () => {
				if (timeoutId) { clearTimeout(timeoutId); timeoutId = undefined; }
				listener?.dispose();
				listener = undefined;
				dataDisposable.dispose();
				abortSignal?.removeEventListener('abort', onAbort);
			};

			const finish = (exitCode: number, output: string) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				resolve({ exitCode, output: removeAnsiEscapeCodes(output) });
			};

			// Send the command BEFORE attaching onCommandFinished, so we never resolve
			// on a command that finished before this call started (a real risk on
			// persistent terminals where the user may be typing). sendText queues the
			// write synchronously; onCommandFinished fires asynchronously on a later
			// tick once the shell reports completion, so attaching right after still
			// catches the command we just sent.
			terminal.sendText(command, true);

			if (cmdCap) {
				listener = cmdCap.onCommandFinished(cmd => {
					finish(cmd.exitCode ?? 0, cmd.getOutput() ?? outputBuffer);
				});
			}

			timeoutId = setTimeout(() => finish(0, outputBuffer), timeoutMs);

			if (abortSignal) {
				abortSignal.addEventListener('abort', onAbort);
			}
		});
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
					throttledOnData(removeAnsiEscapeCodes(data));
				});
			}

			const interrupt = () => {
				if (wasInterrupted) return;
				wasInterrupted = true;

				// Send SIGINT (Ctrl+C) to interrupt the running command
				terminal.sendText('\x03', false);
				abortController.abort();
			};

			// Execute the command
			const waitForResult = async (): Promise<{ result: string, resolveReason: TerminalResolveReason }> => {
				try {
					const timeoutMs = params.timeoutMs ?? MAX_TERMINAL_INACTIVE_TIME * 1000;

					const result = await Promise.race([
						this._executeCommand(terminal, command, timeoutMs, abortController.signal),
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
						output = output.slice(0, half) + '\n...\n' + output.slice(output.length - half);
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

		// Throttle onData callbacks to avoid overwhelming the renderer. Persistent
		// terminals stay alive after the command, so this listener is disposed once
		// the result settles (in both the success and catch paths below).
		const throttledOnData = params.onData ? throttle(params.onData, 250) : undefined;
		let dataDisposable: IDisposable | undefined;
		if (throttledOnData) {
			dataDisposable = terminal.onData((data) => {
				throttledOnData(removeAnsiEscapeCodes(data));
			});
		}

		const interrupt = () => {
			if (wasInterrupted) return;
			wasInterrupted = true;

			// Send SIGINT (Ctrl+C) to interrupt the running command
			terminal.sendText('\x03', false);
			abortController.abort();
		};

		// Execute the command with proper correlation
		const waitForResult = async (): Promise<{ result: string, resolveReason: TerminalResolveReason }> => {
			try {
				// Use the timeout based on the type
				const timeoutMs = params.timeoutMs ?? MAX_TERMINAL_BG_COMMAND_TIME * 1000;

				const result = await Promise.race([
					this._executeCommand(terminal, command, timeoutMs, abortController.signal),
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
					output = output.slice(0, half) + '\n...\n' + output.slice(output.length - half);
				}

				dataDisposable?.dispose();
				return {
					result: output,
					resolveReason: { type: 'done', exitCode: result.exitCode }
				};
			} catch (error) {
				if (wasInterrupted) {
					// Read the current terminal output
					const terminalId = persistentTerminalId;
					const result = await this.readTerminal(terminalId);
					dataDisposable?.dispose();
					return {
						result,
						resolveReason: { type: 'timeout' }
					};
				}

				// Handle timeout
				const terminalId = persistentTerminalId;
				const result = await this.readTerminal(terminalId);
				dataDisposable?.dispose();
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