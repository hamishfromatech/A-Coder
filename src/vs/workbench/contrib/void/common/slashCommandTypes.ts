/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Built-in client-only actions that slash commands can trigger without sending a
 * prompt to the LLM (e.g. clear thread, continue). Plugin/personal commands never use
 * these — they expand to `prompt` and send text to the model, matching Claude Code.
 */
export type SlashCommandClientAction = 'client-clear' | 'client-continue' | 'client-goal' | 'client-goal-clear' | 'client-compact' | 'client-compact-clear'

/**
 * A slash command definition. Built-ins and plugin/personal `commands/*.md` files all
 * produce one of these. The `prompt` is the markdown body sent to the LLM with
 * `$ARGUMENTS` replaced by whatever the user typed after the command name.
 */
export interface SlashCommandDef {
	/** The command label without the leading `/`. */
	label: string
	description: string
	/** Hint shown in the menu for the argument, e.g. `<query>`. */
	argumentHint?: string
	/** Markdown prompt body. `$ARGUMENTS` is substituted with the user's args. */
	prompt: string
	/** Where this command came from (for menu grouping / provenance). */
	source: string
	/** Optional built-in client-only action; skips prompt expansion when set. */
	clientAction?: SlashCommandClientAction
	/** Optional custom expander for built-in commands whose prompt logic can't be
	 * expressed as a plain `$ARGUMENTS` template (e.g. default-when-empty fallbacks).
	 * When set, takes precedence over `prompt`. Plugin/personal commands never use this. */
	expand?: (args: string) => string
}