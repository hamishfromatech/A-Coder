/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Zap, Check, Info, Loader2, Trophy, Star, Lock, TrendingUp, Flame, Award } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	SmallProseWrapper,
	ResultWrapper,
	ToolHeaderParams,
	getTitle,
	toolNameToDesc,
	BottomChildren,
	CodeChildren
} from './ToolResultHelpers.js';
import { ILearningProgressService } from '../../../../common/learningProgressService.js';
import { ResultProgressBar } from './ResultWrapperDesign.js';

// Get mastery level display info
function getMasteryInfo(mastery: number) {
	if (mastery >= 80) return { label: 'Mastered', color: 'text-green-500', barColor: 'bg-green-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', icon: <Trophy size={14} /> }
	if (mastery >= 60) return { label: 'Proficient', color: 'text-blue-500', barColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30', icon: <Star size={14} /> }
	if (mastery >= 40) return { label: 'Learning', color: 'text-yellow-500', barColor: 'bg-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30', icon: <TrendingUp size={14} /> }
	if (mastery >= 20) return { label: 'Beginner', color: 'text-orange-500', barColor: 'bg-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', icon: <Flame size={14} /> }
	return { label: 'Novice', color: 'text-void-fg-3', barColor: 'bg-void-fg-3', bgColor: 'bg-void-bg-2', borderColor: 'border-void-border-2', icon: <Lock size={14} /> }
}

export const SkillsResultWrapper: ResultWrapper<'load_skill' | 'list_skills'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)
	const [skillProgress, setSkillProgress] = useState<Map<string, number>>(new Map())

	// Load skill progress from LearningProgressService
	useEffect(() => {
		const loadProgress = async () => {
			if (!threadId) return;
			try {
				const learningProgressService = accessor.get('ILearningProgressService');
				if (learningProgressService?.getProgress) {
					const progress = await learningProgressService.getProgress(threadId);
					const masteryMap = new Map<string, number>();

					// Calculate mastery for each skill based on concept progress
					Object.entries(progress).forEach(([concept, data]: [string, any]) => {
						if (data?.masteryLevel !== undefined) {
							masteryMap.set(concept, data.masteryLevel);
						} else {
							// Calculate from attempts and success rate
							const attempts = data.attempts || 1;
							const successRate = data.successRate || 50;
							const masteryLevel = Math.min(100, Math.round((successRate * 0.7) + (Math.min(attempts / 10, 1) * 30)));
							masteryMap.set(concept, masteryLevel);
						}
					});

					setSkillProgress(masteryMap);
				}
			} catch (error) {
				console.error('[SkillsResultWrapper] Error loading skill progress:', error);
			}
		};
		loadProgress();
	}, [threadId, accessor]);

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as 'load_skill' | 'list_skills', toolMessage.params, accessor)

	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: <Zap size={12} className="text-void-accent" />, isRejected }

	if (toolMessage.type === 'running_now') {
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;

		if (activity) {
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2 py-1">
						<Loader2 className="w-3 h-3 animate-spin text-void-accent" />
						<span className="text-xs italic text-void-fg-3">{activity}</span>
					</div>
				</ToolChildrenWrapper>
			)
			componentParams.isOpen = true;
		}
	} else if (toolMessage.type === 'success') {
		const result = (toolMessage.result as any)?.result || toolMessage.result
		componentParams.isOpen = true; // Auto-expand on success

		if (toolMessage.name === 'load_skill') {
			const { skill_name, instructions, success } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-void-fg-1 font-medium">
							{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-void-warning" />}
							<span>{success ? `Skill "${skill_name}" successfully loaded` : `Failed to load skill "${skill_name}"`}</span>
						</div>
						{success && (
							<div className="bg-void-bg-4/30 rounded-md p-3 border border-void-border-2">
								<div className="text-[10px] uppercase tracking-wider font-bold text-void-fg-4 mb-2">Instructions Applied:</div>
								<SmallProseWrapper>
									<ChatMarkdownRender
										string={instructions}
										chatMessageLocation={undefined}
										isApplyEnabled={false}
										isLinkDetectionEnabled={true}
									/>
								</SmallProseWrapper>
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'list_skills') {
			const { skills } = result as any

			// Calculate average mastery for summary
			const masteryValues = Array.from(skillProgress.values());
			const averageMastery = masteryValues.length > 0
				? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
				: 0;
			const masteryInfo = getMasteryInfo(averageMastery);

			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-4">
						{/* Summary Stats */}
						{masteryValues.length > 0 && (
							<div className="p-3 bg-gradient-to-r from-void-bg-2 to-void-bg-3 rounded-lg border border-void-border-2">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2">
										<span className={masteryInfo.color}>{masteryInfo.icon}</span>
										<span className="text-xs font-medium text-void-fg-2">Overall Mastery</span>
									</div>
									<span className={`text-lg font-bold ${masteryInfo.color}`}>{averageMastery}%</span>
								</div>
								<ResultProgressBar value={averageMastery} max={100} color={masteryInfo.barColor as any} />
								<div className="flex items-center justify-between mt-2 text-xs">
									<span className="text-void-fg-3">{masteryValues.length} skills tracked</span>
									<span className={masteryInfo.color}>{masteryInfo.label}</span>
								</div>
							</div>
						)}

						{/* Skills Grid */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<span className="text-xs font-medium text-void-fg-2">Available specialized skills</span>
								{masteryValues.length > 0 && (
									<span className="text-[10px] text-void-fg-4">
										{masteryValues.filter(m => m >= 80).length} mastered
									</span>
								)}
							</div>
							<div className="grid gap-2">
								{skills && skills.length > 0 ? (
									skills.map((skill: any) => {
										const mastery = skillProgress.get(skill.name);
										const skillMasteryInfo = mastery !== undefined ? getMasteryInfo(mastery) : null;

										return (
											<div
												key={skill.name}
												className={`
													p-3 rounded-lg border transition-all hover:border-void-border-1
													${skillMasteryInfo ? `${skillMasteryInfo.bgColor} ${skillMasteryInfo.borderColor}` : 'bg-void-bg-4/30 border-void-border-2'}
												`}
											>
												<div className="flex items-start justify-between mb-2">
													<div className="flex items-center gap-2">
														<span className={skillMasteryInfo?.color || 'text-void-accent'}>
															{skillMasteryInfo?.icon || <Zap size={10} className="text-void-accent" />}
														</span>
														<div>
															<div className="text-xs font-bold text-void-fg-1">{skill.name}</div>
															<div className="text-[11px] text-void-fg-3 line-clamp-2 mt-0.5">{skill.description}</div>
														</div>
													</div>
													{skillMasteryInfo && (
														<span className={`text-[10px] px-1.5 py-0.5 rounded-full ${skillMasteryInfo.bgColor} ${skillMasteryInfo.color} border ${skillMasteryInfo.borderColor}`}>
															{skillMasteryInfo.label}
														</span>
													)}
												</div>
												{mastery !== undefined && (
													<ResultProgressBar value={mastery} max={100} color={skillMasteryInfo?.barColor as any} />
												)}
												{mastery === undefined && (
													<div className="text-[10px] text-void-fg-4 italic">Start learning to track progress</div>
												)}
											</div>
										);
									})
								) : (
									<div className="text-center p-6 border border-dashed border-void-border-2 rounded-lg">
										<Award size={32} className="mx-auto mb-2 text-void-fg-4" />
										<div className="text-xs text-void-fg-3">No skills currently installed</div>
									</div>
								)}
							</div>
						</div>

						{/* Mastery Legend */}
						{masteryValues.length > 0 && (
							<div className="pt-2 border-t border-void-border-1">
								<div className="text-[10px] text-void-fg-4 mb-2">Mastery Levels:</div>
								<div className="flex flex-wrap gap-2">
									{[
										{ label: 'Novice', value: 0, color: 'text-void-fg-3' },
										{ label: 'Beginner', value: 20, color: 'text-orange-500' },
										{ label: 'Learning', value: 40, color: 'text-yellow-500' },
										{ label: 'Proficient', value: 60, color: 'text-blue-500' },
										{ label: 'Mastered', value: 80, color: 'text-green-500' },
									].map(level => (
										<div key={level.label} className={`flex items-center gap-1 text-[10px] ${level.color}`}>
											<div className={`w-2 h-2 rounded-full bg-current opacity-60`} />
											<span>{level.label}</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		}
	}

	return <ToolHeaderWrapper {...componentParams} />
}