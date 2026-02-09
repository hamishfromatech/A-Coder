/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { Check, Circle, Brain, Send, AlertTriangle, RotateCcw, Trophy, X } from 'lucide-react';
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

type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'true_false';

type QuizQuestion = {
	id: string;
	question: string;
	type: QuestionType;
	options?: string[];
	correct_answer: string | string[];
	explanation?: string;
	points?: number;
};

type CreateQuizParams = {
	title: string;
	description?: string;
	questions: QuizQuestion[];
	total_points?: number;
	time_limit_seconds?: number;
};

// Calculate score based on user answers
const calculateScore = (questions: QuizQuestion[], userAnswers: Record<string, any>): { score: number; totalPoints: number; results: Array<{ questionId: string; isCorrect: boolean; userAnswer: any; correctAnswer: string | string[]; points: number; explanation?: string }> } => {
	let score = 0;
	let totalPoints = 0;
	const results: Array<{ questionId: string; isCorrect: boolean; userAnswer: any; correctAnswer: string | string[]; points: number; explanation?: string }> = [];

	for (const q of questions) {
		const points = q.points || 10;
		totalPoints += points;

		const userAnswer = userAnswers[q.id];
		const correctAnswer = q.correct_answer;

		let isCorrect = false;

		if (q.type === 'single_choice' || q.type === 'true_false') {
			isCorrect = userAnswer === correctAnswer;
		} else if (q.type === 'multiple_choice') {
			const userAnswersArray = Array.isArray(userAnswer) ? userAnswer : [];
			const correctArray = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
			isCorrect = userAnswersArray.length === correctArray.length &&
				userAnswersArray.every((a: string) => correctArray.includes(a)) &&
				correctArray.every((a: string) => userAnswersArray.includes(a));
		} else if (q.type === 'text') {
			// For text questions, do a case-insensitive comparison
			isCorrect = typeof userAnswer === 'string' && userAnswer.toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();
		}

		if (isCorrect) {
			score += points;
		}

		results.push({
			questionId: q.id,
			isCorrect,
			userAnswer,
			correctAnswer,
			points,
			explanation: q.explanation,
		});
	}

	return { score, totalPoints, results };
};

