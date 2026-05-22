/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useMemo, useState } from 'react';
import { CopyButton, IconShell1 } from '../markdown/ApplyBlockHoverButtons.js';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useFullChatThreadsStreamState, useSettingsState, showThreadDeletedToast } from '../util/services.js';
import { IconX } from './SidebarChat.js';
import { Check, Copy, Icon, LoaderCircle, MessageCircleQuestion, PenLine, Trash2, UserCheck, X } from 'lucide-react';
import { IsRunningType, ThreadType } from '../../../chatThreadService.js';


const numInitialThreads = 3

export const PastThreadsList = ({ className = '', searchQuery = '' }: { className?: string; searchQuery?: string }) => {
	const [showAll, setShowAll] = useState(false);

	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

	const threadsState = useChatThreadsState()
	const { allThreads } = threadsState

	const streamState = useFullChatThreadsStreamState()

	const runningThreadIds: { [threadId: string]: IsRunningType | undefined } = {}
	for (const threadId in streamState) {
		const isRunning = streamState[threadId]?.isRunning
		if (isRunning) { runningThreadIds[threadId] = isRunning }
	}

	if (!allThreads) {
		return <div key="error" className="p-1">{`Error accessing chat history.`}</div>;
	}

	const query = searchQuery.toLowerCase().trim();

	// sorted by most recent to least recent, filtered by search query
	const sortedThreadIds = Object.keys(allThreads ?? {})
		.sort((threadId1, threadId2) => (allThreads[threadId1]?.lastModified ?? 0) > (allThreads[threadId2]?.lastModified ?? 0) ? -1 : 1)
		.filter(threadId => (allThreads![threadId]?.messages.length ?? 0) !== 0)
		.filter(threadId => {
			if (!query) return true;
			const thread = allThreads![threadId];
			if (!thread) return false;
			const firstUserMsg = thread.messages.find(m => m.role === 'user');
			if (firstUserMsg?.displayContent?.toLowerCase().includes(query)) return true;
			const firstAsstMsg = thread.messages.find(m => m.role === 'assistant');
			if (firstAsstMsg?.displayContent?.toLowerCase().includes(query)) return true;
			return false;
		})

	// Get only first 5 threads if not showing all
	const hasMoreThreads = sortedThreadIds.length > numInitialThreads;
	const displayThreads = showAll ? sortedThreadIds : sortedThreadIds.slice(0, numInitialThreads);

	return (
		<div className={`flex flex-col mb-2 gap-0 w-full text-nowrap text-void-fg-3 select-none relative pb-20 ${className}`}>
			{displayThreads.length === 0 // this should never happen
				? <></>
				: displayThreads.map((threadId, i) => {
					const pastThread = allThreads[threadId];
					if (!pastThread) {
						return <div key={i} className="p-1">{`Error accessing chat history.`}</div>;
					}

					return (
						<PastThreadElement
							key={pastThread.id}
							pastThread={pastThread}
							idx={i}
							hoveredIdx={hoveredIdx}
							setHoveredIdx={setHoveredIdx}
							isRunning={runningThreadIds[pastThread.id]}
						/>
					);
				})
			}

			{hasMoreThreads && !showAll && (
				<div
					className="text-void-fg-3 opacity-70 hover:opacity-100 cursor-pointer py-2 text-xs"
					onClick={() => setShowAll(true)}
				>
					Show {sortedThreadIds.length - numInitialThreads} more...
				</div>
			)}
			{hasMoreThreads && showAll && (
				<div
					className="text-void-fg-3 opacity-70 hover:opacity-100 cursor-pointer py-2 text-xs"
					onClick={() => setShowAll(false)}
				>
					Show less
				</div>
			)}
		</div>
	);
};





// Format date to display as today, yesterday, or date
const formatDate = (date: Date) => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	if (date >= today) {
		return 'Today';
	} else if (date >= yesterday) {
		return 'Yesterday';
	} else {
		return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
	}
};

// Format time to 12-hour format
const formatTime = (date: Date) => {
	return date.toLocaleString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
};


const RenameButton = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => {
	return <IconShell1
		Icon={PenLine}
		className='size-3.5'
		onClick={onClick}
		data-tooltip-id='void-tooltip'
		data-tooltip-place='top'
		data-tooltip-content='Rename thread'
	>
	</IconShell1>
}

const DuplicateButton = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	return <IconShell1
		Icon={Copy}
		className='size-3.5'
		onClick={() => { chatThreadsService.duplicateThread(threadId); }}
		data-tooltip-id='void-tooltip'
		data-tooltip-place='top'
		data-tooltip-content='Duplicate thread'
	>
	</IconShell1>

}

const TrashButton = ({ threadId }: { threadId: string }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')


	const [isTrashPressed, setIsTrashPressed] = useState(false)

	return (isTrashPressed ?
		<div className='flex flex-nowrap text-nowrap gap-1'>
			<IconShell1
				Icon={X}
				className='size-3.5'
				onClick={() => { setIsTrashPressed(false); }}
				data-tooltip-id='void-tooltip'
				data-tooltip-place='top'
				data-tooltip-content='Cancel'
			/>
			<IconShell1
				Icon={Check}
				className='size-3.5'
				onClick={() => { chatThreadsService.deleteThread(threadId); setIsTrashPressed(false); showThreadDeletedToast(); }}
				data-tooltip-id='void-tooltip'
				data-tooltip-place='top'
				data-tooltip-content='Confirm'
			/>
		</div>
		: <IconShell1
			Icon={Trash2}
			className='size-3.5'
			onClick={() => { setIsTrashPressed(true); }}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Delete thread'
		/>
	)
}

