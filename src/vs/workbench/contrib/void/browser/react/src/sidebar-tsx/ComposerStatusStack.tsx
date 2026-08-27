/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------
 *
 * The status "sink" above the composer — one card holding every session-scoped
 * status, grouped by type and separated by hairlines (hermes-style status
 * stack). Collapses to nothing when empty.
 *
 * Groups:
 *   - Todos — the agent's task plan (checklist icon, expanded by default,
 *     count in the label, todo-glyph vocabulary per row).
 *   - Subagents — delegated runs for THIS thread (agent icon, collapsed by
 *     default, live braille spinner in the header while any run is active,
 *     current-tool meta on each row).
 *
 * The card is inset (mx) and rounded-top-only so it reads fused with the
 * composer surface below it — one capsule, the composer's own bottom chrome
 * is the single shared seam.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, Bot } from 'lucide-react';
import { useAccessor, useSubagents } from '../util/services.js';
import { Plan } from '../../../../common/planningService.js';
import { SubagentRun } from '../../../subagentService.js';
import { GlyphSpinner, StatusRow, StatusSection, TodoGlyph, TodoStatus } from '../util/status.js';

// --- Todos group ---

const todoStatusOf = (s: string): TodoStatus => {
	switch (s) {
		case 'complete':
		case 'completed':
			return 'complete';
		case 'in_progress':
			return 'in_progress';
		case 'failed':
			return 'failed';
		case 'skipped':
			return 'skipped';
		default:
			return 'pending';
	}
};

const TodoRows = ({ plan }: { plan: Plan }) => {
	return (
		<>
			{plan.tasks.map((task) => (
				<StatusRow key={task.id} leading={<TodoGlyph status={todoStatusOf(task.status)} />}>
					<span
						className={`min-w-0 flex-1 truncate text-[12px] leading-[1.45] ${
							task.status === 'complete' || task.status === 'skipped'
								? 'text-void-scaffold-meta line-through'
								: task.status === 'failed'
									? 'text-void-error'
									: task.status === 'in_progress'
										? 'text-void-fg-1'
										: 'text-void-scaffold-text'
						}`}
					>
						{task.description}
					</span>
				</StatusRow>
			))}
		</>
	);
};

// --- Subagents group ---

const subagentStatusGlyph = (run: SubagentRun) => {
	if (run.status === 'running' || run.status === 'queued') {
		return <GlyphSpinner variant='breathe' className='text-[0.95rem] text-void-fg-3' />;
	}
	if (run.status === 'failed' || run.status === 'cancelled') {
		return (
			<svg className='size-3.5 text-void-error' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
				<circle cx='12' cy='12' r='10' />
				<line x1='12' y1='8' x2='12' y2='12' />
				<line x1='12' y1='16' x2='12.01' y2='16' />
			</svg>
		);
	}
	return (
		<svg className='size-3.5 text-void-success/85' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
			<path d='M21.801 10A10 10 0 1 1 17 3.335' />
			<path d='m9 11 3 3L22 4' />
		</svg>
	);
};

