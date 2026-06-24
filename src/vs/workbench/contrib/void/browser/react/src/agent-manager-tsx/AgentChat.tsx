/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { voidDevWarn } from '../../../../common/devLog.js';
import {
	useAccessor,
	useChatThreadsState,
	useChatThreadsStreamState,
	useActiveStandaloneSession,
} from '../util/services.js';
import { ChatBubble } from '../sidebar-tsx/SidebarChat.js';
import { ErrorDisplay } from '../sidebar-tsx/ErrorDisplay.js';
import {
	ChatMessage,
	ImageAttachment,
} from '../../../../common/chatThreadServiceTypes.js';
import {
	ArrowUp, ImagePlus, Loader2, Bot,
	FileCode, Bug, Zap, X, Slash, Calendar, Target, Globe
} from 'lucide-react';
import '../styles.css';

// ------------------------------------------------------------------
//  Suggested prompts
// ------------------------------------------------------------------
const SUGGESTED_PROMPTS = [
	{ label: 'Explain this code', icon: FileCode },
	{ label: 'Find bugs', icon: Bug },
	{ label: 'Write tests', icon: Zap },
];

// ------------------------------------------------------------------
//  Slash commands
// ------------------------------------------------------------------
const SLASH_COMMANDS = [
	{ command: '/goal', desc: 'Run until complete', icon: Target },
	{ command: '/schedule', desc: 'Set a timer', icon: Calendar },
	{ command: '/grill-me', desc: 'Ask clarifying questions', icon: Bot },
	{ command: '/browser', desc: 'Use browser tools', icon: Globe },
];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGES = 10;
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

const fileToBase64 = (file: File): Promise<ImageAttachment> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const base64 = result.split(',')[1];
			resolve({ base64, mimeType: file.type, name: file.name });
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
};

const isValidImageFile = (file: File, currentCount: number): boolean => {
	if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) return false;
	if (file.size > MAX_IMAGE_SIZE) {
		voidDevWarn(`Image ${file.name} exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
		return false;
	}
	if (currentCount >= MAX_IMAGES) {
		voidDevWarn(`Maximum ${MAX_IMAGES} images allowed`);
		return false;
	}
	return true;
};

const processImageFiles = async (files: FileList | File[], currentImages: ImageAttachment[]): Promise<ImageAttachment[]> => {
	const fileArray = Array.from(files);
	const imageFiles = fileArray.filter(file => SUPPORTED_IMAGE_TYPES.includes(file.type));
	if (imageFiles.length === 0) return [];

	const availableSlots = MAX_IMAGES - currentImages.length;
	if (availableSlots <= 0) {
		voidDevWarn(`Maximum ${MAX_IMAGES} images allowed`);
		return [];
	}

	const oversized = imageFiles.filter(file => file.size > MAX_IMAGE_SIZE);
	if (oversized.length > 0) {
		voidDevWarn(`Some images exceed ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
	}

	const validFiles = imageFiles
		.filter(file => file.size <= MAX_IMAGE_SIZE)
		.slice(0, availableSlots);

	try {
		return await Promise.all(validFiles.map(fileToBase64));
	} catch (error) {
		console.error('Failed to process images:', error);
		return [];
	}
};

// ------------------------------------------------------------------
//  Image preview
// ------------------------------------------------------------------
const ImagePreview = ({ images, onRemove }: { images: ImageAttachment[]; onRemove: (i: number) => void }) => {
	if (!images.length) return null;
	return (
		<div className="flex flex-wrap gap-2 mb-2">
			{images.map((img, i) => (
				<div key={i} className="relative group">
					<img
						src={`data:${img.mimeType};base64,${img.base64}`}
						alt={img.name || `Image ${i + 1}`}
						className="w-10 h-10 object-cover rounded-md border border-void-border-2"
					/>
					<button
						onClick={() => onRemove(i)}
						className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-void-bg-2 border border-void-border-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<X className="w-2.5 h-2.5 text-void-fg-3" />
					</button>
				</div>
			))}
		</div>
	);
};

