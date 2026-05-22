/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
	useIsDark, useChatThreadsState, useFullChatThreadsStreamState,
	useOnAgentManagerOpenFile, useOnAgentManagerOpenWalkthrough, useOnAgentManagerOpenContent,
	useWorkspaceFolders, useAccessor, useStandaloneSessions, useActiveStandaloneSession, useAllWorkspaces
} from '../util/services.js';
import { AgentChat } from './AgentChat.js';
import { PastThreadsList } from '../sidebar-tsx/SidebarThreadSelector.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import {
	Settings, X, Maximize2, Search, ExternalLink, Code, Plus, Zap,
	MessageSquare, Folder, Activity, Globe, ChevronRight, Layers, Trash2, Edit3
} from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import '../styles.css';

import { CodePreview } from './CodePreview.js';
import { ContentPreview } from './ContentPreview.js';
import { WorkspacesView } from './WorkspacesView.js';
import { DashboardView } from './DashboardView.js';
import { MultiView } from './MultiView.js';
import { useWindowSize } from './useWindowSize.js';
import { StandaloneSession } from '../../../../common/chatThreadServiceTypes.js';

// ------------------------------------------------------------------
//  Top nav item
// ------------------------------------------------------------------
const NavItem = ({ active, onClick, label, icon: Icon }: {
	active: boolean;
	onClick: () => void;
	label: string;
	icon: React.ElementType;
}) => (
	<button
		onClick={onClick}
		className={`
			flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150
			${active
				? 'bg-white/5 text-white'
				: 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
			}
		`}
		title={label}
	>
		<Icon className="w-4 h-4" strokeWidth={active ? 2 : 1.5} />
		<span>{label}</span>
	</button>
);

// ------------------------------------------------------------------
//  Session card
// ------------------------------------------------------------------
const SessionCard = ({ session, isActive, onClick, onDelete, onRename }: {
	session: StandaloneSession;
	isActive: boolean;
	onClick: () => void;
	onDelete: () => void;
	onRename: (name: string) => void;
}) => {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(session.name);
	const workspaces = useAllWorkspaces();
	const ws = session.workspaceId ? workspaces.find(w => w.id === session.workspaceId) : null;

	const commit = () => {
		if (name.trim() && name !== session.name) onRename(name.trim());
		setEditing(false);
	};

	return (
		<div
			onClick={onClick}
			className={`
				group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm
				${isActive ? 'bg-white/5 text-zinc-100' : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'}
			`}
		>
			<MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
			<div className="flex-1 min-w-0">
				{editing ? (
					<input
						value={name}
						onChange={e => setName(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter') commit();
							if (e.key === 'Escape') { setName(session.name); setEditing(false); }
						}}
						autoFocus
						className="w-full bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-400"
						onBlur={commit}
						onClick={e => e.stopPropagation()}
					/>
				) : (
					<div className="flex items-center gap-1.5 min-w-0">
						<span className="truncate font-medium">{session.name}</span>
						{ws && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />}
					</div>
				)}
			</div>
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
				<button
					onClick={e => { e.stopPropagation(); setEditing(true); }}
					className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
				>
					<Edit3 className="w-3 h-3" />
				</button>
				<button
					onClick={e => { e.stopPropagation(); onDelete(); }}
					className="p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
				>
					<Trash2 className="w-3 h-3" />
				</button>
			</div>
		</div>
	);
};

