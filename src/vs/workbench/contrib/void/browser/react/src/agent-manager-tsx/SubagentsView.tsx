/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------
 *
 * Subagents page — the flat, hermes-style tree. No boxed rows: each run reads
 * as a status line (glyph + shimmering goal while running) over a meta line,
 * with the last output indented beneath it. The page surface is the
 * transcript-adjacent working context, so it stays quiet.
 */

import React, { useMemo, useState } from 'react';
import { useSubagents, useAccessor } from '../util/services.js';
import { SubagentRun, SubagentStatus } from '../../../subagentService.js';
import {
	Activity, Copy, ChevronRight, Terminal, Cpu,
} from 'lucide-react';
import { GlyphSpinner } from '../util/status.js';

// ------------------------------------------------------------------
//  Status glyph — same vocabulary as the composer status stack:
//  breathe spinner while running, quiet check when done, warning on failure.
// ------------------------------------------------------------------
const statusGlyph = (status: SubagentStatus) => {
	if (status === 'running' || status === 'queued') {
		return <GlyphSpinner variant='breathe' className='text-[0.95rem] text-void-fg-3' />;
	}
	if (status === 'failed' || status === 'cancelled') {
		return (
			<svg className='size-3.5 shrink-0 text-void-error' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
				<circle cx='12' cy='12' r='10' />
				<line x1='12' y1='8' x2='12' y2='12' />
				<line x1='12' y1='16' x2='12.01' y2='16' />
			</svg>
		);
	}
	return (
		<svg className='size-3.5 shrink-0 text-void-success/85' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
			<path d='M21.801 10A10 10 0 1 1 17 3.335' />
			<path d='m9 11 3 3L22 4' />
		</svg>
	);
};

const statusMeta: Record<SubagentStatus, { label: string, tone: string }> = {
	queued: { label: 'Queued', tone: 'text-void-scaffold-meta' },
	running: { label: 'Running', tone: 'text-void-fg-2' },
	completed: { label: 'Done', tone: 'text-void-success/85' },
	failed: { label: 'Failed', tone: 'text-void-error' },
	cancelled: { label: 'Cancelled', tone: 'text-void-scaffold-meta' },
}

