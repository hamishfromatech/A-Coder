/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import '../styles.css';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { useAccessor, useIsDark } from '../util/services.js';

export interface VoidPreviewProps {
	title: string;
	content: string;
	isImplementationPlan?: boolean;
	isWalkthrough?: boolean;
	planId?: string;
	threadId?: string;
}

export const VoidPreview: React.FC<VoidPreviewProps> = ({ title, content, isImplementationPlan, isWalkthrough, planId, threadId }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');
	const voidSettingsService = accessor.get('IVoidSettingsService');

	const [isApproving, setIsApproving] = useState(false);

	const handleApprove = async () => {
		if (!planId || !threadId || isApproving) return;

		setIsApproving(true);
		try {
			if (voidSettingsService?.setGlobalSetting) {
				voidSettingsService.setGlobalSetting('chatMode', 'code');
			}

			let approvalMessage = '';

			if (isImplementationPlan) {
				approvalMessage = `The implementation plan (ID: ${planId}) has been approved for execution.

**Instructions:**
1. First, use the \`create_todo\` tool to create a task plan based on the approved implementation plan steps
2. Then execute each task in order, using \`update_todo\` to track progress
3. For each step: read relevant files, make the necessary changes, and verify they work
4. Mark each task complete as you finish it

Please begin execution now.`;
			} else if (isWalkthrough) {
				approvalMessage = `The walkthrough (File: ${planId}) has been approved. Please proceed with the next steps or apply the changes as described.`;
			}

			if (approvalMessage) {
				await chatThreadsService.addUserMessageAndStreamResponse({
					threadId,
					userMessage: approvalMessage
				});
			}
		} catch (error) {
			console.error('Failed to approve:', error);
		} finally {
			setIsApproving(false);
		}
	};

	const handleRequestChanges = async () => {
		if (!planId || !threadId) return;

		try {
			if (voidSettingsService?.setGlobalSetting) {
				await voidSettingsService.setGlobalSetting('chatMode', 'plan');
			}

			let changeMessage = '';
			if (isImplementationPlan) {
				changeMessage = `I would like to request changes to the implementation plan (ID: ${planId}).\n\nPlease revise the plan based on my feedback. After making changes, use \`preview_implementation_plan\` to show me the updated plan for review.\n\nMy requested changes:`;
			} else if (isWalkthrough) {
				changeMessage = `I would like to request changes to the walkthrough (File: ${planId}).\n\nPlease revise the walkthrough based on my feedback.\n\nMy requested changes:`;
			}

			if (changeMessage) {
				await chatThreadsService.addUserMessageAndStreamResponse({
					threadId,
					userMessage: changeMessage
				});
			}
		} catch (error) {
			console.error('Failed to request changes:', error);
		}
	};

	const handleReject = async () => {
		if (!planId || !threadId) return;

		try {
			let rejectMessage = '';
			if (isImplementationPlan) {
				rejectMessage = `I am rejecting the implementation plan (ID: ${planId}). Please stop working on this plan.`;
			} else if (isWalkthrough) {
				rejectMessage = `I am rejecting the walkthrough (File: ${planId}). Please stop working on this.`;
			}

			if (rejectMessage) {
				await chatThreadsService.addUserMessageAndStreamResponse({
					threadId,
					userMessage: rejectMessage
				});
			}
		} catch (error) {
			console.error('Failed to reject:', error);
		}
	};

	const showActions = (isImplementationPlan || isWalkthrough) && planId && threadId;

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className="void-preview-container h-full flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans">
				
				{/* Top Header */}
				<header className="px-6 py-4 flex-shrink-0 flex items-center justify-between border-b border-void-border-2 bg-void-bg-2 z-20">
					<div className="flex items-center gap-3 overflow-hidden">
						<div className="flex-shrink-0 w-8 h-8 rounded-lg bg-void-accent/10 flex items-center justify-center border border-void-accent/20">
							<svg className="w-5 h-5 text-void-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
						</div>
						<div className="flex flex-col min-w-0">
							<h1 className="text-sm font-semibold text-void-fg-1 truncate tracking-tight">{title}</h1>
							<div className="flex items-center gap-2">
								<span className="text-[10px] text-void-fg-4 font-medium uppercase tracking-wider opacity-60">Status: Pending Review</span>
								{planId && (
									<>
										<span className="text-[10px] text-void-fg-4 opacity-30">•</span>
										<span className="text-[10px] text-void-fg-4 font-mono opacity-60">{planId}</span>
									</>
								)}
							</div>
						</div>
					</div>
					
					<div className="flex items-center gap-2">
					</div>
				</header>

				{/* Main Scroll Area */}
				<div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 flex flex-col items-center">
					
					{/* Document Container */}
					<main className="w-full max-w-4xl mx-auto px-6 py-12 md:px-12">
						
						{/* Plan Badge */}
						{isImplementationPlan && (
							<div className="mb-8 flex justify-center">
								<span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-void-accent/10 text-void-accent border border-void-accent/20">
									Agent Implementation Strategy
								</span>
							</div>
						)}
						{isWalkthrough && (
							<div className="mb-8 flex justify-center">
								<span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-void-accent/10 text-void-accent border border-void-accent/20">
									Code Walkthrough
								</span>
							</div>
						)}

						{/* The Card */}
						<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl shadow-lg shadow-black/10 overflow-hidden">
							
							{/* Document Header Decor */}
							<div className="h-1.5 w-full bg-void-accent/40" />
							
							<div className="p-8 md:p-12">
								<div className="prose prose-invert max-w-none 
									prose-headings:text-void-fg-1 prose-headings:font-bold prose-headings:tracking-tight
									prose-h1:text-3xl prose-h1:mb-8
									prose-h2:text-xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-2 prose-h2:border-b prose-h2:border-void-border-2
									prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-4 prose-h3:flex prose-h3:items-center prose-h3:gap-2
									prose-p:text-void-fg-2 prose-p:leading-relaxed prose-p:text-base prose-p:mb-4
									prose-li:text-void-fg-2 prose-li:mb-2
									prose-strong:text-void-fg-1 prose-strong:font-bold
									prose-code:text-void-accent prose-code:bg-void-accent/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-sm
									prose-pre:bg-void-bg-4 prose-pre:border prose-pre:border-void-border-2 prose-pre:rounded-xl prose-pre:shadow-inner prose-pre:my-6
									prose-blockquote:border-l-4 prose-blockquote:border-void-accent prose-blockquote:bg-void-accent/5 prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:rounded-r-xl prose-blockquote:text-void-fg-2 prose-blockquote:italic prose-blockquote:my-8
								prose-img:rounded-xl prose-img:shadow-lg
								">
									<ChatMarkdownRender
										string={content}
										chatMessageLocation={undefined}
										isApplyEnabled={false}
										isLinkDetectionEnabled={true}
									/>
								</div>
							</div>
						</div>

						{/* Footer Disclaimer */}
						<div className="mt-8 text-center">
							<p className="text-xs text-void-fg-4 opacity-40">Generated by A-Coder Agent • Review carefully before execution</p>
						</div>

						{/* Bottom Spacing */}
						<div className="h-32" />
					</main>
				</div>

				{/* Floating Action Bar */}
				{showActions && (
					<div className="absolute bottom-8 left-0 right-0 flex justify-center z-30 pointer-events-none px-4">
						<div className="bg-void-bg-2 border border-void-border-1 rounded-2xl p-2 shadow-lg shadow-black/20 flex items-center gap-2 pointer-events-auto scale-110 md:scale-100 transition-transform duration-300">
							
							<button
								onClick={handleReject}
								className="px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-2 group"
							>
								<div className="w-5 h-5 rounded-md bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
									</svg>
								</div>
								Reject
							</button>

							<div className="w-px h-6 bg-void-border-2 mx-1" />

							<button
								onClick={handleRequestChanges}
								className="px-4 py-2.5 text-xs font-semibold text-void-fg-2 hover:bg-void-bg-4 rounded-xl transition-all flex items-center gap-2 group"
							>
								<div className="w-5 h-5 rounded-md bg-void-bg-4 flex items-center justify-center group-hover:border-void-border-2 transition-colors">
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</div>
								Request Changes
							</button>

							<button
								onClick={handleApprove}
								disabled={isApproving}
								className="ml-2 px-6 py-2.5 text-xs font-bold bg-void-accent hover:opacity-90 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-void-accent/20 transition-all active:scale-95 flex items-center gap-2"
							>
								{isApproving ? (
									<svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
								) : (
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
									</svg>
								)}
								{isImplementationPlan ? 'Approve & Execute' : 'Approve'}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};