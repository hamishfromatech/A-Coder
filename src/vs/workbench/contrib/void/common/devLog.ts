/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Dev-only logging helpers.
 *
 * Production builds stay silent; verbose diagnostics (full LLM payloads, stream
 * chunks, metrics identify dumps, etc.) only appear when a dev flag is set, so
 * prompts/keys don't leak into user log files.
 *
 * The flag is resolved once at module load from `process.env`:
 *   - `A_CODER_DEBUG=1`  explicit opt-in
 *   - `VSCODE_DEV`       set by `./scripts/code.sh` in dev runs
 * Both signals are available in the main process and the Electron renderer.
 * The env read is wrapped in try/catch so this is safe in sandboxed renderers
 * where `process` may be restricted.
 */

const __voidDev: boolean = (() => {
	try {
		if (typeof process !== 'undefined' && process && typeof process.env === 'object') {
			return process.env.A_CODER_DEBUG === '1' || !!process.env.VSCODE_DEV
		}
	} catch {
		// ignore — treat as production
	}
	return false
})()

export function voidDevLog(...args: unknown[]): void {
	if (__voidDev) console.log(...args)
}

export function voidDevWarn(...args: unknown[]): void {
	if (__voidDev) console.warn(...args)
}