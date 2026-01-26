/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import {
	BookOpen,
	Trophy,
	Target,
	Clock,
	Flame,
	BarChart3,
	CheckCircle2,
	TrendingUp,
	Award,
	Star,
	RefreshCw,
} from 'lucide-react';
import { useLessonTheme } from '../util/LessonThemeProvider.js';
import { useAccessor } from '../util/services.js';

export interface ProgressTrackerProps {
	lessonId: string;
	threadId?: string;
	showDetailed?: boolean;
	showStreak?: boolean;
	showBadges?: boolean;
}

export interface LessonStats {
	totalSections: number;
	completedSections: number;
	readSections: string[];
	exercisesAttempted: number;
	exercisesSolved: number;
	totalScore: number;
	timeSpent: number; // in seconds
	lastAccessed: number;
}

export interface QuizStats {
	totalQuizzes: number;
	quizzesCompleted: number;
	averageScore: number;
	highestScore: number;
}

export interface StreakInfo {
	currentStreak: number;
	longestStreak: number;
	lastLearningDate: number;
}

export interface Badge {
	id: string;
	name: string;
	description: string;
	icon: string;
	unlockedAt: number;
	category: 'lessons' | 'exercises' | 'quizzes' | 'streaks' | 'milestones';
}

// Progress Tracker Component
export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
	lessonId,
	threadId,
	showDetailed = false,
	showStreak = true,
	showBadges = true,
}) => {
	const { theme, getColor } = useLessonTheme();
	const accessor = useAccessor();
	const [stats, setStats] = useState<LessonStats | null>(null);
	const [quizStats, setQuizStats] = useState<QuizStats | null>(null);
	const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
	const [badges, setBadges] = useState<Badge[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// In a real implementation, this would fetch from the LearningProgressService
	useEffect(() => {
		// Simulate loading progress data
		setTimeout(() => {
			setStats({
				totalSections: 5,
				completedSections: 2,
				readSections: ['section-0', 'section-1', 'section-2'],
				exercisesAttempted: 3,
				exercisesSolved: 2,
				totalScore: 85,
				timeSpent: 180, // 3 minutes
				lastAccessed: Date.now(),
			});

			setQuizStats({
				totalQuizzes: 2,
				quizzesCompleted: 1,
				averageScore: 75,
				highestScore: 85,
			});

			setStreakInfo({
				currentStreak: 3,
				longestStreak: 7,
				lastLearningDate: Date.now(),
			});

			setBadges([
				{
					id: 'first-lesson',
					name: 'First Steps',
					description: 'Complete your first lesson',
					icon: '🎯',
					unlockedAt: Date.now() - 86400000,
					category: 'lessons',
				},
				{
					id: 'streak-3',
					name: 'On Fire!',
					description: '3 day learning streak',
					icon: '🔥',
					unlockedAt: Date.now(),
					category: 'streaks',
				},
			]);

			setIsLoading(false);
		}, 500);
	}, [lessonId, threadId]);

	const sectionsProgress = stats ? (stats.completedSections / stats.totalSections) * 100 : 0;
	const exercisesProgress = stats ? (stats.exercisesSolved / stats.exercisesAttempted) * 100 : 0;

	const formatTime = (seconds: number): string => {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	};

	if (isLoading) {
		return (
			<div className="progress-tracker p-4 rounded-xl bg-void-bg-2/50 border border-void-border-2">
				<div className="flex items-center justify-center gap-2">
					<RefreshCw className="w-4 h-4 animate-spin" style={{ color: getColor('accent') }} />
					<span className="text-sm" style={{ color: getColor('text-muted') }}>Loading progress...</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className="progress-tracker space-y-4"
			style={{ backgroundColor: `${theme.colors.background}30`, borderRadius: '12px' }}
		>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<BarChart3 size={20} style={{ color: getColor('accent') }} />
					<h3 className="text-sm font-semibold" style={{ color: getColor('text') }}>
						Lesson Progress
					</h3>
				</div>
				{stats && (
					<div className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: `${getColor('accent')}20`, color: getColor('accent') }}>
						<Target size={12} />
						<span>{Math.round(sectionsProgress)}%</span>
					</div>
				)}
			</div>

			{/* Main Progress Bar */}
			{stats && (
				<div className="space-y-2">
					<div className="flex items-center justify-between text-xs">
						<span style={{ color: getColor('text-muted') }}>Sections</span>
						<span style={{ color: getColor('text') }}>
							{stats.completedSections} / {stats.totalSections}
						</span>
					</div>
					<div className="h-2 bg-void-bg-4 rounded-full overflow-hidden">
						<div
							className="h-full transition-all duration-500 ease-out rounded-full"
							style={{
								width: `${sectionsProgress}%`,
								background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.primary})`,
							}}
						/>
					</div>
				</div>
			)}

			{/* Detailed Stats */}
			{showDetailed && stats && quizStats && (
				<div className="grid grid-cols-2 gap-3">
					{/* Time Spent */}
					<div className="flex items-center gap-2 p-2 rounded-lg bg-void-bg-2">
						<Clock size={16} style={{ color: getColor('text-muted') }} />
						<div>
							<div className="text-xs" style={{ color: getColor('text-muted') }}>Time</div>
							<div className="text-sm font-semibold" style={{ color: getColor('text') }}>
								{formatTime(stats.timeSpent)}
							</div>
						</div>
					</div>

					{/* Exercises */}
					<div className="flex items-center gap-2 p-2 rounded-lg bg-void-bg-2">
						<BookOpen size={16} style={{ color: getColor('text-muted') }} />
						<div>
							<div className="text-xs" style={{ color: getColor('text-muted') }}>Exercises</div>
							<div className="text-sm font-semibold" style={{ color: getColor('text') }}>
								{stats.exercisesSolved} / {stats.exercisesAttempted}
							</div>
						</div>
					</div>

					{/* Quiz Score */}
					<div className="flex items-center gap-2 p-2 rounded-lg bg-void-bg-2">
						<Trophy size={16} style={{ color: getColor('text-muted') }} />
						<div>
							<div className="text-xs" style={{ color: getColor('text-muted') }}>Score</div>
							<div className="text-sm font-semibold" style={{ color: getColor('text') }}>
								{Math.round(quizStats.averageScore)}%
							</div>
						</div>
					</div>

					{/* Best Score */}
					<div className="flex items-center gap-2 p-2 rounded-lg bg-void-bg-2">
						<Star size={16} style={{ color: getColor('text-muted') }} />
						<div>
							<div className="text-xs" style={{ color: getColor('text-muted') }}>Best</div>
							<div className="text-sm font-semibold" style={{ color: getColor('text') }}>
								{Math.round(quizStats.highestScore)}%
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Streak Info */}
			{showStreak && streakInfo && (
				<div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: `${theme.colors.accent}10`, border: `1px solid ${theme.colors.accent}30` }}>
					<div className="flex-shrink-0">
						<Flame size={24} style={{ color: getColor('accent') }} />
					</div>
					<div className="flex-1">
						<div className="flex items-center justify-between">
							<span className="text-xs" style={{ color: getColor('text-muted') }}>Current Streak</span>
							<span className="text-xs" style={{ color: getColor('text-muted') }}>Best: {streakInfo.longestStreak}</span>
						</div>
						<div className="text-lg font-bold" style={{ color: getColor('accent') }}>
							{streakInfo.currentStreak} day{streakInfo.currentStreak !== 1 ? 's' : ''}
						</div>
					</div>
				</div>
			)}

			{/* Badges */}
			{showBadges && badges.length > 0 && (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Award size={16} style={{ color: getColor('text-muted') }} />
						<span className="text-xs font-medium" style={{ color: getColor('text-muted') }}>
							Badges Earned
						</span>
					</div>
					<div className="flex gap-2">
						{badges.map((badge) => (
							<div
								key={badge.id}
								className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
								style={{
									background: `linear-gradient(135deg, ${theme.colors.primary}30, ${theme.colors.secondary}30)`,
									border: `1px solid ${theme.colors.accent}30`,
								}}
								title={badge.name}
							>
								{badge.icon}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Continue Learning Button */}
			{stats && stats.completedSections < stats.totalSections && (
				<button
					className="w-full py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
					style={{
						background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.primary})`,
						color: 'white',
					}}
				>
					Continue Learning
				</button>
			)}
		</div>
	);
};

