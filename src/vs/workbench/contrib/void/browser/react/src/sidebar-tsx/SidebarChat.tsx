/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { ButtonHTMLAttributes, FormEvent, FormHTMLAttributes, Fragment, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState, useActiveURI, useCommandBarState, useFullChatThreadsStreamState, useIsDark } from '../util/services.js';
import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';

import { ChatMarkdownRender, ChatMessageLocation, getApplyBoxId } from '../markdown/ChatMarkdownRender.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import { BlockCode, TextAreaFns, VoidCustomDropdownBox, VoidInputBox2, VoidSlider, VoidSwitch, VoidDiffEditor } from '../util/inputs.js';
import { ModelDropdown, } from '../void-settings-tsx/ModelDropdown.js';
import { PastThreadsList } from './SidebarThreadSelector.js';
import { VOID_CTRL_L_ACTION_ID } from '../../../actionIDs.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../actionIDs.js';
import { ChatMode, displayInfoOfProviderName, FeatureName, isFeatureNameDisabled } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { WarningBox } from '../void-settings-tsx/WarningBox.js';
import { getModelCapabilities, getIsReasoningEnabledState } from '../../../../common/modelCapabilities.js';
import { AlertTriangle, ChevronRight, ChevronDown, X, Copy as CopyIcon, CircleEllipsis, Play, Settings, ArrowUp, Trash2, Send, Circle, Loader2, Brain, Check, Pencil, CirclePlus, File as FileIcon, Folder as FolderIcon, Text as TextIcon, SkipForward } from 'lucide-react';
import { ChatMessage, CheckpointEntry, StagingSelectionItem, ToolMessage, ImageAttachment } from '../../../../common/chatThreadServiceTypes.js';
import { BuiltinToolName, ToolName, IsRunningType, approvalTypeOfBuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import { CopyButton, EditToolAcceptRejectButtonsHTML, IconShell1, StatusIndicator, useEditToolStreamState } from '../markdown/ApplyBlockHoverButtons.js';
import { AUTO_CONTINUE_CHAR_THRESHOLD } from '../../../chatThreadService.js';
import { builtinToolNames, isABuiltinToolName, MAX_FILE_CHARS_PAGE } from '../../../../common/prompt/prompts.js';
import { RawToolCallObj } from '../../../../common/sendLLMMessageTypes.js';
import ErrorBoundary from './ErrorBoundary.js';
import { ToolApprovalTypeSwitch } from '../void-settings-tsx/Settings.js';

import { persistentTerminalNameOfId } from '../../../terminalToolService.js';
import { TypingIndicator, ToolLoadingIndicator, ReActPhaseIndicator } from './ChatAnimations.js';
import { MCPServerModal } from './MCPServerModal.js';
import { TaskPlan } from '../../../chatThreadService.js';
import { CheckpointTimeline } from './CheckpointTimeline.js';

import { 
	ToolHeaderWrapper, 
	ToolChildrenWrapper, 
	CodeChildren, 
	BottomChildren, 
	SmallProseWrapper, 
	ProseWrapper,
	getTitle, 
	titleOfBuiltinToolName,
	toolNameToDesc,
	getRelative,
	voidOpenFileFn,
	getBasename,
	getFolderName,
	ResultWrapper,
	WrapperProps,
	InvalidTool,
	CanceledTool,
} from './ToolResultHelpers.js';
import { DefaultToolResultWrapper } from './GenericToolResultWrapper.js';
import { FileResultWrapper } from './FileResultWrapper.js';
import { SearchQueryResultWrapper } from './SearchQueryResultWrapper.js';
import { CommandToolResultWrapper, TerminalCommandApproval } from './TerminalResultWrapper.js';
import { EditToolResultWrapper, EditToolChildren } from './EditToolResultWrapper.tsx';
import { MCPToolResultWrapper } from './MCPToolResultWrapper.js';
import { MediaResultWrapper } from './MediaResultWrapper.js';
import { SkillsResultWrapper } from './SkillsResultWrapper.js';
import { FormResultWrapper } from './FormResultWrapper.js';
import { QuizResultWrapper } from './QuizResultWrapper.js';
import { WebviewResultWrapper } from './WebviewResultWrapper.js';
import WalkthroughResultWrapper from './WalkthroughResultWrapper.js';
import { TeachingResultWrapper } from './TeachingResultWrapper.js';
import { LearningDashboard } from './LearningDashboard.js';
import { QuizMe } from './QuizMe.js';


// Lazy-loaded components - MUST be at module level to avoid re-creating on every render
const LazyPlanningResultWrapper = React.lazy(() => import('./PlanningResultWrapper.js'))
const LazyImplementationPlanPreviewWrapper = React.lazy(() => import('./ImplementationPlanPreviewWrapper.js'))

// Image Preview Component
const ImagePreview = ({ images, onRemove }: { images: ImageAttachment[], onRemove: (index: number) => void }) => {
	if (images.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2 mb-2 p-2 bg-void-bg-2 rounded-md border border-void-border-3">
			{images.map((image, index) => (
				<div key={index} className="relative group">
					<img
						src={`data:${image.mimeType};base64,${image.base64}`}
						alt={image.name || `Image ${index + 1}`}
						className="w-20 h-20 object-cover rounded border border-void-border-2"
					/>
					<button
						onClick={() => onRemove(index)}
						className="absolute -top-1 -right-1 bg-void-bg-1 border border-void-border-2 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
						data-tooltip-id="void-tooltip"
						data-tooltip-content="Remove image"
					>
						<X size={12} className="text-void-fg-3" />
					</button>
					{image.name && (
						<div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate rounded-b">
							{image.name}
						</div>
					)}
				</div>
			))}
		</div>
	);
};

// Task Plan Component - Cursor-style task management
const TaskPlanView = ({
	threadId,
	tasks,
	onCreateTask,
	onUpdateTaskStatus,
	onDeleteTask,
	onClearPlan
}: {
	threadId: string
	tasks: TaskPlan[]
	onCreateTask: (description: string) => void
	onUpdateTaskStatus: (taskId: string, status: TaskPlan['status']) => void
	onDeleteTask: (taskId: string) => void
	onClearPlan: () => void
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [newTaskDescription, setNewTaskDescription] = useState('');
	const [isAddingTask, setIsAddingTask] = useState(false);

	const completedCount = tasks.filter(t => t.status === 'completed').length;
	const totalCount = tasks.length;
	const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

	const getStatusIcon = (status: TaskPlan['status']) => {
		switch (status) {
			case 'completed':
				return <Check className="w-3.5 h-3.5 text-green-500" />;
			case 'in_progress':
				return <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
			case 'blocked':
				return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
			case 'pending':
			default:
				return <Circle className="w-3.5 h-3.5 text-void-fg-4" />;
		}
	};

	const getStatusColor = (status: TaskPlan['status']) => {
		switch (status) {
			case 'completed':
				return 'text-green-500';
			case 'in_progress':
				return 'text-blue-500';
			case 'blocked':
				return 'text-orange-500';
			case 'pending':
			default:
				return 'text-void-fg-4';
		}
	};

	const handleAddTask = () => {
		if (newTaskDescription.trim()) {
			onCreateTask(newTaskDescription.trim());
			setNewTaskDescription('');
			setIsAddingTask(false);
		}
	};

	if (tasks.length === 0) {
		return null; // Don't show anything if no tasks
	}

	return (
		<div className="mb-4 border border-void-border-2 rounded-xl overflow-hidden shadow-sm">
			{/* Header */}
			<div
				className="flex items-center justify-between p-4 cursor-pointer hover:bg-void-bg-2-hover transition-all duration-200"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-3">
					<ChevronDown
						className={`w-4 h-4 text-void-fg-3 transition-transform duration-200 ${!isExpanded ? '-rotate-90' : ''}`}
					/>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-void-fg-1">Task Plan</span>
						<span className="px-2 py-0.5 text-xs font-medium bg-void-bg-3 text-void-fg-3 rounded-full">
							{completedCount}/{totalCount}
						</span>
					</div>
				</div>

				{/* Progress indicator */}
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2">
						<div className="w-20 h-2 bg-void-bg-3 rounded-full overflow-hidden">
							<div
								className="h-full bg-gradient-to-r from-void-accent to-void-accent-hover transition-all duration-500 ease-out"
								style={{ width: `${progressPercentage}%` }}
							/>
						</div>
						<span className="text-xs text-void-fg-4 font-medium">
							{Math.round(progressPercentage)}%
						</span>
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onClearPlan();
						}}
						className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors duration-200"
						title="Clear all tasks"
					>
						<Trash2 className="w-4 h-4 text-void-fg-4" />
					</button>
				</div>
			</div>

			{/* Expanded content */}
			{isExpanded && (
				<div className="border-t border-void-border-2">
					{/* Task list */}
					<div className="max-h-80 overflow-y-auto">
						{tasks.map((task, index) => (
							<div
								key={task.id}
								className="flex items-start gap-3 p-4 hover:bg-void-bg-2 transition-colors duration-200 border-b border-void-border-1 last:border-b-0 group"
							>
								<div className="flex items-center gap-2 mt-1">
									{getStatusIcon(task.status)}
								</div>

								<div className="flex-1 min-w-0">
									<div className={`text-sm font-medium ${getStatusColor(task.status)} leading-relaxed`}>
										{task.description}
									</div>
									{task.dependencies && task.dependencies.length > 0 && (
										<div className="text-xs text-void-fg-4 mt-2 flex items-center gap-1">
											<span>Depends on:</span>
											<span className="font-mono bg-void-bg-2 px-1.5 py-0.5 rounded">
												{task.dependencies.join(', ')}
											</span>
										</div>
									)}
								</div>

								{/* Status dropdown */}
								<select
									value={task.status}
									onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskPlan['status'])}
									className="text-xs px-3 py-1.5 bg-void-bg-3 border border-void-border-2 rounded-lg text-void-fg-2 focus:outline-none focus:border-void-accent transition-colors"
								>
									<option value="pending">Pending</option>
									<option value="in_progress">In Progress</option>
									<option value="completed">Completed</option>
									<option value="blocked">Blocked</option>
								</select>

								{/* Delete button */}
								<button
									onClick={() => onDeleteTask(task.id)}
									className="p-2 hover:bg-void-bg-3 rounded-lg transition-colors duration-200 opacity-0 group-hover:opacity-100"
									title="Delete task"
								>
									<X className="w-4 h-4 text-void-fg-4" />
								</button>
							</div>
						))}
					</div>

					{/* Add task section */}
					<div className="p-4 border-t border-void-border-2">
						{isAddingTask ? (
							<div className="flex gap-2">
								<input
									type="text"
									value={newTaskDescription}
									onChange={(e) => setNewTaskDescription(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											handleAddTask();
										} else if (e.key === 'Escape') {
											setIsAddingTask(false);
											setNewTaskDescription('');
										}
									}}
									placeholder="Enter task description..."
									className="flex-1 px-3 py-2 text-sm border border-void-border-2 rounded-lg text-void-fg-1 placeholder-void-fg-4 focus:outline-none focus:border-void-accent transition-colors"
									autoFocus
								/>
								<button
									onClick={handleAddTask}
									className="px-4 py-2 text-xs font-medium bg-void-accent text-white rounded-lg hover:bg-void-accent-hover transition-colors duration-200"
								>
									Add Task
								</button>
								<button
									onClick={() => {
										setIsAddingTask(false);
										setNewTaskDescription('');
									}}
									className="px-4 py-2 text-xs font-medium border border-void-border-2 rounded-lg hover:bg-void-bg-4 transition-colors duration-200"
								>
									Cancel
								</button>
							</div>
						) : (
							<button
								onClick={() => setIsAddingTask(true)}
								className="flex items-center gap-2 px-3 py-2 text-sm text-void-fg-3 hover:text-void-fg-1 border border-void-border-2 rounded-lg transition-all duration-200"
							>
								<CirclePlus className="w-4 h-4" />
								Add Task
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

// Token Counter Component
const TokenCounter = ({ tokenUsage }: { tokenUsage?: { used: number, total: number, percentage: number } }) => {
	// Show default state if no token usage data
	if (!tokenUsage || tokenUsage.total === 0) {
		return (
			<div className='flex items-center gap-1.5 text-xs text-void-fg-4 px-2 py-1 rounded bg-void-bg-2 border border-void-border-2'>
				<span className='font-mono'>0/0</span>
				<span className='font-medium'>(0.0%)</span>
			</div>
		);
	}

	const { used, total, percentage } = tokenUsage;
	const isHigh = percentage >= 80;
	const isMedium = percentage >= 50 && percentage < 80;

	return (
		<div className='flex items-center gap-1.5 text-xs text-void-fg-3 px-2 py-1 rounded bg-void-bg-2 border border-void-border-2'>
			<span className='font-mono'>{used.toLocaleString()}/{total.toLocaleString()}</span>
			<span className={`font-medium ${isHigh ? 'text-orange-500' : isMedium ? 'text-yellow-500' : 'text-void-fg-4'
				}`}>
				({percentage.toFixed(1)}%)
			</span>
		</div>
	);
};



export const IconX = ({ size, className = '', ...props }: { size: number, className?: string } & React.SVGProps<SVGSVGElement>) => {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width={size}
			height={size}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			className={className}
			{...props}
		>
			<path
				strokeLinecap='round'
				strokeLinejoin='round'
				d='M6 18 18 6M6 6l12 12'
			/>
		</svg>
	);
};

const IconArrowUp = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			width={size}
			height={size}
			className={className}
			viewBox="0 0 20 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill="black"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
			></path>
		</svg>
	);
};


const IconSquare = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="currentColor"
			fill="currentColor"
			strokeWidth="0"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect x="2" y="2" width="20" height="20" rx="4" ry="4" />
		</svg>
	);
};


export const IconWarning = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="currentColor"
			fill="currentColor"
			strokeWidth="0"
			viewBox="0 0 16 16"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M7.56 1h.88l6.54 12.26-.44.74H1.44L1 13.26 7.56 1zM8 2.28L2.28 13H13.7L8 2.28zM8.625 12v-1h-1.25v1h1.25zm-1.25-2V6h1.25v4h-1.25z"
			/>
		</svg>
	);
};


export const IconLoading = ({ className = '' }: { className?: string }) => {


	return <Loader2 className={`animate-spin ${className}`} size={14} />;


}



