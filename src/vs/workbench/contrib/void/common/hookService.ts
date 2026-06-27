/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js'
import { Disposable } from '../../../../base/common/lifecycle.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js'
import { IFileService } from '../../../../platform/files/common/files.js'
import { IPathService } from '../../../services/path/common/pathService.js'
import { IProductService } from '../../../../platform/product/common/productService.js'
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js'
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js'
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'
import { Event, Emitter } from '../../../../base/common/event.js'
import { generateUuid } from '../../../../base/common/uuid.js'
import { IVoidSettingsService } from './voidSettingsService.js'
import { IPluginService } from './pluginService.js'
import { voidDevWarn } from './devLog.js'
import {
	HookEventName, HookConfig, HooksConfig,
	HookInput, HookEventResult, DECISION_EVENTS, DEFAULT_HOOK_TIMEOUT, matcherMatches,
} from './hookServiceTypes.js'

/**
 * Minimal subagent-runner interface for prompt/agent hook execution. Resolved
 * lazily via the instantiation service. We re-declare the service decorator here
 * (VS Code's `createDecorator` caches by id string, so this returns the SAME
 * decorator object as `browser/subagentService.ts`) to avoid importing the
 * browser-only subagentService module from this common/ file (boundary: common
 * must not depend on browser).
 */
interface ISubagentRunner {
	readonly _serviceBrand: undefined
	runSubagentSync(opts: {
		parentThreadId: string | null
		description: string
		subagentType?: string
		prompt?: string
		tools?: string[]
		background?: boolean
		title?: string
	}): Promise<{ subagentId: string, status: string, fullText: string, error: string | undefined }>
}
const ISubagentService = createDecorator<ISubagentRunner>('voidSubagentService')

/** The matcher-key field per event (the input field a `matcher` is tested against). */
const MATCHER_KEY_OF_EVENT: Partial<Record<HookEventName, string>> = {
	PreToolUse: 'tool_name',
	PostToolUse: 'tool_name',
	SessionStart: 'source',
	SubagentStart: 'agent_type',
	SubagentStop: 'agent_type',
}

export interface HookServiceState {
	/** Currently-aggregated hook config (session + plugin + project + global). */
	hooksConfig: HooksConfig
	/** Active session goal set by `/goal`, if any (shown in the UI / returned by `/goal`). */
	sessionGoal?: string
	error?: string
}

export interface IHookService {
	readonly _serviceBrand: undefined
	readonly state: HookServiceState
	onDidChangeState: Event<void>

	/** Install runtime hooks for the current session only (used by `/goal` and programmatic installs). */
	setSessionHooks(config: HooksConfig): void
	clearSessionHooks(): void

	/** `/goal` support: install a session-scoped prompt-type Stop hook enforcing `condition`. */
	setSessionGoal(condition: string): void
	clearSessionGoal(): void

	/** The single dispatch entry the harness awaits at a hook point. */
	fire(eventName: HookEventName, input: Partial<HookInput>): Promise<HookEventResult>

	// Convenience wrappers (build the input + call fire):
	firePreToolUse(threadId: string, toolName: string, toolInput: Record<string, unknown>): Promise<HookEventResult>
	firePostToolUse(threadId: string, toolName: string, toolInput: Record<string, unknown>, toolResult: unknown, error?: string): Promise<HookEventResult>
	fireStop(threadId: string): Promise<HookEventResult>
	fireStopFailure(threadId: string, error: string): Promise<HookEventResult>
	fireUserPromptSubmit(threadId: string, prompt: string): Promise<HookEventResult>
	fireSessionStart(source: 'startup' | 'resume' | 'clear' | 'compact'): Promise<HookEventResult>
	fireSubagentStart(subagentId: string, agentType: string): Promise<HookEventResult>
	fireSubagentStop(subagentId: string, agentType: string, status: string): Promise<HookEventResult>
	firePreCompact(threadId: string, transcript: unknown): Promise<HookEventResult>
	fireDiffZoneApply(diffid: number, uri: string): Promise<HookEventResult>
	fireDiffZoneReject(diffid: number, uri: string): Promise<HookEventResult>
	fireAutocompleteSuggest(uri: string, position: { line: number, character: number }, completions: unknown[]): Promise<HookEventResult>
	fireContextGather(snippets: string[]): Promise<HookEventResult>
	fireModeSwitch(from: string, to: string): Promise<HookEventResult>
}

