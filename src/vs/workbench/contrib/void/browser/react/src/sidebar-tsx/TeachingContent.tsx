/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Lightbulb, Target, Trophy, ChevronRight, ChevronDown, Brain, Code, CheckCircle, AlertTriangle, ArrowRight, Bookmark, BookmarkCheck } from 'lucide-react';
import { useAccessor } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';

interface TeachingSection {
	id: string;
	title: string;
	content: string;
	type: 'summary' | 'breakdown' | 'concepts' | 'mistakes' | 'exercise' | 'explanation';
	icon?: React.ReactNode;
	completed?: boolean;
}

interface ExerciseData {
	id?: string;
	type?: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';
	title?: string;
	instructions?: string;
	initialCode?: string;
	expectedSolution?: string;
}

const sectionPatterns: Record<string, Array<{ regex: RegExp; type: TeachingSection['type']; title: string; icon: React.ReactNode }>> = {
	explain_code: [
		{ regex: /###?\s*\u{1F4CB}\s*Summary|Summary/i, type: 'summary', title: '\u{1F4CB} Summary', icon: <Target size={14} /> },
		{ regex: /###?\s*\u{1F4D6}\s*Line[-\s]*by[-\s]*Line|Line[-\s]*by[-\s]*Line/i, type: 'breakdown', title: '\u{1F4D6} Line-by-Line Breakdown', icon: <Code size={14} /> },
		{ regex: /###?\s*\u{1F4A1}\s*Key Concepts|Key Concepts/i, type: 'concepts', title: '\u{1F4A1} Key Concepts', icon: <Lightbulb size={14} /> },
		{ regex: /###?\s*\u{26A0}\u{FE0F}\s*Common Mistakes|Common Mistakes/i, type: 'mistakes', title: '\u{26A0}\u{FE0F} Common Mistakes', icon: <AlertTriangle size={14} /> },
		{ regex: /###?\s*\u{1F3AF}\s*Try It Yourself|Try It Yourself/i, type: 'exercise', title: '\u{1F3AF} Try It Yourself', icon: <Target size={14} /> },
	],
	teach_concept: [
		{ regex: /###?\s*\u{1F4DA}\s*What is|What is/i, type: 'explanation', title: '\u{1F4DA} What is it?', icon: <BookOpen size={14} /> },
		{ regex: /###?\s*\u{1F30D}\s*Real[-\s]*World Analogy|Real[-\s]*World Analogy/i, type: 'explanation', title: '\u{1F30D} Real-World Analogy', icon: <Lightbulb size={14} /> },
		{ regex: /###?\s*\u{1F4BB}\s*Code Example|Code Example/i, type: 'breakdown', title: '\u{1F4BB} Code Example', icon: <Code size={14} /> },
		{ regex: /###?\s*\u{26A0}\u{FE0F}\s*Common Pitfalls|Common Pitfalls/i, type: 'mistakes', title: '\u{26A0}\u{FE0F} Common Pitfalls', icon: <AlertTriangle size={14} /> },
		{ regex: /###?\s*\u{1F517}\s*Related Concepts|Related Concepts/i, type: 'concepts', title: '\u{1F517} Related Concepts', icon: <Lightbulb size={14} /> },
		{ regex: /###?\s*\u{1F3AF}\s*Quick Exercise|Quick Exercise/i, type: 'exercise', title: '\u{1F3AF} Quick Exercise', icon: <Target size={14} /> },
	],
	create_exercise: [
		{ regex: /###?\s*\u{1F3AF}\s*Challenge|Challenge/i, type: 'exercise', title: '\u{1F3AF} Challenge', icon: <Target size={14} /> },
	],
	check_answer: [
		{ regex: /###?\s*Result|Result/i, type: 'summary', title: '\u{1F4CA} Result', icon: <CheckCircle size={14} /> },
		{ regex: /###?\s*What Works Well|What Works Well/i, type: 'concepts', title: '\u{2728} What Works Well', icon: <CheckCircle size={14} /> },
	],
	give_hint: [
		{ regex: /###?\s*Hint Level|Hint Level/i, type: 'explanation', title: '\u{1F4A1} Hint', icon: <Lightbulb size={14} /> },
	],
	create_lesson_plan: [
		{ regex: /###?\s*\u{1F3AF}\s*Learning Objectives|Learning Objectives/i, type: 'concepts', title: '\u{1F3AF} Learning Objectives', icon: <Target size={14} /> },
		{ regex: /###?\s*\u{1F4DA}\s*Prerequisites|Prerequisites/i, type: 'concepts', title: '\u{1F4DA} Prerequisites', icon: <BookOpen size={14} /> },
		{ regex: /###?\s*\u{1F4CB}\s*Modules|Modules/i, type: 'breakdown', title: '\u{1F4CB} Modules', icon: <Code size={14} /> },
		{ regex: /###?\s*\u{1F3C6}\s*Final Project|Final Project/i, type: 'exercise', title: '\u{1F3C6} Final Project', icon: <Trophy size={14} /> },
	],
};

function parseTeachingContent(content: string, toolName: BuiltinToolName): TeachingSection[] {
	const sections: TeachingSection[] = [];
	const patterns = sectionPatterns[toolName] || [];
	const lines = content.split('\n');
	let currentSection: TeachingSection | null = null;
	let sectionStart = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		for (const pattern of patterns) {
			if (line.match(pattern.regex)) {
				if (currentSection) {
					currentSection.content = lines.slice(sectionStart, i).join('\n').trim();
					sections.push(currentSection);
				}
				currentSection = {
					id: `section-${sections.length}`,
					title: pattern.title,
					type: pattern.type,
					icon: pattern.icon,
					content: '',
					completed: false,
				};
				sectionStart = i + 1;
				break;
			}
		}
	}
	if (currentSection) {
		currentSection.content = lines.slice(sectionStart).join('\n').trim();
		sections.push(currentSection);
	}
	if (sections.length === 0) {
		sections.push({ id: 'section-0', title: 'Content', type: 'explanation', content: content.trim() });
	}
	return sections;
}

function extractExerciseData(content: string): ExerciseData | null {
	const exerciseMatch = content.match(/Exercise ID:?\s*(ex_\w+)/i);
	const typeMatch = content.match(/type:?\s*['"]?(fill_blank|fix_bug|write_function|extend_code)['"]?/i);
	if (exerciseMatch || typeMatch) {
		return { id: exerciseMatch?.[1], type: typeMatch?.[1] as ExerciseData['type'] };
	}
	return null;
}

const SectionHeader: React.FC<{
	section: TeachingSection;
	isExpanded: boolean;
	onToggle: () => void;
	onToggleComplete?: () => void;
	onBookmark?: () => void;
	isBookmarked?: boolean;
}> = ({ section, isExpanded, onToggle, onToggleComplete, onBookmark, isBookmarked }) => (
	<button onClick={onToggle} className="w-full px-3 py-2.5 flex items-start gap-2 hover:bg-void-bg-2/50 transition-colors text-left group">
		<span className="flex-shrink-0 mt-0.5 transition-transform duration-200">
			{isExpanded ? <ChevronDown size={14} className="text-void-accent" /> : <ChevronRight size={14} className="text-void-fg-3" />}
		</span>
		<div className="flex items-center gap-2 flex-1 min-w-0">
			{section.icon && <span className="text-void-fg-2 flex-shrink-0">{section.icon}</span>}
			<span className={`text-sm font-medium truncate ${section.completed ? 'text-void-fg-3 line-through' : 'text-void-fg-1'}`}>
				{section.title}
			</span>
			{section.completed && <CheckCircle size={12} className="text-green-500 flex-shrink-0" />}
		</div>
		<div className="flex items-center gap-1 flex-shrink-0">
			{onBookmark && (
				<button
					onClick={(e) => { e.stopPropagation(); onBookmark(); }}
					className={`p-1 rounded transition-colors ${isBookmarked ? 'text-void-accent' : 'text-void-fg-4 hover:text-void-accent opacity-0 group-hover:opacity-100'}`}
					title={isBookmarked ? 'Bookmarked' : 'Bookmark section'}
				>
					{isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
				</button>
			)}
			{onToggleComplete && (
				<button
					onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
					className={`p-1 rounded transition-colors ${section.completed ? 'text-green-500' : 'text-void-fg-4 hover:text-green-500'}`}
					title={section.completed ? 'Mark incomplete' : 'Mark as complete'}
				>
					<CheckCircle size={14} fill={section.completed ? 'currentColor' : 'none'} />
				</button>
			)}
		</div>
	</button>
);

const SectionBody: React.FC<{
	section: TeachingSection;
	isExpanded: boolean;
	isLastSection: boolean;
	onToggleComplete?: () => void;
}> = ({ section, isExpanded, isLastSection, onToggleComplete }) => {
	if (!isExpanded) return null;
	return (
		<div className="px-3 pb-3 pl-8">
			<ChatMarkdownRender string={section.content} chatMessageLocation={undefined} isApplyEnabled={false} isLinkDetectionEnabled={true} />
			{!isLastSection && onToggleComplete && !section.completed && (
				<div className="mt-4 flex justify-end">
					<button
						onClick={onToggleComplete}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-void-accent/10 hover:bg-void-accent/20 text-void-accent rounded-lg text-xs font-medium transition-colors"
					>
						<span>Mark complete & continue</span>
						<ArrowRight size={12} />
					</button>
				</div>
			)}
		</div>
	);
};

const ProgressBar: React.FC<{ completed: number; total: number }> = ({ completed, total }) => {
	if (total <= 1) return null;
	const pct = Math.round((completed / total) * 100);
	return (
		<div className="mb-3 px-3"
			data-tooltip-id="void-tooltip"
			data-tooltip-content={`${completed} of ${total} sections completed`}
			data-tooltip-place="top"
		>
			<div className="flex items-center justify-between mb-1">
				<span className="text-[10px] font-semibold text-void-fg-4 uppercase tracking-wider">Lesson Progress</span>
				<span className="text-[10px] font-bold text-void-accent">{pct}%</span>
			</div>
			<div className="h-1.5 w-full bg-void-bg-3 rounded-full overflow-hidden">
				<div className="h-full bg-void-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
			</div>
		</div>
	);
};

interface TeachingContentProps {
	toolName: BuiltinToolName;
	resultContent: string;
	threadId: string;
}

export const TeachingContent: React.FC<TeachingContentProps> = ({ toolName, resultContent, threadId }) => {
	const accessor = useAccessor();
	const learningProgressService = accessor.get('ILearningProgressService');

	const [sections, setSections] = useState<TeachingSection[]>([]);
	const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
	const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
	const [exerciseData, setExerciseData] = useState<ExerciseData | null>(null);

	// Derive a lesson ID from tool name + content hash (simple but stable)
	const lessonId = useMemo(() => {
		let hash = 0;
		for (let i = 0; i < resultContent.length; i++) {
			hash = ((hash << 5) - hash) + resultContent.charCodeAt(i);
			hash |= 0;
		}
		return `${toolName}_lesson_${Math.abs(hash).toString(36).slice(0, 8)}`;
	}, [toolName, resultContent]);

	// Load persisted state
	useEffect(() => {
		const parsed = parseTeachingContent(resultContent, toolName);
		const exData = extractExerciseData(resultContent);
		if (exData) setExerciseData(exData);

		// Load saved progress
		const threadProgress = learningProgressService.getThreadProgress(threadId);
		const lessonProgress = threadProgress?.lessons?.[lessonId];
		const savedRead = new Set(lessonProgress?.sectionsRead || []);
		const savedBookmarks = new Set((threadProgress?.bookmarks?.[lessonId] || []) as string[]);

		setBookmarks(savedBookmarks);
		setSections(parsed.map(s => ({ ...s, completed: savedRead.has(s.id) })));

		// Auto-expand first incomplete section
		const firstIncomplete = parsed.find(s => !savedRead.has(s.id));
		setExpandedSections(new Set([firstIncomplete?.id || parsed[0]?.id || 'section-0']));
	}, [resultContent, toolName, threadId, lessonId, learningProgressService]);

	const toggleSection = useCallback((sectionId: string) => {
		setExpandedSections(prev => {
			const next = new Set(prev);
			if (next.has(sectionId)) next.delete(sectionId);
			else next.add(sectionId);
			return next;
		});
	}, []);

	const markComplete = useCallback(async (sectionId: string) => {
		setSections(prev => prev.map(s => s.id === sectionId ? { ...s, completed: true } : s));
		// Persist
		const completedIds = sections.filter(s => s.completed || s.id === sectionId).map(s => s.id);
		await learningProgressService.updateLessonProgress(threadId, lessonId, {
			lessonId,
			title: sections[0]?.title || lessonId,
			sectionsRead: completedIds,
			lastAccessed: Date.now(),
		});
		// Auto-expand next section
		const idx = sections.findIndex(s => s.id === sectionId);
		if (idx >= 0 && idx < sections.length - 1) {
			setExpandedSections(new Set([sections[idx + 1].id]));
		}
	}, [sections, threadId, lessonId, learningProgressService]);

	const toggleBookmark = useCallback(async (sectionId: string) => {
		setBookmarks(prev => {
			const next = new Set(prev);
			if (next.has(sectionId)) {
				next.delete(sectionId);
				learningProgressService.removeBookmark(lessonId, sectionId);
			} else {
				next.add(sectionId);
				learningProgressService.addBookmark(lessonId, sectionId);
			}
			return next;
		});
	}, [lessonId, learningProgressService]);

	const completedCount = sections.filter(s => s.completed).length;

	return (
		<div className="space-y-0">
			<ProgressBar completed={completedCount} total={sections.length} />
			{exerciseData && (
				<div className="mb-3 px-3 py-2 bg-void-accent/10 border border-void-accent/30 rounded-lg">
					<div className="flex items-center gap-2 text-xs">
						<Target size={12} className="text-void-accent" />
						<span className="font-medium text-void-fg-1">Exercise ID: </span>
						<code className="text-void-accent">{exerciseData.id}</code>
						{exerciseData.type && <><span className="text-void-fg-4">•</span><span className="text-void-fg-2">{exerciseData.type}</span></>}
					</div>
				</div>
			)}
			{sections.map((section, idx) => (
				<div key={section.id} className="border-b border-void-border-1/50 last:border-b-0">
					<SectionHeader
						section={section}
						isExpanded={expandedSections.has(section.id)}
						onToggle={() => toggleSection(section.id)}
						onToggleComplete={() => markComplete(section.id)}
						onBookmark={() => toggleBookmark(section.id)}
						isBookmarked={bookmarks.has(section.id)}
					/>
					<SectionBody
						section={section}
						isExpanded={expandedSections.has(section.id)}
						isLastSection={idx === sections.length - 1}
						onToggleComplete={() => markComplete(section.id)}
					/>
				</div>
			))}
		</div>
	);
};

export default TeachingContent;