const QuizQuestionItem = ({ question, value, onChange, showResult, result }: {
	question: QuizQuestion;
	value: any;
	onChange: (value: any) => void;
	showResult?: boolean;
	result?: { isCorrect: boolean; correctAnswer: string | string[] };
}) => {
	const isDark = document.documentElement.classList.contains('vscode-dark');

	const handleSingleChoice = (option: string) => {
		onChange(option);
	};

	const handleMultipleChoice = (option: string) => {
		const current = Array.isArray(value) ? value : [];
		if (current.includes(option)) {
			onChange(current.filter((o: string) => o !== option));
		} else {
			onChange([...current, option]);
		}
	};

	const handleText = (text: string) => {
		onChange(text);
	};

	const handleTrueFalse = (answer: string) => {
		onChange(answer);
	};

	// Determine if an option is selected (for single/multiple choice)
	const isOptionSelected = (option: string) => {
		if (question.type === 'single_choice' || question.type === 'true_false') {
			return value === option;
		} else if (question.type === 'multiple_choice') {
			return Array.isArray(value) && value.includes(option);
		}
		return false;
	};

	// Determine if an option is correct (for showing results)
	const isOptionCorrect = (option: string) => {
		if (!result) return false;
		if (Array.isArray(result.correctAnswer)) {
			return result.correctAnswer.includes(option);
		}
		return result.correctAnswer === option;
	};

	// For multiple choice, check if option should be partially correct
	const isOptionPartiallyCorrect = (option: string) => {
		if (!result || question.type !== 'multiple_choice' || !Array.isArray(result.correctAnswer)) return false;
		return result.correctAnswer.includes(option);
	};

	return (
		<div className="space-y-3">
			<div className="text-sm font-medium text-void-fg-1">
				{question.question}
				{question.points && <span className="text-void-accent ml-2">({question.points} pts)</span>}
			</div>

			{question.type === 'single_choice' && question.options && (
				<div className="space-y-1.5">
					{question.options.map((option, idx) => {
						const isSelected = isOptionSelected(option);
						const isCorrect = showResult && isOptionCorrect(option);
						const showAsCorrect = showResult && isSelected && isCorrect;
						const showAsIncorrect = showResult && isSelected && !isCorrect;
						const showAsMissed = showResult && !isSelected && isCorrect;

						return (
							<button
								key={idx}
								disabled={showResult}
								onClick={() => handleSingleChoice(option)}
								className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 border ${
									showAsCorrect ? 'bg-void-accent/20 border-void-accent/50' :
									showAsIncorrect ? 'bg-void-warning/10 border-void-warning/40' :
									showAsMissed ? 'bg-void-fg-4/20 border-dashed border-void-fg-4/40' :
									isSelected ? 'bg-void-accent/10 border-void-accent/40' :
									'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50'
								}`}
							>
								<div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
									showAsCorrect ? 'border-void-accent bg-void-accent' :
									showAsIncorrect ? 'border-void-warning bg-void-warning' :
									showAsMissed ? 'border-void-accent/50' :
									isSelected ? 'border-void-accent bg-void-accent' :
									'border-void-fg-4'
								}`}>
									{isSelected && <Circle size={8} className="text-white" fill="currentColor" />}
								</div>
								<span className={`text-sm ${showAsCorrect ? 'text-void-accent font-medium' : showAsIncorrect ? 'text-void-warning' : showAsMissed ? 'text-void-accent/60' : 'text-void-fg-1'}`}>
									{option}
									{showAsMissed && <span className="ml-2 text-xs">(correct)</span>}
								</span>
							</button>
						);
					})}
				</div>
			)}

			{question.type === 'multiple_choice' && question.options && (
				<div className="space-y-1.5">
					{question.options.map((option, idx) => {
						const isSelected = isOptionSelected(option);
						const isCorrect = showResult && isOptionPartiallyCorrect(option);
						const showAsCorrect = showResult && isSelected && isCorrect;
						const showAsIncorrect = showResult && isSelected && !isCorrect;
						const showAsMissed = showResult && !isSelected && isCorrect;

						return (
							<button
								key={idx}
								disabled={showResult}
								onClick={() => handleMultipleChoice(option)}
								className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 border ${
									showAsCorrect ? 'bg-void-accent/20 border-void-accent/50' :
									showAsIncorrect ? 'bg-void-warning/10 border-void-warning/40' :
									showAsMissed ? 'bg-void-fg-4/20 border-dashed border-void-fg-4/40' :
									isSelected ? 'bg-void-accent/10 border-void-accent/40' :
									'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50'
								}`}
							>
								<div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
									showAsCorrect ? 'border-void-accent bg-void-accent' :
									showAsIncorrect ? 'border-void-warning bg-void-warning' :
									showAsMissed ? 'border-void-accent/50' :
									isSelected ? 'border-void-accent bg-void-accent' :
									'border-void-fg-4'
								}`}>
									{isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
								</div>
								<span className={`text-sm ${showAsCorrect ? 'text-void-accent font-medium' : showAsIncorrect ? 'text-void-warning' : showAsMissed ? 'text-void-accent/60' : 'text-void-fg-1'}`}>
									{option}
									{showAsMissed && <span className="ml-2 text-xs">(correct)</span>}
								</span>
							</button>
						);
					})}
				</div>
			)}

			{question.type === 'true_false' && (
				<div className="space-y-1.5">
					{['True', 'False'].map((option, idx) => {
						const isSelected = isOptionSelected(option);
						const isCorrect = showResult && result && (result.correctAnswer === option || (Array.isArray(result.correctAnswer) && result.correctAnswer.includes(option)));
						const showAsCorrect = showResult && isSelected && isCorrect;
						const showAsIncorrect = showResult && isSelected && !isCorrect;
						const showAsMissed = showResult && !isSelected && isCorrect;

						return (
							<button
								key={idx}
								disabled={showResult}
								onClick={() => handleTrueFalse(option)}
								className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 border ${
									showAsCorrect ? 'bg-void-accent/20 border-void-accent/50' :
									showAsIncorrect ? 'bg-void-warning/10 border-void-warning/40' :
									showAsMissed ? 'bg-void-fg-4/20 border-dashed border-void-fg-4/40' :
									isSelected ? 'bg-void-accent/10 border-void-accent/40' :
									'bg-void-bg-2/30 border-void-border-2 hover:bg-void-bg-2/50'
								}`}
							>
								<div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
									showAsCorrect ? 'border-void-accent bg-void-accent' :
									showAsIncorrect ? 'border-void-warning bg-void-warning' :
									showAsMissed ? 'border-void-accent/50' :
									isSelected ? 'border-void-accent bg-void-accent' :
									'border-void-fg-4'
								}`}>
									{isSelected && <Circle size={8} className="text-white" fill="currentColor" />}
								</div>
								<span className={`text-sm ${showAsCorrect ? 'text-void-accent font-medium' : showAsIncorrect ? 'text-void-warning' : showAsMissed ? 'text-void-accent/60' : 'text-void-fg-1'}`}>
									{option}
									{showAsMissed && <span className="ml-2 text-xs">(correct)</span>}
								</span>
							</button>
						);
					})}
				</div>
			)}

			{question.type === 'text' && (
				<div>
					<textarea
						disabled={showResult}
						value={value || ''}
						onChange={(e) => handleText(e.target.value)}
						placeholder="Type your answer..."
						className={`w-full px-3 py-2 rounded-lg border bg-void-bg-2/50 text-void-fg-1 text-sm placeholder:text-void-fg-4 focus:outline-none focus:ring-2 transition-all ${
							showResult && result && !result.isCorrect ? 'border-void-warning/50 ring-2 ring-void-warning/20' :
							showResult && result && result.isCorrect ? 'border-void-accent/50 ring-2 ring-void-accent/20' :
							'border-void-border-2'
						}`}
						rows={2}
					/>
					{showResult && result && !result.isCorrect && (
						<div className="mt-1.5 text-xs text-void-fg-4">
							Correct answer: <span className="text-void-accent font-medium">{Array.isArray(result.correctAnswer) ? result.correctAnswer.join(', ') : result.correctAnswer}</span>
						</div>
					)}
				</div>
			)}

			{showResult && question.explanation && (
				<div className="mt-3 px-3 py-2 bg-void-bg-2/50 border border-void-border-2/50 rounded-lg">
					<div className="text-xs text-void-fg-3 leading-relaxed">
						<span className="font-medium text-void-fg-2">💡 Explanation: </span>
						{question.explanation}
					</div>
				</div>
			)}
		</div>
	);
};

