/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Clock, TrendingUp, Target, RefreshCw, X, CheckCircle, Star, Calendar, Zap } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';

export interface SpacedRepetitionItem {
	id: string;
	name: string;
	lastPracticed: number;
	daysSinceLastPractice: number;
	masteryLevel: number;
	reviewInterval: number; // Days until next review
	urgency: 'now' | 'soon' | 'later';
	attempts: number;
	successRate: number;
}

interface QuizMeProps {
	threadId: string;
	onClose: () => void;
	onSelectTopic: (topic: string) => void;
}

// Calculate review urgency based on mastery and time since last practice
function calculateUrgency(item: Omit<SpacedRepetitionItem, 'urgency'>): SpacedRepetitionItem['urgency'] {
	const { masteryLevel, daysSinceLastPractice, reviewInterval } = item;

	// Need to review now if overdue or low mastery
	if (daysSinceLastPractice >= reviewInterval) {
		return 'now';
	}
	// Review soon if approaching review window or low mastery
	if (daysSinceLastPractice >= reviewInterval * 0.7 || masteryLevel < 50) {
		return 'soon';
	}
	return 'later';
}

// Calculate next review interval based on performance (supermemo-style)
function calculateNextReviewInterval(
	currentInterval: number,
	successRate: number,
	attempts: number
): number {
	// If success rate is good (>80%), increase interval
	if (successRate >= 80 && attempts > 1) {
		return Math.min(30, Math.round(currentInterval * 2.5));
	}
	// If success rate is moderate (60-79%), slight increase
	if (successRate >= 60) {
		return Math.min(14, Math.round(currentInterval * 1.5));
	}
	// If success rate is poor, reset to shorter interval
	return Math.max(1, Math.round(currentInterval * 0.5));
}

// Generate spaced repetition suggestions from learning progress
function generateSpacedRepetitionItems(progress: any): SpacedRepetitionItem[] {
	const items: SpacedRepetitionItem[] = [];
	const now = Date.now();

	Object.entries(progress).forEach(([key, data]: [string, any]) => {
		if (!data || !data.lastAccessed) return;

		const lastPracticed = data.lastAccessed;
		const daysSinceLastPractice = Math.floor((now - lastPracticed) / (1000 * 60 * 60 * 24));

		// Calculate mastery based on attempts and success rate
		const attempts = data.attempts || 1;
		const successRate = data.successRate || 50;
		const masteryLevel = Math.min(100, Math.round((successRate * 0.7) + (Math.min(attempts / 10, 1) * 30)));

		// Calculate review interval based on mastery
		let reviewInterval = 1; // Default: review daily
		if (masteryLevel >= 80) reviewInterval = 7; // Week
		else if (masteryLevel >= 60) reviewInterval = 3; // 3 days
		else if (masteryLevel >= 40) reviewInterval = 2; // 2 days

		const baseItem = {
			id: key,
			name: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
			lastPracticed,
			daysSinceLastPractice,
			masteryLevel,
			reviewInterval,
			attempts,
			successRate,
		};

		const item: SpacedRepetitionItem = {
			...baseItem,
			urgency: calculateUrgency(baseItem),
		};

		items.push(item);
	});

	// Sort by urgency, then by days since last practice
	return items.sort((a, b) => {
		const urgencyOrder = { now: 0, soon: 1, later: 2 };
		if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
			return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
		}
		return b.daysSinceLastPractice - a.daysSinceLastPractice;
	});
}

