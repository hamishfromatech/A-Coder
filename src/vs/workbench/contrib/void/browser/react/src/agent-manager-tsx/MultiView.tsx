/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { useAllWorkspaces, useMultiWorkspaceStats } from '../util/services.js';
import { WorkspaceList } from './WorkspaceList.js';
import { MultiWorkspaceThreadSelector } from './MultiWorkspaceThreadSelector.js';

interface MultiViewProps {
	onNewThread: () => void;
	onOpenSettings: () => void;
}

export const MultiView = memo(({ onNewThread, onOpenSettings }: MultiViewProps) => {
	const { workspaces: allWorkspaces } = useAllWorkspaces();
	const multiStats = useMultiWorkspaceStats();

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-6 border-b border-void-border-2">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h2 className="text-xl font-bold text-void-fg-1 tracking-tight flex items-center gap-2">
							<Globe className="w-5 h-5 text-void-accent" aria-hidden="true" />
							All Projects
						</h2>
						<p className="text-xs text-void-fg-4 mt-1">See and control every A-Coder project from one place</p>
					</div>
					<div className="flex items-center gap-2">
						{multiStats.activeWorkspaces > 0 && (
							<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
								<div className="relative" aria-hidden="true">
									<div className="w-2 h-2 rounded-full bg-emerald-500" />
									<div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
								</div>
								<span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">{multiStats.activeWorkspaces} active</span>
							</div>
						)}
					</div>
				</div>

				{/* Aggregated stats */}
				<div className="grid grid-cols-4 gap-3" role="region" aria-label="Workspace statistics">
					<div className="p-3 rounded-xl bg-void-bg-2 border border-void-border-2">
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalWorkspaces}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Projects</div>
					</div>
					<div className="p-3 rounded-xl bg-void-bg-2 border border-void-border-2">
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalThreads}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Tasks</div>
					</div>
					<div className="p-3 rounded-xl bg-void-bg-2 border border-void-border-2">
						<div className="text-lg font-bold text-void-fg-1">{multiStats.totalMessages}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Messages</div>
					</div>
					<div className="p-3 rounded-xl bg-void-bg-2 border border-void-border-2">
						<div className="text-lg font-bold text-void-accent">{multiStats.activeOperations}</div>
						<div className="text-[10px] text-void-fg-4 uppercase tracking-wider">Running</div>
					</div>
				</div>
			</div>

			{/* Two-column layout */}
			<div className="flex-1 flex overflow-hidden min-h-0">
				{/* Left: Workspace list */}
				<div className="w-80 border-r border-void-border-2 flex flex-col">
					<div className="p-4 border-b border-void-border-2">
						<h3 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider">Projects</h3>
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