/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Target, BookOpen, TrendingUp, Clock, Flame, Star, ChevronRight, X, Award, Zap, Calendar, BarChart3, CheckCircle2, Brain } from 'lucide-react';
import { useAccessor, useChatThreadsState } from '../util/services.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';

interface LearningDashboardProps {
	threadId: string;
	onClose: () => void;
}

interface QuizResult {
	quizId: string;
	title: string;
	score: number;
	totalPoints: number;
	percentage: number;
	completedAt: number;
}

interface ConceptProgress {
	name: string;
	masteryLevel: number;
	exercisesCompleted: number;
	timeSpent: number;
	lastPracticed: number;
}

interface LearningStreak {
	current: number;
	longest: number;
	daysSinceLastPractice: number;
}

interface Badge {
	id: string;
	name: string;
	description: string;
	icon: string;
	earned: boolean;
	earnedAt?: number;
	progress?: number;
}

// Calculate learning streak
function calculateStreak(progress: any): LearningStreak {
	const activityDates = Object.entries(progress)
		.filter(([_, data]: [string, any]) => data?.lastAccessed)
		.map(([_, data]: [string, any]) => new Date(data.lastAccessed).toDateString())
		.filter((date, i, arr) => arr.indexOf(date) === i)
		.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

	const today = new Date().toDateString();
	const yesterday = new Date(Date.now() - 86400000).toDateString();

	let currentStreak = 0;
	let longestStreak = 0;
	let tempStreak = 0;

	for (let i = 0; i < activityDates.length; i++) {
		const currentDate = new Date(activityDates[i]);
		const prevDate = i > 0 ? new Date(activityDates[i - 1]) : null;

		if (prevDate) {
			const diffDays = Math.floor((prevDate.getTime() - currentDate.getTime()) / 86400000);
			if (diffDays <= 1) {
				tempStreak++;
			} else {
				tempStreak = 1;
			}
		} else {
			tempStreak = 1;
		}

		if (tempStreak > longestStreak) longestStreak = tempStreak;

		if (i === 0) {
			const lastActiveDiff = Math.floor((new Date().getTime() - currentDate.getTime()) / 86400000);
			if (lastActiveDiff <= 1) currentStreak = tempStreak;
		}
	}

	const daysSinceLastPractice = activityDates.length > 0
		? Math.floor((new Date().getTime() - new Date(activityDates[0]).getTime()) / 86400000)
		: Infinity;

	return { current: currentStreak, longest: longestStreak, daysSinceLastPractice };
}

// Available badges
function getAvailableBadges(progress: any): Badge[] {
	const quizzes = Object.values(progress).filter((p: any) => p?.quizResults);
	const quizCount = quizzes.reduce((acc: number, q: any) => acc + (q?.quizResults?.length || 0), 0);
	const totalTime = Object.values(progress).reduce((acc: number, p: any) => acc + (p?.timeSpent || 0), 0);
	const exercises = Object.values(progress).filter((p: any) => p?.exercisesCompleted);
	const exerciseCount = exercises.reduce((acc: number, e: any) => acc + (e?.exercisesCompleted || 0), 0);

	const badges: Badge[] = [
		{
			id: 'first-quiz',
			name: 'Quiz Novice',
			description: 'Complete your first quiz',
			icon: '\u{1F3AF}',
			earned: quizCount >= 1,
		},
		{
			id: 'quiz-master',
			name: 'Quiz Master',
			description: 'Complete 10 quizzes',
			icon: '\u{1F3C6}',
			earned: quizCount >= 10,
			progress: quizCount,
		},
		{
			id: 'speed-learner',
			name: 'Speed Learner',
			description: 'Spend 60 minutes learning',
			icon: '\u{26A1}',
			earned: totalTime >= 60 * 60 * 1000,
			progress: Math.min(100, Math.floor((totalTime / (60 * 60 * 1000)) * 100)),
		},
		{
			id: 'practice-maker',
			name: 'Practice Makes Perfect',
			description: 'Complete 20 exercises',
			icon: '💪',
			earned: exerciseCount >= 20,
			progress: exerciseCount,
		},
		{
			id: 'streak-3',
			name: '3-Day Streak',
			description: 'Practice for 3 days in a row',
			icon: '🔥',
			earned: false, // Calculated from streak
		},
		{
			id: 'streak-7',
			name: 'Week Warrior',
			description: 'Practice for 7 days in a row',
			icon: '🔥🔥',
			earned: false, // Calculated from streak
		},
	];

	return badges;
}

