/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useAccessor } from '../util/services.js'
import { ToolName } from '../../../../common/toolsServiceTypes.js'
import { WrapperProps } from './ToolResultHelpers.js'
import { GlyphSpinner, TodoGlyph, WIDGET_SHELL_CLASS, type TodoStatus } from '../util/status.js'

const todoStatusOf = (s: TaskItem['status']): TodoStatus => {
	switch (s) {
		case 'complete': return 'complete'
		case 'in_progress': return 'in_progress'
		case 'failed': return 'failed'
		default: return 'pending'
	}
}

interface TaskItem {
	text: string
	status: 'complete' | 'in_progress' | 'pending' | 'failed'
}

type PlanningResult = {
	summary?: string | null;
}

type PlanningResultWrapperProps = WrapperProps<ToolName>

// Parse markdown checklist into task items
const parseMarkdownTasks = (markdown: string): { tasks: TaskItem[], goal: string } => {
	const lines = markdown.split('\n')
	const tasks: TaskItem[] = []
	let goal = ''

	for (const line of lines) {
		// Extract goal from header like "## \u{1F4CB} Build feature"
		const goalMatch = line.match(/^##\s*\u{1F4CB}?\s*(.+)$/u)
		if (goalMatch) {
			goal = goalMatch[1].trim()
			continue
		}

		// Parse checkbox items
		// - [x] completed
		// - [~] in progress
		// - [ ] pending
		// - [!] failed
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
			} else if (marker === '!') {
				status = 'failed'
			}

			tasks.push({ text: text.trim(), status })
		}
	}

	return { tasks, goal }
}

// Status icon — the shared todo-glyph vocabulary (dashed ring pending,
// spinner in-progress, check complete, warning failed).
const StatusIcon: React.FC<{ status: TaskItem['status'] }> = ({ status }) => {
	return <TodoGlyph status={todoStatusOf(status)} />
}

// Task row component — quiet scaffold line: glyph + text, line-through once done.
const TaskRow: React.FC<{ task: TaskItem }> = ({ task }) => {
	return (
		<div className='flex items-start gap-2 py-0.5'>
			<span className='mt-0.5 grid size-3.5 shrink-0 place-items-center'>
				<StatusIcon status={task.status} />
			</span>
			<span className={`min-w-0 flex-1 text-[12px] leading-[1.45] ${
				task.status === 'complete'
					? 'text-void-scaffold-meta'
					: task.status === 'failed'
						? 'text-void-error'
						: task.status === 'in_progress'
							? 'text-void-fg-1'
							: 'text-void-scaffold-text'
			} ${task.status === 'complete' ? 'line-through' : ''}`}>
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

	const [isExpanded, setIsExpanded] = useState(false) // Start collapsed like Cascade

	// Use the toolMessage result directly - no need to track updates
	// Each planning tool call renders its own wrapper with its own result
	const result = toolMessage.result as PlanningResult | undefined
	const toolName = toolMessage.name

	// Get action text based on tool name
	const getActionText = (isLoading: boolean) => {
			switch (toolName) {
				case 'create_todo':
					return isLoading ? 'Creating todo...' : 'Created Todo List'
				case 'update_todo':
					return isLoading ? 'Updating todo...' : 'Updated Todo'
				case 'add_todos':
					return isLoading ? 'Adding todos...' : 'Added Todos'
				case 'get_todos':
					return isLoading ? 'Getting todos...' : 'Todo List'
			default:
				return isLoading ? 'Processing...' : 'Plan Updated'
		}
	}

	// During streaming, result may not be available yet - show a simple loading state
	if (!result) {
		return (
			<div className={`planning-result w-full ${WIDGET_SHELL_CLASS}`}>
				<div className='flex items-center gap-2'>
					<GlyphSpinner className='text-[0.9rem] text-void-fg-3' />
					<span className='text-[13px] text-void-scaffold-text'>{getActionText(true)}</span>
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
		<div className={`planning-result w-full ${WIDGET_SHELL_CLASS}`}>
			{/* Header - clickable to expand/collapse, caret revealed on hover */}
			<div
				className='group/plan flex min-w-0 cursor-pointer select-none items-center gap-1.5'
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<span className='min-w-0 flex-1 truncate text-[13px] font-normal leading-[1.45] text-void-scaffold-text transition-colors hover:text-void-fg-2'>
					{getActionText(false)}
				</span>
				<span className='shrink-0 text-[10px] tabular-nums text-void-scaffold-meta'>
					{getStatusText()}
				</span>
				<ChevronRight
					size={12}
					className={`shrink-0 text-void-scaffold-meta transition-all duration-150 ease-out ${isExpanded ? 'rotate-90 opacity-80' : 'opacity-0 group-hover/plan:opacity-80'}`}
				/>
			</div>

			{/* Task list - shows first 2 when collapsed, all when expanded */}
			<div className={`group/plan space-y-0.5 pt-1.5 ${isExpanded ? 'max-h-[800px] overflow-auto' : ''}`}>
				{visibleTasks.map((task, index) => (
					<TaskRow key={index} task={task} />
				))}
				{!isExpanded && hiddenCount > 0 && (
					<button
						onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
						className='py-0.5 text-[11px] text-void-scaffold-meta transition-colors hover:text-void-fg-2'
					>
						+{hiddenCount} more…
					</button>
				)}
			</div>
		</div>
	)
}

export default PlanningResultWrapper