// ------------------------------------------------------------------
//  Left sidebar
// ------------------------------------------------------------------
const Sidebar = ({
	sessions, activeId, onSwitch, onDelete, onRename,
	searchQuery, setSearchQuery, onNewThread, threadsCount, handleNewSession
}: {
	sessions: StandaloneSession[];
	activeId: string | null;
	onSwitch: (id: string) => void;
	onDelete: (id: string) => void;
	onRename: (id: string, name: string) => void;
	searchQuery: string;
	setSearchQuery: (q: string) => void;
	onNewThread: () => void;
	threadsCount: number;
	handleNewSession: () => void;
}) => {
	const [openSessions, setOpenSessions] = useState(true);
	const [openConversations, setOpenConversations] = useState(true);

	return (
		<div className="w-72 border-r border-zinc-800 flex flex-col h-full bg-[#0c0c0c]">
			{/* Search */}
			<div className="px-4 pt-4 pb-3 flex-shrink-0">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
					<input
						type="text"
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						placeholder="Search..."
						className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
					/>
				</div>
			</div>

			{/* New Conversation */}
			<div className="px-4 pb-3 flex-shrink-0">
				<button
					onClick={onNewThread}
					className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-sm font-medium text-zinc-200 transition-all"
				>
					<Plus className="w-4 h-4" />
					New chat
				</button>
			</div>

			{/* Scrollable */}
			<div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
				{/* Sessions */}
				<div className="mb-3">
					<button
						onClick={() => setOpenSessions(!openSessions)}
						className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-400 transition-colors"
					>
						<ChevronRight className={`w-3 h-3 transition-transform ${openSessions ? 'rotate-90' : ''}`} />
						Sessions
						<span className="text-[10px] text-zinc-600 ml-1">{sessions.length}</span>
					</button>
					{openSessions && (
						<div className="space-y-0.5">
							{sessions.map(s => (
								<SessionCard
									key={s.id}
									session={s}
									isActive={s.id === activeId}
									onClick={() => onSwitch(s.id)}
									onDelete={() => onDelete(s.id)}
									onRename={name => onRename(s.id, name)}
								/>
							))}
							<button
								onClick={handleNewSession}
								className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-2 rounded-lg transition-colors"
							>
								<Plus className="w-3 h-3" />
								New Session
							</button>
						</div>
					)}
				</div>

				{/* Conversations */}
				<div className="mb-3">
					<button
						onClick={() => setOpenConversations(!openConversations)}
						className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-400 transition-colors"
					>
						<ChevronRight className={`w-3 h-3 transition-transform ${openConversations ? 'rotate-90' : ''}`} />
						Conversations
						<span className="text-[10px] text-zinc-600 ml-1">{threadsCount}</span>
					</button>
					{openConversations && (
						<ErrorBoundary>
							<div><PastThreadsList searchQuery={searchQuery} /></div>
						</ErrorBoundary>
					)}
				</div>
			</div>

			{/* Bottom: current session */}
			<div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-2 flex-shrink-0">
				<div className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center">
					<Zap className="w-3.5 h-3.5 text-zinc-400" />
				</div>
				<div className="min-w-0">
					<span className="text-xs font-medium text-zinc-300 truncate">{sessions.find(s => s.id === activeId)?.name || 'General'}</span>
					<span className="text-[10px] text-zinc-600 block">Agent Manager</span>
				</div>
			</div>
		</div>
	);
};

