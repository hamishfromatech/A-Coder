/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, Lightbulb, Target, Trophy, ChevronRight, ChevronDown, Brain, Code, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState, useSettingsState } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { BuiltinToolName, ToolName } from '../../../../common/toolsServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	getTitle,
	ResultWrapper,
	ToolHeaderParams,
} from './ToolResultHelpers.js';

// Types for teaching content parsing
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

// Parse teaching tool output into structured sections
function parseTeachingContent(content: string, toolName: BuiltinToolName): TeachingSection[] {
	const sections: TeachingSection[] = [];

	// Remove code fences for parsing (we'll add them back)
	const cleanContent = content.replace(/```[\s\S]*?```/g, (match) => {
		return match; // Keep code blocks as-is
	});

	// Section patterns for different teaching tools
	const sectionPatterns = {
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
	}[toolName] || [];

	// Split content by major headers
	const lines = content.split('\n');
	let currentSection: TeachingSection | null = null;
	let sectionStart = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let foundMatch = false;

		for (const pattern of sectionPatterns) {
			const match = line.match(pattern.regex);
			if (match) {
				// Save previous section
				if (currentSection) {
					currentSection.content = lines.slice(sectionStart, i).join('\n').trim();
					sections.push(currentSection);
				}

				// Start new section
				currentSection = {
					id: `section-${sections.length}`,
					title: pattern.title,
					type: pattern.type,
					icon: pattern.icon,
					content: '',
					completed: false,
				};
				sectionStart = i + 1;
				foundMatch = true;
				break;
			}
		}
	}

	// Add last section
	if (currentSection) {
		currentSection.content = lines.slice(sectionStart).join('\n').trim();
		sections.push(currentSection);
	}

	// If no sections found, create a default one
	if (sections.length === 0) {
		sections.push({
			id: 'section-0',
			title: 'Content',
			type: 'explanation',
			content: content.trim(),
		});
	}

	return sections;
}

