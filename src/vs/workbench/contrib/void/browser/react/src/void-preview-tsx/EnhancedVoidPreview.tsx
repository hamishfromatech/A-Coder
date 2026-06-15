/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Code, Eye, X, Check, BookOpen, AlertCircle, MessageSquare, Plus, Trash2, Send, CornerDownRight } from 'lucide-react';
import '../styles.css';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { useAccessor, useIsDark } from '../util/services.js';
import { registerPreviewTab } from '../sidebar-tsx/WalkthroughResultWrapper.js';

// Re-export original types
export type { VoidPreviewProps } from './VoidPreview.js';

export interface EnhancedVoidPreviewProps {
	title: string;
	content: string;
	isImplementationPlan?: boolean;
	isWalkthrough?: boolean;
	planId?: string;
	threadId?: string;
}

interface PlanComment {
	id: string;
	sectionText: string;
	comment: string;
	timestamp: number;
}

// Loading spinner component (shared)
const LoadingSpinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
	<svg
		className={`animate-spin ${className}`}
		fill="none"
		viewBox="0 0 24 24"
		aria-label="Loading"
	>
		<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
		<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
	</svg>
);

/**
 * EnhancedVoidPreview - For walkthroughs and implementation plans
 */
export const EnhancedVoidPreview: React.FC<EnhancedVoidPreviewProps> = ({
	title,
	content,
	isImplementationPlan,
	isWalkthrough,
	planId,
	threadId,
}) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');
	const voidSettingsService = accessor.get('IVoidSettingsService');

	// Content state
	const [localContent, setLocalContent] = useState(content);

	// Feedback state
	const [comments, setComments] = useState<PlanComment[]>([]);
	const [activeCommentSection, setActiveCommentSection] = useState<{ text: string; rect: DOMRect } | null>(null);
	const [newCommentText, setNewCommentText] = useState('');

	// Action button states
	const [isApproving, setIsApproving] = useState(false);
	const [isRequestingChanges, setIsRequestingChanges] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const contentRef = useRef<HTMLDivElement>(null);

	// Update local content when props change
	useEffect(() => {
		setLocalContent(content);
	}, [content]);

	// Register preview tab for auto-refresh
	useEffect(() => {
		if (!isWalkthrough || !planId || !threadId) return;
		const refreshFn = (filePath: string, newPreview: string) => {
			if (filePath === planId) setLocalContent(newPreview);
		};
		const cleanup = registerPreviewTab(planId, threadId, refreshFn);
		return () => cleanup();
	}, [isWalkthrough, planId, threadId]);

	// Auto-clear errors
	useEffect(() => {
		if (error) {
			const timeout = setTimeout(() => setError(null), 5000);
			return () => clearTimeout(timeout);
		}
	}, [error]);

	// ============================================
	// Comment Handlers
	// ============================================

	const handleContentClick = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		// Find the closest meaningful block (p, h1-6, li, pre, blockquote)
		const block = target.closest('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote');

		if (block && contentRef.current?.contains(block)) {
			const text = block.textContent?.trim() || '';
			if (text) {
				setActiveCommentSection({
					text,
					rect: block.getBoundingClientRect()
				});
				setNewCommentText('');
			}
		}
	}, []);

	const addComment = useCallback(() => {
		if (!activeCommentSection || !newCommentText.trim()) return;

		const newComment: PlanComment = {
			id: Math.random().toString(36).substring(7),
			sectionText: activeCommentSection.text,
			comment: newCommentText.trim(),
			timestamp: Date.now()
		};

		setComments(prev => [...prev, newComment]);
		setActiveCommentSection(null);
		setNewCommentText('');
	}, [activeCommentSection, newCommentText]);

	// ============================================
	// Action Handlers
	// ============================================

	const handleApprove = useCallback(async () => {
		if (!planId || !threadId || isApproving) return;
		setIsApproving(true);
		setError(null);

		try {
			voidSettingsService?.setGlobalSetting?.('chatMode', 'code');
			const message = isImplementationPlan
				? `The implementation plan (ID: ${planId}) has been approved for execution.\n\nBegin execution now.`
				: `The walkthrough (File: ${planId}) has been approved. Proceed.`;

			await chatThreadsService.addUserMessageAndStreamResponse({ threadId, userMessage: message });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send approval');
		} finally {
			setIsApproving(false);
		}
	}, [planId, threadId, isApproving, isImplementationPlan, voidSettingsService, chatThreadsService]);

	const handleRequestChanges = useCallback(async () => {
		if (!planId || !threadId || isRequestingChanges) return;
		setIsRequestingChanges(true);
		setError(null);

		try {
			await voidSettingsService?.setGlobalSetting?.('chatMode', 'plan');

			let commentString = '';
			if (comments.length > 0) {
				commentString = '\n\n**Specific Feedback:**\n' + comments.map(c => `> Section: "${c.sectionText}"\n> **Correction:** ${c.comment}`).join('\n\n');
			}

			const message = isImplementationPlan
				? `I request changes to the implementation plan (ID: ${planId}).\n\nRevise the plan based on my feedback below.${commentString}\n\nPlease update the plan now.`
				: `I request changes to the walkthrough (File: ${planId}).\n\nMy requested changes:${commentString}`;

			await chatThreadsService.addUserMessageAndStreamResponse({ threadId, userMessage: message });
			setComments([]); // Clear comments after sending
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to request changes');
		} finally {
			setIsRequestingChanges(false);
		}
	}, [planId, threadId, isRequestingChanges, isImplementationPlan, comments, voidSettingsService, chatThreadsService]);

	const handleReject = useCallback(async () => {
		if (!planId || !threadId || isRejecting) return;
		setIsRejecting(true);
		try {
			const message = `I reject the ${isImplementationPlan ? 'plan' : 'walkthrough'} (ID: ${planId}). Stop.`;
			await chatThreadsService.addUserMessageAndStreamResponse({ threadId, userMessage: message });
		} catch (err) {
			setError('Failed to reject');
		} finally {
			setIsRejecting(false);
		}
	}, [planId, threadId, isRejecting, isImplementationPlan, chatThreadsService]);

	const showActions = (isImplementationPlan || isWalkthrough) && planId && threadId;
	const ContentIcon = isImplementationPlan ? Code : isWalkthrough ? Eye : BookOpen;

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="h-full flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans relative">

				{/* Header */}
				<header className="flex-shrink-0 flex items-center justify-between border-b border-void-border-2 bg-void-bg-2 px-4 py-3 z-30 shadow-sm">
					<div className="flex items-center gap-3 min-w-0">
						<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-void-accent/10 flex items-center justify-center border border-void-accent/20">
							<ContentIcon size={18} className="text-void-accent" aria-hidden="true" />
						</div>
						<div className="flex flex-col gap-0.5 min-w-0">
							<h1 className="text-sm font-bold text-void-fg-1 truncate">{title}</h1>
							{planId && <span className="text-[10px] text-void-fg-4 font-mono opacity-60 truncate">ID: {planId}</span>}
						</div>
					</div>
					{comments.length > 0 && (
						<div className="flex items-center gap-2 px-3 py-1 bg-void-accent/10 text-void-accent rounded-full border border-void-accent/20 animate-pulse">
							<MessageSquare size={12} />
							<span className="text-[10px] font-bold uppercase tracking-wider">{comments.length} Pending Changes</span>
						</div>
					)}
				</header>

				{/* Content and Sidebar */}
				<div className="flex-1 overflow-hidden flex relative">

					{/* Main Content */}
					<main className="flex-1 overflow-y-auto custom-scrollbar group/content" onClick={handleContentClick}>
						<article className="max-w-4xl mx-auto px-6 py-12">
							<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl shadow-lg overflow-hidden" ref={contentRef}>
								<div className="h-1.5 w-full bg-void-accent/30" />
								<div className="p-8 md:p-12 relative cursor-text">
									{/* Hover Instruction */}
									<div className="absolute top-4 right-4 flex items-center gap-2 text-void-fg-4 text-[10px] uppercase font-bold tracking-widest opacity-0 group-hover/content:opacity-40 transition-opacity pointer-events-none">
										<Plus size={12} /> Click any section to request changes
									</div>

									<div className="prose prose-invert max-w-none 
										[&_p]:hover:bg-void-accent/5 [&_li]:hover:bg-void-accent/5 [&_h2]:hover:bg-void-accent/5 [&_h3]:hover:bg-void-accent/5
										[&_*]:transition-colors [&_*]:cursor-pointer [&_*]:relative
										[&_p]:rounded [&_li]:rounded [&_h2]:rounded [&_h3]:rounded
										prose-headings:text-void-fg-1 prose-headings:font-bold
										prose-p:text-void-fg-2 prose-p:leading-relaxed
										prose-li:text-void-fg-2
									">
										<ChatMarkdownRender
											string={localContent}
											chatMessageLocation={undefined}
											isApplyEnabled={false}
											isLinkDetectionEnabled={true}
										/>
									</div>
								</div>
							</div>
							<div className="h-24" />
						</article>
					</main>

					{/* Comments Sidebar */}
					{comments.length > 0 && (
						<aside className="w-80 bg-void-bg-2 border-l border-void-border-2 flex flex-col animate-in slide-in-from-right duration-300 z-20 shadow-lg">
							<div className="p-4 border-b border-void-border-2 flex items-center justify-between bg-void-bg-1">
								<h3 className="text-xs font-black uppercase tracking-widest text-void-fg-3 flex items-center gap-2">
									<Plus size={14} className="text-void-accent" />
									Requested Changes
								</h3>
								<span className="text-[10px] font-bold bg-void-bg-3 px-2 py-0.5 rounded text-void-fg-4">{comments.length}</span>
							</div>
							<div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
								{comments.map((c) => (
									<div key={c.id} className="group p-4 bg-void-bg-1 rounded-xl border border-void-border-2 hover:border-void-accent/30 transition-all shadow-sm">
										<div className="flex items-start justify-between mb-3">
											<div className="text-[10px] text-void-fg-4 italic truncate flex-1 pr-2 opacity-60">
												"{c.sectionText}"
											</div>
											<button onClick={() => setComments(prev => prev.filter(i => i.id !== c.id))} className="text-void-fg-4 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
												<Trash2 size={12} />
											</button>
										</div>
										<div className="flex gap-2">
											<CornerDownRight size={14} className="text-void-accent shrink-0 mt-0.5" />
											<p className="text-xs font-medium text-void-fg-1 leading-relaxed">{c.comment}</p>
										</div>
									</div>
								))}
							</div>
							<div className="p-4 border-t border-void-border-2 bg-void-bg-3">
								<button 
									onClick={handleRequestChanges}
									className="w-full py-2.5 bg-void-accent text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-void-accent/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
								>
									<Send size={14} /> Submit All Changes
								</button>
							</div>
						</aside>
					)}
				</div>

				{/* Floating Comment Input */}
				{activeCommentSection && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-200" onClick={() => setActiveCommentSection(null)}>
						<div 
							className="bg-void-bg-2 border border-void-border-1 rounded-[24px] shadow-lg w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300"
							onClick={e => e.stopPropagation()}
						>
							<div className="p-6 border-b border-void-border-2 bg-void-bg-1">
								<div className="flex items-center gap-2 mb-2">
									<Plus size={14} className="text-void-accent" />
									<span className="text-[10px] font-black uppercase tracking-widest text-void-accent">Request Modification</span>
								</div>
								<div className="text-xs text-void-fg-3 italic line-clamp-2 px-2 border-l-2 border-void-border-2">
									"{activeCommentSection.text}"
								</div>
							</div>
							<div className="p-6">
								<textarea
									autoFocus
									className="w-full bg-void-bg-1 border border-void-border-2 rounded-xl p-4 text-sm text-void-fg-1 focus:ring-2 focus:ring-void-accent/30 focus:border-void-accent/50 outline-none transition-all min-h-[120px] resize-none shadow-inner"
									placeholder="Describe what you want to change in this section..."
									value={newCommentText}
									onChange={e => setNewCommentText(e.target.value)}
									onKeyDown={e => {
										if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment();
										if (e.key === 'Escape') setActiveCommentSection(null);
									}}
								/>
								<div className="flex items-center justify-between mt-6">
									<p className="text-[10px] text-void-fg-4 font-medium italic">⌘ + Enter to save</p>
									<div className="flex gap-2">
										<button onClick={() => setActiveCommentSection(null)} className="px-4 py-2 text-xs font-bold text-void-fg-3 hover:text-void-fg-1 transition-colors">
											Cancel
										</button>
										<button 
											onClick={addComment}
											disabled={!newCommentText.trim()}
											className="px-6 py-2 bg-void-accent text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-void-accent/20 hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
										>
											Add Change
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Action Bar */}
				{showActions && (
					<div className="flex-shrink-0 border-t border-void-border-2 bg-void-bg-2 px-6 py-4 z-30">
						<div className="flex items-center justify-end gap-3 max-w-4xl mx-auto w-full">
							<button onClick={handleReject} disabled={isRejecting} className="px-4 py-2 text-xs font-bold text-void-fg-4 hover:text-red-400 transition-colors uppercase tracking-widest">
								{isRejecting ? <LoadingSpinner /> : 'Reject Plan'}
							</button>

							<div className="flex-1" />

							<button
								onClick={handleRequestChanges}
								disabled={isRequestingChanges}
								className="px-6 py-2.5 bg-void-bg-1 text-void-fg-2 border border-void-border-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-void-bg-3 transition-all flex items-center gap-2"
							>
								{isRequestingChanges ? <LoadingSpinner /> : <><Plus size={14} /> Request Changes</>}
							</button>

							<button
								onClick={handleApprove}
								disabled={isApproving}
								className="px-8 py-2.5 bg-void-accent text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-void-accent/20 hover:opacity-90 transition-all active:scale-[0.98] flex items-center gap-2"
							>
								{isApproving ? <LoadingSpinner /> : <><Check size={16} /> Approve & Execute</>}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default EnhancedVoidPreview;