/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js'
import { Emitter, Event } from '../../../../base/common/event.js'
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js'
import { generateUuid } from '../../../../base/common/uuid.js'
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js'

import { ILLMMessageService } from '../common/sendLLMMessageService.js'
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { RawToolCallObj, AnthropicReasoning } from '../common/sendLLMMessageTypes.js'
import { ModelSelection, FeatureName } from '../common/voidSettingsTypes.js'
import { BuiltinToolCallParams, BuiltinToolName, ToolName } from '../common/toolsServiceTypes.js'
import { isABuiltinToolName } from '../common/prompt/prompts.js'
import { voidDevLog, voidDevWarn } from '../common/devLog.js'
import { SubagentTypeName, SubagentType, getSubagentType, defaultSubagentType } from '../common/subagentTypes.js'
import { IMCPService } from '../common/mcpService.js'
import { IACPService } from '../common/acpService.js'
import { IComposioService } from '../common/composioService.js'
import { RawMCPToolCall } from '../common/mcpServiceTypes.js'
import { IHookService } from '../common/hookService.js'

import { IToolsService } from './toolsService.js'
import { IConvertToLLMMessageService, SimpleLLMMessage } from './convertToLLMMessageService.js'
import { analyzeParallelToolSafety } from './chatThreadService.js'

/**
 * SubagentService — runs focused sub-agents with isolated context, a custom
 * system prompt, and a restricted tool set, then returns their final text to the
 * parent. Mirrors the Task/subagent pattern used by closed-source coding agents.
 *
 * Cross-provider by construction: it goes through the unified `ILLMMessageService`
 * dispatch (every provider) and restricts tools via the `allowedTools` param that
 * is now threaded through the whole LLM transport, so the restricted set is
 * honoured for native tool defs (openai/anthropic/gemini) AND text tool
 * descriptions (xml/marker models).
 *
 * Two entry points:
 *  - `runSubagent`      : fire-and-forget (background task). Returns the id immediately.
 *  - `runSubagentSync`  : awaits the full result (foreground delegation, like the Task tool).
 */

export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface SubagentRun {
	id: string
	parentThreadId: string | null
	title: string
	subagentType: SubagentTypeName
	status: SubagentStatus
	isBackground: boolean
	allowedTools: string[]
	allowExternalTools: boolean
	modelSelection: ModelSelection | null
	extraPrompt: string | undefined
	simpleMessages: SimpleLLMMessage[]
	streamingText: string
	fullText: string
	reasoning: string
	error: string | undefined
	toolCallCount: number
	iterationCount: number
	maxIterations: number
	startedAt: number
	finishedAt: number | undefined
	requestId: string | undefined
	/** Human-readable description of the tool currently executing (live activity). */
	currentToolActivity: string | undefined
}

export interface RunSubagentOpts {
	parentThreadId: string | null
	description: string
	subagentType?: SubagentTypeName
	prompt?: string
	tools?: string[]
	background?: boolean
	allowExternalTools?: boolean
	title?: string
}

export interface SubagentResult {
	subagentId: string
	status: SubagentStatus
	fullText: string
	error: string | undefined
}

export const ISubagentService = createDecorator<ISubagentService>('voidSubagentService')

export interface ISubagentService {
	readonly _serviceBrand: undefined
	readonly onDidChangeSubagent: Event<string>
	readonly onDidCompleteSubagent: Event<string>
	runSubagent(opts: RunSubagentOpts): string
	runSubagentSync(opts: RunSubagentOpts): Promise<SubagentResult>
	cancel(subagentId: string): void
	cancelAllForThread(threadId: string): void
	getSubagent(subagentId: string): SubagentRun | undefined
	getSubagents(): SubagentRun[]
}

const SUBAGENT_MAX_ITERATIONS = 50
const SUBAGENT_FIRE_THROTTLE_MS = 80
// Use the Chat feature's model selection for subagents. Per-subagent model
// override is a planned enhancement — see TODO in runSubagent.
const SUBAGENT_FEATURE: FeatureName = 'Chat'

type TurnOutcome = {
	fullText: string
	fullReasoning: string
	anthropicReasoning: AnthropicReasoning[] | null
	toolCalls: RawToolCallObj[] | undefined
	error: string | undefined
	aborted: boolean
}

