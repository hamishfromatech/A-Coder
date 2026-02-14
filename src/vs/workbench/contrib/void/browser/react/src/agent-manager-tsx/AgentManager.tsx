/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsDark, useChatThreadsState, useOnAgentManagerOpenFile, useOnAgentManagerOpenWalkthrough, useOnAgentManagerOpenContent, useWorkspaceFolders, useFileContent, useAccessor } from '../util/services.js';
import { SidebarChat } from '../sidebar-tsx/SidebarChat.js';
import { PastThreadsList } from '../sidebar-tsx/SidebarThreadSelector.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { Folder, MessageSquare, Code, Settings, X, Maximize2, Search, ExternalLink, Activity, Shield, Cpu, Zap, ChevronLeft, ChevronRight, BarChart3, Layers, Clock, FileCode, Plus, Grid, Home, Terminal, Sparkles, Play, Pause, RefreshCw } from 'lucide-react';
import { BlockCode } from '../util/inputs.js';
import { URI } from '../../../../../../../base/common/uri.js';
import '../styles.css';

// Utility to format time duration
const formatDuration = (ms: number): string => {
	const hours = Math.floor(ms / (1000 * 60 * 60));
	const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
	if (hours > 0) {
		return `${hours}.${Math.round(minutes / 6)}h`;
	}
	return `${minutes}m`;
};

