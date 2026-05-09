/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsDark, useChatThreadsState, useFullChatThreadsStreamState, useOnAgentManagerOpenFile, useOnAgentManagerOpenWalkthrough, useOnAgentManagerOpenContent, useWorkspaceFolders, useAccessor, useStandaloneSessions, useActiveStandaloneSession, useAllWorkspaces } from '../util/services.js';
	import { AgentChat } from './AgentChat.js';
import { PastThreadsList } from '../sidebar-tsx/SidebarThreadSelector.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { Folder, MessageSquare, Code, Settings, X, Maximize2, Search, ExternalLink, Activity, ChevronRight, Plus, Globe, Sparkles, Zap, Layers, Trash2, Edit3 } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import '../styles.css';

// Extracted components
import { CodePreview } from './CodePreview.js';
import { ContentPreview } from './ContentPreview.js';
import { WorkspacesView } from './WorkspacesView.js';
import { StatCard } from './StatCard.js';
import { DashboardView } from './DashboardView.js';
import { MultiView } from './MultiView.js';
import { NavButton } from './NavButton.js';
import { useWindowSize } from './useWindowSize.js';
import { formatDuration, formatTokens } from './utils.js';
import { StandaloneSession } from '../../../../common/chatThreadServiceTypes.js';

// CSS for reduced motion preference
const reducedMotionStyles = `
	@media (prefers-reduced-motion: reduce) {
		* {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
`;