export const QuizResultWrapper: ResultWrapper<'create_quiz'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);
	const chatThreadsService = accessor.get('IChatThreadService');

	const title = getTitle(toolMessage);
	const { desc1 } = toolNameToDesc(toolMessage.name as BuiltinToolName, toolMessage.params, accessor);

	const isRejected = toolMessage.type === 'rejected';

	// Quiz state
	const params = toolMessage.params as CreateQuizParams | undefined;
	const [answers, setAnswers] = useState<Record<string, any>>({});
	const [showResults, setShowResults] = useState(false);
	const [quizResults, setQuizResults] = useState<{ score: number; totalPoints: number; results: Array<{ questionId: string; isCorrect: boolean; userAnswer: any; correctAnswer: string | string[]; points: number; explanation?: string }> } | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Safety check for params
	if (!params || !params.questions || !Array.isArray(params.questions)) {
		const componentParams: ToolHeaderParams = {
			title,
			desc1,
			isError: false,
			icon: <Brain size={12} strokeWidth={2.5} />,
			isRejected,
			isOpen: true,
			children: (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2 py-2 mb-3">
						<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-xs italic text-void-fg-3">Loading quiz...</span>
					</div>
				</ToolChildrenWrapper>
			)
		};
		return <ToolHeaderWrapper {...componentParams} />;
	}

	const handleSubmit = async () => {
		setIsSubmitting(true);

		try {
			// Calculate score
			const results = calculateScore(params.questions, answers);
			setQuizResults(results);
			setShowResults(true);

			// Format answers for the LLM to review
			const quizResult = {
				title: params.title,
				score: results.score,
				totalPoints: results.totalPoints,
				percentage: results.totalPoints > 0 ? Math.round((results.score / results.totalPoints) * 100) : 0,
				answers: answers
			};

			// Submit the quiz answers as a tool result - bypasses the message queue
			if (chatThreadsService && chatThreadsService.submitToolResult) {
				chatThreadsService.submitToolResult(threadId, toolMessage.id, quizResult);
			}
		} catch (error) {
			console.error('[QuizResultWrapper] Error submitting quiz:', error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleAnswerChange = (questionId: string, value: any) => {
		setAnswers(prev => ({ ...prev, [questionId]: value }));
	};

	const handleReset = () => {
		setAnswers({});
		setShowResults(false);
		setQuizResults(null);
	};

	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		isError: false,
		icon: <Brain size={12} strokeWidth={2.5} />,
		isRejected,
		isOpen: true, // Always open for quizzes
	};

	if (toolMessage.type === 'success') {
		const result = toolMessage.result as any;
		const resultTemplate = result?.template || '';

		componentParams.children = (
			<ToolChildrenWrapper>
				{resultTemplate ? (
					<div className="text-void-fg-2 whitespace-pre-wrap">{resultTemplate}</div>
				) : (
					<div className="text-void-fg-2">
						Quiz completed!
					</div>
				)}
			</ToolChildrenWrapper>
		);
	} else if (toolMessage.type === 'tool_request' || toolMessage.type === 'running_now') {
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
						{params.total_points && (
							<p className="text-xs text-void-accent mt-1">Total Points: {params.total_points}</p>
						)}
					</div>
				)}

				{showResults && quizResults && (
					<div className="mb-4 p-4 bg-gradient-to-r from-void-accent/10 to-void-bg-2/50 border border-void-accent/30 rounded-xl">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Trophy size={20} className="text-void-accent" />
								<span className="text-sm font-semibold text-void-fg-1">Your Score</span>
							</div>
							<div className="text-right">
								<div className="text-2xl font-bold text-void-accent">{quizResults.score}</div>
								<div className="text-xs text-void-fg-3">out of {quizResults.totalPoints} points</div>
							</div>
						</div>
						{quizResults.totalPoints > 0 && (
							<div className="mt-3 flex items-center justify-between text-xs text-void-fg-3">
								<span>Correct: {quizResults.results.filter(r => r.isCorrect).length} / {quizResults.results.length}</span>
								<span>{Math.round((quizResults.score / quizResults.totalPoints) * 100)}%</span>
							</div>
						)}
					</div>
				)}

				<div className="space-y-4">
					{params.questions.map((question, idx) => (
						<QuizQuestionItem
							key={question.id || idx}
							question={question}
							value={answers[question.id]}
							onChange={(value) => handleAnswerChange(question.id, value)}
							showResult={showResults}
							result={quizResults?.results.find(r => r.questionId === question.id)}
						/>
					))}
				</div>

				<div className="mt-4 pt-4 border-t border-void-border-2/50">
					<div className="flex items-center gap-2">
						{!showResults ? (
							<button
								onClick={handleSubmit}
								disabled={isSubmitting || Object.keys(answers).length < params.questions.length}
								className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none"
							>
								{isSubmitting ? (
									<div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
								) : (
									<Send size={14} />
								)}
								{isSubmitting ? 'Submitting...' : 'Submit Answers'}
							</button>
						) : (
							<button
								onClick={handleReset}
								className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all duration-200 border border-void-border-2"
							>
								<RotateCcw size={14} />
								Retake Quiz
							</button>
						)}
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
						<X size={14} className="text-void-fg-4 flex-shrink-0" />
						<span className="text-sm text-void-fg-3">
							Skipped
						</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
	}

	return <ToolHeaderWrapper {...componentParams} />;
};