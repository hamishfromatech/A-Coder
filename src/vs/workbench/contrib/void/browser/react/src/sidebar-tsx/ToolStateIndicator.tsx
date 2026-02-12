/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Loader2, X, Pause, Play, RefreshCw, Terminal, Database, Search, FileText, Globe, Check, AlertCircle } from 'lucide-react';

export interface ToolActivity {
	id: string;
	name: string;
	phase: string;
	progress: number;
	details?: string;
	canCancel?: boolean;
	error?: string;
}

export interface ToolStateIndicatorProps {
	tools: ToolActivity[];
	onCancel?: (toolId: string) => void;
	onRetry?: (toolId: string) => void;
	compact?: boolean;
}

// Tool type icons
const toolIcons: Record<string, React.ReactNode> = {
	run_command: <Terminal size={14} />,
	read_file: <FileText size={14} />,
	search_in_file: <Search size={14} />,
	search_for_files: <Search size={14} />,
	edit_file: <FileText size={14} />,
	apply_code: <FileText size={14} />,
	database: <Database size={14} />,
	'http': <Globe size={14} />,
	fetch: <Globe size={14} />,
};

// Default icon
const DefaultIcon = () => <Loader2 size={14} className="animate-spin" />;

// Get icon for tool
function getToolIcon(toolName: string): React.ReactNode {
	return toolIcons[toolName] || <DefaultIcon />;
}

// Phase-specific messages
const phaseMessages: Record<string, string> = {
	starting: 'Initializing...',
	reading: 'Reading...',
	parsing: 'Parsing...',
	processing: 'Processing...',
	executing: 'Executing...',
	writing: 'Writing...',
	completed: 'Completed',
	error: 'Error',
};

// Compact version
export const CompactToolStateIndicator: React.FC<{
	tool: ToolActivity;
	onCancel?: () => void;
}> = ({ tool, onCancel }) => {
	const icon = getToolIcon(tool.name);
	const isError = tool.error !== undefined;
	const isSuccess = tool.progress >= 100;

	return (
		<div className={`
			flex items-center gap-2 px-3 py-2 rounded-lg text-xs
			${isError ? 'bg-red-500/10 border border-red-500/30' : isSuccess ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}
		`}>
			<span className={isError ? 'text-red-500' : isSuccess ? 'text-green-500' : 'text-blue-500'}>
				{isError ? <AlertCircle size={14} /> : isSuccess ? <Check size={14} /> : icon}
			</span>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between">
					<span className="text-void-fg-2 truncate">{tool.name}</span>
					<span className="text-void-fg-4">{tool.progress}%</span>
				</div>
				{tool.details && (
					<div className="text-void-fg-4 truncate">{tool.details}</div>
				)}
			</div>
			{tool.canCancel && tool.progress < 100 && onCancel && !isError && (
				<button
					onClick={onCancel}
					className="p-1 hover:bg-white/10 rounded transition-colors"
					title="Cancel"
				>
					<X size={12} className="text-void-fg-4" />
				</button>
			)}
		</div>
	);
};

