/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo, useEffect } from 'react';
import { useAccessor, useChatThreadsState, useSettingsState } from '../util/services.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';
import { Brain, RefreshCw, CheckCircle2, Clock, Flame, Target, ChevronRight, X } from 'lucide-react';

interface QuizMeModalProps {
	threadId: string;
	onClose: () => void;
	onQuizSelected: (topic: string) => void;
}

interface ReviewItem {
	concept: string;
	lastPracticed: number;
	reviewScore: number;
	reason: string;
	type: 'urgent' | 'due' | 'upcoming' | 'none';
}

interface ConceptPractice {
	concept: string;
	timesPracticed: number;
	lastPracticed: number;
	timeSpent: number;
	successRate: number;
}

// Calculate review score based on forgetting curve
function calculateReviewScore(practice: ConceptPractice): { score: number; reason: string; type: ReviewItem['type'] } {
	const now = Date.now();
	const timeSincePractice = now - practice.lastPracticed;
	const daysSincePractice = timeSincePractice / (1000 * 60 * 60 * 24);

	// Spaced repetition intervals (in days)
	// Each time practiced, the interval doubles
	const reviewInterval = Math.min(30, Math.pow(2, practice.timesPracticed - 1));

	// Forgetting curve: probability of remembering decays over time
	// Simplified Ebbinghaus: R = e^(-t/S) where t is time and S is memory strength
	const memoryStrength = practice.timeSpent * practice.successRate * 1000; // ms * success_rate
	const retentionProbability = Math.exp(-timeSincePractice / (memoryStrength || 86400000));

	// Urgent: Should review now
	if (daysSincePractice >= reviewInterval && retentionProbability < 0.6) {
		return {
			score: 100,
			reason: `${Math.round(daysSincePractice)} days since last practice (review interval: ${reviewInterval} days)`,
			type: 'urgent',
		};
	}

	// Due: Time to review
	if (daysSincePractice >= reviewInterval) {
		return {
			score: 70 + (1 - retentionProbability) * 30,
			reason: `Review due (${Math.round(daysSincePractice - reviewInterval)} days overdue)`,
			type: 'due',
		};
	}

	// Upcoming: Review coming soon
	if (daysSincePractice >= reviewInterval * 0.7) {
		return {
			score: 40 + (daysSincePractice / reviewInterval) * 30,
			reason: `Review in ${Math.round(reviewInterval - daysSincePractice)} days`,
			type: 'upcoming',
		};
	}

	// None: Not yet due
	return {
		score: Math.max(0, (daysSincePractice / reviewInterval) * 20),
		reason: `Next review in ${Math.round(reviewInterval - daysSincePractice)} days`,
		type: 'none',
	};
}

// Generate quiz questions based on concept
function generateQuizPrompt(concept: string, practice: ConceptPractice): string {
	const questionTypes = [
		`Create a quiz question about ${concept} with multiple choice options to test understanding`,
		`Generate a code-based exercise that requires using ${concept}`,
		`Design a true/false quiz about ${concept} with explanations`,
	];

	// Pick question type based on practice count (vary the types)
	const typeIndex = practice.timesPracticed % questionTypes.length;
	return questionTypes[typeIndex];
}

