/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, X, Sparkles, AlertCircle } from 'lucide-react';
import { useLessonTheme } from '../util/LessonThemeProvider.js';

export interface HintSystemProps {
	exerciseId: string;
	lessonId?: string;
	totalHints?: number;
	onHintRequest?: (level: number) => Promise<string>;
	threadId?: string;
	showHintCounter?: boolean;
	hints?: string[]; // Pre-defined hints
	onHintUsed?: (level: number) => void;
}

export interface Hint {
	level: number;
	text: string;
	usedAt: number;
}

// Hint level descriptions
const HINT_LEVELS = {
	1: {
		label: 'First Hint',
		description: 'A gentle nudge in the right direction',
		icon: Sparkles,
		color: 'blue',
	},
	2: {
		label: 'Second Hint',
		description: 'More specific guidance',
		icon: Sparkles,
		color: 'cyan',
	},
	3: {
		label: 'Third Hint',
		description: 'Nearly there!',
		icon: Lightbulb,
		color: 'amber',
	},
	4: {
		label: 'Solution',
		description: 'The full answer',
		icon: AlertCircle,
		color: 'emerald',
	},
} as const;

// Hint Component - Displays a single hint
interface HintItemProps {
	hint: Hint;
	levelInfo: typeof HINT_LEVELS[keyof typeof HINT_LEVELS];
	isExpanded: boolean;
	onToggle: () => void;
	onDismiss?: () => void;
	canDismiss?: boolean;
}

const HintItem: React.FC<HintItemProps> = ({
	hint,
	levelInfo,
	isExpanded,
	onToggle,
	onDismiss,
	canDismiss,
}) => {
	const { theme, getColor } = useLessonTheme();
	const Icon = levelInfo.icon;

	return (
		<div
			className="hint-item border rounded-lg overflow-hidden transition-all duration-300"
			style={{
				borderColor: isExpanded ? getColor('accent') : getColor('border'),
				backgroundColor: isExpanded ? `${theme.colors.primary}10` : 'transparent',
			}}
		>
			<button
				onClick={onToggle}
				className="w-full px-3 py-2 flex items-center justify-between hover:bg-void-bg-3 transition-colors"
			>
				<div className="flex items-center gap-2">
					<div className="p-1 rounded" style={{ backgroundColor: `${theme.colors.accent}20` }}>
						<Icon size={14} style={{ color: getColor('accent') }} />
					</div>
					<span className="text-xs font-medium" style={{ color: getColor('text') }}>
						Hint {hint.level}
					</span>
				</div>

				<div className="flex items-center gap-2">
					{onDismiss && canDismiss && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onDismiss();
							}}
							className="p-1 hover:bg-void-bg-4 rounded transition-colors"
						>
							<X size={14} style={{ color: getColor('text-muted') }} />
						</button>
					)}
					{isExpanded ? (
						<ChevronUp size={14} style={{ color: getColor('text-muted') }} />
					) : (
						<ChevronDown size={14} style={{ color: getColor('text-muted') }} />
					)}
				</div>
			</button>

			{isExpanded && (
				<div
					className="px-3 py-2 border-t"
					style={{
						borderColor: getColor('border'),
						backgroundColor: `${theme.colors.primary}5`,
					}}
				>
					<p className="text-sm leading-relaxed" style={{ color: getColor('text') }}>
						{hint.text}
					</p>
				</div>
			)}
		</div>
	);
};

// Progress indicator for hints
interface HintProgressProps {
	currentLevel: number;
	totalLevels: number;
}

const HintProgress: React.FC<HintProgressProps> = ({ currentLevel, totalLevels }) => {
	const { theme, getColor } = useLessonTheme();

	return (
		<div className="flex items-center gap-1">
			{Array.from({ length: totalLevels }, (_, i) => (
				<div
					key={i}
					className="w-2 h-2 rounded-full transition-all duration-300"
					style={{
						backgroundColor: i < currentLevel ? getColor('accent') : getColor('border'),
					}}
				/>
			))}
		</div>
	);
};

