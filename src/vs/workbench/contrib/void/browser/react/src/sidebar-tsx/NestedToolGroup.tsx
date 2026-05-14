/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { Layers, ChevronRight, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { ChatMessage, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { ToolName } from '../../../../common/toolsServiceTypes.js';
import { ChatBubble } from './SidebarChat.js';

export type NestedToolGroupProps = {
	toolMessages: (ChatMessage & { role: 'tool' })[];
	indices: number[];
	currCheckpointIdx: number | undefined;
	chatIsRunning: boolean;
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
	const allDone = done === total;

	const statusColor = errors > 0 ? 'text-red-400' : allDone ? 'text-green-400' : running > 0 ? 'text-void-accent' : 'text-void-fg-3';

	return (
		<div className="my-2">
			{/* Collapsible header */}
			<div
				className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-void-bg-2 border border-void-border-2 cursor-pointer hover:bg-void-bg-3 transition-colors select-none"
				onClick={() => setIsOpen(o => !o)}
			>
				<ChevronRight size={14} className={`text-void-fg-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
				<Layers size={13} className={statusColor} />
				<span className="text-xs font-semibold text-void-fg-1">
					{total} tools ran in parallel
				</span>
				<span className="flex items-center gap-1 ml-auto">
					{running > 0 && <Loader2 size={11} className="animate-spin text-void-accent" />}
					{done > 0 && <Check size={11} className="text-green-400" />}
					{errors > 0 && <AlertTriangle size={11} className="text-red-400" />}
					<span className="text-[10px] text-void-fg-3 tabular-nums">
						{done}/{total}
					</span>
				</span>
			</div>

			{/* Expanded children */}
			<div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
				<div className="pl-3 border-l-2 border-void-border-2 space-y-1">
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
