/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BookOpen, Trophy, Target, Flame, Settings, Share, Bookmark, Star, ChevronDown, ChevronUp, Menu, X } from 'lucide-react';
import '../styles.css';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { useAccessor, useIsDark } from '../util/services.js';
import { LessonThemeProvider, useLessonTheme } from '../util/LessonThemeProvider.js';
import { ProgressTracker, SectionCompletionTracker, MiniProgressBar, ScoreCard } from '../learning-tsx/ProgressTracker.js';
import { CollapsibleLessonSection, ProgressSection, TableOfContents } from '../learning-tsx/CollapsibleLessonSection.js';
import { InlineExerciseBlock } from '../learning-tsx/InlineExerciseBlock.js';
import { HintSystem, InlineHintButton } from '../learning-tsx/HintSystem.js';
import { CelebrationEffect, CelebrationType, useCelebration } from '../learning-tsx/CelebrationEffect.js';

// Re-export original types
export type { VoidPreviewProps } from './VoidPreview.js';

export interface EnhancedVoidPreviewProps extends VoidPreviewProps {
	isLesson?: boolean;
	lessonId?: string;
	lessonTopic?: string;
	onSectionToggle?: (sectionId: string, isExpanded: boolean) => void;
	onSectionComplete?: (sectionId: string) => void;
	onBookmarkToggle?: (lessonId: string, sectionId: string) => void;
	onNoteAdd?: (lessonId: string, sectionId: string, note: string) => void;
	exercises?: Array<{
		id: string;
		type: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';
		title?: string;
		instructions: string;
		initialCode: string;
		expectedSolution?: string;
	}>;
	sections?: Array<{
		id: string;
		title: string;
		content: string;
		exerciseIds?: string[];
	}>;
}

// Lesson state tracking
interface LessonState {
	sections: Record<string, { completed: boolean; expanded: boolean; read: boolean; bookmarked: boolean }>;
	exercises: Record<string, { attempts: number; solved: boolean; hintsUsed: number }>;
	timeSpent: number;
	startTime: number;
	showProgress: boolean;
	showSidebar: boolean;
	activeSection: string | null;
}

// Parse content into sections
function parseContentIntoSections(content: string, exerciseIds: string[] = []): Array<{ id: string; title: string; content: string }> {
	const sections: Array<{ id: string; title: string; content: string }> = [];
	const sectionRegex = /#{3,}\s+(.+?)\n/g;
	let lastIndex = 0;
	let match;
	let sectionIndex = 0;

	while ((match = sectionRegex.exec(content)) !== null) {
		if (lastIndex < match.index) {
			sections.push({
				id: `section-${sectionIndex++}`,
				title: 'Introduction',
				content: content.slice(lastIndex, match.index),
			});
		}

		sections.push({
			id: `section-${sectionIndex++}`,
			title: match[1].trim(),
			content: '',
		});

		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < content.length) {
		sections.push({
			id: `section-${sectionIndex}`,
			title: 'Summary',
			content: content.slice(lastIndex),
		});
	}

	return sections;
}

// Component for displaying inline exercises in markdown
const InlineExerciseRenderer: React.FC<{
	exercise: EnhancedVoidPreviewProps['exercises'][0];
	threadId?: string;
	lessonId: string;
	onSubmit?: (studentCode: string) => Promise<{ isCorrect: boolean; feedback: string }>;
	onRequestHint?: () => Promise<string>;
	onComplete?: () => void;
}> = ({ exercise, threadId, lessonId, onSubmit, onRequestHint, onComplete }) => {
	const { trigger: triggerCelebration } = useCelebration();

	const handleSubmit = async (studentCode: string) => {
		const result = await onSubmit?.(studentCode);
		if (result?.isCorrect) {
			triggerCelebration('confetti', 1500, 'medium');
			onComplete?.();
		}
		return result;
	};

	return (
		<InlineExerciseBlock
			exerciseId={exercise.id}
			lessonId={lessonId}
			type={exercise.type}
			title={exercise.title}
			instructions={exercise.instructions}
			initialCode={exercise.initialCode}
			expectedSolution={exercise.expectedSolution}
			onSubmit={handleSubmit}
			onRequestHint={onRequestHint}
			threadId={threadId}
		/>
	);
};

