/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BookOpen, Trophy, Target, Flame, Settings, Menu, X, Check, AlertCircle, Download, RefreshCw, Clock, Sparkles } from 'lucide-react';
import '../styles.css';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { useAccessor, useIsDark } from '../util/services.js';
import { LessonThemeProvider, useLessonTheme } from '../util/LessonThemeProvider.js';
import { ProgressTracker } from '../learning-tsx/ProgressTracker.js';
import { CollapsibleLessonSection, ProgressSection, TableOfContents } from '../learning-tsx/CollapsibleLessonSection.js';
import { InlineExerciseBlock } from '../learning-tsx/InlineExerciseBlock.js';
import { useCelebration } from '../learning-tsx/CelebrationEffect.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';

export interface LearningPreviewProps {
	title: string;
	content: string;
	lessonId?: string;
	lessonTopic?: string;
	threadId?: string;
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
		language?: string;
		expectedSolution?: string;
	}>;
	sections?: Array<{
		id: string;
		title: string;
		content: string;
		exerciseIds?: string[];
	}>;
}

interface LessonState {
	sections: Record<string, { completed: boolean; expanded: boolean; read: boolean; bookmarked: boolean; note?: string }>;
	exercises: Record<string, { attempts: number; solved: boolean; hintsUsed: number; code?: string }>;
	timeSpent: number;
	startTime: number;
	showProgress: boolean;
	showSidebar: boolean;
	activeSection: string | null;
}