// Mini Progress Bar (compact version)
export interface MiniProgressBarProps {
	progress: number;
	showLabel?: boolean;
	size?: 'small' | 'medium' | 'large';
	color?: string;
}

export const MiniProgressBar: React.FC<MiniProgressBarProps> = ({
	progress,
	showLabel = true,
	size = 'medium',
	color,
}) => {
	const { theme, getColor } = useLessonTheme();
	const progressColor = color || getColor('accent');

	const height = size === 'small' ? '4px' : size === 'medium' ? '8px' : '12px';

	return (
		<div className="mini-progress-bar space-y-1">
			{showLabel && (
				<div className="flex items-center justify-between text-xs">
					<span style={{ color: getColor('text-muted') }}>Progress</span>
					<span style={{ color: getColor('text') }}>{Math.round(progress)}%</span>
				</div>
			)}
			<div className={`rounded-full overflow-hidden ${size === 'small' ? 'bg-void-bg-3' : 'bg-void-bg-4'}`} style={{ height }}>
				<div
					className="h-full transition-all duration-300 ease-out"
					style={{
						width: `${Math.min(progress, 100)}%`,
						backgroundColor: progressColor,
					}}
				/>
			</div>
		</div>
	);
};

// Section Completion Tracker
export interface SectionCompletionTrackerProps {
	sections: Array<{ id: string; title: string; completed: boolean }>;
	onSectionClick?: (sectionId: string) => void;
}