const SubagentStatusRow = ({ run }: { run: SubagentRun }) => {
	const accessor = useAccessor();
	const isActive = run.status === 'running' || run.status === 'queued';

	const handleCancel = () => {
		const svc = accessor.get('ISubagentService');
		svc.cancel(run.id);
	};

	return (
		<StatusRow
			leading={subagentStatusGlyph(run)}
			trailing={
				isActive ? (
					<button
						aria-label='Cancel subagent'
						onClick={(e) => { e.stopPropagation(); handleCancel(); }}
						className='p-0.5 rounded text-void-scaffold-meta transition-colors hover:text-void-error'
						data-tooltip-id='void-tooltip'
						data-tooltip-content='Cancel subagent'
						data-tooltip-place='top'
					>
						<svg className='size-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
							<circle cx='12' cy='12' r='10' />
							<line x1='4.93' y1='4.93' x2='19.07' y2='19.07' />
						</svg>
					</button>
				) : undefined
			}
		>
			<span className={`min-w-0 flex-1 truncate text-[12px] leading-[1.45] ${run.status === 'failed' ? 'text-void-error' : run.status === 'running' ? 'text-void-fg-1' : 'text-void-scaffold-text'}`}>
				{run.title || 'Untitled subagent'}
			</span>
			{run.currentToolActivity && isActive && (
				<span className='shrink-0 max-w-[40%] truncate text-[10px] leading-4 text-void-scaffold-meta'>
					{run.currentToolActivity}
				</span>
			)}
			{run.isBackground && (
				<span className='shrink-0 text-[9px] font-medium uppercase tracking-wide text-void-scaffold-meta'>
					BG
				</span>
			)}
		</StatusRow>
	);
};

// --- The stack ---

/**
 * One card directly above the composer: session-scoped status grouped by type
 * (todos, subagents), collapsible, hairline-separated. Collapses to nothing
 * when empty. Inset and rounded-top so it reads fused with the composer
 * surface below — one capsule.
 */
export const ComposerStatusStack = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor();
	const allRuns = useSubagents();
	const toolsService = accessor.get('IToolsService');
	const planningService = toolsService.getPlanningService();

	const [plan, setPlan] = useState<Plan | null>(planningService.getPlanStatus());
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		const disposable = planningService.onDidChangePlan((newPlan) => {
			setPlan(newPlan);
			setDismissed(false);
		});
		return () => disposable.dispose();
	}, [planningService]);

	const runs = useMemo(() => allRuns.filter((r) => r.parentThreadId === threadId), [allRuns, threadId]);

	const tasks = plan?.tasks ?? [];
	const completedCount = tasks.filter((t) => t.status === 'complete' || t.status === 'skipped').length;
	const allDone = tasks.length > 0 && completedCount === tasks.length;
	const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'queued');

	const showTodos = !!plan && tasks.length > 0 && !(dismissed && allDone);
	const showSubagents = runs.length > 0;
	if (!showTodos && !showSubagents) return null;

	return (
		<div className='mx-3 mb-2'>
			<div className='overflow-hidden rounded-t-xl rounded-b-none border border-b-0 border-void-hairline bg-void-bg-2/60'>
				{showTodos && (
					<StatusSection
						defaultCollapsed={allDone}
						icon={<ListChecks size={13} className={allDone ? 'text-void-success/85' : 'text-void-fg-3'} />}
						label={
							<span className='min-w-0 truncate'>
								{plan.goal}
								<span className='ml-1.5 text-void-scaffold-meta tabular-nums'>
									{completedCount}/{tasks.length}
								</span>
							</span>
						}
						accessory={
							allDone ? (
								<button
									aria-label='Dismiss plan'
									onClick={() => {
										setDismissed(true);
										planningService.clearPlan();
									}}
									className='text-void-scaffold-meta transition-colors hover:text-void-fg-2'
								>
									<svg className='size-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
										<path d='M6 18 18 6M6 6l12 12' />
									</svg>
								</button>
							) : undefined
						}
					>
						<TodoRows plan={plan} />
					</StatusSection>
				)}
				{showSubagents && (
					<StatusSection
						defaultCollapsed={true}
						icon={<Bot size={13} className='text-void-fg-3' />}
						label={
							<span>
								Subagents
								<span className='ml-1.5 text-void-scaffold-meta tabular-nums'>({runs.length})</span>
							</span>
						}
						collapsedIndicator={
							activeRuns.length > 0 ? <GlyphSpinner className='text-[0.8rem] text-void-fg-3' /> : undefined
						}
					>
						{runs.map((run) => (
							<SubagentStatusRow key={`${threadId}-${run.id}`} run={run} />
						))}
					</StatusSection>
				)}
			</div>
		</div>
	);
};