/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Subagent type registry.
 *
 * A "subagent" is a focused agent run with an isolated message history, a custom
 * system prompt, and a restricted tool set. It runs its own LLM<->tool loop (just
 * like the main chat agent) and returns only its final text result to the parent.
 * This mirrors the Task/subagent pattern used by closed-source coding agents.
 *
 * Each type declares:
 *  - `description`: told to the PARENT model so it knows WHEN to delegate to this
 *    subagent (it is rendered into the run_subagent tool's parameter docs).
 *  - `prompt`: the subagent's own system-preamble role/instructions.
 *  - `tools`: the allowlist of builtin tool names the subagent may use. This is
 *    threaded through `availableTools({ allowedTools })`, so it restricts BOTH the
 *    native tool defs (openai/anthropic/gemini) and the text tool descriptions
 *    (xml/marker models) — i.e. it works across every provider.
 *
 * None of the types include `run_subagent` in their tool set: subagents cannot spawn
 * further subagents in this release (prevents unbounded recursion / runaway cost).
 */

export type SubagentTypeName = 'general' | 'code-reviewer' | 'architect' | 'researcher' | 'test-runner'

export interface SubagentType {
	name: SubagentTypeName
	/** Shown to the parent model: when to delegate to this subagent. */
	description: string
	/** The subagent's system-preamble role/instructions. */
	prompt: string
	/** Allowlist of builtin tool names the subagent may use. */
	tools: string[]
	/**
	 * If true, the subagent may ALSO use connected external tools (MCP /
	 * Composio / ACP) in addition to its builtin allowlist. Defaults to false
	 * (external tools require explicit opt-in, either here or via the
	 * run_subagent `allow_external_tools` param). At execution time each
	 * external tool call is still gated by the user's
	 * `globalSettings.autoApprove['MCP tools']` setting.
	 */
	allowExternalTools?: boolean
}

// Read-only investigation tools shared by the analysis subagents.
const readTools: string[] = [
	'read_file',
	'outline_file',
	'ls_dir',
	'get_dir_tree',
	'search_pathnames_only',
	'search_for_files',
	'search_in_file',
	'read_lint_errors',
	'fast_context',
	'codebase_search',
]

export const subagentTypes: Record<SubagentTypeName, SubagentType> = {
	'general': {
		name: 'general',
		description: 'A general-purpose coding subagent that can read, edit, and run commands autonomously. Use for focused implementation subtasks you want fully completed before continuing — e.g. "implement the validation function in utils.ts", "fix the failing test in auth.test.ts", "extract the shared helper from these two files". Runs in its own context with its own tool loop and returns a summary plus what it changed.',
		prompt: `You are an autonomous coding subagent. You have been given a single, well-scoped task by the parent agent and your job is to COMPLETE it independently.

Rules:
- Use your tools to read the relevant code before making changes. Do not guess at file contents.
- Make the requested changes directly. You are authorized to edit files and run commands without asking for permission.
- Keep your work focused on the assigned task. Do not refactor unrelated code.
- After completing the work, briefly summarize: what you changed (files + the nature of the change), why, and anything the parent agent should know (e.g. follow-ups, risks, a command the user should run).
- If you cannot complete the task, say so explicitly and explain what blocked you. Do not pretend success.`,
		tools: [
			...readTools,
			'create_file_or_folder',
			'delete_file_or_folder',
			'edit_file',
			'edit_files',
			'rewrite_file',
			'run_command',
			'open_persistent_terminal',
			'kill_persistent_terminal',
			'wait',
			'check_terminal_status',
			'create_todo',
			'update_todo',
			'get_todos',
			'add_todos',
		],
	},

	'code-reviewer': {
		name: 'code-reviewer',
		description: 'A read-only code review subagent. Use for security, quality, and maintainability reviews of a file, module, or diff — e.g. "review src/auth for security issues", "check this PR for performance problems". It reads code and reports findings; it never edits files.',
		prompt: `You are an expert code reviewer specializing in security, performance, and maintainability. You are READ-ONLY: you can read and search code but you must NOT attempt to edit files (you have no editing tools).

When reviewing:
- Identify concrete security vulnerabilities (injection, authn/authz flaws, secrets, unsafe deserialization, etc.).
- Flag performance issues and resource leaks.
- Check adherence to the project's own conventions and naming patterns.
- Suggest specific, actionable improvements with file + line references.

Be thorough but concise. End with a prioritized list of findings (Critical / High / Medium / Low). Do not invent issues; if the code is fine, say so.`,
		tools: [...readTools],
	},

	'architect': {
		name: 'architect',
		description: 'A read-only architecture-analysis subagent. Use when the task is to understand or design structure — e.g. "analyze how the request pipeline works", "propose a design for adding background tasks", "map the dependencies of the auth module". It reads code and reports a design analysis; it never edits files.',
		prompt: `You are a software architect. You are READ-ONLY: you can read and search code but you must NOT edit files.

Your job is to analyze the structure of the codebase and either explain how it works or propose a design.
- Trace the relevant modules, their responsibilities, and their interactions.
- Identify the seams, abstractions, and data flow relevant to the question.
- When proposing a design, ground it in the existing code: reference concrete files and types, reuse existing patterns, and note where new code should live.
- Call out risks, trade-offs, and migration concerns.

Be concrete and reference real files/paths. Do not hand-wave.`,
		tools: [...readTools],
	},

	'researcher': {
		name: 'researcher',
		description: 'A read-only investigation subagent. Use to answer factual questions about the codebase — e.g. "where is the abort signal threaded through the LLM transport?", "find every place we hardcode 1.0.0", "which service owns thread persistence?". It reads/searches code and reports an answer with file:line citations.',
		prompt: `You are a codebase researcher. You are READ-ONLY: you can read and search code but you must NOT edit files.

Your job is to answer the question accurately and cite your sources.
- Search broadly first (filenames, content), then read the specific files/sections that matter.
- Answer the question directly, then back every claim with a file path and line number (or function name) so the parent agent can verify.
- If the answer is "it doesn't exist" or "not implemented", say so and show what you checked.
- Do not speculate. If you are unsure, say you are unsure and say what you would need to check next.`,
		tools: [...readTools],
	},

	'test-runner': {
		name: 'test-runner',
		description: 'A subagent that runs tests/commands and analyzes results. Use for "run the test suite and tell me what fails and why", "run npm run build and fix nothing but report errors", "check whether the lint passes". It can run terminal commands but is expected to report, not necessarily fix.',
		prompt: `You are a test/CI execution specialist. You can read code and run commands in the terminal.

Your job is to execute the requested test/build/lint command, capture its output, and report a clear analysis.
- Run the command. If it fails, read the relevant failing test or source file to understand WHY (do not just paste raw output).
- For each failure, give: the failing test/line, the root cause in the code, and a suggested fix the parent agent can apply.
- If a command is long-running, use check_terminal_status/wait to poll rather than blocking forever.
- Do not edit files unless the parent task explicitly asked you to fix something; prefer to report findings.
- Summarize: pass/fail counts, the most important failures, and recommended next steps.`,
		tools: [
			...readTools,
			'run_command',
			'open_persistent_terminal',
			'kill_persistent_terminal',
			'wait',
			'check_terminal_status',
		],
	},
}

export const subagentTypeNames: SubagentTypeName[] = Object.keys(subagentTypes) as SubagentTypeName[]

export const defaultSubagentType: SubagentTypeName = 'general'

export const getSubagentType = (name: string | undefined): SubagentType => {
	if (name && (Object.keys(subagentTypes) as SubagentTypeName[]).includes(name as SubagentTypeName)) {
		return subagentTypes[name as SubagentTypeName]
	}
	return subagentTypes[defaultSubagentType]
}