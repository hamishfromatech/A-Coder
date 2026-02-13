/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, XCircle, SkipForward, ChevronDown, ChevronRight } from 'lucide-react';

export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';

export interface Task {
	id: string;
	description: string;
	status: TaskStatus;
	dependencies: string[];
	notes?: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface Plan {
	id: string;
	goal: string;
	tasks: Task[];
	createdAt: Date;
	updatedAt: Date;
}

interface PlanStatusPanelProps {
	plan: Plan | null;
}

const statusConfig = {
	in_progress: {
		icon: Clock,
		color: 'text-blue-400',
		bgColor: 'bg-blue-500/10',
		borderColor: 'border-blue-500/30',
		label: '\u{1F504} In Progress',
	},
	pending: {
		icon: Circle,
		color: 'text-void-fg-4',
		bgColor: 'bg-void-bg-2',
		borderColor: 'border-void-border-2',
		label: '\u{23F3} Pending',
	},
	complete: {
		icon: CheckCircle2,
		color: 'text-green-400',
		bgColor: 'bg-green-500/10',
		borderColor: 'border-green-500/30',
		label: '\u{2705} Complete',
	},
	failed: {
		icon: XCircle,
		color: 'text-red-400',
		bgColor: 'bg-red-500/10',
		borderColor: 'border-red-500/30',
		label: '\u{274C} Failed',
	},
	skipped: {
		icon: SkipForward,
		color: 'text-yellow-400',
		bgColor: 'bg-yellow-500/10',
		borderColor: 'border-yellow-500/30',
		label: '\u{23ED}\u{FE0F} Skipped',
	},
} as const;

const TaskItem = ({ task, isCompact }: { task: Task; isCompact?: boolean }) => {
	const [isExpanded, setIsExpanded] = useState(!isCompact);
	const config = statusConfig[task.status];
	const Icon = config.icon;

	const hasDependencies = task.dependencies.length > 0;
	const hasNotes = !!task.notes;
	const hasDetails = hasDependencies || hasNotes;

	return (
		<div
			className={`
				rounded-lg border transition-all duration-200
				${config.bgColor} ${config.borderColor}
				${task.status === 'in_progress' ? 'ring-1 ring-blue-500/20' : ''}
			`}
		>
			<div
				className={`
					p-2.5 flex items-start gap-2.5
					${hasDetails ? 'cursor-pointer hover:bg-void-bg-3/50' : ''}
				`}
				onClick={() => hasDetails && setIsExpanded(!isExpanded)}
			>
				{/* Status Icon */}
				<Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />

				{/* Task Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1">
							<p className="text-sm text-void-fg-1 leading-snug">{task.description}</p>
							<p className="text-xs text-void-fg-4 mt-0.5">
								<span className="font-mono opacity-60">{task.id}</span>
							</p>
						</div>
						{hasDetails && (
							<div className="flex-shrink-0">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-void-fg-4" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-void-fg-4" />
								)}
							</div>
						)}
					</div>

					{/* Expanded Details */}
					{isExpanded && hasDetails && (
						<div className="mt-2 pt-2 border-t border-void-border-2/50 space-y-1.5">
							{hasDependencies && (
								<div className="text-xs text-void-fg-3">
									<span className="opacity-60">Depends on:</span>{' '}
									<span className="font-mono">{task.dependencies.join(', ')}</span>
								</div>
							)}
							{hasNotes && (
								<div className="text-xs text-void-fg-3 bg-void-bg-1/30 rounded px-2 py-1">
									{task.notes}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const TaskGroup = ({ status, tasks, label, isDefaultOpen }: {
	status: TaskStatus;
	tasks: Task[];
	label: string;
	isDefaultOpen?: boolean;
}) => {
	const [isOpen, setIsOpen] = useState(isDefaultOpen ?? true);

	if (tasks.length === 0) return null;

	const config = statusConfig[status];

	return (
		<div className="space-y-2">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center gap-2 text-left group hover:bg-void-bg-2/50 rounded px-2 py-1.5 transition-colors"
			>
				{isOpen ? (
					<ChevronDown className="w-3.5 h-3.5 text-void-fg-4 group-hover:text-void-fg-3" />
				) : (
					<ChevronRight className="w-3.5 h-3.5 text-void-fg-4 group-hover:text-void-fg-3" />
				)}
				<span className="text-sm font-medium text-void-fg-2 group-hover:text-void-fg-1">
					{label}
				</span>
				<span className="text-xs text-void-fg-4 bg-void-bg-2 px-1.5 py-0.5 rounded">
					{tasks.length}
				</span>
			</button>

			{isOpen && (
				<div className="ml-2 space-y-2">
					{tasks.map((task) => (
						<TaskItem key={task.id} task={task} isCompact={status === 'complete'} />
					))}
				</div>
			)}
		</div>
	);
};

export const PlanStatusPanel: React.FC<PlanStatusPanelProps> = ({ plan }) => {
	if (!plan) {
		return (
			<div className="p-4 text-center text-void-fg-4 text-sm">
				<p>No active plan</p>
				<p className="text-xs mt-1 opacity-60">Plans will appear here when the AI creates them</p>
			</div>
		);
	}

	// Group tasks by status
	const tasksByStatus: Record<TaskStatus, Task[]> = {
		in_progress: [],
		pending: [],
		complete: [],
		failed: [],
		skipped: [],
	};

	for (const task of plan.tasks) {
		tasksByStatus[task.status].push(task);
	}

	const completedCount = tasksByStatus.complete.length;
	const totalCount = plan.tasks.length;
	const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="p-4 border-b border-void-border-2 bg-void-bg-1/30">
				<h3 className="text-sm font-semibold text-void-fg-1 mb-2">Current Plan</h3>
				<p className="text-sm text-void-fg-2 leading-relaxed">{plan.goal}</p>

				{/* Progress Bar */}
				<div className="mt-3">
					<div className="flex items-center justify-between text-xs text-void-fg-3 mb-1">
						<span>Progress</span>
						<span className="font-medium">
							{completedCount}/{totalCount} tasks
						</span>
					</div>
					<div className="w-full h-2 bg-void-bg-2 rounded-full overflow-hidden">
						<div
							className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="text-xs text-void-fg-4 mt-1 text-right">{progress.toFixed(0)}%</div>
				</div>
			</div>

			{/* Task Groups */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<TaskGroup
					status="in_progress"
					tasks={tasksByStatus.in_progress}
					label={statusConfig.in_progress.label}
					isDefaultOpen={true}
				/>
				<TaskGroup
					status="pending"
					tasks={tasksByStatus.pending}
					label={statusConfig.pending.label}
					isDefaultOpen={true}
				/>
				<TaskGroup
					status="complete"
					tasks={tasksByStatus.complete}
					label={statusConfig.complete.label}
					isDefaultOpen={false}
				/>
				<TaskGroup
					status="failed"
					tasks={tasksByStatus.failed}
					label={statusConfig.failed.label}
					isDefaultOpen={true}
				/>
				<TaskGroup
					status="skipped"
					tasks={tasksByStatus.skipped}
					label={statusConfig.skipped.label}
					isDefaultOpen={true}
				/>
			</div>
		</div>
	);
};
