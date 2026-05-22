/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Trophy, Flame, Star, X, Zap, CheckCircle2, Brain, Map, Layout, Layers, BookOpen, Lock } from 'lucide-react';
import { useAccessor } from '../util/services.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';

interface LearningDashboardProps {
	threadId: string;
	onClose: () => void;
}

type DashboardTab = 'overview' | 'concepts' | 'quizzes' | 'badges';

const formatTime = (ms: number): string => {
	const minutes = Math.floor(ms / 60000);
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

export const LearningDashboard: React.FC<LearningDashboardProps> = ({ threadId, onClose }) => {
	const accessor = useAccessor();
	const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
	const [stats, setStats] = useState<any>(null);
	const [loading, setLoading] = useState(true);

	const learningProgressService = accessor.get('ILearningProgressService');

	useEffect(() => {
		const updateData = () => {
			const globalStats = learningProgressService.getGlobalStats();
			const threadProgress = learningProgressService.getThreadProgress(threadId);
			setStats({ global: globalStats, thread: threadProgress });
			setLoading(false);
		};

		updateData();
		const disposable = learningProgressService.onDidChangeState(() => updateData());
		return () => disposable.dispose();
	}, [threadId, learningProgressService]);

	if (loading) return null;

	const global = stats?.global;
	const thread = stats?.thread;

	// Compute real concept data from lessons
	const lessons = thread?.lessons || {};
	const lessonEntries = Object.values(lessons) as any[];
	const conceptMastery: Record<string, { score: number; attempts: number; lastAccessed: number }> = {};
	lessonEntries.forEach((lesson: any) => {
		const title = lesson.title || '';
		const quizzes = lesson.quizResults || [];
		const avgScore = quizzes.length
			? quizzes.reduce((acc: number, q: any) => acc + (q.score || 0), 0) / quizzes.length
			: lesson.completed ? 100 : 0;
		const attempts = quizzes.length || (lesson.completed ? 1 : 0);
		if (title) {
			conceptMastery[title] = { score: Math.round(avgScore), attempts, lastAccessed: lesson.lastAccessed || 0 };
		}
	});
	const conceptList = Object.entries(conceptMastery)
		.sort((a, b) => b[1].lastAccessed - a[1].lastAccessed)
		.map(([name, data]) => ({
			name,
			level: Math.min(5, Math.ceil(data.score / 20)),
			score: data.score,
			attempts: data.attempts,
			color: data.score >= 80 ? 'border-green-500' : data.score >= 50 ? 'border-void-accent' : 'border-yellow-500',
			isLocked: data.score === 0 && data.attempts === 0,
		}));

	const quizzes = thread?.quizzes || [];
	const badges = thread?.badges || [];

	const badgeDefinitions: Record<string, { name: string; desc: string; icon: string }> = {
		'first-lesson': { name: 'First Steps', desc: 'Completed your first lesson', icon: '🎓' },
		'first-quiz': { name: 'Quiz Taker', desc: 'Completed your first quiz', icon: '📝' },
		'quiz-master': { name: 'Quiz Master', desc: 'Completed 10 quizzes', icon: '🏆' },
		'practice-maker': { name: 'Practice Maker', desc: 'Solved 20 exercises', icon: '💪' },
		'streak-3': { name: 'On Fire', desc: '3-day learning streak', icon: '🔥' },
		'streak-7': { name: 'Unstoppable', desc: '7-day learning streak', icon: '🚀' },
	};

	const earnedBadges = badges.map((b: any) => ({
		id: b.id,
		name: badgeDefinitions[b.id]?.name || b.name,
		desc: badgeDefinitions[b.id]?.desc || b.description,
		icon: badgeDefinitions[b.id]?.icon || b.icon || '🏅',
		earned: true,
		unlockedAt: b.unlockedAt,
	}));
	const allBadges = [
		...earnedBadges,
		...Object.entries(badgeDefinitions)
			.filter(([id]) => !badges.some((b: any) => b.id === id))
			.map(([id, def]) => ({ id, name: def.name, desc: def.desc, icon: def.icon, earned: false, unlockedAt: null })),
	];

	return (
		<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
			<div className="bg-void-bg-1 border border-void-border-2 rounded-[32px] shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
				<div className="flex h-full">
					{/* Left Nav */}
					<div className="w-64 bg-void-bg-2 border-r border-void-border-2 flex flex-col p-6">
						<div className="flex items-center gap-3 mb-10 px-2">
							<div className="p-2.5 rounded-2xl bg-void-accent shadow-lg shadow-void-accent/20 text-white">
								<Layers size={22} />
							</div>
							<div>
								<h2 className="text-base font-black text-void-fg-1 tracking-tight">Academy</h2>
								<p className="text-[10px] font-bold text-void-accent uppercase tracking-widest">Student Mode</p>
							</div>
						</div>
						<nav className="flex-1 space-y-1">
							{(['overview', 'concepts', 'quizzes', 'badges'] as DashboardTab[]).map((tab) => (
								<button
									key={tab}
									onClick={() => setActiveTab(tab)}
									className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
										activeTab === tab
											? 'bg-void-accent text-white shadow-lg shadow-void-accent/20'
											: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3'
									}`}
								>
									{tab === 'overview' && <Layout size={18} />}
									{tab === 'concepts' && <Map size={18} />}
									{tab === 'quizzes' && <Zap size={18} />}
									{tab === 'badges' && <Star size={18} />}
									<span className="capitalize">{tab}</span>
								</button>
							))}
						</nav>
						<div className="mt-auto p-4 bg-void-bg-3/50 rounded-2xl border border-void-border-2">
							<div className="flex items-center gap-2 mb-2">
								<Flame size={16} className="text-orange-500" />
								<span className="text-[10px] font-black uppercase text-void-fg-3 tracking-tighter">Current Streak</span>
							</div>
							<div className="text-xl font-black text-void-fg-1">{global?.currentStreak || 0} Days</div>
						</div>
					</div>

					{/* Main Content */}
					<div className="flex-1 flex flex-col bg-void-bg-1">
						<div className="h-20 px-8 flex items-center justify-between border-b border-void-border-2 bg-void-bg-1/50 backdrop-blur-md sticky top-0 z-10">
							<h3 className="text-lg font-black text-void-fg-1 capitalize tracking-tight">{activeTab}</h3>
							<button onClick={onClose} className="p-2.5 hover:bg-void-bg-2 rounded-xl text-void-fg-4 hover:text-void-fg-1 transition-all active:scale-90">
								<X size={20} />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto p-10">
							{activeTab === 'overview' && (
								<div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
									<div className="grid grid-cols-3 gap-6">
										<div className="p-8 bg-gradient-to-br from-void-accent/10 to-transparent rounded-[24px] border border-void-accent/20 relative overflow-hidden group">
											<div className="absolute -right-4 -top-4 text-void-accent/5 group-hover:scale-110 transition-transform duration-700">
												<Trophy size={120} />
											</div>
											<p className="text-[11px] font-bold text-void-accent uppercase tracking-widest mb-1">Lessons Done</p>
											<h4 className="text-4xl font-black text-void-fg-1">{global?.totalLessonsCompleted || 0}</h4>
										</div>
										<div className="p-8 bg-void-bg-2 rounded-[24px] border border-void-border-2">
											<p className="text-[11px] font-bold text-void-fg-4 uppercase tracking-widest mb-1">XP Points</p>
											<h4 className="text-4xl font-black text-void-fg-1">{(global?.totalExercisesSolved || 0) * 50}</h4>
										</div>
										<div className="p-8 bg-void-bg-2 rounded-[24px] border border-void-border-2">
											<p className="text-[11px] font-bold text-void-fg-4 uppercase tracking-widest mb-1">Learning Time</p>
											<h4 className="text-4xl font-black text-void-fg-1">{formatTime(global?.totalTimeSpent || 0)}</h4>
										</div>
									</div>

									<div>
										<h4 className="text-xs font-black text-void-fg-3 uppercase tracking-[0.2em] mb-6">Recent Activity</h4>
										<div className="bg-void-bg-2/50 rounded-[24px] border border-void-border-2 overflow-hidden shadow-inner">
											{lessonEntries.length > 0 || quizzes.length > 0 ? (
												<div>
													{lessonEntries.slice(-3).reverse().map((lesson: any, i: number) => (
														<div key={`lesson-${i}`} className="px-8 py-5 flex items-center justify-between border-b border-void-border-2 last:border-0 hover:bg-void-bg-3/30 transition-colors">
														<div className="flex items-center gap-4">
															<div className="w-10 h-10 rounded-2xl bg-void-accent/10 flex items-center justify-center text-void-accent">
																<BookOpen size={18} />
															</div>
															<div>
																<p className="text-sm font-bold text-void-fg-1">{lesson.title || 'Lesson'}</p>
																<p className="text-xs text-void-fg-4">{lesson.completed ? 'Completed' : 'In Progress'} · {lesson.sectionsRead?.length || 0} sections</p>
															</div>
														</div>
														<span className="text-[10px] font-bold text-void-fg-4 uppercase">{new Date(lesson.lastAccessed).toLocaleDateString()}</span>
													</div>
													))}
													{quizzes.slice(-2).reverse().map((quiz: any, i: number) => (
														<div key={`quiz-${i}`} className="px-8 py-5 flex items-center justify-between border-b border-void-border-2 last:border-0 hover:bg-void-bg-3/30 transition-colors">
															<div className="flex items-center gap-4">
																<div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
																	<CheckCircle2 size={18} />
																</div>
																<div>
																	<p className="text-sm font-bold text-void-fg-1">Quiz Completed</p>
																	<p className="text-xs text-void-fg-4">Score: {quiz.score}%</p>
																</div>
															</div>
															<span className="text-[10px] font-bold text-void-fg-4 uppercase">{new Date(quiz.completedAt).toLocaleDateString()}</span>
														</div>
													))}
												</div>
											) : (
												<div className="p-12 text-center">
													<Brain size={40} className="mx-auto mb-4 text-void-fg-4 opacity-20" />
													<p className="text-sm text-void-fg-3 font-medium italic">No activity yet. Start a lesson to track your progress!</p>
												</div>
											)}
										</div>
									</div>
								</div>
							)}

							{activeTab === 'concepts' && (
								<div className="animate-in fade-in duration-500">
									<div className="mb-8">
										<h4 className="text-xs font-black text-void-fg-3 uppercase tracking-[0.2em] mb-2">Concept Mastery</h4>
										<p className="text-sm text-void-fg-4 font-medium">Your progress across learned concepts.</p>
									</div>
									{conceptList.length > 0 ? (
										<div className="grid grid-cols-4 gap-6">
											{conceptList.map((concept, idx) => (
												<div key={idx} className="bg-void-bg-2 rounded-2xl border border-void-border-2 p-5 hover:border-void-accent transition-all">
													<div className="flex items-center justify-between mb-3">
														<span className="text-sm font-bold text-void-fg-1">{concept.name}</span>
														<span className={`text-xs font-bold ${concept.score >= 80 ? 'text-green-500' : concept.score >= 50 ? 'text-void-accent' : 'text-yellow-500'}`}>{concept.score}%</span>
													</div>
													<div className="h-2 w-full bg-void-bg-3 rounded-full overflow-hidden mb-2">
														<div className="h-full rounded-full transition-all duration-500" style={{ width: `${concept.score}%`, backgroundColor: concept.score >= 80 ? 'var(--void-green)' : concept.score >= 50 ? 'var(--void-accent)' : '#eab308' }} />
													</div>
													<div className="flex items-center justify-between text-[10px] text-void-fg-4">
														<span>{concept.attempts} attempt{concept.attempts !== 1 ? 's' : ''}</span>
														<span>Level {concept.level}/5</span>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="text-center py-20">
											<Map size={48} className="mx-auto mb-6 text-void-fg-4 opacity-20" />
											<h4 className="text-xl font-black text-void-fg-1 mb-2">No Concepts Yet</h4>
											<p className="text-sm text-void-fg-3 max-w-xs mx-auto">Complete lessons to build your concept mastery map.</p>
										</div>
									)}
								</div>
							)}

							{activeTab === 'quizzes' && (
								<div className="animate-in zoom-in-95 duration-500">
									{quizzes.length > 0 ? (
										<div className="space-y-4">
											<h4 className="text-xs font-black text-void-fg-3 uppercase tracking-[0.2em] mb-4">Quiz History</h4>
											{quizzes.slice().reverse().map((quiz: any, i: number) => (
												<div key={i} className="p-6 bg-void-bg-2 rounded-[24px] border border-void-border-2 flex items-center justify-between hover:border-void-accent transition-all">
													<div className="flex items-center gap-4">
														<div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg ${quiz.score >= 80 ? 'bg-green-500' : quiz.score >= 50 ? 'bg-void-accent' : 'bg-yellow-500'}`}>{quiz.score}</div>
														<div>
															<p className="text-sm font-bold text-void-fg-1">Quiz {quizzes.length - i}</p>
															<p className="text-xs text-void-fg-4">{new Date(quiz.completedAt).toLocaleDateString()} · {formatTime(quiz.timeSpent || 0)}</p>
														</div>
													</div>
													<div className="flex items-center gap-2">
														<Zap size={16} className={quiz.score >= 80 ? 'text-green-500' : quiz.score >= 50 ? 'text-void-accent' : 'text-yellow-500'} />
														<span className={`text-xs font-bold ${quiz.score >= 80 ? 'text-green-500' : quiz.score >= 50 ? 'text-void-accent' : 'text-yellow-500'}`}>{quiz.score >= 80 ? 'Excellent' : quiz.score >= 50 ? 'Good' : 'Needs Practice'}</span>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="text-center py-20">
											<Zap size={48} className="mx-auto mb-6 text-void-fg-4 opacity-20" />
											<h4 className="text-xl font-black text-void-fg-1 mb-2">No Quizzes Yet</h4>
											<p className="text-sm text-void-fg-3 max-w-xs mx-auto">Complete quizzes during lessons to track your retention.</p>
										</div>
									)}
								</div>
							)}

							{activeTab === 'badges' && (
								<div className="grid grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-500">
									{allBadges.map((badge: any) => (
										<div key={badge.id} className={`p-8 rounded-[32px] border flex flex-col items-center text-center transition-all ${badge.earned ? 'bg-void-bg-2 border-void-accent/30 shadow-xl shadow-void-accent/5' : 'bg-void-bg-1 border-void-border-2 opacity-40 grayscale'}`}>
											<div className="text-5xl mb-4">{badge.icon}</div>
											<h5 className="text-sm font-black text-void-fg-1 mb-1">{badge.name}</h5>
											<p className="text-[10px] font-bold text-void-fg-4 uppercase tracking-widest">{badge.desc}</p>
											{badge.earned && badge.unlockedAt && (
												<p className="text-[10px] text-void-accent mt-2">Earned {new Date(badge.unlockedAt).toLocaleDateString()}</p>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LearningDashboard;
