/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Hooks — pure TypeScript types for A-Coder's hook system (Claude Code-compatible).
 *
 * A hook is a piece of logic that runs at a well-defined point in the agent harness
 * (before a tool call, when the agent stops, on a diff-zone accept, etc.). Hooks are
 * contributed from four sources — session-scoped (e.g. `/goal`), plugin manifests,
 * project `.claude/settings.json`, and global `~/.a-coder` + `~/.claude` settings —
 * and come in three execution types: `command` (subprocess), `prompt` (model-decided),
 * and `agent` (subagent verifier).
 *
 * The schema mirrors Claude Code's hooks configuration so plugins authored for Claude
 * Code load unchanged. v1 implements the core event set plus A-Coder-native events;
 * `http` / `mcp_tool` hook types and the `if` permission-rule conditional are deferred.
 */

/** How a hook is executed. v1 supports `command`, `prompt`, and `agent`. */
export type HookType = 'command' | 'prompt' | 'agent'

/**
 * Hook events fired by the harness. The first group is the Claude Code-compatible
 * core set; the second group is A-Coder-native.
 */
export type HookEventName =
	// Claude Code-compatible core events
	| 'PreToolUse'
	| 'PostToolUse'
	| 'Stop'
	| 'StopFailure'
	| 'UserPromptSubmit'
	| 'SessionStart'
	| 'SubagentStart'
	| 'SubagentStop'
	| 'PreCompact'
	// A-Coder-native events
	| 'DiffZoneApply'
	| 'DiffZoneReject'
	| 'AutocompleteSuggest'
	| 'ContextGather'
	| 'ModeSwitch'

/** A single hook definition. Only the fields relevant to its `type` are used. */
export interface HookConfig {
	type: HookType
	/** `command` type: shell command (shell form). Substituted with env vars main-process side. */
	command?: string
	/** `command` type: argument array (no shell tokenization). */
	args?: string[]
	/** `command` type: extra env vars for the subprocess. */
	env?: Record<string, string>
	/** `prompt` / `agent` type: the prompt text. `$ARGUMENTS` is substituted with the serialized input. */
	prompt?: string
	/** `prompt` / `agent` type: optional model override (defaults to a fast model). */
	model?: string
	/** Seconds before the hook is cancelled. Default: 600 command, 30 prompt, 60 agent. */
	timeout?: number
	/** Custom spinner/status message shown while the hook runs. */
	statusMessage?: string
	/** If true, the hook is removed from the session after its first successful fire (session-scoped only in v1). */
	once?: boolean
	/** Permission-rule conditional (`"Bash(git *)"`, `"Edit(*.ts)"`). Parsed but NOT enforced in v1. */
	if?: string
}

/**
 * A matcher group for a single event. `matcher` is matched against the event's
 * key field (tool name for tool events, source for SessionStart, agent type for
 * SubagentStart/Stop, etc.):
 *   - empty / `"*"` / omitted → match all
 *   - letters, digits, `_`, spaces, `,`, `|` → exact literal(s) (`"Edit|Write"` = either)
 *   - any other character → JavaScript regex (`"mcp__memory__.*"`)
 */
export interface HookMatcher {
	matcher?: string
	hooks: HookConfig[]
}

/** Full hook configuration, keyed by event name. */
export type HooksConfig = {
	[eventName in HookEventName]?: HookMatcher[]
}

/** Where a hook config came from — used for the UI provenance badge. */
export type HookSource = 'session' | 'plugin' | 'project' | 'global'

/**
 * The payload sent to a hook. Flattened event-specific fields are added by the caller
 * (e.g. `tool_name`, `tool_input` for tool events; `prompt` for UserPromptSubmit;
 * `from`/`to` for ModeSwitch). Serialized to JSON and written to a command hook's stdin.
 */
export interface HookInput {
	session_id: string
	cwd: string
	hook_event_name: HookEventName
	permission_mode: 'default' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'
	[k: string]: any
}

/**
 * Structured result the dispatcher derives from a hook's output (command stdout JSON,
 * prompt/agent model verdict). The harness acts on whichever fields are present.
 */
export interface HookEventResult {
	/** Decision control. `block` stops the action (tool call / prompt / mode switch / diff accept); `ask` routes through approval; `allow`/undefined proceeds. */
	decision?: 'block' | 'allow' | 'ask'
	/** Human-readable reason accompanying a decision (fed back to the agent / shown to the user). */
	reason?: string
	/** Pre-tool: a modified tool input to use instead of the original. */
	updatedInput?: Record<string, unknown>
	/** Post-tool: replacement text for the tool result. */
	updatedToolOutput?: string
	/** Context to inject into the conversation (UserPromptSubmit, SessionStart, Pre/PostToolUse). */
	additionalContext?: string
	/** Stop / StopFailure: when `false`, force the agent to keep working (used by `/goal`). */
	continue?: boolean
	/** Hide the hook's stdout from the transcript. */
	suppressOutput?: boolean
}

/** Whether an event is a "decision" event (first `block` wins) or a "side-effect" event (all hooks run, contexts concatenated). */
export const DECISION_EVENTS: ReadonlySet<HookEventName> = new Set<HookEventName>([
	'PreToolUse',
	'UserPromptSubmit',
	'ModeSwitch',
	'DiffZoneApply',
	'Stop',
])

/** Default timeout (seconds) per hook type when `timeout` is not specified. */
export const DEFAULT_HOOK_TIMEOUT: Record<HookType, number> = {
	command: 600,
	prompt: 30,
	agent: 60,
}

/** A matcher pattern that contains a character other than letters, digits, `_`, space, `,`, `|`, `*` is treated as a regex. */
export function isRegexMatcher(matcher: string): boolean {
	return /[^A-Za-z0-9_ ,|*]/.test(matcher)
}

/** Test whether a matcher pattern matches a key (tool name / source / agent type). Empty/`*` matches all. */
export function matcherMatches(matcher: string | undefined, key: string): boolean {
	if (!matcher || matcher === '' || matcher === '*') return true
	if (isRegexMatcher(matcher)) {
		try { return new RegExp(matcher).test(key) } catch { return false }
	}
	// Literal list: "Edit|Write" or "Edit, Write"
	const literals = matcher.split(/[|,]/).map(s => s.trim()).filter(s => s.length > 0)
	return literals.includes(key)
}