// Check for reduced motion preference
const prefersReducedMotion = () => {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Semantic color tokens for theming (avoid hard-coded colors)
const semanticColors = {
	error: {
		bg: 'bg-red-500/10 dark:bg-red-500/10',
		border: 'border-red-500/20 dark:border-red-500/20',
		text: 'text-red-400 dark:text-red-400',
	},
	warning: {
		bg: 'bg-amber-500/10 dark:bg-amber-500/10',
		border: 'border-amber-500/20 dark:border-amber-500/20',
		text: 'text-amber-400 dark:text-amber-400',
	},
	success: {
		bg: 'bg-emerald-500/10 dark:bg-emerald-500/10',
		border: 'border-emerald-500/20 dark:border-emerald-500/20',
		text: 'text-emerald-400 dark:text-emerald-400',
	},
};

// Parse markdown into sections
function parseContentIntoSections(content: string): Array<{ id: string; title: string; content: string }> {
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

// Exercise renderer
const InlineExerciseRenderer: React.FC<{
	exercise: LearningPreviewProps['exercises'][0];
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
			if (!prefersReducedMotion()) {
				triggerCelebration('confetti', 1500, 'medium');
			}
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

// Dashboard Modal
const LearningDashboard: React.FC<{
	progress: LessonState;
	stats: { streak: number; lessonsCompleted: number; exercisesSolved: number };
	onClose: () => void;
}> = ({ stats, onClose }) => {
	const { theme, getColor } = useLessonTheme();
	const modalRef = React.useRef<HTMLDivElement>(null);
	const onCloseRef = React.useRef(onClose);

	// Keep ref updated
	React.useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	// Focus trap and escape key handler - run once on mount
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onCloseRef.current();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		// Focus the modal on open
		modalRef.current?.focus();
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, []);

	return (
		<div
			className="fixed inset-0 bg-black/60 z-modal flex items-center justify-center"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-labelledby="dashboard-title"
		>
			<div
				ref={modalRef}
				tabIndex={-1}
				className="rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[85vh] overflow-hidden"
				style={{ backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}` }}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className="flex items-center justify-between px-4 py-3 border-b"
					style={{ backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }}
				>
					<div className="flex items-center gap-2">
						<Trophy size={18} style={{ color: getColor('accent') }} aria-hidden="true" />
						<h2 id="dashboard-title" className="text-base font-semibold" style={{ color: getColor('text') }}>
							Progress
						</h2>
					</div>
					<button
						onClick={onClose}
						aria-label="Close"
						className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
						style={{
							backgroundColor: 'transparent',
							color: getColor('text-muted'),
							'--tw-ring-color': getColor('accent'),
							'--tw-ring-offset-color': theme.colors.background,
						} as React.CSSProperties}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</div>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{/* Streak */}
					<div
						className="flex items-center gap-3 p-3 rounded-lg"
						style={{ backgroundColor: `${getColor('accent')}10`, border: `1px solid ${getColor('accent')}25` }}
					>
						<div className="p-2 rounded-lg" style={{ backgroundColor: `${getColor('accent')}15` }}>
							<Flame size={18} style={{ color: getColor('accent') }} aria-hidden="true" />
						</div>
						<div className="min-w-0">
							<div className="text-xs font-medium" style={{ color: getColor('text-muted') }}>Streak</div>
							<div className="text-lg font-bold" style={{ color: getColor('accent') }}>{stats.streak} days</div>
						</div>
					</div>

					{/* Stats */}
					<div className="grid grid-cols-2 gap-2">
						<div className="p-3 rounded-lg" style={{ backgroundColor: theme.colors.backgroundLight }}>
							<div className="text-xs mb-1" style={{ color: getColor('text-muted') }}>Lessons</div>
							<div className="text-lg font-bold" style={{ color: getColor('text') }}>{stats.lessonsCompleted}</div>
						</div>
						<div className="p-3 rounded-lg" style={{ backgroundColor: theme.colors.backgroundLight }}>
							<div className="text-xs mb-1" style={{ color: getColor('text-muted') }}>Exercises</div>
							<div className="text-lg font-bold" style={{ color: getColor('text') }}>{stats.exercisesSolved}</div>
						</div>
					</div>

					{/* Recent */}
					<div>
						<h3 className="text-sm font-medium mb-2" style={{ color: getColor('text') }}>Recent</h3>
						<div className="space-y-1">
							{['Loops', 'Arrays', 'Functions'].map((lesson) => (
								<div key={lesson} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: theme.colors.backgroundLight }}>
									<BookOpen size={14} style={{ color: getColor('text-muted') }} aria-hidden="true" />
									<span className="flex-1 text-sm truncate" style={{ color: getColor('text') }}>{lesson}</span>
									<Target size={14} style={{ color: getColor('accent') }} aria-label="Completed" />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

// Main Component
export const LearningPreview: React.FC<LearningPreviewProps> = ({
	title,
	content,
	lessonId,
	lessonTopic,
	threadId,
	onSectionToggle,
	onSectionComplete,
	onBookmarkToggle,
	onNoteAdd,
	exercises = [],
	sections: providedSections,
}) => {
	const isDark = useIsDark();
	const { theme, getColor } = useLessonTheme();
	const accessor = useAccessor();
	const fileService = accessor.get('IFileService');
	const workspaceContextService = accessor.get('IWorkspaceContextService');
	const notificationService = accessor.get('INotificationService');

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
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const parsedSections = useMemo(
		() => providedSections || parseContentIntoSections(content),
		[providedSections, content]
	);

	// Time tracking
	useEffect(() => {
		timerRef.current = setInterval(() => {
			setLessonState(prev => ({
				...prev,
				timeSpent: Math.floor((Date.now() - prev.startTime) / 1000),
			}));
		}, 1000);

		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
	}, []);

	// Initialize sections
	useEffect(() => {
		setLessonState(prev => {
			const newSections = { ...prev.sections };
			let hasChanges = false;

			parsedSections.forEach(section => {
				if (!newSections[section.id]) {
					newSections[section.id] = {
						completed: false,
						expanded: section.id === 'section-0',
						read: false,
						bookmarked: false,
					};
					hasChanges = true;
				}
			});

			return hasChanges ? { ...prev, sections: newSections } : prev;
		});
	}, [parsedSections]);

	const handleExportMarkdown = async () => {
		setExporting(true);
		try {
			const workspaceFolders = workspaceContextService.getWorkspace().folders;
			if (workspaceFolders.length === 0) throw new Error('No workspace folder found');

			const lessonDir = URI.joinPath(workspaceFolders[0].uri, '.a-coder', 'lessons');
			const fileName = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
			const fileUri = URI.joinPath(lessonDir, fileName);

			// Build markdown content
			let md = `# ${title}\n\n`;
			md += `> **Topic:** ${lessonTopic || 'General'}\n`;
			md += `> **Generated on:** ${new Date().toLocaleDateString()}\n`;
			md += `> **Time Spent:** ${formatTime(lessonState.timeSpent)}\n\n`;

			parsedSections.forEach(section => {
				const state = lessonState.sections[section.id];
				md += `## ${section.title} ${state?.completed ? '✅' : ''}\n\n`;
				md += `${section.content}\n\n`;
				
				if (state?.note) {
					md += `### My Notes\n> ${state.note}\n\n`;
				}

				section.exerciseIds?.forEach(exId => {
					const ex = exercises.find(e => e.id === exId);
					const exState = lessonState.exercises[exId];
					if (ex) {
						md += `### Exercise: ${ex.title || ex.type}\n`;
						md += `**Instructions:** ${ex.instructions}\n\n`;
						if (exState?.code) {
							md += `\`\`\`${ex.language || 'typescript'}\n${exState.code}\n\`\`\`\n\n`;
							md += `**Status:** ${exState.solved ? 'Solved' : 'In Progress'}\n\n`;
						}
					}
				});
			});

			// Create directory if it doesn't exist
			try { await fileService.createFolder(lessonDir); } catch (e) { notificationService.error(`Couldn't create lesson folder: ${e instanceof Error ? e.message : String(e)}`) }
			
			// Write file
			await fileService.writeFile(fileUri, VSBuffer.fromString(md));
			
			// Show success notification or celebration
			triggerCelebration('burst', 1000);
		} catch (err) {
			console.error('Failed to export lesson:', err);
			setError('Failed to save lesson to workspace.');
		} finally {
			setExporting(false);
		}
	};

	const { trigger: triggerCelebration } = useCelebration();

	// Handlers
	const handleSectionToggle = useCallback((sectionId: string, isExpanded: boolean) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: { ...prev.sections[sectionId], expanded: isExpanded, read: isExpanded ? true : prev.sections[sectionId].read },
			},
		}));
		onSectionToggle?.(sectionId, isExpanded);
	}, [onSectionToggle]);

	const handleSectionComplete = useCallback((sectionId: string) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: { ...prev.sections[sectionId], completed: !prev.sections[sectionId].completed },
			},
		}));
		onSectionComplete?.(sectionId);
	}, [onSectionComplete]);

	const handleBookmarkToggle = useCallback((sectionId: string) => {
		setLessonState(prev => ({
			...prev,
			sections: {
				...prev.sections,
				[sectionId]: { ...prev.sections[sectionId], bookmarked: !prev.sections[sectionId].bookmarked },
			},
		}));
		onBookmarkToggle?.(lessonId || '', sectionId);
	}, [lessonId, onBookmarkToggle]);

	// Derived state
	const progress = useMemo(() => {
		const completedCount = Object.values(lessonState.sections).filter(s => s.completed).length;
		const totalCount = parsedSections.length;
		return totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
	}, [lessonState.sections, parsedSections]);

	const sectionList = useMemo(() => parsedSections.map(section => ({
		id: section.id,
		title: section.title,
		isCompleted: lessonState.sections[section.id]?.completed || false,
		isExpanded: lessonState.sections[section.id]?.expanded || false,
	})), [parsedSections, lessonState.sections]);

	const formatTime = useCallback((seconds: number): string => {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	}, []);

	const getSectionIcon = useCallback((sectionId: string): React.ReactNode => {
		return lessonState.sections[sectionId]?.completed
			? <Check size={16} aria-hidden="true" />
			: <BookOpen size={16} aria-hidden="true" />;
	}, [lessonState.sections]);

	// Base button styles
	const btn = 'min-h-[36px] px-3 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all active:scale-[0.95]';

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			{showDashboard && (
				<LearningDashboard
					progress={lessonState}
					stats={{ streak: 3, lessonsCompleted: 2, exercisesSolved: 5 }}
					onClose={() => setShowDashboard(false)}
				/>
			)}

			{/* Error Banner - uses theme-compatible error styling */}
			{error && (
				<div
					className="flex items-center gap-2 px-4 py-3"
					style={{
						backgroundColor: `${getColor('accent')}08`,
						borderBottom: `1px solid ${getColor('accent')}20`,
					}}
					role="alert"
					aria-live="polite"
				>
					<AlertCircle size={16} style={{ color: getColor('accent'), flexShrink: 0 }} aria-hidden="true" />
					<span className="text-sm" style={{ color: getColor('text') }}>{error}</span>
				</div>
			)}

			<div className="h-full flex flex-col overflow-hidden font-sans bg-void-bg-1" style={{ color: theme.colors.text }}>

				{/* Skip to content - focuses main element for keyboard users */}
				<a
					href="#lesson-content"
					className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-modal focus:px-4 focus:py-2 focus:rounded-lg focus:no-underline"
					style={{ backgroundColor: getColor('accent'), color: 'white' }}
					onClick={(e) => {
						e.preventDefault();
						document.getElementById('lesson-content')?.focus();
					}}
				>
					Skip to content
				</a>

				{/* Header - Enhanced style */}
				<header className="flex-shrink-0 flex items-center justify-between border-b px-6 py-4 bg-void-bg-1/80 backdrop-blur-md sticky top-0 z-20" style={{ borderColor: theme.colors.border }}>
					<div className="flex items-center gap-4 min-w-0">
						<div
							className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-void-accent/10"
							style={{ backgroundColor: `${getColor('accent')}15` }}
						>
							<Sparkles size={20} style={{ color: getColor('accent') }} aria-hidden="true" />
						</div>
						<div className="flex flex-col gap-0.5 min-w-0">
							<h1 className="text-base font-bold truncate text-void-fg-1 tracking-tight">{title}</h1>
							<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-void-fg-3/60">
								<span className="flex items-center gap-1">
									<Clock size={10} />
									{formatTime(lessonState.timeSpent)}
								</span>
								<span>·</span>
								<span>{Math.round(progress)}% Complete</span>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<button
							onClick={handleExportMarkdown}
							disabled={exporting}
							aria-label="Save as Guide"
							className={`${btn} bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 border border-void-border-2 gap-2 text-xs font-bold`}
						>
							{exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
							<span>Save Guide</span>
						</button>
						<div className="w-px h-6 bg-void-border-2 mx-1" />
						<button
							onClick={() => setShowDashboard(true)}
							aria-label="View progress"
							className={`${btn} p-2 text-void-fg-3 hover:text-void-accent hover:bg-void-accent/10`}
						>
							<Trophy size={18} aria-hidden="true" />
						</button>
						<button
							onClick={() => setLessonState(prev => ({ ...prev, showSidebar: !prev.showSidebar }))}
							aria-label={lessonState.showSidebar ? 'Close sidebar' : 'Open sidebar'}
							aria-expanded={lessonState.showSidebar}
							className={`${btn} p-2 text-void-fg-3 hover:bg-void-bg-2`}
						>
							{lessonState.showSidebar ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
						</button>
					</div>
				</header>

				{/* Content */}
				<div className="flex-1 overflow-hidden flex">
					{/* Sidebar */}
					{lessonState.showSidebar && (
						<nav
							className="w-64 border-r overflow-y-auto custom-scrollbar flex-shrink-0"
							style={{ backgroundColor: `${theme.colors.backgroundLight}80`, borderColor: theme.colors.border }}
							aria-label="Table of contents"
						>
							<div className="p-4 space-y-4">
								<ProgressTracker lessonId={lessonId || title} threadId={threadId} showDetailed showStreak showBadges={false} />
								<TableOfContents
									sections={sectionList}
									onSectionClick={(sectionId) => {
										handleSectionToggle(sectionId, true);
										document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
									}}
								/>
							</div>
						</nav>
					)}

					{/* Main */}
					<main id="lesson-content" className="flex-1 overflow-y-auto custom-scrollbar" tabIndex={-1}>
						<article className="max-w-3xl mx-auto px-6 py-8 md:px-12 space-y-6">
							{/* Progress */}
							{lessonState.showProgress && (
								<ProgressSection
									totalSections={parsedSections.length}
									completedSections={Object.values(lessonState.sections).filter(s => s.completed).length}
									estimatedTime="10 min"
									onJumpToSection={(sectionId) => {
										handleSectionToggle(sectionId, true);
										document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
									}}
								/>
							)}

							{/* Sections */}
							{parsedSections.length === 0 ? (
								<div className="text-center py-16">
									<div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${getColor('accent')}10` }}>
										<BookOpen size={28} style={{ color: getColor('accent') }} aria-hidden="true" />
									</div>
									<h3 className="text-base font-semibold mb-2" style={{ color: getColor('text') }}>No lesson content available</h3>
									<p className="text-sm mb-4" style={{ color: getColor('text-muted') }}>
										Select a lesson from the sidebar to begin learning, or check back later.
									</p>
								</div>
							) : (
								parsedSections.map((section, idx) => (
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
										<div className="prose prose-invert max-w-none" style={{ color: getColor('text') }}>
											<ChatMarkdownRender string={section.content} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled />
										</div>
										{section.exerciseIds?.map(exerciseId => {
											const exercise = exercises.find(e => e.id === exerciseId);
											if (!exercise) return null;
											return (
												<div key={exercise.id} className="mt-6">
													<InlineExerciseRenderer exercise={exercise} threadId={threadId} lessonId={lessonId || title} />
												</div>
											);
										})}
									</CollapsibleLessonSection>
								))
							)}

							<div className="h-16" />
						</article>
					</main>
				</div>
			</div>
		</div>
	);
};

export const LearningPreviewWithTheme: React.FC<LearningPreviewProps> = (props) => (
	<LessonThemeProvider lessonId={props.lessonId || props.title} topic={props.lessonTopic}>
		<LearningPreview {...props} />
	</LessonThemeProvider>
);

export default LearningPreviewWithTheme;