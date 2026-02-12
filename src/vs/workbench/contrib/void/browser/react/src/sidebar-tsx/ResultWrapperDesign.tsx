/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X, AlertCircle, Clock, Loader2, MoreHorizontal, Copy, Trash2 } from 'lucide-react';

export type ResultStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'rejected';

export interface ResultWrapperDesignProps {
	title: string;
	status: ResultStatus;
	description?: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
	onClose?: () => void;
	onCopy?: () => void;
	onRetry?: () => void;
	onDismiss?: () => void;
	activityText?: string; // For running state
	icon?: React.ReactNode;
	badge?: React.ReactNode;
	footer?: React.ReactNode;
	compact?: boolean;
	hideBorder?: boolean;
}

// Status icons
const statusIcons: Record<ResultStatus, React.ReactNode> = {
	idle: <Clock size={14} />,
	running: <Loader2 size={14} className="animate-spin" />,
	success: <Check size={14} />,
	error: <X size={14} />,
	warning: <AlertCircle size={14} />,
	rejected: <X size={14} />,
};

// Status colors
const statusColors: Record<ResultStatus, { bg: string; border: string; text: string; icon: string }> = {
	idle: { bg: 'bg-void-bg-2', border: 'border-void-border-2', text: 'text-void-fg-3', icon: 'text-void-fg-3' },
	running: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'text-blue-500' },
	success: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-500' },
	error: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-500' },
	warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: 'text-yellow-500' },
	rejected: { bg: 'bg-void-bg-2', border: 'border-void-border-2', text: 'text-void-fg-3', icon: 'text-void-fg-3' },
};

// Action button component
export interface ResultActionButtonProps {
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	variant?: 'default' | 'primary' | 'danger' | 'ghost';
	disabled?: boolean;
}

export const ResultActionButton: React.FC<ResultActionButtonProps> = ({
	onClick,
	icon,
	label,
	variant = 'default',
	disabled = false,
}) => {
	const variantStyles = {
		default: 'bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 border-void-border-2',
		primary: 'bg-void-accent hover:bg-void-accent-hover text-white border-void-accent',
		danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/30',
		ghost: 'hover:bg-void-bg-3 text-void-fg-3 border-transparent',
	};

	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className={`
				flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
				border ${variantStyles[variant]}
				${disabled ? 'opacity-50 cursor-not-allowed' : ''}
			`}
			title={label}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
};

// Action menu component
interface ActionMenuProps {
	children: React.ReactNode;
}
export const ActionMenu: React.FC<ActionMenuProps> = ({ children }) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="relative">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
				title="More actions"
			>
				<MoreHorizontal size={14} className="text-void-fg-3" />
			</button>
			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-10"
						onClick={() => setIsOpen(false)}
					/>
					<div className="absolute right-0 top-full mt-1 bg-void-bg-1 border border-void-border-2 rounded-lg shadow-xl py-1 min-w-32 z-20">
						{children}
					</div>
				</>
			)}
		</div>
	);
};

