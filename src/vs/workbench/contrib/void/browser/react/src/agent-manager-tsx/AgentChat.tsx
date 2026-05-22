/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
						className="w-10 h-10 object-cover rounded-md border border-zinc-800"
					/>
					<button
						onClick={() => onRemove(i)}
						className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<X className="w-2.5 h-2.5 text-zinc-400" />
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
		<div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
			<Bot className="w-5 h-5 text-zinc-400" />
		</div>
		<h2 className="text-base font-semibold text-zinc-200 mb-1">{currentSessionName}</h2>
		<p className="text-sm text-zinc-500 text-center mb-6 max-w-sm">
			Ask questions about your code, request changes, or explore ideas.
		</p>

		<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-md">
			{SUGGESTED_PROMPTS.map((prompt, i) => (
				<button
					key={i}
					onClick={() => onPromptClick(prompt.label)}
					className="flex items-center gap-2.5 p-2.5 rounded-lg text-left text-xs
						bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-all"
				>
					{React.createElement(prompt.icon, { className: 'w-3.5 h-3.5 text-zinc-500 flex-shrink-0' })}
					<span className="truncate">{prompt.label}</span>
				</button>
			))}
		</div>

		<div className="mt-5 flex items-center gap-1.5 flex-wrap justify-center">
			{SLASH_COMMANDS.map(cmd => (
				<button
					key={cmd.command}
					onClick={() => onPromptClick(cmd.command + ' ')}
					className="text-[10px] px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
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

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages.length, displayContentSoFar, isRunning]);

	const handleSubmit = useCallback(async () => {
		const text = inputText.trim();
		if (!text && attachedImages.length === 0) return;
		if (isRunning) return;

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
	}, [inputText, attachedImages, isRunning, threadId, chatThreadsService]);

	const handleAbort = useCallback(async () => {
		await chatThreadsService.abortRunning(threadId);
	}, [threadId, chatThreadsService]);

	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;
			for (const item of items) {
				if (item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (!file) continue;
					const reader = new FileReader();
					reader.onload = () => {
						const base64 = (reader.result as string).split(',')[1];
						setAttachedImages(prev => [...prev, { base64, mimeType: file.type, name: file.name }]);
					};
					reader.readAsDataURL(file);
				}
			}
		};
		document.addEventListener('paste', onPaste);
		return () => document.removeEventListener('paste', onPaste);
	}, []);

	const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
	const onDragLeave = useCallback(() => setIsDragging(false), []);
	const onDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		for (const file of e.dataTransfer.files) {
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = () => {
					const base64 = (reader.result as string).split(',')[1];
					setAttachedImages(prev => [...prev, { base64, mimeType: file.type, name: file.name }]);
				};
				reader.readAsDataURL(file);
			}
		}
	}, []);

	const hasConversation = messages.some(m => m.role === 'user' || m.role === 'assistant');

	return (
		<div
			className="h-full flex flex-col bg-[#080808] relative"
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			{/* Drag overlay */}
			{isDragging && (
				<div className="absolute inset-0 z-50 bg-zinc-900/50 flex items-center justify-center pointer-events-none"
				>
					<div className="px-6 py-4 rounded-xl bg-[#0c0c0c] border border-dashed border-zinc-700 flex items-center gap-3"
					>
						<ImagePlus className="w-5 h-5 text-zinc-300" />
						<span className="text-sm font-medium text-zinc-200">Drop images to attach</span>
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
									key={`${idx}-${msg.role}`}
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
								<div className="mb-4 p-3 bg-red-500/[0.06] border border-red-500/10 rounded-lg text-sm text-red-400"
								>
									<ErrorDisplay error={error} onDismiss={() => chatThreadsService.dismissStreamError(threadId)} />
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
			<div className="flex-shrink-0 px-6 pb-5 pt-2 border-t border-zinc-800">
				<div className="max-w-2xl mx-auto relative">
					{showSlash && (
						<div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0c0c0c] border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-20"
						>
							{SLASH_COMMANDS.map((cmd, idx) => (
								<button
									key={cmd.command}
									onClick={() => {
										setInputText(cmd.command + ' ');
										setShowSlash(false);
										textareaRef.current?.focus();
									}}
									className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]
										${idx !== 0 ? 'border-t border-zinc-800' : ''}`}
								>
									{React.createElement(cmd.icon, { className: 'w-3.5 h-3.5 text-zinc-500 flex-shrink-0' })}
									<div className="min-w-0"
	>
										<span className="text-xs font-medium text-zinc-200">{cmd.command}</span>
										<span className="text-[10px] text-zinc-600 ml-2">{cmd.desc}</span>
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
							isInputFocused ? 'border-zinc-600 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]' : 'border-zinc-800'
						} bg-zinc-900`}
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
								onBlur={() => setTimeout(() => setIsInputFocused(false), 150)}
								placeholder="Ask anything, type / for commands..."
								rows={1}
								className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none px-4 pt-3 pb-8 max-h-[160px] min-h-[44px]"
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
										onChange={e => {
											const files = e.target.files;
											if (!files) return;
											for (const file of files) {
												const reader = new FileReader();
												reader.onload = () => {
													const base64 = (reader.result as string).split(',')[1];
													setAttachedImages(prev => [...prev, { base64, mimeType: file.type, name: file.name }]);
												};
												reader.readAsDataURL(file);
											}
											e.target.value = '';
										}}
									/>
									<label
										htmlFor="agent-chat-image-input"
										className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] cursor-pointer transition-colors"
										title="Attach image"
									>
										<ImagePlus className="w-3.5 h-3.5" />
									</label>

									<button
										onClick={() => { setShowSlash(true); textareaRef.current?.focus(); }}
										className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors"
										title="Commands"
									>
										<Slash className="w-3.5 h-3.5" />
									</button>
								</div>

								<div className="flex items-center gap-1">
									{isRunning ? (
										<button
											onClick={handleAbort}
											className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/15 text-xs font-medium transition-colors"
										>
											Stop
											<Loader2 className="w-3 h-3 animate-spin" />
										</button>
									) : (
										<button
											onClick={handleSubmit}
											disabled={!inputText.trim() && attachedImages.length === 0}
											className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-200 text-zinc-900 hover:bg-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
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
						<span className="text-[10px] text-zinc-600">Shift + Enter for new line</span>
						{error && <span className="text-[10px] text-red-400">Error occurred</span>}
					</div>
				</div>
			</div>
		</div>
	);
};