// SLIDER ONLY:
const ReasoningOptionSlider = ({ featureName }: { featureName: FeatureName }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const modelSelection = voidSettingsState.modelSelectionOfFeature[featureName]
	const overridesOfModel = voidSettingsState.overridesOfModel

	if (!modelSelection) return null

	const { modelName, providerName } = modelSelection
	const { reasoningCapabilities } = getModelCapabilities(providerName, modelName, overridesOfModel)
	const { canTurnOffReasoning, reasoningSlider: reasoningBudgetSlider } = reasoningCapabilities || {}

	const modelSelectionOptions = voidSettingsState.optionsOfModelSelection[featureName][providerName]?.[modelName]
	const isReasoningEnabled = getIsReasoningEnabledState(featureName, providerName, modelName, modelSelectionOptions, overridesOfModel)

	if (canTurnOffReasoning && !reasoningBudgetSlider) { // if it's just a on/off toggle without a power slider
		return <div
			className='flex items-center gap-x-2 cursor-pointer group hover:bg-void-bg-3 py-1 rounded transition-colors duration-200'
			onClick={(e) => {
				e.stopPropagation()
				const newVal = !isReasoningEnabled
				const isOff = canTurnOffReasoning && !newVal
				voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff })
			}}
		>
			<span className='text-void-fg-3 text-xs select-none'>Thinking</span>
			<VoidSwitch
				size='xxs'
				value={isReasoningEnabled}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && !newVal
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff })
				}}
			/>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'budget_slider') { // if it's a slider
		const { min: min_, max, default: defaultVal } = reasoningBudgetSlider

		const nSteps = 8 // only used in calculating stepSize, stepSize is what actually matters
		const stepSize = Math.round((max - min_) / nSteps)

		const valueIfOff = min_ - stepSize
		const min = canTurnOffReasoning ? valueIfOff : min_
		const value = isReasoningEnabled ? voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningBudget ?? defaultVal
			: valueIfOff

		return <div className='flex items-center gap-x-2 py-1 rounded'>
			<span className='text-void-fg-3 text-xs select-none'>Thinking</span>
			<VoidSlider
				width={60}
				size='xs'
				min={min}
				max={max}
				step={stepSize}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningBudget: newVal })
				}}
			/>
			<span className='text-void-fg-3 text-xs select-none'>{isReasoningEnabled ? `${value} tokens` : 'Thinking disabled'}</span>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'effort_slider') {

		const { values, default: defaultVal } = reasoningBudgetSlider

		const min = canTurnOffReasoning ? -1 : 0
		const max = values.length - 1

		const currentEffort = voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningEffort ?? defaultVal
		const valueIfOff = -1
		const value = isReasoningEnabled && currentEffort ? values.indexOf(currentEffort) : valueIfOff

		const currentEffortCapitalized = currentEffort.charAt(0).toUpperCase() + currentEffort.slice(1, Infinity)

		return <div className='flex items-center gap-x-2 py-1 rounded'>
			<span className='text-void-fg-3 text-xs select-none'>Thinking</span>
			<VoidSlider
				width={40}
				size='xs'
				min={min}
				max={max}
				step={1}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningEffort: values[newVal] ?? undefined })
				}}
			/>
			<span className='text-void-fg-3 text-xs select-none'>{isReasoningEnabled ? `${currentEffortCapitalized}` : 'Thinking disabled'}</span>
		</div>
	}

	return null
}


const nameOfChatMode: Record<ChatMode, string> = {
	'chat': 'Chat',
	'plan': 'Plan',
	'code': 'Code',
	'learn': 'Learn',
}

const detailOfChatMode: Record<ChatMode, string> = {
	'chat': 'Conversation only, no tools',
	'plan': 'Research, plan & document',
	'code': 'Edit files & run commands',
	'learn': '📚 Learn to code with a tutor',
}

const nameOfStudentLevel = {
	'beginner': '🌱 Beginner',
	'intermediate': '🌿 Intermediate',
	'advanced': '🌳 Advanced',
}

const detailOfStudentLevel = {
	'beginner': 'New to coding - simple explanations, no jargon',
	'intermediate': 'Some experience - technical terms with definitions',
	'advanced': 'Experienced - deep dives and best practices',
}