// Main ResultWrapperDesign component
export const ResultWrapperDesign: React.FC<ResultWrapperDesignProps> = ({
	title,
	status,
	description,
	children,
	defaultOpen = true,
	onClose,
	onCopy,
	onRetry,
	onDismiss,
	activityText,
	icon,
	badge,
	footer,
	compact = false,
	hideBorder = false,
}) => {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const colors = statusColors[status];
	const statusIcon = statusIcons[status];

	const handleCopy = () => {
		onCopy?.();
		setIsOpen(true);
	};

	const actions = (
		<div className="flex items-center gap-1">
			{status === 'running' && activityText && (
				<div className="flex items-center gap-1.5 text-xs text-void-fg-3">
					<Loader2 size={12} className="animate-spin" />
					<span className="truncate max-w-32">{activityText}</span>
				</div>
			)}

			{onCopy && status === 'success' && (
				<ResultActionButton
					onClick={handleCopy}
					icon={<Copy size={12} />}
					label="Copy"
					variant="ghost"
				/>
			)}

			{onRetry && status === 'error' && (
				<ResultActionButton
					onClick={onRetry}
					icon={<Loader2 size={12} />}
					label="Retry"
					variant="default"
				/>
			)}

			{onDismiss && status === 'error' && (
				<ResultActionButton
					onClick={onDismiss}
					icon={<X size={12} />}
					label="Dismiss"
					variant="ghost"
				/>
			)}

			{onClose && !compact && (
				<button
					onClick={onClose}
					className="p-1 hover:bg-void-bg-3 rounded-lg transition-colors"
					title="Close"
				>
					<X size={14} className="text-void-fg-3" />
				</button>
			)}

			{isOpen && !compact && (
				<button
					onClick={() => setIsOpen(false)}
					className="p-1 hover:bg-void-bg-3 rounded-lg transition-colors"
					title="Collapse"
				>
					<ChevronUp size={14} className="text-void-fg-3" />
				</button>
			)}

			{!isOpen && (
				<button
					onClick={() => setIsOpen(true)}
					className="p-1 hover:bg-void-bg-3 rounded-lg transition-colors"
					title="Expand"
				>
					<ChevronDown size={14} className="text-void-fg-3" />
				</button>
			)}
		</div>
	);

	return (
		<div className={`
			${hideBorder ? '' : 'border border-void-border-2'}
			${compact ? 'rounded-lg' : 'rounded-xl'}
			overflow-hidden
			transition-all duration-200
		`}>
			{/* Header */}
			<div className={`
				${colors.bg} ${colors.border}
				px-4 py-3 flex items-start justify-between
				${hideBorder ? '' : 'border-b'}
				${status === 'running' ? 'animate-pulse' : ''}
			`}>
				<div className="flex items-center gap-3 flex-1 min-w-0">
					{/* Status Icon */}
					<div className={`
						p-1.5 rounded-lg
						${colors.bg} ${colors.border}
					`}>
						<span className={colors.icon}>{statusIcon}</span>
					</div>

					{/* Title and Description */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<h3 className={`text-sm font-semibold ${colors.text} truncate`}>
								{title}
							</h3>
							{badge && <span className="text-xs">{badge}</span>}
						</div>
						{description && !compact && (
							<p className="text-xs text-void-fg-4 mt-0.5 truncate">{description}</p>
						)}
					</div>
				</div>

				{actions}
			</div>

			{/* Content */}
			{isOpen && (
				<div className="px-4 py-3 bg-void-bg-1">
					{children}
				</div>
			)}

			{/* Footer */}
			{footer && isOpen && (
				<div className="px-4 py-2 bg-void-bg-2 border-t border-void-border-1">
					{footer}
				</div>
			)}
		</div>
	);
};

// Compact version for inline results
export const CompactResultWrapper: React.FC<{
	title: string;
	status: ResultStatus;
	value: string | number;
	children?: React.ReactNode;
	onClick?: () => void;
}> = ({ title, status, value, children, onClick }) => {
	const colors = statusColors[status];
	const statusIcon = statusIcons[status];

	return (
		<div
			onClick={onClick}
			className={`
				px-3 py-2 bg-void-bg-2 border border-void-border-2 rounded-lg
				${onClick ? 'cursor-pointer hover:border-void-border-1' : ''}
				transition-colors
			`}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className={colors.icon}>{statusIcon}</span>
					<span className="text-xs text-void-fg-3">{title}</span>
				</div>
				<div className="flex items-center gap-2">
					<span className={`text-sm font-medium ${colors.text}`}>{value}</span>
					{children}
				</div>
			</div>
		</div>
	);
};

// Progress bar component
export const ResultProgressBar: React.FC<{
	value: number;
	max: number;
	color?: 'success' | 'warning' | 'error' | 'accent';
	showLabel?: boolean;
}> = ({ value, max = 100, color = 'accent', showLabel = false }) => {
	const percentage = Math.min(100, Math.round((value / max) * 100));

	const colorClasses = {
		success: 'bg-green-500',
		warning: 'bg-yellow-500',
		error: 'bg-red-500',
		accent: 'bg-void-accent',
	};

	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-2 bg-void-bg-3 rounded-full overflow-hidden">
				<div
					className={`h-full ${colorClasses[color]} transition-all duration-500`}
					style={{ width: `${percentage}%` }}
				/>
			</div>
			{showLabel && (
				<span className="text-xs text-void-fg-3 w-10 text-right">{percentage}%</span>
			)}
		</div>
	);
};

// Status badge component
export const StatusBadge: React.FC<{ status: ResultStatus; text?: string }> = ({ status, text }) => {
	const colors = statusColors[status];
	const statusIcon = statusIcons[status];

	return (
		<span className={`
			inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
			${colors.bg} ${colors.border} ${colors.text}
		`}>
			<span className={colors.icon}>{statusIcon}</span>
			{text || status}
		</span>
	);
};

export default ResultWrapperDesign;