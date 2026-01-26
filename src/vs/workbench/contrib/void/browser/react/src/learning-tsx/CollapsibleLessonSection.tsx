/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Circle, Bookmark, BookmarkCheck, MoreVertical } from 'lucide-react';
import { useLessonTheme } from '../util/LessonThemeProvider.js';

export interface CollapsibleLessonSectionProps {
	id: string;
	lessonId: string;
	title: string;
	children: React.ReactNode;
	icon?: React.ReactNode;
	defaultExpanded?: boolean;
	onToggle?: (sectionId: string, isExpanded: boolean) => void;
	onMarkComplete?: (sectionId: string) => void;
	isCompleted?: boolean;
	isBookmarked?: boolean;
	onToggleBookmark?: (sectionId: string) => void;
	showProgress?: boolean;
	progress?: number; // 0-100
	order?: number; // Section order number
}

export const CollapsibleLessonSection: React.FC<CollapsibleLessonSectionProps> = ({
	id,
	lessonId,
	title,
	children,
	icon,
	defaultExpanded = true,
	onToggle,
	onMarkComplete,
	isCompleted = false,
	isBookmarked = false,
	onToggleBookmark,
	showProgress = false,
	progress = 0,
	order,
}) => {
	const { theme, getColor, getShadow } = useLessonTheme();
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const [isMarkedComplete, setIsMarkedComplete] = useState(isCompleted);
	const [isBookmarkedLocal, setIsBookmarkedLocal] = useState(isBookmarked);
	const [showMenu, setShowMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	// Handle expand/collapse
	const handleToggle = () => {
		setIsExpanded(!isExpanded);
		onToggle?.(id, !isExpanded);
	};

	// Handle mark complete
	const handleMarkComplete = () => {
		setIsMarkedComplete(!isMarkedComplete);
		onMarkComplete?.(id);
	};

	// Handle bookmark toggle
	const handleToggleBookmark = () => {
		setIsBookmarkedLocal(!isBookmarkedLocal);
		onToggleBookmark?.(id);
	};

	// Close menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};

		if (showMenu) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showMenu]);

	const sectionProgressColor = progress >= 100 ? getColor('success') : progress >= 50 ? getColor('accent') : getColor('warning');

	return (
		<div
			className={`collapsible-section ${isExpanded ? 'expanded' : 'collapsed'} ${isMarkedComplete ? 'completed' : ''}`}
			style={{
				borderRadius: getBorderRadius(),
				transition: 'all 300ms ease-out',
			}}
		>
			{/* Section Header */}
			<button
				onClick={handleToggle}
				className="w-full px-4 py-3 flex items-center gap-3 bg-void-bg-2 hover:bg-void-bg-3 transition-colors"
				style={{
					borderRadius: getBorderRadius(),
					boxShadow: isExpanded ? getShadow('light') : 'none',
				}}
			>
				{/* Status Icon */}
				<div
					className="flex-shrink-0 w-6 h-6 flex items-center justify-center"
					style={{ color: isMarkedComplete ? getColor('success') : getColor('text-muted') }}
				>
					{isMarkedComplete ? <CheckCircle size={20} /> : <Circle size={20} />}
				</div>

				{/* Section Icon (if provided) */}
				{icon && <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">{icon}</div>}

				{/* Order Number (if provided) */}
				{order !== undefined && (
					<div
						className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
						style={{
							backgroundColor: getColor('accent'),
							color: 'white',
						}}
					>
						{order}
					</div>
				)}

				{/* Title */}
				<div className="flex-1 text-left">
					<h4
						className={`text-sm font-semibold ${isMarkedComplete ? 'line-through opacity-60' : ''}`}
						style={{ color: getColor('text') }}
					>
						{title}
					</h4>
					{showProgress && progress > 0 && (
						<div className="mt-1 flex items-center gap-2">
							<div className="flex-1 h-1.5 bg-void-bg-4 rounded-full overflow-hidden">
								<div
									className="h-full transition-all duration-300"
									style={{
										width: `${Math.min(progress, 100)}%`,
										backgroundColor: sectionProgressColor,
									}}
								/>
							</div>
							<span className="text-xs" style={{ color: getColor('text-muted') }}>
								{Math.round(progress)}%
							</span>
						</div>
					)}
				</div>

				{/* Bookmark Icon */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						handleToggleBookmark();
					}}
					className="flex-shrink-0 p-1 hover:bg-void-bg-4 rounded-md transition-colors"
					style={{ color: isBookmarkedLocal ? getColor('accent') : getColor('text-muted') }}
				>
					{isBookmarkedLocal ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
				</button>

				{/* Expand/Collapse Icon */}
				<div
					className="flex-shrink-0 p-1"
					style={{ color: getColor('text-muted') }}
				>
					{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
				</div>
			</button>

			{/* Section Content */}
			<div
				className={`section-content overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
			>
				<div className="p-4 bg-void-bg-1">
					{children}
				</div>
			</div>

			{/* Section Footer (when expanded) */}
			{isExpanded && (
				<div className="px-4 py-2 bg-void-bg-2/50 border-t border-void-border-2 flex items-center justify-between">
					<div className="flex items-center gap-2">
						{isMarkedComplete ? (
							<div className="flex items-center gap-1 text-xs" style={{ color: getColor('success') }}>
								<CheckCircle size={14} />
								<span>Completed</span>
							</div>
						) : (
							<div className="flex items-center gap-1 text-xs" style={{ color: getColor('text-muted') }}>
								<Circle size={14} />
								<span>In progress</span>
							</div>
						)}
					</div>

					<button
						onClick={(e) => {
							e.stopPropagation();
							handleMarkComplete();
						}}
						className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
						style={{
							backgroundColor: isMarkedComplete ? getColor('bg-dark') : getColor('accent'),
							color: isMarkedComplete ? getColor('text-muted') : 'white',
						}}
					>
						{isMarkedComplete ? (
							<>
								<CheckCircle size={12} />
								<span>Mark Incomplete</span>
							</>
						) : (
							<>
								<CheckCircle size={12} />
								<span>Mark Complete</span>
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
};

// Helper function for border radius
function getBorderRadius(): string {
	return '12px';
}

// Progress Section - shows overall lesson progress
export interface ProgressSectionProps {
	totalSections: number;
	completedSections: number;
	estimatedTime?: string;
	onJumpToSection?: (sectionId: string) => void;
}

export const ProgressSection: React.FC<ProgressSectionProps> = ({
	totalSections,
	completedSections,
	estimatedTime,
	onJumpToSection,
}) => {
	const { theme, getColor } = useLessonTheme();
	const progress = totalSections > 0 ? (completedSections / totalSections) * 100 : 0;

	return (
		<div
			className="progress-section p-4 rounded-xl mb-6"
			style={{
				background: `linear-gradient(135deg, ${theme.colors.primary}10, ${theme.colors.secondary}10)`,
				border: `1px solid ${theme.colors.border}`,
			}}
		>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold" style={{ color: getColor('text') }}>
					Lesson Progress
				</h3>
				<span className="text-xs font-bold" style={{ color: getColor('accent') }}>
					{completedSections} / {totalSections}
				</span>
			</div>

			{/* Progress Bar */}
			<div className="h-2 bg-void-bg-4 rounded-full overflow-hidden mb-3">
				<div
					className="h-full transition-all duration-500 ease-out rounded-full"
					style={{
						width: `${progress}%`,
						background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.primary})`,
					}}
				/>
			</div>

			{/* Progress Details */}
			<div className="flex items-center justify-between text-xs" style={{ color: getColor('text-muted') }}>
				<span>{Math.round(progress)}% Complete</span>
				{estimatedTime && <span>Est. {estimatedTime}</span>}
			</div>

			{/* Quick Jump Buttons */}
			{onJumpToSection && totalSections > 5 && (
				<div className="mt-3 pt-3 border-t border-void-border-2">
					<p className="text-xs mb-2" style={{ color: getColor('text-muted') }}>
						Quick Jump:
					</p>
					<div className="flex flex-wrap gap-2">
						{['Intro', 'Concept', 'Example', 'Exercise', 'Summary'].slice(0, totalSections).map((section, idx) => (
							<button
								key={idx}
								onClick={() => onJumpToSection(`section-${idx}`)}
								className="px-2 py-1 rounded text-xs transition-all hover:opacity-80"
								style={{
									backgroundColor: idx < completedSections ? getColor('success') : getColor('bg-dark'),
									color: idx < completedSections ? 'white' : getColor('text-muted'),
								}}
							>
								{section}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// Table of Contents - shows all sections in a lesson
export interface TableOfContentsProps {
	sections: Array<{ id: string; title: string; isCompleted: boolean; isExpanded: boolean }>;
	onSectionClick: (sectionId: string) => void;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ sections, onSectionClick }) => {
	const { theme, getColor } = useLessonTheme();

	return (
		<div className="table-of-contents p-4 rounded-xl mb-6 bg-void-bg-2/50 border border-void-border-2">
			<h3 className="text-sm font-semibold mb-3" style={{ color: getColor('text') }}>
				Table of Contents
			</h3>
			<ul className="space-y-1">
				{sections.map((section) => (
					<li key={section.id}>
						<button
							onClick={() => onSectionClick(section.id)}
							className="w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-2 hover:bg-void-bg-3"
						>
							<div
								className="w-4 h-4 flex items-center justify-center"
								style={{ color: section.isCompleted ? getColor('success') : getColor('text-muted') }}
							>
								{section.isCompleted ? <CheckCircle size={14} /> : <Circle size={14} />}
							</div>
							<span
								className="text-sm"
								style={{
									color: section.isExpanded ? getColor('accent') : getColor('text'),
									fontWeight: section.isExpanded ? '500' : 'normal',
								}}
							>
								{section.title}
							</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
};

export default CollapsibleLessonSection;