// ------------------------------------------------------------------
//  A single subagent row (expandable) — flat, no card chrome
// ------------------------------------------------------------------
export const SubagentRow = ({ run }: { run: SubagentRun }) => {
	const accessor = useAccessor()
	const [expanded, setExpanded] = useState(false)
	const isActive = run.status === 'running' || run.status === 'queued'
	const meta = statusMeta[run.status]

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

	const previewText = (run.status === 'running' ? run.streamingText : run.fullText) || run.error || ''
	const preview = previewText.slice(-240)

	// One quiet meta line: model/type · turns · tools · status
	const metaParts = [
		run.subagentType,
		isActive && run.maxIterations > 0 ? `${run.iterationCount}/${run.maxIterations} turns` : '',
		run.toolCallCount > 0 ? `${run.toolCallCount} tools` : '',
		meta.label,
	].filter(Boolean)

	return (
		<div className='group/run min-w-0' data-slot='subagent-row'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full min-w-0 items-start gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-void-row-hover'
				aria-expanded={expanded}
			>
				<span className='mt-0.5 grid size-3.5 shrink-0 place-items-center'>{statusGlyph(run.status)}</span>
				<span className='flex min-w-0 flex-1 flex-col gap-0.5'>
					<span className={`flex min-w-0 items-center gap-1.5`}>
						<span className={`min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.35] ${
							run.status === 'failed' ? 'text-void-error' : isActive ? 'shimmer-text text-void-fg-2' : 'text-void-scaffold-text'
						}`}>
							{run.title || 'Untitled subagent'}
						</span>
						{run.isBackground && (
							<span className='shrink-0 text-[9px] font-medium uppercase tracking-wide text-void-scaffold-meta'>BG</span>
						)}
					</span>
					<span className='truncate text-[10px] leading-[1.2] text-void-scaffold-meta'>
						{metaParts.join(' \u00b7 ')}
					</span>
					{isActive && run.currentToolActivity && (
						<span className='flex min-w-0 items-center gap-1 text-[10px] leading-[1.2] text-void-fg-3'>
							<GlyphSpinner className='shrink-0 text-[0.75rem] text-void-scaffold-meta' />
							<span className='truncate'>{run.currentToolActivity}</span>
						</span>
					)}
				</span>
				{isActive && (
					<span
						onClick={(e) => { e.stopPropagation(); handleCancel() }}
						role='button'
						className='hidden shrink-0 rounded p-1 text-void-scaffold-meta transition-colors hover:bg-void-row-hover hover:text-void-error group-hover/run:block'
						aria-label='Cancel subagent'
					>
						<svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden={true}>
							<circle cx='12' cy='12' r='10' />
							<line x1='4.93' y1='4.93' x2='19.07' y2='19.07' />
						</svg>
					</span>
				)}
				<ChevronRight
					size={12}
					className={`mt-1 shrink-0 text-void-scaffold-meta transition-all duration-150 ease-out ${expanded ? 'rotate-90 opacity-80' : 'opacity-0 group-hover/run:opacity-80'}`}
				/>
			</button>

			{/* Expanded body — indented under the title, no nested box */}
			{expanded && (
				<div className='min-w-0 pb-1.5 pl-6 pr-1'>
					{run.error ? (
						<div className='text-[11px] leading-relaxed text-void-error'>{run.error}</div>
					) : previewText ? (
						<pre className='max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-void-fg-3'>
							{preview}
						</pre>
					) : (
						<span className='text-[11px] text-void-scaffold-meta'>No output yet.</span>
					)}

					{/* Footer meta + actions */}
					<div className='mt-2 flex items-center justify-between border-t border-void-hairline pt-1.5'>
						<div className='flex items-center gap-3 text-[10px] text-void-scaffold-meta'>
							<span>Started {new Date(run.startedAt).toLocaleTimeString()}</span>
							{run.finishedAt && (
								<span className='flex items-center gap-0.5'>
									<Terminal className='h-2.5 w-2.5' />
									{Math.round((run.finishedAt - run.startedAt) / 1000)}s
								</span>
							)}
						</div>
						{!isActive && (run.fullText || run.error) && (
							<button
								onClick={handleCopy}
								className='flex items-center gap-1 text-[10px] text-void-scaffold-meta transition-colors hover:text-void-fg-2'
								aria-label='Copy result to clipboard'
							>
								<Copy className='h-3 w-3' />
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
		<div className='flex h-full min-h-0 flex-col bg-void-bg-4'>
			{/* Header */}
			<div className='flex-shrink-0 border-b border-void-hairline px-6 py-4'>
				<div className='flex items-center gap-2'>
					<Activity className='h-4 w-4 text-void-fg-2' />
					<h2 className='text-sm font-semibold text-void-fg-0'>Subagents &amp; Background Tasks</h2>
				</div>
				<p className='mt-1 text-xs text-void-scaffold-meta'>
					Focused sub-agents the main agent delegated to. Each runs in its own context with a restricted tool set.
				</p>

				{/* Filter tabs */}
				<div className='mt-3 flex items-center gap-1'>
					{([
						['all', `All (${runs.length})`],
						['active', `Active (${activeCount})`],
						['background', `Background (${bgCount})`],
					] as const).map(([key, label]) => (
						<button
							key={key}
							onClick={() => setFilter(key)}
							className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
								filter === key
									? 'bg-void-bg-3 text-void-fg-1'
									: 'text-void-scaffold-meta hover:bg-void-bg-3 hover:text-void-fg-2'
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* List — flat, hairline-separated rows */}
			<div className='min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3'>
				{filtered.length === 0 ? (
					<div className='flex h-full flex-col items-center justify-center px-6 text-center'>
						<div className='mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-void-hairline bg-void-bg-3'>
							<Cpu className='h-5 w-5 text-void-fg-4' />
						</div>
						<p className='text-sm font-medium text-void-fg-3'>No subagents yet</p>
						<p className='mt-1 max-w-xs text-xs text-void-scaffold-meta'>
							When the agent delegates a focused subtask (e.g. <span className='font-mono'>run_subagent</span>),
							it will appear here with live progress and its final result.
						</p>
					</div>
				) : (
					<>
						{filtered.map(run => <SubagentRow key={run.id} run={run} />)}
						{filtered.length > 1 && <div className='border-t border-void-hairline' />}
					</>
				)}
			</div>
		</div>
	)
}