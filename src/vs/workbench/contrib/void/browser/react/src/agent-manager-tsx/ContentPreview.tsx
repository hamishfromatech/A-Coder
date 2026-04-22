/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';

interface ContentPreviewProps {
	title: string;
	content: string;
}

export const ContentPreview = memo(({ title, content }: ContentPreviewProps) => {
	return (
		<div className="h-full flex flex-col bg-void-bg-3 border-l border-void-border-2 shadow-lg">
			<div className="px-6 py-4 border-b border-void-border-2 bg-void-bg-2 flex items-center justify-between">
				<span className="text-xs font-bold text-void-fg-1 uppercase tracking-widest">{title}</span>
				<span className="px-2 py-0.5 rounded bg-void-accent/10 text-void-accent text-[9px] font-bold border border-void-accent/20 uppercase">Markdown</span>
			</div>
			<div className="flex-1 overflow-auto p-6 custom-scrollbar">
				<ChatMarkdownRender string={content} chatMessageLocation={undefined} />
			</div>
		</div>
	);
});

ContentPreview.displayName = 'ContentPreview';
