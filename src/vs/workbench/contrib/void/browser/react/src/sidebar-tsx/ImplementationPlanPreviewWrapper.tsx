/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react'
import { useAccessor } from '../util/services.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { ToolName } from '../../../../common/toolsServiceTypes.js'
import { ToolMessage, isToolMessage } from '../../../../common/chatThreadServiceTypes.js'
import { WrapperProps } from './ToolResultHelpers.js'

type ImplementationPlanStep = {
	status?: string;
	title?: string;
	description?: string;
	files?: string[];
	notes?: string;
}
type ImplementationPlanResult = {
	planId?: string;
	summary?: string;
	steps?: ImplementationPlanStep[];
	details?: string;
	createdAt?: number;
	updatedAt?: number;
	error?: string;
}

type ImplementationPlanPreviewWrapperProps = WrapperProps<ToolName>

const ImplementationPlanPreviewWrapper: React.FC<ImplementationPlanPreviewWrapperProps> = ({
	toolMessage,
	messageIdx,
	threadId
}) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const agentManagerService = accessor.get('IAgentManagerService')
	const voidSettingsService = accessor.get('IVoidSettingsService')

	const [refreshKey, setRefreshKey] = useState(0)
	const [latestPlan, setLatestPlan] = useState(toolMessage)
	const [isExpanded, setIsExpanded] = useState(true)
	const [isApproving, setIsApproving] = useState(false)

	// Check for newer implementation plan updates in this thread
	useEffect(() => {
		const checkForUpdates = () => {
			if (!chatThreadsService) return
			const thread = chatThreadsService.state.allThreads[threadId]
			if (!thread) return

			const messages = thread.messages || []
			// Filter for tool messages with implementation plan names
			const planMessages = messages.filter((m): m is ToolMessage<ToolName> & { name: 'create_implementation_plan' | 'preview_implementation_plan' | 'update_implementation_step' | 'get_implementation_status' } =>
				isToolMessage(m) && (
					m.name === 'create_implementation_plan' ||
					m.name === 'preview_implementation_plan' ||
					m.name === 'update_implementation_step' ||
					m.name === 'get_implementation_status'
				)
			)
			const latest = planMessages[planMessages.length - 1] as typeof toolMessage | undefined

			if (latest && latest.id !== toolMessage.id) {
				setLatestPlan(latest)
				setRefreshKey(prev => prev + 1)
			}
		}

		// Check on mount and when messages change
		checkForUpdates()
	}, [threadId, toolMessage.id, chatThreadsService, chatThreadsService?.state?.allThreads?.[threadId]?.messages?.length])

	const planResult = latestPlan.result as ImplementationPlanResult
	if (!planResult) {
		return (
			<div className="implementation-plan-result w-full rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-2 shadow-sm">
				<div className="flex items-center gap-2 px-3 py-2">
					<div
						className="w-3 h-3 border-2 rounded-full border-void-accent"
						style={{
							borderTopColor: 'transparent',
							animation: 'spin 0.8s linear infinite'
						}}
					/>
					<span className="text-void-fg-3 text-sm">Preparing implementation plan...</span>
				</div>
			</div>
		)
	}

	// Extract plan information
	const getPlanInfo = () => {
		switch (toolMessage.name) {
			case 'create_implementation_plan':
				return {
					title: 'Implementation Plan Created',
					summary: planResult.summary || 'Plan created successfully',
					planId: planResult.planId,
					canApprove: true
				}
			case 'preview_implementation_plan':
				return {
					title: 'Implementation Plan Preview',
					summary: planResult.summary || 'Plan preview',
					planId: planResult.planId,
					canApprove: planResult.planId && planResult.planId !== ''
				}
			case 'update_implementation_step':
				return {
					title: 'Implementation Step Updated',
					summary: planResult.summary || 'Step updated',
					planId: '',
					canApprove: false
				}
			case 'get_implementation_status':
				return {
					title: 'Implementation Status',
					summary: planResult.summary || 'Plan status',
					planId: '',
					canApprove: false
				}
			default:
				return {
					title: 'Implementation Plan',
					summary: planResult.summary || 'Operation completed',
					planId: planResult.planId || '',
					canApprove: false
				}
		}
	}

	const planInfo = getPlanInfo()
	const isSuccess = planResult && !planResult.error

	const getToolIcon = () => {
		switch (toolMessage.name) {
			case 'create_implementation_plan': return '\u{1F4CB}'
			case 'preview_implementation_plan': return '👁️'
			case 'update_implementation_step': return '\u{2705}'
			case 'get_implementation_status': return '\u{1F4CA}'
			default: return '\u{1F3AF}'
		}
	}

	const getActionColor = () => {
		switch (toolMessage.name) {
			case 'create_implementation_plan': return 'text-void-info'
			case 'preview_implementation_plan': return 'text-void-accent'
			case 'update_implementation_step': return 'text-void-warning'
			case 'get_implementation_status': return 'text-void-orange'
			default: return 'text-void-fg-1'
		}
	}

	const handleApprove = async () => {
		// Approve implementation plan and trigger execution

		if (!planInfo.planId || isApproving) {
			return
		}

		setIsApproving(true)
		try {
			// Approve the plan. The service marks it approved AND auto-promotes
			// its steps into a todo list on the shared PlanningService, so the
			// agent can execute via update_todo without re-creating the steps.
			// Non-blocking on failure: a missing plan (e.g. after restart) must
			// not break the approve-and-send flow.
			if (agentManagerService?.approveImplementationPlan && threadId) {
				try {
					agentManagerService.approveImplementationPlan(threadId)
				} catch (approveError) {
					console.warn('[ImplementationPlanPreview] approveImplementationPlan failed (non-blocking):', approveError)
				}
			}

			// Switch to Code mode (agent) for execution
			if (voidSettingsService?.setGlobalSetting) {
				voidSettingsService.setGlobalSetting('chatMode', 'code')
			}

			// The plan steps were auto-converted to a todo list on approval, so tell
			const approvalMessage = `The implementation plan (ID: ${planInfo.planId}) has been approved for execution. Its steps have already been converted into a todo list — do NOT call create_todo again (call get_todos to see the queued tasks).

**Instructions:**
1. Execute each task in order, using \`update_todo\` to track progress: mark the task \`in_progress\` when you start it and \`complete\` when it's done
2. For each task: read the relevant files, make the necessary changes, and verify they work
3. Continue until all tasks are complete — do not stop to ask for confirmation between steps

Please begin execution now.`

			await chatThreadsService.addUserMessageAndStreamResponse({
				threadId,
				userMessage: approvalMessage
			})
		} catch (error) {
			console.error('[ImplementationPlanPreview] Failed to approve implementation plan:', error)
		} finally {
			setIsApproving(false)
		}
	}

	const handleRequestChanges = async () => {
		if (!planInfo.planId) return

		try {
			// Get settings service to ensure we stay in Plan mode for revisions
			const voidSettingsService = accessor.get('IVoidSettingsService')

			// Stay in Plan mode (gather) for revisions - don't switch to agent
			if (voidSettingsService?.setGlobalSetting) {
				await voidSettingsService.setGlobalSetting('chatMode', 'plan')
			}

			// Send change request message to chat
			const changeMessage = `I would like to request changes to the implementation plan (ID: ${planInfo.planId}).

Please revise the plan based on my feedback. After making changes, use \`preview_implementation_plan\` to show me the updated plan for review.

My requested changes:`

			await chatThreadsService.addUserMessageAndStreamResponse({
				threadId,
				userMessage: changeMessage
			})
		} catch (error) {
			console.error('Failed to request plan changes:', error)
		}
	}

	const handleOpenPreview = async () => {
		if (!agentManagerService) {
			console.error('AgentManagerService not available')
			return
		}

		try {
			// Format the plan as markdown for preview
			const planMarkdown = formatPlanAsMarkdown()

			// Use the content preview to display the implementation plan
			// The service will open a React render tab
			await agentManagerService.openContentPreview(
				`Implementation Plan: ${planInfo.planId || 'New Plan'}`,
				planMarkdown,
				{
					isImplementationPlan: true,
					planId: planInfo.planId,
					threadId: threadId
				}
			)
		} catch (error) {
			console.error('Failed to open plan preview:', error)
		}
	}

	const formatPlanAsMarkdown = () => {
		let markdown = `# ${planInfo.title}\n\n`

		if (planInfo.planId) {
			markdown += `> **Plan ID:** \`${planInfo.planId}\`\n\n`
		}

		// Add steps if available - with visual progress
		if (planResult.steps && Array.isArray(planResult.steps)) {
			const completedCount = planResult.steps.filter((s) => s.status === 'completed').length
			const totalCount = planResult.steps.length

			markdown += `## \u{1F4CB} Steps (${completedCount}/${totalCount} complete)\n\n`

			planResult.steps.forEach((step, index: number) => {
				const status = step.status || 'pending'
				const statusIcon = status === 'completed' ? '\u{2705}' : status === 'in_progress' ? '\u{1F504}' : status === 'failed' ? '\u{274C}' : '\u{2B1C}'
				const statusBadge = status === 'completed' ? ' *(completed)*' :
					status === 'in_progress' ? ' *(in progress)*' :
					status === 'failed' ? ' *(failed)*' : ''

				markdown += `### ${statusIcon} Step ${index + 1}: ${step.title || step.description || 'Untitled Step'}${statusBadge}\n\n`

				if (step.description && step.title) {
					markdown += `${step.description}\n\n`
				}

				// Add any step-specific details
				if (step.files && Array.isArray(step.files) && step.files.length > 0) {
					markdown += `**Files involved:**\n`
					step.files.forEach((file: string) => {
						markdown += `- \`${file}\`\n`
					})
					markdown += '\n'
				}

				if (step.notes) {
					markdown += `> \u{1F4A1} ${step.notes}\n\n`
				}
			})
		}

		// Add summary section
		if (planInfo.summary) {
			markdown += `---\n\n## Summary\n\n${planInfo.summary}\n\n`
		}

		// Add any additional details
		if (planResult.details) {
			markdown += `## Additional Details\n\n${planResult.details}\n\n`
		}

		// Add timestamps if available
		if (planResult.createdAt || planResult.updatedAt) {
			markdown += `---\n\n`
			if (planResult.createdAt) {
				markdown += `*Created: ${new Date(planResult.createdAt).toLocaleString()}*\n`
			}
			if (planResult.updatedAt) {
				markdown += `*Last updated: ${new Date(planResult.updatedAt).toLocaleString()}*\n`
			}
		}

		return markdown
	}

	return (
		<div className="@@void-scope">
			<div className="implementation-plan-preview border border-void-border-2 rounded-lg overflow-hidden shadow-sm bg-void-bg-4">
				{/* Header */}
				<div
					className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-void-bg-4-hover transition-colors border-b border-void-border-2 bg-void-bg-3"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<div className="flex items-center gap-2 min-w-0 flex-1">
					<svg
						className={`w-4 h-4 text-void-fg-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
					<span className={`text-lg ${getActionColor()} flex-shrink-0`}>{getToolIcon()}</span>
					<div className="min-w-0 flex-1">
						<div className="font-medium text-void-fg-1 truncate">
							{planInfo.title}
						</div>
						<div className="text-xs text-void-fg-4 truncate">
							{isSuccess ? 'Operation completed successfully' : 'Operation failed'}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{isSuccess && (
						<div className="px-2 py-1 bg-void-success/15 text-void-success border border-void-success/30 rounded-md text-xs font-medium">
							Success
						</div>
					)}
					<button
						onClick={(e) => {
							e.stopPropagation()
							handleOpenPreview()
						}}
						className="px-2 py-1 bg-void-bg-3 hover:bg-void-bg-4 text-void-fg-2 border border-void-border-2 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
						title="Open in preview"
					>
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
						</svg>
						Open
					</button>
				</div>
			</div>

			{/* Collapsible Content */}
			{isExpanded && (
				<div className="border-t border-void-border-2 max-h-[800px] overflow-auto">
					{/* Plan Content */}
					<div className="p-3">
						{/* Render steps if available */}
						{planResult.steps && Array.isArray(planResult.steps) && planResult.steps.length > 0 && (
							<div className="mb-4">
								<div className="text-sm font-medium text-void-fg-2 mb-2">Steps:</div>
								<div className="space-y-2">
									{planResult.steps.map((step, index: number) => {
										const status = step.status || 'pending'
										const statusIcon = status === 'completed' ? '\u{2705}' : status === 'in_progress' ? '\u{1F504}' : status === 'failed' ? '\u{274C}' : '\u{2B1C}'
										const statusColor = status === 'completed' ? 'text-void-success' : status === 'in_progress' ? 'text-void-info' : status === 'failed' ? 'text-void-error' : 'text-void-fg-3'

										return (
											<div key={index} className="flex items-start gap-3 p-2 bg-void-bg-3 rounded-md border border-void-border-2">
												<div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
													<span className={statusColor}>{statusIcon}</span>
												</div>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<span className="text-xs text-void-fg-4 font-mono">Step {index + 1}</span>
														{status !== 'pending' && (
															<span className={`text-xs px-1.5 py-0.5 rounded ${
																status === 'completed' ? 'bg-void-success/15 text-void-success' :
																status === 'in_progress' ? 'bg-void-info/15 text-void-info' :
																status === 'failed' ? 'bg-void-error/15 text-void-error' :
																'bg-void-bg-2 text-void-fg-4'
															}`}>
																{status}
															</span>
														)}
													</div>
													<div className="text-sm text-void-fg-1 mt-1">
														{step.title || step.description || `Step ${index + 1}`}
													</div>
													{step.description && step.title && (
														<div className="text-xs text-void-fg-3 mt-1">
															{step.description}
														</div>
													)}
												</div>
											</div>
										)
									})}
								</div>
							</div>
						)}

						{/* Render summary with markdown */}
						{planInfo.summary && (
							<div className="mb-3 max-w-none">
								<ChatMarkdownRender
									string={planInfo.summary}
									chatMessageLocation={{ threadId, messageIdx }}
									isApplyEnabled={false}
									isLinkDetectionEnabled={true}
								/>
							</div>
						)}

						{planInfo.planId && (
							<div className="text-xs text-void-fg-4 mb-3 font-mono bg-void-bg-1 px-2 py-1 rounded inline-block">
								Plan ID: {planInfo.planId}
							</div>
						)}
					</div>

					{/* Action Buttons */}
					{planInfo.canApprove && isSuccess && (
						<div className="border-t border-void-border-2 p-3">
							<div className="flex items-center gap-2 mb-2">
								<span className="text-sm font-medium text-void-fg-2">Plan Actions:</span>
							</div>
							<div className="flex gap-2">
								<button
									onClick={handleApprove}
									disabled={isApproving}
									className="px-3 py-1.5 bg-void-accent hover:bg-void-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
								>
									{isApproving ? (
										<>
											<svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
												<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
												<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
											</svg>
											Approving...
										</>
									) : (
										<>
											{'\u{2705}'} Approve Plan
										</>
									)}
								</button>
								<button
									onClick={handleRequestChanges}
									className="px-3 py-1.5 bg-void-warning hover:bg-void-warning-hover text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
								>
									{'\u{270F}\u{FE0F}'} Request Changes
								</button>
							</div>
							<div className="text-xs text-void-fg-4 mt-2 italic opacity-70">
								Approve to begin execution, or request changes to modify the plan.
							</div>
						</div>
					)}
				</div>
			)}
			</div>
		</div>
	)
}

export default ImplementationPlanPreviewWrapper