export const IHookService = createDecorator<IHookService>('hookService')


class HookService extends Disposable implements IHookService {
	_serviceBrand: undefined

	state: HookServiceState = { hooksConfig: {}, sessionGoal: undefined, error: undefined }
	private readonly _onDidChangeState = new Emitter<void>()
	public readonly onDidChangeState = this._onDidChangeState.event

	private readonly channel: IChannel // void-channel-hooks (main process)
	private _sessionHooks: HooksConfig = {}
	private _onceFired = new Set<string>() // session-scoped `once` hook identities that have fired

	/** Per-session id included in every hook input. */
	private readonly _sessionId = generateUuid()
	/** Best-effort cwd (workspace root or user home). */
	private _cwd: string = ''

	/**
	 * Recursion guard: while a `prompt`/`agent` hook is executing (it spawns a
	 * subagent whose tool calls would re-fire PreToolUse/PostToolUse), every
	 * `fire(...)` short-circuits to a no-op. This is the key correctness invariant.
	 */
	private _isRunningHook = false

	/** Cached aggregated config; rebuilt when any source changes. */
	private _aggregated: HooksConfig = {}

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IPluginService private readonly pluginService: IPluginService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super()
		this.channel = this.mainProcessService.getChannel('void-channel-hooks')

		// Re-aggregate when plugins or user-global hooks settings change.
		this._register(this.pluginService.onDidChangeState(() => { void this._reaggregate() }))
		this._register(this.voidSettingsService.onDidChangeState(() => { void this._reassociateAndApplyUserHooks() }))