export const QuizMeModal: React.FC<QuizMeModalProps> = ({ threadId, onClose, onQuizSelected }) => {
	const accessor = useAccessor();
	const settingsState = useSettingsState();
	const [loading, setLoading] = useState(true);
	const [concepts, setConcepts] = useState<ReviewItem[]>([]);
	const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
	const [isStartingQuiz, setIsStartingQuiz] = useState(false);

	const learningProgressService = accessor.get('ILearningProgressService');
	const currentChatMode = settingsState.globalSettings.chatMode;

	// Load concepts and calculate review schedule
	useEffect(() => {
		const loadConcepts = async () => {
			setLoading(true);
			try {
				if (learningProgressService?.getProgress) {
					const progress = await learningProgressService.getProgress(threadId);

					// Extract concept practice data from progress
					const conceptPractices: ConceptPractice[] = [];

					// Look for teaching tool results
					Object.entries(progress).forEach(([key, data]: [string, any]) => {
						// Extract concepts from teaching tools
						if (data?.teachingTools) {
							data.teachingTools.forEach((tool: any) => {
								if (tool.concept && !conceptPractices.find(c => c.concept === tool.concept)) {
									conceptPractices.push({
										concept: tool.concept,
										timesPracticed: tool.timesPracticed || 1,
										lastPracticed: tool.lastPracticed || data.lastAccessed || Date.now(),
										timeSpent: tool.timeSpent || 0,
										successRate: tool.successRate || 0.8,
									});
								}
							});
						}

						// Extract from recent quiz results
						if (data?.quizResults) {
							data.quizResults.forEach((quiz: any) => {
								if (quiz.concept && !conceptPractices.find(c => c.concept === quiz.concept)) {
									conceptPractices.push({
										concept: quiz.concept,
										timesPracticed: 1,
										lastPracticed: quiz.completedAt,
										timeSpent: 60000, // Assume 1 minute per quiz
										successRate: quiz.percentage / 100,
									});
								}
							});
						}
					});

					// Add some default concepts for demo if none found
					if (conceptPractices.length === 0) {
						const defaultConcepts = [
							'JavaScript Functions',
							'React Hooks',
							'CSS Grid',
							'Async/Await',
							'Git Branching',
						];

						for (const concept of defaultConcepts) {
							conceptPractices.push({
								concept,
								timesPracticed: Math.floor(Math.random() * 3) + 1,
								lastPracticed: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
								timeSpent: Math.random() * 300000,
								successRate: 0.6 + Math.random() * 0.4,
							});
						}
					}

					// Calculate review scores
					const reviewItems: ReviewItem[] = conceptPractices.map((practice) => {
						const { score, reason, type } = calculateReviewScore(practice);
						return {
							concept: practice.concept,
							lastPracticed: practice.lastPracticed,
							reviewScore: score,
							reason,
							type,
						};
					});

					// Sort by review score (highest priority first)
					reviewItems.sort((a, b) => b.reviewScore - a.reviewScore);
					setConcepts(reviewItems);
				}
			} catch (error) {
				console.error('[QuizMeModal] Error loading concepts:', error);
			} finally {
				setLoading(false);
			}
		};
		loadConcepts();
	}, [threadId, learningProgressService]);

	// Auto-start quiz if urgent items exist and none selected
	useEffect(() => {
		if (!loading && !selectedConcept && concepts.length > 0) {
			const urgentItems = concepts.filter(c => c.type === 'urgent');
			if (urgentItems.length > 0) {
				setSelectedConcept(urgentItems[0].concept);
			}
		}
	}, [loading, concepts, selectedConcept]);

	// Handle starting a quiz
	const handleStartQuiz = () => {
		if (!selectedConcept) return;

		setIsStartingQuiz(true);

		// Find the practice data for this concept
		const conceptData = concepts.find(c => c.concept === selectedConcept);

		// Generate the quiz prompt
		if (conceptData) {
			const practice: ConceptPractice = {
				concept: conceptData.concept,
				timesPracticed: Math.ceil(Math.log2(conceptData.reviewScore / 20 + 1)),
				lastPracticed: conceptData.lastPracticed,
				timeSpent: 60000,
				successRate: 0.8,
			};

			const quizPrompt = generateQuizPrompt(practice.concept, practice);
			onQuizSelected(quizPrompt);
		}

		// Close modal after short delay
		setTimeout(() => {
			onClose();
		}, 300);
	};

	// Get type-specific styling
	const getTypeStyles = (type: ReviewItem['type']) => {
		switch (type) {
			case 'urgent':
				return {
					borderColor: 'border-red-500/50',
					bgColor: 'bg-red-500/10',
					iconColor: 'text-red-500',
					label: 'Review Now',
					badgeColor: 'bg-red-500/20 text-red-500',
				};
			case 'due':
				return {
					borderColor: 'border-orange-500/50',
					bgColor: 'bg-orange-500/10',
					iconColor: 'text-orange-500',
					label: 'Due Today',
					badgeColor: 'bg-orange-500/20 text-orange-500',
				};
			case 'upcoming':
				return {
					borderColor: 'border-yellow-500/50',
					bgColor: 'bg-yellow-500/10',
					iconColor: 'text-yellow-500',
					label: 'Upcoming',
					badgeColor: 'bg-yellow-500/20 text-yellow-500',
				};
			default:
				return {
					borderColor: 'border-void-border-2',
					bgColor: 'bg-void-bg-2',
					iconColor: 'text-void-fg-4',
					label: 'Not Due',
					badgeColor: 'bg-void-bg-3 text-void-fg-4',
				};
		}
	};

	// Get icon for type
	const getTypeIcon = (type: ReviewItem['type']) => {
		switch (type) {
			case 'urgent':
				return <RefreshCw size={16} className="animate-spin" />;
			case 'due':
				return <Clock size={16} />;
			case 'upcoming':
				return <Flame size={16} />;
			default:
				return <Target size={16} />;
		}
	};

	if (loading) {
		return (
			<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
				<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl p-8 shadow-2xl">
					<div className="flex items-center gap-3">
						<Brain size={20} className="text-void-accent animate-pulse" />
						<span className="text-void-fg-2">Analyzing your learning progress...</span>
					</div>
				</div>
			</div>
		);
	}

	const selectedStyles = selectedConcept ? getTypeStyles(concepts.find(c => c.concept === selectedConcept)?.type || 'none') : null;

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
			<div className="bg-void-bg-1 border border-void-border-2 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
				{/* Header */}
				<div className="px-6 py-4 border-b border-void-border-2 bg-void-bg-2 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-void-accent/20">
							<Brain size={20} className="text-void-accent" />
						</div>
						<div>
							<h2 className="text-lg font-bold text-void-fg-1">Quiz Me</h2>
							<p className="text-xs text-void-fg-3">Spaced repetition for better retention</p>
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
				<div className="p-6">
					{/* Selected concept preview */}
					{selectedConcept && (
						<div className={`mb-6 p-4 rounded-xl border ${selectedStyles?.borderColor} ${selectedStyles?.bgColor}`}>
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<span className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedStyles?.iconColor}`}>
										{getTypeIcon(concepts.find(c => c.concept === selectedConcept)?.type || 'none')}
									</span>
									<div>
										<div className="text-sm font-semibold text-void-fg-1">{selectedConcept}</div>
										<div className="text-xs text-void-fg-4">
											{concepts.find(c => c.concept === selectedConcept)?.reason}
										</div>
									</div>
								</div>
								<span className={`px-2 py-1 text-xs font-medium rounded-full ${selectedStyles?.badgeColor}`}>
									{selectedStyles?.label}
								</span>
							</div>
							<div className="flex gap-2 mt-3">
								<button
									onClick={() => setSelectedConcept(null)}
									className="flex-1 px-3 py-2 text-xs font-medium bg-void-bg-3 hover:bg-void-bg-4 text-void-fg-2 rounded-lg transition-colors"
								>
									Choose Different
								</button>
								<button
									onClick={handleStartQuiz}
									disabled={isStartingQuiz}
									className="flex-1 px-3 py-2 text-xs font-medium bg-void-accent hover:bg-void-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
								>
									{isStartingQuiz ? (
										<RefreshCw size={12} className="animate-spin" />
									) : (
										<CheckCircle2 size={12} />
									)}
									Start Quiz
								</button>
							</div>
						</div>
					)}

					{/* Concept list */}
					{!selectedConcept && (
						<div className="space-y-2 max-h-80 overflow-y-auto">
							<h3 className="text-xs font-semibold text-void-fg-2 uppercase tracking-wider mb-3">
								Suggested for Review
							</h3>
							{concepts.map((concept) => {
								const styles = getTypeStyles(concept.type);
								const isSelected = selectedConcept === concept.concept;

								return (
									<button
										key={concept.concept}
										onClick={() => setSelectedConcept(concept.concept)}
										className={`w-full p-3 rounded-lg border ${styles.borderColor} ${styles.bgColor} text-left transition-all hover:ring-2 hover:ring-void-accent/50 ${isSelected ? 'ring-2 ring-void-accent' : ''}`}
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span className={`w-8 h-8 rounded-lg flex items-center justify-center ${styles.iconColor}`}>
													{getTypeIcon(concept.type)}
												</span>
												<div>
													<div className="text-sm font-medium text-void-fg-1">{concept.concept}</div>
													<div className="text-xs text-void-fg-4">{concept.reason}</div>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span className={`px-2 py-1 text-xs font-medium rounded-full ${styles.badgeColor}`}>
													{styles.label}
												</span>
												{!isSelected && <ChevronRight size={14} className="text-void-fg-4" />}
												{isSelected && <CheckCircle2 size={14} className="text-void-accent" />}
											</div>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t border-void-border-2 bg-void-bg-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-xs text-void-fg-4">
							<Flame size={12} />
							<span>Reviewing concepts strengthens long-term memory</span>
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

export default QuizMeModal;