// Student Mode Onboarding Modal
const StudentOnboardingModal = ({ isOpen, onClose, onSelectLevel }: {
	isOpen: boolean,
	onClose: () => void,
	onSelectLevel: (level: 'beginner' | 'intermediate' | 'advanced') => void
}) => {
	if (!isOpen) return null

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto flex flex-col">
				{/* Header */}
				<div className="px-6 py-5 border-b border-void-border-1 flex items-start gap-4">
					<div className="p-2 bg-void-accent/10 rounded-lg text-void-accent shrink-0">
						<Brain size={24} />
					</div>
					<div>
						<h2 className="text-lg font-semibold text-void-fg-1 leading-tight">Student Mode</h2>
						<p className="text-void-fg-3 text-sm mt-1 leading-relaxed">
							A-Coder will act as your personal tutor.
						</p>
					</div>
				</div>

				{/* Content */}
				<div className="p-6 flex-1">
					<div className="space-y-3">
						{(['beginner', 'intermediate', 'advanced'] as const).map((level) => {
							const labels = {
								'beginner': { title: 'Beginner', desc: 'Simple explanations, no jargon' },
								'intermediate': { title: 'Intermediate', desc: 'Technical terms with definitions' },
								'advanced': { title: 'Advanced', desc: 'Deep dives and best practices' }
							}
							return (
								<button
									key={level}
									onClick={() => onSelectLevel(level)}
									className="w-full group flex items-start gap-4 p-4 rounded-lg border border-void-border-2 hover:border-void-accent hover:bg-void-accent/5 text-left transition-all duration-200"
								>
									<div className="mt-0.5">
										<div className="w-4 h-4 rounded-full border border-void-border-3 group-hover:border-void-accent group-hover:bg-void-accent/20 transition-colors" />
									</div>
									<div>
										<div className="font-medium text-void-fg-1 group-hover:text-void-accent transition-colors">
											{labels[level].title}
										</div>
										<div className="text-sm text-void-fg-3 mt-0.5">
											{labels[level].desc}
										</div>
									</div>
								</button>
							)
						})}
					</div>

					<div className="mt-6 pt-5 border-t border-void-border-1">
						<h4 className="text-xs font-semibold text-void-fg-2 uppercase tracking-wider mb-3">Included Features</h4>
						<div className="grid grid-cols-2 gap-y-2 gap-x-4">
							{[
								'Line-by-line explanations',
								'Real-world analogies',
								'Practice exercises',
								'Progressive hints',
								'Lesson plans'
							].map((feature, i) => (
								<div key={i} className="flex items-center gap-2 text-sm text-void-fg-3">
									<Check size={12} className="text-void-accent" />
									<span>{feature}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="px-6 py-4 bg-void-bg-2 border-t border-void-border-1 flex justify-between items-center rounded-b-xl">
					<button
						onClick={onClose}
						className="text-sm text-void-fg-3 hover:text-void-fg-1 transition-colors px-2 py-1"
					>
						Skip for now
					</button>
				</div>
			</div>
		</div>
	)
}


const ChatModeDropdown = ({ className }: { className: string }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	const [showStudentOnboarding, setShowStudentOnboarding] = useState(false)

	const options: ChatMode[] = useMemo(() => ['chat', 'plan', 'code', 'learn'], [])

	const onChangeOption = useCallback((newVal: ChatMode) => {
		// Show onboarding when switching to student mode for the first time
		if (newVal === 'learn' && settingsState.globalSettings.chatMode !== 'learn') {
			setShowStudentOnboarding(true)
		}
		voidSettingsService.setGlobalSetting('chatMode', newVal)
	}, [voidSettingsService, settingsState.globalSettings.chatMode])

	const handleSelectLevel = useCallback((level: 'beginner' | 'intermediate' | 'advanced') => {
		voidSettingsService.setGlobalSetting('studentLevel', level)
		setShowStudentOnboarding(false)
	}, [voidSettingsService])

	return <>
		<VoidCustomDropdownBox
			className={className}
			options={options}
			selectedOption={settingsState.globalSettings.chatMode}
			onChangeOption={onChangeOption}
			getOptionDisplayName={(val) => nameOfChatMode[val]}
			getOptionDropdownName={(val) => nameOfChatMode[val]}
			getOptionDropdownDetail={(val) => detailOfChatMode[val]}
			getOptionsEqual={(a, b) => a === b}
		/>
		<StudentOnboardingModal
			isOpen={showStudentOnboarding}
			onClose={() => setShowStudentOnboarding(false)}
			onSelectLevel={handleSelectLevel}
		/>
	</>

}





interface VoidChatAreaProps {
	// Required
	children: React.ReactNode; // This will be the input component

	// Form controls
	onSubmit: () => void;
	onAbort: () => void;
	isStreaming: boolean;
	isDisabled?: boolean;
	divRef?: React.RefObject<HTMLDivElement | null>;

	// UI customization
	className?: string;
	showModelDropdown?: boolean;
	showSelections?: boolean;
	showProspectiveSelections?: boolean;
	loadingIcon?: React.ReactNode;

	tokenUsage?: { used: number, total: number, percentage: number };

	selections?: StagingSelectionItem[]
	setSelections?: (s: StagingSelectionItem[]) => void
	// selections?: any[];
	// onSelectionsChange?: (selections: any[]) => void;

	onClickAnywhere?: () => void;
	// Optional close button
	onClose?: () => void;

	featureName: FeatureName;
}

export const VoidChatArea: React.FC<VoidChatAreaProps> = ({
	children,
	onSubmit,
	onAbort,
	onClose,
	onClickAnywhere,
	divRef,
	isStreaming = false,
	isDisabled = false,
	className = '',
	showModelDropdown = true,
	showSelections = false,
	showProspectiveSelections = false,
	selections,
	setSelections,
	tokenUsage,
	featureName,
	loadingIcon,
}) => {
	const isDark = useIsDark();
	return (
		<div
			ref={divRef}
			className={`
					flex flex-col p-3 relative input text-left shrink-0 w-full
					rounded-2xl border border-void-border-2
					transition-all duration-200
					focus-within:border-void-accent/50 focus-within:shadow-md focus-within:ring-1 focus-within:ring-void-accent/20
					hover:border-void-border-1
					max-h-[80vh] overflow-visible
					${isDark ? 'bg-void-bg-1' : 'bg-void-bg-1'}
					shadow-sm
					${className}
				`}
			onClick={(e) => {
				onClickAnywhere?.()
			}}
		>
			{/* Selections section */}
			{showSelections && selections && setSelections && (
				<SelectedFiles
					type='staging'
					selections={selections}
					setSelections={setSelections}
					showProspectiveSelections={showProspectiveSelections}
				/>
			)}

			{/* Input section */}
			<div className="relative w-full">
				{children}

				{/* Close button (X) if onClose is provided */}
				{onClose && (
					<div className='absolute -top-1 -right-1 cursor-pointer z-1'>
						<IconX
							size={12}
							className="stroke-[2] opacity-80 text-void-fg-3 hover:brightness-95"
							onClick={onClose}
						/>
					</div>
				)}
			</div>

			{/* Bottom row */}
			<div className='flex flex-row justify-between items-center gap-3 mt-2 pt-2 border-t border-void-border-2/50'>
				{showModelDropdown && (
					<div className='flex flex-col gap-y-1'>
						<ReasoningOptionSlider featureName={featureName} />

						<div className='flex items-center flex-wrap gap-x-2 gap-y-1 text-nowrap'>
							{featureName === 'Chat' && (
								<ChatModeDropdown className='text-xs text-void-fg-3 bg-void-bg-2 hover:bg-void-bg-2-hover border border-void-border-2 rounded-lg py-1 px-2 shadow-sm' />
							)}
							<div className='relative z-[200]'>
								<ModelDropdown featureName={featureName} className='text-xs text-void-fg-3 bg-void-bg-2 hover:bg-void-bg-2-hover border border-void-border-2 rounded-lg px-2 py-1 shadow-sm' />
							</div>
							<TokenCounter tokenUsage={tokenUsage} />
						</div>
					</div>
				)}

				<div className="flex items-center gap-2">

					{isStreaming && loadingIcon}

					{isStreaming && <ButtonStop onClick={onAbort} />}

					<ButtonSubmit
						onClick={onSubmit}
						disabled={isDisabled && !isStreaming}
						isQueueMode={isStreaming}
					/>
				</div>

			</div>
		</div>
	);
};




type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>
const DEFAULT_BUTTON_SIZE = 22;
export const ButtonSubmit = ({ className, disabled, isQueueMode, ...props }: ButtonProps & Required<Pick<ButtonProps, 'disabled'>> & { isQueueMode?: boolean }) => {
	const isDark = useIsDark()

	return <button
		type='button'
		className={`rounded-xl flex-shrink-0 flex-grow-0 flex items-center justify-center transition-all duration-200
				${disabled ? 'bg-void-bg-3 cursor-not-allowed opacity-50 border border-void-border-2' :
				isDark ?
					'bg-void-accent/80 hover:bg-void-accent cursor-pointer shadow-sm' :
					'bg-void-accent hover:bg-void-accent/90 cursor-pointer shadow-md'
			}
			`}
		style={{ width: DEFAULT_BUTTON_SIZE, height: DEFAULT_BUTTON_SIZE }}
		disabled={disabled}
		data-tooltip-id='void-tooltip'
		data-tooltip-content={isQueueMode ? 'Queue message (will send after current operation)' : 'Send message'}
		{...props}
	>
		<div className={`${disabled ? 'text-void-fg-4' : isDark ? 'text-white' : 'text-black'}`}>
			<ArrowUp size={14} strokeWidth={3} />
		</div>
	</button>
}

export const ButtonStop = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		className={`rounded-xl flex-shrink-0 flex-grow-0 cursor-pointer flex items-center justify-center transition-all duration-200
			bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-1 shadow-sm border border-void-border-2
			${className}
		`}
		type='button'
		{...props}
	>
		<div className='text-red-500 dark:text-red-400'>
			<IconSquare size={DEFAULT_BUTTON_SIZE} className="stroke-[3] p-[7px]" />
		</div>
	</button>
}

// Continue button component
const ContinueButton = ({
	threadId,
	onContinue,
	lastResponseLength,
	autoContinueEnabled,
	onToggleAutoContinue,
}: {
	threadId: string,
	onContinue: () => void,
	lastResponseLength: number,
	autoContinueEnabled: boolean,
	onToggleAutoContinue: (value: boolean) => void,
}) => {
	const [showMenu, setShowMenu] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)

	// Close menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false)
			}
		}
		if (showMenu) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showMenu])

	return (
		<div className="flex items-center gap-2 relative">
			{/* Main Continue button */}
			<button
				onClick={onContinue}
				className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 text-sm transition-all duration-150"
				data-tooltip-id='void-tooltip'
				data-tooltip-content='Continue the conversation'
				data-tooltip-place='top'
			>
				<Play size={14} className="fill-current" />
				<span>Continue</span>
			</button>

			{/* Settings menu button */}
			<div className="relative" ref={menuRef}>
				<button
					onClick={() => setShowMenu(!showMenu)}
					className={`p-1.5 rounded-md bg-void-bg-2 hover:bg-void-bg-3 transition-all duration-150 ${autoContinueEnabled ? 'text-void-accent' : 'text-void-fg-3'}`}
					data-tooltip-id='void-tooltip'
					data-tooltip-content={autoContinueEnabled ? 'Auto-continue enabled' : 'Auto-continue settings'}
					data-tooltip-place='top'
				>
					<Settings size={14} />
				</button>

				{/* Dropdown menu */}
				{showMenu && (
					<div className="absolute right-0 mt-1 w-48 bg-void-bg-1 border border-void-border-2 rounded-md shadow-lg z-50 py-1">
						<div
							className="flex items-center justify-between px-3 py-2 hover:bg-void-bg-2 cursor-pointer"
							onClick={() => {
								onToggleAutoContinue(!autoContinueEnabled)
								setShowMenu(false)
							}}
						>
							<span className="text-sm text-void-fg-2">Auto-continue</span>
							<VoidSwitch
								size='xxs'
								value={autoContinueEnabled}
								onChange={(val) => onToggleAutoContinue(val)}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}



const scrollToBottom = (divRef: { current: HTMLElement | null }, smooth: boolean = false) => {
	if (divRef.current) {
		if (smooth) {
			divRef.current.scrollTo({
				top: divRef.current.scrollHeight,
				behavior: 'smooth'
			});
		} else {
			divRef.current.scrollTop = divRef.current.scrollHeight;
		}
	}
};



const ScrollToBottomContainer = ({ children, className, style, scrollContainerRef }: { children: React.ReactNode, className?: string, style?: React.CSSProperties, scrollContainerRef: React.MutableRefObject<HTMLDivElement | null> }) => {
	const [isAtBottom, setIsAtBottom] = useState(true); // Start at bottom

	const divRef = scrollContainerRef

	const onScroll = () => {
		const div = divRef.current;
		if (!div) return;

		// More generous threshold for "at bottom" detection
		const isBottom = Math.abs(
			div.scrollHeight - div.clientHeight - div.scrollTop
		) < 50; // Increased from 4 to 50 for smoother experience

		setIsAtBottom(isBottom);
	};

	// Instant scroll to bottom - no animation for better UX during streaming
	const instantScrollToBottom = useCallback(() => {
		scrollToBottom(divRef, false); // Use instant scrolling, no smooth animation
	}, [divRef]);

	// When children change (new messages added)
	useEffect(() => {
		if (isAtBottom) {
			instantScrollToBottom();
		}
	}, [children, isAtBottom, instantScrollToBottom]);

	// Initial scroll to bottom
	useEffect(() => {
		scrollToBottom(divRef);
	}, []);

	return (
		<div
			ref={divRef}
			onScroll={onScroll}
			className={className}
			style={style}
		>
			{children}
		</div>
	);
};




export const SelectedFiles = (
	{ type, selections, setSelections, showProspectiveSelections, messageIdx, }:
		| { type: 'past', selections: StagingSelectionItem[]; setSelections?: undefined, showProspectiveSelections?: undefined, messageIdx: number, }
		| { type: 'staging', selections: StagingSelectionItem[]; setSelections: ((newSelections: StagingSelectionItem[]) => void), showProspectiveSelections?: boolean, messageIdx?: number }
) => {

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const modelReferenceService = accessor.get('IVoidModelService')




	// state for tracking prospective files
	const { uri: currentURI } = useActiveURI()
	const [recentUris, setRecentUris] = useState<URI[]>([])
	const maxRecentUris = 10
	const maxProspectiveFiles = 3
	useEffect(() => { // handle recent files
		if (!currentURI) return
		setRecentUris(prev => {
			const withoutCurrent = prev.filter(uri => uri.fsPath !== currentURI.fsPath) // remove duplicates
			const withCurrent = [currentURI, ...withoutCurrent]
			return withCurrent.slice(0, maxRecentUris)
		})
	}, [currentURI])
	const [prospectiveSelections, setProspectiveSelections] = useState<StagingSelectionItem[]>([])


	// handle prospective files
	useEffect(() => {
		const computeRecents = async () => {
			const prospectiveURIs = recentUris
				.filter(uri => !selections.find(s => s.type === 'File' && s.uri.fsPath === uri.fsPath))
				.slice(0, maxProspectiveFiles)

			const answer: StagingSelectionItem[] = []
			for (const uri of prospectiveURIs) {
				answer.push({
					type: 'File',
					uri: uri,
					language: (await modelReferenceService.getModelSafe(uri)).model?.getLanguageId() || 'plaintext',
					state: { wasAddedAsCurrentFile: false },
				})
			}
			return answer
		}

		// add a prospective file if type === 'staging' and if the user is in a file, and if the file is not selected yet
		if (type === 'staging' && showProspectiveSelections) {
			computeRecents().then((a) => setProspectiveSelections(a))
		}
		else {
			setProspectiveSelections([])
		}
	}, [recentUris, selections, type, showProspectiveSelections])


	const allSelections = [...selections, ...prospectiveSelections]

	if (allSelections.length === 0) {
		return null
	}

	return (
		<div className='flex items-center flex-wrap text-left relative gap-x-0.5 gap-y-1 pb-0.5'>

			{allSelections.map((selection, i) => {

				const isThisSelectionProspective = i > selections.length - 1

				const thisKey = selection.type === 'CodeSelection' ? selection.type + selection.language + selection.range + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
					: selection.type === 'File' ? selection.type + selection.language + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
						: selection.type === 'Folder' ? selection.type + selection.language + selection.state + selection.uri.fsPath
							: i

				const SelectionIcon = (
					selection.type === 'File' ? FileIcon
						: selection.type === 'Folder' ? FolderIcon
							: selection.type === 'CodeSelection' ? TextIcon
								: (undefined as never)
				)

				return <div // container for summarybox and code
					key={thisKey}
					className={`flex flex-col space-y-[1px]`}
				>
					{/* tooltip for file path */}
					<span className="truncate overflow-hidden text-ellipsis"
						data-tooltip-id='void-tooltip'
						data-tooltip-content={getRelative(selection.uri, accessor)}
						data-tooltip-place='top'
						data-tooltip-delay-show={3000}
					>
						{/* summarybox */}
						<div
							className={`
								flex items-center gap-1 relative
								px-1
								w-fit h-fit
								select-none
								text-xs text-nowrap
								border rounded-sm
								${isThisSelectionProspective ? 'bg-void-bg-1 text-void-fg-3 opacity-80' : 'bg-void-bg-1 hover:brightness-95 text-void-fg-1'}
								${isThisSelectionProspective
									? 'border-void-border-2'
									: 'border-void-border-1'
								}
								hover:border-void-border-1
								transition-all duration-150
							`}
							onClick={() => {
								if (type !== 'staging') return; // (never)
								if (isThisSelectionProspective) { // add prospective selection to selections
									setSelections([...selections, selection])
								}
								else if (selection.type === 'File') { // open files
									voidOpenFileFn(selection.uri, accessor);

									const wasAddedAsCurrentFile = selection.state.wasAddedAsCurrentFile
									if (wasAddedAsCurrentFile) {
										// make it so the file is added permanently, not just as the current file
										const newSelection: StagingSelectionItem = { ...selection, state: { ...selection.state, wasAddedAsCurrentFile: false } }
										setSelections([
											...selections.slice(0, i),
											newSelection,
											...selections.slice(i + 1)
										])
									}
								}
								else if (selection.type === 'CodeSelection') {
									voidOpenFileFn(selection.uri, accessor, selection.range);
								}
								else if (selection.type === 'Folder') {
									// TODO!!! reveal in tree
								}
							}}
						>
							{<SelectionIcon size={10} />}

							{ // file name and range
								getBasename(selection.uri.fsPath)
								+ (selection.type === 'CodeSelection' ? ` (${selection.range[0]}-${selection.range[1]})` : '')
							}

							{selection.type === 'File' && selection.state.wasAddedAsCurrentFile && messageIdx === undefined && currentURI?.fsPath === selection.uri.fsPath ?
								<span className={`text-[8px] 'void-opacity-60 text-void-fg-4`}>
									{`(Current File)`}
								</span>
								: null
							}

							{type === 'staging' && !isThisSelectionProspective ? // X button
								<div // box for making it easier to click
									className='cursor-pointer z-1 self-stretch flex items-center justify-center'
									onClick={(e) => {
										e.stopPropagation(); // don't open/close selection
										if (type !== 'staging') return;
										setSelections([...selections.slice(0, i), ...selections.slice(i + 1)])
									}}
								>
									<IconX
										className='stroke-[2]'
										size={10}
									/>
								</div>
								: <></>
							}
						</div>
					</span>
				</div>

			})}


		</div>

	)
}













const UserMessageComponent = ({ chatMessage, messageIdx, isCheckpointGhost, currCheckpointIdx, _scrollToBottom }: { chatMessage: ChatMessage & { role: 'user' }, messageIdx: number, currCheckpointIdx: number | undefined, isCheckpointGhost: boolean, _scrollToBottom: (() => void) | null }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	// global state
	let isBeingEdited = false
	let stagingSelections: StagingSelectionItem[] = []
	let setIsBeingEdited = (_: boolean) => { }
	let setStagingSelections = (_: StagingSelectionItem[]) => { }

	if (messageIdx !== undefined) {
		const _state = chatThreadsService.getCurrentMessageState(messageIdx)
		isBeingEdited = _state.isBeingEdited
		stagingSelections = _state.stagingSelections
		setIsBeingEdited = (v) => chatThreadsService.setCurrentMessageState(messageIdx, { isBeingEdited: v })
		setStagingSelections = (s) => chatThreadsService.setCurrentMessageState(messageIdx, { stagingSelections: s })
	}


	// local state
	const mode: ChatBubbleMode = isBeingEdited ? 'edit' : 'display'
	const [isFocused, setIsFocused] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const [isDisabled, setIsDisabled] = useState(false)
	const [textAreaRefState, setTextAreaRef] = useState<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)
	// initialize on first render, and when edit was just enabled
	const _mustInitialize = useRef(true)
	const _justEnabledEdit = useRef(false)
	useEffect(() => {
		const canInitialize = mode === 'edit' && textAreaRefState
		const shouldInitialize = _justEnabledEdit.current || _mustInitialize.current
		if (canInitialize && shouldInitialize) {
			setStagingSelections(
				(chatMessage.selections || []).map(s => { // quick hack so we dont have to do anything more
					if (s.type === 'File') return { ...s, state: { ...s.state, wasAddedAsCurrentFile: false, } }
					else return s
				})
			)

			if (textAreaFnsRef.current)
				textAreaFnsRef.current.setValue(chatMessage.displayContent || '')

			textAreaRefState.focus();

			_justEnabledEdit.current = false
			_mustInitialize.current = false
		}

	}, [chatMessage, mode, _justEnabledEdit, textAreaRefState, textAreaFnsRef.current, _justEnabledEdit.current, _mustInitialize.current])

	const onOpenEdit = () => {
		setIsBeingEdited(true)
		chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx)
		_justEnabledEdit.current = true
	}
	const onCloseEdit = () => {
		setIsFocused(false)
		setIsHovered(false)
		setIsBeingEdited(false)
		chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

	}

	const EditSymbol = mode === 'display' ? Pencil : X


	let chatbubbleContents: React.ReactNode
	if (mode === 'display') {
		chatbubbleContents = <div className="flex flex-col gap-2">
			<SelectedFiles type='past' messageIdx={messageIdx} selections={chatMessage.selections || []} />
			{/* Show image thumbnails if present */}
			{chatMessage.images && chatMessage.images.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-2">
					{chatMessage.images.map((image, index) => (
						<img
							key={index}
							src={`data:${image.mimeType};base64,${image.base64}`}
							alt={image.name || `Image ${index + 1}`}
							className="w-32 h-32 object-cover rounded-xl border border-void-border-1/30 cursor-pointer hover:opacity-90 transition-all duration-300 hover:scale-[1.02] shadow-md"
							onClick={(e) => {
								e.stopPropagation(); // Prevent triggering edit mode
							}}
						/>
					))}
				</div>
			)}
			<div className='text-[13px] leading-relaxed text-void-fg-1 font-medium'>{chatMessage.displayContent}</div>
		</div>
	}
	else if (mode === 'edit') {

		const onSubmit = async () => {

			if (isDisabled) return;
			if (!textAreaRefState) return;
			if (messageIdx === undefined) return;

			// cancel any streams on this thread
			const threadId = chatThreadsService.state.currentThreadId

			await chatThreadsService.abortRunning(threadId)

			// update state
			setIsBeingEdited(false)
			chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

			// stream the edit
			const userMessage = textAreaRefState.value;
			try {
				await chatThreadsService.editUserMessageAndStreamResponse({ userMessage, messageIdx, threadId })
			} catch (e) {
				console.error('Error while editing message:', e)
			}
			await chatThreadsService.focusCurrentChat()
			requestAnimationFrame(() => _scrollToBottom?.())
		}

		const onAbort = async () => {
			const threadId = chatThreadsService.state.currentThreadId
			await chatThreadsService.abortRunning(threadId)
		}

		const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Escape') {
				onCloseEdit()
			}
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				onSubmit()
			}
		}

		if (!chatMessage.content) { // don't show if empty and not loading (if loading, want to show).
			return null
		}

		chatbubbleContents = <VoidChatArea
			featureName='Chat'
			onSubmit={onSubmit}
			onAbort={onAbort}
			isStreaming={false}
			isDisabled={isDisabled}
			showSelections={true}
			showProspectiveSelections={false}
			selections={stagingSelections}
			setSelections={setStagingSelections}
		>
			<VoidInputBox2
				enableAtToMention
				ref={setTextAreaRef}
				className='min-h-[81px] max-h-[500px] px-0.5'
				placeholder="Edit your message..."
				onChangeText={(text) => setIsDisabled(!text)}
				onFocus={() => {
					setIsFocused(true)
					chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx);
				}}
				onBlur={() => {
					setIsFocused(false)
				}}
				onKeyDown={onKeyDown}
				fnsRef={textAreaFnsRef}
				multiline={true}
			/>
		</VoidChatArea>
	}

	const isMsgAfterCheckpoint = currCheckpointIdx !== undefined && currCheckpointIdx === messageIdx - 1

	return <div className={`flex gap-3 mb-6 ${mode === 'edit' ? 'w-full' : 'self-end max-w-[85%]'} ${isCheckpointGhost && !isMsgAfterCheckpoint ? 'opacity-40 grayscale' : ''}`}
		onMouseEnter={() => setIsHovered(true)}
		onMouseLeave={() => setIsHovered(false)}
	>
		<div className="flex flex-col items-end gap-1.5 flex-1 min-w-0">
			<div
				// style chatbubble according to role
				className={`
				group relative
				${mode === 'edit' ? 'w-full'
						: mode === 'display' ? 'px-4 py-3 bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2/50 rounded-2xl rounded-tr-none text-void-fg-1 cursor-pointer transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5' : ''
					}
			`}
				onClick={() => { if (mode === 'display') { onOpenEdit() } }}
			>
				{chatbubbleContents}

				{mode === 'display' && (
					<div className="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
						<button
							onClick={(e) => { e.stopPropagation(); onOpenEdit(); }}
							className="p-1.5 bg-void-bg-2 border border-void-border-2 rounded-lg hover:bg-void-bg-3 text-void-fg-4 hover:text-void-accent transition-all"
						>
							<Pencil size={14} />
						</button>
					</div>
				)}
			</div>
			{mode === 'display' && <span className="text-[9px] font-black uppercase tracking-[0.15em] text-void-fg-4 opacity-40 px-1">You</span>}
		</div>
	</div>
}