// Extract exercise data from content
function extractExerciseData(content: string): ExerciseData | null {
	const exerciseMatch = content.match(/Exercise ID:?\s*(ex_\w+)/i);
	const typeMatch = content.match(/type:?\s*['"]?(fill_blank|fix_bug|write_function|extend_code)['"]?/i);

	if (exerciseMatch || typeMatch) {
		return {
			id: exerciseMatch?.[1],
			type: typeMatch?.[1] as ExerciseData['type'],
		};
	}
	return null;
}

// Collapsible teaching section component
const CollapsibleSection: React.FC<{
	section: TeachingSection;
	isExpanded: boolean;
	onToggle: () => void;
	onToggleComplete?: () => void;
}> = ({ section, isExpanded, onToggle, onToggleComplete }) => {
	return (
		<div className="border-b border-void-border-1/50 last:border-b-0">
			<button
				onClick={onToggle}
				className="w-full px-3 py-2.5 flex items-start gap-2 hover:bg-void-bg-2/50 transition-colors text-left"
			>
				<span className="flex-shrink-0 mt-0.5 transition-transform duration-200">
					{isExpanded ? <ChevronDown size={14} className="text-void-accent" /> : <ChevronRight size={14} className="text-void-fg-3" />}
				</span>
				<div className="flex items-center gap-2 flex-1">
					{section.icon && <span className="text-void-fg-2">{section.icon}</span>}
					<span className="text-sm font-medium text-void-fg-1">{section.title}</span>
				</div>
				{section.type === 'summary' && onToggleComplete && (
					<button
						onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
						className={`p-1 rounded transition-colors ${section.completed ? 'text-green-500' : 'text-void-fg-4 hover:text-green-500'}`}
						title="Mark as complete"
					>
						<CheckCircle size={14} fill={section.completed ? 'currentColor' : 'none'} />
					</button>
				)}
			</button>
			{isExpanded && (
				<div className="px-3 pb-3 pl-8">
					<ChatMarkdownRender
						string={section.content}
						chatMessageLocation={undefined}
						isApplyEnabled={false}
						isLinkDetectionEnabled={true}
					/>
				</div>
			)}
		</div>
	);
};

// Main Teaching Result Wrapper
export const TeachingResultWrapper: ResultWrapper<'explain_code' | 'teach_concept' | 'create_exercise' | 'check_answer' | 'give_hint' | 'create_lesson_plan'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);
	const settingsState = useSettingsState();

	const title = getTitle(toolMessage);
	const isRejected = toolMessage.type === 'rejected';
	const componentParams: ToolHeaderParams = { title, desc1: '', isError: false, icon: <Brain size={12} className="text-void-accent" />, isRejected };

	// Parse content when success
	const [sections, setSections] = useState<TeachingSection[]>([]);
	const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['section-0']));
	const [exerciseData, setExerciseData] = useState<ExerciseData | null>(null);

	useEffect(() => {
		if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
			const result = toolMessage.result as any;
			const resultContent = result?.template || (typeof result === 'string' ? result : '');

			// Parse content
			const parsedSections = parseTeachingContent(resultContent, toolMessage.name as BuiltinToolName);
			setSections(parsedSections);

			// Extract exercise data
			const exData = extractExerciseData(resultContent);
			if (exData) setExerciseData(exData);

			// Auto-expand first section
			setExpandedSections(new Set([parsedSections[0]?.id || 'section-0']));
		}
	}, [toolMessage.type, toolMessage.result, toolMessage.name]);

	const toggleSection = (sectionId: string) => {
		setExpandedSections(prev => {
			const newSet = new Set(prev);
			if (newSet.has(sectionId)) {
				newSet.delete(sectionId);
			} else {
				newSet.add(sectionId);
			}
			return newSet;
		});
	};

	const toggleComplete = (sectionId: string) => {
		setSections(prev => prev.map(s =>
			s.id === sectionId ? { ...s, completed: !s.completed } : s
		));
	};

	if (toolMessage.type === 'running_now') {
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;

		if (activity) {
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2 py-1">
						<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-xs italic text-void-fg-3">{activity}</span>
					</div>
				</ToolChildrenWrapper>
			);
			componentParams.isOpen = true;
		}
	} else if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
		const result = toolMessage.result as any;
		const resultContent = result?.template || (typeof result === 'string' ? result : '');

		// Show exercise metadata if available
		const exerciseInfo = exerciseData && (
			<div className="mb-3 px-3 py-2 bg-void-accent/10 border border-void-accent/30 rounded-lg">
				<div className="flex items-center gap-2 text-xs">
					<Target size={12} className="text-void-accent" />
					<span className="font-medium text-void-fg-1">Exercise ID: </span>
					<code className="text-void-accent">{exerciseData.id}</code>
					{exerciseData.type && (
						<>
							<span className="text-void-fg-4">•</span>
							<span className="text-void-fg-2">{exerciseData.type}</span>
						</>
					)}
				</div>
			</div>
		);

		componentParams.children = (
			<ToolChildrenWrapper>
				{exerciseInfo}
				{sections.length > 1 ? (
					// Show collapsible sections
					<div className="space-y-0">
						{sections.map((section) => (
							<CollapsibleSection
								key={section.id}
								section={section}
								isExpanded={expandedSections.has(section.id)}
								onToggle={() => toggleSection(section.id)}
								onToggleComplete={section.type === 'summary' ? () => toggleComplete(section.id) : undefined}
							/>
						))}
					</div>
				) : (
					// Single section, show directly
					<div className="prose prose-sm max-w-none">
						<ChatMarkdownRender
							string={resultContent}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</div>
				)}
			</ToolChildrenWrapper>
		);
		componentParams.isOpen = true; // Auto-expand teaching content
	}

	return <ToolHeaderWrapper {...componentParams} />;
};