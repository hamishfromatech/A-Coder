/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Replace `${VAR}`, `${VAR:-default}`, and `${VAR:=default}` (and `${VAR:?default}`)
 * placeholders with values from `process.env`, matching Claude Code's MCP-server and
 * hook env-var conventions.
 *
 *   - Set variable           → its value
 *   - Unset + `:-` / `:=` / `:?` op → the supplied default
 *   - Unset + no op          → empty string
 *
 * Strings without placeholders are returned unchanged, so callers that don't use this
 * syntax are unaffected. Lives in the main process (electron-main) where `process.env`
 * is available; the renderer sandbox can't read arbitrary env vars.
 */
export function substituteEnvVars(value: string): string {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([-=?]))?([^}]*)\}/g,
		(_match, name: string, op: string | undefined, def: string) => {
			const v = process.env[name]
			if (v !== undefined) return v
			return op !== undefined ? def : ''
		})
}

/** Apply {@link substituteEnvVars} to every string value in a record, returning a new record. */
export function substituteEnvVarsInRecord(rec: Record<string, string> | undefined): Record<string, string> | undefined {
	if (!rec) return rec
	return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, substituteEnvVars(v)]))
}