const AssistantMessageComponent = ({ chatMessage, isCheckpointGhost, isCommitted, messageIdx }: { chatMessage: ChatMessage & { role: 'assistant' }, isCheckpointGhost: boolean, messageIdx: number, isCommitted: boolean }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	const reasoningStr = chatMessage.reasoning?.trim() || null
	const hasReasoning = !!reasoningStr
	const isDoneReasoning = !!chatMessage.displayContent
	const thread = chatThreadsService.getCurrentThread()


	const chatMessageLocation: ChatMessageLocation = {
		threadId: thread.id,
		messageIdx: messageIdx,
	}

	const isEmpty = !chatMessage.displayContent && !chatMessage.reasoning
	if (isEmpty) return null

	return <div className={`flex gap-3 mb-8 ${isCheckpointGhost ? 'opacity-40 grayscale' : ''}`}>
		<div className="flex flex-col gap-2 flex-1 min-w-0">
			<div className="flex flex-col gap-3">
				{/* reasoning token */}
				{hasReasoning &&
					<div className="w-full">
						<ReasoningWrapper isDoneReasoning={isDoneReasoning} isStreaming={!isCommitted}>
							<SmallProseWrapper>
								<ChatMarkdownRender
									string={reasoningStr}
									chatMessageLocation={chatMessageLocation}
									isApplyEnabled={false}
									isLinkDetectionEnabled={true}
								/>
							</SmallProseWrapper>
						</ReasoningWrapper>
					</div>
				}

				{/* assistant message */}
				{chatMessage.displayContent &&
					<div className="w-full px-1">
						<ProseWrapper>
							<ChatMarkdownRender
								string={chatMessage.displayContent || ''}
								chatMessageLocation={chatMessageLocation}
								isApplyEnabled={true}
								isLinkDetectionEnabled={true}
							/>
						</ProseWrapper>
					</div>
				}
			</div>
			<span className="text-[9px] font-black uppercase tracking-[0.15em] text-void-fg-4 opacity-40 px-1">A-Coder</span>
		</div>
	</div>

}

const ReasoningWrapper = ({ isDoneReasoning, isStreaming, children }: { isDoneReasoning: boolean, isStreaming: boolean, children: React.ReactNode }) => {
	const isDone = isDoneReasoning || !isStreaming
	const isWriting = !isDone
	// Start open when writing, stay open after done (user can collapse manually)
	const [isOpen, setIsOpen] = useState(true)
	// Auto-open when reasoning starts
	useEffect(() => {
		if (isWriting) setIsOpen(true)
	}, [isWriting])

	const scrollRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom as content streams in
	useEffect(() => {
		if (isWriting && scrollRef.current && isOpen) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [children, isWriting, isOpen])

	const statusText = isWriting ? 'Reasoning' : 'Thought Process'

	return (
		<div className="my-3 mx-1">
			<div className={`rounded-xl border border-void-border-2 overflow-hidden transition-all duration-300 ${isWriting ? 'bg-void-bg-2/30 border-void-accent/20' : 'bg-void-bg-2/10'}`}>
				<div
					className={`flex items-center justify-between px-3 py-2 cursor-pointer select-none transition-colors duration-150 group`}
					onClick={() => setIsOpen(v => !v)}
				>
					<div className="flex items-center gap-2">
						<ChevronRight
							size={12}
							className={`transition-transform duration-200 text-void-fg-4 group-hover:text-void-fg-2 ${isOpen ? 'rotate-90 text-void-accent' : ''}`}
						/>
						<div className="flex items-center gap-2">
							<Brain size={12} className={isWriting ? 'text-void-accent animate-pulse' : 'text-void-fg-4'} />
							<span className={`text-[10px] font-bold uppercase tracking-wider ${isWriting ? 'text-void-accent' : 'text-void-fg-3 group-hover:text-void-fg-2'}`}>
								{statusText}
							</span>
						</div>
					</div>

					{isWriting && (
						<div className="flex items-center gap-1.5 px-2 py-0.5 bg-void-accent/10 rounded-full border border-void-accent/20">
							<span className="text-[9px] font-bold text-void-accent uppercase tracking-widest">Thinking</span>
							<Loader2 className="w-2.5 h-2.5 animate-spin text-void-accent" />
						</div>
					)}
				</div>

				<div
					ref={scrollRef}
					className={`
					overflow-auto transition-all duration-300 ease-in-out custom-scrollbar
					${isOpen ? 'opacity-100 max-h-[800px] border-t border-void-border-2/50 p-3' : 'max-h-0 opacity-0'}
				`}>
					<div className='!select-text cursor-auto text-[11px] leading-relaxed text-void-fg-3 font-medium italic'>
						{children}
					</div>
				</div>
			</div>
		</div>
	)
}




// should either be past or "-ing" tense, not present tense. Eg. when the LLM searches for something, the user expects it to say "I searched for X" or "I am searching for X". Not "I search X".






const ToolRequestAcceptRejectButtons = ({ toolName, toolId }: { toolName: ToolName, toolId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const metricsService = accessor.get('IMetricsService')
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const onAccept = useCallback(() => {
		try { // this doesn't need to be wrapped in try/catch anymore
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.approveLatestToolRequest(threadId, toolId)
			metricsService.capture('Tool Request Accepted', { tool: toolName })
		} catch (e) { console.error('Error while approving message in chat:', e) }
	}, [chatThreadsService, metricsService, toolId, toolName])

	const onReject = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.rejectLatestToolRequest(threadId, toolId)
		} catch (e) { console.error('Error while rejecting message in chat:', e) }
		metricsService.capture('Tool Request Rejected', { tool: toolName })
	}, [chatThreadsService, metricsService, toolId, toolName])

	const onSkip = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.skipLatestToolRequest(threadId, toolId)
		} catch (e) { console.error('Error while skipping tool in chat:', e) }
		metricsService.capture('Tool Request Skipped', { tool: toolName })
	}, [chatThreadsService, metricsService, toolId, toolName])

	const approveButton = (
		<button
			onClick={onAccept}
			className={`
                px-4 py-1.5
                bg-[#0e70c0]
                text-white
                hover:bg-[#1177cb]
                rounded-xl shadow-sm
                text-xs font-bold uppercase tracking-wider
                transition-all duration-200 active:scale-95 flex items-center gap-1.5
            `}
		>
			<Check size={14} strokeWidth={3} />
			Approve
		</button>
	)

	const skipButton = (
		<button
			onClick={onSkip}
			className={`
                px-3 py-1.5
                bg-void-bg-2
                text-void-fg-1
                hover:bg-void-bg-3
                border border-void-border-2
                rounded-xl shadow-sm
                text-xs font-bold uppercase tracking-wider
                transition-all duration-200 active:scale-95 flex items-center gap-1.5
            `}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Skip this command and continue'
		>
			<SkipForward size={14} strokeWidth={2.5} />
			Skip
		</button>
	)

	const cancelButton = (
		<button
			onClick={onReject}
			className={`
                px-3 py-1.5
                bg-void-bg-2
                text-void-fg-1
                hover:bg-void-bg-3
                border border-void-border-2
                rounded-xl shadow-sm
                text-xs font-bold uppercase tracking-wider
                transition-all duration-200 active:scale-95 flex items-center gap-1.5
            `}
		>
			<X size={14} strokeWidth={2.5} />
			Cancel
		</button>
	)

	const approvalType = isABuiltinToolName(toolName) ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools'
	const approvalToggle = approvalType ? <div key={approvalType} className="flex items-center ml-2 gap-x-1">
		<ToolApprovalTypeSwitch size='xs' approvalType={approvalType} desc={`Auto-approve ${approvalType}`} />
	</div> : null

	return <div className="flex gap-2 mx-0.5 items-center">
		{approveButton}
		{skipButton}
		{cancelButton}
		{approvalToggle}
	</div>
}

// Terminal-style command approval UI (like Cursor)
type WrapperProps<T extends ToolName> = { toolMessage: Exclude<ToolMessage<T>, { type: 'invalid_params' }>, messageIdx: number, threadId: string }




// Default wrapper for tools that just show their result as markdown