// ------------------------------------------------------------------
//  Main AgentManager
// ------------------------------------------------------------------
export const AgentManager = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const { width } = useWindowSize(100);
	const [tab, setTab] = useState<'chats' | 'workspaces' | 'dashboard' | 'multi'>('chats');
	const [preview, setPreview] = useState(true);
	const [sidebar, setSidebar] = useState(true);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [walkthrough, setWalkthrough] = useState<{ filePath: string, preview: string } | null>(null);
	const [content, setContent] = useState<{ title: string, content: string } | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	const sessions = useStandaloneSessions();
	const { activeId, activeSession, setActiveId } = useActiveStandaloneSession();
	const workspaces = useAllWorkspaces();

	useEffect(() => {
		if (width < 1280) setPreview(false);
		if (width < 768) setSidebar(false);
	}, [width]);

	const fileUri = useMemo(() => selectedFile ? URI.file(selectedFile) : null, [selectedFile]);

	const handleOpenFile = useCallback((uri: URI) => {
		setSelectedFile(uri.fsPath); setWalkthrough(null); setContent(null); setPreview(true);
	}, []);
	const handleOpenWalkthrough = useCallback((d: { filePath: string, preview: string }) => {
		setWalkthrough(d); setSelectedFile(null); setContent(null); setPreview(true);
	}, []);
	const handleOpenContent = useCallback((d: { title: string, content: string }) => {
		setContent(d); setSelectedFile(null); setWalkthrough(null); setPreview(true);
	}, []);

	useOnAgentManagerOpenFile(handleOpenFile);
	useOnAgentManagerOpenWalkthrough(handleOpenWalkthrough);
	useOnAgentManagerOpenContent(handleOpenContent);

	const chatThreadsState = useChatThreadsState();
	const streamState = useFullChatThreadsStreamState();

	const handleNewSession = useCallback(() => {
		const ss = accessor.get('IStandaloneSessionService');
		if (ss) {
			const s = ss.createSession('New Session');
			setActiveId(s.id);
			const ts = accessor.get('IChatThreadService');
			if (ts) ts.openNewThread();
		}
	}, [accessor, setActiveId]);

	const handleSwitchSession = useCallback((id: string) => {
		const ss = accessor.get('IStandaloneSessionService');
		if (ss) { ss.switchToSession(id); setActiveId(id); }
		const ts = accessor.get('IChatThreadService');
		if (ts) ts.openNewThread();
	}, [accessor, setActiveId]);

	const handleDeleteSession = useCallback((id: string) => {
		const ss = accessor.get('IStandaloneSessionService');
		if (ss) ss.deleteSession(id);
	}, [accessor]);

	const handleRenameSession = useCallback((id: string, name: string) => {
		const ss = accessor.get('IStandaloneSessionService');
		if (ss) ss.renameSession(id, name);
	}, [accessor]);

	const handleNewThread = useCallback(() => {
		const ts = accessor.get('IChatThreadService');
		if (ts) { ts.openNewThread(); setTab('chats'); }
	}, [accessor]);

	const handleOpenSettings = useCallback(() => {
		const cs = accessor.get('ICommandService');
		if (cs) cs.executeCommand('workbench.action.openSettings', 'void');
	}, [accessor]);

	const handleOpenInEditor = useCallback(() => {
		if (!fileUri) return;
		const es = accessor.get('IEditorService');
		if (es) es.openEditor({ resource: fileUri });
	}, [fileUri, accessor]);

	const stats = useMemo(() => {
		const threads = Object.values(chatThreadsState?.allThreads ?? {});
		let messagesCount = 0;
		let totalActiveTime = 0;
		for (const thread of threads) {
			messagesCount += thread.messages?.filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant').length ?? 0;
			const created = new Date(thread.createdAt).getTime();
			const modified = new Date(thread.lastModified).getTime();
			totalActiveTime += Math.min(modified - created, 8 * 60 * 60 * 1000);
		}
		let totalTokens = 0;
		for (const threadId in streamState) {
			const usage = streamState[threadId]?.tokenUsage;
			if (usage?.used) totalTokens += usage.used;
		}
		return { threadsCount: threads.length, messagesCount, activeTime: totalActiveTime, totalTokens };
	}, [chatThreadsState, streamState]);

	const threadsCount = Object.keys(chatThreadsState?.allThreads ?? {}).length;

	// ------------------------------------------------------------------
	//  Render
	// ------------------------------------------------------------------
	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="absolute inset-0 flex flex-col bg-[#080808] text-zinc-300 overflow-hidden font-sans antialiased"
				role="application" aria-label="A-Coder Agent Manager"
			>

				{/* === Top bar === */}
				<header className="h-12 flex-shrink-0 z-40 px-6 flex items-center justify-between border-b border-zinc-800 bg-[#0c0c0c]"
				>
					<div className="flex items-center gap-6"
					>
						{/* Brand */}
						<div className="flex items-center gap-2">
							<div className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center">
								<Zap className="w-3.5 h-3.5 text-zinc-100" />
							</div>
							<span className="text-sm font-semibold text-zinc-100">Agent Manager</span>
						</div>

						{/* Nav */}
						<nav className="flex items-center gap-1">
							<NavItem active={tab === 'chats'} onClick={() => setTab('chats')} label="Chat" icon={MessageSquare} />
							<NavItem active={tab === 'workspaces'} onClick={() => setTab('workspaces')} label="Files" icon={Folder} />
							<NavItem active={tab === 'dashboard'} onClick={() => setTab('dashboard')} label="Overview" icon={Activity} />
							<NavItem active={tab === 'multi'} onClick={() => setTab('multi')} label="Multi" icon={Globe} />
						</nav>
					</div>

					<div className="flex items-center gap-2">
						<button
							onClick={handleOpenSettings}
							className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition-colors"
							title="Settings"
						>
							<Settings className="w-4 h-4" />
						</button>
					</div>
				</header>

				{/* === Body === */}
				<div className="flex-1 flex overflow-hidden h-full min-h-0 relative">

					{/* Sidebar */}
					{sidebar && (
						<Sidebar
							sessions={sessions}
							activeId={activeId}
							onSwitch={handleSwitchSession}
							onDelete={handleDeleteSession}
							onRename={handleRenameSession}
							searchQuery={searchQuery}
							setSearchQuery={setSearchQuery}
							onNewThread={handleNewThread}
							threadsCount={threadsCount}
							handleNewSession={handleNewSession}
						/>
					)}

					{/* Main content */}
					<main className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden"
					>
						<div className="flex-1 h-full overflow-hidden relative min-h-0"
						>
							<ErrorBoundary>
								{tab === 'dashboard' ? (
									<DashboardView
										stats={stats}
										onNewThread={handleNewThread}
										onBrowseFiles={() => setTab('workspaces')}
										onOpenSettings={handleOpenSettings}
									/>
								) : tab === 'multi' ? (
									<MultiView onNewThread={handleNewThread} onOpenSettings={handleOpenSettings} />
								) : tab === 'workspaces' ? (
									<WorkspacesView />
								) : (
									<div className="h-full flex flex-col">
										{activeSession?.workspaceId && (
											<div className="flex-shrink-0 px-6 py-2 border-b border-zinc-800 flex items-center gap-2"
											>
												<div className="w-2 h-2 rounded-full" style={{
													backgroundColor: workspaces.find(w => w.id === activeSession.workspaceId)?.color || '#666'
												}} />
												<span className="text-xs text-zinc-500">
													Linked to {activeSession.workspaceName || 'Unknown workspace'}
												</span>
											</div>
										)}
										<div className="flex-1 min-h-0 overflow-hidden"
>
											<AgentChat />
										</div>
									</div>
								)}
							</ErrorBoundary>
						</div>
					</main>

					{/* Preview */}
					{preview && (
						<aside className="w-80 xl:w-96 border-l border-zinc-800 flex flex-col bg-[#0c0c0c] flex-shrink-0 h-full min-h-0"
						>
							<div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 flex-shrink-0"
							>
								<div className="flex items-center gap-2 min-w-0 flex-1"
								>
									<Code className="w-4 h-4 text-zinc-500 flex-shrink-0" />
									<span className="text-xs font-medium text-zinc-300 truncate"
										title={selectedFile ? selectedFile.split('/').pop() : walkthrough ? walkthrough.filePath.split('/').pop() : content ? content.title : 'No selection'}
									>
										{selectedFile
											? selectedFile.split('/').pop()
											: walkthrough
												? walkthrough.filePath.split('/').pop()
												: content
													? content.title
														: 'No selection'
										}
									</span>
								</div>
								<div className="flex items-center gap-0.5 flex-shrink-0 ml-2"
	>
									{selectedFile && (
										<button
											onClick={handleOpenInEditor}
											className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition-colors"
											title="Open in Editor"
										>
											<ExternalLink className="w-3.5 h-3.5" />
										</button>
										)}
									<button
										onClick={() => { setPreview(false); setSelectedFile(null); setWalkthrough(null); setContent(null); }}
										className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition-colors"
										title="Close"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-hidden min-h-0 bg-[#080808]"
	>
								<ErrorBoundary>
									{fileUri ? (
										<CodePreview selectedFileUri={fileUri} />
									) : walkthrough ? (
										<ContentPreview title="Walkthrough" content={walkthrough.preview} />
									) : content ? (
										<ContentPreview title={content.title} content={content.content} />
									) : (
										<CodePreview selectedFileUri={null} />
									)}
								</ErrorBoundary>
							</div>
						</aside>
					)}

					{/* Toggle */}
					{!preview && (
						<button
							onClick={() => setPreview(true)}
							className="absolute bottom-5 right-5 h-9 px-3 bg-zinc-900 border border-zinc-800 rounded-lg shadow flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all z-50"
							title="Preview"
						>
							<Maximize2 className="w-3.5 h-3.5" />
							Preview
						</button>
					)}
				</div>
			</div>
		</div>
	);
};
