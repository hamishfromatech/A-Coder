/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts alongside the other void-channel-* channels.
// Lives in the main process because command-type hooks need child_process + process.env,
// which the renderer sandbox can't reach.

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { spawn } from 'child_process';
import { substituteEnvVars, substituteEnvVarsInRecord } from './envVarSubstitution.js';
import { voidDevWarn } from '../common/devLog.js';

/** Parameters for the `runCommandHook` channel command. */
export interface RunCommandHookParams {
	/** Shell command to run (env-var-substituted). */
	command: string
	/** Arguments (env-var-substituted). */
	args?: string[]
	/** Extra env vars (env-var-substituted), merged over process.env. */
	env?: Record<string, string>
	/** JSON string written to the hook's stdin. */
	stdinJson: string
	/** Working directory for the subprocess. */
	cwd?: string
	/** Seconds before the subprocess is killed. */
	timeout?: number
}

export interface RunCommandHookResult {
	exitCode: number
	stdout: string
	stderr: string
}

/**
 * IPC channel for executing command-type hooks. The renderer's HookService builds the
 * hook input JSON and calls `runCommandHook`; this channel spawns the subprocess,
 * pipes the JSON to stdin, collects stdout/stderr, and returns the exit code so the
 * renderer can apply Claude Code's exit-code semantics (0 = parse stdout JSON, 2 =
 * blocking error, other = non-blocking error).
 */
export class HookChannel implements IServerChannel {

	constructor() { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`)
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		if (command === 'runCommandHook') {
			return this._runCommandHook(params as RunCommandHookParams)
		}
		throw new Error(`Void hooks channel: command "${command}" not recognized.`)
	}

	private async _runCommandHook(params: RunCommandHookParams): Promise<RunCommandHookResult> {
		const command = substituteEnvVars(params.command)
		const args = (params.args || []).map(a => substituteEnvVars(a))
		const extraEnv = substituteEnvVarsInRecord(params.env) || {}

		const env: Record<string, string> = {}
		for (const [key, value] of Object.entries({ ...process.env, ...extraEnv })) {
			if (value !== undefined) env[key] = String(value)
		}

		const timeoutMs = (params.timeout ?? 600) * 1000

		return await new Promise<RunCommandHookResult>((resolve) => {
			let proc: ReturnType<typeof spawn>
			try {
				proc = spawn(command, args, {
					env,
					cwd: params.cwd,
					shell: true,
					stdio: ['pipe', 'pipe', 'pipe'],
				})
			} catch (err) {
				voidDevWarn('[hooks] failed to spawn command hook:', err)
				resolve({ exitCode: 1, stdout: '', stderr: String(err) })
				return
			}

			let stdout = ''
			let stderr = ''
			proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
			proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

			const timer = setTimeout(() => {
				try { proc.kill('SIGTERM') } catch { /* ignore */ }
				resolve({ exitCode: 124, stdout, stderr: stderr + '\n[hook timed out]' })
			}, timeoutMs)

			proc.on('error', (err) => {
				clearTimeout(timer)
				resolve({ exitCode: 1, stdout, stderr: String(err) })
			})

			proc.on('exit', (code, signal) => {
				clearTimeout(timer)
				resolve({ exitCode: code ?? (signal ? 128 : 0), stdout, stderr })
			})

			// Write the hook input JSON to stdin, then close it so the hook can read EOF.
			try {
				proc.stdin?.write(params.stdinJson)
				proc.stdin?.end()
			} catch { /* ignore — hook may have exited already */ }
		})
	}
}