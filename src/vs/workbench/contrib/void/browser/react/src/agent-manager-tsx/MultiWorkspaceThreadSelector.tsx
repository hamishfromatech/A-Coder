/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { WorkspaceThreadSummary, WorkspaceConnection } from '../../../../common/workspaceRegistryTypes.js';
import { useAllWorkspaces, useSelectedWorkspace, useMultiWorkspaceSearch, useWorkspaceRemoteControl } from '../util/services.js';
import { Circle, Search, X, Folder, Send, Square, ExternalLink, CornerDownLeft, Plus } from 'lucide-react';

/**
 * Thread status badge
 */
const ThreadStatusBadge = ({ status }: { status: WorkspaceThreadSummary['status'] }) => {
	const config = {
		idle: { bg: 'bg-void-bg-2', text: 'text-void-fg-4', label: 'Idle' },
		streaming: { bg: 'bg-void-accent/10', text: 'text-void-accent', label: 'Active', animate: true },
		awaiting_user: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Waiting' },
		error: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Error' }
	};

	const { bg, text, label, animate } = config[status];

	return (
		<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${bg} ${text}`}>
			{animate && <Circle className="w-1.5 h-1.5 fill-current animate-pulse" />}
			{label}
		</span>
	);
};


/**
 * A thread row with remote-control actions (Open / Stop / Send message / Add task).
 */
const RemoteThreadRow = ({ workspace, thread }: { workspace: WorkspaceConnection, thread: WorkspaceThreadSummary }) => {
	const remoteControl = useWorkspaceRemoteControl();
	const [composeMode, setComposeMode] = useState<'message' | 'task' | null>(null);
	const [draft, setDraft] = useState('');
	const [done, setDone] = useState<string | null>(null);

	const isRunning = thread.status === 'streaming';

	const open = () => {
		remoteControl.sendCommand({ type: 'openThread', targetWorkspaceId: workspace.id, threadId: thread.id });
	};
	const stop = () => {
		remoteControl.sendCommand({ type: 'stop', targetWorkspaceId: workspace.id, threadId: thread.id });
	};
	const submit = () => {
		const text = draft.trim();
		if (!text || !composeMode) return;
		if (composeMode === 'message') {
			remoteControl.sendCommand({ type: 'sendMessage', targetWorkspaceId: workspace.id, threadId: thread.id, userMessage: text });
			setDone('Sent — check that window.');
		} else {
			remoteControl.sendCommand({ type: 'createTask', targetWorkspaceId: workspace.id, threadId: thread.id, description: text });
			setDone('Task added — check that window.');
		}
		setDraft('');
		setComposeMode(null);
	};

	return (
		<div className="p-2 rounded-lg bg-void-bg-2/30 hover:bg-void-bg-2/50 transition-colors">
			<div className="flex items-center gap-2 mb-1">
				<span className="text-xs font-medium text-void-fg-1 truncate flex-1">{thread.title}</span>
				<ThreadStatusBadge status={thread.status} />
			</div>
			<div className="flex items-center gap-2 text-[10px] text-void-fg-4 mb-2">
				<span>{thread.messageCount} msgs</span>
				<span>•</span>
				<span>{new Date(thread.timestamp).toLocaleTimeString()}</span>
			</div>
			<div className="flex items-center gap-1 flex-wrap">
				<button
					onClick={open}
					className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-void-bg-1 hover:bg-void-bg-3 text-void-fg-2 border border-void-border-2 transition-colors"
					title="Open this conversation in that window"
				>
					<ExternalLink className="w-3 h-3" /> Open
				</button>
				{isRunning && (
					<button
						onClick={stop}
						className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors"
						title="Stop what A-Coder is doing in this conversation"
					>
						<Square className="w-3 h-3" /> Stop
					</button>
				)}
				{!isRunning && (
					<button
						onClick={() => { setComposeMode('message'); setDone(null); }}
						className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-void-bg-1 hover:bg-void-bg-3 text-void-fg-2 border border-void-border-2 transition-colors"
						title="Send a message to this conversation"
					>
						<Send className="w-3 h-3" /> Send
					</button>
				)}
				<button
					onClick={() => { setComposeMode('task'); setDone(null); }}
					className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-void-bg-1 hover:bg-void-bg-3 text-void-fg-2 border border-void-border-2 transition-colors"
					title="Add a task to this conversation's plan"
				>
					<Plus className="w-3 h-3" /> Add task
				</button>
			</div>
			{composeMode && (
				<div className="flex items-center gap-1 mt-2">
					<input
						value={draft}
						onChange={e => { setDraft(e.target.value); setDone(null); }}
						onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setComposeMode(null); setDraft(''); } }}
						placeholder={composeMode === 'message' ? 'Message…' : 'Task description…'}
						autoFocus
						className="flex-1 bg-void-bg-1 border border-void-border-2 rounded px-2 py-1 text-[11px] text-void-fg-1 placeholder:text-void-fg-4 focus:outline-none focus:border-void-accent/50"
					/>
					<button onClick={submit} className="p-1.5 rounded bg-void-accent/10 hover:bg-void-accent/20 text-void-accent" title={composeMode === 'message' ? 'Send (Enter)' : 'Add task (Enter)'}>
						<CornerDownLeft className="w-3 h-3" />
					</button>
				</div>
			)}
			{done && !composeMode && (
				<p className="text-[10px] text-emerald-500 mt-1.5">{done}</p>
			)}
		</div>
	);
};

/**
 * Threads grouped by workspace
 */
const WorkspaceThreadGroup = ({
	workspace,
	isExpanded,
	onToggle
}: {
	workspace: WorkspaceConnection,
	isExpanded: boolean,
	onToggle: () => void
}) => {
	const remoteControl = useWorkspaceRemoteControl();
	const sortedThreads = useMemo(() => {
		return [...workspace.threads].sort((a, b) => b.timestamp - a.timestamp);
	}, [workspace.threads]);

	const focus = (e: React.MouseEvent) => {
		e.stopPropagation();
		remoteControl.sendCommand({ type: 'focus', targetWorkspaceId: workspace.id });
	};

	return (
		<div className="border border-void-border-2 rounded-xl overflow-hidden">
			{/* Workspace header */}
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-3 p-3 bg-void-bg-2/50 hover:bg-void-bg-2/70 transition-colors"
			>
				<div
					className="w-4 h-4 rounded flex items-center justify-center"
					style={{ backgroundColor: workspace.color + '20' }}
				>
					<Folder className="w-3 h-3" style={{ color: workspace.color }} />
				</div>
				<span className="text-sm font-semibold text-void-fg-1 flex-1 text-left truncate">{workspace.name}</span>
				<span className="text-[10px] font-medium text-void-fg-4 px-1.5 py-0.5 rounded bg-void-bg-1">
					{workspace.threads.length}
				</span>
				<span
					onClick={focus}
					className="text-[10px] font-medium text-void-fg-3 hover:text-void-accent px-1.5 py-0.5 rounded hover:bg-void-bg-3 transition-colors"
					title="Bring this window to the front"
				>
					Focus
				</span>
				<svg
					className={`w-4 h-4 text-void-fg-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{/* Threads */}
			{isExpanded && (
				<div className="p-2 space-y-2 border-t border-void-border-2/50 bg-void-bg-1/30">
					{sortedThreads.length === 0 ? (
						<div className="text-center py-4 text-void-fg-4 text-xs">No conversations yet</div>
					) : (
						sortedThreads.map(thread => (
							<RemoteThreadRow key={thread.id} workspace={workspace} thread={thread} />
						))
					)}
				</div>
			)}
		</div>
	);
};