// Learning Dashboard Component
const LearningDashboard: React.FC<{
	progress: LessonState;
	stats: any;
	onClose: () => void;
}> = ({ progress, stats, onClose }) => {
	const { theme, getColor } = useLessonTheme();

	return (
		<div
			className="learning-dashboard fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
			onClick={onClose}
		>
			<div
				className="bg-void-bg-1 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden"
				style={{ border: `1px solid ${theme.colors.border}` }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="px-6 py-4 border-b border-void-border-2 flex items-center justify-between" style={{ backgroundColor: theme.colors.bg }}>
					<div className="flex items-center gap-2">
						<Trophy size={20} style={{ color: getColor('accent') }} />
						<h2 className="text-lg font-semibold" style={{ color: getColor('text') }}>
							Learning Dashboard
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
					>
						<X size={20} style={{ color: getColor('text-muted') }} />
					</button>
				</div>

				{/* Content */}
				<div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
					{/* Streak */}
					<div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: `${theme.colors.accent}10`, border: `1px solid ${theme.colors.accent}30` }}>
						<div className="p-3 rounded-full" style={{ backgroundColor: `${theme.colors.accent}20` }}>
							<Flame size={24} style={{ color: getColor('accent') }} />
						</div>
						<div>
							<div className="text-xs" style={{ color: getColor('text-muted') }}>Learning Streak</div>
							<div className="text-2xl font-bold" style={{ color: getColor('accent') }}>
								{stats?.streak || 3} days
							</div>
						</div>
					</div>

					{/* Stats Grid */}
					<div className="grid grid-cols-2 gap-4">
						<div className="p-4 rounded-lg bg-void-bg-2">
							<div className="text-xs mb-1" style={{ color: getColor('text-muted') }}>Lessons</div>
							<div className="text-2xl font-bold" style={{ color: getColor('text') }}>
								{stats?.lessonsCompleted || 2}
							</div>
						</div>
						<div className="p-4 rounded-lg bg-void-bg-2">
							<div className="text-xs mb-1" style={{ color: getColor('text-muted') }}>Exercises</div>
							<div className="text-2xl font-bold" style={{ color: getColor('text') }}>
								{stats?.exercisesSolved || 5}
							</div>
						</div>
					</div>

					{/* Recent Progress */}
					<div>
						<h3 className="text-sm font-semibold mb-3" style={{ color: getColor('text') }}>
							Recent Progress
						</h3>
						<div className="space-y-2">
							{['Loops', 'Arrays', 'Functions'].map((lesson) => (
								<div key={lesson} className="flex items-center gap-3 p-3 rounded-lg bg-void-bg-2">
									<BookOpen size={16} style={{ color: getColor('text-muted') }} />
									<span className="flex-1 text-sm" style={{ color: getColor('text') }}>{lesson}</span>
									<Star size={14} style={{ color: getColor('accent') }} />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

// Main EnhancedVoidPreview Component
export const EnhancedVoidPreview: React.FC<EnhancedVoidPreviewProps> = ({
	title,
	content,
	isImplementationPlan,
	isWalkthrough,
	planId,
	threadId,
	isLesson = false,
	lessonId,
	lessonTopic,
	onSectionToggle,
	onSectionComplete,
	onBookmarkToggle,
	onNoteAdd,
	exercises = [],
	sections: providedSections,
}) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');
	const voidSettingsService = accessor.get('IVoidSettingsService');

	// Action button state
	const [isApproving, setIsApproving] = useState(false);

	// Lesson theme and progress state
	const [lessonState, setLessonState] = useState<LessonState>({
		sections: {},
		exercises: {},
		timeSpent: 0,
		startTime: Date.now(),
		showProgress: true,
		showSidebar: false,
		activeSection: null,
	});

	const [showDashboard, setShowDashboard] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const timerRef = useRef<NodeJS.Timeout>();

	// Parse content into sections if not provided
	const parsedSections = providedSections || parseContentIntoSections(content, exercises.map(e => e.id));

	// Time tracking
	useEffect(() => {
		if (!isLesson) return;

		timerRef.current = setInterval(() => {
			setLessonState(prev => ({
				...prev,
				timeSpent: Math.floor((Date.now() - prev.startTime) / 1000),
			}));
		}, 1000);

		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [isLesson]);

	// Initialize section states
	useEffect(() => {
		if (!isLesson) return;

		setLessonState(prev => {
			const newSections = { ...prev.sections };
			parsedSections.forEach(section => {
				if (!newSections[section.id]) {
					newSections[section.id] = {
						completed: false,
						expanded: section.id === 'section-0', // Expand first section by default
						read: false,
						bookmarked: false,
					};
				}
			});

			return { ...prev, sections: newSections };
		});
	}, [isLesson, parsedSections]);

	// Handle section toggle
	const handleSectionToggle = useCallback((sectionId: string, isExpanded: boolean) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: {
					...prev.sections[sectionId],
					expanded: isExpanded,
					read: isExpanded ? true : prev.sections[sectionId].read,
				},
			},
		}));
		onSectionToggle?.(sectionId, isExpanded);
	}, [onSectionToggle]);

	// Handle section complete
	const handleSectionComplete = useCallback((sectionId: string) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: {
					...prev.sections[sectionId],
					completed: !prev.sections[sectionId].completed,
				},
			},
		}));
		onSectionComplete?.(sectionId);

		// Trigger celebration if all sections completed
		const allCompleted = parsedSections.every(s => s.id === sectionId || prev.sections[s.id]?.completed);
		if (allCompleted) {
			// Would trigger celebration here
		}
	}, [parsedSections, onSectionComplete]);

	// Handle bookmark toggle
	const handleBookmarkToggle = useCallback((sectionId: string) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: {
					...prev.sections[sectionId],
					bookmarked: !prev.sections[sectionId].bookmarked,
				},
			},
		}));
		onBookmarkToggle?.(lessonId || '', sectionId);
	}, [lessonId, onBookmarkToggle]);

	// Calculate progress
	const progress = useMemo(() => {
		const completedCount = Object.values(lessonState.sections).filter(s => s.completed).length;
		const totalCount = parsedSections.length;
		return totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
	}, [lessonState.sections, parsedSections]);

	const sectionList = parsedSections.map(section => ({
		id: section.id,
		title: section.title,
		isCompleted: lessonState.sections[section.id]?.completed || false,
		isExpanded: lessonState.sections[section.id]?.expanded || false,
	}));

	// Format time
	const formatTime = (seconds: number): string => {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	};

	// Get section icon
	const getSectionIcon = (sectionId: string): React.ReactNode => {
		if (lessonState.sections[sectionId]?.completed) return <Trophy size={16} />;
		return <BookOpen size={16} />;
	};

	// ============================================
	// Action Handlers (Approve/Reject/Request Changes)
	// ============================================

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
1. First, use the \`create_plan\` tool to create a task plan based on the approved implementation plan steps
2. Then execute each task in order, using \`update_task_status\` to track progress
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

	// Show action buttons for implementation plans and walkthroughs
	const showActions = (isImplementationPlan || isWalkthrough) && planId && threadId;

	return (
		<LessonThemeProvider
			lessonId={lessonId || title}
			topic={lessonTopic}
		>
			<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
				{showDashboard && (
					<LearningDashboard
						progress={lessonState}
						stats={{ streak: 3, lessonsCompleted: 2, exercisesSolved: 5 }}
						onClose={() => setShowDashboard(false)}
					/>
				)}

				<div className="void-preview-container h-full flex flex-col bg-void-bg-3 text-void-fg-1 overflow-hidden font-sans">

					{/* Top Header */}
					<header className="px-6 py-4 flex-shrink-0 flex items-center justify-between border-b border-void-border-2 bg-void-bg-2/50 backdrop-blur-md z-20">
						<div className="flex items-center gap-3 overflow-hidden">
							<div className="flex-shrink-0 w-8 h-8 rounded-lg bg-void-accent/10 flex items-center justify-center border border-void-accent/20">
								<BookOpen className="w-5 h-5 text-void-accent" />
							</div>
							<div className="flex flex-col min-w-0">
								<h1 className="text-sm font-semibold text-void-fg-1 truncate tracking-tight">{title}</h1>
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-void-fg-4 font-medium uppercase tracking-wider opacity-60">
										{isImplementationPlan ? 'Implementation Plan' : isWalkthrough ? 'Code Walkthrough' : 'Lesson'}
									</span>
									{lessonState.showProgress && isLesson && (
										<>
											<span className="text-[10px] text-void-fg-4 opacity-30">•</span>
											<span className="text-[10px] text-void-fg-4 opacity-60">
												{Math.round(progress)}% Complete
											</span>
										</>
									)}
									{isLesson && (
										<>
											<span className="text-[10px] text-void-fg-4 opacity-30">•</span>
											<span className="text-[10px] text-void-fg-4 opacity-60">
												{formatTime(lessonState.timeSpent)}
											</span>
										</>
									)}
								</div>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{isLesson && (
								<>
									<button
										onClick={() => setShowDashboard(true)}
										className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
										title="Learning Dashboard"
									>
										<Trophy size={18} style={{ color: 'var(--lesson-accent, #007acc)' }} />
									</button>
									<button
										onClick={() => setLessonState(prev => ({ ...prev, showSidebar: !prev.showSidebar }))}
										className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
										title="Table of Contents"
									>
										{lessonState.showSidebar ? <X size={18} /> : <Menu size={18} />}
									</button>
								</>
							)}
							<button
								onClick={() => setShowMenu(!showMenu)}
								className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
							>
								<Settings size={18} />
							</button>
						</div>
					</header>

					{/* Main Content Area */}
					<div className="flex-1 overflow-hidden relative z-10 flex">
						{/* Sidebar (Table of Contents) */}
						{lessonState.showSidebar && isLesson && (
							<div className="w-64 border-r border-void-border-2 bg-void-bg-2/50 overflow-y-auto custom-scrollbar">
								<div className="p-4 space-y-4">
									<ProgressTracker
										lessonId={lessonId || title}
										threadId={threadId}
										showDetailed={true}
										showStreak={true}
										showBadges={false}
									/>
									<TableOfContents
										sections={sectionList}
										onSectionClick={(sectionId) => {
											handleSectionToggle(sectionId, true);
											const element = document.getElementById(sectionId);
											if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}}
									/>
								</div>
							</div>
						)}

						{/* Scroll Area */}
						<div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center">
							{/* Main Content */}
							<main className="w-full max-w-4xl mx-auto px-6 py-8 md:px-12 space-y-6">
								{/* Progress Section */}
								{isLesson && lessonState.showProgress && (
									<ProgressSection
										totalSections={parsedSections.length}
										completedSections={Object.values(lessonState.sections).filter(s => s.completed).length}
										estimatedTime="10 min"
										onJumpToSection={(sectionId) => {
											handleSectionToggle(sectionId, true);
											const element = document.getElementById(sectionId);
											if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}}
									/>
								)}

								{/* Lesson Badge */}
								{isLesson && (
									<div className="mb-4 flex justify-center">
										<span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
											style={{
												backgroundColor: 'var(--lesson-accent, #007acc)20',
												color: 'var(--lesson-accent, #007acc)',
												border: '1px solid var(--lesson-accent, #007acc)30',
											}}
										>
											Lesson
										</span>
									</div>
								)}

								{/* Render Sections */}
								{parsedSections.map((section, idx) => (
									<CollapsibleLessonSection
										key={section.id}
										id={section.id}
										lessonId={lessonId || title}
										title={section.title}
										icon={getSectionIcon(section.id)}
										defaultExpanded={idx === 0}
										onToggle={handleSectionToggle}
										onMarkComplete={handleSectionComplete}
										isCompleted={lessonState.sections[section.id]?.completed}
										isBookmarked={lessonState.sections[section.id]?.bookmarked}
										onToggleBookmark={handleBookmarkToggle}
										order={idx + 1}
									>
										<div className="prose prose-invert max-w-none"
											style={{ color: 'var(--lesson-text, #e0e0e0)' }}
										>
											<ChatMarkdownRender
												string={section.content}
												chatMessageLocation={undefined}
												isApplyEnabled={false}
												isLinkDetectionEnabled={true}
											/>
										</div>

										{/* Render exercises for this section */}
										{section.exerciseIds?.map(exerciseId => {
											const exercise = exercises.find(e => e.id === exerciseId);
											if (!exercise) return null;

											return (
												<div key={exercise.id} className="mt-6">
													<InlineExerciseRenderer
														exercise={exercise}
														threadId={threadId}
														lessonId={lessonId || title}
														onComplete={() => {
															// Mark section as progress when exercise solved
														}}
													/>
												</div>
											);
										})}
									</CollapsibleLessonSection>
								))}

								{/* Bottom Spacing */}
								<div className="h-32" />
							</main>
						</div>
					</div>

					{/* Celebration Effect Container */}
					<div id="celebration-container" className="fixed inset-0 pointer-events-none z-50" />

					{/* Floating Action Bar - for Implementation Plans and Walkthroughs */}
					{showActions && (
						<div className="absolute bottom-8 left-0 right-0 flex justify-center z-40 pointer-events-none px-4">
							<div className="bg-void-bg-2/90 backdrop-blur-xl border border-void-border-1 rounded-2xl p-2 shadow-2xl shadow-black/40 flex items-center gap-2 pointer-events-auto ring-1 ring-white/10">
								<button
									onClick={handleReject}
									className="px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-2 group"
								>
									<div className="w-5 h-5 rounded-md bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
										<X size={14} />
									</div>
									Reject
								</button>

								<div className="w-px h-6 bg-void-border-2 mx-1" />

								<button
									onClick={handleRequestChanges}
									className="px-4 py-2.5 text-xs font-semibold text-void-fg-2 hover:bg-void-bg-4 rounded-xl transition-all flex items-center gap-2 group"
								>
									<div className="w-5 h-5 rounded-md bg-void-bg-4 flex items-center justify-center group-hover:border-void-border-2 transition-colors">
										<BookOpen size={14} />
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
										<Trophy size={14} />
									)}
									{isImplementationPlan ? 'Approve & Execute' : 'Approve'}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</LessonThemeProvider>
	);
};

export default EnhancedVoidPreview;