// Utility to format token count
const formatTokens = (count: number): string => {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}k`;
	}
	return count.toString();
};

const useWindowSize = () => {
	const [windowSize, setWindowSize] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useEffect(() => {
		const handleResize = () => {
			setWindowSize({
				width: window.innerWidth,
				height: window.innerHeight,
			});
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	return windowSize;
};

const CodePreview = ({ selectedFileUri }: { selectedFileUri: URI | null }) => {
	const { content, loading } = useFileContent(selectedFileUri);

	if (loading) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-void-fg-4 gap-4 bg-gradient-to-br from-void-bg-2/50 to-void-bg-3">
				<div className="relative">
					<div className="w-12 h-12 border-3 border-void-accent/20 border-t-void-accent rounded-full animate-spin" />
					<div className="absolute inset-0 flex items-center justify-center">
						<Code className="w-5 h-5 text-void-accent" />
					</div>
				</div>
				<div className="text-center">
					<span className="text-xs font-semibold text-void-fg-3 uppercase tracking-widest">Loading Preview</span>
				</div>
			</div>
		);
	}

	if (!content || !selectedFileUri) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-void-fg-4 bg-gradient-to-br from-void-bg-2/30 to-void-bg-3 border border-dashed border-void-border-2 m-6 rounded-2xl">
				<div className="w-16 h-16 rounded-2xl bg-void-bg-3 flex items-center justify-center mb-4 shadow-xl border border-void-border-2">
					<FileCode className="w-8 h-8 text-void-fg-4" />
				</div>
				<div className="text-center px-8">
					<h3 className="text-sm font-semibold text-void-fg-2 mb-1">No File Selected</h3>
					<p className="text-xs text-void-fg-4 max-w-[200px]">Click on a file or walkthrough to preview its contents here.</p>
				</div>
			</div>
		);
	}

	const extension = selectedFileUri.fsPath.split('.').pop() || '';

	return (
		<div className="h-full flex flex-col bg-void-bg-3 border-l border-void-border-2 shadow-2xl">
			<div className="flex-1 overflow-hidden">
				<BlockCode
					initValue={content}
					language={extension}
					maxHeight={Infinity}
					showScrollbars={true}
				/>
			</div>
		</div>
	);
};

const ContentPreview = ({ title, content }: { title: string, content: string }) => {
	return (
		<div className="h-full flex flex-col bg-void-bg-3 border-l border-void-border-2 shadow-2xl">
			<div className="px-6 py-4 border-b border-void-border-2 bg-void-bg-2/50 backdrop-blur-md flex items-center justify-between">
				<span className="text-xs font-bold text-void-fg-1 uppercase tracking-widest">{title}</span>
				<span className="px-2 py-0.5 rounded bg-void-accent/10 text-void-accent text-[9px] font-bold border border-void-accent/20 uppercase">Markdown</span>
			</div>
			<div className="flex-1 overflow-auto p-0">
				<BlockCode
					initValue={content}
					language="markdown"
					maxHeight={Infinity}
					showScrollbars={true}
				/>
			</div>
		</div>
	);
};

const WorkspaceCard = ({ folder, index }: { folder: any, index: number }) => {
	const colors = ['from-blue-500/10 to-purple-500/10', 'from-emerald-500/10 to-cyan-500/10', 'from-orange-500/10 to-red-500/10', 'from-pink-500/10 to-violet-500/10'];
	const color = colors[index % colors.length];

	return (
		<div className="group relative overflow-hidden rounded-2xl border border-void-border-2 bg-gradient-to-br from-void-bg-2/40 to-void-bg-3/40 hover:border-void-accent/40 transition-all duration-300 shadow-sm hover:shadow-xl cursor-pointer active:scale-[0.98]">
			<div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
			<div className="relative p-4 flex items-center gap-4">
				<div className="flex-shrink-0 w-12 h-12 rounded-xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center shadow-lg group-hover:border-void-accent/50 group-hover:scale-110 transition-all">
					<Folder className="w-6 h-6 text-void-fg-4 group-hover:text-void-accent transition-colors" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-bold text-void-fg-1 truncate tracking-tight">{folder.name}</span>
						<div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
					</div>
					<span className="text-[10px] text-void-fg-4 truncate block mt-0.5 font-mono opacity-60">{folder.uri.fsPath}</span>
				</div>
				<ExternalLink className="w-4 h-4 text-void-fg-4 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" />
			</div>
		</div>
	);
};

const WorkspacesView = () => {
	const folders = useWorkspaceFolders();

	return (
		<div className="flex flex-col gap-3 p-4">
			{folders.map((folder, index) => (
				<WorkspaceCard key={folder.uri.toString()} folder={folder} index={index} />
			))}
			{folders.length === 0 && (
				<div className="flex flex-col items-center justify-center p-12 text-void-fg-4">
					<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-void-bg-2/50 to-void-bg-3/50 border border-dashed border-void-border-2 flex items-center justify-center mb-4">
						<Folder className="w-7 h-7 opacity-30" />
					</div>
					<p className="text-sm font-semibold text-void-fg-3 mb-2">No Workspace Open</p>
					<p className="text-xs text-void-fg-4 opacity-60 text-center max-w-[200px]">Open a folder in VS Code to start working with A-Coder.</p>
				</div>
			)}
		</div>
	);
};

const StatCard = ({ icon: Icon, label, value, trend, color, glowColor }: {
	icon: any,
	label: string,
	value: string | number,
	trend?: string,
	color: string,
	glowColor?: string
}) => (
	<div className={`relative overflow-hidden rounded-2xl border border-void-border-2 bg-gradient-to-br ${color} shadow-lg hover:shadow-2xl transition-all duration-300 group`}>
		<div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${glowColor || ''}`} />
		<div className="relative p-5">
			<div className="flex items-start justify-between mb-4">
				<div className="p-3 rounded-xl bg-void-bg-3/80 backdrop-blur-md border border-void-border-2 shadow-inner">
					<Icon className="w-5 h-5 text-void-fg-1" />
				</div>
				{trend && (
					<span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase border border-emerald-500/20">
						{trend}
					</span>
				)}
			</div>
			<div className="space-y-1">
				<div className="text-3xl font-black text-void-fg-1 tracking-tighter">{value}</div>
				<div className="text-[10px] font-bold text-void-fg-4 uppercase tracking-widest opacity-70">{label}</div>
			</div>
		</div>
	</div>
);

const ActivityItem = ({ icon: Icon, title, subtitle, time, status }: {
	icon: any,
	title: string,
	subtitle: string,
	time: string,
	status: 'success' | 'progress' | 'error'
}) => {
	const statusColors = {
		success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
		progress: 'bg-void-accent/10 text-void-accent border-void-accent/20',
		error: 'bg-red-500/10 text-red-500 border-red-500/20',
	};

	return (
		<div className="group p-4 rounded-xl border border-void-border-2 bg-void-bg-2/30 hover:bg-void-bg-2/50 hover:border-void-border-1 transition-all cursor-pointer">
			<div className="flex items-start gap-4">
				<div className="flex-shrink-0 w-10 h-10 rounded-xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center shadow-md group-hover:border-void-accent/40 transition-all">
					<Icon className="w-5 h-5 text-void-fg-4 group-hover:text-void-accent transition-colors" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold text-void-fg-1 truncate group-hover:text-void-accent transition-colors">{title}</p>
					<p className="text-[10px] text-void-fg-4 mt-1 truncate font-mono opacity-60">{subtitle}</p>
				</div>
				<div className="flex flex-col items-end gap-2 flex-shrink-0">
					<span className="text-[10px] font-bold text-void-fg-4 opacity-40 uppercase tracking-tighter">{time}</span>
					<div className={`px-2 py-0.5 rounded-lg ${statusColors[status]} text-[9px] font-black uppercase border`}>
						{status === 'success' ? 'Done' : status === 'progress' ? 'Active' : 'Error'}
					</div>
				</div>
			</div>
		</div>
	);
};

