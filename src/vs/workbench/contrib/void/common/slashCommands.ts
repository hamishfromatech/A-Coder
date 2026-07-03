/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { SlashCommandDef } from './slashCommandTypes.js'

/**
 * The built-in slash commands A-Coder ships with. These reproduce the exact prompt
 * expansions the old hardcoded `SLASH_COMMANDS` + `expandSlashCommand` switch produced,
 * so existing behavior is identical. Plugin/personal commands (loaded from disk by
 * PluginService) are merged on top of these at render time.
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandDef[] = [
	{
		label: 'search',
		description: 'Search codebase for symbols, files, or definitions',
		source: 'builtin',
		prompt: '',
		expand: (args) => `Search the codebase for: ${args || 'relevant symbols, files, and definitions'}. Use search tools as needed.`,
	},
	{
		label: 'summarize',
		description: 'Summarize current thread or selected code',
		source: 'builtin',
		prompt: '',
		expand: (args) => `Summarize ${args || 'the current conversation thread and any selected code'}. Provide a concise overview.`,
	},
	{
		label: 'fix',
		description: 'Fix lint errors or obvious bugs in selected code',
		source: 'builtin',
		prompt: '',
		expand: (args) => `Fix the following code issues${args ? `: ${args}` : ''}. Identify and correct any bugs, lint errors, or obvious problems.`,
	},
	{
		label: 'clear',
		description: 'Clear the current chat thread',
		source: 'builtin',
		prompt: '',
		clientAction: 'client-clear',
	},
	{
		label: 'continue',
		description: 'Continue the assistant response',
		source: 'builtin',
		prompt: '',
		expand: (args) => args ? `Continue: ${args}` : 'Please continue your previous response.',
	},
	{
		label: 'explain',
		description: 'Explain the current selection or code',
		source: 'builtin',
		prompt: '',
		expand: (args) => `Explain the following code${args ? `: ${args}` : ''}. Break down what it does and why.`,
	},
	{
		label: 'goal',
		description: 'Set a session goal the agent keeps working toward (Stop hook). Use /goal clear to remove.',
		source: 'builtin',
		argumentHint: '<condition>',
		prompt: '',
		// `client-goal` is handled in SidebarChat.onSubmit: it installs a session-
		// scoped prompt-type Stop hook (via HookService.setSessionGoal) that keeps
		// the agent working until the model judges the condition met. With no arg,
		// shows the current goal; `clear|stop|off|reset|none|cancel` removes it.
		clientAction: 'client-goal',
	},
	{
		label: 'compact',
		description: 'Compress conversation history into an LLM summary now. Use /compact clear to undo.',
		source: 'builtin',
		argumentHint: '<focus instructions (optional)>',
		prompt: '',
		// `client-compact` is handled in SidebarChat.onSubmit: it calls
		// ChatThreadService.compactThread, which summarizes the older messages into a
		// persisted CompactionSnapshot (used for context on future turns) and keeps
		// the recent messages verbatim. Optional args focus the summary (e.g.
		// `/compact focus on the auth bug fix`). `clear` removes the snapshot so the
		// full history is sent again. No message is sent to the model by /compact
		// itself — the snapshot takes effect on the next turn.
		clientAction: 'client-compact',
	},
]