class SubagentService extends Disposable implements ISubagentService {

	readonly _serviceBrand: undefined

	private readonly _runs = new Map<string, SubagentRun>()
	private readonly _activeTokenSources = new Map<string, CancellationTokenSource>()

	private readonly _onDidChangeSubagent = this._register(new Emitter<string>())
	readonly onDidChangeSubagent: Event<string> = this._onDidChangeSubagent.event

	private readonly _onDidCompleteSubagent = this._register(new Emitter<string>())
	readonly onDidCompleteSubagent: Event<string> = this._onDidCompleteSubagent.event

	private readonly _lastFireAt = new Map<string, number>()

	// Lazy-resolved IToolsService (see constructor note). Cached on first access.
	private _toolsServiceImpl: IToolsService | undefined
	private get _toolsService(): IToolsService {
		if (!this._toolsServiceImpl) {
			this._toolsServiceImpl = this._instantiationService.invokeFunction(accessor => accessor.get(IToolsService))
		}
		return this._toolsServiceImpl
	}

	constructor(
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		// IToolsService is resolved lazily (see _toolsService getter) to break the
		// import cycle with toolsService.ts: toolsService imports ISubagentService
		// and subagentService imports IToolsService. If IToolsService were injected
		// via the @IToolsService decorator, the binding would be accessed at
		// class-definition time — before toolsService.ts finishes evaluating its
		// own `export const IToolsService = createDecorator(...)` (it sits below the
		// subagentService import), throwing "Cannot access 'IToolsService' before
		// initialization". Resolving at call time is safe: both singletons exist by
		// then, same pattern toolsService uses for ISubagentService.
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConvertToLLMMessageService private readonly _convertToLLMMessages: IConvertToLLMMessageService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IMCPService private readonly _mcpService: IMCPService,
		@IComposioService private readonly _composioService: IComposioService,
		@IACPService private readonly _acpService: IACPService,
		@IHookService private readonly _hookService: IHookService,
	) {
		super()
	}

	runSubagent(opts: RunSubagentOpts): string {
		const run = this._createRun(opts)
		voidDevLog(`[SubagentService] starting background subagent ${run.id} (${run.subagentType})`)
		// Fire-and-forget. Completion is surfaced via onDidCompleteSubagent + a
		// notification (background tasks aren't awaited by the caller).
		this._execute(run).catch(err => voidDevWarn('[SubagentService] background run threw:', err))
		return run.id
	}

	async runSubagentSync(opts: RunSubagentOpts): Promise<SubagentResult> {
		const run = this._createRun(opts)
		voidDevLog(`[SubagentService] starting foreground subagent ${run.id} (${run.subagentType})`)
		return this._execute(run)
	}

	cancel(subagentId: string): void {
		const run = this._runs.get(subagentId)
		if (!run) return
		if (run.status !== 'running' && run.status !== 'queued') return
		voidDevLog(`[SubagentService] cancelling ${subagentId}`)
		// Mark aborted so the loop stops between iterations / on the next callback.
		;(run as { aborted?: boolean }).aborted = true
		// Cancel any in-flight tool call.
		this._activeTokenSources.get(subagentId)?.cancel()
		// Abort the in-flight LLM stream (no-op if between requests).
		if (run.requestId) this._llmMessageService.abort(run.requestId)
		this._fire(run, true)
	}

	cancelAllForThread(threadId: string): void {
		for (const run of this._runs.values()) {
			if (run.parentThreadId === threadId && (run.status === 'running' || run.status === 'queued')) {
				this.cancel(run.id)
			}
		}
	}

	getSubagent(subagentId: string): SubagentRun | undefined {
		return this._runs.get(subagentId)
	}

	getSubagents(): SubagentRun[] {
		return Array.from(this._runs.values())
	}

	// ---------- internal ----------

