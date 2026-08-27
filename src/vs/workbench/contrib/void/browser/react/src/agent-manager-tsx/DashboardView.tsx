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
			className='group flex w-full items-center gap-3.5 rounded-xl border border-void-hairline bg-void-bg-2 p-3.5 text-left transition-colors hover:border-void-accent/40 hover:bg-void-bg-2-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-void-accent'
			aria-label={title}
		>
			<span className={`grid size-9 shrink-0 place-items-center rounded-lg ${primary ? 'bg-void-accent' : 'border border-void-hairline bg-void-bg-3'}`}>
				<Icon className={`size-4 ${primary ? 'text-white' : 'text-void-fg-3 group-hover:text-void-accent'} transition-colors`} aria-hidden={true} />
			</span>
			<span className='min-w-0'>
				<span className='block text-[13px] font-medium text-void-fg-1'>{title}</span>
				<span className='block text-[11px] text-void-scaffold-meta'>{subtitle}</span>
			</span>
		</button>
	);
});

ActionButton.displayName = 'ActionButton';

export const DashboardView = memo(({ stats, onNewThread, onBrowseFiles, onOpenSettings }: DashboardViewProps) => {
	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-8 pb-4">
				<div className='mb-6'>
					<h2 className='text-xl font-semibold tracking-tight text-void-fg-1'>Overview</h2>
					<p className='mt-1 text-xs text-void-scaffold-meta'>Your activity and workspace at a glance</p>
				</div>

				<div className='mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
					<StatCard icon={MessageSquare} label='Conversations' value={stats.threadsCount} />
					<StatCard icon={Zap} label='Messages' value={stats.messagesCount} />
					<StatCard icon={Clock} label='Active Time' value={formatDuration(stats.activeTime)} />
					<StatCard icon={Sparkles} label='AI Tokens' value={formatTokens(stats.totalTokens)} />
				</div>
			</div>

			<div className="flex-1 overflow-hidden px-8 pb-8">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
					<div className="lg:col-span-2 flex flex-col min-h-0">
						<h3 className='mb-3 text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>Quick actions</h3>
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
								subtitle="Configure A-Coder IDE"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<h3 className='mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>Summary</h3>
						<div className='rounded-xl border border-void-hairline bg-void-bg-2 p-4'>
							<div className='space-y-2.5'>
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