const DashboardView = ({ stats, onNewThread, onBrowseFiles, onOpenSettings }: {
	stats: { threadsCount: number; messagesCount: number; activeTime: number; totalTokens: number };
	onNewThread: () => void;
	onBrowseFiles: () => void;
	onOpenSettings: () => void;
}) => {
	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-8 pb-4">
				<div className="flex items-center justify-between mb-8">
					<div>
						<h2 className="text-2xl font-bold text-void-fg-1 tracking-tight">Dashboard</h2>
						<p className="text-xs text-void-fg-4 mt-1 opacity-60">Overview of your activity and workspace</p>
					</div>
					<div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
						<div className="relative">
							<div className="w-2 h-2 rounded-full bg-emerald-500" />
							<div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
						</div>
						<span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Connected</span>
					</div>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
					<StatCard
						icon={MessageSquare}
						label="Conversations"
						value={stats.threadsCount}
						color="from-blue-500/10 to-blue-600/10"
						glowColor="bg-blue-500"
					/>
					<StatCard
						icon={Zap}
						label="Messages"
						value={stats.messagesCount}
						color="from-purple-500/10 to-purple-600/10"
						glowColor="bg-purple-500"
					/>
					<StatCard
						icon={Clock}
						label="Active Time"
						value={formatDuration(stats.activeTime)}
						color="from-amber-500/10 to-orange-600/10"
						glowColor="bg-amber-500"
					/>
					<StatCard
						icon={Sparkles}
						label="AI Tokens"
						value={formatTokens(stats.totalTokens)}
						color="from-cyan-500/10 to-teal-600/10"
						glowColor="bg-cyan-500"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-hidden px-8 pb-8">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
					<div className="lg:col-span-2 flex flex-col min-h-0">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider">Quick Actions</h3>
						</div>
						<div className="flex flex-col gap-3">
							<button
								onClick={onNewThread}
								className="flex items-center gap-4 p-4 rounded-xl border border-void-border-2 bg-gradient-to-br from-void-bg-2/40 to-void-bg-3/40 hover:from-void-bg-2/60 hover:to-void-bg-3/60 hover:border-void-accent/40 transition-all group shadow-sm hover:shadow-lg"
							>
								<div className="p-3 rounded-xl bg-void-accent shadow-lg shadow-void-accent/30 group-hover:scale-110 transition-transform">
									<Plus className="w-5 h-5 text-white" />
								</div>
								<div className="text-left">
									<span className="block text-sm font-semibold text-void-fg-1">New Conversation</span>
									<span className="block text-[10px] text-void-fg-4 font-medium opacity-60">Start a fresh chat</span>
								</div>
							</button>
							<button
								onClick={onBrowseFiles}
								className="flex items-center gap-4 p-4 rounded-xl border border-void-border-2 bg-gradient-to-br from-void-bg-2/40 to-void-bg-3/40 hover:from-void-bg-2/60 hover:to-void-bg-3/60 hover:border-void-accent/40 transition-all group shadow-sm hover:shadow-lg"
							>
								<div className="p-3 rounded-xl bg-void-bg-3 border border-void-border-2 group-hover:border-void-border-1 transition-all">
									<Folder className="w-5 h-5 text-void-fg-4" />
								</div>
								<div className="text-left">
									<span className="block text-sm font-semibold text-void-fg-1">Browse Files</span>
									<span className="block text-[10px] text-void-fg-4 font-medium opacity-60">Explore workspace</span>
								</div>
							</button>
							<button
								onClick={onOpenSettings}
								className="flex items-center gap-4 p-4 rounded-xl border border-void-border-2 bg-gradient-to-br from-void-bg-2/40 to-void-bg-3/40 hover:from-void-bg-2/60 hover:to-void-bg-3/60 hover:border-void-accent/40 transition-all group shadow-sm hover:shadow-lg"
							>
								<div className="p-3 rounded-xl bg-void-bg-3 border border-void-border-2 group-hover:border-void-border-1 transition-all">
									<Settings className="w-5 h-5 text-void-fg-4" />
								</div>
								<div className="text-left">
									<span className="block text-sm font-semibold text-void-fg-1">Settings</span>
									<span className="block text-[10px] text-void-fg-4 font-medium opacity-60">Configure A-Coder</span>
								</div>
							</button>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h3 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider mb-1">Stats Summary</h3>
						<div className="p-4 rounded-xl border border-void-border-2 bg-void-bg-2/30">
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-xs text-void-fg-4">Total Threads</span>
									<span className="text-sm font-bold text-void-fg-1">{stats.threadsCount}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-xs text-void-fg-4">Total Messages</span>
									<span className="text-sm font-bold text-void-fg-1">{stats.messagesCount}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-xs text-void-fg-4">Active Time</span>
									<span className="text-sm font-bold text-void-fg-1">{formatDuration(stats.activeTime)}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-xs text-void-fg-4">AI Tokens Used</span>
									<span className="text-sm font-bold text-void-fg-1">{formatTokens(stats.totalTokens)}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const NavButton = ({ active, onClick, icon: Icon, label, title }: {
	active: boolean,
	onClick: () => void,
	icon: any,
	label?: string,
	title: string
}) => (
	<button
		onClick={onClick}
		className="relative group w-full"
		title={title}
	>
		<div className={`
			flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
			${active
				? 'bg-void-accent text-white shadow-lg shadow-void-accent/30'
				: 'text-void-fg-4 hover:text-void-fg-1 hover:bg-void-bg-2/50'
			}
		`}>
			<Icon className="w-5 h-5 flex-shrink-0" />
			<span className="text-sm font-medium tracking-tight">{label}</span>
		</div>
		{active && (
			<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-void-accent rounded-r-full shadow-[0_0_10px_rgba(var(--void-accent-rgb),0.5)]" />
		)}
	</button>
);

export const AgentManager = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const { width: windowWidth } = useWindowSize();
	const [activeTab, setActiveTab] = useState<'dashboard' | 'chats' | 'workspaces'>('chats');
	const [showPreview, setShowPreview] = useState(true);
	const [showSidebar, setShowSidebar] = useState(true);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [walkthroughData, setWalkthroughData] = useState<{ filePath: string, preview: string } | null>(null);
	const [contentData, setContentData] = useState<{ title: string, content: string } | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	useEffect(() => {
		if (windowWidth < 1280) {
			setShowPreview(false);
		}
		if (windowWidth < 900) {
			setShowSidebar(false);
		}
	}, [windowWidth]);

	const selectedFileUri = useMemo(() => selectedFile ? URI.file(selectedFile) : null, [selectedFile]);

	useOnAgentManagerOpenFile(useCallback((uri) => {
		setSelectedFile(uri.fsPath);
		setWalkthroughData(null);
		setContentData(null);
		setShowPreview(true);
	}, []));

	useOnAgentManagerOpenWalkthrough(useCallback((data) => {
		setWalkthroughData(data);
		setSelectedFile(null);
		setContentData(null);
		setShowPreview(true);
	}, []));

	useOnAgentManagerOpenContent(useCallback((data) => {
		setContentData(data);
		setSelectedFile(null);
		setWalkthroughData(null);
		setShowPreview(true);
	}, []));

	const chatThreadsState = useChatThreadsState();
	const workspaceFolders = useWorkspaceFolders();

	// Calculate real stats from threads
	const stats = useMemo(() => {
		const threads = Object.values(chatThreadsState.allThreads);
		const threadsCount = threads.length;

		// Count total messages across all threads
		let messagesCount = 0;
		let totalActiveTime = 0;

		for (const thread of threads) {
			messagesCount += thread.messages.filter(m => m.role === 'user' || m.role === 'assistant').length;

			// Calculate active time from thread creation and last modified
			const created = new Date(thread.createdAt).getTime();
			const modified = new Date(thread.lastModified).getTime();
			const sessionTime = modified - created;
			// Cap session time to reasonable values (max 8 hours per thread)
			totalActiveTime += Math.min(sessionTime, 8 * 60 * 60 * 1000);
		}

		return {
			threadsCount,
			messagesCount,
			activeTime: totalActiveTime,
			totalTokens: 0, // Token tracking not yet implemented
		};
	}, [chatThreadsState.allThreads]);

	// Filter threads based on search query
	const filteredThreadsCount = useMemo(() => {
		if (!searchQuery.trim()) return stats.threadsCount;
		const threads = Object.values(chatThreadsState.allThreads);
		const query = searchQuery.toLowerCase();
		return threads.filter(thread => {
			// Search in messages
			return thread.messages.some(msg => {
				if (msg.role === 'user' && msg.content.toLowerCase().includes(query)) return true;
				if (msg.role === 'assistant' && msg.displayContent?.toLowerCase().includes(query)) return true;
				return false;
			});
		}).length;
	}, [searchQuery, chatThreadsState.allThreads, stats.threadsCount]);

	const handleNewThread = () => {
		const chatThreadService = accessor.get('IChatThreadService');
		if (chatThreadService) {
			chatThreadService.openNewThread();
			setActiveTab('chats');
		}
	};

	const handleBrowseFiles = () => {
		setActiveTab('workspaces');
	};

	const handleOpenSettings = () => {
		const commandService = accessor.get('ICommandService');
		if (commandService) {
			commandService.executeCommand('workbench.action.openSettings', 'void');
		}
	};

	const handleOpenInEditor = useCallback(() => {
		if (selectedFileUri) {
			const editorService = accessor.get('IEditorService');
			if (editorService) {
				editorService.openEditor({ resource: selectedFileUri });
			}
		}
	}, [selectedFileUri, accessor]);

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="absolute inset-0 flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans select-none antialiased">
				{/* Header */}
				<div className="h-16 border-b border-void-border-2 flex items-center justify-between px-6 flex-shrink-0 bg-void-bg-2/60 backdrop-blur-xl z-50">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-void-accent to-void-accent-hover flex items-center justify-center shadow-lg shadow-void-accent/30">
							<Zap className="text-white w-5 h-5 fill-current" />
						</div>
						<div className="hidden sm:flex flex-col">
							<h1 className="text-base font-bold text-void-fg-1 tracking-tight leading-none">A-Coder</h1>
							<span className="text-[10px] text-void-fg-4 font-medium opacity-60">AI Assistant</span>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<div className="relative group hidden sm:block">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-void-fg-4 group-focus-within:text-void-accent transition-all opacity-40 group-focus-within:opacity-100" />
							<input
								type="text"
								placeholder="Search conversations..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="bg-void-bg-1 border border-void-border-2 rounded-xl pl-10 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-void-accent/50 transition-all placeholder:text-void-fg-3 text-void-fg-1"
							/>
							{searchQuery && (
								<button
									onClick={() => setSearchQuery('')}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-void-fg-4 hover:text-void-fg-1"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</div>

						<div className="flex items-center gap-1">
							<button
								onClick={handleOpenSettings}
								className="p-2.5 hover:bg-void-bg-2 rounded-xl transition-all text-void-fg-4 hover:text-void-fg-1"
								title="Open Settings"
							>
								<Settings className="w-5 h-5" />
							</button>
						</div>
					</div>
				</div>

				<div className="flex-1 flex overflow-hidden h-full min-h-0 bg-void-bg-3">
					{/* Left Sidebar */}
					<div className="hidden sm:flex w-56 flex-shrink-0 border-r border-void-border-2 bg-void-bg-2/20 flex-col z-40 h-full">
						<div className="p-3 border-b border-void-border-2/50">
							<div className="px-3 py-2 rounded-lg bg-void-bg-1/50">
								<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider block mb-1">Workspace</span>
								<span className="text-sm font-semibold text-void-fg-1 truncate block">
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
						</div>

						<div className="p-3 border-t border-void-border-2/50">
							<div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-void-accent/5 to-transparent border border-void-accent/10">
								<div className="w-8 h-8 rounded-lg bg-void-accent/10 flex items-center justify-center">
									<Sparkles className="w-4 h-4 text-void-accent" />
								</div>
								<div className="flex-1 min-w-0">
									<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider block">Plan</span>
									<span className="text-xs font-semibold text-void-fg-1 truncate">{stats.threadsCount} threads</span>
								</div>
							</div>
						</div>
					</div>

					{/* Thread/Content Sidebar */}
					{(showSidebar && activeTab !== 'dashboard') && (
						<div className="w-80 border-r border-void-border-2 flex flex-col bg-void-bg-2/10 flex-shrink-0 absolute inset-y-0 left-0 z-30 sm:static h-full min-h-0">
							<div className="p-4 border-b border-void-border-2 bg-void-bg-2/30 flex items-center justify-between flex-shrink-0">
								<div className="flex items-center gap-2">
									<h2 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider">
										{activeTab === 'chats' ? 'Conversations' : 'Workspace Files'}
									</h2>
									<span className="px-2 py-0.5 rounded-full bg-void-accent/10 text-void-accent text-[9px] font-bold border border-void-accent/20">
										{activeTab === 'chats' ? (Object.keys(chatThreadsState.allThreads).length) : (workspaceFolders.length)}
									</span>
								</div>
								{activeTab === 'chats' && (
									<button
										onClick={handleNewThread}
										className="p-2 hover:bg-void-accent/10 hover:text-void-accent rounded-lg transition-all text-void-fg-4"
										title="New Chat"
									>
										<Plus className="w-4 h-4" />
									</button>
								)}
							</div>

							<div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
								<ErrorBoundary>
									{activeTab === 'chats' ? (
										<div className="p-2 space-y-1">
											<PastThreadsList />
										</div>
									) : (
										<WorkspacesView />
									)}
								</ErrorBoundary>
							</div>
						</div>
					)}

					{/* Main Content */}
					<div className="flex-1 flex flex-col bg-void-bg-3 min-w-0 relative h-full overflow-hidden min-h-0">
						{!showSidebar && activeTab !== 'dashboard' && (
							<button
								onClick={() => setShowSidebar(true)}
								className="absolute top-4 left-4 z-40 p-2 bg-void-bg-2/80 backdrop-blur-xl border border-void-border-2 rounded-xl shadow-lg hover:bg-void-bg-2 text-void-accent transition-all"
								title="Show Sidebar"
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
								) : (
									<div className="h-full flex flex-col">
										<div className="flex-1 min-h-0 overflow-hidden">
											<SidebarChat />
										</div>
									</div>
								)}
							</ErrorBoundary>
						</div>
					</div>

					{/* Right Preview Pane */}
					{showPreview && (
						<div className="w-[400px] xl:w-[500px] border-l border-void-border-2 flex flex-col bg-void-bg-2/20 flex-shrink-0 absolute inset-y-0 right-0 xl:static z-40 h-full min-h-0">
							<div className="h-14 border-b border-void-border-2 flex items-center justify-between px-4 bg-void-bg-2/40 flex-shrink-0">
								<div className="flex items-center gap-3 min-w-0 flex-1">
									<div className="p-2 rounded-lg bg-void-bg-3 border border-void-border-2 text-void-accent">
										<Code className="w-4 h-4" />
									</div>
									<div className="flex flex-col min-w-0">
										<span className="text-[10px] font-bold text-void-fg-4 uppercase tracking-wider opacity-60">Preview</span>
										<span className="text-xs font-semibold text-void-fg-1 truncate tracking-tight">
											{selectedFile ? selectedFile.split('/').pop() : walkthroughData ? walkthroughData.filePath.split('/').pop() : contentData ? contentData.title : 'No selection'}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-1 flex-shrink-0 ml-2">
									{selectedFile && (
										<button
											onClick={handleOpenInEditor}
											className="p-2 hover:bg-void-accent/10 hover:text-void-accent rounded-lg transition-all text-void-fg-4"
											title="Open in Editor"
										>
											<ExternalLink className="w-4 h-4" />
										</button>
									)}
									<button
										onClick={() => {
											setShowPreview(false);
											setSelectedFile(null);
											setWalkthroughData(null);
											setContentData(null);
										}}
										className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-void-fg-4"
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
						</div>
					)}

					{/* Floating Preview Toggle */}
					{!showPreview && (
						<button
							onClick={() => setShowPreview(true)}
							className="absolute bottom-6 right-6 w-12 h-12 bg-void-accent text-white rounded-xl shadow-lg shadow-void-accent/30 flex items-center justify-center hover:bg-void-accent-hover transition-all z-[60] border border-white/10"
							title="Show Preview"
						>
							<Maximize2 className="w-5 h-5" />
						</button>
					)}
				</div>
			</div>

			<style>{`
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