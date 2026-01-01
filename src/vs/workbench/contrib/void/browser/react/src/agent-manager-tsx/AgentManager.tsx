/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsDark, useChatThreadsState, useOnAgentManagerOpenFile, useOnAgentManagerOpenWalkthrough, useOnAgentManagerOpenContent, useWorkspaceFolders, useFileContent, useAccessor } from '../util/services.js';
import { SidebarChat } from '../sidebar-tsx/SidebarChat.js';
import { PastThreadsList } from '../sidebar-tsx/SidebarThreadSelector.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { Folder, MessageSquare, Code, Settings, X, Maximize2, Minimize2, Search, ExternalLink, Activity, Shield, Cpu, Zap, Loader2, ChevronLeft, ChevronRight, BarChart3, Database, Layers, Clock, TrendingUp, FileCode, Plus, History, Trash2, Send, Brain, Check, Pencil } from 'lucide-react';
import { BlockCode } from '../util/inputs.js';
import { URI } from '../../../../../../../base/common/uri.js';
import '../styles.css';

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
			<div className="h-full flex flex-col items-center justify-center text-void-fg-4 gap-4 bg-void-bg-2/30">
				<div className="relative">
					<div className="w-12 h-12 border-3 border-void-accent/20 border-t-void-accent rounded-full animate-spin" />
					<div className="absolute inset-0 flex items-center justify-center">
						<Code className="w-5 h-5 text-void-accent" />
					</div>
				</div>
				<div className="text-center">
					<span className="text-xs font-semibold text-void-fg-3 uppercase tracking-widest">Loading Source</span>
				</div>
			</div>
		);
	}

	if (!content || !selectedFileUri) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-void-fg-4 bg-void-bg-2/20 border border-dashed border-void-border-2 m-6 rounded-2xl">
				<div className="w-16 h-16 rounded-2xl bg-void-bg-3 flex items-center justify-center mb-4 shadow-xl border border-void-border-2">
					<FileCode className="w-8 h-8 text-void-fg-4" />
				</div>
				<div className="text-center px-8">
					<h3 className="text-sm font-semibold text-void-fg-2 mb-1">Vault Offline</h3>
					<p className="text-xs text-void-fg-4 max-w-[200px]">Select a repository file to initialize preview protocols.</p>
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

const WorkspacesView = () => {
	const folders = useWorkspaceFolders();

	return (
		<div className="flex flex-col gap-2 p-4">
			{folders.map(folder => (
				<div
					key={folder.uri.toString()}
					className="group flex items-center gap-4 p-4 rounded-xl border border-void-border-2 bg-void-bg-2/40 hover:border-void-accent/40 hover:bg-void-bg-2/60 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
				>
					<div className="flex-shrink-0 w-10 h-10 rounded-xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center group-hover:border-void-accent/30 transition-colors shadow-inner">
						<Folder className="w-5 h-5 text-void-fg-4 group-hover:text-void-accent transition-colors" />
					</div>
					<div className="flex-1 min-w-0">
						<span className="text-sm font-semibold text-void-fg-1 block truncate tracking-tight">{folder.name}</span>
						<span className="text-[10px] text-void-fg-4 truncate block mt-0.5 font-mono opacity-60">{folder.uri.fsPath}</span>
					</div>
					<ExternalLink className="w-4 h-4 text-void-fg-4 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" />
				</div>
			))}
			{folders.length === 0 && (
				<div className="flex flex-col items-center justify-center p-12 text-void-fg-4">
					<div className="w-16 h-16 rounded-2xl bg-void-bg-2/50 border border-dashed border-void-border-2 flex items-center justify-center mb-4">
						<Folder className="w-7 h-7 opacity-30" />
					</div>
					<p className="text-sm font-semibold text-void-fg-3">No Target Directory</p>
					<p className="text-xs text-void-fg-4 mt-1 opacity-60">Mount a workspace to begin operations.</p>
				</div>
			)}
		</div>
	);
};

