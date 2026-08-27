/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { FileCode } from 'lucide-react';
import { BlockCode } from '../util/inputs.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { useFileContent } from '../util/services.js';
import { GlyphSpinner } from '../util/status.js';

interface CodePreviewProps {
	selectedFileUri: URI | null;
}

export const CodePreview = memo(({ selectedFileUri }: CodePreviewProps) => {
	const { content, loading } = useFileContent(selectedFileUri);

	if (loading) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-3 bg-void-bg-2 text-void-fg-4'>
				<GlyphSpinner className='text-[1.1rem] text-void-fg-3' />
				<span className='text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta'>Loading preview</span>
			</div>
		);
	}

	if (!content || !selectedFileUri) {
		return (
			<div className='m-6 flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-void-hairline bg-void-bg-2 text-void-fg-4'>
				<div className='mb-3 grid h-12 w-12 place-items-center rounded-lg border border-void-hairline bg-void-bg-3'>
					<FileCode className='h-5 w-5 text-void-fg-4' />
				</div>
				<div className='px-8 text-center'>
					<h3 className='mb-1 text-[13px] font-medium text-void-fg-2'>No file selected</h3>
					<p className='mx-auto max-w-[200px] text-xs text-void-scaffold-meta'>Click on a file or walkthrough to preview its contents here.</p>
				</div>
			</div>
		);
	}

	const extension = selectedFileUri.fsPath.split('.').pop() || '';

	return (
		<div className='flex h-full min-w-0 flex-col bg-void-bg-2'>
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
});

CodePreview.displayName = 'CodePreview';