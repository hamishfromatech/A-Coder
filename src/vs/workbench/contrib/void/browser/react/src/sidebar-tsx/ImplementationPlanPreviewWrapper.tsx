/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react'
import { useAccessor } from '../util/services.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { ToolName } from '../../../../common/toolsServiceTypes.js'

interface ImplementationPlanPreviewWrapperProps {
	toolMessage: {
		name: ToolName
		params: any
		content: string
		result?: any
		id: string
	}
	messageIdx: number
	threadId: string
}

const ImplementationPlanPreviewWrapper: React.FC<ImplementationPlanPreviewWrapperProps> = ({
	toolMessage,
	messageIdx,
	threadId
}) => {
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const chatThreadsService = accessor.get('IChatThreadService')
	const agentManagerService = accessor.get('IAgentManagerService') as any
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
			const planMessages = messages.filter((m: any) =>
				m.name === 'create_implementation_plan' ||
				m.name === 'preview_implementation_plan' ||
				m.name === 'execute_implementation_plan' ||
				m.name === 'update_implementation_step' ||
				m.name === 'get_implementation_status'
			)
			const latest = planMessages[planMessages.length - 1]

			if (latest && latest.id !== toolMessage.id) {
				setLatestPlan(latest)
				setRefreshKey(prev => prev + 1)
			}
		}

		// Check on mount and when messages change
		checkForUpdates()
	}, [threadId, toolMessage.id, chatThreadsService, chatThreadsService?.state?.allThreads?.[threadId]?.messages?.length])

	const result = latestPlan.result
	if (!result) {
		return (
			<div className="void-implementation-plan-result w-full rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-2 shadow-sm">
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
					summary: result.summary || 'Plan created successfully',
					planId: result.planId,
					canApprove: true
				}
			case 'preview_implementation_plan':
				return {
					title: 'Implementation Plan Preview',
					summary: result.summary || 'Plan preview',
					planId: result.planId,
					canApprove: result.planId && result.planId !== ''
				}
			case 'execute_implementation_plan':
				return {
					title: 'Executing Implementation Plan',
					summary: result.summary || 'Step execution started',
					planId: result.planId || '',
					canApprove: false
				}
			case 'update_implementation_step':
				return {
					title: 'Implementation Step Updated',
					summary: result.summary || 'Step updated',
					planId: '',
					canApprove: false
				}
			case 'get_implementation_status':
				return {
					title: 'Implementation Status',
					summary: result.summary || 'Plan status',
					planId: '',
					canApprove: false
				}
			default:
				return {
					title: 'Implementation Plan',
					summary: result.summary || 'Operation completed',
					planId: result.planId || '',
					canApprove: false
				}
		}
	}

	const planInfo = getPlanInfo()
	const isSuccess = result && !result.error

	const getToolIcon = () => {
		switch (toolMessage.name) {
			case 'create_implementation_plan': return '\u{1F4CB}'
			case 'preview_implementation_plan': return '👁️'
			case 'execute_implementation_plan': return '▶️'
			case 'update_implementation_step': return '✅'
			case 'get_implementation_status': return '📊'
			default: return '🎯'
		}
	}

	const getActionColor = () => {
		switch (toolMessage.name) {
			case 'create_implementation_plan': return 'text-blue-400'
			case 'preview_implementation_plan': return 'text-purple-400'
			case 'execute_implementation_plan': return 'text-green-400'
			case 'update_implementation_step': return 'text-yellow-400'
			case 'get_implementation_status': return 'text-orange-400'
			default: return 'text-void-fg-1'
		}
	}

	const handleApprove = async () => {
		console.log('[ImplementationPlanPreview] handleApprove called', { planId: planInfo.planId, isApproving, threadId })
		console.log('[ImplementationPlanPreview] chatThreadsService:', chatThreadsService)
		console.log('[ImplementationPlanPreview] chatThreadsService.addUserMessageAndStreamResponse:', chatThreadsService?.addUserMessageAndStreamResponse)

		if (!planInfo.planId || isApproving) {
			console.log('[ImplementationPlanPreview] Early return - planId or isApproving', { planId: planInfo.planId, isApproving })
			return
		}

		setIsApproving(true)
		try {
			// Switch to Code mode (agent) for execution
			if (voidSettingsService?.setGlobalSetting) {
				console.log('[ImplementationPlanPreview] Switching to agent mode')
				voidSettingsService.setGlobalSetting('chatMode', 'code')
			}

			// Send approval message that instructs AI to create a task plan and execute
			const approvalMessage = `The implementation plan (ID: ${planInfo.planId}) has been approved for execution.

**Instructions:**
1. First, use the \`create_plan\` tool to create a task plan based on the approved implementation plan steps
2. Then execute each task in order, using \`update_task_status\` to track progress
3. For each step: read relevant files, make the necessary changes, and verify they work
4. Mark each task complete as you finish it

Please begin execution now.`

			console.log('[ImplementationPlanPreview] Calling addUserMessageAndStreamResponse with:', { threadId, userMessage: approvalMessage.substring(0, 100) + '...' })

			if (!chatThreadsService?.addUserMessageAndStreamResponse) {
				console.error('[ImplementationPlanPreview] addUserMessageAndStreamResponse method not found on chatThreadsService!')
				return
			}

			await chatThreadsService.addUserMessageAndStreamResponse({
				threadId,
				userMessage: approvalMessage
			})
			console.log('[ImplementationPlanPreview] Message sent successfully')
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
			const voidSettingsService = accessor.get('IVoidSettingsService') as any

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
		if (result.steps && Array.isArray(result.steps)) {
			const completedCount = result.steps.filter((s: any) => s.status === 'completed').length
			const totalCount = result.steps.length

			markdown += `## \u{1F4CB} Steps (${completedCount}/${totalCount} complete)\n\n`

			result.steps.forEach((step: any, index: number) => {
				const status = step.status || 'pending'
				const statusIcon = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : status === 'failed' ? '❌' : '⬜'
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
					markdown += `> 💡 ${step.notes}\n\n`
				}
			})
		}

		// Add summary section
		if (planInfo.summary) {
			markdown += `---\n\n## Summary\n\n${planInfo.summary}\n\n`
		}

		// Add any additional details
		if (result.details) {
			markdown += `## Additional Details\n\n${result.details}\n\n`
		}

		// Add timestamps if available
		if (result.createdAt || result.updatedAt) {
			markdown += `---\n\n`
			if (result.createdAt) {
				markdown += `*Created: ${new Date(result.createdAt).toLocaleString()}*\n`
			}
			if (result.updatedAt) {
				markdown += `*Last updated: ${new Date(result.updatedAt).toLocaleString()}*\n`
			}
		}

		return markdown
	}

	return (
		<div className="@@void-scope">
			<div className="void-implementation-plan-preview border border-void-border-2 rounded-lg overflow-hidden shadow-sm bg-void-bg-4">
				{/* Header */}
				<div
					className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-void-bg-4-hover transition-colors border-b border-void-border-2 bg-void-bg-4/50"
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
						<div className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md text-xs font-medium">
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
						{result.steps && Array.isArray(result.steps) && result.steps.length > 0 && (
							<div className="mb-4">
								<div className="text-sm font-medium text-void-fg-2 mb-2">Steps:</div>
								<div className="space-y-2">
									{result.steps.map((step: any, index: number) => {
										const status = step.status || 'pending'
										const statusIcon = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : status === 'failed' ? '❌' : '⬜'
										const statusColor = status === 'completed' ? 'text-green-400' : status === 'in_progress' ? 'text-blue-400' : status === 'failed' ? 'text-red-400' : 'text-void-fg-3'

										return (
											<div key={index} className="flex items-start gap-3 p-2 bg-void-bg-4/40 rounded-md border border-void-border-2">
												<div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
													<span className={statusColor}>{statusIcon}</span>
												</div>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<span className="text-xs text-void-fg-4 font-mono">Step {index + 1}</span>
														{status !== 'pending' && (
															<span className={`text-xs px-1.5 py-0.5 rounded ${
																status === 'completed' ? 'bg-green-500/20 text-green-400' :
																status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
																status === 'failed' ? 'bg-red-500/20 text-red-400' :
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
							<div className="mb-3 prose prose-sm prose-invert max-w-none">
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
									className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
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
											✅ Approve Plan
										</>
									)}
								</button>
								<button
									onClick={handleRequestChanges}
									className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
								>
									✏️ Request Changes
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