	private _createRun(opts: RunSubagentOpts): SubagentRun {
		const subagentType: SubagentType = getSubagentType(opts.subagentType)
		// tools override must never include run_subagent (no nesting).
		const allowedTools = (opts.tools && opts.tools.length > 0 ? opts.tools : subagentType.tools)
			.filter(t => t !== 'run_subagent')

		// External tools (MCP/Composio/ACP) are opt-in: enabled per-call via the
		// run_subagent `allow_external_tools` param OR by the subagent type's
		// `allowExternalTools` default. They bypass the builtin name allowlist
		// (see availableTools) and are gated at execution time by the user's
		// autoApprove['MCP tools'] setting.
		const allowExternalTools = !!(opts.allowExternalTools ?? subagentType.allowExternalTools)

		const title = (opts.title && opts.title.trim().length > 0 ? opts.title : opts.description).slice(0, 120)
		const modelSelection: ModelSelection | null = this._settingsService.state.modelSelectionOfFeature[SUBAGENT_FEATURE] ?? null
		const maxIterations = Math.min(this._settingsService.state.globalSettings.maxAgentIterations ?? SUBAGENT_MAX_ITERATIONS, SUBAGENT_MAX_ITERATIONS)

		const run: SubagentRun = {
			id: generateUuid(),
			parentThreadId: opts.parentThreadId,
			title,
			subagentType: subagentType.name,
			status: 'queued',
			isBackground: !!opts.background,
			allowedTools,
			allowExternalTools,
			modelSelection,
			extraPrompt: opts.prompt,
			simpleMessages: [{ role: 'user', content: opts.description }],
			streamingText: '',
			fullText: '',
			reasoning: '',
			error: undefined,
			toolCallCount: 0,
			iterationCount: 0,
			maxIterations,
			startedAt: Date.now(),
			finishedAt: undefined,
			requestId: undefined,
			currentToolActivity: undefined,
		}
		this._runs.set(run.id, run)
		return run
	}

	private async _execute(run: SubagentRun): Promise<SubagentResult> {
		try {
			run.status = 'running'
			this._fire(run, true)

			// Fire SubagentStart hook (non-blocking; hooks can inject context or log).
			try {
				const ss = await this._hookService.fireSubagentStart(run.id, run.subagentType)
				if (ss.additionalContext && run.extraPrompt) {
					run.extraPrompt = `${run.extraPrompt}\n\n[hook context]\n${ss.additionalContext}`
				} else if (ss.additionalContext) {
					run.extraPrompt = `[hook context]\n${ss.additionalContext}`
				}
			} catch (err) {
				voidDevWarn('[hooks] SubagentStart fire threw (non-blocking):', err)
			}

			const modelSelection = run.modelSelection
			if (!modelSelection) {
				run.status = 'failed'
				run.error = 'No chat model configured. Add a provider in A-Coder IDE IDE Settings, then try again.'
				this._finish(run)
				return this._result(run)
			}

			const subagentType = getSubagentType(run.subagentType)
			const rolePrompt = run.extraPrompt
				? `${subagentType.prompt}\n\nAdditional instructions from the parent agent:\n${run.extraPrompt}`
				: subagentType.prompt
			const systemMessage = await this._convertToLLMMessages.buildSubagentSystemMessage({
				rolePrompt,
				modelSelection,
				allowedTools: run.allowedTools,
				allowExternalTools: run.allowExternalTools,
			})

			while (run.iterationCount < run.maxIterations) {
				if (this._isAborted(run)) { run.status = 'cancelled'; break }
				run.iterationCount++

				const { messages, separateSystemMessage } = this._convertToLLMMessages.prepareLLMSimpleMessages({
					simpleMessages: run.simpleMessages,
					systemMessage,
					modelSelection,
					featureName: SUBAGENT_FEATURE,
				})

				const turn = await this._sendOneTurn(run, messages, separateSystemMessage, modelSelection)
				if (this._isAborted(run)) { run.status = 'cancelled'; break }
				if (turn.aborted) { run.status = 'cancelled'; break }
				if (turn.error) { run.status = 'failed'; run.error = turn.error; break }

				// Append the assistant turn to the transcript. The conversion service
				// turns (assistant text + following tool messages) into the provider's
				// native tool_calls/tool_use structure on the next prepare call.
				run.simpleMessages.push({
					role: 'assistant',
					content: turn.fullText,
					reasoning: turn.fullReasoning,
					anthropicReasoning: turn.anthropicReasoning,
				})
				run.fullText = turn.fullText
				run.streamingText = turn.fullText
				run.reasoning = turn.fullReasoning

				if (!turn.toolCalls || turn.toolCalls.length === 0) {
					run.status = 'completed'
					break
				}

				// Execute tool calls sequentially (v1). Each is gated by the allowlist.
				const toolMessages = await this._executeToolCalls(run, turn.toolCalls)
				if (this._isAborted(run)) { run.status = 'cancelled'; break }
				for (const tm of toolMessages) run.simpleMessages.push(tm)
				run.toolCallCount += toolMessages.length
				this._fire(run, true)
			}

			if (run.status === 'running') {
				// Reached the iteration cap. Return the last assistant text rather than
				// hard-failing — the partial work is usually still useful to the parent.
				voidDevWarn(`[SubagentService] ${run.id} reached max iterations (${run.maxIterations})`)
				run.status = 'completed'
			}
		} catch (err) {
			run.status = 'failed'
			run.error = err instanceof Error ? err.message : String(err)
			voidDevWarn('[SubagentService] run threw:', err)
		}
		this._finish(run)
		return this._result(run)
	}