// Tab content type
type DashboardTab = 'overview' | 'concepts' | 'quizzes' | 'badges';

export const LearningDashboard: React.FC<LearningDashboardProps> = ({ threadId, onClose }) => {
	const accessor = useAccessor();
	const chatThreadsState = useChatThreadsState();
	const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
	const [progress, setProgress] = useState<any>(null);
	const [loading, setLoading] = useState(true);

	const learningProgressService = accessor.get('ILearningProgressService');

	// Load progress data
	useEffect(() => {
		const loadProgress = async () => {
			setLoading(true);
			try {
				if (learningProgressService?.getProgress) {
					const data = await learningProgressService.getProgress(threadId);
					setProgress(data);
				}
			} catch (error) {
				console.error('[LearningDashboard] Error loading progress:', error);
			} finally {
				setLoading(false);
			}
		};
		loadProgress();
	}, [threadId, learningProgressService]);

	// Calculate streak
	const streak = useMemo(() => progress ? calculateStreak(progress) : { current: 0, longest: 0, daysSinceLastPractice: Infinity }, [progress]);

	// Get quizzes
	const quizzes = useMemo(() => {
		if (!progress) return [];
		const allQuizzes: QuizResult[] = [];
		Object.values(progress).forEach((p: any) => {
			if (p?.quizResults) {
				allQuizzes.push(...p.quizResults);
			}
		});
		return allQuizzes.sort((a, b) => b.completedAt - a.completedAt);
	}, [progress]);

	// Get badges
	const badges = useMemo(() => getAvailableBadges(progress || {}), [progress]);
	const earnedBadges = badges.filter(b => b.earned);
	const unearnedBadges = badges.filter(b => !b.earned);

	// Calculate total time
	const totalTime = useMemo(() => {
		if (!progress) return 0;
		return Object.values(progress).reduce((acc: number, p: any) => acc + (p?.timeSpent || 0), 0);
	}, [progress]);

	// Calculate quiz average
	const quizAverage = useMemo(() => {
		if (quizzes.length === 0) return 0;
		return quizzes.reduce((sum, q) => sum + q.percentage, 0) / quizzes.length;
	}, [quizzes]);

	const formatTime = (ms: number): string => {
		const minutes = Math.floor(ms / 60000);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	if (loading) {
		return (
			<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
				<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl p-8 shadow-2xl">
					<div className="flex items-center gap-3">
						<div className="w-6 h-6 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-void-fg-2">Loading learning progress...</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
			<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
				{/* Header */}
				<div className="px-6 py-4 border-b border-void-border-2 flex items-center justify-between bg-void-bg-2">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-void-accent/20">
							<Trophy size={20} className="text-void-accent" />
						</div>
						<div>
							<h2 className="text-lg font-bold text-void-fg-1">My Learning Progress</h2>
							<p className="text-xs text-void-fg-3">Track your learning journey</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
					>
						<X size={20} className="text-void-fg-3" />
					</button>
				</div>

				{/* Tabs */}
				<div className="px-6 pt-4 border-b border-void-border-2 bg-void-bg-2">
					<div className="flex gap-1">
						{(['overview', 'concepts', 'quizzes', 'badges'] as DashboardTab[]).map((tab) => (
							<button
								key={tab}
								onClick={() => setActiveTab(tab)}
								className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
									activeTab === tab
										? 'bg-void-accent text-white'
										: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3'
								}`}
							>
								{tab.charAt(0).toUpperCase() + tab.slice(1)}
							</button>
						))}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-6">
					{activeTab === 'overview' && (
						<div className="space-y-6">
							{/* Stats Grid */}
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div className="p-4 bg-void-bg-2 rounded-xl border border-void-border-2">
									<div className="flex items-center gap-2 mb-2">
										<Flame size={16} className="text-orange-500" />
										<span className="text-xs text-void-fg-4 uppercase tracking-wider">Streak</span>
									</div>
									<div className="text-2xl font-bold text-void-fg-1">{streak.current} days</div>
									<div className="text-xs text-void-fg-3 mt-1">Longest: {streak.longest} days</div>
								</div>
								<div className="p-4 bg-void-bg-2 rounded-xl border border-void-border-2">
									<div className="flex items-center gap-2 mb-2">
										<BarChart3 size={16} className="text-blue-500" />
										<span className="text-xs text-void-fg-4 uppercase tracking-wider">Quizzes</span>
									</div>
									<div className="text-2xl font-bold text-void-fg-1">{quizzes.length}</div>
									<div className="text-xs text-void-fg-3 mt-1">Avg: {Math.round(quizAverage)}%</div>
								</div>
								<div className="p-4 bg-void-bg-2 rounded-xl border border-void-border-2">
									<div className="flex items-center gap-2 mb-2">
										<Clock size={16} className="text-green-500" />
										<span className="text-xs text-void-fg-4 uppercase tracking-wider">Time</span>
									</div>
									<div className="text-2xl font-bold text-void-fg-1">{formatTime(totalTime)}</div>
									<div className="text-xs text-void-fg-3 mt-1">Total learning</div>
								</div>
								<div className="p-4 bg-void-bg-2 rounded-xl border border-void-border-2">
									<div className="flex items-center gap-2 mb-2">
										<Award size={16} className="text-purple-500" />
										<span className="text-xs text-void-fg-4 uppercase tracking-wider">Badges</span>
									</div>
									<div className="text-2xl font-bold text-void-fg-1">{earnedBadges.length}</div>
									<div className="text-xs text-void-fg-3 mt-1">of {badges.length}</div>
								</div>
							</div>

							{/* Recent Quizzes */}
							{quizzes.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-void-fg-1 mb-3">Recent Quizzes</h3>
									<div className="space-y-2">
										{quizzes.slice(0, 5).map((quiz) => (
											<div
												key={quiz.quizId}
												className="flex items-center justify-between p-3 bg-void-bg-2 rounded-lg border border-void-border-2"
											>
												<div className="flex items-center gap-3">
													<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
														quiz.percentage >= 80
															? 'bg-green-500/20 text-green-500'
															: quiz.percentage >= 60
															? 'bg-yellow-500/20 text-yellow-500'
															: 'bg-red-500/20 text-red-500'
													}`}>
														<Target size={16} />
													</div>
													<div>
														<div className="text-sm font-medium text-void-fg-1">{quiz.title || 'Untitled Quiz'}</div>
														<div className="text-xs text-void-fg-4">
															{new Date(quiz.completedAt).toLocaleDateString()}
														</div>
													</div>
												</div>
												<div className="text-right">
													<div className="text-lg font-bold text-void-fg-1">{quiz.percentage}%</div>
													<div className="text-xs text-void-fg-4">{quiz.score}/{quiz.totalPoints} pts</div>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* No Data State */}
							{quizzes.length === 0 && (
								<div className="text-center py-12">
									<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-void-bg-3 flex items-center justify-center">
										<Brain size={32} className="text-void-fg-4" />
									</div>
									<h3 className="text-lg font-semibold text-void-fg-1 mb-2">Start Learning Today!</h3>
									<p className="text-sm text-void-fg-3 mb-4">
										Complete your first quiz or exercise to start tracking your progress.
									</p>
								</div>
							)}
						</div>
					)}

					{activeTab === 'concepts' && (
						<div className="space-y-4">
							<div className="text-center py-12">
								<BookOpen size={48} className="mx-auto mb-4 text-void-fg-4" />
								<h3 className="text-lg font-semibold text-void-fg-1 mb-2">Concept Mastery</h3>
								<p className="text-sm text-void-fg-3">
									Track which concepts you've mastered and which need more practice.
								</p>
							</div>
						</div>
					)}

					{activeTab === 'quizzes' && (
						<div className="space-y-3">
							{quizzes.length > 0 ? (
								quizzes.map((quiz, idx) => (
									<div
										key={quiz.quizId}
										className="flex items-center justify-between p-4 bg-void-bg-2 rounded-xl border border-void-border-2"
									>
										<div className="flex items-center gap-3">
											<div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
												quiz.percentage >= 80
													? 'bg-green-500/20 text-green-500'
													: quiz.percentage >= 60
													? 'bg-yellow-500/20 text-yellow-500'
													: 'bg-red-500/20 text-red-500'
											}`}>
												<Target size={20} />
											</div>
											<div>
												<div className="text-sm font-medium text-void-fg-1">{quiz.title || `Quiz #${quizzes.length - idx}`}</div>
												<div className="text-xs text-void-fg-4">
													{new Date(quiz.completedAt).toLocaleString()}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-4">
											<div className="text-right">
												<div className="text-xl font-bold text-void-fg-1">{quiz.percentage}%</div>
												<div className="text-xs text-void-fg-4">{quiz.score}/{quiz.totalPoints}</div>
											</div>
											{quiz.percentage >= 80 && <CheckCircle2 size={20} className="text-green-500" />}
										</div>
									</div>
								))
							) : (
								<div className="text-center py-12">
									<Target size={48} className="mx-auto mb-4 text-void-fg-4" />
									<h3 className="text-lg font-semibold text-void-fg-1 mb-2">No Quizzes Yet</h3>
									<p className="text-sm text-void-fg-3">
										Complete quizzes to see your quiz history here.
									</p>
								</div>
							)}
						</div>
					)}

					{activeTab === 'badges' && (
						<div className="space-y-6">
							{earnedBadges.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-void-fg-1 mb-3 flex items-center gap-2">
										<Star size={16} className="text-yellow-500" />
										Earned Badges ({earnedBadges.length})
									</h3>
									<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
										{earnedBadges.map((badge) => (
											<div
												key={badge.id}
												className="p-4 bg-gradient-to-br from-void-accent/20 to-void-accent/10 rounded-xl border border-void-accent/30"
											>
												<div className="text-3xl mb-2">{badge.icon}</div>
												<div className="text-sm font-semibold text-void-fg-1">{badge.name}</div>
												<div className="text-xs text-void-fg-3 mt-1">{badge.description}</div>
											</div>
										))}
									</div>
								</div>
							)}

							{unearnedBadges.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-void-fg-1 mb-3">Badges to Earn</h3>
									<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
										{unearnedBadges.map((badge) => (
											<div
												key={badge.id}
												className="p-4 bg-void-bg-2 rounded-xl border border-void-border-2 opacity-60"
											>
												<div className="text-3xl mb-2 grayscale">{badge.icon}</div>
												<div className="text-sm font-medium text-void-fg-2">{badge.name}</div>
												<div className="text-xs text-void-fg-4 mt-1">{badge.description}</div>
												{badge.progress !== undefined && (
													<div className="mt-2 h-1.5 bg-void-bg-3 rounded-full overflow-hidden">
														<div
															className="h-full bg-void-accent transition-all"
															style={{ width: `${Math.min(100, (badge.progress / 10) * 100)}%` }}
														/>
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{badges.length === 0 && (
								<div className="text-center py-12">
									<Award size={48} className="mx-auto mb-4 text-void-fg-4" />
									<h3 className="text-lg font-semibold text-void-fg-1 mb-2">No Badges Yet</h3>
									<p className="text-sm text-void-fg-3">
										Complete learning activities to earn badges!
									</p>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t border-void-border-2 bg-void-bg-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-xs text-void-fg-4">
							<Calendar size={14} />
							<span>Last practiced: {streak.daysSinceLastPractice === Infinity ? 'Never' : streak.daysSinceLastPractice === 0 ? 'Today' : `${streak.daysSinceLastPractice} days ago`}</span>
						</div>
						<button
							onClick={onClose}
							className="px-4 py-2 bg-void-bg-3 hover:bg-void-bg-4 text-void-fg-1 rounded-lg text-sm font-medium transition-colors"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LearningDashboard;