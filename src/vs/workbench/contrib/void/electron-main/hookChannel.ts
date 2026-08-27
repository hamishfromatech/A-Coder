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
import { existsSync } from 'fs';
import { win32 as pathWin32 } from 'path';
import { substituteEnvVars, substituteEnvVarsInRecord } from './envVarSubstitution.js';
import { voidDevWarn } from '../common/devLog.js';

/**
 * Quote a single argument for safe interpolation into a shell command line.
 *
 * Node does NOT escape `args` when `spawn(..., { shell: true })` is used — it
 * just concatenates them onto the command string — so any shell metacharacter
 * in an argument would execute as part of the command. Hooks are
 * user-configured, but argument values are frequently dynamic (hook input
 * JSON, file paths, model output), so they are quoted defensively here.
 *
 * Note on limits: on Windows, cmd.exe still expands %VAR% inside double
 * quotes; escaping percent signs in cmd is not reliably possible. This file
 * resolves that by preferring a `shell: false` fast path (see CMD_METACHARS)
 * and failing closed when a shell-path command receives a `%` argument. POSIX
 * single-quoting is fully airtight.
 */
const shellQuoteArg = (arg: string): string => {
	if (process.platform === 'win32') {
		// cmd.exe: wrap in double quotes; escape embedded double quotes by doubling.
		return '"' + arg.replace(/"/g, '""') + '"'
	}
	// POSIX: wrap in single quotes; embed a single quote via '"'"'.
	return `'${arg.replace(/'/g, `'"'"'`)}'`
}

/**
 * cmd.exe metacharacters that mean the command string itself relies on shell
 * features (pipes, redirection, env-var expansion, user-written quoting, etc.).
 * If none are present we can spawn directly with `shell: false`, where Node
 * escapes argv per the MS C runtime rules and cmd never sees the command line —
 * the only fully airtight option on Windows.
 *
 * Note: `!` is deliberately NOT included — it only expands with delayed
 * expansion enabled, and Node invokes cmd with `/d /s /c` (delayed expansion off).
 */
const CMD_METACHARS = /[|&<>^()%"]/

/**
 * Whether `command` resolves to a .cmd/.bat batch script on Windows. Batch
 * scripts cannot be spawned directly (`shell: false` fails with EINVAL since
 * Node's CVE-2024-27980 fix), so they must go through the shell path.
 */
const resolvesToCmdScript = (command: string): boolean => {
	// Deliberately use path.win32: this logic describes Windows resolution
	// rules regardless of which platform the host is running on.
	const ext = pathWin32.extname(command).toLowerCase()
	if (ext === '.cmd' || ext === '.bat') return true
	if (ext !== '') return false // explicit .exe/.ps1/… — CreateProcess can exec it directly
	// Bare name (e.g. "npm"): search PATH with PATHEXT. If only a batch
	// variant matches, the shell is required; otherwise direct exec works.
	const pathDirs = (process.env.PATH || '').split(';').filter(Boolean)
	const pathExts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
	for (const dir of pathDirs) {
		for (const extOf of pathExts) {
			const lowerExt = extOf.toLowerCase()
			if (existsSync(pathWin32.join(dir, command + lowerExt))) {
				return lowerExt === '.cmd' || lowerExt === '.bat'
			}
		}
	}
	return false // not found — let spawn surface the error
}

/** Parameters for the `runCommandHook` channel command. */
export interface RunCommandHookParams {
	/** Shell command to run (env-var-substituted). */
	command: string
	/** Arguments (env-var-substituted). Args are passed safely: quoted per-arg when a shell is used, raw argv otherwise. */
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

		// Choose the spawn strategy. Under `shell: true` Node only concatenates args
		// onto the command line without escaping, so an arg like `foo; rm -rf /`
		// would otherwise execute as a second command.
		let spawnArgs: string[]
		let useShell: boolean
		if (process.platform === 'win32') {
			if (!CMD_METACHARS.test(command) && !/\s/.test(command) && !resolvesToCmdScript(command)) {
				// Airtight fast path: a single bare token (no metachars, no whitespace —
				// the command string is shell syntax by design, so anything beyond one
				// token must go through a shell) and not a batch script. No shell
				// involved, so cmd never sees the command line. Node escapes every
				// arg (MSVC rules); no quoting needed here.
				spawnArgs = args
				useShell = false
			} else {
				// Shell path (command uses shell features or resolves to a batch
				// script): quote every arg. One residual caveat: cmd.exe expands
				// %VAR% even inside double quotes and percent cannot be reliably
				// escaped on the command line — so fail closed instead of silently
				// expanding a literal `%` in an argument.
				const percentArg = args.find(a => a.includes('%'))
				if (percentArg !== undefined) {
					voidDevWarn(`[hooks] refusing to run command hook: argument contains "%" which cmd.exe would expand: ${percentArg}`)
					return {
						exitCode: 1,
						stdout: '',
						stderr: `[hooks] Cannot run hook command "${command}": an argument contains "%" ("${percentArg}"), which cmd.exe would expand even inside quotes. Remove the "%" character from the argument, or make the hook command a direct executable call so no shell is involved.`,
					}
				}
				spawnArgs = args.map(shellQuoteArg)
				useShell = true
			}
		} else {
			// POSIX: single-quoting each arg is fully airtight.
			spawnArgs = args.map(shellQuoteArg)
			useShell = true
		}

		const env: Record<string, string> = {}
		for (const [key, value] of Object.entries({ ...process.env, ...extraEnv })) {
			if (value !== undefined) env[key] = String(value)
		}

		const timeoutMs = (params.timeout ?? 600) * 1000

		return await new Promise<RunCommandHookResult>((resolve) => {
			let proc: ReturnType<typeof spawn>
			try {
				proc = spawn(command, spawnArgs, {
					env,
					cwd: params.cwd,
					shell: useShell,
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