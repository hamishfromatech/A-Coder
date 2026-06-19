/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ToolName } from './toolsServiceTypes.js'

/**
 * Terminal command auto-approval policy.
 *
 * Layers (first match wins):
 *   1. deny  -> always prompt (overrides everything below)
 *   2. master toggle (autoApprove['terminal']) -> approve all terminal commands
 *   3. allow list -> approve if the command line matches a pattern
 *   4. read-only preset -> approve if enabled AND the command is read-only
 *   5. otherwise -> prompt
 *
 * Patterns are matched as prefixes/globs against the trimmed full command line,
 * with `*` as a wildcard. A bare pattern like `ls` matches `ls`, `ls -la`, etc. Use
 * a trailing space (`ls `) to require a separator, or `*` for a glob.
 */

// Read-only base commands (first token). Intentionally conservative — only
// commands that cannot mutate the filesystem or external state.
const READ_ONLY_COMMANDS = new Set<string>([
	'ls', 'll', 'la', 'cat', 'head', 'tail', 'less', 'more', 'wc', 'pwd', 'echo',
	'printf', 'grep', 'rg', 'ag', 'ack', 'find', 'fd', 'which', 'where', 'whereis',
	'file', 'stat', 'du', 'df', 'env', 'printenv', 'whoami', 'hostname', 'uname',
	'date', 'cal', 'uptime', 'tree', 'diff', 'comm', 'uniq', 'sort', 'cut', 'tr',
	'basename', 'dirname', 'realpath', 'readlink', 'test', 'true', 'false',
	'man', 'help', 'tldr', 'bat', 'exa', 'eza', 'sed', 'awk', // read-only when no -i; best-effort
])

// Read-only `git <subcommand>` pairs.
const READ_ONLY_GIT_SUBCOMMANDS = new Set<string>([
	'status', 'diff', 'log', 'show', 'branch', 'blame', 'ls-files', 'ls-tree',
	'remote', 'rev-parse', 'describe', 'shortlog', 'name-rev', 'config', // config get is read-only-ish; accept the risk
	'fetch', // network but non-mutating to the working tree
])

// Read-only `npm <subcommand>` / `npx` pairs (best-effort).
const READ_ONLY_NPM_SUBCOMMANDS = new Set<string>([
	'--version', '-v', 'view', 'info', 'ls', 'list', 'outdated', 'audit',
])

/**
 * Extract the meaningful "base command" tokens from a command line for
 * classification. Returns the first token, plus the second token when the first
 * is a known multi-arg tool (git/npm/npx/yarn/pnpm) so we can classify e.g.
 * `git status` vs `git push`.
 */
function baseTokens(command: string): string[] {
	const trimmed = command.trim()
	if (!trimmed) return []
	// Split on whitespace; ignore leading env-var assignments (FOO=bar cmd ...) and
	// common prefixes (sudo, env, nohup, time).
	const rawTokens = trimmed.split(/\s+/).filter(t => t.length > 0)
	const tokens: string[] = []
	for (const t of rawTokens) {
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue // env assignment
		if (t === 'sudo' || t === 'env' || t === 'nohup' || t === 'time' || t === 'command') continue
		tokens.push(t)
		if (tokens.length >= 2) break
	}
	return tokens
}

/** Whether a command line is classified as read-only by the built-in set. */
export function isReadOnlyCommand(command: string): boolean {
	const tokens = baseTokens(command)
	if (tokens.length === 0) return false
	const first = tokens[0]
	// Strip any path prefix from the binary (e.g. /usr/bin/ls -> ls, ./node -> node).
	const base = first.slice(Math.max(0, first.lastIndexOf('/') + 1))

	if (base === 'git') return tokens.length >= 2 && READ_ONLY_GIT_SUBCOMMANDS.has(tokens[1])
	if (base === 'npm' || base === 'yarn' || base === 'pnpm' || base === 'npx') {
		return tokens.length >= 2 && READ_ONLY_NPM_SUBCOMMANDS.has(tokens[1])
	}
	return READ_ONLY_COMMANDS.has(base)
}

