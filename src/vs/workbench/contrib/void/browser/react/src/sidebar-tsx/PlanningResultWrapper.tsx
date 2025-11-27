/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react'
import { useAccessor } from '../util/services.js'
import { ToolName } from '../../../../common/toolsServiceTypes.js'

interface TaskItem {
	text: string
	status: 'complete' | 'in_progress' | 'pending'
}

interface PlanningResultWrapperProps {
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

// Parse markdown checklist into task items
const parseMarkdownTasks = (markdown: string): { tasks: TaskItem[], goal: string } => {
	const lines = markdown.split('\n')
	const tasks: TaskItem[] = []
	let goal = ''

	for (const line of lines) {
		// Extract goal from header like "## 📋 Build feature"
		const goalMatch = line.match(/^##\s*📋?\s*(.+)$/)
		if (goalMatch) {
			goal = goalMatch[1].trim()
			continue
		}

		// Parse checkbox items
		// - [x] completed
		// - [~] in progress
		// - [ ] pending
		// - [!] failed (treat as pending)
		// - [-] skipped (treat as complete)
		const checkboxMatch = line.match(/^-\s*\[([ x~!\-])\]\s*(.+)$/)
		if (checkboxMatch) {
			const marker = checkboxMatch[1]
			let text = checkboxMatch[2]

			// Remove bold task ID like **task1:**
			text = text.replace(/\*\*[^*]+:\*\*\s*/, '')
			// Remove status indicators like *(in progress)*
			text = text.replace(/\s*\*\([^)]+\)\*\s*$/, '')

			let status: TaskItem['status'] = 'pending'
			if (marker === 'x' || marker === '-') {
				status = 'complete'
			} else if (marker === '~') {
				status = 'in_progress'
			}

			tasks.push({ text: text.trim(), status })
		}
	}

	return { tasks, goal }
}

// Status icon component
const StatusIcon: React.FC<{ status: TaskItem['status'], index?: number }> = ({ status, index }) => {
	if (status === 'complete') {
		return (
			<div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
				<svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
				</svg>
			</div>
		)
	}

	if (status === 'in_progress') {
		return (
			<div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
				<span className="text-white text-[10px] font-bold">{(index ?? 0) + 1}</span>
			</div>
		)
	}

	// Pending - empty circle
	return (
		<div className="w-4 h-4 rounded-full border border-void-fg-4 flex-shrink-0" />
	)
}

// Task row component
const TaskRow: React.FC<{ task: TaskItem, index: number }> = ({ task, index }) => {
	return (
		<div className="flex items-start gap-2 py-0.5">
			<div className="mt-0.5">
				<StatusIcon status={task.status} index={index} />
			</div>
			<span className={`text-sm ${
				task.status === 'complete'
					? 'text-void-fg-3'
					: 'text-void-fg-2'
			}`}>
				{task.text}
			</span>
		</div>
	)
}

const PlanningResultWrapper: React.FC<PlanningResultWrapperProps> = ({
	toolMessage,
	messageIdx,
	threadId
}) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService') as any
	const liteModeService = accessor.get('ILiteModeService') as any

	const [latestPlanning, setLatestPlanning] = useState(toolMessage)
	const [isExpanded, setIsExpanded] = useState(false) // Start collapsed like Cascade

	// Check for newer planning updates in this thread (only on mount or when messages change)
	useEffect(() => {
		if (!chatThreadsService) return
		const thread = chatThreadsService.state.allThreads[threadId]
		if (!thread) return

		const messages = thread.messages || []
		const planningMessages = messages.filter((m: any) =>
			m.name === 'create_plan' || m.name === 'update_task_status' || m.name === 'add_tasks_to_plan' || m.name === 'get_plan_status'
		)
		const latest = planningMessages[planningMessages.length - 1]

		if (latest && latest.id !== toolMessage.id) {
			setLatestPlanning(latest)
		}
	}, [threadId, toolMessage.id, chatThreadsService, chatThreadsService?.state?.allThreads?.[threadId]?.messages?.length])

	const result = latestPlanning.result
	if (!result) {
		return <div className="p-3 text-void-fg-3">Planning tool result not available</div>
	}

	// Parse the markdown summary into tasks
	const summary = result.summary || ''
	const { tasks, goal } = parseMarkdownTasks(summary)

	const completedCount = tasks.filter(t => t.status === 'complete').length
	const totalCount = tasks.length

	// Show first 2 tasks when collapsed, all when expanded
	const visibleTasks = isExpanded ? tasks : tasks.slice(0, 2)
	const hiddenCount = tasks.length - visibleTasks.length

	const openPlanPreview = async () => {
		if (!liteModeService) {
			console.error('LiteModeService not available')
			return
		}

		try {
			// Format the plan as markdown for preview
			let planMarkdown = `# 📋 Task Plan\n\n`
			if (goal) {
				planMarkdown += `## Goal\n${goal}\n\n`
			}
			planMarkdown += `## Tasks (${completedCount}/${totalCount} complete)\n\n`
			tasks.forEach((task, index) => {
				const marker = task.status === 'complete' ? 'x' : task.status === 'in_progress' ? '~' : ' '
				planMarkdown += `- [${marker}] ${task.text}\n`
			})

			await liteModeService.openContentPreview('Task Plan', planMarkdown)
		} catch (error) {
			console.error('Failed to open plan preview:', error)
		}
	}

	return (
		<div className="void-planning-result w-full rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-2 shadow-sm hover:shadow-md">
			{/* Header - clickable to expand/collapse */}
			<div
				className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 hover:brightness-125 transition-all duration-150"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<svg
					className={`w-4 h-4 text-void-fg-3 flex-shrink-0 transition-transform duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] ${isExpanded ? 'rotate-90' : ''}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
				<span className="text-void-fg-1 text-sm font-medium">
					Created Todo List
				</span>
				<span className="text-void-fg-4 text-xs italic ml-1">
					{totalCount} tasks
				</span>
			</div>

			{/* Task list - collapsible */}
			{isExpanded && (
				<div className="space-y-0.5 px-3 pb-3 pt-1">
					{tasks.map((task, index) => (
						<TaskRow key={index} task={task} index={index} />
					))}
				</div>
			)}

			{/* Update indicator */}
			{latestPlanning.id !== toolMessage.id && (
				<div className="px-3 pb-2 text-xs text-void-fg-4 italic">
					Plan updated. Showing latest version.
				</div>
			)}
		</div>
	)
}

export default PlanningResultWrapper