// ------------------------------------------------------------------
//  Empty state
// ------------------------------------------------------------------
const EmptyState = ({
	onPromptClick,
	currentSessionName,
}: {
	onPromptClick: (p: string) => void;
	currentSessionName: string;
}) => (
	<div className="flex flex-col items-center justify-center h-full px-6">
		<div className="w-10 h-10 rounded-lg bg-void-bg-2 border border-void-border-2 flex items-center justify-center mb-5">
			<Bot className="w-5 h-5 text-void-fg-3" />
		</div>
		<h2 className="text-base font-semibold text-void-fg-1 mb-1">{currentSessionName}</h2>
		<p className="text-sm text-void-fg-4 text-center mb-6 max-w-sm">
			Ask questions about your code, request changes, or explore ideas.
		</p>

		<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-md">
			{SUGGESTED_PROMPTS.map((prompt, i) => (
				<button
					key={i}
					onClick={() => onPromptClick(prompt.label)}
					className="flex items-center gap-2.5 p-2.5 rounded-lg text-left text-xs
						bg-void-bg-2 border border-void-border-2 hover:border-void-border-1 hover:bg-void-bg-3 text-void-fg-2 transition-all interactive"
				>
					{React.createElement(prompt.icon, { className: 'w-3.5 h-3.5 text-void-fg-4 flex-shrink-0' })}
					<span className="truncate">{prompt.label}</span>
				</button>
			))}
		</div>

		<div className="mt-5 flex items-center gap-1.5 flex-wrap justify-center">
			{SLASH_COMMANDS.map(cmd => (
				<button
					key={cmd.command}
					onClick={() => onPromptClick(cmd.command + ' ')}
					className="text-[10px] px-2 py-1 rounded-md bg-void-bg-2 border border-void-border-2 text-void-fg-4 hover:text-void-fg-2 hover:border-void-border-1 transition-colors"
				>
					{cmd.command}
				</button>
			))}
		</div>
	</div>
);

