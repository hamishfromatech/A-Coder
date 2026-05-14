/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardList, ChevronDown, ChevronUp, Check, Circle, Loader2, AlertTriangle, X } from 'lucide-react';
import { useAccessor } from '../util/services.js';
import { Plan, Task, TaskStatus } from '../../../../common/planningService.js';

export const PersistentTaskPlan: React.FC = () => {
	const accessor = useAccessor();
	const toolsService = accessor.get('IToolsService');
	const planningService = toolsService.getPlanningService();

	const [plan, setPlan] = useState<Plan | null>(planningService.getPlanStatus());
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [isDismissed, setIsDismissed] = useState(false);

	useEffect(() => {
		const disposable = planningService.onDidChangePlan((newPlan) => {
			setPlan(newPlan);
			if (newPlan) {
				const allDone = newPlan.tasks.every(t => t.status === 'complete' || t.status === 'skipped' || t.status === 'failed');
				if (allDone) {
					setIsCollapsed(true);
				}
			}
		});
		return () => disposable.dispose();
	}, [planningService]);

	if (!plan || isDismissed) return null;

	const total = plan.tasks.length;
	const completed = plan.tasks.filter(t => t.status === 'complete').length;
	const inProgress = plan.tasks.filter(t => t.status === 'in_progress').length;
	const failed = plan.tasks.filter(t => t.status === 'failed').length;
	const allDone = completed === total && total > 0;

	if (total === 0) return null;

	const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

	const getStatusIcon = (status: TaskStatus) => {
		switch (status) {
			case 'complete': return <Check size={12} className="text-green-400" />;
			case 'in_progress': return <Loader2 size={12} className="text-blue-400 animate-spin" />;
			case 'failed': return <AlertTriangle size={12} className="text-red-400" />;
			case 'skipped': return <X size={12} className="text-void-fg-4" />;
			default: return <Circle size={12} className="text-void-fg-4" />;
		}
	};

	const getStatusColor = (status: TaskStatus) => {
		switch (status) {
			case 'complete': return 'text-green-400 line-through opacity-60';
			case 'in_progress': return 'text-void-fg-1 font-medium';
			case 'failed': return 'text-red-400';
			case 'skipped': return 'text-void-fg-4 line-through opacity-50';
			default: return 'text-void-fg-2';
		}
	};

	return (
		<div className="flex-shrink-0 border-b border-void-border-1 bg-void-bg-1/80 backdrop-blur-sm">
			{/* Header — always visible, clickable to expand/collapse */}
			<div
				className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-void-bg-2/50 transition-colors"
				onClick={() => setIsCollapsed(c => !c)}
			>
				{isCollapsed ? (
					<ChevronDown size={14} className="text-void-fg-3" />
				) : (
					<ChevronUp size={14} className="text-void-fg-3" />
				)}
				<ClipboardList size={14} className={allDone ? 'text-green-400' : 'text-void-accent'} />
				<span className="text-xs font-semibold text-void-fg-1 truncate">
					{plan.goal}
				</span>
				<span className="ml-auto flex items-center gap-2">
					{/* Mini progress bar */}
					<div className="flex items-center gap-1.5">
						<div className="w-16 h-1.5 bg-void-bg-3 rounded-full overflow-hidden">
							<div
								className="h-full bg-void-accent rounded-full transition-all duration-500"
								style={{ width: `${progressPct}%` }}
							/>
						</div>
						<span className="text-[10px] text-void-fg-3 tabular-nums">
							{completed}/{total}
						</span>
					</div>
					{allDone && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsDismissed(true);
								planningService.clearPlan();
							}}
							className="text-void-fg-4 hover:text-void-fg-2 transition-colors"
							title="Dismiss"
						>
							<X size={12} />
						</button>
					)}
				</span>
			</div>

			{/* Expanded task list */}
			{!isCollapsed && (
				<div className="px-4 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
					{plan.tasks.map(task => (
						<div key={task.id} className="flex items-center gap-2 py-0.5">
							{getStatusIcon(task.status)}
							<span className={`text-xs truncate ${getStatusColor(task.status)}`}>
								{task.description}
							</span>
							{task.status === 'in_progress' && (
								<span className="text-[10px] text-blue-400 ml-auto flex-shrink-0">
									in progress
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
