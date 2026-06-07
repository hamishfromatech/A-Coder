/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Clock, TrendingUp, Target, RefreshCw, X, CheckCircle, Star, Calendar, Zap, ChevronRight, Sparkles } from 'lucide-react';
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

// Generate spaced repetition suggestions from learning progress
function generateSpacedRepetitionItems(progress: any): SpacedRepetitionItem[] {
	const items: SpacedRepetitionItem[] = [];
	const now = Date.now();

	if (!progress || !progress.lessons) return [];

	Object.entries(progress.lessons).forEach(([key, data]: [string, any]) => {
		if (!data || !data.lastAccessed) return;

		const lastPracticed = data.lastAccessed;
		const daysSinceLastPractice = Math.floor((now - lastPracticed) / (1000 * 60 * 60 * 24));

		const attempts = data.quizResults?.length || 1;
		const avgScore = data.quizResults?.length 
			? data.quizResults.reduce((acc: number, r: any) => acc + r.score, 0) / attempts 
			: 50;
		
		const masteryLevel = Math.min(100, Math.round((avgScore * 0.7) + (Math.min(attempts / 5, 1) * 30)));

		let reviewInterval = 1;
		if (masteryLevel >= 80) reviewInterval = 7;
		else if (masteryLevel >= 60) reviewInterval = 3;
		else if (masteryLevel >= 40) reviewInterval = 2;

		const urgency: SpacedRepetitionItem['urgency'] = 
			daysSinceLastPractice >= reviewInterval ? 'now' :
			daysSinceLastPractice >= reviewInterval * 0.7 ? 'soon' : 'later';

		items.push({
			id: key,
			name: data.title || key.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
			lastPracticed,
			daysSinceLastPractice,
			masteryLevel,
			reviewInterval,
			attempts,
			successRate: avgScore,
			urgency
		});
	});

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
	const [items, setItems] = useState<SpacedRepetitionItem[]>([]);
	const [loading, setLoading] = useState(true);

	const learningProgressService = accessor.get('ILearningProgressService');

	useEffect(() => {
		const loadData = () => {
			const data = learningProgressService.getThreadProgress(threadId);
			const spacedItems = generateSpacedRepetitionItems(data);
			setItems(spacedItems);
			setLoading(false);
		};
		loadData();
		const disposable = learningProgressService.onDidChangeState(() => loadData());
		return () => disposable.dispose();
	}, [threadId, learningProgressService]);

	const nowItems = items.filter(i => i.urgency === 'now');
	const soonItems = items.filter(i => i.urgency === 'soon');

	const handleStartQuiz = (item: SpacedRepetitionItem) => {
		onSelectTopic(`Quiz me on ${item.name.toLowerCase()}`);
		onClose();
	};

	if (loading) return null;

	return (
		<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
			<div className="bg-void-bg-1 border border-void-border-2 rounded-[32px] shadow-2xl w-full max-w-xl h-[70vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
				
				{/* Header */}
				<div className="px-8 py-6 border-b border-void-border-2 flex items-center justify-between bg-void-bg-2">
					<div className="flex items-center gap-4">
						<div className="p-3 rounded-[20px] bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20 text-white">
							<Brain size={24} />
						</div>
						<div>
							<h2 className="text-xl font-black text-void-fg-1 tracking-tight">Test Yourself</h2>
							<p className="text-[10px] font-bold text-void-fg-4 uppercase tracking-[0.2em]">Spaced Repetition</p>
						</div>
					</div>
					<button onClick={onClose} className="p-2.5 hover:bg-void-bg-2 rounded-xl text-void-fg-4 hover:text-void-fg-1 transition-all active:scale-90">
						<X size={20} />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-8 space-y-8">
					{items.length === 0 ? (
						<div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-10">
							<Sparkles size={48} className="mb-4 text-void-fg-4" />
							<h3 className="text-lg font-bold text-void-fg-1 mb-1">Your Knowledge is Growing</h3>
							<p className="text-xs text-void-fg-3 max-w-[200px]">Complete more lessons to unlock your personalized review queue.</p>
						</div>
					) : (
						<div className="space-y-8">
							{/* Stats */}
							<div className="grid grid-cols-2 gap-4">
								<div className="p-6 bg-red-500/5 border border-red-500/20 rounded-[24px]">
									<div className="text-3xl font-black text-red-500">{nowItems.length}</div>
									<div className="text-[10px] font-bold text-void-fg-4 uppercase tracking-widest mt-1">Due Now</div>
								</div>
								<div className="p-6 bg-void-bg-2 border border-void-border-2 rounded-[24px]">
									<div className="text-3xl font-black text-void-fg-1">{items.length}</div>
									<div className="text-[10px] font-bold text-void-fg-4 uppercase tracking-widest mt-1">Total Topics</div>
								</div>
							</div>

							{/* Due Now */}
							<div className="space-y-4">
								<h4 className="text-xs font-black text-void-fg-3 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
									<Zap size={14} className="text-red-500 fill-current" />
									Recommended for You
								</h4>
								<div className="space-y-3">
									{(nowItems.length > 0 ? nowItems : items.slice(0, 3)).map((item) => (
										<button
											key={item.id}
											onClick={() => handleStartQuiz(item)}
											className="w-full p-6 bg-void-bg-2 border border-void-border-2 rounded-[24px] text-left hover:border-void-accent hover:bg-void-bg-3/50 transition-all group relative overflow-hidden"
										>
											<div className="flex items-center justify-between mb-4 relative z-10">
												<div className="flex items-center gap-4">
													<div className="w-10 h-10 rounded-2xl bg-void-bg-3 flex items-center justify-center text-void-fg-2 group-hover:bg-void-accent group-hover:text-white transition-colors">
														<Target size={18} />
													</div>
													<div>
														<h5 className="font-bold text-void-fg-1 tracking-tight">{item.name}</h5>
														<p className="text-[10px] font-bold text-void-fg-4 uppercase mt-0.5">
															{item.masteryLevel}% Mastery · {item.reviewInterval}d Cycle
														</p>
													</div>
												</div>
												<div className="p-2 rounded-full bg-void-bg-3 text-void-fg-4 group-hover:translate-x-1 transition-all">
													<ChevronRight size={16} />
												</div>
											</div>
											<div className="h-1.5 w-full bg-void-bg-3 rounded-full overflow-hidden relative z-10">
												<div 
													className="h-full bg-void-accent shadow-[0_0_10px_rgba(var(--void-accent-rgb),0.5)] transition-all duration-1000"
													style={{ width: `${item.masteryLevel}%` }}
												/>
											</div>
										</button>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-8 py-6 border-t border-void-border-2 bg-void-bg-2 flex items-center justify-center">
					<p className="text-[10px] font-bold text-void-fg-4 uppercase tracking-[0.3em]">Smart Learning Algorithm Active</p>
				</div>
			</div>
		</div>
	);
};

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
