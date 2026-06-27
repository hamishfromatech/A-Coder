/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js'
import { MCPConfigFileEntryJSON } from './mcpServiceTypes.js'
import { HooksConfig } from './hookServiceTypes.js'

/**
 * Plugin manifest — mirrors Claude Code's `.claude-plugin/plugin.json` shape so
 * plugins authored for Claude Code load unchanged in A-Coder.
 * Only `name` and `description` are required by spec; every other field is optional.
 */
export interface PluginManifest {
	name: string
	version?: string
	description?: string
	author?: { name: string; email?: string; url?: string }
	homepage?: string
	repository?: string | { type?: string; url: string; directory?: string }
	license?: string
	keywords?: string[]
	/** Path(s) to command definition dirs (default "./commands"). Resolved relative to plugin dir. */
	commands?: string | string[]
	/** Path(s) to subagent definition dirs (default "./agents"). Not wired in v1. */
	agents?: string | string[]
	/** Path to skills dir (default "./skills"). */
	skills?: string | string[]
	/** Hooks contributed by this plugin. Either an inline hooks config object (same
	 *  shape as the `hooks` key of a Claude Code `settings.json`) or a path string to
	 *  a JSON file (resolved relative to the plugin dir, containing either a bare
	 *  hooks config or a `{ "hooks": {...} }` wrapper). `${CLAUDE_PLUGIN_ROOT}` in
	 *  command/args/env is substituted with the plugin directory at load time. */
	hooks?: string | HooksConfig
	/** MCP servers contributed by the plugin. Either an inline map
	 *  (`{ serverName: { command, args, env } }`, same shape as `.mcp.json`'s
	 *  `mcpServers` value) or a path string to a `.mcp.json` file (resolved
	 *  relative to the plugin dir). `${CLAUDE_PLUGIN_ROOT}` in command/args/env
	 *  is substituted with the plugin directory at load time. */
	mcpServers?: string | Record<string, MCPConfigFileEntryJSON>
}

/**
 * A plugin discovered on disk. `source` records which root it was found under so
 * the UI can show provenance (`~/.a-coder` vs `~/.claude`).
 */
export interface InstalledPlugin {
	manifest: PluginManifest
	dir: URI
	/** Where the plugin was discovered. */
	source: 'a-coder' | 'claude' | 'marketplace'
	enabled: boolean
}

export interface PluginServiceState {
	plugins: InstalledPlugin[]
	error?: string
}