/**
 * Multi-workspace thread selector with search
 */
export const MultiWorkspaceThreadSelector = () => {
	const { workspaces } = useAllWorkspaces();
	const { selectedId } = useSelectedWorkspace();
	const remoteControl = useWorkspaceRemoteControl();
	const [searchQuery, setSearchQuery] = useState('');
	const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

	// Filter workspaces by selection
	const filteredWorkspaces = useMemo(() => {
		if (selectedId) {
			return workspaces.filter(w => w.id === selectedId);
		}
		return workspaces.filter(w => w.status === 'connected');
	}, [workspaces, selectedId]);

	// Search across all threads
	const searchResults = useMultiWorkspaceSearch(searchQuery);

	// Toggle workspace expansion
	const toggleWorkspace = (workspaceId: string) => {
		setExpandedWorkspaces(prev => {
			const next = new Set(prev);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	// Initialize expanded workspaces
	React.useEffect(() => {
		if (expandedWorkspaces.size === 0 && filteredWorkspaces.length > 0) {
			setExpandedWorkspaces(new Set(filteredWorkspaces.slice(0, 2).map(w => w.id)));
		}
	}, [filteredWorkspaces, expandedWorkspaces.size]);

	return (
		<div className="flex flex-col h-full">
			{/* Search bar */}
			<div className="p-3 border-b border-void-border-2">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-void-fg-4 opacity-40" />
					<input
						type="text"
						placeholder="Search across all workspaces..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full bg-void-bg-1 border border-void-border-2 rounded-lg pl-9 pr-8 py-2 text-xs text-void-fg-1 placeholder:text-void-fg-4 focus:outline-none focus:border-void-accent/50 transition-all"
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery('')}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-void-bg-2 rounded transition-colors"
						>
							<X className="w-3 h-3 text-void-fg-4" />
						</button>
					)}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-3">
				{searchQuery ? (
					// Search results view
					<div className="space-y-2">
						{searchResults.length === 0 ? (
							<div className="text-center py-8 text-void-fg-4">
								<p className="text-xs font-medium">No results found</p>
								<p className="text-[10px] opacity-60 mt-1">Try a different search term</p>
							</div>
						) : (
							searchResults.map(result => (
								<div
									key={`${result.workspaceId}-${result.id}`}
									onClick={() => remoteControl.sendCommand({ type: 'openThread', targetWorkspaceId: result.workspaceId, threadId: result.id })}
										className="p-3 rounded-lg bg-void-bg-2/30 hover:bg-void-bg-2/50 transition-colors w-full text-left"
										title="Open this conversation in that window"
								>
									<div className="flex items-center gap-2 mb-1">
										<div
											className="w-2 h-2 rounded-full"
											style={{ backgroundColor: result.workspaceColor }}
										/>
										<span className="text-xs font-medium text-void-fg-1 truncate flex-1">{result.title}</span>
										<ThreadStatusBadge status={result.status} />
									</div>
									<p className="text-[10px] text-void-fg-4 truncate mb-1 opacity-70">{result.lastMessage}</p>
									<div className="flex items-center gap-2 text-[10px] text-void-fg-4 opacity-60">
										<span>{result.workspaceName}</span>
										<span>•</span>
										<span>{result.messageCount} msgs</span>
									</div>
								</div>
							))
						)}
					</div>
				) : (
					// Grouped view by workspace
					<div className="space-y-3">
						{filteredWorkspaces.map(workspace => (
							<WorkspaceThreadGroup
								key={workspace.id}
								workspace={workspace}
								isExpanded={expandedWorkspaces.has(workspace.id)}
								onToggle={() => toggleWorkspace(workspace.id)}
							/>
						))}
						{filteredWorkspaces.length === 0 && (
							<div className="text-center py-8 text-void-fg-4">
								<p className="text-xs font-medium">No workspaces available</p>
								<p className="text-[10px] opacity-60 mt-1">Open a workspace to see its threads</p>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};