		this._initialize()
	}

	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState
			this._cwd = this._resolveCwd()
			await this._reassociateAndApplyUserHooks()
			await this._addSettingsFileWatchers()
			// Surface session start (session-scoped hooks / plugins may inject context).
			void this.fireSessionStart('startup')
		} catch (err) {
			voidDevWarn('[hooks] init error:', err)
		}
	}

	private _resolveCwd(): string {
		try {
			const folders = this.workspaceContextService.getWorkspace().folders
			if (folders.length > 0) return folders[0].uri.fsPath
		} catch { /* ignore */ }
		return ''
	}

	private async _reassociateAndApplyUserHooks() {
		// user-global hooks edited via the Settings UI live in globalSettings.userHooks.
		// They're treated as the "global" source; file-based global settings are read
		// separately below. Re-aggregate to pick up either change.
		await this._reaggregate()
	}

	/** Re-read all sources and rebuild `_aggregated` + `state.hooksConfig`. */
	private async _reaggregate() {
		try {
			const global = await this._readGlobalHooks() // file-based + userHooks setting
			const project = await this._readProjectHooks()
			const plugin = await this._readPluginHooks()
			const session = this._sessionHooks
			// Merge: concatenate matcher arrays per event across all sources. Source
			// order (session, project, global, plugin) only matters for last-write-wins
			// of updatedInput/updatedToolOutput on side-effect events; decision events
			// use first-block-wins so order is less significant there.
			this._aggregated = this._mergeConfigs([session, project, global, plugin])
			this.state = { ...this.state, hooksConfig: this._aggregated, error: undefined }
			this._onDidChangeState.fire()
		} catch (err) {
			this.state = { ...this.state, error: `Hook config error: ${err}` }
			this._onDidChangeState.fire()
		}
	}

	private _mergeConfigs(configs: HooksConfig[]): HooksConfig {
		const out: HooksConfig = {}
		for (const cfg of configs) {
			for (const eventName of Object.keys(cfg) as HookEventName[]) {
				const matchers = cfg[eventName]
				if (!matchers || !Array.isArray(matchers)) continue
				out[eventName] = [...(out[eventName] ?? []), ...matchers]
			}
		}
		return out
	}

	// ---------- source readers ----------

	private async _readGlobalHooks(): Promise<HooksConfig> {
		const userHome = await this.pathService.userHome()
		const files = [
			URI.joinPath(userHome, this.productService.dataFolderName, 'settings.json'),
			URI.joinPath(userHome, '.claude', 'settings.json'),
		]
		let merged: HooksConfig = {}
		for (const uri of files) {
			const cfg = await this._readHooksFile(uri)
			merged = this._mergeConfigs([merged, cfg])
		}
		// user-global hooks edited via the Settings UI (persisted in GlobalSettings).
		const userHooks = this.voidSettingsService.state.globalSettings.userHooks
		if (userHooks && typeof userHooks === 'object') {
			merged = this._mergeConfigs([merged, userHooks as HooksConfig])
		}
		return merged
	}

	private async _readProjectHooks(): Promise<HooksConfig> {
		const folder = this._resolveCwd()
		if (!folder) return {}
		const rootUri = URI.file(folder)
		const files = [
			URI.joinPath(rootUri, '.a-coder', 'settings.json'),
			URI.joinPath(rootUri, '.claude', 'settings.json'),
		]
		let merged: HooksConfig = {}
		for (const uri of files) {
			const cfg = await this._readHooksFile(uri)
			merged = this._mergeConfigs([merged, cfg])
		}
		return merged
	}

	private async _readPluginHooks(): Promise<HooksConfig> {
		const merged: HooksConfig = {}
		for (const p of this.pluginService.getEnabledPlugins()) {
			const hooksField = p.manifest.hooks
			if (!hooksField) continue
			let cfg: HooksConfig = {}
			if (typeof hooksField === 'string') {
				// Path to a hooks JSON file, resolved against the plugin dir.
				try {
					const fileUri = URI.joinPath(p.dir, hooksField)
					const content = await this.fileService.readFile(fileUri)
					const parsed = JSON.parse(content.value.toString())
					if (parsed && typeof parsed === 'object' && parsed.hooks && typeof parsed.hooks === 'object') {
						cfg = this._substitutePluginRoot(parsed.hooks as HooksConfig, p.dir.fsPath)
					} else if (parsed && typeof parsed === 'object') {
						// Bare hooks config (no `hooks` wrapper).
						cfg = this._substitutePluginRoot(parsed as HooksConfig, p.dir.fsPath)
					}
				} catch { /* invalid/missing hooks file — skip */ }
			} else {
				cfg = this._substitutePluginRoot(hooksField as HooksConfig, p.dir.fsPath)
			}
			this._mergeConfigsInto(merged, cfg)
		}
		return merged
	}

	/** Read a settings.json file and return its `hooks` key as a HooksConfig (empty on any error). */
	private async _readHooksFile(uri: URI): Promise<HooksConfig> {
		try {
			const content = await this.fileService.readFile(uri)
			const parsed = JSON.parse(content.value.toString())
			if (parsed && typeof parsed === 'object' && parsed.hooks && typeof parsed.hooks === 'object') {
				return parsed.hooks as HooksConfig
			}
		} catch { /* file missing / invalid — ignore */ }
		return {}
	}

	private _mergeConfigsInto(target: HooksConfig, src: HooksConfig) {
		for (const eventName of Object.keys(src) as HookEventName[]) {
			const matchers = src[eventName]
			if (!matchers || !Array.isArray(matchers)) continue
			target[eventName] = [...(target[eventName] ?? []), ...matchers]
		}
	}

	/** Replace `${CLAUDE_PLUGIN_ROOT}` with `pluginRoot` in a plugin's hook config's
	 *  command/args/env string values. Returns a new config; original untouched. */
	private _substitutePluginRoot(cfg: HooksConfig, pluginRoot: string): HooksConfig {
		const repl = (s: string | undefined): string | undefined =>
			s === undefined ? undefined : s.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot)
		const fixHook = (h: HookConfig): HookConfig => ({
			...h,
			command: repl(h.command),
			args: h.args?.map(repl) as string[] | undefined,
			env: h.env ? Object.fromEntries(Object.entries(h.env).map(([k, v]) => [k, repl(v) as string])) : h.env,
		})
		const out: HooksConfig = {}
		for (const eventName of Object.keys(cfg) as HookEventName[]) {
			const matchers = cfg[eventName]
			if (!matchers) continue
			out[eventName] = matchers.map(m => ({ matcher: m.matcher, hooks: (m.hooks ?? []).map(fixHook) }))
		}
		return out
	}

	private async _addSettingsFileWatchers() {
		const userHome = await this.pathService.userHome()
		const files = [
			URI.joinPath(userHome, this.productService.dataFolderName, 'settings.json'),
			URI.joinPath(userHome, '.claude', 'settings.json'),
		]
		const folder = this._resolveCwd()
		if (folder) {
			const rootUri = URI.file(folder)
			files.push(URI.joinPath(rootUri, '.a-coder', 'settings.json'))
			files.push(URI.joinPath(rootUri, '.claude', 'settings.json'))
		}
		for (const uri of files) {
			try { this._register(this.fileService.watch(uri)) } catch { /* file may not exist */ }
		}
		this._register(this.fileService.onDidFilesChange(async e => {
			if (files.some(u => e.contains(u))) await this._reassociateAndApplyUserHooks()
		}))
	}

	// ---------- public session API ----------

	setSessionHooks(config: HooksConfig): void {
		this._sessionHooks = config
		void this._reassociateAndApplyUserHooks()
	}
	clearSessionHooks(): void {
		this._sessionHooks = {}
		this._onceFired.clear()
		void this._reassociateAndApplyUserHooks()
	}

	setSessionGoal(condition: string): void {
		// Install a session-scoped prompt-type Stop hook that re-checks the condition
		// every time the agent would stop, forcing it to keep working until the model
		// judges the condition met (returns {ok:true}). This is the /goal mechanism.
		const goalPrompt =
			`You are a goal-verification judge. The user's goal is:\n\n${condition}\n\n` +
			`Decide whether the goal is fully met given the conversation so far. ` +
			`Reply ONLY with compact JSON: {"ok": true} when the goal is met, or ` +
			`{"ok": false, "reason": "<what still needs to be done>"} when it is not. ` +
			`Do not use any tools. $ARGUMENTS`
		this._sessionHooks = {
			...this._sessionHooks,
			Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: goalPrompt, timeout: 30 }] }],
		}
		this.state = { ...this.state, sessionGoal: condition }
		void this._reassociateAndApplyUserHooks()
	}

	clearSessionGoal(): void {
		if (this._sessionHooks.Stop) {
			const { Stop, ...rest } = this._sessionHooks
			this._sessionHooks = rest
		}
		this.state = { ...this.state, sessionGoal: undefined }
		void this._reassociateAndApplyUserHooks()
	}

	// ---------- dispatch ----------

	async fire(eventName: HookEventName, input: Partial<HookInput>): Promise<HookEventResult> {
		// Recursion guard: skip entirely while a prompt/agent hook is running.
		if (this._isRunningHook) return {}
		const matchers = this._aggregated[eventName]
		if (!matchers || matchers.length === 0) return {}

		const fullInput: HookInput = {
			session_id: this._sessionId,
			cwd: this._cwd,
			hook_event_name: eventName,
			permission_mode: this._permissionMode(),
			...input,
		}
		const keyField = MATCHER_KEY_OF_EVENT[eventName]
		const key = keyField ? (fullInput as any)[keyField] as string : undefined

		const isDecision = DECISION_EVENTS.has(eventName)
		const results: HookEventResult[] = []
		for (const matcher of matchers) {
			if (keyField && !matcherMatches(matcher.matcher, key ?? '')) continue
			for (const hook of matcher.hooks) {
				const onceKey = `${eventName}#${matcher.matcher ?? ''}#${hook.type}#${hook.command ?? hook.prompt ?? ''}`
				if (hook.once && this._onceFired.has(onceKey)) continue
				try {
					const res = await this._runHook(hook, fullInput)
					results.push(res)
					if (hook.once) this._onceFired.add(onceKey)
				} catch (err) {
					voidDevWarn(`[hooks] ${eventName} hook threw (non-blocking):`, err)
					// Non-blocking error: skip this hook's result.
				}
			}
		}
		return this._mergeResults(results, isDecision, eventName)
	}

	private _permissionMode(): HookInput['permission_mode'] {
		// Best-effort: A-Coder's autoApprove is per-tool, not a single mode. Map to
		// 'default' for v1; plugins that inspect this get a sensible value.
		return 'default'
	}

	private _mergeResults(results: HookEventResult[], isDecision: boolean, eventName: HookEventName): HookEventResult {
		if (results.length === 0) return {}
		const merged: HookEventResult = {}
		// additionalContext: concatenate all (side-effect events).
		const contexts: string[] = []
		// updatedInput / updatedToolOutput: last non-undefined wins (source order:
		// session, project, global, plugin — session first, so last-wins = plugin;
		// documented in the plan as last-write-wins within source order).
		let lastUpdatedInput: Record<string, unknown> | undefined
		let lastUpdatedToolOutput: string | undefined
		for (const r of results) {
			if (!r) continue
			if (r.additionalContext) contexts.push(r.additionalContext)
			if (r.updatedInput) lastUpdatedInput = r.updatedInput
			if (r.updatedToolOutput) lastUpdatedToolOutput = r.updatedToolOutput
			if (r.suppressOutput) merged.suppressOutput = true
		}
		if (contexts.length > 0) merged.additionalContext = contexts.join('\n\n')
		if (lastUpdatedInput) merged.updatedInput = lastUpdatedInput
		if (lastUpdatedToolOutput) merged.updatedToolOutput = lastUpdatedToolOutput

		if (eventName === 'Stop') {
			// Stop: any continue===false wins (keep working). The first such reason is
			// used as the poke message. Otherwise continue is left undefined (allow stop).
			for (const r of results) {
				if (r && r.continue === false) {
					merged.continue = false
					merged.reason = r.reason ?? 'A Stop hook requested the agent keep working.'
					return merged
				}
			}
			return merged
		}

		if (isDecision) {
			// First decisive decision wins: block > ask > allow.
			for (const r of results) {
				if (r && r.decision === 'block') {
					merged.decision = 'block'
					merged.reason = r.reason ?? 'Blocked by a hook.'
					return merged
				}
			}
			for (const r of results) {
				if (r && r.decision === 'ask') {
					merged.decision = 'ask'
					merged.reason = r.reason
					return merged
				}
			}
			merged.decision = 'allow'
			return merged
		}
		return merged
	}

	private async _runHook(hook: HookConfig, input: HookInput): Promise<HookEventResult> {
		if (hook.type === 'command') {
			return this._runCommandHook(hook, input)
		}
		// prompt + agent both execute via a subagent (prompt = no tools, agent = tools).
		// Set the recursion guard around the subagent run so its tool calls don't
		// re-enter the dispatcher.
		this._isRunningHook = true
		try {
			return await this._runSubagentHook(hook, input)
		} finally {
			this._isRunningHook = false
		}
	}

	private async _runCommandHook(hook: HookConfig, input: HookInput): Promise<HookEventResult> {
		if (!hook.command) return {}
		const timeout = hook.timeout ?? DEFAULT_HOOK_TIMEOUT.command
		try {
			const res = await this.channel.call<{ exitCode: number, stdout: string, stderr: string }>('runCommandHook', {
				command: hook.command,
				args: hook.args,
				env: hook.env,
				stdinJson: JSON.stringify(input),
				cwd: this._cwd || undefined,
				timeout,
			})
			if (res.exitCode === 2) {
				// Blocking error: stderr fed back as the block reason.
				return { decision: 'block', reason: res.stderr.trim() || 'Blocked by a command hook.' }
			}
			if (res.exitCode !== 0) {
				// Non-blocking error: log, continue.
				voidDevWarn(`[hooks] command hook non-zero exit ${res.exitCode}: ${res.stderr.split('\n')[0]}`)
				return {}
			}
			// Exit 0: parse stdout as JSON output (if present).
			return this._parseHookOutput(res.stdout)
		} catch (err) {
			voidDevWarn('[hooks] command hook failed (non-blocking):', err)
			return {}
		}
	}

	private async _runSubagentHook(hook: HookConfig, input: HookInput): Promise<HookEventResult> {
		if (!hook.prompt) return {}
		const subagentService = this.instantiationService.invokeFunction(accessor => accessor.get(ISubagentService))
		const prompt = hook.prompt.split('$ARGUMENTS').join(JSON.stringify(input, null, 2))
		const isAgent = hook.type === 'agent'
		try {
			const result = await subagentService.runSubagentSync({
				parentThreadId: null,
				description: isAgent
					? `Verify a ${input.hook_event_name} hook condition. ${hook.prompt}`
					: `Decide a ${input.hook_event_name} hook outcome. ${hook.prompt}`,
				subagentType: 'Explore',
				prompt: prompt,
				// prompt hooks: give the model a trivial tool so it tends to just answer;
				// agent hooks: let the Explore subagent use its read/search tools to verify.
				tools: isAgent ? undefined : ['read_file'],
				background: false,
				title: `hook:${input.hook_event_name}`,
			})
			return this._parseHookOutput(result.fullText)
		} catch (err) {
			voidDevWarn(`[hooks] ${hook.type} hook subagent failed (non-blocking):`, err)
			return {}
		}
	}

	/** Parse a hook's output text (command stdout or subagent final text) into a HookEventResult.
	 *  Tolerates ```json fences and surrounding prose; returns {} if no JSON is found. */
	private _parseHookOutput(text: string): HookEventResult {
		if (!text || text.trim().length === 0) return {}
		const trimmed = text.trim()
		// Try direct parse first.
		const direct = this._tryParseJson(trimmed)
		if (direct) return this._normalizeResult(direct)
		// Try extracting a ```json ... ``` fenced block.
		const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
		if (fenceMatch) {
			const fenced = this._tryParseJson(fenceMatch[1].trim())
			if (fenced) return this._normalizeResult(fenced)
		}
		// Try the first {...} blob in the text.
		const blobMatch = trimmed.match(/\{[\s\S]*\}/)
		if (blobMatch) {
			const blob = this._tryParseJson(blobMatch[0])
			if (blob) return this._normalizeResult(blob)
		}
		return {}
	}

	private _tryParseJson(s: string): any | undefined {
		try { return JSON.parse(s) } catch { return undefined }
	}

	/** Coerce a parsed JSON object into a HookEventResult, recognizing both
	 *  Claude Code's `hookSpecificOutput` / `decision` shapes and the simpler
	 *  `{ok, reason}` shape used by /goal prompt hooks. */
	private _normalizeResult(obj: any): HookEventResult {
		if (!obj || typeof obj !== 'object') return {}
		const out: HookEventResult = {}

		// Simple {ok, reason} form (used by prompt/agent verdicts including /goal).
		if (typeof obj.ok === 'boolean') {
			if (obj.ok === false) {
				// For Stop hooks, ok:false means "not yet met" → keep working.
				out.continue = false
				out.reason = typeof obj.reason === 'string' ? obj.reason : 'Goal not yet met.'
			}
			// ok:true → no decision / continue unchanged (allow stop).
			if (typeof obj.reason === 'string' && !out.reason) out.reason = obj.reason
			if (typeof obj.additionalContext === 'string') out.additionalContext = obj.additionalContext
			return out
		}

		if (typeof obj.decision === 'string' && (obj.decision === 'block' || obj.decision === 'allow' || obj.decision === 'ask')) {
			out.decision = obj.decision
		}
		if (typeof obj.reason === 'string') out.reason = obj.reason
		if (typeof obj.continue === 'boolean') out.continue = obj.continue
		if (typeof obj.suppressOutput === 'boolean') out.suppressOutput = obj.suppressOutput
		if (typeof obj.additionalContext === 'string') out.additionalContext = obj.additionalContext
		if (typeof obj.updatedToolOutput === 'string') out.updatedToolOutput = obj.updatedToolOutput
		if (obj.updatedInput && typeof obj.updatedInput === 'object') out.updatedInput = obj.updatedInput

		// Claude Code `hookSpecificOutput` wrapper.
		const hso = obj.hookSpecificOutput
		if (hso && typeof hso === 'object') {
			if (typeof hso.permissionDecision === 'string') {
				const d = hso.permissionDecision
				if (d === 'allow' || d === 'deny' || d === 'ask' || d === 'defer') {
					out.decision = d === 'deny' ? 'block' : (d === 'defer' ? 'ask' : (d === 'ask' ? 'ask' : 'allow'))
				}
			}
			if (typeof hso.permissionDecisionReason === 'string') out.reason = hso.permissionDecisionReason
			if (typeof hso.additionalContext === 'string') out.additionalContext = (out.additionalContext ?? '') + hso.additionalContext
			if (typeof hso.updatedToolOutput === 'string') out.updatedToolOutput = hso.updatedToolOutput
			if (hso.updatedInput && typeof hso.updatedInput === 'object') out.updatedInput = hso.updatedInput
		}
		return out
	}

	// ---------- convenience wrappers ----------

	async firePreToolUse(threadId: string, toolName: string, toolInput: Record<string, unknown>): Promise<HookEventResult> {
		return this.fire('PreToolUse', { tool_name: toolName, tool_input: toolInput, thread_id: threadId } as any)
	}
	async firePostToolUse(threadId: string, toolName: string, toolInput: Record<string, unknown>, toolResult: unknown, error?: string): Promise<HookEventResult> {
		return this.fire('PostToolUse', { tool_name: toolName, tool_input: toolInput, tool_result: toolResult, error, thread_id: threadId } as any)
	}
	async fireStop(threadId: string): Promise<HookEventResult> {
		return this.fire('Stop', { thread_id: threadId, turn: { reason: 'complete' } } as any)
	}
	async fireStopFailure(threadId: string, error: string): Promise<HookEventResult> {
		return this.fire('StopFailure', { thread_id: threadId, error } as any)
	}
	async fireUserPromptSubmit(threadId: string, prompt: string): Promise<HookEventResult> {
		return this.fire('UserPromptSubmit', { prompt, thread_id: threadId } as any)
	}
	async fireSessionStart(source: 'startup' | 'resume' | 'clear' | 'compact'): Promise<HookEventResult> {
		return this.fire('SessionStart', { source } as any)
	}
	async fireSubagentStart(subagentId: string, agentType: string): Promise<HookEventResult> {
		return this.fire('SubagentStart', { agent_id: subagentId, agent_type: agentType } as any)
	}
	async fireSubagentStop(subagentId: string, agentType: string, status: string): Promise<HookEventResult> {
		return this.fire('SubagentStop', { agent_id: subagentId, agent_type: agentType, status } as any)
	}
	async firePreCompact(threadId: string, transcript: unknown): Promise<HookEventResult> {
		return this.fire('PreCompact', { thread_id: threadId, transcript } as any)
	}
	async fireDiffZoneApply(diffid: number, uri: string): Promise<HookEventResult> {
		return this.fire('DiffZoneApply', { diffid, uri } as any)
	}
	async fireDiffZoneReject(diffid: number, uri: string): Promise<HookEventResult> {
		return this.fire('DiffZoneReject', { diffid, uri } as any)
	}
	async fireAutocompleteSuggest(uri: string, position: { line: number, character: number }, completions: unknown[]): Promise<HookEventResult> {
		return this.fire('AutocompleteSuggest', { uri, position, completions } as any)
	}
	async fireContextGather(snippets: string[]): Promise<HookEventResult> {
		return this.fire('ContextGather', { snippets } as any)
	}
	async fireModeSwitch(from: string, to: string): Promise<HookEventResult> {
		return this.fire('ModeSwitch', { from, to } as any)
	}
}

registerSingleton(IHookService, HookService, InstantiationType.Delayed)