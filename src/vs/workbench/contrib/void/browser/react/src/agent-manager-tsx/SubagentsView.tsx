/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import {
	useSubagents, useAccessor,
} from '../util/services.js';
import { SubagentRun, SubagentStatus } from '../../../subagentService.js';
import {
	Activity, CheckCircle2, XCircle, Loader2, Ban, Clock,
	Copy, ChevronRight, AlertTriangle, Terminal, Cpu,
} from 'lucide-react';

// ------------------------------------------------------------------
//  Status badge
// ------------------------------------------------------------------
const statusMeta: Record<SubagentStatus, { label: string, icon: React.ElementType, color: string, pulse: boolean }> = {
	queued: { label: 'Queued', icon: Clock, color: 'text-void-fg-3', pulse: false },
	running: { label: 'Running', icon: Loader2, color: 'text-void-info', pulse: true },
	completed: { label: 'Done', icon: CheckCircle2, color: 'text-void-success', pulse: false },
	failed: { label: 'Failed', icon: XCircle, color: 'text-void-error', pulse: false },
	cancelled: { label: 'Cancelled', icon: Ban, color: 'text-void-warning', pulse: false },
}

const StatusBadge = ({ status }: { status: SubagentStatus }) => {
	const m = statusMeta[status]
	const Icon = m.icon
	return (
		<span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${m.color}`}>
			<Icon className={`w-3 h-3 ${m.pulse ? 'animate-spin' : ''}`} />
			{m.label}
		</span>
	)
}

// ------------------------------------------------------------------
//  A single subagent row (expandable)
// ------------------------------------------------------------------
export const SubagentRow = ({ run }: { run: SubagentRun }) => {
	const accessor = useAccessor()
	const [expanded, setExpanded] = useState(false)
	const isActive = run.status === 'running' || run.status === 'queued'

	const handleCancel = () => {
		const svc = accessor.get('ISubagentService')
		svc.cancel(run.id)
	}

	const handleCopy = async () => {
		const clip = accessor.get('IClipboardService')
		const text = run.error ? `Error: ${run.error}` : run.fullText
		if (text && text.length > 0) {
			await clip.writeText(text)
			const notif = accessor.get('INotificationService')
			notif.info('Subagent result copied to clipboard')
		}
	}

	const progress = run.maxIterations > 0
		? Math.min(100, Math.round((run.iterationCount / run.maxIterations) * 100))
		: 0
	const previewText = (run.status === 'running' ? run.streamingText : run.fullText) || run.error || ''
	const preview = previewText.slice(-240)

	return (
		<div className="rounded-lg border border-void-border-2 bg-void-bg-3 overflow-hidden">
			{/* Header row */}
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-void-bg-4 transition-colors"
			>
				<ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 text-void-fg-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 min-w-0">
						<span className="text-sm font-medium text-void-fg-1 truncate">{run.title || 'Untitled subagent'}</span>
						{run.isBackground && (
							<span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-void-bg-2 text-void-fg-4 border border-void-border-2">
								BG
							</span>
						)}
					</div>
					<div className="flex items-center gap-2 mt-0.5">
						<span className="text-[10px] text-void-fg-4 flex items-center gap-1">
							<Cpu className="w-2.5 h-2.5" />
							{run.subagentType}
						</span>
						{isActive && (
							<span className="text-[10px] text-void-fg-4">
								{run.iterationCount}/{run.maxIterations} turns · {run.toolCallCount} tools
							</span>
						)}
						{run.currentToolActivity && (
							<div className="flex items-center gap-1 text-[10px] text-void-fg-3 mt-0.5">
								<Loader2 className="w-2.5 h-2.5 animate-spin" />
								<span className="truncate">{run.currentToolActivity}</span>
							</div>
						)}
					</div>
				</div>
				<StatusBadge status={run.status} />
				{isActive && (
					<span
						onClick={(e) => { e.stopPropagation(); handleCancel() }}
						role="button"
						className="p-1 rounded hover:bg-void-bg-2 text-void-fg-4 hover:text-void-error transition-colors flex-shrink-0"
						title="Cancel subagent"
					>
						<Ban className="w-3.5 h-3.5" />
					</span>
				)}
			</button>

			{/* Progress bar for active runs */}
			{isActive && (
				<div className="h-0.5 bg-void-bg-2">
					<div
						className="h-full bg-void-info transition-all duration-300"
						style={{ width: `${Math.max(4, progress)}%` }}
					/>
				</div>
			)}

			{/* Expanded body */}
			{expanded && (
				<div className="px-3 py-2.5 border-t border-void-border-2 bg-void-bg-2">
					{run.error ? (
						<div className="flex items-start gap-2 text-xs text-void-error">
							<AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
							<span className="break-words">{run.error}</span>
						</div>
					) : previewText ? (
						<pre className="text-xs text-void-fg-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono leading-relaxed">
							{preview}
						</pre>
					) : (
						<span className="text-xs text-void-fg-4 italic">No output yet.</span>
					)}

					{/* Footer actions */}
					<div className="flex items-center justify-between mt-2.5 pt-2 border-t border-void-border-2">
						<div className="flex items-center gap-3 text-[10px] text-void-fg-4">
							<span>Started {new Date(run.startedAt).toLocaleTimeString()}</span>
							{run.finishedAt && (
								<span className="flex items-center gap-0.5">
									<Terminal className="w-2.5 h-2.5" />
									{Math.round((run.finishedAt - run.startedAt) / 1000)}s
								</span>
							)}
						</div>
						{!isActive && (run.fullText || run.error) && (
							<button
								onClick={handleCopy}
								className="flex items-center gap-1 text-[10px] text-void-fg-3 hover:text-void-fg-1 transition-colors"
								title="Copy result to clipboard"
							>
								<Copy className="w-3 h-3" />
								Copy result
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

// ------------------------------------------------------------------
//  Main SubagentsView
// ------------------------------------------------------------------
export const SubagentsView = () => {
	const runs = useSubagents()
	const [filter, setFilter] = useState<'all' | 'active' | 'background'>('all')

	const filtered = useMemo(() => {
		if (filter === 'active') return runs.filter(r => r.status === 'running' || r.status === 'queued')
		if (filter === 'background') return runs.filter(r => r.isBackground)
		return runs
	}, [runs, filter])

	const activeCount = runs.filter(r => r.status === 'running' || r.status === 'queued').length
	const bgCount = runs.filter(r => r.isBackground).length

	return (
		<div className="h-full flex flex-col bg-void-bg-4 min-h-0">
			{/* Header */}
			<div className="flex-shrink-0 px-6 py-4 border-b border-void-border-2">
				<div className="flex items-center gap-2">
					<Activity className="w-4 h-4 text-void-fg-2" />
					<h2 className="text-sm font-semibold text-void-fg-0">Subagents & Background Tasks</h2>
				</div>
				<p className="text-xs text-void-fg-4 mt-1">
					Focused sub-agents the main agent delegated to. Each runs in its own context with a restricted tool set.
				</p>

				{/* Filter tabs */}
				<div className="flex items-center gap-1 mt-3">
					{([
						['all', `All (${runs.length})`],
						['active', `Active (${activeCount})`],
						['background', `Background (${bgCount})`],
					] as const).map(([key, label]) => (
						<button
							key={key}
							onClick={() => setFilter(key)}
							className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
								filter === key
									? 'bg-void-bg-3 text-void-fg-1'
									: 'text-void-fg-4 hover:text-void-fg-2 hover:bg-void-bg-3'
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 space-y-2">
				{filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-center px-6">
						<div className="w-12 h-12 rounded-xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center mb-3">
							<Cpu className="w-5 h-5 text-void-fg-4" />
						</div>
						<p className="text-sm text-void-fg-3 font-medium">No subagents yet</p>
						<p className="text-xs text-void-fg-4 mt-1 max-w-xs">
							When the agent delegates a focused subtask (e.g. <span className="font-mono">run_subagent</span>),
							it will appear here with live progress and its final result.
						</p>
					</div>
				) : (
					filtered.map(run => <SubagentRow key={run.id} run={run} />)
				)}
			</div>
		</div>
	)
}