// Full-featured tool state indicator
export const ToolStateIndicator: React.FC<ToolStateIndicatorProps> = ({
	tools,
	onCancel,
	onRetry,
	compact = false,
}) => {
	if (compact) {
		return (
			<div className="flex flex-col gap-1">
				{tools.map((tool) => (
					<CompactToolStateIndicator
						key={tool.id}
						tool={tool}
						onCancel={onCancel ? () => onCancel(tool.id) : undefined}
					/>
				))}
			</div>
		);
	}

	if (tools.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			{tools.map((tool) => {
				const icon = getToolIcon(tool.name);
				const isError = tool.error !== undefined;
				const isSuccess = tool.progress >= 100;

				return (
					<div
						key={tool.id}
						className={`
							p-3 rounded-lg border transition-all
							${isError ? 'bg-red-500/5 border-red-500/30' : isSuccess ? 'bg-green-500/5 border-green-500/30' : 'bg-blue-500/5 border-blue-500/30'}
						`}
					>
						{/* Header */}
						<div className="flex items-start justify-between mb-2">
							<div className="flex items-center gap-2">
								<span className={isError ? 'text-red-500' : isSuccess ? 'text-green-500' : 'text-blue-500'}>
									{isError ? <AlertCircle size={16} /> : isSuccess ? <Check size={16} /> : icon}
								</span>
								<div>
									<div className="text-sm font-medium text-void-fg-1">{tool.name}</div>
									<div className="text-xs text-void-fg-4">{tool.phase}</div>
								</div>
							</div>
							<div className="flex items-center gap-1">
								{isError && onRetry && (
									<button
										onClick={() => onRetry(tool.id)}
										className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
										title="Retry"
									>
										<RefreshCw size={14} className="text-red-400" />
									</button>
								)}
								{tool.canCancel && tool.progress < 100 && onCancel && !isError && (
									<button
										onClick={() => onCancel(tool.id)}
										className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
										title="Cancel"
									>
										<X size={14} className="text-void-fg-4" />
									</button>
								)}
							</div>
						</div>

						{/* Progress bar */}
						<div className="flex items-center gap-2 mb-2">
							<div className="flex-1 h-2 bg-void-bg-3 rounded-full overflow-hidden">
								<div
									className={`
										h-full transition-all duration-300
										${isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'bg-blue-500'}
									`}
									style={{ width: `${tool.progress}%` }}
								/>
							</div>
							<span className="text-xs text-void-fg-3 w-8 text-right">
								{tool.progress}%
							</span>
						</div>

						{/* Details */}
						{(tool.details || tool.error) && (
							<div className="text-xs text-void-fg-3 bg-void-bg-2/50 rounded px-2 py-1">
								{tool.error || tool.details}
							</div>
						)}

						{/* Estimated time */}
						{!isSuccess && !isError && tool.progress > 0 && tool.progress < 100 && (
							<div className="flex items-center gap-1 text-xs text-void-fg-4">
								<Clock size={10} />
								<span>~{Math.round((100 - tool.progress) / 10)}s remaining</span>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

// Clock icon for time estimation
const Clock = ({ size }: { size: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 16" />
	</svg>
);

// Active tool indicator (shows currently running tool)
export const ActiveToolIndicator: React.FC<{
	toolName: string;
	phase?: string;
	progress?: number;
	details?: string;
}> = ({ toolName, phase, progress = 0, details }) => {
	const icon = getToolIcon(toolName);

	return (
		<div className="flex items-center gap-3 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
			<span className="text-blue-500">
				<Loader2 size={16} className="animate-spin" />
			</span>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium text-void-fg-1 truncate">{toolName}</span>
					{progress > 0 && (
						<span className="text-xs text-blue-400">{progress}%</span>
					)}
				</div>
				{phase && <div className="text-xs text-void-fg-4">{phase}</div>}
				{details && <div className="text-xs text-void-fg-4 truncate">{details}</div>}
			</div>
		</div>
	);
};

// Tool queue indicator (shows tools waiting to run)
export const ToolQueueIndicator: React.FC<{
	queued: number;
	running?: string;
}> = ({ queued, running }) => {
	return (
		<div className="flex items-center gap-2 text-xs text-void-fg-3">
			{running ? (
				<>
					<span className="text-blue-400">
						<Loader2 size={12} className="animate-spin" />
					</span>
					<span>Running: {running}</span>
				</>
			) : (
				<span className="text-void-fg-4">Waiting...</span>
			)}
			{queued > 0 && (
				<>
					<span className="text-void-fg-4">•</span>
					<span>{queued} queued</span>
				</>
			)}
		</div>
	);
};

// Tool progress bar for individual tool
export const ToolProgressBar: React.FC<{
	toolName: string;
	progress: number;
	phase?: string;
	details?: string;
}> = ({ toolName, progress, phase, details }) => {
	const icon = getToolIcon(toolName);

	return (
		<div className="flex items-center gap-3 px-3 py-2 bg-void-bg-2 border border-void-border-2 rounded-lg">
			<span className="text-void-fg-3">{icon}</span>
			<div className="flex-1">
				<div className="flex items-center justify-between mb-1">
					<span className="text-sm text-void-fg-1">{toolName}</span>
					<span className="text-xs text-void-fg-3">{progress}%</span>
				</div>
				{phase && (
					<div className="flex items-center justify-between">
						<span className="text-xs text-void-fg-4">{phase}</span>
					</div>
				)}
				{details && <div className="text-xs text-void-fg-4 truncate">{details}</div>}
				<div className="h-1.5 bg-void-bg-3 rounded-full overflow-hidden mt-1">
					<div
						className="h-full bg-blue-500 transition-all duration-300"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>
		</div>
	);
};

// Cancellation confirmation dialog
export const CancellationDialog: React.FC<{
	toolName: string;
	onConfirm: () => void;
	onCancel: () => void;
}> = ({ toolName, onConfirm, onCancel }) => {
	return (
		<div className="p-4 bg-void-bg-2 border border-void-border-2 rounded-lg">
			<div className="flex items-start gap-3 mb-4">
				<div className="p-2 bg-orange-500/20 rounded-lg">
					<AlertCircle size={20} className="text-orange-500" />
				</div>
				<div>
					<h3 className="text-sm font-semibold text-void-fg-1">Cancel Tool?</h3>
					<p className="text-xs text-void-fg-3 mt-1">
						This will stop the "{toolName}" operation. Any partial progress may be lost.
					</p>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<button
					onClick={onCancel}
					className="px-3 py-1.5 text-xs font-medium text-void-fg-2 hover:bg-void-bg-3 rounded-lg transition-colors"
				>
					Keep Running
				</button>
				<button
					onClick={onConfirm}
					className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
				>
					Cancel Operation
				</button>
			</div>
		</div>
	);
};

export default ToolStateIndicator;