const PastThreadElement = ({ pastThread, idx, hoveredIdx, setHoveredIdx, isRunning }: {
	pastThread: ThreadType,
	idx: number,
	hoveredIdx: number | null,
	setHoveredIdx: (idx: number | null) => void,
	isRunning: IsRunningType | undefined,
}

) => {


	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	const [isRenaming, setIsRenaming] = useState(false)
	const [renameValue, setRenameValue] = useState('')

	let displayName = pastThread.name;
	if (!displayName) {
		const firstUserMsgIdx = pastThread.messages.findIndex((msg) => msg.role === 'user');
		if (firstUserMsgIdx !== -1) {
			const firstUserMsgObj = pastThread.messages[firstUserMsgIdx];
			displayName = firstUserMsgObj.role === 'user' && firstUserMsgObj.displayContent || '';
		} else {
			displayName = 'New Thread';
		}
	}

	const numMessages = pastThread.messages.filter((msg) => msg.role === 'assistant' || msg.role === 'user').length;

	const detailsHTML = <span
	>
		<span className='opacity-60'>{numMessages}</span>
		{` `}
		{formatDate(new Date(pastThread.lastModified))}
	</span>

	const handleStartRename = (e: React.MouseEvent) => {
		e.stopPropagation();
		setRenameValue(pastThread.name || displayName);
		setIsRenaming(true);
	};

	const handleConfirmRename = (e?: React.MouseEvent | React.KeyboardEvent) => {
		e?.stopPropagation?.();
		const trimmed = renameValue.trim();
		if (trimmed) {
			chatThreadsService.setThreadName(pastThread.id, trimmed);
		}
		setIsRenaming(false);
	};

	const handleCancelRename = (e?: React.MouseEvent) => {
		e?.stopPropagation?.();
		setIsRenaming(false);
	};

	return <div
		key={pastThread.id}
		className={`
			py-2 px-2 text-sm cursor-pointer text-void-fg-2 hover:text-void-fg-1 hover:bg-void-bg-1 rounded-md transition-all duration-200
		`}
		onClick={() => {
			if (!isRenaming) {
				chatThreadsService.switchToThread(pastThread.id);
			}
		}}
		onMouseEnter={() => setHoveredIdx(idx)}
		onMouseLeave={() => setHoveredIdx(null)}
	>
		<div className="flex items-center justify-between gap-2">
			<span className="flex items-center gap-2 min-w-0 overflow-hidden">
				{/* spinner or checkmark */}
				{isRunning === 'LLM' || isRunning === 'tool' || isRunning === 'idle' ?
					<LoaderCircle className="animate-spin text-void-fg-3 flex-shrink-0 flex-grow-0" size={14} />
					:
					isRunning === 'awaiting_user' ?
						<MessageCircleQuestion className="text-void-fg-3 flex-shrink-0 flex-grow-0" size={14} />
						:
						<Check className="text-void-fg-3 flex-shrink-0 flex-grow-0" size={14} />
				}
				{/* name */}
				{isRenaming ? (
					<div className="flex items-center gap-1 flex-1 min-w-0">
						<input
							type="text"
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === 'Enter') {
									handleConfirmRename(e);
								} else if (e.key === 'Escape') {
									handleCancelRename();
								}
							}}
							onClick={(e) => e.stopPropagation()}
							className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-void-bg-1 border border-void-border-1 rounded text-void-fg-1 focus:outline-none focus:ring-1 focus:ring-void-accent"
							autoFocus
						/>
						<IconShell1
							Icon={Check}
							className='size-3'
							onClick={handleConfirmRename}
							data-tooltip-id='void-tooltip'
							data-tooltip-place='top'
							data-tooltip-content='Save name'
						/>
						<IconShell1
							Icon={X}
							className='size-3'
							onClick={handleCancelRename}
							data-tooltip-id='void-tooltip'
							data-tooltip-place='top'
							data-tooltip-content='Cancel'
						/>
					</div>
				) : (
					<span className="truncate overflow-hidden text-ellipsis font-medium"
						data-tooltip-id='void-tooltip'
						data-tooltip-content={numMessages + ' messages'}
						data-tooltip-place='top'
					>{displayName}</span>
				)}
			</span>

			<div className="flex items-center gap-x-1.5 text-void-fg-3 text-xs flex-shrink-0">
				{idx === hoveredIdx && !isRenaming ?
					<>
							{/* rename icon */}
						<RenameButton onClick={handleStartRename} />

						{/* duplicate icon */}
						<DuplicateButton threadId={pastThread.id} />

						{/* trash icon */}
						<TrashButton threadId={pastThread.id} />
					</>
					: <>
						{detailsHTML}
					</>
				}
			</div>
		</div>
	</div>
}
