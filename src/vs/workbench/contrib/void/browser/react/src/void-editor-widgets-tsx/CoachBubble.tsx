/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Lightbulb, AlertTriangle, Info, X, MessageSquare } from 'lucide-react';

import '../styles.css'

export type CoachBubbleProps = {
	observation?: {
		message?: string;
		severity?: 'info' | 'warning' | 'error';
	};
	onDismiss?: () => void;
	onDiscuss?: () => void;
};

export const CoachBubble: React.FC<CoachBubbleProps> = ({
	observation,
	onDismiss,
	onDiscuss,
}) => {
	const [isVisible, setIsVisible] = useState(false);

	// Guard against undefined observation
	if (!observation) {
		return null;
	}

	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), 100);
		return () => clearTimeout(timer);
	}, []);

	const severityConfig = {
		error: {
			icon: AlertTriangle,
			bg: 'bg-red-50 dark:bg-red-900/20',
			border: 'border-red-200 dark:border-red-800',
			text: 'text-red-700 dark:text-red-400',
			iconBg: 'bg-red-100 dark:bg-red-900/40',
		},
		warning: {
			icon: Lightbulb,
			bg: 'bg-amber-50 dark:bg-amber-900/20',
			border: 'border-amber-200 dark:border-amber-800',
			text: 'text-amber-700 dark:text-amber-400',
			iconBg: 'bg-amber-100 dark:bg-amber-900/40',
		},
		info: {
			icon: Info,
			bg: 'bg-blue-50 dark:bg-blue-900/20',
			border: 'border-blue-200 dark:border-blue-800',
			text: 'text-blue-700 dark:text-blue-400',
			iconBg: 'bg-blue-100 dark:bg-blue-900/40',
		},
	};

	const config = severityConfig[observation.severity] || severityConfig.info;
	const Icon = config.icon;

	const handleDismiss = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsVisible(false);
		setTimeout(onDismiss, 200);
	};

	const handleDiscuss = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsVisible(false);
		setTimeout(onDiscuss, 200);
	};

	return (
		<div
			className={`
				pointer-events-auto select-none
				max-w-sm rounded-lg shadow-lg border p-4
				transition-all duration-300 ease-out
				${config.bg} ${config.border}
				${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
			`}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center gap-2">
					<div className={`p-1.5 rounded-full ${config.iconBg}`}>
						<Icon size={16} className={config.text} />
					</div>
					<span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
						Coach
					</span>
				</div>
				<button
					onClick={handleDismiss}
					className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
				>
					<X size={14} className="text-gray-400" />
				</button>
			</div>

			<p className={`text-sm leading-relaxed mb-3 ${config.text}`}>
				{observation.message}
			</p>

			<div className="flex items-center gap-2">
				<button
					onClick={handleDiscuss}
					className={`
						flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
						transition-all duration-200 hover:opacity-90 active:scale-95
						${config.text} ${config.iconBg} ${config.border} border
					`}
				>
					<MessageSquare size={12} />
					<span>Let's discuss</span>
				</button>
			</div>
		</div>
	);
};

export default CoachBubble;
