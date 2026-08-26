/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, Lightbulb, Play, RefreshCw, ChevronDown, ChevronUp, Save, FileText } from 'lucide-react';
import { generateCodeBlockDecoration } from '../util/proceduralUtils.js';
import { useAccessor } from '../util/services.js';
import { BlockCode } from '../util/inputs.js';

export type ExerciseType = 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';

export interface InlineExerciseBlockProps {
	exerciseId: string;
	lessonId: string;
	type: ExerciseType;
	title?: string;
	instructions: string;
	initialCode: string;
	language?: string;
	expectedSolution?: string;
	onSubmit?: (studentCode: string) => Promise<{ isCorrect: boolean; feedback: string }>;
	onRequestHint?: () => Promise<string>;
	hints?: string[];
	threadId: string;
}

// Unified Code Exercise Renderer using Monaco
const CodeExerciseEditor: React.FC<{
	code: string;
	language?: string;
	onChange: (code: string) => void;
	onSubmit: () => void;
	onRequestHint: () => void;
	onReset: () => void;
	showHint: boolean;
	hintText: string;
	result: { isCorrect: boolean; feedback: string } | null;
	isSubmitting: boolean;
	runResult: { logs: string[]; error: string | null } | null;
	isRunning: boolean;
	onRun: () => void;
	placeholder?: string;
}> = ({ code, language = 'typescript', onChange, onSubmit, onRequestHint, onReset, showHint, hintText, result, isSubmitting, runResult, isRunning, onRun, placeholder }) => {

	// Custom simple editor for exercise inputs
	const accessor = useAccessor();
	const textAreaRef = useRef<HTMLTextAreaElement>(null);

	return (
		<div className="space-y-4">
			{result && (
				<div className={`p-3 rounded-lg animate-in slide-in-from-top-2 duration-200 ${result.isCorrect ? 'bg-void-success/10 border border-void-success/30' : 'bg-void-warning/10 border border-void-warning/30'}`}>
					<div className="flex items-center gap-2">
						{result.isCorrect ? <Check className="w-4 h-4 text-void-success" /> : <X className="w-4 h-4 text-void-warning" />}
						<span className={`text-sm ${result.isCorrect ? 'text-void-success' : 'text-void-warning'}`}>{result.feedback}</span>
					</div>
				</div>
			)}

			<div className="relative group">
				<div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					<span className="px-2 py-0.5 text-[10px] bg-void-bg-3/80 text-void-fg-3 rounded border border-void-border-2 uppercase tracking-tight">
						{language}
					</span>
				</div>
				<textarea
					ref={textAreaRef}
					value={code}
					onChange={(e) => onChange(e.target.value)}
					className="w-full min-h-[160px] p-4 rounded-xl bg-void-bg-1 border-void-border-2 border text-void-fg-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-void-accent/30 transition-all resize-y"
					placeholder={placeholder || "Write your solution here..."}
					spellCheck={false}
				/>
			</div>

			{runResult && (
				<pre className={`mt-3 p-3 rounded-xl text-xs font-mono whitespace-pre-wrap break-words ${runResult.error ? 'bg-void-error/10 border border-void-error/30 text-void-error' : 'bg-void-bg-1/50 border border-void-border-2 text-void-fg-2'}`}>
					{runResult.error ? ('[Error] ' + runResult.error + '\n') : ''}{runResult.logs.length ? runResult.logs.join('\n') : (runResult.error ? '' : '(no output)')}
				</pre>
			)}

			<div className="flex items-center justify-between gap-2">
				<div className="flex gap-2">
					<button
						onClick={onRun}
						disabled={isRunning}
						className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 text-void-fg-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isRunning ? (
							<RefreshCw className="w-4 h-4 animate-spin" />
						) : (
							<Play className="w-4 h-4 fill-current" />
						)}
						Run
					</button>
					<button
						onClick={onSubmit}
						disabled={isSubmitting}
						className="flex items-center gap-2 px-5 py-2 bg-void-accent hover:bg-void-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow_void-accent/20 active:scale-[0.98]"
					>
						{isSubmitting ? (
							<RefreshCw className="w-4 h-4 animate-spin" />
						) : (
							<Play className="w-4 h-4 fill-current" />
						)}
						Submit
					</button>
					<button
						onClick={onRequestHint}
						className="flex items-center gap-2 px-4 py-2 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 rounded-xl text-sm font-medium transition-all border border-void-border-2 hover:border-void-border-1"
					>
						<Lightbulb className="w-4 h-4 text-void-warning" />
						Hint
					</button>
				</div>
				<button
					onClick={onReset}
					className="flex items-center gap-2 px-3 py-2 text-void-fg-4 hover:text-void-fg-2 rounded-lg text-xs transition-colors"
					title="Reset code to initial state"
				>
					<RefreshCw className="w-3.5 h-3.5" />
					Reset
				</button>
			</div>

			{showHint && (
				<div className="p-4 bg-void-bg-2/50 border border-void-warning/20 rounded-xl animate-in fade-in zoom-in-95 duration-200">
					<div className="flex items-start gap-3">
						<div className="p-1.5 bg-void-warning/10 rounded-lg shrink-0">
							<Lightbulb className="w-4 h-4 text-void-warning" />
						</div>
						<span className="text-sm text-void-fg-2 leading-relaxed">{hintText}</span>
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
	language = 'typescript',
	expectedSolution,
	onSubmit,
	onRequestHint,
	hints,
	threadId,
}) => {
	const accessor = useAccessor();
	const [studentCode, setStudentCode] = useState(initialCode);
	const [result, setResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [runResult, setRunResult] = useState<{ logs: string[]; error: string | null } | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [showHint, setShowHint] = useState(false);
	const [hintText, setHintText] = useState('');
	const [hintLevel, setHintLevel] = useState(1);
	const [isExpanded, setIsExpanded] = useState(true);
	const [startTime] = useState(Date.now());

	const decoration = generateCodeBlockDecoration(exerciseId);

	// Run the student's code via the main-process QuickJS sandbox.
	// The sidebar webview CSP enforces Trusted Types Policy which blocks
	// new Function() / eval(), so we route through ToolsService.callTool.run_code()
	// which uses an IPC channel to execute in electron-main (no TTP issues).
	const handleRun = async () => {
		setIsRunning(true);
		setRunResult(null);
		try {
			const toolsService = accessor.get('IToolsService');
			const res = await toolsService.callTool.run_code({ code: studentCode, timeout: 5000 });
			// Result shape from QuickJS: { success, result?, error?, logs? }
			const r = (res.result as any) || {};
			if (!r.success) {
				setRunResult({ logs: [], error: r.error || 'Execution failed' });
			} else {
				// QuickJS captures console output in r.logs
				const logs = (r.logs as string[]) || [];
				setRunResult({ logs, error: null });
			}
		} catch (error) {
			setRunResult({ logs: [], error: String(error) });
		} finally {
			setIsRunning(false);
		}
	};

	const handleSubmit = async () => {
		setIsSubmitting(true);
		try {
			let feedbackResult: { isCorrect: boolean; feedback: string };

			if (onSubmit) {
				feedbackResult = await onSubmit(studentCode);
			} else if (expectedSolution) {
				// Normalize for comparison
				const cleanStudent = studentCode.replace(/\s+/g, ' ').trim();
				const cleanExpected = expectedSolution.replace(/\s+/g, ' ').trim();
				const isCorrect = cleanStudent === cleanExpected;

				feedbackResult = {
					isCorrect,
					feedback: isCorrect
						? 'Excellent! Your solution matches the expected outcome.'
						: 'Not quite right. Double check your logic or try a hint!',
				};
			} else {
				feedbackResult = {
					isCorrect: true,
					feedback: 'Solution submitted! Great work practicing.',
				};
			}

			setResult(feedbackResult);

			// Track in Service
			if (threadId && learningProgressService) {
				await learningProgressService.updateExerciseAttempt(threadId, exerciseId, {
					exerciseId,
					type,
					solved: feedbackResult.isCorrect,
					timeSpent: Math.floor((Date.now() - startTime) / 1000),
					lastAttemptTime: Date.now(),
					code: studentCode
				});

				// If solved, also update lesson progress
				if (feedbackResult.isCorrect) {
					await learningProgressService.updateLessonProgress(threadId, lessonId, {
						lastAccessed: Date.now()
					});
				}
			}
		} catch (error) {
			console.error('Error submitting exercise:', error);
			setResult({
				isCorrect: false,
				feedback: 'Submission failed. Please try again.',
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
				const providedHints = hints && hints.length > 0 ? hints : null;
				const defaultHints: string[] = providedHints ?? [
					'Take a close look at the requirements in the instructions.',
					'Think about the core concept being practiced here.',
					'Check the syntax - sometimes a small typo is the culprit.',
					'Consider the standard pattern for this problem type.',
				];
				hint = defaultHints[Math.min(hintLevel - 1, defaultHints.length - 1)];
			}

			setHintText(hint);
			setShowHint(true);
			setHintLevel(prev => prev + 1);

			if (threadId && learningProgressService) {
				await learningProgressService.addHintUsage(threadId, {
					exerciseId,
					hintLevel: hintLevel,
					timestamp: Date.now()
				});
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
		fix_bug: 'Debug the Code',
		write_function: 'Implementation Task',
		extend_code: 'Feature Extension',
	};

	const typeIcons: Record<ExerciseType, React.ReactNode> = {
		fill_blank: <span className="text-xl">{"\u{270F}\u{FE0F}"}</span>,
		fix_bug: <span className="text-xl">{"\u{1F41B}"}</span>,
		write_function: <span className="text-xl">{"\u{2699}\u{FE0F}"}</span>,
		extend_code: <span className="text-xl">{"\u{1F527}"}</span>,
	};

	return (
		<div
			className={`inline-exercise-block rounded-2xl border-2 overflow-hidden transition-all duration-300 ${decoration.showGlow ? 'ring-1 ring-void-accent/25 shadow-lg' : 'shadow-lg'}`}
			style={{
				borderColor: result?.isCorrect ? 'rgba(34, 197, 94, 0.3)' : 'var(--void-border-1)',
				borderStyle: 'solid',
				borderWidth: '1px',
			}}
		>
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className={`w-full px-5 py-4 flex items-center justify-between transition-colors ${isExpanded ? 'bg-void-bg-2' : 'bg-void-bg-1 hover:bg-void-bg-2'}`}
			>
				<div className="flex items-center gap-4">
					<div className={`p-2 rounded-xl ${result?.isCorrect ? 'bg-void-success/20' : 'bg-void-bg-3'}`}>
						{result?.isCorrect ? <Check className="w-5 h-5 text-void-success" /> : typeIcons[type]}
					</div>
					<div className="text-left">
						<div className="flex items-center gap-2">
							<h3 className="text-[13px] font-bold text-void-fg-1 uppercase tracking-wider">
								{title || typeLabels[type]}
							</h3>
							{result?.isCorrect && (
								<span className="px-2 py-0.5 bg-void-success/10 text-void-success text-[10px] font-bold rounded-full border border-void-success/20">
									COMPLETED
								</span>
							)}
						</div>
						<p className="text-xs text-void-fg-3 mt-0.5">Interactive Challenge</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<div className="h-8 w-px bg-void-border-2" />
					{isExpanded ? <ChevronUp className="w-5 h-5 text-void-fg-4" /> : <ChevronDown className="w-5 h-5 text-void-fg-4" />}
				</div>
			</button>

			{/* Content */}
			{isExpanded && (
				<div className="p-6 space-y-5 bg-void-bg-2/30">
					{instructions && (
						<div className="p-4 bg-void-bg-1/50 rounded-xl border border-void-border-2 shadow-inner">
							<h4 className="text-xs font-bold text-void-fg-3 uppercase tracking-widest mb-2 flex items-center gap-2">
								<FileText size={12} />
								Instructions
							</h4>
							<p className="text-[13px] text-void-fg-2 leading-relaxed">{instructions}</p>
						</div>
					)}

					<CodeExerciseEditor
						code={studentCode}
						language={language}
						onChange={setStudentCode}
						onSubmit={handleSubmit}
						onRun={handleRun}
						isRunning={isRunning}
						runResult={runResult}
						onRequestHint={handleRequestHint}
						onReset={handleReset}
						showHint={showHint}
						hintText={hintText}
						result={result}
						isSubmitting={isSubmitting}
						placeholder={type === 'fill_blank' ? "Fill in the blanks..." : undefined}
					/>
				</div>
			)}
		</div>
	);
};

export default InlineExerciseBlock;