// ------------------------------------------------------------------
//  Main AgentChat
// ------------------------------------------------------------------
export const AgentChat = () => {
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');
	const { activeSession } = useActiveStandaloneSession();

	const threadState = useChatThreadsState();
	const threadId = threadState.currentThreadId;
	const currentThread = threadState.allThreads[threadId];
	const messages = currentThread?.messages ?? [];

	const streamState = useChatThreadsStreamState(threadId);
	const isRunning = streamState?.isRunning;
	const error = streamState?.error;
	const { displayContentSoFar, reasoningSoFar, toolCallsSoFar } = streamState?.llmInfo ?? {};

	const [inputText, setInputText] = useState('');
	const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [isInputFocused, setIsInputFocused] = useState(false);
	const [showSlash, setShowSlash] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Auto-resize textarea as content grows
	const autoResize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		const newHeight = Math.min(Math.max(el.scrollHeight, 44), 160);
		el.style.height = `${newHeight}px`;
	}, []);

	useEffect(() => {
		autoResize();
	}, [inputText, autoResize]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages.length, displayContentSoFar, isRunning]);

	const handleSubmit = useCallback(async () => {
		const text = inputText.trim();
		if (!text && attachedImages.length === 0) return;
		if (isRunning) return;
		if (!currentThread) {
			voidDevWarn('No active thread to send message to');
			return;
		}

		setInputText('');
		const images = attachedImages.length ? attachedImages : undefined;
		setAttachedImages([]);

		try {
			await chatThreadsService.addUserMessageAndStreamResponse({
				userMessage: text,
				threadId,
				images,
			});
		} catch (e) {
			console.error('Send failed:', e);
		}
	}, [inputText, attachedImages, isRunning, threadId, chatThreadsService, currentThread]);

	const handleAbort = useCallback(async () => {
		await chatThreadsService.abortRunning(threadId);
	}, [threadId, chatThreadsService]);

	useEffect(() => {
		const onPaste = async (e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;
			const imageItems: File[] = [];
			for (const item of items) {
				if (item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (file && isValidImageFile(file, attachedImages.length + imageItems.length)) {
						imageItems.push(file);
					}
				}
			}
			if (imageItems.length === 0) return;
			e.preventDefault();
			const newImages = await processImageFiles(imageItems, attachedImages);
			setAttachedImages(prev => [...prev, ...newImages]);
		};
		const textarea = textareaRef.current;
		textarea?.addEventListener('paste', onPaste);
		return () => {
			textarea?.removeEventListener('paste', onPaste);
			if (blurTimeoutRef.current) {
				clearTimeout(blurTimeoutRef.current);
			}
		};
	}, [attachedImages]);

	const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
	const onDragLeave = useCallback(() => setIsDragging(false), []);
	const onDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		const newImages = await processImageFiles(e.dataTransfer.files, attachedImages);
		if (newImages.length > 0) {
			setAttachedImages(prev => [...prev, ...newImages]);
		}
	}, [attachedImages]);

	const hasConversation = messages.some(m => m.role === 'user' || m.role === 'assistant');

	return (
		<div
			className="h-full flex flex-col bg-void-bg-4 relative"
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			{/* Drag overlay */}
			{isDragging && (
				<div className="absolute inset-0 z-50 bg-void-bg-2/50 flex items-center justify-center pointer-events-none"
				>
					<div className="px-6 py-4 rounded-xl bg-void-depth-elevated border border-dashed border-void-border-1 flex items-center gap-3"
					>
						<ImagePlus className="w-5 h-5 text-void-fg-2" />
						<span className="text-sm font-medium text-void-fg-1">Drop images to attach</span>
					</div>
				</div>
			)}

			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-6 py-8">
				<div className="max-w-2xl mx-auto">
					{hasConversation ? (
						<div className="flex flex-col">
							{messages.map((msg, idx) => (
								<ChatBubble
									key={msg._timestamp ? `${msg._timestamp}-${idx}` : `${idx}-${msg.role}`}
									chatMessage={msg}
									messageIdx={idx}
									isCommitted={true}
									chatIsRunning={isRunning}
									threadId={threadId}
									currCheckpointIdx={undefined}
									_scrollToBottom={null}
								/>
							))}
							{(isRunning === 'LLM' || isRunning === 'idle') && displayContentSoFar !== undefined && (
								<ChatBubble
									chatMessage={{
										role: 'assistant',
										displayContent: displayContentSoFar ?? '',
										reasoning: reasoningSoFar ?? '',
										anthropicReasoning: null,
									} as ChatMessage}
									messageIdx={messages.length}
									isCommitted={false}
									chatIsRunning={isRunning}
									threadId={threadId}
									currCheckpointIdx={undefined}
									_scrollToBottom={null}
								/>
							)}
							{error && (
								<div className="mb-4 p-3 bg-void-error/5 border border-void-error/10 rounded-lg text-sm text-void-error"
								>
									<ErrorDisplay
										message={error.message}
										fullError={error.fullError}
										onDismiss={() => chatThreadsService.dismissStreamError(threadId)}
										showDismiss
									/>
								</div>
							)}
							<div ref={bottomRef} />
						</div>
					) : (
						<EmptyState
							currentSessionName={activeSession?.name || 'New Chat'}
							onPromptClick={prompt => {
								setInputText(prompt);
								textareaRef.current?.focus();
							}}
						/>
					)}
				</div>
			</div>

			{/* Input */}
			<div className="flex-shrink-0 px-6 pb-5 pt-2 border-t border-void-border-2">
				<div className="max-w-2xl mx-auto relative">
					{showSlash && (
						<div className="absolute bottom-full left-0 right-0 mb-2 bg-void-depth-floating border border-void-border-2 rounded-lg shadow-xl overflow-hidden z-20"
						>
							{SLASH_COMMANDS.map((cmd, idx) => (
								<button
									key={cmd.command}
									onClick={() => {
										setInputText(cmd.command + ' ');
										setShowSlash(false);
										textareaRef.current?.focus();
									}}
									className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-void-bg-3
										${idx !== 0 ? 'border-t border-void-border-2' : ''}`}
								>
									{React.createElement(cmd.icon, { className: 'w-3.5 h-3.5 text-void-fg-4 flex-shrink-0' })}
									<div className="min-w-0"
	>
										<span className="text-xs font-medium text-void-fg-1">{cmd.command}</span>
										<span className="text-[10px] text-void-fg-4 ml-2">{cmd.desc}</span>
									</div>
								</button>
							))}
						</div>
					)}

					{attachedImages.length > 0 && (
						<ImagePreview
							images={attachedImages}
							onRemove={i => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
						/>
					)}

					<div className="relative"
>
						<div className={`border rounded-xl transition-all duration-150 ${
							isInputFocused ? 'border-void-border-1 shadow-void-glow-subtle' : 'border-void-border-2'
						} bg-void-bg-2`}
						>
							<textarea
								ref={textareaRef}
								value={inputText}
								onChange={e => {
									setInputText(e.target.value);
									if (e.target.value === '/') setShowSlash(true);
									if (!e.target.value.startsWith('/')) setShowSlash(false);
								}}
								onKeyDown={e => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										handleSubmit();
									}
								}}
								onFocus={() => setIsInputFocused(true)}
								onBlur={() => {
									blurTimeoutRef.current = setTimeout(() => setIsInputFocused(false), 150);
								}}
								placeholder="Ask anything, type / for commands..."
								rows={1}
								className="w-full bg-transparent text-sm text-void-fg-1 placeholder:text-void-fg-3 resize-none outline-none px-4 pt-3 pb-8 max-h-[160px] min-h-[44px]"
								style={{ overflowY: 'auto' }}
							/>

							<div className="absolute bottom-2 left-3 right-3 flex items-center justify-between"
>
								<div className="flex items-center gap-0.5"
>
									<input
										type="file"
										accept="image/*"
										multiple
										className="hidden"
										id="agent-chat-image-input"
										onChange={async e => {
											const files = e.target.files;
											if (!files) return;
											const newImages = await processImageFiles(files, attachedImages);
											if (newImages.length > 0) {
												setAttachedImages(prev => [...prev, ...newImages]);
											}
											e.target.value = '';
										}}
									/>
									<label
										htmlFor="agent-chat-image-input"
										className="p-1.5 rounded text-void-fg-4 hover:text-void-fg-2 hover:bg-void-bg-3 cursor-pointer transition-colors"
										title="Attach image"
									>
										<ImagePlus className="w-3.5 h-3.5" />
									</label>

									<button
										onClick={() => { setShowSlash(true); textareaRef.current?.focus(); }}
										className="p-1.5 rounded text-void-fg-4 hover:text-void-fg-2 hover:bg-void-bg-3 transition-colors"
										title="Commands"
									>
										<Slash className="w-3.5 h-3.5" />
									</button>
								</div>

								<div className="flex items-center gap-1">
									{isRunning ? (
										<button
											onClick={handleAbort}
											className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-void-error/10 text-void-error hover:bg-void-error/15 text-xs font-medium transition-colors"
										>
											Stop
											<Loader2 className="w-3 h-3 animate-spin" />
										</button>
									) : (
										<button
											onClick={handleSubmit}
											disabled={(!inputText.trim() && attachedImages.length === 0) || !currentThread}
											className="flex items-center justify-center w-7 h-7 rounded-lg bg-void-fg-2 text-void-bg-4 hover:bg-void-fg-1 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
										>
											<ArrowUp className="w-3.5 h-3.5" />
										</button>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="flex items-center justify-between mt-1.5 px-1"
>
						<span className="text-[10px] text-void-fg-4">Shift + Enter for new line</span>
						{error && <span className="text-[10px] text-void-error">Error occurred</span>}
					</div>
				</div>
			</div>
		</div>
	);
};
