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

export const SkillsResultWrapper: ResultWrapper<'load_skill' | 'list_skills' | 'execute_skill_script' | 'load_skill_reference' | 'get_skill_asset' | 'install_skill' | 'uninstall_skill' | 'run_skill_benchmark' | 'get_skill_metrics' | 'list_skill_benchmarks'> = ({ toolMessage, threadId }) => {
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
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as 'load_skill' | 'list_skills' | 'execute_skill_script' | 'load_skill_reference' | 'get_skill_asset' | 'install_skill' | 'uninstall_skill', toolMessage.params, accessor)

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
		} else if (toolMessage.name === 'execute_skill_script') {
			const { skill_name, script_name, success, output, error, exitCode, duration } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
							<span className="text-xs font-medium text-void-fg-1">
								{success ? `Script "${script_name}" executed successfully` : `Script "${script_name}" failed`}
							</span>
							<span className="text-[10px] text-void-fg-4">({duration}ms)</span>
						</div>
						{!success && error && (
							<div className="bg-red-500/10 rounded-md p-2 border border-red-500/30">
								<div className="text-[10px] text-red-400 font-medium mb-1">Error:</div>
								<pre className="text-xs text-red-300 whitespace-pre-wrap">{error}</pre>
							</div>
						)}
						{output && (
							<div className="bg-void-bg-4/30 rounded-md p-2 border border-void-border-2">
								<div className="text-[10px] text-void-fg-4 font-medium mb-1">Output:</div>
								<pre className="text-xs text-void-fg-2 whitespace-pre-wrap font-mono">{output}</pre>
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'load_skill_reference') {
			const { skill_name, reference_name, content, success } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
							<span className="text-xs font-medium text-void-fg-1">
								{success ? `Reference "${reference_name}" loaded` : `Failed to load reference "${reference_name}"`}
							</span>
						</div>
						{success && content && (
							<div className="bg-void-bg-4/30 rounded-md p-3 border border-void-border-2 max-h-64 overflow-auto">
								<SmallProseWrapper>
									<ChatMarkdownRender
										string={content}
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
		} else if (toolMessage.name === 'get_skill_asset') {
			const { skill_name, asset_name, content, type, success } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
							<span className="text-xs font-medium text-void-fg-1">
								{success ? `Asset "${asset_name}" retrieved` : `Failed to get asset "${asset_name}"`}
							</span>
							{success && <span className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-3 text-void-fg-3">{type}</span>}
						</div>
						{success && content && type !== 'image' && type !== 'font' && (
							<div className="bg-void-bg-4/30 rounded-md p-2 border border-void-border-2 max-h-48 overflow-auto">
								<pre className="text-xs text-void-fg-2 whitespace-pre-wrap font-mono">{content}</pre>
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'install_skill') {
			const { skill_name, success, message, version } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2">
						{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
						<span className="text-xs font-medium text-void-fg-1">
							{success ? `Skill "${skill_name}" installed` : `Installation failed`}
						</span>
						{success && version && <span className="text-[10px] text-void-fg-4">(v{version})</span>}
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'uninstall_skill') {
			const { skill_name, success, message } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2">
						{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
						<span className="text-xs font-medium text-void-fg-1">
							{success ? `Skill "${skill_name}" uninstalled` : `Uninstallation failed`}
						</span>
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'run_skill_benchmark') {
			const { skill_name, success, score, results, duration } = result as any
			const passedCount = results?.filter((r: any) => r.passed).length || 0
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							{success ? <Check size={14} className="text-green-500" /> : <Info size={14} className="text-red-500" />}
							<span className="text-xs font-medium text-void-fg-1">
								Benchmark for "{skill_name}"
							</span>
							<span className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-3 text-void-fg-3">
								{score}% ({passedCount}/{results?.length || 0})
							</span>
						</div>
						{results && results.length > 0 && (
							<div className="space-y-1">
								{results.map((r: any, i: number) => (
									<div key={i} className="flex items-center gap-2 text-xs">
										{r.passed ? <Check size={12} className="text-green-500" /> : <Info size={12} className="text-red-500" />}
										<span className="text-void-fg-2">{r.test_name}</span>
										{r.message && <span className="text-void-fg-4 truncate max-w-[200px]">{r.message}</span>}
									</div>
								))}
							</div>
						)}
						<div className="text-[10px] text-void-fg-4">
							Duration: {duration}ms
						</div>
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'get_skill_metrics') {
			const { skill_name, metrics } = result as any
			const trendEmoji = metrics.improvement_trend === 'improving' ? '📈' : metrics.improvement_trend === 'declining' ? '📉' : '➡️'
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-3">
						<div className="text-xs font-medium text-void-fg-1">
							Metrics for "{skill_name}"
						</div>
						<div className="grid grid-cols-3 gap-2">
							<div className="bg-void-bg-4/30 rounded p-2">
								<div className="text-[10px] text-void-fg-4">Uses</div>
								<div className="text-sm font-medium text-void-fg-1">{metrics.total_uses}</div>
							</div>
							<div className="bg-void-bg-4/30 rounded p-2">
								<div className="text-[10px] text-void-fg-4">Success</div>
								<div className="text-sm font-medium text-void-fg-1">{metrics.success_rate.toFixed(1)}%</div>
							</div>
							<div className="bg-void-bg-4/30 rounded p-2">
								<div className="text-[10px] text-void-fg-4">Trend</div>
								<div className="text-sm font-medium text-void-fg-1">{trendEmoji}</div>
							</div>
						</div>
						{metrics.benchmark_scores && metrics.benchmark_scores.length > 0 && (
							<div className="text-[10px] text-void-fg-3">
								{metrics.benchmark_scores.length} benchmark(s) recorded
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		} else if (toolMessage.name === 'list_skill_benchmarks') {
			const { skill_name, benchmarks } = result as any
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="space-y-2">
						<div className="text-xs font-medium text-void-fg-1">
							Benchmarks for "{skill_name}"
						</div>
						{benchmarks && benchmarks.length > 0 ? (
							<div className="space-y-1">
								{benchmarks.map((b: any, i: number) => (
									<div key={i} className="flex items-center gap-2 text-xs">
										<span className={`text-[10px] px-1.5 py-0.5 rounded ${
											b.type === 'test' ? 'bg-blue-500/20 text-blue-400' :
											b.type === 'evaluation' ? 'bg-purple-500/20 text-purple-400' :
											'bg-orange-500/20 text-orange-400'
										}`}>
											{b.type}
										</span>
										<span className="text-void-fg-2">{b.name}</span>
									</div>
								))}
							</div>
						) : (
							<div className="text-xs text-void-fg-4 italic">
								No benchmarks found. Add test files to the skill's benchmarks/ folder.
							</div>
						)}
					</div>
				</ToolChildrenWrapper>
			)
		}
	}

	return <ToolHeaderWrapper {...componentParams} />
}