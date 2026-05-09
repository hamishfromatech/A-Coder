/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	useAccessor,
	useChatThreadsState,
	useChatThreadsStreamState,
	useActiveStandaloneSession,
} from '../util/services.js';
import { ChatBubble } from '../sidebar-tsx/SidebarChat.js';
import { ErrorDisplay } from '../sidebar-tsx/ErrorDisplay.js';
import { TypingIndicator } from '../sidebar-tsx/ChatAnimations.js';
import {
	ChatMessage,
	ImageAttachment,
} from '../../../../common/chatThreadServiceTypes.js';
import {
	ArrowUp, ImagePlus, Loader2, Bot, Sparkles,
	Wand2, FileCode, Bug, Zap, X,
} from 'lucide-react';

// ------------------------------------------------------------------
//  Enterprise CSS Keyframes — injected as a style element
// ------------------------------------------------------------------
const StyleBlock = () => {
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		if (mounted) return;
		const css = `
			@keyframes breathe {
				0%, 100% { transform: scale(1); opacity: 0.6; }
				50% { transform: scale(1.4); opacity: 1; }
			}
			@keyframes fadeInUp {
				from { opacity: 0; transform: translateY(12px) scale(0.98); }
				to { opacity: 1; transform: translateY(0) scale(1); }
			}
			@keyframes float {
				0%, 100% { transform: translateY(0px); }
				50% { transform: translateY(-6px); }
			}
			@keyframes grain {
				0%, 100% { transform: translate(0, 0); }
				10% { transform: translate(-5%, -10%); }
				20% { transform: translate(-15%, 5%); }
				30% { transform: translate(7%, -25%); }
				40% { transform: translate(-5%, 25%); }
				50% { transform: translate(-15%, 10%); }
				60% { transform: translate(15%, 0%); }
				70% { transform: translate(0%, 15%); }
				80% { transform: translate(3%, 35%); }
				90% { transform: translate(-10%, 10%); }
			}
		`;
		const style = document.createElement('style');
		style.textContent = css;
		document.head.appendChild(style);
		setMounted(true);
		return () => { document.head.removeChild(style); };
	}, [mounted]);
	return null;
};

const SPRING_TRANSITION = 'all 0.5s cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_FAST = 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)';

const SUGGESTED_PROMPTS = [
	{ label: "Explain this code", icon: FileCode },
	{ label: "Find bugs and fix them", icon: Bug },
	{ label: "Write unit tests", icon: Zap },
	{ label: "Refactor for clarity", icon: Wand2 },
];

// ------------------------------------------------------------------
//  Inline image thumbnails with liquid-glass remove button
// ------------------------------------------------------------------
const ImagePreview = ({ images, onRemove }: { images: ImageAttachment[]; onRemove: (i: number) => void }) => {
	if (!images.length) return null;
	return (
		<div className="flex flex-wrap gap-2 mb-3">
			{images.map((img, i) => (
				<div key={i} className="relative group">
					<div className="p-[2px] rounded-xl bg-white/[0.04] ring-1 ring-white/[0.04] transition-all duration-300 group-hover:ring-white/[0.08] group-hover:bg-white/[0.06]">
						<div className="rounded-[calc(0.75rem-2px)] overflow-hidden">
							<img
								src={`data:${img.mimeType};base64,${img.base64}`}
								alt={img.name || `Attached image ${i + 1}`}
								className="w-16 h-16 object-cover"
							/>
						</div>
					</div>
					<button
						onClick={() => onRemove(i)}
						className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full backdrop-blur-md bg-void-bg-1/80 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 hover:bg-red-500/20 hover:border-red-400/30"
					>
						<X className="w-3 h-3 text-void-fg-3" strokeWidth={2} />
					</button>
				</div>
			))}
		</div>
	);
};