// Main Hint System Component
export const HintSystem: React.FC<HintSystemProps> = ({
	exerciseId,
	lessonId,
	totalHints = 4,
	onHintRequest,
	threadId,
	showHintCounter = true,
	hints,
	onHintUsed,
}) => {
	const { theme, getColor } = useLessonTheme();
	const [hintLevel, setHintLevel] = useState(0); // 0 = no hints requested yet
	const [usedHints, setUsedHints] = useState<Hint[]>([]);
	const [isRequesting, setIsRequesting] = useState(false);
	const [expandedHintLevel, setExpandedHintLevel] = useState<number | null>(null);
	const [showAllHints, setShowAllHints] = useState(false);

	// Track hint usage
	useEffect(() => {
		if (threadId && hintLevel > 0) {
			// In a real implementation, this would update the learning progress service
			console.log(`Hint ${hintLevel} used for exercise ${exerciseId} in lesson ${lessonId}`);
			onHintUsed?.(hintLevel);
		}
	}, [hintLevel, exerciseId, lessonId, threadId, onHintUsed]);

	// Default hints if none provided
	const defaultHints: string[] = useMemo(() => {
		return [
			'Think about what data structure or method would be most appropriate for this problem.',
			'Consider the core concept being practiced here. What approach typically works best?',
			'The solution involves using a specific pattern or method. Review the lesson material for similar examples.',
			'Here\'s the solution: [In a real implementation, this would show the complete solution]',
		];
	}, []);

	const availableHints = hints || defaultHints;
	const hasMoreHints = hintLevel < totalHints;
	const allHintsUsed = hintLevel >= totalHints;

	// Request next hint
	const handleRequestHint = async () => {
		if (!hasMoreHints || isRequesting) return;

		setIsRequesting(true);

		try {
			let hintText = '';

			if (onHintRequest) {
				hintText = await onHintRequest(hintLevel + 1);
			} else {
				// Use pre-defined hints
				hintText = availableHints[Math.min(hintLevel, availableHints.length - 1)];
			}

			const newLevel = hintLevel + 1;
			const newHint: Hint = {
				level: newLevel,
				text: hintText,
				usedAt: Date.now(),
			};

			setUsedHints(prev => [...prev, newHint]);
			setHintLevel(newLevel);
			setExpandedHintLevel(newLevel);

			// Auto-show all hints after first one is requested
			if (!showAllHints) {
				setShowAllHints(true);
			}
		} catch (error) {
			console.error('Error getting hint:', error);
		} finally {
			setIsRequesting(false);
		}
	};

	// Toggle hint expansion
	const handleToggleHint = (level: number) => {
		setExpandedHintLevel(expandedHintLevel === level ? null : level);
	};

	// Reset hints (e.g., when exercise is reset)
	const handleResetHints = () => {
		setHintLevel(0);
		setUsedHints([]);
		setExpandedHintLevel(null);
		setShowAllHints(false);
	};

	// Get level info for a hint level
	const getLevelInfo = (level: number) => {
		return HINT_LEVELS[level as keyof typeof HINT_LEVELS] || HINT_LEVELS[1];
	};

	return (
		<div className="hint-system space-y-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Lightbulb size={18} style={{ color: getColor('accent') }} />
					<h3 className="text-sm font-semibold" style={{ color: getColor('text') }}>
						Hints
					</h3>
				</div>

				{showHintCounter && (
					<div className="flex items-center gap-2">
						<HintProgress currentLevel={hintLevel} totalLevels={totalHints} />
						<span className="text-xs" style={{ color: getColor('text-muted') }}>
							{hintLevel}/{totalHints}
						</span>
					</div>
				)}
			</div>

			{/* Request Hint Button */}
			{hasMoreHints && (
				<button
					onClick={handleRequestHint}
					disabled={isRequesting}
					className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
					style={{
						background: `linear-gradient(135deg, ${theme.colors.accent}20, ${theme.colors.primary}20)`,
						border: `1px solid ${theme.colors.accent}40`,
						color: getColor('accent'),
					}}
				>
					{isRequesting ? (
						<>
							<div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
							<span>Getting hint...</span>
						</>
					) : (
						<>
							<Lightbulb size={16} />
							<span>Show Next Hint</span>
						</>
					)}
				</button>
			)}

			{/* All Hints Used Message */}
			{allHintsUsed && (
				<div
					className="p-3 rounded-lg text-center"
					style={{
						backgroundColor: `${theme.colors.success}10`,
						border: `1px solid ${theme.colors.success}30`,
					}}
				>
					<p className="text-sm" style={{ color: getColor('text-muted') }}>
						All hints have been used. Try to solve the exercise with what you've learned!
					</p>
				</div>
			)}

			{/* Used Hints List */}
			{usedHints.length > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium" style={{ color: getColor('text-muted') }}>
							Hints Revealed
						</span>
						<button
							onClick={() => setShowAllHints(!showAllHints)}
							className="text-xs transition-colors hover:opacity-80"
							style={{ color: getColor('accent') }}
						>
							{showAllHints ? 'Hide' : 'Show All'}
						</button>
					</div>

					{(showAllHints ? usedHints : [usedHints[usedHints.length - 1]]).map((hint) => (
						<HintItem
							key={hint.level}
							hint={hint}
							levelInfo={getLevelInfo(hint.level)}
							isExpanded={expandedHintLevel === hint.level}
							onToggle={() => handleToggleHint(hint.level)}
						/>
					))}
				</div>
			)}

			{/* Reset Button */}
			{usedHints.length > 0 && (
				<button
					onClick={handleResetHints}
					className="w-full text-xs py-2 transition-colors hover:opacity-80"
					style={{ color: getColor('text-muted') }}
				>
					Reset Hints
				</button>
			)}
		</div>
	);
};

