/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsDark, useChatThreadsState, useFullChatThreadsStreamState, useOnAgentManagerOpenFile, useOnAgentManagerOpenWalkthrough, useOnAgentManagerOpenContent, useWorkspaceFolders, useAccessor } from '../util/services.js';
import { SidebarChat } from '../sidebar-tsx/SidebarChat.js';
import { PastThreadsList } from '../sidebar-tsx/SidebarThreadSelector.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { Folder, MessageSquare, Code, Settings, X, Maximize2, Search, ExternalLink, Activity, ChevronRight, ChevronLeft, Plus, Globe, Sparkles, Zap } from 'lucide-react';
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

export const AgentManager = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const { width: windowWidth } = useWindowSize(100);
	const [activeTab, setActiveTab] = useState<'dashboard' | 'chats' | 'workspaces' | 'multi'>('chats');
	const [showPreview, setShowPreview] = useState(true);
	const [showSidebar, setShowSidebar] = useState(true);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [walkthroughData, setWalkthroughData] = useState<{ filePath: string, preview: string } | null>(null);
	const [contentData, setContentData] = useState<{ title: string, content: string } | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

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

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="absolute inset-0 flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans antialiased" role="application" aria-label="A-Coder Agent Manager">
				{/* Header */}
				<header className="h-16 border-b border-void-border-2 flex items-center justify-between px-6 flex-shrink-0 bg-void-bg-2 z-50">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 rounded-xl bg-void-accent flex items-center justify-center shadow-md" aria-hidden="true">
							<Zap className="text-white w-5 h-5 fill-current" />
						</div>
						<div className="hidden sm:flex flex-col">
							<h1 className="text-base font-bold text-void-fg-1 tracking-tight leading-none">A-Coder</h1>
							<span className="text-[10px] text-void-fg-4 font-medium">AI Assistant</span>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<div className="relative group hidden sm:block">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-void-fg-4 group-focus-within:text-void-accent transition-all opacity-40 group-focus-within:opacity-100" aria-hidden="true" />
							<label htmlFor="search-conversations" className="sr-only">Search conversations</label>
							<input
								id="search-conversations"
								type="text"
								placeholder="Search conversations..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="bg-void-bg-1 border border-void-border-2 rounded-xl pl-10 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-void-accent/50 focus:ring-2 focus:ring-void-accent/20 transition-all placeholder:text-void-fg-3 text-void-fg-1"
							/>
							{searchQuery && (
								<button
									onClick={handleClearSearch}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-void-fg-4 hover:text-void-fg-1 focus:outline-none focus:ring-2 focus:ring-void-accent rounded min-w-[28px] min-h-[28px] flex items-center justify-center"
									aria-label="Clear search"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</div>

						<button
							onClick={handleOpenSettings}
							className="p-2.5 hover:bg-void-bg-2 rounded-xl transition-all text-void-fg-4 hover:text-void-fg-1 focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
							title="Open Settings"
							aria-label="Open Settings"
						>
							<Settings className="w-5 h-5" />
						</button>
					</div>
				</header>

				<div className="flex-1 flex overflow-hidden h-full min-h-0 bg-void-bg-3">
					{/* Left Sidebar */}
					<nav className="hidden sm:flex w-56 flex-shrink-0 border-r border-void-border-2 bg-void-bg-2 flex-col z-40 h-full" aria-label="Main navigation">
						<div className="p-3 border-b border-void-border-2">
							<div className="px-3 py-2 rounded-lg bg-void-bg-1">
								<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider block mb-1">Workspace</span>
								<span className="text-sm font-semibold text-void-fg-1 truncate block" title={workspaceFolders[0]?.name || 'No workspace'}>
									{workspaceFolders[0]?.name || 'No workspace'}
								</span>
							</div>
						</div>

						<div className="flex-1 py-3 px-3 space-y-1 overflow-y-auto custom-scrollbar">
							<NavButton
								active={activeTab === 'chats'}
								onClick={() => { setActiveTab('chats'); setShowSidebar(true); }}
								icon={MessageSquare}
								label="Chats"
								title="Conversations"
							/>
							<NavButton
								active={activeTab === 'workspaces'}
								onClick={() => { setActiveTab('workspaces'); setShowSidebar(true); }}
								icon={Folder}
								label="Files"
								title="Workspace Files"
							/>
							<NavButton
								active={activeTab === 'dashboard'}
								onClick={() => { setActiveTab('dashboard'); }}
								icon={Activity}
								label="Dashboard"
								title="Overview"
							/>
							<NavButton
								active={activeTab === 'multi'}
								onClick={() => { setActiveTab('multi'); setShowSidebar(true); }}
								icon={Globe}
								label="Multi"
								title="All Workspaces"
							/>
						</div>

						<div className="p-3 border-t border-void-border-2">
							<div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-void-bg-1 border border-void-accent/20">
								<div className="w-8 h-8 rounded-lg bg-void-accent/20 flex items-center justify-center" aria-hidden="true">
									<Sparkles className="w-4 h-4 text-void-accent" />
								</div>
								<div className="flex-1 min-w-0">
									<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider block">Plan</span>
									<span className="text-xs font-semibold text-void-fg-1 truncate">{stats.threadsCount} threads</span>
								</div>
							</div>
						</div>
					</nav>

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
						{!showSidebar && activeTab !== 'dashboard' && (
							<button
								onClick={handleShowSidebar}
								className="absolute top-4 left-4 z-40 p-2 bg-void-bg-2 border border-void-border-2 rounded-xl shadow-lg hover:bg-void-bg-3 text-void-accent transition-all focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
								title="Show Sidebar"
								aria-label="Show sidebar"
							>
								<ChevronRight className="w-5 h-5" />
							</button>
						)}

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
										<div className="flex-1 min-h-0 overflow-hidden">
											<SidebarChat />
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