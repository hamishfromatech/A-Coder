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
		<div className='flex h-full min-w-0 flex-col bg-void-bg-2'>
			<div className='flex items-center justify-between border-b border-void-hairline px-4 py-2'>
				<span className='text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>{title}</span>
			</div>
			<div className='custom-scrollbar flex-1 overflow-auto p-5'>
				<ChatMarkdownRender string={content} chatMessageLocation={undefined} />
			</div>
		</div>
	);
});

ContentPreview.displayName = 'ContentPreview';