// Inline Hint Button - Compact version for embedding in exercise blocks
export interface InlineHintButtonProps {
	exerciseId: string;
	hintLevel: number;
	onRequest: () => Promise<string>;
	onReset?: () => void;
}

export const InlineHintButton: React.FC<InlineHintButtonProps> = ({
	exerciseId,
	hintLevel,
	onRequest,
	onReset,
}) => {
	const { theme, getColor } = useLessonTheme();
	const [isExpanded, setIsExpanded] = useState(false);
	const [hintText, setHintText] = useState('');
	const [isRequesting, setIsRequesting] = useState(false);

	const handleRequest = async () => {
		if (isExpanded) {
			setIsExpanded(false);
			return;
		}

		setIsRequesting(true);
		try {
			const hint = await onRequest();
			setHintText(hint);
			setIsExpanded(true);
		} catch (error) {
			console.error('Error getting hint:', error);
		} finally {
			setIsRequesting(false);
		}
	};

	return (
		<div className="inline-hint-button">
			<button
				onClick={handleRequest}
				disabled={isRequesting}
				className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
				style={{
					backgroundColor: isExpanded ? `${theme.colors.accent}30` : `${theme.colors.accent}10`,
					border: `1px solid ${theme.colors.accent}30`,
					color: getColor('accent'),
				}}
			>
				{isRequesting ? (
					<div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
				) : isExpanded ? (
					<ChevronUp size={12} />
				) : (
					<Lightbulb size={12} />
				)}
				<span>Hint {hintLevel}</span>
			</button>

			{isExpanded && hintText && (
				<div
					className="mt-2 p-2 rounded-lg text-sm"
					style={{
						backgroundColor: `${theme.colors.primary}10`,
						border: `1px solid ${theme.colors.accent}20`,
					}}
				>
					{hintText}
				</div>
			)}
		</div>
	);
};

// Hint Popup - Floating hint overlay
export interface HintPopupProps {
	x: number;
	y: number;
	hint: string;
	level: number;
	onClose: () => void;
}

export const HintPopup: React.FC<HintPopupProps> = ({ x, y, hint, level, onClose }) => {
	const { theme, getColor } = useLessonTheme();
	const popupRef = useRef<HTMLDivElement>(null);

	// Close on escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	// Auto-position to stay within viewport
	const getPosition = () => {
		const popupWidth = 300;
		const popupHeight = 150;
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		let adjustedX = x;
		let adjustedY = y;

		if (x + popupWidth > screenWidth) {
			adjustedX = screenWidth - popupWidth - 10;
		}
		if (y + popupHeight > screenHeight) {
			adjustedY = y - popupHeight - 10;
		}

		return { x: adjustedX, y: adjustedY };
	};

	const position = getPosition();

	return (
		<div
			ref={popupRef}
			className="fixed z-50 p-4 rounded-lg shadow-xl max-w-xs"
			style={{
				left: position.x,
				top: position.y,
				backgroundColor: theme.colors.background,
				border: `1px solid ${theme.colors.accent}`,
				boxShadow: `0 10px 40px ${theme.colors.accent}30`,
			}}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center gap-2">
					<div
						className="p-1.5 rounded"
						style={{ backgroundColor: `${theme.colors.accent}20` }}
					>
						<Lightbulb size={14} style={{ color: getColor('accent') }} />
					</div>
					<span className="text-xs font-bold" style={{ color: getColor('accent') }}>
						Hint {level}
					</span>
				</div>
				<button
					onClick={onClose}
					className="p-1 hover:bg-void-bg-4 rounded transition-colors"
				>
					<X size={14} style={{ color: getColor('text-muted') }} />
				</button>
			</div>
			<p className="text-sm leading-relaxed" style={{ color: getColor('text') }}>
				{hint}
			</p>
		</div>
	);
};

export default HintSystem;