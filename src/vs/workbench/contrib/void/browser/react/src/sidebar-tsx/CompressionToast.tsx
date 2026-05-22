/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { useCompressionEvent } from '../util/services.js';
import { X, Minimize2, FileText } from 'lucide-react';

export const CompressionToast: React.FC = () => {
	const event = useCompressionEvent();
	const [dismissed, setDismissed] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (event) {
			setDismissed(false);
			setVisible(true);
			const timer = setTimeout(() => {
				setVisible(false);
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [event]);

	if (!event || dismissed || !visible) return null;

	const {
		originalMessages,
		finalMessages,
		originalTokens,
		finalTokens,
		compressionRatio,
		messagesRemoved,
		messagesSummarized,
	} = event;

	const savedTokens = originalTokens - finalTokens;
	const savedPercent = compressionRatio > 0 ? Math.round(compressionRatio * 100) : 0;

	return (
		<div className="flex items-start gap-2 px-3 py-2 mx-2 mb-2 bg-void-bg-2 border border-void-border-2 rounded-xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
			role="alert"
		>
			<div className="p-1.5 rounded-md bg-void-accent/10 text-void-accent flex-shrink-0">
				<Minimize2 size={14} />
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold text-void-fg-1">Context Compressed</span>
					<span className="text-[10px] font-medium text-void-accent bg-void-accent/10 px-1.5 py-0.5 rounded-full">
						{savedPercent}% smaller
					</span>
				</div>
				<div className="text-[11px] text-void-fg-3 mt-0.5 leading-relaxed">
					{messagesRemoved > 0 && (
						<span>{messagesRemoved} message{messagesRemoved !== 1 ? 's' : ''} removed, </span>
					)}
					{messagesSummarized > 0 && (
						<span>{messagesSummarized} summarized, </span>
					)}
					<span>{originalTokens.toLocaleString()} → {finalTokens.toLocaleString()} tokens</span>
				</div>
			</div>
			<button
				onClick={() => { setVisible(false); setDismissed(true); }}
				className="p-1 text-void-fg-4 hover:text-void-fg-2 flex-shrink-0 transition-colors"
				aria-label="Dismiss compression notification"
			>
				<X size={12} />
			</button>
		</div>
	);
};

export default CompressionToast;