export const SectionCompletionTracker: React.FC<SectionCompletionTrackerProps> = ({
	sections,
	onSectionClick,
}) => {
	const { theme, getColor } = useLessonTheme();
	const completedCount = sections.filter(s => s.completed).length;
	const progress = sections.length > 0 ? (completedCount / sections.length) * 100 : 0;

	return (
		<div className="section-completion-tracker space-y-3">
			{/* Overall Progress */}
			<div className="flex items-center gap-3">
				<CheckCircle2
					size={20}
					style={{
						color: progress === 100 ? getColor('success') : getColor('text-muted'),
					}}
				/>
				<div className="flex-1">
					<div className="flex items-center justify-between mb-1">
						<span className="text-sm" style={{ color: getColor('text') }}>
							{completedCount} of {sections.length} sections
						</span>
						<span className="text-xs font-bold" style={{ color: getColor('accent') }}>
							{Math.round(progress)}%
						</span>
					</div>
					<div className="h-2 bg-void-bg-4 rounded-full overflow-hidden">
						<div
							className="h-full transition-all duration-300 ease-out rounded-full"
							style={{
								width: `${progress}%`,
								background: `linear-gradient(90deg, ${theme.colors.success}, ${theme.colors.accent})`,
							}}
						/>
					</div>
				</div>
			</div>

			{/* Section List */}
			<div className="space-y-1">
				{sections.map((section, idx) => (
					<button
						key={section.id}
						onClick={() => onSectionClick?.(section.id)}
						className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:bg-void-bg-3"
					>
						<span className="text-xs w-5" style={{ color: getColor('text-muted') }}>
							{idx + 1}.
						</span>
						<div
							className="w-4 h-4 flex items-center justify-center"
							style={{ color: section.completed ? getColor('success') : getColor('text-muted') }}
						>
							{section.completed ? <CheckCircle2 size={14} /> : <div className="w-3 h-3 rounded-full border border-current" />}
						</div>
						<span
							className="text-sm flex-1 text-left"
							style={{
								color: section.completed ? getColor('text-muted') : getColor('text'),
								textDecoration: section.completed ? 'line-through' : 'none',
							}}
						>
							{section.title}
						</span>
					</button>
				))}
			</div>
		</div>
	);
};

// Score Card Component
export interface ScoreCardProps {
	score: number;
	maxScore: number;
	previousScore?: number;
	showTrend?: boolean;
	label?: string;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
	score,
	maxScore,
	previousScore,
	showTrend = true,
	label = 'Score',
}) => {
	const { theme, getColor } = useLessonTheme();
	const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
	const hasImproved = previousScore !== undefined && score > previousScore;
	const hasDeclined = previousScore !== undefined && score < previousScore;
	const trend = hasImproved ? 'up' : hasDeclined ? 'down' : 'same';

	return (
		<div
			className="score-card p-4 rounded-xl"
			style={{
				background: `linear-gradient(135deg, ${theme.colors.primary}15, ${theme.colors.accent}15)`,
				border: `1px solid ${theme.colors.accent}30`,
			}}
		>
			<div className="flex items-start justify-between">
				<div>
					<div className="text-xs mb-1" style={{ color: getColor('text-muted') }}>{label}</div>
					<div className="text-2xl font-bold" style={{ color: getColor('text') }}>
						{score} <span className="text-sm font-normal" style={{ color: getColor('text-muted') }}>/ {maxScore}</span>
					</div>
					<div
						className={`text-sm font-semibold ${
							percentage >= 80 ? 'text-green-500' :
							percentage >= 50 ? 'text-amber-500' :
							'text-red-500'
						}`}
					>
						{Math.round(percentage)}%
					</div>
				</div>

				{showTrend && previousScore !== undefined && (
					<div
						className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
						style={{
							backgroundColor: trend === 'up' ? `${getColor('success')}20` : trend === 'down' ? `${getColor('error')}20` : `${getColor('text-muted')}20`,
							color: trend === 'up' ? getColor('success') : trend === 'down' ? getColor('error') : getColor('text-muted'),
						}}
					>
						<TrendingUp size={12} className={trend === 'down' ? 'rotate-180' : ''} />
						<span>{Math.abs(score - previousScore)}</span>
					</div>
				)}
			</div>

			{/* Visual Bar */}
			<div className="mt-3 h-1.5 bg-void-bg-4 rounded-full overflow-hidden">
				<div
					className="h-full transition-all duration-500 ease-out"
					style={{
						width: `${percentage}%`,
						background: `linear-gradient(90deg, ${theme.colors.success}, ${theme.colors.accent}, ${theme.colors.error})`,
						backgroundSize: '200% 100%',
						backgroundPosition: `${percentage}% 0`,
					}}
				/>
			</div>
		</div>
	);
};

export default ProgressTracker;