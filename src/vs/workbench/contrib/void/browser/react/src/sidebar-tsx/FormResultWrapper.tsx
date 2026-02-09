/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { Check, Square, Circle, Type, Send, AlertTriangle, Ban } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	getTitle,
	toolNameToDesc,
	ResultWrapper,
	ToolHeaderParams,
} from './ToolResultHelpers.js';

type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'checkbox';

type Question = {
	id: string;
	text: string;
	type: QuestionType;
	options?: string[];
	required?: boolean;
};

type RenderFormParams = {
	title?: string;
	description?: string;
	questions: Question[];
};

const QuestionItem = ({ question, value, onChange }: { question: Question; value: any; onChange: (value: any) => void }) => {
	const isDark = document.documentElement.classList.contains('vscode-dark');

	switch (question.type) {
		case 'single_choice':
			return (
				<div className="space-y-2">
					<div className="text-sm font-medium text-void-fg-2">
						{question.text}
						{question.required && <span className="text-void-accent ml-1">*</span>}
					</div>
					<div className="space-y-1.5">
						{question.options?.map((option, idx) => (
							<button
								type="button"
								key={idx}
								onClick={() => onChange(option)}
								className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border ${
									value === option
										? 'bg-void-accent/10 border-void-accent/40'
										: 'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50 hover:border-void-border-1'
								}`}
							>
								<div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
									value === option
										? 'border-void-accent bg-void-accent'
										: 'border-void-fg-4'
								}`}>
									{value === option && <Circle size={8} className="text-white" fill="currentColor" />}
								</div>
								<span className="text-sm text-void-fg-1">{option}</span>
							</button>
						))}
					</div>
				</div>
			);

		case 'multiple_choice':
			return (
				<div className="space-y-2">
					<div className="text-sm font-medium text-void-fg-2">
						{question.text}
						{question.required && <span className="text-void-accent ml-1">*</span>}
					</div>
					<div className="space-y-1.5">
						{question.options?.map((option, idx) => {
							const isSelected = Array.isArray(value) && value.includes(option);
							return (
								<button
									type="button"
									key={idx}
									onClick={() => {
										const current = Array.isArray(value) ? value : [];
										if (current.includes(option)) {
											onChange(current.filter((o: string) => o !== option));
										} else {
											onChange([...current, option]);
										}
									}}
									className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border ${
										isSelected
											? 'bg-void-accent/10 border-void-accent/40'
											: 'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50 hover:border-void-border-1'
									}`}
								>
									<div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
										isSelected
											? 'border-void-accent bg-void-accent'
											: 'border-void-fg-4'
									}`}>
										{isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
									</div>
									<span className="text-sm text-void-fg-1">{option}</span>
								</button>
							);
						})}
					</div>
				</div>
			);

		case 'checkbox':
			return (
				<button
					type="button"
					onClick={() => onChange(!value)}
					className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border ${
						value === true
							? 'bg-void-accent/10 border-void-accent/40'
							: 'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50 hover:border-void-border-1'
					}`}
				>
					<div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
						value === true
							? 'border-void-accent bg-void-accent'
							: 'border-void-fg-4'
					}`}>
						{value === true && <Check size={10} className="text-white" strokeWidth={3} />}
					</div>
					<span className="text-sm text-void-fg-2">
						{question.text}
						{question.required && <span className="text-void-accent ml-1">*</span>}
					</span>
				</button>
			);

		case 'text':
			return (
				<div className="space-y-2">
					<div className="text-sm font-medium text-void-fg-2">
						{question.text}
						{question.required && <span className="text-void-accent ml-1">*</span>}
					</div>
					<input
						type="text"
						value={value || ''}
						onChange={(e) => onChange(e.target.value)}
						placeholder="Type your answer..."
						className="w-full px-3 py-2 rounded-lg border border-void-border-2 bg-void-bg-2/50 text-void-fg-1 text-sm placeholder:text-void-fg-4 focus:outline-none focus:ring-2 focus:ring-void-accent/50 focus:border-void-accent transition-all"
					/>
				</div>
			);

		default:
			// Fallback for unknown types - render as text input so the question is at least visible
			return (
				<div className="space-y-2">
					<div className="text-sm font-medium text-void-fg-2">
						{question.text}
						{question.type && <span className="text-xs text-void-fg-4 ml-2 font-mono opacity-70">({question.type})</span>}
						{question.required && <span className="text-void-accent ml-1">*</span>}
					</div>
					<input
						type="text"
						value={value || ''}
						onChange={(e) => onChange(e.target.value)}
						placeholder="Type your answer..."
						className="w-full px-3 py-2 rounded-lg border border-void-border-2 bg-void-bg-2/50 text-void-fg-1 text-sm placeholder:text-void-fg-4 focus:outline-none focus:ring-2 focus:ring-void-accent/50 focus:border-void-accent transition-all"
					/>
				</div>
			);
	}
};