const DashboardView = ({ stats }: { stats: any }) => {
	const StatCard = ({ icon: Icon, label, value, sublabel, color }: { icon: any, label: string, value: string | number, sublabel?: string, color: string }) => (
		<div className="p-6 rounded-2xl border border-void-border-2 bg-void-bg-2/30 shadow-lg hover:border-void-border-1 hover:bg-void-bg-2/50 transition-all group overflow-hidden relative active:scale-[0.99]">
			<div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity translate-x-4 -translate-y-4">
				<Icon className="w-24 h-24" />
			</div>
			<div className="flex items-start justify-between mb-6 relative z-10">
				<div className={`p-3 rounded-xl ${color} shadow-lg shadow-black/10 border border-void-border-2`}>
					<Icon className="w-6 h-6" />
				</div>
				{sublabel && (
					<span className="text-[9px] font-bold text-void-fg-1 bg-void-bg-3/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-void-border-2 uppercase tracking-tighter">
						{sublabel}
					</span>
				)}
			</div>
			<div className="space-y-1 relative z-10">
				<div className="text-3xl font-black text-void-fg-1 tracking-tighter">{value}</div>
				<div className="text-[10px] font-bold text-void-fg-4 uppercase tracking-widest opacity-70">{label}</div>
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-8 p-8 h-full overflow-y-auto custom-scrollbar bg-void-bg-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-black text-void-fg-1 tracking-tighter uppercase italic">System Overview</h2>
					<p className="text-xs text-void-fg-4 mt-1 font-medium opacity-60 uppercase tracking-widest">Neural Infrastructure Status</p>
				</div>
				<div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-inner">
					<div className="relative">
						<div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
						<div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
					</div>
					<span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Mainframe Online</span>
				</div>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
				<StatCard
					icon={MessageSquare}
					label="Cognitive Threads"
					value={stats.threadsCount}
					color="bg-blue-500/10 text-blue-500"
				/>
				<StatCard
					icon={Zap}
					label="Total Operations"
					value={stats.operationsCount}
					sublabel="24H Window"
					color="bg-purple-500/10 text-purple-500"
				/>
				<StatCard
					icon={TrendingUp}
					label="Success Entropy"
					value="99.2%"
					sublabel="Optimal"
					color="bg-emerald-500/10 text-emerald-400"
				/>
				<StatCard
					icon={Clock}
					label="Pulse Latency"
					value="142ms"
					sublabel="Real-time"
					color="bg-orange-500/10 text-orange-500"
				/>
			</div>

			{/* Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
				{/* Recent Activity */}
				<div className="lg:col-span-2 flex flex-col min-h-0">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-[10px] font-black text-void-fg-4 uppercase tracking-[0.2em]">Telemetry Log</h3>
						<button className="text-[10px] text-void-accent hover:text-void-accent-hover font-bold uppercase tracking-widest border-b border-void-accent/30 pb-0.5 transition-all">Archived Access</button>
					</div>
					<div className="flex-1 rounded-2xl border border-void-border-2 bg-void-bg-2/20 overflow-hidden shadow-2xl">
						{[1, 2, 3, 4].map(i => (
							<div key={i} className="p-5 border-b border-void-border-2/50 last:border-0 hover:bg-void-bg-2/40 transition-all flex items-center justify-between group cursor-pointer active:bg-void-bg-2/60">
								<div className="flex items-center gap-4 flex-1 min-w-0">
									<div className="flex-shrink-0 w-10 h-10 rounded-xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center group-hover:border-void-accent/30 transition-all">
										<Code className="w-5 h-5 text-void-fg-4 group-hover:text-void-accent transition-colors" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-bold text-void-fg-1 truncate tracking-tight group-hover:text-void-accent transition-colors">Agent mutation on SidebarChat.tsx</p>
										<p className="text-[10px] text-void-fg-4 mt-1 truncate font-mono opacity-50">/usr/src/void/browser/SidebarChat.tsx</p>
									</div>
									<div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
										<span className="text-[10px] font-bold text-void-fg-4 opacity-40 uppercase tracking-tighter">{i * 2}m ago</span>
										<div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase border border-emerald-500/20">Synced</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Quick Actions */}
				<div className="flex flex-col gap-4">
					<h3 className="text-[10px] font-black text-void-fg-4 uppercase tracking-[0.2em] mb-1">Command Interface</h3>
					<button className="flex items-center gap-4 p-5 rounded-2xl border border-void-border-2 bg-void-bg-2/30 hover:bg-void-bg-2/50 hover:border-void-accent/50 transition-all group shadow-lg active:scale-[0.97]">
						<div className="p-3 rounded-xl bg-void-accent shadow-lg shadow-void-accent/30 group-hover:scale-110 transition-transform">
							<Plus className="w-5 h-5 text-white" />
						</div>
						<div className="flex flex-col items-start">
							<span className="text-sm font-bold text-void-fg-1 tracking-tight">Deploy New Agent</span>
							<span className="text-[10px] text-void-fg-4 font-medium opacity-50 uppercase tracking-tighter">Initialize Protocol</span>
						</div>
					</button>
					<button className="flex items-center gap-4 p-5 rounded-2xl border border-void-border-2 bg-void-bg-2/30 hover:bg-void-bg-2/50 transition-all group shadow-lg active:scale-[0.97]">
						<div className="p-3 rounded-xl bg-void-bg-3 border border-void-border-2 group-hover:border-void-border-1 transition-all">
							<Shield className="w-5 h-5 text-void-fg-4 group-hover:text-void-fg-2" />
						</div>
						<div className="flex flex-col items-start">
							<span className="text-sm font-bold text-void-fg-1 tracking-tight">System Audit</span>
							<span className="text-[10px] text-void-fg-4 font-medium opacity-50 uppercase tracking-tighter">Compliance Review</span>
						</div>
					</button>
					<button className="flex items-center gap-4 p-5 rounded-2xl border border-void-border-2 bg-void-bg-2/30 hover:bg-void-bg-2/50 transition-all group shadow-lg active:scale-[0.97]">
						<div className="p-3 rounded-xl bg-void-bg-3 border border-void-border-2 group-hover:border-void-border-1 transition-all">
							<Settings className="w-5 h-5 text-void-fg-4 group-hover:text-void-fg-2" />
						</div>
						<div className="flex flex-col items-start">
							<span className="text-sm font-bold text-void-fg-1 tracking-tight">Core Configuration</span>
							<span className="text-[10px] text-void-fg-4 font-medium opacity-50 uppercase tracking-tighter">Global Parameters</span>
						</div>
					</button>
				</div>
			</div>
		</div>
	);
};

const NavButton = ({ active, onClick, icon: Icon, label, title }: { active: boolean, onClick: () => void, icon: any, label?: string, title: string }) => (
	<button
		onClick={onClick}
		className={`relative w-full aspect-square flex items-center justify-center transition-all duration-300 group px-2`}
		title={title}
	>
		<div className={`w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 ${active
				? 'bg-void-accent text-white shadow-2xl shadow-void-accent/40 scale-90'
				: 'text-void-fg-4 hover:text-void-fg-2 hover:bg-void-bg-2/50'
			}`}>
			<Icon className={`w-6 h-6 ${active ? 'animate-pulse' : ''}`} />
		</div>
		{active && (
			<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-void-accent rounded-r-full shadow-[0_0_15px_rgba(var(--void-accent-rgb),0.5)]" />
		)}
	</button>
);

export const AgentManager = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const { width: windowWidth } = useWindowSize();
	const [activeTab, setActiveTab] = useState<'dashboard' | 'chats' | 'workspaces'>('dashboard');
	const [showPreview, setShowPreview] = useState(true);
	const [showSidebar, setShowSidebar] = useState(true);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [walkthroughData, setWalkthroughData] = useState<{ filePath: string, preview: string } | null>(null);
	const [contentData, setContentData] = useState<{ title: string, content: string } | null>(null);

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

	const stats = {
		threadsCount: Object.keys(chatThreadsState.allThreads).length,
		operationsCount: 124,
	}

	const handleNewThread = () => {
		const chatThreadService = accessor.get('IChatThreadService');
		if (chatThreadService) {
			chatThreadService.createNewThread();
		}
	};

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="absolute inset-0 flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans select-none antialiased">
				{/* Header - Glassmorphism */}
				<div className="h-20 border-b border-void-border-2 flex items-center justify-between px-8 flex-shrink-0 bg-void-bg-2/60 backdrop-blur-xl z-50 shadow-2xl relative">
					<div className="flex items-center gap-6">
						<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-void-accent to-void-accent-hover flex items-center justify-center shadow-2xl shadow-void-accent/30 border border-white/10 active:scale-95 transition-transform cursor-pointer">
							<Zap className="text-white w-6 h-6 fill-current" />
						</div>
						<div className="hidden sm:flex flex-col">
							<h1 className="text-lg font-black text-void-fg-1 tracking-tighter uppercase italic leading-none">A-Coder</h1>
							<span className="text-[10px] font-black text-void-fg-4 uppercase tracking-[0.3em] mt-1 opacity-50">Control Center v2.0</span>
						</div>
					</div>

					<div className="flex items-center gap-6 flex-1 justify-end max-w-2xl">
						<div className="relative group hidden sm:block flex-1 max-w-md">
							<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-void-fg-4 group-focus-within:text-void-accent transition-all opacity-40 group-focus-within:opacity-100" />
							<input
								type="text"
								placeholder="Search Threads, Files, or Symbols..."
								className="bg-void-bg-1 border border-void-border-2 rounded-2xl pl-12 pr-6 py-3 text-xs w-full focus:outline-none focus:border-void-accent/50 focus:bg-void-bg-1 transition-all placeholder:font-bold placeholder:uppercase placeholder:tracking-tighter placeholder:text-void-fg-3 shadow-inner text-void-fg-1"
							/>
						</div>

						<div className="flex items-center gap-2 bg-void-bg-1 p-1.5 rounded-2xl border border-void-border-2 shadow-inner">
							<button className="p-2.5 hover:bg-void-bg-2 rounded-xl transition-all text-void-fg-4 hover:text-void-fg-1 group relative">
								<History className="w-5 h-5" />
								<span className="absolute -top-1 -right-1 w-2 h-2 bg-void-accent rounded-full border-2 border-void-bg-1 shadow-lg" />
							</button>
							<button className="p-2.5 hover:bg-void-bg-2 rounded-xl transition-all text-void-fg-4 hover:text-void-fg-1">
								<Settings className="w-5 h-5" />
							</button>
						</div>
					</div>
				</div>

				<div className="flex-1 flex overflow-hidden relative h-full min-h-0 bg-void-bg-3">
					{/* Left Navigation Rail - Slim & Minimal */}
					<div className="hidden sm:flex w-20 lg:w-24 border-r border-void-border-2 flex-col items-center py-8 bg-void-bg-2/40 flex-shrink-0 z-40 h-full backdrop-blur-md">
						<div className="flex-1 w-full flex flex-col gap-4 items-center min-h-0">
							<NavButton
								active={activeTab === 'dashboard'}
								onClick={() => { setActiveTab('dashboard'); }}
								icon={Activity}
								label="Status"
								title="System Dashboard"
							/>
							<NavButton
								active={activeTab === 'chats'}
								onClick={() => { setActiveTab('chats'); setShowSidebar(true); }}
								icon={MessageSquare}
								label="Comms"
								title="Communication Channels"
							/>
							<NavButton
								active={activeTab === 'workspaces'}
								onClick={() => { setActiveTab('workspaces'); setShowSidebar(true); }}
								icon={Folder}
								label="Vault"
								title="Repository Access"
							/>
						</div>

						<div className="w-full px-4 flex flex-col gap-4 items-center pt-8 border-t border-void-border-2/50 mt-auto">
							<button className="w-12 h-12 rounded-2xl bg-void-bg-3 border border-void-border-2 flex items-center justify-center text-void-fg-4 hover:text-void-accent hover:border-void-accent/30 transition-all shadow-xl active:scale-90 overflow-hidden relative group">
								<div className="absolute inset-0 bg-void-accent/5 group-hover:bg-void-accent/10 transition-colors" />
								<Shield className="w-5 h-5 relative z-10" />
							</button>
						</div>
					</div>

					{/* Middle Pane - Explorer Style */}
					{(showSidebar && activeTab !== 'dashboard') && (
						<div className="w-80 xl:w-96 border-r border-void-border-2 flex flex-col bg-void-bg-2/30 flex-shrink-0 absolute inset-y-0 left-0 z-30 md:relative h-full min-h-0 backdrop-blur-sm shadow-2xl">
							<div className="p-6 border-b border-void-border-2 bg-void-bg-2/40 flex items-center justify-between flex-shrink-0">
								<div className="flex items-center gap-4">
									<h2 className="text-[10px] font-black text-void-fg-2 uppercase tracking-[0.2em]">
										{activeTab === 'chats' ? 'Active Channels' : 'Repository Index'}
									</h2>
									<span className="px-2 py-0.5 rounded-lg bg-void-accent/10 text-void-accent text-[9px] font-black border border-void-accent/20">
										{activeTab === 'chats' ? (Object.keys(chatThreadsState.allThreads).length) : (workspaceFolders.length)}
									</span>
								</div>
								<div className="flex items-center gap-1">
									{activeTab === 'chats' && (
										<button
											onClick={handleNewThread}
											className="p-2 hover:bg-void-accent/10 hover:text-void-accent rounded-lg transition-all text-void-fg-4 active:scale-90"
											title="New Channel"
										>
											<Plus className="w-4 h-4" />
										</button>
									)}
									<button onClick={() => setShowSidebar(false)} className="md:hidden p-2 hover:bg-void-bg-2 rounded-lg transition-all text-void-fg-4">
										<X className="w-4 h-4" />
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-void-bg-2/10">
								<ErrorBoundary>
									{activeTab === 'chats' ? (
										<div className="p-4 space-y-1">
											<PastThreadsList />
										</div>
									) : (
										<WorkspacesView />
									)}
								</ErrorBoundary>
							</div>
						</div>
					)}

					{/* Main Content Area - High Focus */}
					<div className="flex-1 flex flex-col bg-void-bg-3 min-w-0 relative h-full overflow-hidden min-h-0 shadow-inner">
						<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-void-accent/20 to-transparent opacity-50" />

						{!showSidebar && activeTab !== 'dashboard' && (
							<button
								onClick={() => setShowSidebar(true)}
								className="absolute top-6 left-6 z-40 p-3 bg-void-bg-2/80 backdrop-blur-xl border border-void-border-2 rounded-2xl shadow-2xl hover:bg-void-bg-2 text-void-accent transition-all active:scale-95"
								title="Expand Index"
							>
								<ChevronRight className="w-5 h-5" />
							</button>
						)}

						<div className="flex-1 h-full overflow-hidden relative min-h-0">
							<ErrorBoundary>
								{activeTab === 'dashboard' ? (
									<DashboardView stats={stats} />
								) : (
									<div className="h-full flex flex-col relative">
										<div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-void-bg-2/40 to-transparent pointer-events-none z-10" />
										<div className="flex-1 min-h-0 overflow-hidden">
											<SidebarChat />
										</div>
									</div>
								)}
							</ErrorBoundary>
						</div>
					</div>

					{/* Right Preview Pane - Tactical View */}
					{showPreview && (
						<div className="w-[450px] xl:w-[550px] border-l border-void-border-2 flex flex-col bg-void-bg-2/40 flex-shrink-0 absolute inset-y-0 right-0 md:relative z-40 h-full min-h-0 backdrop-blur-xl shadow-2xl">
							<div className="h-20 border-b border-void-border-2 flex items-center justify-between px-8 bg-void-bg-2/60 backdrop-blur-md flex-shrink-0">
								<div className="flex items-center gap-4 min-w-0 flex-1">
									<div className="p-3 rounded-2xl bg-void-bg-3 border border-void-border-2 text-void-accent shadow-inner">
										<Code className="w-5 h-5" />
									</div>
									<div className="flex flex-col min-w-0">
										<span className="text-[10px] font-black text-void-fg-4 uppercase tracking-[0.2em] opacity-50">Tactical Preview</span>
										<span className="text-sm font-bold text-void-fg-1 truncate tracking-tight">
											{selectedFile ? selectedFile.split('/').pop() : walkthroughData ? walkthroughData.filePath.split('/').pop() : contentData ? contentData.title : 'No Feed Initialized'}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-2 flex-shrink-0 ml-4">
									{(selectedFile || walkthroughData) && (
										<button className="p-2.5 hover:bg-void-accent/10 hover:text-void-accent border border-transparent hover:border-void-accent/20 rounded-xl transition-all text-void-fg-4 active:scale-95" title="Push to Global Editor">
											<ExternalLink className="w-5 h-5" />
										</button>
									)}
									<button
										onClick={() => {
											setShowPreview(false);
											setSelectedFile(null);
											setWalkthroughData(null);
											setContentData(null);
										}}
										className="p-2.5 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all text-void-fg-4 active:scale-95"
									>
										<X className="w-5 h-5" />
									</button>
								</div>
							</div>

							<div className="flex-1 overflow-hidden min-h-0 bg-void-bg-3">
								<ErrorBoundary>
									{selectedFileUri ? (
										<CodePreview selectedFileUri={selectedFileUri} />
									) : walkthroughData ? (
										<ContentPreview title="Field Walkthrough" content={walkthroughData.preview} />
									) : contentData ? (
										<ContentPreview title={contentData.title} content={contentData.content} />
									) : (
										<CodePreview selectedFileUri={null} />
									)}
								</ErrorBoundary>
							</div>
						</div>
					)}

					{/* Floating Tactical Toggle */}
					{!showPreview && (
						<button
							onClick={() => setShowPreview(true)}
							className="absolute bottom-10 right-10 w-16 h-16 bg-void-accent text-white rounded-2xl shadow-2xl shadow-void-accent/40 flex items-center justify-center hover:bg-void-accent-hover transition-all active:scale-90 z-[60] border border-white/10 group overflow-hidden"
							title="Open Tactical Feed"
						>
							<div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent group-hover:opacity-0 transition-opacity" />
							<Maximize2 className="w-7 h-7 relative z-10" />
						</button>
					)}
				</div>
			</div>

			<style>{`
				.custom-scrollbar::-webkit-scrollbar {
					width: 6px;
					height: 6px;
				}
				.custom-scrollbar::-webkit-scrollbar-track {
					background: transparent;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb {
					background: rgba(128, 128, 128, 0.15);
					border-radius: 10px;
					border: 2px solid transparent;
					background-clip: content-box;
				}
				.custom-scrollbar::-webkit-scrollbar-thumb:hover {
					background: rgba(128, 128, 128, 0.25);
				}
				
				.dark .void-prose {
					color: var(--void-fg-2);
				}
				
				/* Animation for gradient background */
				@keyframes pulse-gradient {
					0% { opacity: 0.1; }
					50% { opacity: 0.2; }
					100% { opacity: 0.1; }
				}
			`}</style>
		</div>
	);
};