/**
 * Glob/prefix match a pattern against a command line. `*` matches any run of
 * characters; a pattern without `*` is treated as a prefix match against the
 * trimmed command line. Case-sensitive.
 */
export function commandMatchesPattern(command: string, pattern: string): boolean {
	const pat = pattern.trim()
	if (!pat) return false
	const cmd = command.trim()
	if (!pat.includes('*')) return cmd.startsWith(pat) || cmd === pat
	// Convert glob to regex: escape everything except `*` (-> `.*`).
	let re = '^'
	for (const ch of pat) {
		if (ch === '*') re += '.*'
		else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}
	re += '$'
	return new RegExp(re).test(cmd)
}

function matchesAny(command: string, patterns: string[] | undefined): boolean {
	if (!patterns || patterns.length === 0) return false
	for (const p of patterns) {
		if (commandMatchesPattern(command, p)) return true
	}
	return false
}

export interface TerminalAutoApproveSettings {
	/** Master "approve all terminal commands" toggle (existing). */
	masterToggle: boolean | undefined
	terminalAllowPatterns: string[]
	terminalDenyPatterns: string[]
	terminalReadOnlyAutoApprove: boolean
}

export interface TerminalAutoApproveResult {
	approved: boolean
	/** Human-readable reason, useful for UI/debugging. */
	reason: 'denied' | 'master' | 'allowlist' | 'readonly' | 'prompt'
}

/**
 * Decide whether a `run_command` call should auto-approve based on the layered
 * policy. For non-`run_command` terminal tools (open/kill persistent terminal)
 * there is no command line, so only the master toggle applies — use
 * {@link shouldAutoApproveTerminalTool} for those.
 */
export function shouldAutoApproveRunCommand(
	command: string,
	settings: TerminalAutoApproveSettings
): TerminalAutoApproveResult {
	// 1. Deny list always wins (even over the master toggle).
	if (matchesAny(command, settings.terminalDenyPatterns)) {
		return { approved: false, reason: 'denied' }
	}
	// 2. Master toggle: approve everything.
	if (settings.masterToggle) {
		return { approved: true, reason: 'master' }
	}
	// 3. Allow list.
	if (matchesAny(command, settings.terminalAllowPatterns)) {
		return { approved: true, reason: 'allowlist' }
	}
	// 4. Read-only preset.
	if (settings.terminalReadOnlyAutoApprove && isReadOnlyCommand(command)) {
		return { approved: true, reason: 'readonly' }
	}
	// 5. Prompt.
	return { approved: false, reason: 'prompt' }
}

/**
 * Decide auto-approval for any terminal-type builtin tool. Only `run_command`
 * has a command line; `open_persistent_terminal` / `kill_persistent_terminal`
 * fall back to the master toggle. Pass the validated/raw command string for
 * `run_command`, or `undefined` for the other terminal tools.
 */
export function shouldAutoApproveTerminalTool(
	toolName: ToolName,
	command: string | undefined,
	settings: TerminalAutoApproveSettings
): boolean {
	if (toolName === 'run_command') {
		if (typeof command !== 'string' || command.length === 0) return false
		return shouldAutoApproveRunCommand(command, settings).approved
	}
	// open_persistent_terminal / kill_persistent_terminal: only the master toggle.
	return !!settings.masterToggle
}

/**
 * Suggested allowlist pattern for a command line — the base command plus its
 * first sub-arg for multi-arg tools (e.g. `git status`), so "Always allow" adds
 * a precise pattern rather than a too-broad one.
 */
export function suggestedAllowPattern(command: string): string {
	const tokens = baseTokens(command)
	if (tokens.length === 0) return ''
	if (tokens.length >= 2 && ['git', 'npm', 'yarn', 'pnpm', 'npx'].includes(stripPath(tokens[0]))) {
		return `${tokens[0]} ${tokens[1]}`
	}
	return tokens[0]
}

function stripPath(bin: string): string {
	return bin.slice(Math.max(0, bin.lastIndexOf('/') + 1))
}