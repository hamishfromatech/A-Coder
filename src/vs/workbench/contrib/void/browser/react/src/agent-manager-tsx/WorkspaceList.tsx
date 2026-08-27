/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';
import { WorkspaceConnection } from '../../../../common/workspaceRegistryTypes.js';
import { useAllWorkspaces, useSelectedWorkspace, useWorkspaceRemoteControl } from '../util/services.js';
import { Folder, MessageSquare, Activity, Circle, ChevronRight, ExternalLink } from 'lucide-react';
import { StatusDot, type StatusTone } from '../util/status.js';

/**
 * Status indicator — the shared StatusDot vocabulary (good/muted/warn/bad).
 */
const STATUS_TONE: Record<WorkspaceConnection['status'], StatusTone> = {
	connected: 'good',
	inactive: 'warn',
	disconnected: 'muted',
};
const StatusIndicator = ({ status }: { status: WorkspaceConnection['status'] }) => {
	return <StatusDot tone={STATUS_TONE[status]} className='size-2' />;
};

/**
 * Individual workspace card component
 */
const WorkspaceCard = ({
	workspace,
	isSelected,
	onClick
}: {
	workspace: WorkspaceConnection,
	isSelected: boolean,
	onClick: () => void
}) => {
	const remoteControl = useWorkspaceRemoteControl();
	const totalMessages = useMemo(() => {
		return workspace.threads.reduce((sum, t) => sum + t.messageCount, 0);
	}, [workspace.threads]);

	const activeThreads = useMemo(() => {
		return workspace.threads.filter(t => t.status === 'streaming').length;
	}, [workspace.threads]);

	const focus = (e: React.MouseEvent) => {
		e.stopPropagation();
		remoteControl.sendCommand({ type: 'focus', targetWorkspaceId: workspace.id });
	};

	return (
		<div
			onClick={onClick}
			role="button"
			tabIndex={0}
			onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
			className={`
				group w-full cursor-pointer rounded-lg p-2.5 text-left transition-colors
				${isSelected
					? 'bg-void-row-hover ring-1 ring-void-accent/40'
					: 'hover:bg-void-row-hover'
				}
			`}
		>
			<div className="flex items-start gap-3">
				{/* Workspace color badge */}
				<div
					className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center shadow-md"
					style={{ backgroundColor: workspace.color + '20', borderColor: workspace.color + '40', borderWidth: 1 }}
				>
					<Folder className="w-5 h-5" style={{ color: workspace.color }} />
				</div>

				{/* Workspace info */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<span className="text-sm font-semibold text-void-fg-1 truncate">{workspace.name}</span>
						<StatusIndicator status={workspace.status} />
					</div>
					<span className="text-[10px] text-void-fg-4 truncate block opacity-70 font-mono">
						{workspace.path.split('/').pop() || workspace.path}
					</span>
				</div>

				{/* Chevron for selected */}
				{isSelected && (
					<ChevronRight className="w-4 h-4 text-void-accent flex-shrink-0" />
				)}
			</div>

			{/* Stats row */}
			<div className="mt-2 flex items-center gap-3 border-t border-void-hairline pt-1.5">
				<div className="flex items-center gap-1.5">
					<MessageSquare className="w-3 h-3 text-void-fg-4" />
					<span className="text-[10px] font-medium text-void-fg-3">{workspace.threads.length} tasks</span>
				</div>
				<div className="flex items-center gap-1.5">
					<Activity className="w-3 h-3 text-void-fg-4" />
					<span className="text-[10px] font-medium text-void-fg-3">{totalMessages} msgs</span>
				</div>
				{activeThreads > 0 && (
					<div className="flex items-center gap-1.5">
						<Circle className="w-2 h-2 text-void-accent fill-current animate-pulse" />
						<span className="text-[10px] font-medium text-void-accent">{activeThreads} running</span>
					</div>
				)}
				<button
					onClick={focus}
					className="ml-auto rounded px-2 py-0.5 text-[10px] font-medium text-void-scaffold-meta opacity-0 transition-colors hover:bg-void-row-hover hover:text-void-accent group-hover:opacity-100"
					title="Bring this window to the front"
				>
					<ExternalLink className="w-3 h-3" /> Focus
				</button>
			</div>
		</div>
	);
};

/**
 * Workspace list component showing all connected workspaces
 */
export const WorkspaceList = () => {
	const { workspaces, loadError } = useAllWorkspaces();
	const { selectedId, setSelected } = useSelectedWorkspace();

	// Sort workspaces: connected first, then by last seen
	const sortedWorkspaces = useMemo(() => {
		return [...workspaces].sort((a, b) => {
			// Connected workspaces first
			if (a.status === 'connected' && b.status !== 'connected') return -1;
			if (a.status !== 'connected' && b.status === 'connected') return 1;
			// Then by last seen (most recent first)
			return b.lastSeen - a.lastSeen;
		});
	}, [workspaces]);

	if (workspaces.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-void-fg-4">
				<div className="w-12 h-12 rounded-xl bg-void-bg-2 border border-dashed border-void-border-2 flex items-center justify-center mb-3">
					<Folder className="w-6 h-6 opacity-30" />
				</div>
				{loadError ? (
					<>
						<p className="text-xs font-medium text-void-fg-3">Couldn't load projects</p>
						<p className="text-[10px] text-void-fg-4 mt-1 opacity-70">{loadError}</p>
					</>
				) : (
					<>
						<p className="text-xs font-medium text-void-fg-3">No workspaces connected</p>
						<p className="text-[10px] text-void-fg-4 mt-1 opacity-70">Open another VS Code window to see it here</p>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{sortedWorkspaces.map(workspace => (
				<WorkspaceCard
					key={workspace.id}
					workspace={workspace}
					isSelected={selectedId === workspace.id}
					onClick={() => setSelected(selectedId === workspace.id ? null : workspace.id)}
				/>
			))}
		</div>
	);
};