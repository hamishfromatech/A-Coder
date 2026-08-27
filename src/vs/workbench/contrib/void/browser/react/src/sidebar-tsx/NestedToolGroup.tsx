/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------
 *
 * A run of parallel tool calls, as the transcript reads it: one quiet
 * scaffold line that summarizes the batch ("5 tools ran in parallel · 3/5"),
 * with the individual rows beneath it. Flat — no card chrome, no left rail;
 * the indent alone carries the nesting. While the run is live the label
 * ticks with a glyph spinner; when it settles it reads as a normal
 * expandable scaffold line.
 */

import React, { useState } from 'react';
import { ChatMessage } from '../../../../common/chatThreadServiceTypes.js';
import { IsRunningType } from '../../../chatThreadService.js';
import { ChatBubble } from './SidebarChat.js';
import { GlyphSpinner } from '../util/status.js';

export type NestedToolGroupProps = {
	toolMessages: (ChatMessage & { role: 'tool' })[];
	indices: number[];
	currCheckpointIdx: number | undefined;
	chatIsRunning: IsRunningType;
	threadId: string;
	_scrollToBottom: (() => void) | null;
};

export const NestedToolGroup: React.FC<NestedToolGroupProps> = ({
	toolMessages,
	indices,
	currCheckpointIdx,
	chatIsRunning,
	threadId,
	_scrollToBottom,
}) => {
	const [isOpen, setIsOpen] = useState(false);

	const total = toolMessages.length;
	const done = toolMessages.filter(m => m.type === 'success').length;
	const errors = toolMessages.filter(m => m.type === 'tool_error').length;
	const running = toolMessages.filter(m => m.type === 'running_now' || m.type === 'tool_request').length;

	// Live while any member is still working; the summary line narrates in the
	// present tense, then settles into a plain expandable scaffold line.
	const isLive = running > 0 && !!chatIsRunning;

	return (
		<div className='my-1 min-w-0'>
			{/* Summary line — quiet label + trailing count; caret revealed on hover */}
			<div
				className='group/run flex w-full min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-void-row-hover'
				onClick={() => setIsOpen(o => !o)}
			>
				<span className='grid size-3.5 shrink-0 place-items-center text-void-scaffold-meta'>
					{isLive && <GlyphSpinner className='text-[0.9rem]' />}
				</span>
				<span className='min-w-0 flex-1 truncate text-[13px] leading-[1.45] text-void-scaffold-text transition-colors group-hover:text-void-fg-2'>
					{total} tool{total === 1 ? '' : 's'} ran in parallel
				</span>
				<span className='flex shrink-0 items-center gap-1.5'>
					{errors > 0 && <span className='text-[10px] font-medium text-void-error'>{errors} failed</span>}
					<span className='text-[10px] font-medium tabular-nums text-void-scaffold-meta'>
						{done}/{total}
					</span>
					<svg
						className={`size-3 shrink-0 text-void-scaffold-meta transition-all duration-150 ease-out ${isOpen ? 'rotate-90 opacity-80' : 'opacity-0 group-hover:opacity-80'}`}
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth='2'
						strokeLinecap='round'
						strokeLinejoin='round'
					>
						<path d='m9 18 6-6-6-6' />
					</svg>
				</span>
			</div>

			{/* Expanded children — flat indent, no divider rail */}
			<div className={`overflow-hidden transition-all duration-200 ease-out ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
				<div className='flex flex-col gap-0.5 pl-4 pt-0.5'>
					{toolMessages.map((msg, i) => (
						<ChatBubble
							key={indices[i]}
							currCheckpointIdx={currCheckpointIdx}
							chatMessage={msg}
							messageIdx={indices[i]}
							isCommitted={true}
							chatIsRunning={chatIsRunning}
							threadId={threadId}
							_scrollToBottom={_scrollToBottom}
						/>
					))}
				</div>
			</div>
		</div>
	);
};