export const QuizMe: React.FC<QuizMeProps> = ({ threadId, onClose, onSelectTopic }) => {
	const accessor = useAccessor();
	const [progress, setProgress] = useState<any>(null);
	const [items, setItems] = useState<SpacedRepetitionItem[]>([]);
	const [selectedItem, setSelectedItem] = useState<SpacedRepetitionItem | null>(null);
	const [quizGenerated, setQuizGenerated] = useState(false);
	const [loading, setLoading] = useState(true);

	const learningProgressService = accessor.get('ILearningProgressService');

	// Load progress and generate items
	useEffect(() => {
		const loadData = async () => {
			setLoading(true);
			try {
				if (learningProgressService?.getProgress) {
					const data = await learningProgressService.getProgress(threadId);
					setProgress(data);
					const spacedItems = generateSpacedRepetitionItems(data);
					setItems(spacedItems);
				}
			} catch (error) {
				console.error('[QuizMe] Error loading progress:', error);
			} finally {
				setLoading(false);
			}
		};
		loadData();
	}, [threadId, learningProgressService]);

	const nowItems = items.filter(i => i.urgency === 'now');
	const soonItems = items.filter(i => i.urgency === 'soon');
	const laterItems = items.filter(i => i.urgency === 'later');

	const handleStartQuiz = (item: SpacedRepetitionItem) => {
		setSelectedItem(item);
	};

	const handleGenerateQuiz = () => {
		if (selectedItem) {
			// In a real implementation, this would generate a quiz for the selected topic
			setQuizGenerated(true);
			onSelectTopic(`Quiz me on ${selectedItem.name.toLowerCase()}`);
			onClose();
		}
	};

	const formatDays = (days: number): string => {
		if (days === 0) return 'Today';
		if (days === 1) return '1 day ago';
		return `${days} days ago`;
	};

	const formatInterval = (days: number): string => {
		if (days === 1) return 'Daily';
		if (days < 7) return `Every ${days} days`;
		if (days === 7) return 'Weekly';
		return `Every ${Math.round(days / 7)} weeks`;
	};

	if (loading) {
		return (
			<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
				<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl p-8 shadow-2xl">
					<div className="flex items-center gap-3">
						<div className="w-6 h-6 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-void-fg-2">Analyzing your learning...</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
			<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
				{/* Header */}
				<div className="px-6 py-4 border-b border-void-border-2 flex items-center justify-between bg-void-bg-2">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
							<Brain size={20} className="text-purple-400" />
						</div>
						<div>
							<h2 className="text-lg font-bold text-void-fg-1">Quiz Me</h2>
							<p className="text-xs text-void-fg-3">Spaced repetition review</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors"
					>
						<X size={20} className="text-void-fg-3" />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-6">
					{items.length === 0 ? (
						// Empty state
						<div className="text-center py-12">
							<div className="w-20 h-20 mx-auto mb-4 rounded-full bg-void-bg-2 flex items-center justify-center">
								<Brain size={40} className="text-void-fg-4" />
							</div>
							<h3 className="text-lg font-semibold text-void-fg-1 mb-2">Start Learning to Track Progress</h3>
							<p className="text-sm text-void-fg-3">
								Complete exercises and quizzes to enable spaced repetition reviews.
							</p>
						</div>
					) : (
						<div className="space-y-6">
							{/* Overview stats */}
							<div className="grid grid-cols-3 gap-3">
								<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
									<div className="text-2xl font-bold text-red-500">{nowItems.length}</div>
									<div className="text-xs text-void-fg-4">Due Now</div>
								</div>
								<div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
									<div className="text-2xl font-bold text-yellow-500">{soonItems.length}</div>
									<div className="text-xs text-void-fg-4">Upcoming</div>
								</div>
								<div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
									<div className="text-2xl font-bold text-green-500">{laterItems.length}</div>
									<div className="text-xs text-void-fg-4">Later</div>
								</div>
							</div>

							{/* Due Now */}
							{nowItems.length > 0 && (
								<div>
									<div className="flex items-center gap-2 mb-3">
										<Zap size={16} className="text-red-500" />
										<h3 className="text-sm font-semibold text-void-fg-1">Review Now</h3>
										<span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-500 rounded-full">
											Urgent
										</span>
									</div>
									<div className="space-y-2">
										{nowItems.slice(0, 3).map((item) => (
											<button
												key={item.id}
												onClick={() => handleStartQuiz(item)}
												className="w-full p-3 bg-void-bg-2 border border-red-500/30 rounded-lg text-left hover:bg-void-bg-3 transition-colors group"
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-3">
														<div className="p-2 rounded-lg bg-red-500/20 group-hover:bg-red-500/30 transition-colors">
															<Target size={16} className="text-red-500" />
														</div>
														<div>
															<div className="text-sm font-medium text-void-fg-1">{item.name}</div>
															<div className="text-xs text-void-fg-4 mt-0.5">
																{formatDays(item.daysSinceLastPractice)} • {item.masteryLevel}% mastered
															</div>
														</div>
													</div>
													<ChevronRight size={16} className="text-void-fg-4 group-hover:text-void-fg-2 transition-colors" />
												</div>
												{/* Mastery bar */}
												<div className="mt-2 h-1.5 bg-void-bg-3 rounded-full overflow-hidden">
													<div
														className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all"
														style={{ width: `${item.masteryLevel}%` }}
													/>
												</div>
											</button>
										))}
									</div>
								</div>
							)}

							{/* Upcoming */}
							{soonItems.length > 0 && (
								<div>
									<div className="flex items-center gap-2 mb-3">
										<Clock size={16} className="text-yellow-500" />
										<h3 className="text-sm font-semibold text-void-fg-1">Upcoming Reviews</h3>
									</div>
									<div className="space-y-2">
										{soonItems.slice(0, 3).map((item) => (
											<button
												key={item.id}
												onClick={() => handleStartQuiz(item)}
												className="w-full p-3 bg-void-bg-2 border border-yellow-500/30 rounded-lg text-left hover:bg-void-bg-3 transition-colors group"
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-3">
														<div className="p-2 rounded-lg bg-yellow-500/20 group-hover:bg-yellow-500/30 transition-colors">
															<RefreshCw size={16} className="text-yellow-500" />
														</div>
														<div>
															<div className="text-sm font-medium text-void-fg-1">{item.name}</div>
															<div className="text-xs text-void-fg-4 mt-0.5">
																{formatDays(item.daysSinceLastPractice)} • Review in {item.reviewInterval - item.daysSinceLastPractice} days
															</div>
														</div>
													</div>
													<ChevronRight size={16} className="text-void-fg-4 group-hover:text-void-fg-2 transition-colors" />
												</div>
												{/* Mastery bar */}
												<div className="mt-2 h-1.5 bg-void-bg-3 rounded-full overflow-hidden">
													<div
														className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all"
														style={{ width: `${item.masteryLevel}%` }}
													/>
												</div>
											</button>
										))}
									</div>
								</div>
							)}

							{/* Later */}
							{laterItems.length > 0 && nowItems.length === 0 && soonItems.length === 0 && (
								<div>
									<div className="flex items-center gap-2 mb-3">
										<TrendingUp size={16} className="text-green-500" />
										<h3 className="text-sm font-semibold text-void-fg-1">Future Reviews</h3>
									</div>
									<div className="space-y-2">
										{laterItems.slice(0, 3).map((item) => (
											<div
												key={item.id}
												className="p-3 bg-void-bg-2 border border-void-border-2 rounded-lg"
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-3">
														<div className="p-2 rounded-lg bg-green-500/20">
															<CheckCircle size={16} className="text-green-500" />
														</div>
														<div>
															<div className="text-sm font-medium text-void-fg-1">{item.name}</div>
															<div className="text-xs text-void-fg-4 mt-0.5">
																{formatInterval(item.reviewInterval)} schedule
															</div>
														</div>
													</div>
													<div className="text-right">
														<div className="text-lg font-bold text-green-500">{item.masteryLevel}%</div>
														<div className="text-xs text-void-fg-4">mastery</div>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t border-void-border-2 bg-void-bg-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-xs text-void-fg-4">
							<Calendar size={12} />
							<span>Based on your learning history</span>
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

// Export for use in other components
export default QuizMe;

// Hook to access Quiz Me functionality
export const useQuizMe = () => {
	const [isOpen, setIsOpen] = useState(false);

	return {
		isOpen,
		open: () => setIsOpen(true),
		close: () => setIsOpen(false),
	};
};

const ChevronRight = ({ size, className }: { size: number; className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<polyline points="9 18 15 12 9 6" />
	</svg>
);