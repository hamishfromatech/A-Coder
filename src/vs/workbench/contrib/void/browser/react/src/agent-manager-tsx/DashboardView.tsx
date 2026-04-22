/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { MessageSquare, Zap, Clock, Sparkles, Folder, Settings, Plus } from 'lucide-react';
import { StatCard } from './StatCard.js';
import { formatDuration, formatTokens } from './utils.js';

interface DashboardViewProps {
	stats: {
		threadsCount: number;
		messagesCount: number;
		activeTime: number;
		totalTokens: number;
	};
	onNewThread: () => void;
	onBrowseFiles: () => void;
	onOpenSettings: () => void;
}

interface ActionButtonProps {
	onClick: () => void;
	icon: React.ElementType;
	title: string;
	subtitle: string;
	primary?: boolean;
}

const ActionButton = memo(({ onClick, icon: Icon, title, subtitle, primary }: ActionButtonProps) => {
	return (
		<button
			onClick={onClick}
			className="flex items-center gap-4 p-4 rounded-xl border border-void-border-2 bg-void-bg-2 hover:bg-void-bg-3 hover:border-void-accent/40 transition-all group shadow-sm hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 w-full text-left"
			aria-label={title}
		>
			<div className={`p-3 rounded-xl ${primary ? 'bg-void-accent shadow-md shadow-void-accent/20' : 'bg-void-bg-3 border border-void-border-2'} group-hover:scale-110 transition-all flex-shrink-0`}>
				<Icon className={`w-5 h-5 ${primary ? 'text-white' : 'text-void-fg-4 group-hover:text-void-accent'} transition-colors`} aria-hidden="true" />
			</div>
			<div className="min-w-0">
				<span className="block text-sm font-semibold text-void-fg-1">{title}</span>
				<span className="block text-[10px] text-void-fg-4 font-medium">{subtitle}</span>
			</div>
		</button>
	);
});

ActionButton.displayName = 'ActionButton';

export const DashboardView = memo(({ stats, onNewThread, onBrowseFiles, onOpenSettings }: DashboardViewProps) => {
	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-8 pb-4">
				<div className="mb-8">
					<h2 className="text-2xl font-bold text-void-fg-1 tracking-tight">Dashboard</h2>
					<p className="text-xs text-void-fg-4 mt-1">Overview of your activity and workspace</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
					<StatCard
						icon={MessageSquare}
						label="Conversations"
						value={stats.threadsCount}
						color="from-blue-500/10 to-blue-600/10"
					/>
					<StatCard
						icon={Zap}
						label="Messages"
						value={stats.messagesCount}
						color="from-purple-500/10 to-purple-600/10"
					/>
					<StatCard
						icon={Clock}
						label="Active Time"
						value={formatDuration(stats.activeTime)}
						color="from-amber-500/10 to-orange-600/10"
					/>
					<StatCard
						icon={Sparkles}
						label="AI Tokens"
						value={formatTokens(stats.totalTokens)}
						color="from-cyan-500/10 to-teal-600/10"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-hidden px-8 pb-8">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
					<div className="lg:col-span-2 flex flex-col min-h-0">
						<h3 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider mb-4">Quick Actions</h3>
						<div className="flex flex-col gap-3">
							<ActionButton
								onClick={onNewThread}
								icon={Plus}
								title="New Conversation"
								subtitle="Start a fresh chat"
								primary
							/>
							<ActionButton
								onClick={onBrowseFiles}
								icon={Folder}
								title="Browse Files"
								subtitle="Explore workspace"
							/>
							<ActionButton
								onClick={onOpenSettings}
								icon={Settings}
								title="Settings"
								subtitle="Configure A-Coder"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h3 className="text-sm font-bold text-void-fg-1 uppercase tracking-wider mb-1">Stats Summary</h3>
						<div className="p-4 rounded-xl border border-void-border-2 bg-void-bg-2">
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
});

DashboardView.displayName = 'DashboardView';
