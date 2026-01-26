/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Lightbulb, Play, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useLessonTheme, withLessonTheme } from '../util/LessonThemeProvider.js';
import { generateCodeBlockDecoration } from '../util/proceduralUtils.js';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';

export type ExerciseType = 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';

export interface InlineExerciseBlockProps {
	exerciseId: string;
	lessonId: string;
	type: ExerciseType;
	title?: string;
	instructions: string;
	initialCode: string;
	expectedSolution?: string;
	onSubmit?: (studentCode: string) => Promise<{ isCorrect: boolean; feedback: string }>;
	onRequestHint?: () => Promise<string>;
	threadId?: string;
}

// Fill-in-the-blank exercise component
const FillBlankExercise: React.FC<{
	code: string;
	onChange: (code: string) => void;
	onSubmit: () => void;
	onRequestHint: () => void;
	onReset: () => void;
	showHint: boolean;
	hintText: string;
	result: { isCorrect: boolean; feedback: string } | null;
	isSubmitting: boolean;
}> = ({ code, onChange, onSubmit, onRequestHint, onReset, showHint, hintText, result, isSubmitting }) => {
	const [blanks, setBlanks] = useState<Set<number>>(new Set());

	// Parse code for blanks (marked with ___)
	useEffect(() => {
		const blankIndices = new Set<number>();
		let match;
		const regex = /_{3,}/g;
		while ((match = regex.exec(code)) !== null) {
			blankIndices.add(match.index);
		}
		setBlanks(blankIndices);
	}, [code]);

	const handleBlankChange = (index: number, value: string) => {
		let pos = 0;
		let blankCount = 0;
		const parts: string[] = [];
		const regex = /_{3,}/g;
		let match;

		while ((match = regex.exec(code)) !== null) {
			parts.push(code.slice(pos, match.index));
			if (blankCount === index) {
				parts.push(value);
			} else {
				parts.push(match[0]);
			}
			pos = match.index + match[0].length;
			blankCount++;
		}
		parts.push(code.slice(pos));

		onChange(parts.join(''));
	};

	return (
		<div className="exercise-fill-blank space-y-4">
			{result && (
				<div className={`p-3 rounded-lg ${result.isCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
					<div className="flex items-center gap-2">
						{result.isCorrect ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-amber-500" />}
						<span className="text-sm">{result.feedback}</span>
					</div>
				</div>
			)}
			<textarea
				value={code}
				onChange={(e) => onChange(e.target.value)}
				className="w-full min-h-[120px] p-4 rounded-lg bg-void-bg-2 border-void-border-2 border text-void-fg-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-void-accent/50"
				placeholder="Fill in the blanks marked with ___"
			/>
			<div className="flex gap-2">
				<button
					onClick={onSubmit}
					disabled={isSubmitting}
					className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
				>
					{isSubmitting ? (
						<RefreshCw className="w-4 h-4 animate-spin" />
					) : (
						<Check className="w-4 h-4" />
					)}
					Check Answer
				</button>
				<button
					onClick={onRequestHint}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<Lightbulb className="w-4 h-4" />
					Hint
				</button>
				<button
					onClick={onReset}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<RefreshCw className="w-4 h-4" />
					Reset
				</button>
			</div>
			{showHint && (
				<div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
					<div className="flex items-start gap-2">
						<Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-fg-2">{hintText}</span>
					</div>
				</div>
			)}
		</div>
	);
};

// Fix bug exercise component
const FixBugExercise: React.FC<{
	code: string;
	onChange: (code: string) => void;
	onSubmit: () => void;
	onRequestHint: () => void;
	onReset: () => void;
	showHint: boolean;
	hintText: string;
	result: { isCorrect: boolean; feedback: string } | null;
	isSubmitting: boolean;
}> = ({ code, onChange, onSubmit, onRequestHint, onReset, showHint, hintText, result, isSubmitting }) => {
	return (
		<div className="exercise-fix-bug space-y-4">
			{result && (
				<div className={`p-3 rounded-lg ${result.isCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
					<div className="flex items-center gap-2">
						{result.isCorrect ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-amber-500" />}
						<span className="text-sm">{result.feedback}</span>
					</div>
				</div>
			)}
			<textarea
				value={code}
				onChange={(e) => onChange(e.target.value)}
				className="w-full min-h-[120px] p-4 rounded-lg bg-void-bg-2 border-void-border-2 border text-void-fg-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-void-accent/50"
				placeholder="Fix the bugs in the code above"
			/>
			<div className="flex gap-2">
				<button
					onClick={onSubmit}
					disabled={isSubmitting}
					className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
				>
					{isSubmitting ? (
						<RefreshCw className="w-4 h-4 animate-spin" />
					) : (
						<Check className="w-4 h-4" />
					)}
					Check Answer
				</button>
				<button
					onClick={onRequestHint}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<Lightbulb className="w-4 h-4" />
					Hint
				</button>
				<button
					onClick={onReset}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<RefreshCw className="w-4 h-4" />
					Reset
				</button>
			</div>
			{showHint && (
				<div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
					<div className="flex items-start gap-2">
						<Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-fg-2">{hintText}</span>
					</div>
				</div>
			)}
		</div>
	);
};

// Write function exercise component
const WriteFunctionExercise: React.FC<{
	code: string;
	onChange: (code: string) => void;
	onSubmit: () => void;
	onRequestHint: () => void;
	onReset: () => void;
	showHint: boolean;
	hintText: string;
	result: { isCorrect: boolean; feedback: string } | null;
	isSubmitting: boolean;
}> = ({ code, onChange, onSubmit, onRequestHint, onReset, showHint, hintText, result, isSubmitting }) => {
	return (
		<div className="exercise-write-function space-y-4">
			{result && (
				<div className={`p-3 rounded-lg ${result.isCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
					<div className="flex items-center gap-2">
						{result.isCorrect ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-amber-500" />}
						<span className="text-sm">{result.feedback}</span>
					</div>
				</div>
			)}
			<textarea
				value={code}
				onChange={(e) => onChange(e.target.value)}
				className="w-full min-h-[120px] p-4 rounded-lg bg-void-bg-2 border-void-border-2 border text-void-fg-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-void-accent/50"
				placeholder="Write your function implementation here..."
			/>
			<div className="flex gap-2">
				<button
					onClick={onSubmit}
					disabled={isSubmitting}
					className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
				>
					{isSubmitting ? (
						<RefreshCw className="w-4 h-4 animate-spin" />
					) : (
						<Check className="w-4 h-4" />
					)}
					Check Answer
				</button>
				<button
					onClick={onRequestHint}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<Lightbulb className="w-4 h-4" />
					Hint
				</button>
				<button
					onClick={onReset}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<RefreshCw className="w-4 h-4" />
					Reset
				</button>
			</div>
			{showHint && (
				<div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
					<div className="flex items-start gap-2">
						<Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-fg-2">{hintText}</span>
					</div>
				</div>
			)}
		</div>
	);
};

// Extend code exercise component
const ExtendCodeExercise: React.FC<{
	code: string;
	onChange: (code: string) => void;
	onSubmit: () => void;
	onRequestHint: () => void;
	onReset: () => void;
	showHint: boolean;
	hintText: string;
	result: { isCorrect: boolean; feedback: string } | null;
	isSubmitting: boolean;
}> = ({ code, onChange, onSubmit, onRequestHint, onReset, showHint, hintText, result, isSubmitting }) => {
	return (
		<div className="exercise-extend-code space-y-4">
			{result && (
				<div className={`p-3 rounded-lg ${result.isCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
					<div className="flex items-center gap-2">
						{result.isCorrect ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-amber-500" />}
						<span className="text-sm">{result.feedback}</span>
					</div>
				</div>
			)}
			<textarea
				value={code}
				onChange={(e) => onChange(e.target.value)}
				className="w-full min-h-[120px] p-4 rounded-lg bg-void-bg-2 border-void-border-2 border text-void-fg-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-void-accent/50"
				placeholder="Extend the code with the new functionality..."
			/>
			<div className="flex gap-2">
				<button
					onClick={onSubmit}
					disabled={isSubmitting}
					className="flex items-center gap-2 px-4 py-2 bg-void-accent hover:bg-void-accent-hover disabled:bg-void-fg-4 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
				>
					{isSubmitting ? (
						<RefreshCw className="w-4 h-4 animate-spin" />
					) : (
						<Check className="w-4 h-4" />
					)}
					Check Answer
				</button>
				<button
					onClick={onRequestHint}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<Lightbulb className="w-4 h-4" />
					Hint
				</button>
				<button
					onClick={onReset}
					className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 rounded-lg text-sm font-medium transition-all border border-void-border-2"
				>
					<RefreshCw className="w-4 h-4" />
					Reset
				</button>
			</div>
			{showHint && (
				<div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
					<div className="flex items-start gap-2">
						<Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-fg-2">{hintText}</span>
					</div>
				</div>
			)}
		</div>
	);
};

// Main InlineExerciseBlock component
export const InlineExerciseBlock: React.FC<InlineExerciseBlockProps> = ({
	exerciseId,
	lessonId,
	type,
	title,
	instructions,
	initialCode,
	expectedSolution,
	onSubmit,
	onRequestHint,
	threadId,
}) => {
	const { theme } = useLessonTheme();
	const [studentCode, setStudentCode] = useState(initialCode);
	const [result, setResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showHint, setShowHint] = useState(false);
	const [hintText, setHintText] = useState('');
	const [hintLevel, setHintLevel] = useState(1);
	const [isExpanded, setIsExpanded] = useState(true);

	const decoration = generateCodeBlockDecoration(exerciseId);

	// Track exercise attempt
	useEffect(() => {
		// In a real implementation, this would update the learning progress service
		console.log(`Exercise ${exerciseId} opened in lesson ${lessonId}`);
	}, [exerciseId, lessonId]);

	const handleSubmit = async () => {
		setIsSubmitting(true);
		try {
			let feedbackResult: { isCorrect: boolean; feedback: string };

			if (onSubmit) {
				feedbackResult = await onSubmit(studentCode);
			} else if (expectedSolution) {
				// Simple comparison for demo purposes
				const isCorrect = studentCode.trim() === expectedSolution.trim();
				feedbackResult = {
					isCorrect,
					feedback: isCorrect
						? 'Great job! Your solution is correct.'
						: 'Not quite. Check your solution and try again, or ask for a hint.',
				};
			} else {
				// Default response when no validation provided
				feedbackResult = {
					isCorrect: true,
					feedback: 'Your solution has been submitted for review.',
				};
			}

			setResult(feedbackResult);

			// Track the attempt
			if (threadId) {
				// In a real implementation, update learning progress
				console.log(`Exercise attempt recorded: ${exerciseId}`, feedbackResult);
			}
		} catch (error) {
			console.error('Error submitting exercise:', error);
			setResult({
				isCorrect: false,
				feedback: 'An error occurred while checking your answer. Please try again.',
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRequestHint = async () => {
		try {
			let hint = '';

			if (onRequestHint) {
				hint = await onRequestHint();
			} else {
				// Default progressive hints
				const defaultHints: string[] = [
					'Think about what data structure or method would be most appropriate for this problem.',
					'Consider the core concept being practiced here. What approach typically works best?',
					'The solution involves using a specific pattern or method. Review the lesson material.',
					'Here\'s the solution approach: [Would show full solution in a real implementation]',
				];

				hint = defaultHints[Math.min(hintLevel - 1, defaultHints.length - 1)];
			}

			setHintText(hint);
			setShowHint(true);
			setHintLevel(hintLevel + 1);

			// Track hint usage
			if (threadId) {
				console.log(`Hint ${hintLevel} requested for exercise: ${exerciseId}`);
			}
		} catch (error) {
			console.error('Error getting hint:', error);
		}
	};

	const handleReset = () => {
		setStudentCode(initialCode);
		setResult(null);
		setShowHint(false);
		setHintText('');
		setHintLevel(1);
	};

	const typeLabels: Record<ExerciseType, string> = {
		fill_blank: 'Fill in the Blanks',
		fix_bug: 'Fix the Bug',
		write_function: 'Write a Function',
		extend_code: 'Extend the Code',
	};

	const typeIcons: Record<ExerciseType, React.ReactNode> = {
		fill_blank: <span className="text-xl">✏️</span>,
		fix_bug: <span className="text-xl">🐛</span>,
		write_function: <span className="text-xl">⚙️</span>,
		extend_code: <span className="text-xl">🔧</span>,
	};

	return (
		<div
			className={`inline-exercise-block rounded-xl border-2 overflow-hidden transition-all duration-300 ${decoration.showGlow ? 'shadow-lg' : 'shadow-md'}`}
			style={{
				borderColor: theme.colors.border,
				borderStyle: decoration.borderStyle,
				borderWidth: decoration.borderWidth,
				borderRadius: decoration.cornerStyle === 'pill' ? '9999px' : decoration.cornerStyle === 'sharp' ? '0' : '12px',
				boxShadow: decoration.showGlow ? decoration.glowColor : undefined,
			}}
		>
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center justify-between bg-void-bg-2 hover:bg-void-bg-3 transition-colors"
			>
				<div className="flex items-center gap-3">
					{typeIcons[type]}
					<div className="text-left">
						<h3 className="text-sm font-semibold text-void-fg-1">
							{title || typeLabels[type]}
						</h3>
						{instructions && (
							<p className="text-xs text-void-fg-3 mt-0.5 line-clamp-1">{instructions}</p>
						)}
					</div>
				</div>
				{isExpanded ? <ChevronUp className="w-4 h-4 text-void-fg-3" /> : <ChevronDown className="w-4 h-4 text-void-fg-3" />}
			</button>

			{/* Content */}
			{isExpanded && (
				<div className="p-4 space-y-4">
					{instructions && (
						<div className="p-3 bg-void-bg-2/50 rounded-lg border border-void-border-2">
							<p className="text-sm text-void-fg-2">{instructions}</p>
						</div>
					)}

					{type === 'fill_blank' && (
						<FillBlankExercise
							code={studentCode}
							onChange={setStudentCode}
							onSubmit={handleSubmit}
							onRequestHint={handleRequestHint}
							onReset={handleReset}
							showHint={showHint}
							hintText={hintText}
							result={result}
							isSubmitting={isSubmitting}
						/>
					)}

					{type === 'fix_bug' && (
						<FixBugExercise
							code={studentCode}
							onChange={setStudentCode}
							onSubmit={handleSubmit}
							onRequestHint={handleRequestHint}
							onReset={handleReset}
							showHint={showHint}
							hintText={hintText}
							result={result}
							isSubmitting={isSubmitting}
						/>
					)}

					{type === 'write_function' && (
						<WriteFunctionExercise
							code={studentCode}
							onChange={setStudentCode}
							onSubmit={handleSubmit}
							onRequestHint={handleRequestHint}
							onReset={handleReset}
							showHint={showHint}
							hintText={hintText}
							result={result}
							isSubmitting={isSubmitting}
						/>
					)}

					{type === 'extend_code' && (
						<ExtendCodeExercise
							code={studentCode}
							onChange={setStudentCode}
							onSubmit={handleSubmit}
							onRequestHint={handleRequestHint}
							onReset={handleReset}
							showHint={showHint}
							hintText={hintText}
							result={result}
							isSubmitting={isSubmitting}
						/>
					)}
				</div>
			)}
		</div>
	);
};

export default InlineExerciseBlock;