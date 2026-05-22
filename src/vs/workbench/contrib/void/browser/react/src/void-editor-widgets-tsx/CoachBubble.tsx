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
			borderLeft: 'border-l-red-500',
			iconColor: 'text-red-500',
			iconBg: 'bg-red-500/10',
		},
		warning: {
			icon: Lightbulb,
			borderLeft: 'border-l-yellow-500',
			iconColor: 'text-yellow-500',
			iconBg: 'bg-yellow-500/10',
		},
		info: {
			icon: Info,
			borderLeft: 'border-l-void-accent',
			iconColor: 'text-void-accent',
			iconBg: 'bg-void-accent/10',
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
				max-w-sm rounded-lg shadow-lg border border-void-border-2 border-l-4 bg-void-bg-1 p-4
				transition-all duration-300 ease-out
				${config.borderLeft}
				${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
			`}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center gap-2">
					<div className={`p-1.5 rounded-full ${config.iconBg}`}>
						<Icon size={16} className={config.iconColor} />
					</div>
					<span className="text-xs font-semibold uppercase tracking-wide text-void-fg-3">
						Coach
					</span>
				</div>
				<button
					onClick={handleDismiss}
					className="p-1 rounded hover:bg-void-bg-2 transition-colors"
				>
					<X size={14} className="text-void-fg-4" />
				</button>
			</div>

			<p className={`text-sm leading-relaxed mb-3 text-void-fg-2`}>
				{observation.message}
			</p>

			<div className="flex items-center gap-2">
				<button
					onClick={handleDiscuss}
					className={`
						flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
						transition-all duration-200 hover:opacity-90 active:scale-95
						bg-void-bg-2 border border-void-border-2 text-void-fg-2 hover:bg-void-bg-3
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
