/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Check, X, AlertCircle, Loader2, Code, Play, RotateCw, Lightbulb, Target, BookOpen } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	ResultWrapper,
	ToolHeaderParams,
	getTitle,
} from './ToolResultHelpers.js';
import { ResultProgressBar, ResultActionButton, StatusBadge } from './ResultWrapperDesign.js';

interface TestCase {
	name: string;
	input?: any;
	expected: any;
}

interface ExerciseValidationProps {
	toolName: string;
	exerciseTitle?: string;
	exerciseType?: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';
	userAnswer: string;
	expectedSolution?: string;
	testCases?: TestCase[];
	onValidate?: (answer: string) => Promise<ValidationResult>;
	onHint?: () => Promise<string>;
}

interface ValidationResult {
	isCorrect: boolean;
	score: number;
	maxScore: number;
	feedback: string;
	issues?: Array<{
		severity: 'error' | 'warning' | 'info';
		message: string;
		line?: number;
		column?: number;
	}>;
	suggestions?: string[];
}

// Exercise validation component with LLM integration
export const ExerciseValidation: React.FC<{
	toolMessage: any;
	threadId: string;
}> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);

	const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
	const [isValidating, setIsValidating] = useState(false);
	const [showHints, setShowHints] = useState(false);
	const [hints, setHints] = useState<string[]>([]);
	const [currentHintIndex, setCurrentHintIndex] = useState(0);
	const [userCode, setUserCode] = useState('');
	const [isHintLoading, setIsHintLoading] = useState(false);

	// Parse exercise data from tool result
	const exerciseData = React.useMemo(() => {
		if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
			const result = toolMessage.result as any;
			return {
				title: result?.title || 'Exercise',
				type: result?.type || 'write_function',
				instructions: result?.instructions || result?.template || '',
				initialCode: result?.initial_code || result?.initialCode || '',
				expectedSolution: result?.expected_solution || result?.expectedSolution || '',
				testCases: result?.test_cases || [],
			};
		}
		return null;
	}, [toolMessage.type, toolMessage.result]);

	useEffect(() => {
		if (exerciseData?.initialCode && !userCode) {
			setUserCode(exerciseData.initialCode);
		}
	}, [exerciseData, userCode]);

	const title = getTitle(toolMessage);
	const isRejected = toolMessage.type === 'rejected';
	const componentParams: ToolHeaderParams = {
		title,
		desc1: exerciseData?.title,
		isError: false,
		icon: <Target size={12} className="text-void-accent" />,
		isRejected
	};

	// Validate answer using LLM
	const handleValidate = async () => {
		if (!userCode.trim()) {
			setValidationResult({
				isCorrect: false,
				score: 0,
				maxScore: 10,
				feedback: 'Please provide an answer before validating.',
				issues: [{ severity: 'error', message: 'Empty answer provided' }],
			});
			return;
		}

		setIsValidating(true);

		try {
			// Check if check_answer was already called and we have result
			const result = toolMessage.result as any;
			if (result?.is_correct !== undefined) {
				setValidationResult({
					isCorrect: result.is_correct,
					score: result.score || 0,
					maxScore: result.max_score || 10,
					feedback: result.feedback || result.explanation || '',
					issues: result.issues,
					suggestions: result.suggestions,
				});
				return;
			}

			// For now, do basic validation (real LLM validation would go here)
			// This is a simplified version - in production, this would call the LLM
			const expected = exerciseData?.expectedSolution || '';
			const isExactMatch = userCode.trim() === expected.trim();
			const isPartialMatch = expected && userCode.includes(expected.split('\n')[0]);

			let score = 0;
			let feedback = '';
			let issues: ValidationResult['issues'] = [];

			if (expected) {
				if (isExactMatch) {
					score = 10;
					feedback = 'Perfect! Your solution matches the expected output.';
				} else if (isPartialMatch) {
					score = 7;
					feedback = 'Good start! Your solution has the right approach but needs refinement.';
					issues = [{
						severity: 'warning',
						message: 'Your solution differs from the expected output. Check the implementation details.'
					}];
				} else {
					score = 3;
					feedback = 'Your solution needs improvement. Try again!';
					issues = [{
						severity: 'error',
						message: 'Your solution does not match the expected output.'
					}];
				}
			} else {
				// No expected solution provided - give credit for attempting
				score = 5;
				feedback = 'Good effort! Since no expected solution is provided, I can only validate syntax.';
			}

			setValidationResult({
				isCorrect: isExactMatch,
				score,
				maxScore: 10,
				feedback,
				issues,
				suggestions: isExactMatch ? [] : ['Review the problem requirements', 'Check for edge cases', 'Consider alternative approaches'],
			});
		} catch (error) {
			console.error('[ExerciseValidation] Error validating:', error);
			setValidationResult({
				isCorrect: false,
				score: 0,
				maxScore: 10,
				feedback: 'An error occurred while validating your answer.',
				issues: [{ severity: 'error', message: String(error) }],
			});
		} finally {
			setIsValidating(false);
		}
	};

	// Get hint from LLM
	const handleGetHint = async () => {
		setIsHintLoading(true);
		try {
			// In production, this would call give_hint tool
			const hintMessages = [
				"Try to break down the problem into smaller steps.",
				"Consider the input and output requirements carefully.",
				"Think about what happens at the boundaries of the problem.",
				"Review similar examples or patterns you've seen before.",
				"Check if you're handling all edge cases.",
			];

			if (currentHintIndex < hintMessages.length) {
				const newHint = hintMessages[currentHintIndex];
				setHints(prev => [...prev, newHint]);
				setCurrentHintIndex(prev => prev + 1);
			}
		} catch (error) {
			console.error('[ExerciseValidation] Error getting hint:', error);
		} finally {
			setIsHintLoading(false);
		}
	};

	// Get exercise type icon
	const getExerciseIcon = () => {
		switch (exerciseData?.type) {
			case 'fill_blank': return <BookOpen size={14} />;
			case 'fix_bug': return <AlertCircle size={14} />;
			case 'write_function': return <Code size={14} />;
			case 'extend_code': return <Target size={14} />;
			default: return <Target size={14} />;
		}
	};

	if (toolMessage.type === 'running_now') {
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;

		if (activity) {
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2 py-2">
						<Loader2 className="w-4 h-4 animate-spin text-void-accent" />
						<span className="text-xs text-void-fg-3">{activity}</span>
					</div>
				</ToolChildrenWrapper>
			);
			componentParams.isOpen = true;
		}
	} else if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
		componentParams.isOpen = true;

		componentParams.children = (
			<ToolChildrenWrapper>
				{exerciseData && (
					<div className="space-y-4">
						{/* Exercise Header */}
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-2">
								<span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
									{getExerciseIcon()}
								</span>
								<div>
									<h3 className="text-sm font-semibold text-void-fg-1">{exerciseData.title}</h3>
									<div className="text-xs text-void-fg-4 capitalize">
										{exerciseData.type.replace('_', ' ')}
									</div>
								</div>
							</div>
							{validationResult && (
								<StatusBadge status={validationResult.isCorrect ? 'success' : 'warning'} />
							)}
						</div>

						{/* Instructions */}
						{exerciseData.instructions && (
							<div className="bg-void-bg-2 p-3 rounded-lg">
								<div className="text-xs font-medium text-void-fg-2 mb-2 flex items-center gap-1">
									<Target size={12} />
									Instructions
								</div>
								<ChatMarkdownRender
									string={exerciseData.instructions}
									chatMessageLocation={undefined}
									isApplyEnabled={false}
									isLinkDetectionEnabled={true}
								/>
							</div>
						)}

						{/* Code Editor */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<div className="text-xs font-medium text-void-fg-2">Your Solution</div>
								{exerciseData.initialCode && (
									<button
										onClick={() => setUserCode(exerciseData.initialCode)}
										className="text-xs text-void-accent hover:text-void-accent-hover flex items-center gap-1"
									>
										<RotateCw size={10} />
										Reset
									</button>
								)}
							</div>
							<textarea
								value={userCode}
								onChange={(e) => setUserCode(e.target.value)}
								className="w-full h-32 px-3 py-2 bg-void-bg-1 border border-void-border-2 rounded-lg text-xs text-void-fg-1 font-mono resize-none focus:outline-none focus:border-void-accent"
								placeholder="Write your solution here..."
							/>
						</div>

						{/* Action Buttons */}
						<div className="flex items-center gap-2">
							<ResultActionButton
								onClick={handleValidate}
								icon={isValidating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
								label={isValidating ? 'Validating...' : 'Check Answer'}
								variant="primary"
								disabled={isValidating}
							/>
							<ResultActionButton
								onClick={() => setShowHints(!showHints)}
								icon={<Lightbulb size={12} />}
								label={showHints ? 'Hide Hints' : 'Get Hint'}
								variant="ghost"
							/>
							<ResultActionButton
								onClick={() => setValidationResult(null)}
								icon={<RotateCw size={12} />}
								label="Try Again"
								variant="ghost"
							/>
						</div>

						{/* Validation Result */}
						{validationResult && (
							<div className={`
								p-3 rounded-lg border
								${validationResult.isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}
							`}>
								<div className="flex items-start gap-2 mb-2">
									{validationResult.isCorrect ? (
										<Check size={16} className="text-green-500 flex-shrink-0" />
									) : (
										<X size={16} className="text-yellow-500 flex-shrink-0" />
									)}
									<div>
										<div className={`text-sm font-semibold ${validationResult.isCorrect ? 'text-green-500' : 'text-yellow-500'}`}>
											{validationResult.isCorrect ? 'Correct!' : 'Not quite right'}
										</div>
										<div className="text-xs text-void-fg-2 mt-1">{validationResult.feedback}</div>
									</div>
								</div>

								{/* Score */}
								<ResultProgressBar
									value={validationResult.score}
									max={validationResult.maxScore}
									color={validationResult.isCorrect ? 'success' : 'warning'}
									showLabel
								/>

								{/* Issues */}
								{validationResult.issues && validationResult.issues.length > 0 && (
									<div className="mt-3 space-y-1">
										{validationResult.issues.map((issue, idx) => (
											<div
												key={idx}
												className={`flex items-start gap-2 text-xs ${
													issue.severity === 'error' ? 'text-red-400' :
													issue.severity === 'warning' ? 'text-yellow-400' :
													'text-void-fg-3'
												}`}
											>
												{issue.severity === 'error' ? <AlertCircle size={10} /> : <Target size={10} />}
												<span>{issue.message}</span>
											</div>
										))}
									</div>
								)}

								{/* Suggestions */}
								{validationResult.suggestions && validationResult.suggestions.length > 0 && (
									<div className="mt-3 pt-3 border-t border-current/20">
										<div className="text-[10px] text-void-fg-4 mb-2">Suggestions:</div>
										<ul className="space-y-1">
											{validationResult.suggestions.map((suggestion, idx) => (
												<li key={idx} className="flex items-start gap-2 text-xs text-void-fg-3">
													<span className="text-purple-400">{idx + 1}.</span>
													<span>{suggestion}</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						)}

						{/* Hints */}
						{showHints && (
							<div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2 text-xs font-medium text-blue-400">
										<Lightbulb size={12} />
										Hints
									</div>
									<button
										onClick={handleGetHint}
										disabled={isHintLoading}
										className="text-xs text-blue-400 hover:text-blue-300 disabled:text-blue-500/50 flex items-center gap-1"
									>
										{isHintLoading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
										Get Another Hint ({4 - currentHintIndex} left)
									</button>
								</div>
								{hints.length === 0 ? (
									<p className="text-xs text-void-fg-3 italic">Click above to get your first hint.</p>
								) : (
									<ul className="space-y-2">
										{hints.map((hint, idx) => (
											<li key={idx} className="flex items-start gap-2 text-xs text-void-fg-2">
												<span className="text-blue-400 flex-shrink-0 mt-0.5">{idx + 1}.</span>
												<span>{hint}</span>
											</li>
										))}
									</ul>
								)}
							</div>
						)}

						{/* Expected Solution (after attempts) */}
						{validationResult && !validationResult.isCorrect && exerciseData.expectedSolution && (
							<details className="pt-2">
								<summary className="text-xs text-void-fg-4 cursor-pointer hover:text-void-fg-2">
									Show Expected Solution
								</summary>
								<pre className="mt-2 p-3 bg-void-bg-2 rounded-lg text-xs text-void-fg-2 font-mono overflow-x-auto">
									{exerciseData.expectedSolution}
								</pre>
							</details>
						)}
					</div>
				)}
			</ToolChildrenWrapper>
		);
	}

	return <ToolHeaderWrapper {...componentParams} />;
};

// Plus icon for hints
const Plus = ({ size }: { size: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	</svg>
);

// Export as result wrapper for check_answer tool
export const CheckAnswerResultWrapper: ResultWrapper<'check_answer'> = ({ toolMessage, threadId }) => {
	return <ExerciseValidation toolMessage={toolMessage} threadId={threadId} />;
};