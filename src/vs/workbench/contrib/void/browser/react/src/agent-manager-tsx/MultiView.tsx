/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { Globe, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAllWorkspaces, useMultiWorkspaceStats } from '../util/services.js';
import { WorkspaceList } from './WorkspaceList.js';
import { MultiWorkspaceThreadSelector } from './MultiWorkspaceThreadSelector.js';

interface MultiViewProps {
	onNewThread: () => void;
	onOpenSettings: () => void;
}

export const MultiView = memo(({ onNewThread, onOpenSettings }: MultiViewProps) => {
	const { workspaces: allWorkspaces, loadError, retry } = useAllWorkspaces();
	const multiStats = useMultiWorkspaceStats();

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-6 border-b border-void-border-2">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h2 className='flex items-center gap-2 text-xl font-semibold tracking-tight text-void-fg-1'>
							<Globe className='h-5 w-5 text-void-accent' aria-hidden={true} />
							All Projects
						</h2>
						<p className='mt-1 text-xs text-void-scaffold-meta'>See and control every A-Coder IDE project from one place</p>
					</div>
					<div className="flex items-center gap-2">
						{multiStats.activeWorkspaces > 0 && (
							<div className='flex items-center gap-2 rounded-lg border border-void-success/20 bg-void-success/10 px-3 py-1.5'>
								<span className='relative' aria-hidden={true}>
									<span className='h-2 w-2 rounded-full bg-void-success' />
									<span className='absolute inset-0 h-2 w-2 animate-ping rounded-full bg-void-success opacity-40' />
								</span>
								<span className='text-[10px] font-semibold uppercase tracking-wider text-void-success/85'>{multiStats.activeWorkspaces} active</span>
							</div>
						)}
					</div>
				</div>

				{/* Aggregated stats */}
				<div className='grid grid-cols-4 gap-3' role='region' aria-label='Workspace statistics'>
					<div className='rounded-lg border border-void-hairline bg-void-bg-2 p-3'>
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalWorkspaces}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Projects</div>
					</div>
					<div className='rounded-lg border border-void-hairline bg-void-bg-2 p-3'>
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalThreads}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Tasks</div>
					</div>
					<div className='rounded-lg border border-void-hairline bg-void-bg-2 p-3'>
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalMessages}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Messages</div>
					</div>
					<div className='rounded-lg border border-void-hairline bg-void-bg-2 p-3'>
						<div className="text-lg font-bold text-void-accent">{multiStats.activeOperations}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Running</div>
					</div>
				</div>
			</div>

			{/* Load error banner */}
			{loadError && (
				<div className='mx-6 mt-4 flex items-start gap-2 rounded-xl border border-void-warning/30 bg-void-warning/5 p-3'>
					<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-void-warning' />
					<p className="text-[11px] text-void-fg-2 flex-1">{loadError}</p>
					<button
						onClick={retry}
						className="inline-flex items-center gap-1.5 text-[11px] font-medium text-void-fg-2 hover:text-void-fg-1 flex-shrink-0"
					>
						<RefreshCw className="w-3 h-3" /> Try again
					</button>
				</div>
			)}

			{/* Two-column layout */}
			<div className="flex-1 flex overflow-hidden min-h-0">
				{/* Left: Workspace list */}
				<div className="w-80 border-r border-void-border-2 flex flex-col">
					<div className='border-b border-void-hairline px-4 py-3'>
						<h3 className='text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>Projects</h3>
					</div>
					<div className="flex-1 overflow-y-auto p-3">
						<WorkspaceList />
					</div>
				</div>

				{/* Right: Thread selector */}
				<div className="flex-1 flex flex-col min-w-0">
					<MultiWorkspaceThreadSelector />
				</div>
			</div>
		</div>
	);
});

MultiView.displayName = 'MultiView';