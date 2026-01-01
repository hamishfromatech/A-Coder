/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react'
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
		const goalMatch = line.match(/^##\s*\u{1F4CB}?\s*(.+)$/u)
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
	const agentManagerService = accessor.get('IAgentManagerService') as any

	const [isExpanded, setIsExpanded] = useState(false) // Start collapsed like Cascade

	// Use the toolMessage result directly - no need to track updates
	// Each planning tool call renders its own wrapper with its own result
	const result = toolMessage.result
	const toolName = toolMessage.name

	// Get action text based on tool name
	const getActionText = (isLoading: boolean) => {
		switch (toolName) {
			case 'create_plan':
				return isLoading ? 'Creating plan...' : 'Created Todo List'
			case 'update_task_status':
				return isLoading ? 'Updating task...' : 'Updated Task'
			case 'add_tasks_to_plan':
				return isLoading ? 'Adding tasks...' : 'Added Tasks'
			case 'get_plan_status':
				return isLoading ? 'Getting status...' : 'Plan Status'
			default:
				return isLoading ? 'Processing...' : 'Plan Updated'
		}
	}

	// During streaming, result may not be available yet - show a simple loading state
	if (!result) {
		return (
			<div className="void-planning-result w-full rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-2 shadow-sm">
				<div className="flex items-center gap-2 px-3 py-2">
					<div
						className="w-3 h-3 border-2 rounded-full border-void-accent"
						style={{
							borderTopColor: 'transparent',
							animation: 'spin 0.8s linear infinite'
						}}
					/>
					<span className="text-void-fg-3 text-sm">{getActionText(true)}</span>
				</div>
			</div>
		)
	}

	// Parse the markdown summary into tasks
	const summary = result.summary || ''
	const { tasks, goal } = parseMarkdownTasks(summary)

	const completedCount = tasks.filter(t => t.status === 'complete').length
	const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
	const totalCount = tasks.length

	// Build status text showing progress
	const getStatusText = () => {
		if (inProgressCount > 0 && completedCount === 0) {
			return `${inProgressCount} in progress`
		} else if (completedCount > 0 && inProgressCount > 0) {
			return `${completedCount}/${totalCount} done, ${inProgressCount} in progress`
		} else {
			return `${completedCount}/${totalCount} tasks`
		}
	}

	// Show first 2 tasks when collapsed, all when expanded
	const visibleTasks = isExpanded ? tasks : tasks.slice(0, 2)
	const hiddenCount = tasks.length - visibleTasks.length

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
					{getActionText(false)}
				</span>
				<span className="text-void-fg-4 text-xs italic ml-1">
					{getStatusText()}
				</span>
			</div>

			{/* Task list - collapsible */}
			{isExpanded && (
				<div className="space-y-0.5 px-3 pb-3 pt-1 max-h-[800px] overflow-auto">
					{tasks.map((task, index) => (
						<TaskRow key={index} task={task} index={index} />
					))}
				</div>
			)}
		</div>
	)
}

export default PlanningResultWrapper
