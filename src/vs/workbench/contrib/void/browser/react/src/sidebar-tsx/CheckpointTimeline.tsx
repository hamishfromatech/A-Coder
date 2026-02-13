/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useFullChatThreadsStreamState } from '../util/services.js';
import { ChatMessage, CheckpointEntry } from '../../../../common/chatThreadServiceTypes.js';
import { Undo2, ArrowUp, X, AlertTriangle } from 'lucide-react';

interface CheckpointTimelineProps {
	threadId: string;
	messages: ChatMessage[];
	scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
	currCheckpointIdx: number | undefined;
}

interface CheckpointInfo {
	messageIdx: number;
	checkpoint: CheckpointEntry;
	timestamp: Date;
	previewText: string;
}

// Confirmation Modal Component
const RevertConfirmationModal = ({
	isOpen,
	onConfirm,
	onCancel,
	checkpointInfo
}: {
	isOpen: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	checkpointInfo: CheckpointInfo | null;
}) => {
	if (!isOpen || !checkpointInfo) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onCancel}
			/>

			{/* Modal */}
			<div className="relative bg-void-bg-2 border border-void-border-2 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-void-border-3 bg-void-bg-3">
					<div className="p-2 rounded-full bg-yellow-500/20">
						<AlertTriangle className="w-5 h-5 text-yellow-500" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-void-fg-1">Revert to Checkpoint?</h3>
						<p className="text-xs text-void-fg-4">
							{formatTimestamp(checkpointInfo.timestamp)}
						</p>
					</div>
					<button
						onClick={onCancel}
						className="ml-auto p-1 hover:bg-void-bg-4 rounded transition-colors"
					>
						<X className="w-4 h-4 text-void-fg-3" />
					</button>
				</div>

				{/* Content */}
				<div className="px-4 py-4">
					<p className="text-sm text-void-fg-2 mb-3">
						This will revert your files to the state at this checkpoint.
					</p>
					<div className="p-3 bg-void-bg-4 rounded-md border border-void-border-3">
						<p className="text-xs text-yellow-500 font-medium mb-1">\u{26A0}\u{FE0F} Warning</p>
						<p className="text-xs text-void-fg-3">
							Any changes made after this checkpoint will be lost. This action cannot be undone.
						</p>
					</div>
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-2 px-4 py-3 border-t border-void-border-3 bg-void-bg-3">
					<button
						onClick={onCancel}
						className="px-4 py-2 text-sm text-void-fg-2 hover:bg-void-bg-4 rounded-md transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className="px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors"
					>
						Revert
					</button>
				</div>
			</div>
		</div>
	);
};

// Format timestamp for display
const formatTimestamp = (date: Date): string => {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
};

// Get preview text from messages around checkpoint
const getPreviewText = (messages: ChatMessage[], checkpointIdx: number): string => {
	// Look for the nearest user message before this checkpoint
	for (let i = checkpointIdx - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === 'user') {
			const content = msg.content || '';
			return content.length > 50 ? content.substring(0, 50) + '...' : content;
		}
	}
	return 'Checkpoint';
};