export const FormResultWrapper: ResultWrapper<'render_form'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);
	const chatThreadsService = accessor.get('IChatThreadService');

	// Debug logging to understand what's happening
	console.log('[FormResultWrapper] toolMessage.type:', toolMessage.type);
	console.log('[FormResultWrapper] toolMessage.params:', toolMessage.params);

	const title = getTitle(toolMessage);
	const { desc1 } = toolNameToDesc(toolMessage.name as BuiltinToolName, toolMessage.params, accessor);

	const isRejected = toolMessage.type === 'rejected';

       // Form state for interactive responses
       const params = toolMessage.params as RenderFormParams | undefined;
       const [responses, setResponses] = useState<Record<string, any>>({});
       const [showError, setShowError] = useState(false);
       const [isSubmitting, setIsSubmitting] = useState(false);

       // Safety check for params
       if (!params || !params.questions || !Array.isArray(params.questions)) {
	       console.log('[FormResultWrapper] Safety check failed - params:', params, 'questions:', params?.questions);
               const componentParams: ToolHeaderParams = {
                       title,
                       desc1,
                       isError: false,
                       icon: <Type size={12} strokeWidth={2.5} />,
                       isRejected,
                       isOpen: true,
                       children: (
                               <ToolChildrenWrapper>
                                       <div className="flex items-center gap-2 py-2 mb-3">
                                               <div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
                                               <span className="text-xs italic text-void-fg-3">Loading form...</span>
                                       </div>
                               </ToolChildrenWrapper>
                       )
               };
               return <ToolHeaderWrapper {...componentParams} />;
       }

       console.log('[FormResultWrapper] params.questions length:', params.questions.length);

       // Check if all required questions are answered
       const validateForm = (): boolean => {
               return params.questions.every(q => {			if (!q.required) return true;
			const response = responses[q.id];
			if (response === undefined || response === null) return false;
			if (Array.isArray(response) && response.length === 0) return false;
			if (typeof response === 'string' && response.trim() === '') return false;
			return true;
		});
	};

	const handleSubmit = async () => {
		if (!validateForm()) {
			setShowError(true);
			setTimeout(() => setShowError(false), 3000);
			return;
		}

		setIsSubmitting(true);

		try {
			// Format responses as JSON for the LLM to parse
			const formattedResponses: Record<string, any> = {};
			for (const q of params.questions) {
				formattedResponses[q.id] = responses[q.id];
			}

			// Submit the form responses as a tool result - bypasses the message queue
			if (chatThreadsService && chatThreadsService.submitToolResult) {
				chatThreadsService.submitToolResult(threadId, toolMessage.id, formattedResponses);
			}
		} catch (error) {
			console.error('[FormResultWrapper] Error submitting form:', error);
			setShowError(true);
			setTimeout(() => setShowError(false), 3000);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleQuestionChange = (questionId: string, value: any) => {
		setResponses(prev => ({ ...prev, [questionId]: value }));
		setShowError(false);
	};

	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		isError: false,
		icon: <Type size={12} strokeWidth={2.5} />,
		isRejected,
		isOpen: true, // Always open for forms
	};

	if (toolMessage.type === 'success') {
		console.log('[FormResultWrapper] Rendering success state');
		const result = toolMessage.result as any;
		const resultTemplate = result?.template || '';

		componentParams.children = (
			<ToolChildrenWrapper>
				{resultTemplate ? (
					<div className="text-void-fg-2 whitespace-pre-wrap">{resultTemplate}</div>
				) : (
					<div className="text-void-fg-2">
						Form completed. Responses submitted.
					</div>
				)}
			</ToolChildrenWrapper>
		);
	} else if (toolMessage.type === 'tool_request' || toolMessage.type === 'running_now') {
		console.log('[FormResultWrapper] Rendering form with questions');
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;

		componentParams.children = (
			<ToolChildrenWrapper>
				{activity && (
					<div className="flex items-center gap-2 py-2 mb-3 border-b border-void-border-2/30">
						<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-xs italic text-void-fg-3">{activity}</span>
					</div>
				)}

				{params.title && (
					<div className="mb-4">
						<h3 className="text-base font-semibold text-void-fg-1">{params.title}</h3>
						{params.description && (
							<p className="text-sm text-void-fg-3 mt-1">{params.description}</p>
						)}
					</div>
				)}

				<div className="space-y-4">
					{params.questions.map((question, idx) => (
						<QuestionItem
							key={question.id || idx}
							question={question}
							value={responses[question.id]}
							onChange={(value) => handleQuestionChange(question.id, value)}
						/>
					))}
				</div>

				{showError && (
					<div className="mt-4 flex items-start gap-2 px-3 py-2 bg-void-warning/10 border border-void-warning/30 rounded-lg">
						<AlertTriangle size={14} className="text-void-warning flex-shrink-0 mt-0.5" />
						<span className="text-xs text-void-warning">
							Please answer all required questions marked with *
						</span>
					</div>
				)}

				<div className="mt-4 pt-4 border-t border-void-border-2/50">
					<div className="flex items-center gap-2">
						<button
							onClick={handleSubmit}
							disabled={isSubmitting}
							className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none"
						>
							{isSubmitting ? (
								<div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
							) : (
								<Send size={14} />
							)}
							{isSubmitting ? 'Submitting...' : 'Submit Responses'}
						</button>
						<button
							onClick={() => {
								// Skip the form - mark as rejected and continue
								if (chatThreadsService && chatThreadsService.skipLatestToolRequest) {
									chatThreadsService.skipLatestToolRequest(threadId, toolMessage.id);
								}
							}}
							className="px-3 py-2 text-sm text-void-fg-3 hover:text-void-fg-1 transition-colors"
						>
							Skip
						</button>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
	} else if (toolMessage.type === 'tool_error') {
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="px-3 py-2 bg-void-warning/10 border border-void-warning/30 rounded-lg">
					<div className="flex items-start gap-2">
						<AlertTriangle size={14} className="text-void-warning flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-warning">
							Error: {String(toolMessage.result)}
						</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
	} else if (toolMessage.type === 'rejected') {
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="px-3 py-2 bg-void-fg-4/10 border border-void-fg-4/30 rounded-lg">
					<div className="flex items-center gap-2">
						<Ban size={14} className="text-void-fg-4 flex-shrink-0" />
						<span className="text-sm text-void-fg-3">
							Skipped
						</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
	} else {
		// Unexpected message type - log and show debug info
		console.error('[FormResultWrapper] Unexpected toolMessage.type:', toolMessage.type);
		console.error('[FormResultWrapper] Full toolMessage:', toolMessage);
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="px-3 py-2 bg-void-warning/10 border border-void-warning/30 rounded-lg">
					<div className="flex items-start gap-2">
						<AlertTriangle size={14} className="text-void-warning flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-warning">
							Unexpected state: {toolMessage.type}
						</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
	}

	return <ToolHeaderWrapper {...componentParams} />;
};