// ------------------------------------------------------------------
//  Premium empty state
// ------------------------------------------------------------------
const EmptyState = React.memo(({ onPromptClick, currentSessionName }: { onPromptClick: (p: string) => void; currentSessionName: string }) => {
	return (
		<div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 relative overflow-hidden">
			{/* Ambient mesh gradient orbs */}
			<div className="absolute inset-0 pointer-events-none overflow-hidden">
				<div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-void-accent/5 blur-[100px]" style={{ animation: 'float 8s ease-in-out infinite' }} />
				<div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-emerald-500/[0.03] blur-[80px]" style={{ animation: 'float 10s ease-in-out infinite 2s' }} />
			</div>

			{/* Floating icon */}
			<div className="relative mb-8" style={{ animation: 'float 6s ease-in-out infinite' }}>
				<div className="p-[3px] rounded-[calc(1.5rem+3px)] bg-white/[0.04] ring-1 ring-white/[0.06]">
					<div className="w-16 h-16 rounded-[1.5rem] bg-void-bg-1 border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_8px_32px_-8px_rgba(0,0,0,0.4)] flex items-center justify-center">
						<Bot className="w-8 h-8 text-void-accent" strokeWidth={1.5} />
					</div>
				</div>
				<div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
					<div className="w-2 h-2 rounded-full bg-emerald-500" style={{ animation: 'breathe 2s ease-in-out infinite' }} />
				</div>
			</div>

			{/* Eyebrow tag */}
			<div className="mb-3 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[10px] uppercase tracking-[0.15em] text-void-fg-4 font-medium">
				AI Assistant
			</div>

			<h2 className="text-2xl font-semibold text-void-fg-1 mb-2 tracking-tight">{currentSessionName}</h2>
			<p className="text-sm text-void-fg-3 text-center max-w-sm mb-8 leading-relaxed">
				Ask questions about your code, request changes, or explore ideas. I will work through each step with you.
			</p>

			{/* Prompt cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
				{SUGGESTED_PROMPTS.map((prompt, i) => {
					const Icon = prompt.icon;
					return (
						<button
							key={i}
							onClick={() => onPromptClick(prompt.label)}
							className="group relative flex items-center gap-3 p-3.5 rounded-xl text-left transition-all duration-300 active:scale-[0.98]"
							style={{
								backgroundColor: 'rgba(255,255,255,0.02)',
								border: '1px solid rgba(255,255,255,0.04)',
								transition: SPRING_TRANSITION,
							}}
							onMouseEnter={e => {
								const t = e.currentTarget as HTMLButtonElement;
								t.style.backgroundColor = 'rgba(255,255,255,0.05)';
								t.style.borderColor = 'rgba(255,255,255,0.08)';
								t.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.04), 0 8px 24px -8px rgba(0,0,0,0.3)';
							}}
							onMouseLeave={e => {
								const t = e.currentTarget as HTMLButtonElement;
								t.style.backgroundColor = 'rgba(255,255,255,0.02)';
								t.style.borderColor = 'rgba(255,255,255,0.04)';
								t.style.boxShadow = 'none';
							}}
						>
							<div className="flex-shrink-0 p-[2px] rounded-lg bg-white/[0.04] ring-1 ring-white/[0.04] group-hover:ring-white/[0.08] transition-all duration-300">
								<div className="w-7 h-7 rounded-md bg-void-accent/10 flex items-center justify-center">
									<Icon className="w-3.5 h-3.5 text-void-accent" strokeWidth={1.5} />
								</div>
							</div>
							<span className="text-sm text-void-fg-2 group-hover:text-void-fg-1 transition-colors duration-200">{prompt.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
});
EmptyState.displayName = 'EmptyState';

// ------------------------------------------------------------------
//  Grain overlay
// ------------------------------------------------------------------
const GrainOverlay = () => (
	<div
		className="fixed inset-0 pointer-events-none z-[100] opacity-[0.025]"
		style={{
			backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
			backgroundRepeat: 'repeat',
			backgroundSize: '256px 256px',
			animation: 'grain 0.5s steps(10) infinite',
		}}
	/>
);

// ------------------------------------------------------------------
//  Main AgentChat component — reuses SidebarChat's ChatBubble for
//  all message types (user, assistant, tool, checkpoint, etc.)
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
	const { displayContentSoFar, reasoningSoFar, toolCallsSoFar, reactPhase } = streamState?.llmInfo ?? {};

	const [inputText, setInputText] = useState('');
	const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [isInputFocused, setIsInputFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	// Auto-scroll
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

	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);
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

	// ------------------------------------------------------------------
	//  Message list using SidebarChat's proven ChatBubble component
	//  This handles ALL roles: user, assistant, tool, interrupted_streaming_tool, checkpoint
	// ------------------------------------------------------------------
	const MessageList = () => {
		const isAnyToolActivity = !!(toolCallsSoFar && toolCallsSoFar.length > 0 && toolCallsSoFar[0].name);
		const isReActActionPhase = reactPhase?.type === 'action';

		return (
			<div className="flex flex-col">
				{/* Previous messages */}
				{messages.map((msg, idx) => (
					<div
						key={`msg-${idx}-${msg.role}`}
						style={{ animation: 'fadeInUp 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards' }}
					>
						<ChatBubble
							chatMessage={msg}
							messageIdx={idx}
							isCommitted={true}
							chatIsRunning={isRunning}
							threadId={threadId}
							currCheckpointIdx={undefined}
							_scrollToBottom={null}
						/>
					</div>
				))}

				{/* Streaming assistant bubble */}
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

				{/* Tool loading indicator */}
				{(isRunning === 'tool' || isAnyToolActivity || isReActActionPhase) && (
					<div className="flex items-start gap-3 mb-5 max-w-[90%]" style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}>
						<div className="flex-shrink-0 p-[2px] rounded-full bg-white/[0.04] ring-1 ring-white/[0.04]">
							<div className="w-7 h-7 rounded-full bg-void-bg-1 border border-white/[0.06] flex items-center justify-center">
								<Sparkles className="w-3.5 h-3.5 text-void-accent" strokeWidth={1.5} style={{ animation: 'breathe 2s ease-in-out infinite' }} />
							</div>
						</div>
						<div className="flex-1 min-w-0">
							<div className="p-[2px] rounded-[calc(1.25rem+2px)] rounded-tl-[calc(0.5rem+2px)] bg-white/[0.03] ring-1 ring-white/[0.04]">
								<div className="rounded-[1.25rem] rounded-tl-[0.5rem] bg-void-bg-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] px-5 py-4">
									<div className="flex items-center gap-2 text-sm text-void-fg-3">
										<div className="w-2 h-2 rounded-full bg-void-accent" style={{ animation: 'breathe 1.5s ease-in-out infinite' }} />
										<span className="font-medium">{toolCallsSoFar?.[0]?.name || 'Working'}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="mb-6 p-4 bg-red-500/[0.08] border border-red-500/15 rounded-xl text-sm text-red-400" style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}>
						<ErrorDisplay error={error} onDismiss={() => chatThreadsService.dismissStreamError(threadId)} />
					</div>
				)}

				<div ref={bottomRef} />
			</div>
		);
	};

	return (
		<div
			className="h-full flex flex-col bg-void-bg-3 relative"
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<StyleBlock />
			<GrainOverlay />

			{isDragging && (
				<div className="absolute inset-0 z-50 backdrop-blur-sm bg-void-accent/5 flex items-center justify-center pointer-events-none">
					<div className="p-[3px] rounded-[calc(1.5rem+3px)] bg-white/[0.06] ring-1 ring-white/[0.08]">
						<div className="px-8 py-5 rounded-[1.5rem] bg-void-bg-1/80 border border-white/[0.06] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)] flex items-center gap-3">
							<ImagePlus className="w-5 h-5 text-void-accent" strokeWidth={1.5} />
							<span className="text-void-fg-1 font-medium">Drop images to attach</span>
						</div>
					</div>
				</div>
			)}

			{/* Scrollable message area */}
			<div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 scroll-smooth">
				<div className="max-w-3xl mx-auto">
					{hasConversation ? (
						<MessageList />
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

			{/* Input area — liquid glass floating bar */}
			<div className="flex-shrink-0 px-4 sm:px-8 pb-5 pt-3">
				<div className="max-w-3xl mx-auto">
					{attachedImages.length > 0 && (
						<div className="mb-2">
							<ImagePreview
								images={attachedImages}
								onRemove={i => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
							/>
						</div>
					)}

					<div
						className="p-[2px] rounded-[calc(1.25rem+2px)] transition-all duration-500"
						style={{
							backgroundColor: isInputFocused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
							boxShadow: isInputFocused
								? '0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px -8px rgba(0,0,0,0.4)'
								: '0 0 0 1px rgba(255,255,255,0.04)',
							transition: SPRING_TRANSITION,
						}}
					>
						<div className="rounded-[1.25rem] bg-void-bg-1/80 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] px-4 pt-3 pb-11 relative">
							<textarea
								ref={textareaRef}
								value={inputText}
								onChange={e => setInputText(e.target.value)}
								onKeyDown={e => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										handleSubmit();
									}
								}}
								onFocus={() => setIsInputFocused(true)}
								onBlur={() => setIsInputFocused(false)}
								placeholder="Ask anything..."
								rows={1}
								className="w-full bg-transparent text-sm text-void-fg-1 placeholder:text-void-fg-4 resize-none outline-none max-h-[200px] min-h-[44px]"
								style={{ overflowY: 'auto' }}
							/>

							<div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
								<div className="flex items-center gap-1">
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
										className="p-2 rounded-lg hover:bg-white/[0.04] text-void-fg-4 hover:text-void-fg-2 cursor-pointer transition-all duration-200 active:scale-[0.95]"
										title="Attach image"
									>
										<ImagePlus className="w-4 h-4" strokeWidth={1.5} />
									</label>
								</div>

								<div className="flex items-center gap-2">
									{isRunning ? (
										<button
											onClick={handleAbort}
											className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/15 hover:border-red-500/25 transition-all duration-200 active:scale-[0.97]"
											title="Stop generating"
										>
											<span className="text-xs font-medium">Stop</span>
											<div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center">
												<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
											</div>
										</button>
									) : (
										<button
											onClick={handleSubmit}
											disabled={!inputText.trim() && attachedImages.length === 0}
											className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-void-accent text-white hover:bg-void-accent-hover disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.97] shadow-[0_0_16px_-4px_rgba(79,142,247,0.3)]"
											title="Send message"
										>
											<span className="text-xs font-medium">Send</span>
											<div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
												<ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} />
											</div>
										</button>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="flex items-center justify-between mt-2 px-1">
						<span className="text-[10px] text-void-fg-4 tracking-wide">Shift + Enter for new line</span>
						{error && <span className="text-[10px] text-red-400">Error occurred</span>}
					</div>
				</div>
			</div>
		</div>
	);
};