	private _sendOneTurn(run: SubagentRun, messages: ReturnType<IConvertToLLMMessageService['prepareLLMSimpleMessages']>['messages'], separateSystemMessage: string | undefined, modelSelection: ModelSelection): Promise<TurnOutcome> {
		return new Promise<TurnOutcome>(resolve => {
			let settled = false
			const finish = (o: TurnOutcome) => { if (!settled) { settled = true; resolve(o) } }

			const requestId = this._llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				messages,
				separateSystemMessage,
				chatMode: 'code',
				allowedTools: run.allowedTools,
				allowExternalTools: run.allowExternalTools,
				modelSelection,
				modelSelectionOptions: undefined,
				overridesOfModel: undefined,
				logging: { loggingName: 'Subagent', loggingExtras: { subagentType: run.subagentType } },
				onText: (p) => {
					if (this._isAborted(run)) return
					run.streamingText = p.fullText
					run.reasoning = p.fullReasoning
					this._fire(run)
				},
				onFinalMessage: (p) => {
					finish({
						fullText: p.fullText,
						fullReasoning: p.fullReasoning,
						anthropicReasoning: p.anthropicReasoning,
						toolCalls: p.toolCalls,
						error: undefined,
						aborted: false,
					})
				},
				onError: (p) => {
					finish({
						fullText: run.streamingText,
						fullReasoning: '',
						anthropicReasoning: null,
						toolCalls: [],
						error: p.message,
						aborted: false,
					})
				},
				onAbort: () => {
					(run as { aborted?: boolean }).aborted = true
					finish({
						fullText: run.streamingText,
						fullReasoning: '',
						anthropicReasoning: null,
						toolCalls: [],
						error: undefined,
						aborted: true,
					})
				},
			})

			if (!requestId) {
				finish({
					fullText: run.streamingText,
					fullReasoning: '',
					anthropicReasoning: null,
					toolCalls: [],
					error: 'Failed to start the LLM request (no model/provider configured?).',
					aborted: false,
				})
			} else {
				run.requestId = requestId
			}
		})
	}

	private async _executeToolCalls(run: SubagentRun, toolCalls: RawToolCallObj[]): Promise<SimpleLLMMessage[]> {
		const cts = new CancellationTokenSource()
		this._activeTokenSources.set(run.id, cts)
		const out: SimpleLLMMessage[] = []
		try {
			if (this._isAborted(run)) return out

			// Mirror the main agent's dynamic parallel-safety analysis (reusing the
			// exact same function exported from chatThreadService). Read-only builtin
			// tools run concurrently; write/terminal/unknown tools — including ALL
			// external (MCP/Composio/ACP) tools, which aren't in the safety sets — run
			// sequentially. Subagents auto-execute tools without per-tool approval,
			// so unlike the main agent there's no approval re-filter here.
			const { parallelSafe, sequential } = analyzeParallelToolSafety(toolCalls)
			const allToolCalls = [...parallelSafe, ...sequential]
			run.currentToolActivity = `Executing ${allToolCalls.length} tool${allToolCalls.length === 1 ? '' : 's'}…`
			this._fire(run, true)

			if (parallelSafe.length > 1) {
				voidDevLog(`[Subagent ${run.id}] running ${parallelSafe.length} tools in parallel: ${parallelSafe.map(t => t.name).join(', ')}`)
				const results = await Promise.all(
					parallelSafe.map(tc => this._executeOneTool(run, tc, cts.token))
				)
				for (const r of results) {
					if (this._isAborted(run)) break
					out.push(r)
				}
			} else if (parallelSafe.length === 1) {
				out.push(await this._executeOneTool(run, parallelSafe[0], cts.token))
			}

			for (const tc of sequential) {
				if (this._isAborted(run)) break
				out.push(await this._executeOneTool(run, tc, cts.token))
			}
		} finally {
			run.currentToolActivity = undefined
			this._activeTokenSources.delete(run.id)
			cts.dispose()
		}
		return out
	}

	private async _executeOneTool(run: SubagentRun, tc: RawToolCallObj, token: CancellationToken): Promise<SimpleLLMMessage> {
		const name = tc.name as string
		const baseTool: SimpleLLMMessage = {
			role: 'tool',
			content: '',
			id: tc.id,
			name: name as ToolName,
			rawParams: tc.rawParams,
			thought_signature: tc.thought_signature,
		}

		if (this._isAborted(run)) {
			return { ...baseTool, content: 'Subagent was cancelled before this tool ran.' }
		}

		const isBuiltin = isABuiltinToolName(name)

		// Builtin tools must be in the subagent's allowlist.
		if (isBuiltin && !run.allowedTools.includes(name)) {
			return { ...baseTool, content: `Tool "${name}" is not available to this subagent. Use only the tools you were given, and do not attempt to spawn subagents.` }
		}

		// External tools (MCP/Composio/ACP) require the run to have opted in.
		if (!isBuiltin && !run.allowExternalTools) {
			return { ...baseTool, content: `Tool "${name}" is not available to this subagent. External tools (MCP/Composio/ACP) are not enabled for this run.` }
		}

		// External tools are gated by the user's "MCP tools" auto-approve setting.
		// Subagents have no UI to prompt for per-call approval, so if the user hasn't
		// auto-approved external tools we refuse rather than run them autonomously.
		if (!isBuiltin && !this._externalToolsAutoApproved()) {
			return { ...baseTool, content: `Tool "${name}" requires approval. Enable "MCP tools" auto-approval in A-Coder IDE IDE Settings to let subagents run external tools autonomously.` }
		}

		if (isBuiltin) {
			return this._executeBuiltinTool(run, tc, name as BuiltinToolName, token, baseTool)
		}
		return this._executeExternalTool(run, tc, name, baseTool)
	}

	private async _executeBuiltinTool(run: SubagentRun, tc: RawToolCallObj, builtinName: BuiltinToolName, token: CancellationToken, baseTool: SimpleLLMMessage): Promise<SimpleLLMMessage> {
		let validated: BuiltinToolCallParams[BuiltinToolName]
		try {
			// Indexed access on a union-keyed map — the cast mirrors chatThreadService's
			// _runToolCall, which uses the same pattern for builtin tool dispatch.
			validated = this._toolsService.validateParams[builtinName](tc.rawParams) as BuiltinToolCallParams[BuiltinToolName]
		} catch (e) {
			return { ...baseTool, content: `Invalid parameters for ${builtinName}: ${e instanceof Error ? e.message : String(e)}` }
		}

		try {
			run.currentToolActivity = `Running ${builtinName}…`
			this._fire(run)

			// PreToolUse: block prevents the call (reason fed back as the tool result);
			// updatedInput rewrites the params. ask is treated as allow for v1.
			// The recursion guard in HookService prevents re-entry from this hook's
			// own internal tool calls.
			let preContext: string | undefined
			{
				const pre = await this._hookService.firePreToolUse(run.id, builtinName, validated as Record<string, unknown>)
				if (pre.decision === 'block') {
					return { ...baseTool, content: pre.reason || `Tool ${builtinName} was blocked by a PreToolUse hook.` }
				}
				if (pre.updatedInput && typeof pre.updatedInput === 'object') {
					validated = { ...(validated as object), ...pre.updatedInput } as BuiltinToolCallParams[BuiltinToolName]
				}
				if (pre.additionalContext) preContext = pre.additionalContext
			}

			const { result } = await this._toolsService.callTool[builtinName](validated as any, {
				threadId: run.id,
				cancellationToken: token,
				onData: (data) => {
					run.currentToolActivity = `${builtinName}: ${data}`
					this._fire(run)
					voidDevLog(`[Subagent ${run.id}] ${builtinName}: ${data}`)
				},
			})
			const resolved = await result
			let resultStr = this._toolsService.stringOfResult[builtinName](validated as any, resolved as any)
			// PostToolUse: updatedToolOutput replaces the result string; additionalContext appended.
			try {
				const post = await this._hookService.firePostToolUse(run.id, builtinName, validated as Record<string, unknown>, resultStr)
				if (post.updatedToolOutput) resultStr = post.updatedToolOutput
				if (post.additionalContext) resultStr = `${resultStr}\n\n${post.additionalContext}`
			} catch (err) {
				voidDevWarn('[hooks] PostToolUse fire threw (non-blocking):', err)
			}
			if (preContext) resultStr = `${resultStr}\n\n${preContext}`
			return { ...baseTool, content: resultStr }
		} catch (e) {
			return { ...baseTool, content: `Tool ${builtinName} failed: ${e instanceof Error ? e.message : String(e)}` }
		}
	}

	private async _executeExternalTool(run: SubagentRun, tc: RawToolCallObj, name: string, baseTool: SimpleLLMMessage): Promise<SimpleLLMMessage> {
		// External tools use the raw params as-is (no validateParams), mirroring
		// chatThreadService._runToolCall's non-builtin branch.
		let toolParams = tc.rawParams
		const mcpServerName = this._computeMCPServerOfToolName(name)

		try {
			run.currentToolActivity = `Running ${name}…`
			this._fire(run)

			// PreToolUse: block prevents the call; updatedInput rewrites the params.
			// ask is treated as allow for v1. Recursion guard is in HookService.
			let preContext: string | undefined
			{
				const pre = await this._hookService.firePreToolUse(run.id, name, toolParams as Record<string, unknown>)
				if (pre.decision === 'block') {
					return { ...baseTool, content: pre.reason || `Tool ${name} was blocked by a PreToolUse hook.` }
				}
				if (pre.updatedInput && typeof pre.updatedInput === 'object') {
					toolParams = { ...(toolParams as object), ...pre.updatedInput } as typeof toolParams
				}
				if (pre.additionalContext) preContext = pre.additionalContext
			}

			let content: string
			if (mcpServerName === 'composio_tool_router') {
				const sessionId = this._composioService.getSessionId()
				if (!sessionId) {
					return { ...baseTool, content: 'Composio session not initialized. Ensure your Composio API key is configured.' }
				}
				const response = await this._composioService.executeToolViaSession(
					sessionId,
					this._composioService.getComposioSlug(name),
					toolParams as Record<string, unknown>
				)
				if (!response.successful) {
					return { ...baseTool, content: `Composio tool "${name}" failed: ${response.error || 'unknown error'}` }
				}
				content = this._stringifyComposioResult(response.data)
			} else if (mcpServerName === 'acp_agent_router') {
				const acpTool = this._acpService.getACPAgents()?.find(t => t.name === name)
				if (!acpTool || !acpTool.acpServerName || !acpTool.acpAgentName) {
					return { ...baseTool, content: `ACP agent "${name}" not found or is missing server/agent info.` }
				}
				const input = (toolParams as { input?: string }).input ?? ''
				const acpResult = (await this._acpService.callACPAgent({
					serverName: acpTool.acpServerName,
					agentName: acpTool.acpAgentName,
					input,
				})).result
				content = this._acpService.stringifyResult(acpResult)
			} else if (mcpServerName) {
				const mcpTool = this._mcpService.getMCPTools()?.find(t => t.name === name)
				if (!mcpTool || !mcpTool.mcpServerName) {
					return { ...baseTool, content: `MCP tool "${name}" not found or has no server name.` }
				}
				const mcpResult = (await this._mcpService.callMCPTool({
					serverName: mcpTool.mcpServerName,
					toolName: name,
					params: toolParams,
				})).result
				content = this._mcpService.stringifyResult(mcpResult as RawMCPToolCall)
			} else {
				return { ...baseTool, content: `Tool "${name}" is not a recognized builtin or external tool.` }
			}

			// PostToolUse: updatedToolOutput replaces the result string; additionalContext appended.
			try {
				const post = await this._hookService.firePostToolUse(run.id, name, toolParams as Record<string, unknown>, content)
				if (post.updatedToolOutput) content = post.updatedToolOutput
				if (post.additionalContext) content = `${content}\n\n${post.additionalContext}`
			} catch (err) {
				voidDevWarn('[hooks] PostToolUse fire threw (non-blocking):', err)
			}
			if (preContext) content = `${content}\n\n${preContext}`
			return { ...baseTool, content }
		} catch (e) {
			return { ...baseTool, content: `Tool ${name} failed: ${e instanceof Error ? e.message : String(e)}` }
		}
	}

	// Mirrors chatThreadService._computeMCPServerOfToolName: routes a tool name
	// to composio / acp / mcp, or undefined if it isn't an external tool.
	private _computeMCPServerOfToolName = (toolName: string): string | undefined => {
		if (this._composioService.isComposioTool(toolName)) return 'composio_tool_router'
		const acpTool = this._acpService.getACPAgents()?.find(t => t.name === toolName)
		if (acpTool) return 'acp_agent_router'
		return this._mcpService.getMCPTools()?.find(t => t.name === toolName)?.mcpServerName
	}

	private _externalToolsAutoApproved = (): boolean => {
		return !!this._settingsService.state.globalSettings.autoApprove['MCP tools']
	}

	private _stringifyComposioResult = (data: unknown): string => {
		if (data === null || data === undefined) return 'Tool executed successfully with no output.'
		if (typeof data === 'string') return data
		try { return JSON.stringify(data, null, 2) } catch { return String(data) }
	}

	private _isAborted(run: SubagentRun): boolean {
		return !!(run as { aborted?: boolean }).aborted
	}

	private _finish(run: SubagentRun): void {
		run.finishedAt = Date.now()
		if (run.status === 'running') run.status = 'completed' // defensive
		this._fire(run, true)
		// Fire SubagentStop hook (fire-and-forget; non-blocking).
		this._hookService.fireSubagentStop(run.id, run.subagentType, run.status).catch(err => voidDevWarn('[hooks] SubagentStop fire threw (non-blocking):', err))
		this._onDidCompleteSubagent.fire(run.id)

		// Background tasks surface a notification when they end (foreground tasks
		// are awaited by the parent tool call, so the parent surfaces the result).
		if (run.isBackground && (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled')) {
			const label = run.status === 'completed' ? 'completed'
				: run.status === 'cancelled' ? 'cancelled'
				: 'failed'
			const preview = (run.fullText || run.error || '').slice(0, 200)
			this._notificationService.notify({
				message: `Subagent “${run.title}” ${label}.`,
				severity: run.status === 'failed' ? Severity.Error : Severity.Info,
			})
			voidDevLog(`[SubagentService] background ${run.id} ${label}: ${preview}`)
		}
	}

	private _result(run: SubagentRun): SubagentResult {
		return { subagentId: run.id, status: run.status, fullText: run.fullText, error: run.error }
	}

	private _fire(run: SubagentRun, force = false): void {
		if (!force) {
			const last = this._lastFireAt.get(run.id) ?? 0
			if (Date.now() - last < SUBAGENT_FIRE_THROTTLE_MS) return
		}
		this._lastFireAt.set(run.id, Date.now())
		this._onDidChangeSubagent.fire(run.id)
	}
}

registerSingleton(ISubagentService, SubagentService, InstantiationType.Delayed)

// Re-exported so the run_subagent tool handler and the UI can import the types
// from a single place.
export { defaultSubagentType }
export type { SubagentType }