// Session card component
const SessionCard = ({ session, isActive, onClick, onDelete, onRename }: {
	session: StandaloneSession;
	isActive: boolean;
	onClick: () => void;
	onDelete: () => void;
	onRename: (name: string) => void;
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(session.name);
	const workspaces = useAllWorkspaces();
	const workspace = session.workspaceId ? workspaces.find(w => w.id === session.workspaceId) : null;

	const handleRename = () => {
		if (editName.trim() && editName !== session.name) {
			onRename(editName.trim());
		}
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') handleRename();
		if (e.key === 'Escape') {
			setEditName(session.name);
			setIsEditing(false);
		}
	};

	return (
		<div
			className={`
				group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all
				${isActive 
					? 'bg-void-accent/15 border border-void-accent/30 text-void-fg-1' 
					: 'bg-void-bg-1 border border-transparent text-void-fg-3 hover:bg-void-bg-3 hover:text-void-fg-1'
				}
			`}
			onClick={onClick}
		>
			<div className="flex-shrink-0 w-7 h-7 rounded-md bg-void-accent/20 flex items-center justify-center">
				<Layers className="w-3.5 h-3.5 text-void-accent" />
			</div>
			<div className="flex-1 min-w-0">
				{isEditing ? (
					<div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
						<input
							type="text"
							value={editName}
							onChange={e => setEditName(e.target.value)}
							onKeyDown={handleKeyDown}
							autoFocus
							className="w-full bg-void-bg-2 border border-void-accent/30 rounded px-2 py-1 text-xs text-void-fg-1 focus:outline-none"
							onBlur={handleRename}
						/>
					</div>
				) : (
					<div className="flex items-center gap-1.5">
						<span className="text-sm font-medium truncate">{session.name}</span>
						{workspace && (
							<div 
								className="w-2 h-2 rounded-full flex-shrink-0"
								style={{ backgroundColor: workspace.color }}
								title={workspace.name}
							/>
						)}
					</div>
				)}
				{session.workspaceName && !isEditing && (
					<span className="text-[10px] text-void-fg-4 truncate block">
						{session.workspaceName}
					</span>
				)}
			</div>
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
				<button
					onClick={e => {
						e.stopPropagation();
						setIsEditing(true);
					}}
					className="p-1 hover:bg-void-bg-2 rounded text-void-fg-4 hover:text-void-fg-1 transition-colors"
					title="Rename session"
				>
					<Edit3 className="w-3 h-3" />
				</button>
				<button
					onClick={e => {
						e.stopPropagation();
						onDelete();
					}}
					className="p-1 hover:bg-red-500/10 rounded text-void-fg-4 hover:text-red-400 transition-colors"
					title="Delete session"
				>
					<Trash2 className="w-3 h-3" />
				</button>
			</div>
		</div>
	);
};

// Session selector sidebar
const SessionSelector = ({ 
	sessions, 
	activeId, 
	onSwitch, 
	onCreate, 
	onDelete, 
	onRename,
	isOpen,
	onToggle
}: {
	sessions: StandaloneSession[];
	activeId: string | null;
	onSwitch: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onRename: (id: string, name: string) => void;
	isOpen: boolean;
	onToggle: () => void;
}) => {
	return (
		<div className={`
			absolute inset-y-0 left-0 z-50 bg-void-bg-2 border-r border-void-border-2 flex flex-col
			transition-all duration-300 ease-in-out
			${isOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full overflow-hidden border-r-0'}
		`}>
			{isOpen && (
				<>
					<div className="flex items-center justify-between p-3 border-b border-void-border-2">
						<div className="flex items-center gap-2">
							<Layers className="w-4 h-4 text-void-accent" />
							<h3 className="text-xs font-bold text-void-fg-1 uppercase tracking-wider">Sessions</h3>
							<span className="px-1.5 py-0.5 rounded-full bg-void-accent/10 text-void-accent text-[9px] font-bold">
								{sessions.length}
							</span>
						</div>
						<button
							onClick={onToggle}
							className="p-1.5 hover:bg-void-bg-3 rounded-lg text-void-fg-4 hover:text-void-fg-1 transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
					<div className="flex-1 overflow-y-auto p-2 space-y-1">
						{sessions.map(session => (
							<SessionCard
								key={session.id}
								session={session}
								isActive={session.id === activeId}
								onClick={() => onSwitch(session.id)}
								onDelete={() => onDelete(session.id)}
								onRename={name => onRename(session.id, name)}
							/>
						))}
					</div>
					<div className="p-3 border-t border-void-border-2">
						<button
							onClick={onCreate}
							className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-void-accent/10 hover:bg-void-accent/20 text-void-accent text-sm font-medium transition-colors border border-void-accent/20"
						>
							<Plus className="w-4 h-4" />
							New Session
						</button>
					</div>
				</>
			)}
		</div>
	);
};

export const AgentManager = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const { width: windowWidth } = useWindowSize(100);
	const [activeTab, setActiveTab] = useState<'dashboard' | 'chats' | 'workspaces' | 'multi'>('chats');
	const [showPreview, setShowPreview] = useState(true);
	const [showSidebar, setShowSidebar] = useState(true);
	const [showSessionSelector, setShowSessionSelector] = useState(false);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [walkthroughData, setWalkthroughData] = useState<{ filePath: string, preview: string } | null>(null);
	const [contentData, setContentData] = useState<{ title: string, content: string } | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	const sessions = useStandaloneSessions();
	const { activeId, activeSession, setActiveId } = useActiveStandaloneSession();
	const workspaces = useAllWorkspaces();

	// Handle responsive sidebar/preview visibility
	useEffect(() => {
		if (windowWidth < 1280) {
			setShowPreview(false);
		}
		if (windowWidth < 900) {
			setShowSidebar(false);
		}
	}, [windowWidth]);

	const selectedFileUri = useMemo(() => selectedFile ? URI.file(selectedFile) : null, [selectedFile]);

	// File open handlers with stable references
	const handleOpenFile = useCallback((uri: URI) => {
		setSelectedFile(uri.fsPath);
		setWalkthroughData(null);
		setContentData(null);
		setShowPreview(true);
	}, []);

	const handleOpenWalkthrough = useCallback((data: { filePath: string, preview: string }) => {
		setWalkthroughData(data);
		setSelectedFile(null);
		setContentData(null);
		setShowPreview(true);
	}, []);

	const handleOpenContent = useCallback((data: { title: string, content: string }) => {
		setContentData(data);
		setSelectedFile(null);
		setWalkthroughData(null);
		setShowPreview(true);
	}, []);

	useOnAgentManagerOpenFile(handleOpenFile);
	useOnAgentManagerOpenWalkthrough(handleOpenWalkthrough);
	useOnAgentManagerOpenContent(handleOpenContent);

	const chatThreadsState = useChatThreadsState();
	const streamState = useFullChatThreadsStreamState();
	const workspaceFolders = useWorkspaceFolders();

	// Session management handlers
	const handleNewSession = useCallback(() => {
		const standaloneService = accessor.get('IStandaloneSessionService');
		if (standaloneService) {
			const newSession = standaloneService.createSession('New Session');
			setActiveId(newSession.id);
			
			// Also create a new chat thread for this session
			const chatThreadService = accessor.get('IChatThreadService');
			if (chatThreadService) {
				chatThreadService.openNewThread();
			}
		}
	}, [accessor, setActiveId]);

	const handleSwitchSession = useCallback((sessionId: string) => {
		const standaloneService = accessor.get('IStandaloneSessionService');
		if (standaloneService) {
			standaloneService.switchToSession(sessionId);
			setActiveId(sessionId);
			
			// Create a new thread when switching sessions for isolation
			const chatThreadService = accessor.get('IChatThreadService');
			if (chatThreadService) {
				chatThreadService.openNewThread();
			}
		}
	}, [accessor, setActiveId]);

	const handleDeleteSession = useCallback((sessionId: string) => {
		const standaloneService = accessor.get('IStandaloneSessionService');
		if (standaloneService) {
			standaloneService.deleteSession(sessionId);
		}
	}, [accessor]);

	const handleRenameSession = useCallback((sessionId: string, name: string) => {
		const standaloneService = accessor.get('IStandaloneSessionService');
		if (standaloneService) {
			standaloneService.renameSession(sessionId, name);
		}
	}, [accessor]);

	// Calculate stats from threads and stream state
	const stats = useMemo(() => {
		const threads = Object.values(chatThreadsState.allThreads);
		const threadsCount = threads.length;
		let messagesCount = 0;
		let totalActiveTime = 0;

		for (const thread of threads) {
			messagesCount += thread.messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
			const created = new Date(thread.createdAt).getTime();
			const modified = new Date(thread.lastModified).getTime();
			const sessionTime = modified - created;
			totalActiveTime += Math.min(sessionTime, 8 * 60 * 60 * 1000);
		}

		let totalTokens = 0;
		for (const threadId in streamState) {
			const usage = streamState[threadId]?.tokenUsage;
			if (usage?.used) {
				totalTokens += usage.used;
			}
		}

		return {
			threadsCount,
			messagesCount,
			activeTime: totalActiveTime,
			totalTokens,
		};
	}, [chatThreadsState.allThreads, streamState]);

	// Action handlers with stable references
	const handleNewThread = useCallback(() => {
		const chatThreadService = accessor.get('IChatThreadService');
		if (chatThreadService) {
			chatThreadService.openNewThread();
			setActiveTab('chats');
		}
	}, [accessor]);

	const handleBrowseFiles = useCallback(() => {
		setActiveTab('workspaces');
	}, []);

	const handleOpenSettings = useCallback(() => {
		const commandService = accessor.get('ICommandService');
		if (commandService) {
			commandService.executeCommand('workbench.action.openSettings', 'void');
		}
	}, [accessor]);

	const handleOpenInEditor = useCallback(() => {
		if (selectedFileUri) {
			const editorService = accessor.get('IEditorService');
			if (editorService) {
				editorService.openEditor({ resource: selectedFileUri });
			}
		}
	}, [selectedFileUri, accessor]);

	const handleShowSidebar = useCallback(() => setShowSidebar(true), []);
	const handleHideSidebar = useCallback(() => setShowSidebar(false), []);
	const handleShowPreview = useCallback(() => setShowPreview(true), []);
	const handleHidePreview = useCallback(() => {
		setShowPreview(false);
		setSelectedFile(null);
		setWalkthroughData(null);
		setContentData(null);
	}, []);

	const handleClearSearch = useCallback(() => setSearchQuery(''), []);

	// Derived state
	const threadsCount = Object.keys(chatThreadsState.allThreads).length;
	const previewTitle = selectedFile
		? selectedFile.split('/').pop()
		: walkthroughData
			? walkthroughData.filePath.split('/').pop()
			: contentData
				? contentData.title
				: 'No selection';

	// Current session info for header
	const currentSessionName = activeSession?.name || 'General';
	const currentSessionWorkspace = activeSession?.workspaceName;

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="absolute inset-0 flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans antialiased" role="application" aria-label="A-Coder Agent Manager">
				{/* Header — floating liquid-glass pill */}
				<header className="h-14 flex-shrink-0 z-50 px-4 sm:px-6 flex items-center gap-4">
					{/* Thread sidebar toggle (shows when sidebar is hidden) */}
					{!showSidebar && (
						<button
							onClick={handleShowSidebar}
							className="flex-shrink-0 p-1.5 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-all duration-300 text-void-fg-4 hover:text-void-fg-1"
							title="Show sidebar"
						>
							<ChevronRight className="w-4 h-4" strokeWidth={1.5} />
						</button>
					)}

					{/* Active session pill */}
					<div className="flex-1">
						<div className="inline-flex items-center gap-2 p-[3px] rounded-full bg-white/[0.03] ring-1 ring-white/[0.04] backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.05] hover:ring-white/[0.08]"
							style={{ transition: 'all 0.5s cubic-bezier(0.32, 0.72, 0, 1)' }}
						>
							<div className="w-6 h-6 rounded-full bg-void-accent/15 flex items-center justify-center">
								<Zap className="w-3 h-3 text-void-accent" strokeWidth={2} />
							</div>
							<span className="text-xs font-medium text-void-fg-1 pr-1.5">{currentSessionName}</span>
							{currentSessionWorkspace && (
								<span className="text-[10px] text-void-fg-4 mr-1">{currentSessionWorkspace}</span>
							)}
						</div>
					</div>

					{/* Settings */}
					<button
						onClick={handleOpenSettings}
						className="flex-shrink-0 p-1.5 rounded-xl hover:bg-white/[0.04] transition-all duration-300 text-void-fg-4 hover:text-void-fg-1 active:scale-[0.97]"
						title="Open Settings"
						aria-label="Open Settings"
					>
						<Settings className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</header>

				<div className="flex-1 flex overflow-hidden h-full min-h-0 bg-void-bg-3 relative">
				{/* Left Icon Rail — premium liquid-glass vertical dock */}
				<nav className="hidden sm:flex w-16 flex-shrink-0 border-r border-white/[0.04] bg-void-bg-2/80 backdrop-blur-sm flex-col items-center z-40 h-full" aria-label="Main navigation">
					<div className="flex flex-col items-center pt-4 pb-3 gap-1">
						<div className="p-[3px] rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06] mb-2">
							<div className="w-8 h-8 rounded-[calc(1rem-3px)] bg-void-accent/15 flex items-center justify-center">
								<Zap className="w-4 h-4 text-void-accent" strokeWidth={2} />
							</div>
						</div>
					</div>

					<div className="flex-1 flex flex-col items-center gap-1 py-4 overflow-y-auto custom-scrollbar w-full">
						<NavButton
							active={activeTab === 'chats'}
							onClick={() => { setActiveTab('chats'); setShowSidebar(true); }}
							icon={MessageSquare}
							title="Conversations"
							badge={stats.threadsCount}
						/>
						<NavButton
							active={activeTab === 'workspaces'}
							onClick={() => { setActiveTab('workspaces'); setShowSidebar(true); }}
							icon={Folder}
							title="Workspace Files"
						/>
						<NavButton
							active={activeTab === 'dashboard'}
							onClick={() => { setActiveTab('dashboard'); }}
							icon={Activity}
							title="Overview"
						/>
						<NavButton
							active={activeTab === 'multi'}
							onClick={() => { setActiveTab('multi'); setShowSidebar(true); }}
							icon={Globe}
							title="All Workspaces"
						/>
					</div>

					{/* Session quick-switcher bottom */}
					<div className="flex flex-col items-center pb-4 pt-3 border-t border-white/[0.04] w-full gap-1">
						<NavButton
							active={showSessionSelector}
							onClick={() => setShowSessionSelector(!showSessionSelector)}
							icon={Layers}
							title="Sessions"
							badge={sessions.length}
						/>
					</div>
				</nav>

				{/* Session Selector Overlay */}
				<SessionSelector
					sessions={sessions}
					activeId={activeId}
					onSwitch={handleSwitchSession}
					onCreate={handleNewSession}
					onDelete={handleDeleteSession}
					onRename={handleRenameSession}
					isOpen={showSessionSelector}
					onToggle={() => setShowSessionSelector(!showSessionSelector)}
				/>

					{/* Thread/Content Sidebar */}
					{showSidebar && activeTab !== 'dashboard' && (
						<aside className="w-80 border-r border-void-border-2 flex flex-col bg-void-bg-2 flex-shrink-0 absolute inset-y-0 left-0 z-30 sm:static h-full min-h-0" aria-label={activeTab === 'chats' ? 'Conversations sidebar' : 'Files sidebar'}>
							<div className="p-4 border-b border-void-border-2 bg-void-bg-2 flex items-center justify-between flex-shrink-0">
								<div className="flex items-center gap-2">
									<h2 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider">
										{activeTab === 'chats' ? 'Conversations' : 'Workspace Files'}
									</h2>
									<span className="px-2 py-0.5 rounded-full bg-void-accent/10 text-void-accent text-[9px] font-bold border border-void-accent/20" aria-live="polite">
										{activeTab === 'chats' ? threadsCount : workspaceFolders.length}
									</span>
								</div>
								{activeTab === 'chats' && (
									<button
										onClick={handleNewThread}
										className="p-2 hover:bg-void-accent/10 hover:text-void-accent rounded-lg transition-all text-void-fg-4 focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
										title="New Chat"
										aria-label="Start new conversation"
									>
										<Plus className="w-4 h-4" />
									</button>
								)}
							</div>

							<div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
								<ErrorBoundary>
									{activeTab === 'chats' ? (
										<div className="p-2 space-y-1">
											<PastThreadsList searchQuery={searchQuery} />
										</div>
									) : (
										<WorkspacesView />
									)}
								</ErrorBoundary>
							</div>
						</aside>
					)}

					{/* Main Content */}
					<main className="flex-1 flex flex-col bg-void-bg-3 min-w-0 relative h-full overflow-hidden min-h-0">

						<div className="flex-1 h-full overflow-hidden relative min-h-0">
							<ErrorBoundary>
								{activeTab === 'dashboard' ? (
									<DashboardView
										stats={stats}
										onNewThread={handleNewThread}
										onBrowseFiles={handleBrowseFiles}
										onOpenSettings={handleOpenSettings}
									/>
								) : activeTab === 'multi' ? (
									<MultiView
										onNewThread={handleNewThread}
										onOpenSettings={handleOpenSettings}
									/>
								) : (
									<div className="h-full flex flex-col">
										{/* Session context banner */}
										{activeSession?.workspaceId && (
											<div className="flex-shrink-0 px-4 py-2 bg-void-accent/5 border-b border-void-accent/10 flex items-center gap-2">
												<div 
													className="w-2 h-2 rounded-full"
													style={{ 
														backgroundColor: workspaces.find(w => w.id === activeSession.workspaceId)?.color || '#666' 
													}}
												/>
												<span className="text-xs text-void-fg-3">
													Linked to: {activeSession.workspaceName || 'Unknown workspace'}
												</span>
											</div>
										)}
										<div className="flex-1 min-h-0 overflow-hidden">
											<AgentChat />
										</div>
									</div>
								)}
							</ErrorBoundary>
						</div>
					</main>

					{/* Right Preview Pane */}
					{showPreview && (
						<aside className="w-[400px] xl:w-[500px] border-l border-void-border-2 flex flex-col bg-void-bg-2 flex-shrink-0 absolute inset-y-0 right-0 xl:static z-40 h-full min-h-0" aria-label="File preview">
							<div className="h-14 border-b border-void-border-2 flex items-center justify-between px-4 bg-void-bg-2 flex-shrink-0">
								<div className="flex items-center gap-3 min-w-0 flex-1">
									<div className="p-2 rounded-lg bg-void-bg-3 border border-void-border-2 text-void-accent" aria-hidden="true">
										<Code className="w-4 h-4" />
									</div>
									<div className="flex flex-col min-w-0">
										<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider">Preview</span>
										<span className="text-xs font-semibold text-void-fg-1 truncate tracking-tight" title={previewTitle}>
											{previewTitle}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-1 flex-shrink-0 ml-2">
									{selectedFile && (
										<button
											onClick={handleOpenInEditor}
											className="p-2 hover:bg-void-accent/10 hover:text-void-accent rounded-lg transition-all text-void-fg-4 focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
											title="Open in Editor"
											aria-label="Open in editor"
										>
											<ExternalLink className="w-4 h-4" />
										</button>
									)}
									<button
										onClick={handleHidePreview}
										className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-void-fg-4 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
										title="Close preview"
										aria-label="Close preview"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-hidden min-h-0 bg-void-bg-3">
								<ErrorBoundary>
									{selectedFileUri ? (
										<CodePreview selectedFileUri={selectedFileUri} />
									) : walkthroughData ? (
										<ContentPreview title="Walkthrough" content={walkthroughData.preview} />
									) : contentData ? (
										<ContentPreview title={contentData.title} content={contentData.content} />
									) : (
										<CodePreview selectedFileUri={null} />
									)}
								</ErrorBoundary>
							</div>
						</aside>
					)}

					{/* Floating Preview Toggle */}
					{!showPreview && (
						<button
							onClick={handleShowPreview}
							className="absolute bottom-6 right-6 w-12 h-12 bg-void-accent text-white rounded-xl shadow-md flex items-center justify-center hover:bg-void-accent-hover transition-all z-50 border border-void-border-2 focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2"
							title="Show Preview"
							aria-label="Show preview pane"
						>
							<Maximize2 className="w-5 h-5" />
						</button>
					)}
				</div>
			</div>

			<style>{`
				${reducedMotionStyles}
				.custom-scrollbar::-webkit-scrollbar {
					width: 4px;
					height: 4px;
				}
				.custom-scrollbar::-webkit-scrollbar-track {
					background: transparent;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb {
					background: rgba(128, 128, 128, 0.2);
					border-radius: 4px;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb:hover {
					background: rgba(128, 128, 128, 0.3);
				}
			`}</style>
		</div>
	);
};