const builtinToolNameToComponent: { [T in BuiltinToolName]: { resultWrapper: ResultWrapper<T>, } } = {
	'read_file': { resultWrapper: FileResultWrapper as ResultWrapper<'read_file'> },
	'outline_file': { resultWrapper: FileResultWrapper as ResultWrapper<'outline_file'> },
	'ls_dir': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'ls_dir'> },
	'get_dir_tree': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'get_dir_tree'> },
	'search_pathnames_only': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'search_pathnames_only'> },
	'search_for_files': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'search_for_files'> },
	'search_in_file': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'search_in_file'> },
	'fast_context': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'fast_context'> },
	'codebase_search': { resultWrapper: SearchQueryResultWrapper as ResultWrapper<'codebase_search'> },
	'edit_file': { resultWrapper: EditToolResultWrapper as ResultWrapper<'edit_file'> },
	'rewrite_file': { resultWrapper: EditToolResultWrapper as ResultWrapper<'rewrite_file'> },
	'run_command': { resultWrapper: CommandToolResultWrapper as ResultWrapper<'run_command'> },
	'run_persistent_command': { resultWrapper: CommandToolResultWrapper as ResultWrapper<'run_persistent_command'> },
	'wait': { resultWrapper: CommandToolResultWrapper as ResultWrapper<'wait'> },
	'create_file_or_folder': {
		resultWrapper: ({ toolMessage, threadId }) => {
			const accessor = useAccessor()
			const streamState = useChatThreadsStreamState(threadId)
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			componentParams.info = getRelative(params.uri, accessor)

			if (toolMessage.type === 'success' || toolMessage.type === 'rejected') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			} else if (toolMessage.type === 'tool_error') {
				if (params) componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			} else if (toolMessage.type === 'running_now') {
				const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id ? streamState.toolInfo.content : undefined;
				if (activity) {
					componentParams.children = <ToolChildrenWrapper><div className="flex items-center gap-2 py-1"><Loader2 className="w-3 h-3 animate-spin text-void-accent" /><span className="text-xs italic text-void-fg-3">{activity}</span></div></ToolChildrenWrapper>
					componentParams.isOpen = true;
				}
			}
			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'delete_file_or_folder': {
		resultWrapper: ({ toolMessage, threadId }) => {
			const accessor = useAccessor()
			const streamState = useChatThreadsStreamState(threadId)
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			componentParams.info = getRelative(params.uri, accessor)

			if (toolMessage.type === 'success') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			} else if (toolMessage.type === 'tool_error') {
				if (params) componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			} else if (toolMessage.type === 'running_now') {
				const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id ? streamState.toolInfo.content : undefined;
				if (activity) {
					componentParams.children = <ToolChildrenWrapper><div className="flex items-center gap-2 py-1"><Loader2 className="w-3 h-3 animate-spin text-void-accent" /><span className="text-xs italic text-void-fg-3">{activity}</span></div></ToolChildrenWrapper>
					componentParams.isOpen = true;
				}
			}
			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'open_persistent_terminal': {
		resultWrapper: ({ toolMessage, threadId }: WrapperProps<'open_persistent_terminal'>) => {
			const accessor = useAccessor()
			const terminalToolsService = accessor.get('ITerminalToolService')
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			if (toolMessage.type === 'tool_request') {
				return <TerminalCommandApproval command={`Open persistent terminal`} cwd={toolMessage.params.cwd} threadId={threadId} />
			}
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			const relativePath = params.cwd ? getRelative(URI.file(params.cwd), accessor) : ''
			if (relativePath) componentParams.info = `Running in ${relativePath}`
			if (toolMessage.type === 'success') {
				const { persistentTerminalId } = toolMessage.result
				componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
				componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
			} else if (toolMessage.type === 'tool_error') {
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			}
			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'kill_persistent_terminal': {
		resultWrapper: ({ toolMessage }: WrapperProps<'kill_persistent_terminal'>) => {
			const accessor = useAccessor()
			const terminalToolsService = accessor.get('ITerminalToolService')
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			if (toolMessage.type === 'success') {
				const { persistentTerminalId } = params
				componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
				componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
			} else if (toolMessage.type === 'tool_error') {
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			}
			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'run_code': {
		resultWrapper: ({ toolMessage }: WrapperProps<'run_code'>) => {
			const accessor = useAccessor()
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			if (toolMessage.type === 'success') {
				componentParams.bottomChildren = <BottomChildren title='Result'><CodeChildren>{JSON.stringify(toolMessage.result.result, null, 2)}</CodeChildren></BottomChildren>
			} else if (toolMessage.type === 'tool_error') {
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			}
			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'read_lint_errors': {
		resultWrapper: ({ toolMessage }: WrapperProps<'read_lint_errors'>) => {
			const accessor = useAccessor()
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const isRejected = toolMessage.type === 'rejected'
			const { params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }
			componentParams.info = getRelative(params.uri, accessor)
			if (toolMessage.type === 'success') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
				componentParams.children = toolMessage.result.lintErrors && toolMessage.result.lintErrors.length > 0 ?
					<div className='flex flex-col gap-1'>
						{toolMessage.result.lintErrors.map((error: any, i: number) => (
							<div key={i} className='text-void-fg-2 text-xs whitespace-nowrap'>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
						))}
					</div>
					: `No lint errors found.`
			} else if (toolMessage.type === 'tool_error') {
				componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
			}
			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'repo_init': { resultWrapper: DefaultToolResultWrapper },
	'repo_clone': { resultWrapper: DefaultToolResultWrapper },
	'repo_add': { resultWrapper: DefaultToolResultWrapper },
	'repo_commit': { resultWrapper: DefaultToolResultWrapper },
	'repo_push': { resultWrapper: DefaultToolResultWrapper },
	'repo_pull': { resultWrapper: DefaultToolResultWrapper },
	'repo_status': { resultWrapper: DefaultToolResultWrapper },
	'repo_status_matrix': { resultWrapper: DefaultToolResultWrapper },
	'repo_log': { resultWrapper: DefaultToolResultWrapper },
	'repo_checkout': { resultWrapper: DefaultToolResultWrapper },
	'repo_branch': { resultWrapper: DefaultToolResultWrapper },
	'repo_list_branches': { resultWrapper: DefaultToolResultWrapper },
	'repo_current_branch': { resultWrapper: DefaultToolResultWrapper },
	'repo_resolve_ref': { resultWrapper: DefaultToolResultWrapper },
	'repo_get_commit_metadata': { resultWrapper: DefaultToolResultWrapper },
	'repo_wait_for_embeddings': { resultWrapper: DefaultToolResultWrapper },
	'create_plan': { resultWrapper: (params: WrapperProps<'create_plan'>) => (<React.Suspense fallback={null}><LazyPlanningResultWrapper {...params} /></React.Suspense>) },
	'update_task_status': { resultWrapper: (params: WrapperProps<'update_task_status'>) => (<React.Suspense fallback={null}><LazyPlanningResultWrapper {...params} /></React.Suspense>) },
	'add_tasks_to_plan': { resultWrapper: (params: WrapperProps<'add_tasks_to_plan'>) => (<React.Suspense fallback={null}><LazyPlanningResultWrapper {...params} /></React.Suspense>) },
	'get_plan_status': { resultWrapper: (params: WrapperProps<'get_plan_status'>) => (<React.Suspense fallback={null}><LazyPlanningResultWrapper {...params} /></React.Suspense>) },
	'update_walkthrough': { resultWrapper: WalkthroughResultWrapper as ResultWrapper<'update_walkthrough'> },
	'create_implementation_plan': { resultWrapper: (params: WrapperProps<'create_implementation_plan'>) => (<React.Suspense fallback={null}><LazyImplementationPlanPreviewWrapper {...params} /></React.Suspense>) },
	'preview_implementation_plan': { resultWrapper: (params: WrapperProps<'preview_implementation_plan'>) => (<React.Suspense fallback={null}><LazyImplementationPlanPreviewWrapper {...params} /></React.Suspense>) },
	'execute_implementation_plan': { resultWrapper: (params: WrapperProps<'execute_implementation_plan'>) => (<React.Suspense fallback={null}><LazyImplementationPlanPreviewWrapper {...params} /></React.Suspense>) },
	'update_implementation_step': { resultWrapper: (params: WrapperProps<'update_implementation_step'>) => (<React.Suspense fallback={null}><LazyImplementationPlanPreviewWrapper {...params} /></React.Suspense>) },
	'get_implementation_status': { resultWrapper: (params: WrapperProps<'get_implementation_status'>) => (<React.Suspense fallback={null}><LazyImplementationPlanPreviewWrapper {...params} /></React.Suspense>) },
	'open_walkthrough_preview': { resultWrapper: WalkthroughResultWrapper as ResultWrapper<'open_walkthrough_preview'> },
	'explain_code': { resultWrapper: TeachingResultWrapper as ResultWrapper<'explain_code'> },
	'teach_concept': { resultWrapper: TeachingResultWrapper as ResultWrapper<'teach_concept'> },
	'create_exercise': { resultWrapper: TeachingResultWrapper as ResultWrapper<'create_exercise'> },
	'check_answer': { resultWrapper: TeachingResultWrapper as ResultWrapper<'check_answer'> },
	'give_hint': { resultWrapper: TeachingResultWrapper as ResultWrapper<'give_hint'> },
	'create_lesson_plan': { resultWrapper: TeachingResultWrapper as ResultWrapper<'create_lesson_plan'> },
	'load_skill': { resultWrapper: SkillsResultWrapper as ResultWrapper<'load_skill'> },
	'list_skills': { resultWrapper: SkillsResultWrapper as ResultWrapper<'list_skills'> },
	'generate_image': { resultWrapper: MediaResultWrapper as ResultWrapper<'generate_image'> },
	'generate_video': { resultWrapper: MediaResultWrapper as ResultWrapper<'generate_video'> },
	'render_form': { resultWrapper: FormResultWrapper as ResultWrapper<'render_form'> },
	'create_quiz': { resultWrapper: QuizResultWrapper as ResultWrapper<'create_quiz'> },
	// Browser / Webview tools
	'open_url': { resultWrapper: WebviewResultWrapper as ResultWrapper<'open_url'> },
	'fetch_url': { resultWrapper: WebviewResultWrapper as ResultWrapper<'fetch_url'> },
	'open_devtools': { resultWrapper: WebviewResultWrapper as ResultWrapper<'open_devtools'> },
	'click_element': { resultWrapper: WebviewResultWrapper as ResultWrapper<'click_element'> },
	'get_page_text': { resultWrapper: WebviewResultWrapper as ResultWrapper<'get_page_text'> },
	'webview_screenshot': { resultWrapper: WebviewResultWrapper as ResultWrapper<'webview_screenshot'> },
	'search_web': { resultWrapper: WebviewResultWrapper as ResultWrapper<'search_web'> },
	'browse_resources': { resultWrapper: WebviewResultWrapper as ResultWrapper<'browse_resources'> },
};


const Checkpoint = ({ message, threadId, messageIdx, isCheckpointGhost, threadIsRunning }: { message: CheckpointEntry, threadId: string; messageIdx: number, isCheckpointGhost: boolean, threadIsRunning: boolean }) => {
	const accessor = useAccessor()
	const chatThreadService = accessor.get('IChatThreadService')
	const streamState = useFullChatThreadsStreamState()

	const isRunning = useChatThreadsStreamState(threadId)?.isRunning
	const isDisabled = useMemo(() => {
		if (isRunning) return true
		return !!Object.keys(streamState).find((threadId2) => streamState[threadId2]?.isRunning)
	}, [isRunning, streamState])

	return <div
		className={`flex items-center justify-center px-2 `}
	>
		<div
			className={`
                    text-xs
                    text-void-fg-3
                    select-none
                    ${isCheckpointGhost ? 'opacity-50' : 'opacity-100'}
					${isDisabled ? 'cursor-default' : 'cursor-pointer'}
                `}
			style={{ position: 'relative', display: 'inline-block' }} // allow absolute icon
			onClick={() => {
				if (threadIsRunning) return
				if (isDisabled) return
				chatThreadService.jumpToCheckpointBeforeMessageIdx({
					threadId,
					messageIdx,
					jumpToUserModified: messageIdx === (chatThreadService.state.allThreads[threadId]?.messages.length ?? 0) - 1
				})
			}}
			{...isDisabled ? {
				'data-tooltip-id': 'void-tooltip',
				'data-tooltip-content': `Disabled ${isRunning ? 'when running' : 'because another thread is running'}`,
				'data-tooltip-place': 'top',
			} : {}}
		>
			Checkpoint
		</div>
	</div>
}


type ChatBubbleMode = 'display' | 'edit'
type ChatBubbleProps = {
	chatMessage: ChatMessage,
	messageIdx: number,
	isCommitted: boolean,
	chatIsRunning: IsRunningType,
	threadId: string,
	currCheckpointIdx: number | undefined,
	_scrollToBottom: (() => void) | null,
}

const ChatBubble = (props: ChatBubbleProps) => {
	return <ErrorBoundary>
		<_ChatBubble {...props} />
	</ErrorBoundary>
}

const _ChatBubble = ({ threadId, chatMessage, currCheckpointIdx, isCommitted, messageIdx, chatIsRunning, _scrollToBottom }: ChatBubbleProps) => {
	const role = chatMessage.role

	const isCheckpointGhost = messageIdx > (currCheckpointIdx ?? Infinity) && !chatIsRunning // whether to show as gray (if chat is running, for good measure just dont show any ghosts)

	if (role === 'user') {
		return <UserMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			currCheckpointIdx={currCheckpointIdx}
			messageIdx={messageIdx}
			_scrollToBottom={_scrollToBottom}
		/>
	}
	else if (role === 'assistant') {
		return <AssistantMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			messageIdx={messageIdx}
			isCommitted={isCommitted}
		/>
	}
	else if (role === 'tool') {

		if (chatMessage.type === 'invalid_params') {
			return <div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
				<InvalidTool toolName={chatMessage.name} message={chatMessage.content} mcpServerName={chatMessage.mcpServerName} />
			</div>
		}

		const toolName = chatMessage.name
		const isBuiltInTool = isABuiltinToolName(toolName)
		const ToolResultWrapper = isBuiltInTool ? builtinToolNameToComponent[toolName]?.resultWrapper as ResultWrapper<ToolName>
			: MCPToolResultWrapper as ResultWrapper<ToolName>

		if (ToolResultWrapper)
			return <>
				<div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
					<ToolResultWrapper
						toolMessage={chatMessage}
						messageIdx={messageIdx}
						threadId={threadId}
					/>
				</div>
				{chatMessage.type === 'tool_request' && chatMessage.name !== 'run_command' && chatMessage.name !== 'run_persistent_command' && chatMessage.name !== 'open_persistent_terminal' && chatMessage.name !== 'render_form' && chatMessage.name !== 'create_quiz' ?
					<div className={`${isCheckpointGhost ? 'opacity-50 pointer-events-none' : ''}`}>
						<ToolRequestAcceptRejectButtons toolName={chatMessage.name} toolId={chatMessage.id} />
					</div> : null}
			</>
		return null
	}

	else if (role === 'interrupted_streaming_tool') {
		return <div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
			<CanceledTool toolName={chatMessage.name} mcpServerName={chatMessage.mcpServerName} />
		</div>
	}

	else if (role === 'checkpoint') {
		return <Checkpoint
			threadId={threadId}
			message={chatMessage}
			messageIdx={messageIdx}
			isCheckpointGhost={isCheckpointGhost}
			threadIsRunning={!!chatIsRunning}
		/>
	}

}

const CommandBarInChat = () => {
	const { stateOfURI: commandBarStateOfURI, sortedURIs: sortedCommandBarURIs } = useCommandBarState()
	const numFilesChanged = sortedCommandBarURIs.length

	const accessor = useAccessor()
	const editCodeService = accessor.get('IEditCodeService')
	const commandService = accessor.get('ICommandService')
	const chatThreadsState = useChatThreadsState()
	const commandBarState = useCommandBarState()
	const chatThreadsStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)

	// (
	// 	<IconShell1
	// 		Icon={CopyIcon}
	// 		onClick={copyChatToClipboard}
	// 		data-tooltip-id='void-tooltip'
	// 		data-tooltip-place='top'
	// 		data-tooltip-content='Copy chat JSON'
	// 	/>
	// )

	const [fileDetailsOpenedState, setFileDetailsOpenedState] = useState<'auto-opened' | 'auto-closed' | 'user-opened' | 'user-closed'>('auto-closed');
	const isFileDetailsOpened = fileDetailsOpenedState === 'auto-opened' || fileDetailsOpenedState === 'user-opened';


	useEffect(() => {
		// close the file details if there are no files
		// this converts 'user-closed' to 'auto-closed'
		if (numFilesChanged === 0) {
			setFileDetailsOpenedState('auto-closed')
		}
		// open the file details if it hasnt been closed
		if (numFilesChanged > 0 && fileDetailsOpenedState !== 'user-closed') {
			setFileDetailsOpenedState('auto-opened')
		}
	}, [fileDetailsOpenedState, setFileDetailsOpenedState, numFilesChanged])


	const isFinishedMakingThreadChanges = (
		// there are changed files
		commandBarState.sortedURIs.length !== 0
		// none of the files are streaming
		&& commandBarState.sortedURIs.every(uri => !commandBarState.stateOfURI[uri.fsPath]?.isStreaming)
	)

	// ======== status of agent ========
	// This icon answers the question "is the LLM doing work on this thread?"
	// assume it is single threaded for now
	// green = Running
	// orange = Requires action
	// dark = Done

	// Detect if we're generating a tool call (native or XML)
	const { toolCallsSoFar, _rawTextBeforeStripping } = chatThreadsStreamState?.llmInfo ?? {}
	const streamingToolCall = toolCallsSoFar?.[0]
	const isGeneratingToolCall = !!(toolCallsSoFar && toolCallsSoFar.some(tc => !tc.isDone))
	const isGeneratingXMLTool = !!(_rawTextBeforeStripping && _rawTextBeforeStripping.includes('<function_calls>') && !_rawTextBeforeStripping.includes('</function_calls>'))
	const isAnyToolGenerating = isGeneratingToolCall || isGeneratingXMLTool

	// Get tool-specific status title
	const getToolStatusTitle = (): string => {
		// Check if a tool is currently executing
		const executingToolName = chatThreadsStreamState?.toolInfo?.toolName
		if (executingToolName) {
			const isMCPTool = chatThreadsStreamState?.toolInfo?.mcpServerName
			if (isMCPTool && chatThreadsStreamState.toolInfo) {
				return `Calling ${chatThreadsStreamState.toolInfo.mcpServerName}...`
			}
			// Use the "running" title from titleOfBuiltinToolName if it's a builtin tool
			if (isABuiltinToolName(executingToolName)) {
				const runningTitle = titleOfBuiltinToolName[executingToolName]?.running
				if (runningTitle) {
					// Extract text from the loading wrapper if it exists
					if (typeof runningTitle === 'object' && runningTitle && 'props' in runningTitle) {
						const props = runningTitle.props as any
						return props.children?.[0] || 'Running tool...'
					}
					return String(runningTitle)
				}
			}
		}

		// Check if a tool is being generated in the LLM response
		const generatingToolName = streamingToolCall?.name
		if (generatingToolName && isABuiltinToolName(generatingToolName)) {
			const runningTitle = titleOfBuiltinToolName[generatingToolName]?.running
			if (runningTitle) {
				if (typeof runningTitle === 'object' && runningTitle && 'props' in runningTitle) {
					const props = runningTitle.props as any
					return props.children?.[0] || 'Generating tool...'
				}
				return String(runningTitle)
			}
		}

		// Default for XML or unknown tools
		return 'Editing...'
	}

	const threadStatus = (
		chatThreadsStreamState?.isRunning === 'awaiting_user' ? { title: 'Needs Approval', color: 'yellow', } as const
			: chatThreadsStreamState?.isRunning === 'tool' ? { title: getToolStatusTitle(), color: 'orange', } as const
				: isAnyToolGenerating ? { title: getToolStatusTitle(), color: 'orange', } as const
					: chatThreadsStreamState?.isRunning ? { title: 'Running', color: 'orange', } as const
						: { title: 'Done', color: 'dark', } as const
	)


	const threadStatusHTML = <StatusIndicator className='mx-1' indicatorColor={threadStatus.color} title={threadStatus.title} />


	// ======== info about changes ========
	// num files changed
	// acceptall + rejectall
	// popup info about each change (each with num changes + acceptall + rejectall of their own)

	const numFilesChangedStr = numFilesChanged === 0 ? 'No files with changes'
		: `${sortedCommandBarURIs.length} file${numFilesChanged === 1 ? '' : 's'} with changes`




	const acceptRejectAllButtons = <div
		// do this with opacity so that the height remains the same at all times
		className={`flex items-center gap-0.5
			${isFinishedMakingThreadChanges ? '' : 'opacity-0 pointer-events-none'}`
		}
	>
		<IconShell1 // RejectAllButtonWrapper
			// text="Reject All"
			// className="text-xs"
			Icon={X}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "reject",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Reject all'
		/>

		<IconShell1 // AcceptAllButtonWrapper
			// text="Accept All"
			// className="text-xs"
			Icon={Check}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "accept",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Accept all'
		/>



	</div>


	// !select-text cursor-auto
	const fileDetailsContent = <div className="px-2 gap-1 w-full overflow-y-auto">
		{sortedCommandBarURIs.map((uri, i) => {
			const basename = getBasename(uri.fsPath)

			const { sortedDiffIds, isStreaming } = commandBarStateOfURI[uri.fsPath] ?? {}
			const isFinishedMakingFileChanges = !isStreaming

			const numDiffs = sortedDiffIds?.length || 0

			const fileStatus = (isFinishedMakingFileChanges
				? { title: 'Done', color: 'dark', } as const
				: { title: 'Running', color: 'orange', } as const
			)

			const fileNameHTML = <div
				className="flex items-center gap-1.5 text-void-fg-3 hover:brightness-125 transition-all duration-200 cursor-pointer"
				onClick={() => voidOpenFileFn(uri, accessor)}
			>
				{/* <FileIcon size={14} className="text-void-fg-3" /> */}
				<span className="text-void-fg-3">{basename}</span>
			</div>




			const detailsContent = <div className='flex px-4'>
				<span className="text-void-fg-3 opacity-80">{numDiffs} diff{numDiffs !== 1 ? 's' : ''}</span>
			</div>

			const acceptRejectButtons = <div
				// do this with opacity so that the height remains the same at all times
				className={`flex items-center gap-0.5
					${isFinishedMakingFileChanges ? '' : 'opacity-0 pointer-events-none'}
				`}
			>
				{/* <JumpToFileButton
					uri={uri}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Go to file'
				/> */}
				<IconShell1 // RejectAllButtonWrapper
					Icon={X}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "reject", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Reject file'

				/>
				<IconShell1 // AcceptAllButtonWrapper
					Icon={Check}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "accept", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Accept file'
				/>

			</div>

			const fileStatusHTML = <StatusIndicator className='mx-1' indicatorColor={fileStatus.color} title={fileStatus.title} />

			return (
				// name, details
				<div key={i} className="flex justify-between items-center">
					<div className="flex items-center">
						{fileNameHTML}
						{detailsContent}
					</div>
					<div className="flex items-center gap-2">
						{acceptRejectButtons}
						{fileStatusHTML}
					</div>
				</div>
			)
		})}
	</div>

	const fileDetailsButton = (
		<button
			className={`flex items-center gap-1 rounded ${numFilesChanged === 0 ? 'cursor-pointer' : 'cursor-pointer hover:brightness-125 transition-all duration-200'}`}
			onClick={() => isFileDetailsOpened ? setFileDetailsOpenedState('user-closed') : setFileDetailsOpenedState('user-opened')}
			type='button'
			disabled={numFilesChanged === 0}
		>
			<svg
				className="transition-transform duration-200 size-3.5"
				style={{
					transform: isFileDetailsOpened ? 'rotate(0deg)' : 'rotate(180deg)',
					transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
				}}
				xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline>
			</svg>
			{numFilesChangedStr}
		</button>
	)

	// MCP menu moved to quick action button at top of chat UI

	return (
		<>
			{/* file details */}
			<div className='px-2'>
				<div
					className={`
						select-none
						flex w-full rounded-t-lg bg-void-bg-3
						text-void-fg-3 text-xs text-nowrap

						overflow-hidden transition-all duration-200 ease-in-out
						${isFileDetailsOpened ? 'max-h-24' : 'max-h-0'}
					`}
				>
					{fileDetailsContent}
				</div>
			</div>
			{/* main content */}
			<div
				className={`
					select-none
					flex w-full rounded-t-lg bg-void-bg-3
					text-void-fg-3 text-xs text-nowrap
					border-t border-l border-r border-zinc-300/10

					px-3 py-2
					justify-between
				`}
			>
				<div className="flex gap-2 items-center">
					{fileDetailsButton}
				</div>
				<div className="flex gap-2 items-center">
					{acceptRejectAllButtons}
					{threadStatusHTML}
				</div>
			</div>
		</>
	)
}



const EditToolSoFar = ({ toolCallSoFar, }: { toolCallSoFar: RawToolCallObj }) => {

	if (!isABuiltinToolName(toolCallSoFar.name)) return null

	const accessor = useAccessor()

	const uri = toolCallSoFar.rawParams.uri ? URI.file(toolCallSoFar.rawParams.uri) : undefined

	const title = titleOfBuiltinToolName[toolCallSoFar.name].proposed

	const uriDone = toolCallSoFar.doneParams.includes('uri')

	// Calculate diff stats from original_updated_blocks (for edit_file)
	let addedLines = 0;
	let removedLines = 0;
	const content = toolCallSoFar.rawParams.original_updated_blocks ?? toolCallSoFar.rawParams.new_content ?? toolCallSoFar.rawParams.newContent ?? '';
	if (toolCallSoFar.rawParams.original_updated_blocks) {
		const blocks = toolCallSoFar.rawParams.original_updated_blocks.split('<<<<<<< ORIGINAL').slice(1);
		blocks.forEach((block: string) => {
			const parts = block.split('=======');
			if (parts.length === 2) {
				const original = parts[0].trim();
				const updated = parts[1].split('>>>>>>> UPDATED')[0].trim();
				removedLines += original ? original.split('\n').length : 0;
				addedLines += updated ? updated.split('\n').length : 0;
			}
		});
	}

	// Determine loading message based on tool type
	const loadingMessage =
		toolCallSoFar.name === 'read_file' ? 'Reading file...' :
			toolCallSoFar.name === 'edit_file' ? 'Editing file...' :
				toolCallSoFar.name === 'rewrite_file' ? 'Writing file...' :
					toolCallSoFar.name === 'create_file_or_folder' ? 'Creating...' :
						toolCallSoFar.name === 'delete_file_or_folder' ? 'Deleting...' :
							toolCallSoFar.name === 'outline_file' ? 'Reading outline...' :
								'Processing...';

	// Fast tools that don't need loading animation
	const isQuickTool = toolCallSoFar.name === 'read_file' || toolCallSoFar.name === 'outline_file'

	const desc1 = <span className='flex items-center gap-1.5'>
		{uriDone ? (
			<>
				<span>{getBasename(toolCallSoFar.rawParams['uri'] ?? 'unknown')}</span>
				{(addedLines > 0 || removedLines > 0) && (
					<span className='flex items-center gap-1 text-xs'>
						{addedLines > 0 && <span className='text-green-500'>+{addedLines}</span>}
						{removedLines > 0 && <span className='text-red-500'>-{removedLines}</span>}
					</span>
				)}
			</>
		) : isQuickTool ? (
			// Quick tools: just show the message without animation
			<span className='text-void-fg-3'>{loadingMessage}</span>
		) : (
			<span className='text-void-accent font-medium animate-pulse'>{loadingMessage}</span>
		)}
		{!uriDone && !isQuickTool && <IconLoading />}
	</span>

	const desc1OnClick = () => { uri && voidOpenFileFn(uri, accessor) }

	// Determine edit tool type based on tool name
	const editToolType = toolCallSoFar.name === 'edit_file' ? 'diff' : 'rewrite';

	// Show the diff editor for edit_file and rewrite_file (even if content is still streaming)
	const shouldShowEditor = (toolCallSoFar.name === 'edit_file' || toolCallSoFar.name === 'rewrite_file');

	// Add "Generating..." indicator to match the visual layout
	const desc2 = (
		<div className="flex items-center gap-1.5 text-xs text-void-fg-3">
			<span>Generating</span>
			<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
		</div>
	);

	// Show the beautiful diff editor UI during generation for edit/rewrite tools
	return <ToolHeaderWrapper
		title={title}
		desc1={desc1}
		desc1OnClick={desc1OnClick}
		desc2={desc2}
	>
		{shouldShowEditor && (
			<ToolChildrenWrapper>
				<EditToolChildren
					uri={uri}
					code={content}
					type={editToolType}
				/>
			</ToolChildrenWrapper>
		)}
	</ToolHeaderWrapper>

}


export const SidebarChat = () => {
	const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const chatThreadsService = accessor.get('IChatThreadService')

	const settingsState = useSettingsState()
	// ----- HIGHER STATE -----

	// threads state
	const chatThreadsState = useChatThreadsState()

	const currentThread = chatThreadsService.getCurrentThread()
	const previousMessages = currentThread?.messages ?? []

	const selections = currentThread.state.stagingSelections
	const setSelections = (s: StagingSelectionItem[]) => { chatThreadsService.setCurrentThreadState({ stagingSelections: s }) }

	// stream state
	const currThreadStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)
	const isRunning = currThreadStreamState?.isRunning
	const latestError = currThreadStreamState?.error
	const { displayContentSoFar, toolCallsSoFar, reasoningSoFar, _rawTextBeforeStripping, reactPhase } = currThreadStreamState?.llmInfo ?? {}
		// this is just if it's currently being generated, NOT if it's currently running
		const toolIsGenerating = !!(toolCallsSoFar && toolCallsSoFar.some(tc => !tc.isDone)) // show loading for slow tools (right now just edit)
	
		// Also detect if tool name exists (even if params aren't done yet)
		const hasToolName = !!(toolCallsSoFar && toolCallsSoFar.length > 0 && toolCallsSoFar[0].name && toolCallsSoFar[0].name !== 'detecting...')
	
		// Detect if a tool call just completed but hasn't started executing yet
		// This covers the gap between stream completion and tool execution start
		const toolCallJustCompleted = !!(toolCallsSoFar && toolCallsSoFar.every(tc => tc.isDone) && isRunning === 'LLM')
	
		// For XML tool calling: detect if we're inside a <function_calls> block even before parsing completes
		// Use raw text before stripping to detect the XML tags
		const isGeneratingXMLToolCall = !!(!toolIsGenerating && _rawTextBeforeStripping && _rawTextBeforeStripping.includes('<function_calls>') && !_rawTextBeforeStripping.includes('</function_calls>'));
	
		// Use tool calls from ReAct parser if available, otherwise use native tool calls
		const toolCallsToRender = toolCallsSoFar || [];

	// ReAct phase detection for enhanced UI
	const isReActThoughtPhase = reactPhase?.type === 'thought';
	const isReActActionPhase = reactPhase?.type === 'action';
	const isReActObservationPhase = reactPhase?.type === 'observation';

	// Detect ANY tool call activity (native or XML) - ensure boolean
	const isAnyToolActivity = hasToolName || toolIsGenerating || isGeneratingXMLToolCall;

	// Debug: log tool state and ReAct phase
	if ((toolCallsSoFar && toolCallsSoFar.length > 0) || isGeneratingXMLToolCall || reactPhase) {
		console.log('[SidebarChat] Tool generation state:', {
			toolCallsSoFar: toolCallsSoFar ? toolCallsSoFar.map(tc => ({
				name: tc.name,
				isDone: tc.isDone,
			})) : null,
			isGeneratingXMLToolCall,
			reactPhase: reactPhase ? {
				type: reactPhase.type,
				content: reactPhase.content,
				detectedAt: reactPhase.detectedAt
			} : null,
			displayContentLength: displayContentSoFar?.length
		});
	}

	// ----- SIDEBAR CHAT state (local) -----

	// state of current message
	const initVal = ''
	const [instructionsAreEmpty, setInstructionsAreEmpty] = useState(!initVal)

	// Image upload state
	const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
	const [isDraggingOver, setIsDraggingOver] = useState(false)

	// MCP Server Modal state
	const [isMCPModalOpen, setIsMCPModalOpen] = useState(false)

	// Learning Dashboard state
	const [showLearningDashboard, setShowLearningDashboard] = useState(false)

	// Quiz Me (spaced repetition) state
	const [showQuizMe, setShowQuizMe] = useState(false)

	// Task Plan state
	const [tasks, setTasks] = useState<TaskPlan[]>([])
	const threadId = chatThreadsState.currentThreadId

	// Load tasks when thread changes
	useEffect(() => {
		if (threadId) {
			setTasks(chatThreadsService.getTaskPlan(threadId))
		}
	}, [threadId, chatThreadsState])

	// Task handlers
	const handleCreateTask = (description: string) => {
		if (threadId) {
			chatThreadsService.createTask(threadId, description)
			setTasks(chatThreadsService.getTaskPlan(threadId))
		}
	}

	const handleUpdateTaskStatus = (taskId: string, status: TaskPlan['status']) => {
		if (threadId) {
			chatThreadsService.updateTaskStatus(threadId, taskId, status)
			setTasks(chatThreadsService.getTaskPlan(threadId))
		}
	}

	const handleDeleteTask = (taskId: string) => {
		if (threadId) {
			chatThreadsService.deleteTask(threadId, taskId)
			setTasks(chatThreadsService.getTaskPlan(threadId))
		}
	}

	const handleClearPlan = () => {
		if (threadId) {
			chatThreadsService.clearTaskPlan(threadId)
			setTasks([])
		}
	}

	// Image upload helpers
	const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
	const MAX_IMAGES = 10;
	const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

	const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string; name: string }> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				// Remove data:image/...;base64, prefix
				const base64 = result.split(',')[1];
				resolve({ base64, mimeType: file.type, name: file.name });
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	};

	const handleImageFiles = async (files: FileList | File[]) => {
		if (!settingsState.globalSettings.enableVisionSupport) return;

		const fileArray = Array.from(files);
		const imageFiles = fileArray.filter(file => SUPPORTED_IMAGE_TYPES.includes(file.type));

		if (imageFiles.length === 0) return;

		// Check limits
		if (attachedImages.length + imageFiles.length > MAX_IMAGES) {
			console.warn(`Maximum ${MAX_IMAGES} images allowed`);
			return;
		}

		// Check file sizes
		const oversizedFiles = imageFiles.filter(file => file.size > MAX_IMAGE_SIZE);
		if (oversizedFiles.length > 0) {
			console.warn(`Some images exceed ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
			return;
		}

		// Convert to base64
		try {
			const newImages = await Promise.all(imageFiles.map(fileToBase64));
			setAttachedImages(prev => [...prev, ...newImages]);
		} catch (error) {
			console.error('Failed to process images:', error);
		}
	};

	// Listen for MCP modal open requests
	useEffect(() => {
		const mcpModalService = accessor.get('IMCPModalService');
		const disposable = mcpModalService.onDidRequestOpen(() => {
			setIsMCPModalOpen(true);
		});
		return () => disposable.dispose();
	}, [accessor]);

	const isDisabled = instructionsAreEmpty || !!isFeatureNameDisabled('Chat', settingsState)

	const sidebarRef = useRef<HTMLDivElement>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const onSubmit = useCallback(async (_forceSubmit?: string) => {

		if (isDisabled && !_forceSubmit) return

		const threadId = chatThreadsService.state.currentThreadId

		// send message to LLM
		const userMessage = _forceSubmit || textAreaRef.current?.value || ''
		const imagesToSend = attachedImages.length > 0 ? attachedImages : undefined
		const selectionsToSend = selections.length > 0 ? [...selections] : undefined // copy before clearing

		// Clear UI immediately (before async call)
		setSelections([]) // clear staging
		setAttachedImages([]) // clear images
		textAreaFnsRef.current?.setValue('')
		textAreaRef.current?.focus() // focus input after submit

		try {
			await chatThreadsService.addUserMessageAndStreamResponse({
				userMessage,
				threadId,
				images: imagesToSend,
				selections: selectionsToSend
			})
		} catch (e) {
			console.error('Error while sending message in chat:', e)
		}

	}, [chatThreadsService, isDisabled, isRunning, textAreaRef, textAreaFnsRef, setSelections, settingsState, attachedImages, selections])

	const onAbort = async () => {
		const threadId = currentThread.id
		handleAutoContinueToggle(false)
		await chatThreadsService.abortRunning(threadId)
	}

	const keybindingString = accessor.get('IKeybindingService').lookupKeybinding(VOID_CTRL_L_ACTION_ID)?.getLabel()

	const currCheckpointIdx = chatThreadsState.allThreads[threadId]?.state?.currCheckpointIdx ?? undefined  // if not exist, treat like checkpoint is last message (infinity)

	const [autoContinueEnabled, setAutoContinueEnabled] = useState(() => chatThreadsService.getAutoContinuePreference(threadId))
	useEffect(() => {
		setAutoContinueEnabled(chatThreadsService.getAutoContinuePreference(threadId))
	}, [chatThreadsService, threadId, chatThreadsState.allThreads[threadId]?.state.autoContinueEnabled])

	const handleAutoContinueToggle = useCallback((value: boolean) => {
		setAutoContinueEnabled(value)
		chatThreadsService.setAutoContinuePreference(threadId, value)

		// If enabling auto-continue and not currently running, send continue immediately
		if (value && !isRunning) {
			const lastNonCheckpointMessage = currentThread?.messages?.slice().reverse().find(msg => msg.role !== 'checkpoint')
			if (lastNonCheckpointMessage?.role === 'assistant') {
				const responseLength = lastNonCheckpointMessage.displayContent?.trim().length || 0
				if (responseLength < AUTO_CONTINUE_CHAR_THRESHOLD) {
					console.log(`[AutoContinue] Enabled - sending continue immediately (response length: ${responseLength} chars)`)
					onSubmit('continue')
				} else {
					console.log(`[AutoContinue] Enabled but skipping auto-continue (response length: ${responseLength} chars >= ${AUTO_CONTINUE_CHAR_THRESHOLD})`)
				}
			}
		}
	}, [chatThreadsService, threadId, isRunning, currentThread?.messages, onSubmit])

	// Auto-continue effect: automatically send "continue" when enabled and LLM finishes
	// Track the last message ID we triggered for to prevent duplicate triggers
	const lastTriggeredMessageIdRef = useRef<string | null>(null)

	useEffect(() => {
		// Don't trigger while running - no logging here to avoid spam during streaming
		if (isRunning) return

		// Check if auto-continue is enabled
		if (!autoContinueEnabled) return

		// Check if last message is from assistant
		const lastNonCheckpointMessage = currentThread?.messages?.slice().reverse().find(msg => msg.role !== 'checkpoint')
		if (lastNonCheckpointMessage?.role !== 'assistant') return

		// Get the message ID to track if we've already triggered for this message
		const messageId = (lastNonCheckpointMessage as any).id || `${currentThread?.messages?.length}`

		// Don't trigger if we already triggered for this exact message
		if (lastTriggeredMessageIdRef.current === messageId) return

		// Mark as triggered for this message
		lastTriggeredMessageIdRef.current = messageId

		const responseLength = lastNonCheckpointMessage.displayContent?.trim().length || 0
		
		if (responseLength < AUTO_CONTINUE_CHAR_THRESHOLD) {
			console.log(`[AutoContinue] Triggering for message ${messageId} (${responseLength} chars)`)

			// Small delay to let UI settle
			const timer = setTimeout(() => {
				onSubmit('continue')
			}, 500)

			return () => clearTimeout(timer)
		} else {
			console.log(`[AutoContinue] Skipping auto-continue (response length: ${responseLength} chars >= ${AUTO_CONTINUE_CHAR_THRESHOLD})`)
		}
	}, [isRunning, autoContinueEnabled, currentThread?.messages, onSubmit])

	// resolve mount info
	const isResolved = chatThreadsState.allThreads[threadId]?.state.mountedInfo?.mountedIsResolvedRef.current
	useEffect(() => {
		if (isResolved) return
		chatThreadsState.allThreads[threadId]?.state.mountedInfo?._whenMountedResolver?.({
			textAreaRef: textAreaRef,
			scrollToBottom: () => scrollToBottom(scrollContainerRef),
		})

	}, [chatThreadsState, threadId, textAreaRef, scrollContainerRef, isResolved])




	// PERFORMANCE: Virtualization - limit rendered messages to prevent UI freezing
	const MAX_VISIBLE_MESSAGES = 50; // Only render last 50 messages initially
	const [showAllMessages, setShowAllMessages] = useState(false);

	const previousMessagesHTML = useMemo(() => {
		// const lastMessageIdx = previousMessages.findLastIndex(v => v.role !== 'checkpoint')
		// tool request shows up as Editing... if in progress
		const filteredMessages = previousMessages
			.map((message, originalIdx) => ({ message, originalIdx })) // Preserve original index
			.filter(({ message }) => {
				// Filter out assistant messages that are truly empty (no content AND no reasoning)
				if (message.role === 'assistant') {
					const hasContent = !!(message.displayContent?.trim() && message.displayContent?.trim() !== '(empty message)');
					const hasReasoning = !!(message.reasoning?.trim());
					if (!hasContent && !hasReasoning) {
						return false;
					}
				}
				return true;
			});

		// PERFORMANCE: Only render recent messages unless user requests all
		const shouldVirtualize = !showAllMessages && filteredMessages.length > MAX_VISIBLE_MESSAGES;
		const messagesToRender = shouldVirtualize
			? filteredMessages.slice(-MAX_VISIBLE_MESSAGES)
			: filteredMessages;
		const hiddenCount = filteredMessages.length - messagesToRender.length;

		const messageElements = messagesToRender.map(({ message, originalIdx }) => {
			return <div key={originalIdx} className="mb-4 flex flex-col" data-message-idx={originalIdx}>
				<ChatBubble
					currCheckpointIdx={currCheckpointIdx}
					chatMessage={message}
					messageIdx={originalIdx}
					isCommitted={true}
					chatIsRunning={isRunning}
					threadId={threadId}
					_scrollToBottom={() => scrollToBottom(scrollContainerRef)}
				/>
			</div>
		});

		// Add "Load more" button if messages are hidden
		if (hiddenCount > 0) {
			messageElements.unshift(
				<div key="load-more" className="mb-4 flex justify-center">
					<button
						onClick={() => setShowAllMessages(true)}
						className="px-4 py-2 text-sm text-void-fg-3 hover:text-void-fg-1 bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 rounded-lg transition-colors"
					>
						Load {hiddenCount} earlier messages
					</button>
				</div>
			);
		}

		return messageElements;
	}, [previousMessages, threadId, currCheckpointIdx, isRunning, showAllMessages])

	// Reset showAllMessages when thread changes
	useEffect(() => {
		setShowAllMessages(false);
	}, [threadId]);

	// Use the actual message index for the streaming bubble so React doesn't remount when streaming ends
	const streamingChatIdx = previousMessages.length
	const currStreamingMessageHTML = reasoningSoFar || displayContentSoFar || isRunning ?
		<ChatBubble
			key={streamingChatIdx}
			currCheckpointIdx={currCheckpointIdx}
			chatMessage={{
				role: 'assistant',
				displayContent: displayContentSoFar ?? '',
				reasoning: reasoningSoFar ?? '',
				anthropicReasoning: null,
			}}
			messageIdx={streamingChatIdx}
			isCommitted={false}
			chatIsRunning={isRunning}

			threadId={threadId}
			_scrollToBottom={null}
		/> : null


	// Determine which tool to show UI for
	// Priority: 1) toolCallsSoFar (streaming), 2) toolInfo (executing), 3) XML generating
	const activeToolName = toolCallsSoFar?.[0]?.name || currThreadStreamState?.toolInfo?.toolName;
	const activeToolParams = toolCallsSoFar?.[0]?.rawParams || currThreadStreamState?.toolInfo?.rawParams;

	// Helper to check if tool should show EditToolSoFar component (streaming UI)
	// Only show for tools that modify files - NOT for read/search tools
	const isFileRelatedTool = (name: string | undefined) => {
		return name === 'edit_file' ||
			name === 'rewrite_file' ||
			name === 'create_file_or_folder' ||
			name === 'delete_file_or_folder';
	};

	// Quick tools that should NOT show any loading UI - just wait for completed result
	const isQuickTool = (name: string | undefined) => {
		return false;
		/*
		return name === 'read_file' ||
			name === 'outline_file' ||
			name === 'ls_dir' ||
			name === 'get_dir_tree' ||
			name === 'search_pathnames_only' ||
			name === 'search_for_files' ||
			name === 'search_in_file' ||
			name === 'read_lint_errors';
		*/
	};

	// ReAct Phase Indicator - show when we have a detected ReAct phase
	const reactPhaseIndicator = (isReActThoughtPhase || isReActActionPhase || isReActObservationPhase) ? (
		<ReActPhaseIndicator
			phase={isReActThoughtPhase ? 'thought' : isReActActionPhase ? 'action' : 'observation'}
			phaseContent={reactPhase?.content}
		/>
	) : null;

	// Check if last message is already a tool message (to avoid showing duplicate)
	const lastMessage = previousMessages[previousMessages.length - 1];
	const lastMessageIsTool = lastMessage?.role === 'tool';

	// Show tool UI using the SAME logic as the status indicator (which works correctly)
	// This matches the threadStatus logic at lines 3755-3761
	// BUT skip quick tools (read/search) - they don't need loading UI
	const shouldShowToolUI = (
		// Tool is executing (isRunning === 'tool')
		isRunning === 'tool' ||
		// Tool is being generated (native OR XML) - same as isAnyToolGenerating in status indicator
		isAnyToolActivity ||
		// ReAct action phase
		isReActActionPhase
	) && !lastMessageIsTool && !isQuickTool(activeToolName);

	const generatingTool = shouldShowToolUI && (toolCallsToRender.length > 0 || isReActActionPhase) ? (
		<div className="flex flex-col gap-2">
			{(toolCallsToRender.length > 0 ? toolCallsToRender : (isReActActionPhase ? [{ name: 'detecting...', rawParams: {}, doneParams: [], id: 'detecting', isDone: false } as any] : [])).map((tc, idx) => {
				const tcName = tc.name;
				const tcParams = tc.rawParams;
				
				return (
					<Fragment key={tc.id || idx}>
						{/* Show EditToolSoFar for file-modifying tools */}
						{isFileRelatedTool(tcName) ? (
							<EditToolSoFar
								key={tc.id || `streaming-${idx}`}
								toolCallSoFar={tc}
							/>
						) : (
							<ProseWrapper key={tc.id || `loading-${idx}`}>
								<ToolLoadingIndicator
									toolName={tcName}
									toolParams={tcParams}
								/>
							</ProseWrapper>
						)}
					</Fragment>
				);
			})}
		</div>
	) : isGeneratingXMLToolCall ? (
		// Show generic loading indicator for XML tool calls before parsing completes
		<ProseWrapper>
			<div className="flex items-center gap-2 py-2 text-void-fg-3">
				<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
				<span className="text-sm">Parsing tool call...</span>
			</div>
		</ProseWrapper>
	) : null

	// Task Plan View - Cursor-style task management
	const taskPlanView = tasks.length > 0 ? (
		<TaskPlanView
			threadId={threadId}
			tasks={tasks}
			onCreateTask={handleCreateTask}
			onUpdateTaskStatus={handleUpdateTaskStatus}
			onDeleteTask={handleDeleteTask}
			onClearPlan={handleClearPlan}
		/>
	) : null

	const messagesHTML = <ScrollToBottomContainer
		key={'messages' + chatThreadsState.currentThreadId} // force rerender on all children if id changes
		scrollContainerRef={scrollContainerRef}
		className={`
			flex flex-col
			px-4 py-6 space-y-8
			w-full h-full
			overflow-x-hidden
			overflow-y-auto
			${previousMessagesHTML.length === 0 && !displayContentSoFar ? 'hidden' : ''}
		`}
	>
		{/* previous messages */}
		{previousMessagesHTML}
		{currStreamingMessageHTML}

		{/* ReAct Phase Indicator - show when we have a detected ReAct phase */}
		{reactPhaseIndicator}

		{/* Inline Task Plan View - rendered within chat stream */}
		{taskPlanView}

		{/* Generating tool */}
		{generatingTool}

		{/* loading indicator - show when LLM is running and NOT generating a tool */}
		{(isRunning === 'LLM' || isRunning === 'idle') && !isAnyToolActivity ? <ProseWrapper>
			<TypingIndicator />
		</ProseWrapper> : null}

		{/* Continue button - show when completely idle (not LLM, not tool, not generating) */}
		{(() => {
			// Find the last non-checkpoint message
			const lastNonCheckpointMessage = currentThread?.messages?.slice().reverse().find(msg => msg.role !== 'checkpoint');
			const shouldShow = !isRunning && !toolIsGenerating && currentThread?.messages && currentThread.messages.length > 0 && lastNonCheckpointMessage?.role === 'assistant';
			// Calculate response length for auto-continue threshold
			const lastResponseLength = lastNonCheckpointMessage?.role === 'assistant'
				? (lastNonCheckpointMessage.displayContent?.trim().length || 0)
				: 0;
			return shouldShow ? (
				<ProseWrapper>
					<div className="flex justify-end">
						<ContinueButton
							threadId={threadId}
							onContinue={() => onSubmit('continue')}
							lastResponseLength={lastResponseLength}
							autoContinueEnabled={autoContinueEnabled}
							onToggleAutoContinue={handleAutoContinueToggle}
						/>
					</div>
				</ProseWrapper>
			) : null;
		})()}

		{/* error message */}
		{latestError === undefined ? null :
			<div className='px-2 my-1'>
				<ErrorDisplay
					message={latestError.message}
					fullError={latestError.fullError}
					onDismiss={() => { chatThreadsService.dismissStreamError(currentThread.id) }}
					showDismiss={true}
				/>

				<WarningBox className='text-sm my-2 mx-4' onClick={() => { commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID) }} text='Open settings' />
			</div>
		}
	</ScrollToBottomContainer>


	const onChangeText = useCallback((newStr: string) => {
		setInstructionsAreEmpty(!newStr)
	}, [setInstructionsAreEmpty])

	// Track last Enter press for double-tap detection
	const lastEnterPressRef = useRef<number>(0);
	const DOUBLE_TAP_THRESHOLD = 500; // ms

	const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			const now = Date.now();
			const timeSinceLastEnter = now - lastEnterPressRef.current;

			// Double-tap Enter: Force send and abort current operation
			if (timeSinceLastEnter < DOUBLE_TAP_THRESHOLD && isRunning) {
				console.log('[SidebarChat] Double-tap Enter detected - forcing send and aborting current operation');
				e.preventDefault();
				lastEnterPressRef.current = 0; // Reset

				// Abort current operation first
				onAbort().then(() => {
					// Small delay to ensure abort completes
					setTimeout(() => {
						onSubmit();
					}, 100);
				});
			} else {
				// Single Enter: Normal submit (or queue if running)
				lastEnterPressRef.current = now;
				onSubmit();
			}
		} else if (e.key === 'Escape' && isRunning) {
			onAbort();
		}
	}, [onSubmit, onAbort, isRunning])

	// Drag & drop handlers
	const handleDragOver = useCallback((e: React.DragEvent) => {
		if (!settingsState.globalSettings.enableVisionSupport) return;
		e.preventDefault();
		e.stopPropagation();
		setIsDraggingOver(true);
	}, [settingsState.globalSettings.enableVisionSupport]);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDraggingOver(false);
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDraggingOver(false);

		if (!settingsState.globalSettings.enableVisionSupport) return;

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			await handleImageFiles(files);
		}
	}, [settingsState.globalSettings.enableVisionSupport, handleImageFiles]);

	// Paste handler
	const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
		if (!settingsState.globalSettings.enableVisionSupport) return;

		const items = e.clipboardData.items;
		const imageItems: File[] = [];

		for (let i = 0; i < items.length; i++) {
			if (items[i].type.indexOf('image') !== -1) {
				const file = items[i].getAsFile();
				if (file) imageItems.push(file);
			}
		}

		if (imageItems.length > 0) {
			e.preventDefault();
			await handleImageFiles(imageItems);
		}
	}, [settingsState.globalSettings.enableVisionSupport, handleImageFiles]);

	// Remove image handler
	const removeImage = useCallback((index: number) => {
		setAttachedImages(prev => prev.filter((_, i) => i !== index));
	}, []);

	// Get queued message count (recalculate on every render to stay reactive)
	const queuedCount = useMemo(() => {
		return chatThreadsService.getQueuedMessagesCount(threadId);
	}, [chatThreadsService, threadId, chatThreadsState]); // Re-calculate when thread state changes

	const queuedMessages = useMemo(() => {
		return chatThreadsService.getQueuedMessages(threadId);
	}, [chatThreadsService, threadId, chatThreadsState]);

	const [isQueueExpanded, setIsQueueExpanded] = useState(false);

	const inputChatArea = <div
		onDragOver={handleDragOver}
		onDragLeave={handleDragLeave}
		onDrop={handleDrop}
		onPaste={handlePaste}
		className={isDraggingOver ? 'ring-2 ring-void-accent rounded-md' : ''}
	>
		{/* Queue indicator */}
		{queuedCount > 0 && (
			<div className="mb-3 border border-void-border-2 rounded-xl overflow-hidden shadow-sm">
				{/* Header - always visible */}
				<div
					className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-void-bg-2-hover transition-all duration-200"
					onClick={() => setIsQueueExpanded(!isQueueExpanded)}
				>
					<div className="flex items-center gap-3">
						{isQueueExpanded ? <ChevronDown size={16} className="text-void-fg-3" /> : <ChevronRight size={16} className="text-void-fg-3" />}
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold text-void-fg-1">Queued Messages</span>
							<span className="px-2 py-0.5 text-xs font-medium bg-void-accent/20 text-void-accent rounded-full">
								{queuedCount}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-xs text-void-fg-4 font-medium">
							Press Enter to send
						</span>
						<button
							onClick={(e) => {
								e.stopPropagation();
								chatThreadsService.clearMessageQueue(threadId);
							}}
							className="px-3 py-1.5 text-xs font-medium text-void-fg-3 hover:text-void-fg-1 bg-void-bg-3 hover:bg-void-bg-4 border border-void-border-2 rounded-lg transition-colors duration-200"
							data-tooltip-id='void-tooltip'
							data-tooltip-content='Cancel all queued messages'
							data-tooltip-place='top'
						>
							Clear All
						</button>
					</div>
				</div>

				{/* Expanded queue list */}
				{isQueueExpanded && (
					<div className="border-t border-void-border-2 max-h-80 overflow-y-auto">
						{queuedMessages.map((msg, index) => (
							<div
								key={index}
								className="group relative px-4 py-3 border-b border-void-border-1 last:border-b-0 hover:bg-void-bg-2 transition-all duration-200 cursor-pointer"
								onClick={() => {
									// Load message into input box for editing
									if (textAreaFnsRef.current) {
										textAreaFnsRef.current.setValue(msg.userMessage);
									}
									// Remove from queue
									chatThreadsService.removeQueuedMessage(threadId, index);
									// Focus the input
									textAreaRef.current?.focus();
								}}
							>
								<div className="pr-20 text-sm text-void-fg-2 leading-relaxed line-clamp-2">
									{msg.userMessage}
								</div>
								{/* Quick actions - show on hover */}
								<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
									<button
										onClick={(e) => {
											e.stopPropagation();
											chatThreadsService.forceSendQueuedMessage(threadId, index);
										}}
										className="p-2 text-void-fg-3 hover:text-void-accent hover:bg-void-bg-3 border border-void-border-2 rounded-lg transition-all duration-200"
										data-tooltip-id='void-tooltip'
										data-tooltip-content='Force send (stops AI and sends this message)'
										data-tooltip-place='left'
									>
										<Send size={14} />
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation();
											chatThreadsService.removeQueuedMessage(threadId, index);
										}}
										className="p-2 text-void-fg-3 hover:text-red-400 hover:bg-red-500/10 border border-void-border-2 rounded-lg transition-all duration-200"
										data-tooltip-id='void-tooltip'
										data-tooltip-content='Remove from queue'
										data-tooltip-place='left'
									>
										<Trash2 size={14} />
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		)}

		<VoidChatArea
			featureName='Chat'
			onSubmit={() => onSubmit()}
			onAbort={onAbort}
			isStreaming={!!isRunning}
			isDisabled={isDisabled}
			showSelections={true}
			// showProspectiveSelections={previousMessagesHTML.length === 0}
			selections={selections}
			setSelections={setSelections}
			tokenUsage={currThreadStreamState?.tokenUsage}
			onClickAnywhere={() => { textAreaRef.current?.focus() }}
		>
			{/* Image Preview */}
			{settingsState.globalSettings.enableVisionSupport && attachedImages.length > 0 && (
				<ImagePreview images={attachedImages} onRemove={removeImage} />
			)}

			<VoidInputBox2
				enableAtToMention
				className={`min-h-[81px] px-3 py-2 border-0 focus:ring-0 w-full`}
				placeholder={queuedCount > 0 ? `Enter to send queued message (⏎)` : `@ to mention, ${keybindingString ? `${keybindingString} to add a selection. ` : ''}Enter instructions...`}
				onChangeText={onChangeText}
				onKeyDown={onKeyDown}
				onFocus={() => { chatThreadsService.setCurrentlyFocusedMessageIdx(undefined) }}
				ref={textAreaRef}
				fnsRef={textAreaFnsRef}
				multiline={true}
			/>

		</VoidChatArea>
	</div>


	const isLandingPage = previousMessages.length === 0


	const initiallySuggestedPromptsHTML = <div className='flex flex-col gap-2 w-full text-nowrap text-void-fg-3 select-none'>
		{[
			'Summarize my codebase',
			'How do types work in Rust?',
			'Create a .a-coder-rules file for me'
		].map((text, index) => (
			<div
				key={index}
				className='py-1 px-2 rounded text-sm bg-zinc-700/5 hover:bg-zinc-700/10 dark:bg-zinc-300/5 dark:hover:bg-zinc-300/10 cursor-pointer opacity-80 hover:opacity-100'
				onClick={() => onSubmit(text)}
			>
				{text}
			</div>
		))}
	</div>



	// "I'm stuck" button handler for student mode
	const handleImStuck = useCallback(() => {
		onSubmit("I'm stuck and need a hint. Can you help me with the current exercise?")
	}, [onSubmit])

	const threadPageInput = <div key={'input' + chatThreadsState.currentThreadId} className="space-y-3">
		<div className='px-4'>
			<CommandBarInChat />
		</div>
		{/* Student mode quick actions */}
		{settingsState.globalSettings.chatMode === 'learn' && previousMessages.length > 0 && !isRunning && (
			<div className='px-4 flex gap-2'>
				<button
					onClick={handleImStuck}
					className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
				>
					<span>🤔</span>
					<span>I'm stuck</span>
				</button>
			</div>
		)}
		<div className='px-0 pb-4'>
			{inputChatArea}
		</div>
	</div>

	const landingPageInput = <div className="px-0 pb-4">
		{inputChatArea}
	</div>

	const currentChatMode = settingsState.globalSettings.chatMode
	const chatModeName = nameOfChatMode[currentChatMode]
	const studentLevel = settingsState.globalSettings.studentLevel

	// Different taglines for different modes
	const modeTaglines: Record<ChatMode, React.ReactNode> = {
		'chat': <>Engage in pure conversation. Ask questions,<br />explore ideas, and get high-level advice.</>,
		'plan': <>Research your codebase. Create detailed<br />implementation plans for review.</>,
		'code': <>Kick off a new project. Make changes<br />across your entire codebase.</>,
		'learn': <>Ask questions, learn concepts, and practice<br />coding with your personal tutor.</>
	}

	const landingPageContent = <div
		ref={sidebarRef}
		className='w-full h-full max-h-full flex flex-col overflow-hidden'
	>
		{/* Centered empty state */}
		<div className='flex-1 flex flex-col items-center justify-center px-8 pb-8'>
			<ErrorBoundary>
				{/* Logo - different for student mode */}
				{currentChatMode === 'learn' ? (
					<div className='text-6xl mb-6'>🎓</div>
				) : (
					<div className='@@void-void-icon mb-8' style={{ width: '96px', height: '96px', opacity: 0.9 }} />
				)}

				{/* Title with mode */}
				<div className="text-center space-y-3">
					<h1 className='text-void-fg-1 text-3xl font-bold mb-2'>
						{currentChatMode === 'learn' ? 'A-Coder Tutor' : 'A-Coder'}
					</h1>
					<div className="flex items-center justify-center gap-2">
						<span className={`px-3 py-1 text-sm font-medium rounded-full ${
							currentChatMode === 'learn'
								? 'bg-purple-500/20 text-purple-400'
								: 'bg-void-accent/20 text-void-accent'
						}`}>
							{chatModeName}
						</span>
						{currentChatMode === 'learn' && (
							<span className="px-3 py-1 text-sm font-medium bg-void-bg-2 text-void-fg-3 rounded-full">
								{nameOfStudentLevel[studentLevel]}
							</span>
						)}
					</div>
				</div>

				{/* Tagline */}
				<p className='text-void-fg-3 text-base text-center mt-6 leading-relaxed max-w-md'>
					{modeTaglines[currentChatMode]}
				</p>

				{/* Student mode quick tips */}
				{currentChatMode === 'learn' && (
					<div className="mt-6 p-4 bg-void-bg-2 rounded-xl max-w-sm text-sm">
						<div className="font-medium text-void-fg-2 mb-2">💡 Try asking:</div>
						<ul className="text-void-fg-3 space-y-1">
							<li>"What is a function?"</li>
							<li>"Explain this code to me"</li>
							<li>"Give me a practice exercise"</li>
							<li>"Help me build a todo app"</li>
						</ul>
					</div>
				)}
			</ErrorBoundary>
		</div>

		{/* Recent activity at bottom */}
		<div className='flex-shrink-0 overflow-y-auto px-8 pb-6'>
			{Object.keys(chatThreadsState.allThreads).length > 1 ? // show if there are threads
				<ErrorBoundary>
					<div className="space-y-2">
						<div className="text-xs font-medium text-void-fg-4 uppercase tracking-wide mb-3">
							Recent Conversations
						</div>
						<PastThreadsList />
					</div>
				</ErrorBoundary>
				: null
			}
		</div>

		{/* Input at bottom */}
		<ErrorBoundary>
			<div className='flex-shrink-0 border-t border-void-border-1'>
				{landingPageInput}
			</div>
		</ErrorBoundary>
	</div>


	// Get student session for progress display
	const studentSession = chatThreadsService.getStudentSession(threadId)
	const activeExerciseCount = studentSession ? Object.values(studentSession.activeExercises).filter(e => e.status === 'active').length : 0
	const completedExerciseCount = studentSession?.completedExerciseCount ?? 0

	const threadPageContent = <div
		ref={sidebarRef}
		className='w-full h-full flex flex-col overflow-hidden'
	>
		{/* Top toolbar */}
		{currentChatMode === 'learn' && (completedExerciseCount > 0 || activeExerciseCount > 0) && (
			<ErrorBoundary>
				<div className='flex-shrink-0 px-4 py-2 flex justify-between items-center border-b border-void-border-1'>
					{/* Student mode progress indicator */}
					<div className='flex items-center gap-3 text-xs'>
						<div className='flex items-center gap-1.5 text-purple-400'>
							<span>🎯</span>
							<span>{activeExerciseCount} active</span>
						</div>
						<div className='flex items-center gap-1.5 text-green-400'>
							<span>✅</span>
							<span>{completedExerciseCount} completed</span>
						</div>
					</div>
					<div className='flex gap-2 items-center'>
						{/* Quiz Me Button */}
						<button
							onClick={() => setShowQuizMe(true)}
							className='flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 text-purple-400 hover:text-purple-300 rounded-lg text-xs font-medium transition-colors border border-purple-500/30'
							title='Review concepts with spaced repetition'
						>
							<Brain size={14} />
							<span>Quiz Me</span>
						</button>
						{/* Learning Dashboard Button */}
						<button
							onClick={() => setShowLearningDashboard(true)}
							className='flex items-center gap-1.5 px-3 py-1.5 bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 hover:text-void-fg-1 rounded-lg text-xs font-medium transition-colors border border-void-border-2'
							title='View your learning progress'
						>
							<Trophy size={14} />
							<span>My Progress</span>
						</button>
						{/* Buttons moved to CommandBarInChat */}
					</div>
				</div>
			</ErrorBoundary>
		)}
		<ErrorBoundary>
			<div className='flex-1 overflow-hidden relative'>
				{/* Checkpoint Timeline on the left */}
				<CheckpointTimeline
					threadId={threadId}
					messages={previousMessages}
					scrollContainerRef={scrollContainerRef}
					currCheckpointIdx={currCheckpointIdx}
				/>
				{messagesHTML}
			</div>
		</ErrorBoundary>
		<ErrorBoundary>
			<div className='flex-shrink-0 border-t border-void-border-1'>
				{threadPageInput}
			</div>
		</ErrorBoundary>
	</div>


	return (
		<Fragment key={threadId} // force rerender when change thread
		>
			{isLandingPage ?
				landingPageContent
				: threadPageContent}

			{/* MCP Server Modal */}
			<MCPServerModal
				isOpen={isMCPModalOpen}
				onClose={() => setIsMCPModalOpen(false)}
			/>

			{/* Learning Dashboard Modal */}
			{showLearningDashboard && threadId && (
				<LearningDashboard
					threadId={threadId}
					onClose={() => setShowLearningDashboard(false)}
				/>
			)}

			{/* Quiz Me Modal */}
			{showQuizMe && threadId && (
				<QuizMe
					threadId={threadId}
					onClose={() => setShowQuizMe(false)}
					onSelectTopic={(topic: string) => {
						setInstructionsAreEmpty(false);
						setInputValue(topic);
						textAreaRef.current?.focus();
					}}
				/>
			)}
		</Fragment>
	)
}