// Checkpoint Hover Popup
const CheckpointPopup = ({
	checkpointInfo,
	position,
	onRevert,
	onScrollTo,
	onClose,
	isDisabled
}: {
	checkpointInfo: CheckpointInfo;
	position: { top: number; left: number };
	onRevert: () => void;
	onScrollTo: () => void;
	onClose: () => void;
	isDisabled: boolean;
}) => {
	return (
		<div
			className="fixed z-50 bg-void-bg-2 border border-void-border-2 rounded-lg shadow-xl min-w-[200px] overflow-hidden"
			style={{
				top: position.top,
				left: position.left + 20,
				transform: 'translateY(-50%)'
			}}
			onMouseLeave={onClose}
		>
			{/* Header with timestamp */}
			<div className="px-3 py-2 border-b border-void-border-3 bg-void-bg-3">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium text-void-fg-1">
						{formatTimestamp(checkpointInfo.timestamp)}
					</span>
					<button
						onClick={onClose}
						className="p-0.5 hover:bg-void-bg-4 rounded transition-colors"
					>
						<X className="w-3 h-3 text-void-fg-4" />
					</button>
				</div>
			</div>

			{/* Preview text */}
			{checkpointInfo.previewText && (
				<div className="px-3 py-2 border-b border-void-border-3">
					<p className="text-xs text-void-fg-3 italic truncate">
						{checkpointInfo.previewText}
					</p>
				</div>
			)}

			{/* Actions */}
			<div className="p-1">
				<button
					onClick={onRevert}
					disabled={isDisabled}
					className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${isDisabled
							? 'text-void-fg-4 cursor-not-allowed'
							: 'text-void-fg-2 hover:bg-void-bg-4'
						}`}
				>
					<Undo2 className="w-4 h-4" />
					<span>Revert to</span>
					<span className="ml-auto text-void-fg-4">⌘</span>
				</button>
				<button
					onClick={onScrollTo}
					className="w-full flex items-center gap-2 px-3 py-2 text-sm text-void-fg-2 hover:bg-void-bg-4 rounded-md transition-colors"
				>
					<ArrowUp className="w-4 h-4" />
					<span>Scroll to</span>
					<span className="ml-auto text-void-fg-4">↑</span>
				</button>
			</div>
		</div>
	);
};

export const CheckpointTimeline: React.FC<CheckpointTimelineProps> = ({
	threadId,
	messages,
	scrollContainerRef,
	currCheckpointIdx
}) => {
	const accessor = useAccessor();
	const chatThreadService = accessor.get('IChatThreadService');
	const streamState = useFullChatThreadsStreamState();

	const isRunning = useChatThreadsStreamState(threadId)?.isRunning;
	const isDisabled = useMemo(() => {
		if (isRunning) return true;
		return !!Object.keys(streamState).find((threadId2) => streamState[threadId2]?.isRunning);
	}, [isRunning, streamState]);

	const [hoveredCheckpoint, setHoveredCheckpoint] = useState<CheckpointInfo | null>(null);
	const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [pendingRevert, setPendingRevert] = useState<CheckpointInfo | null>(null);
	const [isTimelineVisible, setIsTimelineVisible] = useState(false);

	const timelineRef = useRef<HTMLDivElement>(null);

	// Extract checkpoints from messages
	const checkpoints = useMemo((): CheckpointInfo[] => {
		const result: CheckpointInfo[] = [];
		messages.forEach((msg, idx) => {
			if (msg.role === 'checkpoint') {
				result.push({
					messageIdx: idx,
					checkpoint: msg,
					timestamp: new Date(), // TODO: Get actual timestamp from checkpoint
					previewText: getPreviewText(messages, idx)
				});
			}
		});
		return result;
	}, [messages]);

	// Handle mouse enter on checkpoint marker
	const handleCheckpointHover = useCallback((checkpoint: CheckpointInfo, event: React.MouseEvent) => {
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		setHoveredCheckpoint(checkpoint);
		setPopupPosition({
			top: rect.top + rect.height / 2,
			left: rect.right
		});
	}, []);

	// Handle revert action
	const handleRevert = useCallback(() => {
		if (hoveredCheckpoint && !isDisabled) {
			setPendingRevert(hoveredCheckpoint);
			setShowConfirmModal(true);
			setHoveredCheckpoint(null);
			setPopupPosition(null);
		}
	}, [hoveredCheckpoint, isDisabled]);

	// Confirm revert
	const confirmRevert = useCallback(() => {
		if (pendingRevert) {
			chatThreadService.jumpToCheckpointBeforeMessageIdx({
				threadId,
				messageIdx: pendingRevert.messageIdx,
				jumpToUserModified: pendingRevert.messageIdx === messages.length - 1
			});
		}
		setShowConfirmModal(false);
		setPendingRevert(null);
	}, [pendingRevert, chatThreadService, threadId, messages.length]);

	// Handle scroll to action
	const handleScrollTo = useCallback(() => {
		if (hoveredCheckpoint && scrollContainerRef.current) {
			// Find the message element and scroll to it
			const messageElements = scrollContainerRef.current.querySelectorAll('[data-message-idx]');
			const targetElement = Array.from(messageElements).find(
				el => el.getAttribute('data-message-idx') === String(hoveredCheckpoint.messageIdx)
			);
			if (targetElement) {
				targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
		setHoveredCheckpoint(null);
		setPopupPosition(null);
	}, [hoveredCheckpoint, scrollContainerRef]);

	// Close popup
	const closePopup = useCallback(() => {
		setHoveredCheckpoint(null);
		setPopupPosition(null);
	}, []);

	// Don't render if no checkpoints
	if (checkpoints.length === 0) return null;

	return (
		<>
			{/* Timeline container - appears on hover of the left edge */}
			<div
				ref={timelineRef}
				className={`absolute left-0 top-0 bottom-0 w-8 z-10 transition-opacity duration-200 ${isTimelineVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100'
					}`}
				onMouseEnter={() => setIsTimelineVisible(true)}
				onMouseLeave={() => {
					if (!hoveredCheckpoint) {
						setIsTimelineVisible(false);
					}
				}}
			>
				{/* Scrollable timeline track */}
				<div className="h-full flex flex-col items-center py-4 overflow-y-auto scrollbar-thin scrollbar-thumb-void-border-3 scrollbar-track-transparent">
					{/* Timeline line */}
					<div className="absolute left-1/2 top-4 bottom-4 w-px bg-void-border-3 -translate-x-1/2" />

					{/* Checkpoint markers */}
					{checkpoints.map((checkpoint, index) => {
						const isActive = currCheckpointIdx !== undefined && checkpoint.messageIdx <= currCheckpointIdx;
						const isCurrent = currCheckpointIdx === checkpoint.messageIdx;

						return (
							<div
								key={checkpoint.messageIdx}
								className="relative flex-shrink-0 my-2"
								style={{
									// Distribute markers evenly
									marginTop: index === 0 ? 'auto' : undefined,
									marginBottom: index === checkpoints.length - 1 ? 'auto' : undefined
								}}
							>
								{/* Checkpoint marker */}
								<div
									className={`w-3 h-0.5 rounded-full cursor-pointer transition-all duration-150 ${isCurrent
											? 'bg-void-accent w-4'
											: isActive
												? 'bg-void-fg-3 hover:bg-void-fg-2 hover:w-4'
												: 'bg-void-border-3 hover:bg-void-fg-4 hover:w-4'
										}`}
									onMouseEnter={(e) => handleCheckpointHover(checkpoint, e)}
								/>
							</div>
						);
					})}
				</div>
			</div>

			{/* Hover popup */}
			{hoveredCheckpoint && popupPosition && (
				<CheckpointPopup
					checkpointInfo={hoveredCheckpoint}
					position={popupPosition}
					onRevert={handleRevert}
					onScrollTo={handleScrollTo}
					onClose={closePopup}
					isDisabled={isDisabled}
				/>
			)}

			{/* Confirmation modal */}
			<RevertConfirmationModal
				isOpen={showConfirmModal}
				onConfirm={confirmRevert}
				onCancel={() => {
					setShowConfirmModal(false);
					setPendingRevert(null);
				}}
				checkpointInfo={pendingRevert}
			/>
		</>
	);
};

export default CheckpointTimeline;
