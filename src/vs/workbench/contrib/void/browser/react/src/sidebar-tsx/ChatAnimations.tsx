/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useRef } from 'react';
import { Brain, Eye, Loader2, File, Pencil, Database, Check, ChevronDown, Folder } from 'lucide-react';

/**
 * Fade-in animation for messages - DISABLED for better UX
 */
export const FadeIn = ({ children }: { children: React.ReactNode, delay?: number, duration?: number }) => {
	return <>{children}</>;
};

/**
 * Slide-in from left animation (for user messages) - DISABLED for better UX
 */
export const SlideInLeft = ({ children }: { children: React.ReactNode, delay?: number }) => {
	return <>{children}</>;
};

/**
 * Slide-in from right animation (for assistant messages) - DISABLED for better UX
 */
export const SlideInRight = ({ children }: { children: React.ReactNode, delay?: number }) => {
	return <>{children}</>;
};

/**
 * Enhanced typing indicator with smooth cross-fade transitions and shimmer text
 * Optimized for better immersion and reduced jitter
 */
const MESSAGES_BY_STATE: Record<'thinking' | 'processing' | 'generating', string[]> = {
	thinking: [
		'A-Coder is thinking',
		'A-Coder is planning the next steps',
		'A-Coder is looking over your code',
	],
	processing: [
		'A-Coder is processing your request',
		'A-Coder is working out the best way to tackle this',
		'A-Coder is checking context and tools',
	],
	generating: [
		'A-Coder is drafting a response',
		'A-Coder is putting the pieces together',
		'A-Coder is writing your answer',
	],
};

export const TypingIndicator = ({
	state = 'thinking', // 'thinking' | 'processing' | 'generating'
}: {
	state?: 'thinking' | 'processing' | 'generating';
}) => {
	const allMessages = MESSAGES_BY_STATE[state] ?? MESSAGES_BY_STATE.thinking;
	const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * allMessages.length));
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [displayMessage, setDisplayMessage] = useState(allMessages[messageIndex]);
	const [isInitialShow, setIsInitialShow] = useState(true);

	// Advance message every few seconds with smooth cross-fade
	useEffect(() => {
		const interval = window.setInterval(() => {
			setIsInitialShow(false); // After first interval, it's no longer initial
			setIsTransitioning(true);
			setTimeout(() => {
				setMessageIndex(prev => (prev + 1) % allMessages.length);
				setIsTransitioning(false);
			}, 300); // Half of transition duration
		}, 8000); // Increased delay to 8s so it doesn't happen as frequently
		return () => window.clearInterval(interval);
	}, [allMessages.length]); // Only depend on length

	// Update display message when index or allMessages changes
	useEffect(() => {
		setDisplayMessage(allMessages[messageIndex]);
	}, [messageIndex, allMessages]);

	// Update display message when state changes
	useEffect(() => {
		setIsInitialShow(false);
		setIsTransitioning(true);
		setTimeout(() => {
			const newMessages = MESSAGES_BY_STATE[state] || MESSAGES_BY_STATE.thinking;
			const newIndex = Math.floor(Math.random() * newMessages.length);
			setMessageIndex(newIndex);
			setDisplayMessage(newMessages[newIndex]);
			setIsTransitioning(false);
		}, 300);
	}, [state]);

	return (
		<div className="py-2 h-8 flex items-center">
			<span
				className={`text-sm select-none text-shimmer animate-text-shimmer transition-all duration-500 ease-in-out ${isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'} ${isInitialShow ? 'transition-none' : ''}`}
			>
				{displayMessage}
			</span>
		</div>
	);
};

/**
 * ReAct phase indicator for showing Thought/Action/Observation phases
 * Optimized with debouncing and smooth transitions to prevent jitter
 */
export const ReActPhaseIndicator = ({
	phase,
	phaseContent
}: {
	phase?: 'thought' | 'action' | 'observation' | null;
	phaseContent?: string;
}) => {
	const [displayPhase, setDisplayPhase] = useState(phase);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const lastPhaseChange = useRef(Date.now());
	const MIN_PHASE_DURATION = 500; // ms

	useEffect(() => {
		if (phase === displayPhase) return;

		const now = Date.now();
		const timeSinceLastChange = now - lastPhaseChange.current;
		
		const updatePhase = () => {
			setIsTransitioning(true);
			setTimeout(() => {
				setDisplayPhase(phase);
				setIsTransitioning(false);
				lastPhaseChange.current = Date.now();
			}, 150); // Half of transition duration
		};

		if (timeSinceLastChange < MIN_PHASE_DURATION) {
			const timer = setTimeout(updatePhase, MIN_PHASE_DURATION - timeSinceLastChange);
			return () => clearTimeout(timer);
		} else {
			updatePhase();
		}
	}, [phase, displayPhase]);

	if (!displayPhase) return null;

	const phaseConfig = {
		thought: {
			icon: <Brain size={16} />,
			color: '#a855f7', // purple-500
			bgColor: 'rgba(168, 85, 247, 0.1)',
			text: 'Thinking',
			description: 'Reasoning about next steps'
		},
		action: {
			icon: null,
			color: '#0ea5e9', // blue-500
			bgColor: 'rgba(14, 165, 233, 0.1)',
			text: 'Taking Action',
			description: 'Executing tools'
		},
		observation: {
			icon: <Eye size={16} />,
			color: '#10b981', // emerald-500
			bgColor: 'rgba(16, 185, 129, 0.1)',
			text: 'Observing',
			description: 'Analyzing results'
		}
	};

	const config = phaseConfig[displayPhase];

	return (
		<div
			className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${isTransitioning ? 'opacity-50 blur-[1px]' : 'opacity-100 blur-0'}`}
			style={{
				borderColor: `${config.color}33`,
				backgroundColor: config.bgColor,
				transform: isTransitioning ? 'scale(0.98)' : 'scale(1)',
			}}
		>
			{/* Phase icon */}
			<div 
				className="p-2 rounded-lg flex items-center justify-center shadow-sm"
				style={{ backgroundColor: `${config.color}22`, color: config.color }}
			>
				{config.icon}
			</div>

			{/* Phase info */}
			<div className="flex-1 overflow-hidden">
				<div className="flex items-center gap-2">
					<span
						className="text-[11px] font-bold uppercase tracking-wider"
						style={{ color: config.color }}
					>
						{config.text}
					</span>
					{/* Thinking dots for thought phase */}
					{displayPhase === 'thought' && (
						<div className="flex gap-1">
							<div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: config.color, animationDelay: '0s' }} />
							<div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: config.color, animationDelay: '0.2s' }} />
							<div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: config.color, animationDelay: '0.4s' }} />
						</div>
					)}
					{/* Spinner for action phase */}
					{displayPhase === 'action' && (
						<Loader2 className="w-3 h-3 animate-spin" style={{ color: config.color }} />
					)}
				</div>

				{/* Phase description */}
				<div className="text-[10px] text-void-fg-3 font-medium mt-0.5 truncate opacity-80">
					{config.description}
				</div>

				{/* Phase content if available */}
				{phaseContent && (
					<div className="text-[10px] text-void-fg-2 mt-1 italic truncate font-medium bg-white/5 px-1.5 py-0.5 rounded" title={phaseContent}>
						{phaseContent}
					</div>
				)}
			</div>
		</div>
	);
};

/**
 * Enhanced tool loading indicator with progress states and smooth transitions
 */
export const ToolLoadingIndicator = ({
	toolName,
	toolParams,
	stage = 'executing', // 'preparing' | 'executing' | 'completing'
	progress = undefined // 0-1 for tools with progress
}: {
	toolName?: string,
	toolParams?: any,
	stage?: 'preparing' | 'executing' | 'completing',
	progress?: number
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [prevStage, setPrevStage] = useState(stage);

	// Smooth stage transitions
	useEffect(() => {
		if (prevStage !== stage) {
			const timer = setTimeout(() => setPrevStage(stage), 150);
			return () => clearTimeout(timer);
		}
	}, [stage, prevStage]);

	// Extract file info for file-related tools
	const getFileInfo = () => {
		if (!toolParams) return null;

		if (toolName === 'edit_file' || toolName === 'rewrite_file') {
			const uri = toolParams.uri?.fsPath || toolParams.uri;
			if (uri) {
				const fileName = uri.split('/').pop() || uri;

				// Calculate diff stats for edit_file
				let diffStats = null;
				if (toolName === 'edit_file' && toolParams.originalUpdatedBlocks) {
					let addedLines = 0;
					let removedLines = 0;
					const blocks = toolParams.originalUpdatedBlocks.split('<<<<<<< ORIGINAL').slice(1);
					blocks.forEach((block: string) => {
						const parts = block.split('=======');
						if (parts.length === 2) {
							const original = parts[0].trim();
							const updated = parts[1].split('>>>>>>> UPDATED')[0].trim();
							removedLines += original ? original.split('\n').length : 0;
							addedLines += updated ? updated.split('\n').length : 0;
						}
					});
					if (addedLines > 0 || removedLines > 0) {
						diffStats = { addedLines, removedLines };
					}
				}

				return { type: 'file', path: uri, fileName, diffStats };
			}
		}

		if (toolName === 'read_file') {
			const uri = toolParams.uri?.fsPath || toolParams.uri;
			if (uri) {
				const fileName = uri.split('/').pop() || uri;
				const lineInfo = toolParams.startLine || toolParams.endLine
					? ` (lines ${toolParams.startLine || 1}-${toolParams.endLine || '∞'})`
					: '';
				return { type: 'file', path: uri, fileName, extra: lineInfo };
			}
		}

		return null;
	};

	const fileInfo = getFileInfo();
	const hasDetails = fileInfo !== null;

	// Stage-based styling
	const stageConfig = {
		preparing: {
			color: '#f97316', // orange-500
			text: 'Preparing',
			icon: <Database size={12} />
		},
		executing: {
			color: '#0ea5e9', // blue-500
			text: 'Executing',
			icon: null
		},
		completing: {
			color: '#10b981', // emerald-500
			text: 'Finalizing',
			icon: <Check size={12} />
		}
	};

	const currentConfig = stageConfig[stage];
	const isTransitioning = prevStage !== stage;

	return (
		<div className={`flex flex-col gap-2 py-3 px-1 ${isTransitioning ? 'opacity-70 transition-all duration-150' : ''}`}>
			<div className="flex items-center justify-between bg-void-bg-2/30 border border-void-border-2 rounded-xl px-3 py-2 shadow-sm">
				<div className="flex items-center gap-2.5 min-w-0">
					{/* Icon for tool type */}
					<div className={`p-1.5 rounded-lg ${toolName?.includes('read') ? 'bg-void-bg-3' : 'bg-void-accent/10 text-void-accent'}`}>
						{toolName?.includes('read') || toolName?.includes('search') ? <File size={14} /> :
						 toolName?.includes('edit') || toolName?.includes('rewrite') ? <Pencil size={14} /> :
						 <Database size={14} />}
					</div>

					{/* File name or tool name */}
					<div className="flex flex-col min-w-0">
						{fileInfo && fileInfo.fileName ? (
							<div className="flex items-center gap-1.5 min-w-0">
								<span className="text-void-fg-1 text-xs font-bold truncate">{fileInfo.fileName}</span>
								{fileInfo.diffStats && (
									<span className='flex items-center gap-1 text-[10px] font-bold'>
										{fileInfo.diffStats.addedLines > 0 && <span className='text-emerald-500'>+{fileInfo.diffStats.addedLines}</span>}
										{fileInfo.diffStats.removedLines > 0 && <span className='text-rose-500'>-{fileInfo.diffStats.removedLines}</span>}
									</span>
								)}
							</div>
						) : (
							<span className="text-void-fg-1 text-xs font-bold truncate uppercase tracking-tight">
								{toolName === 'detecting...' ? 'Thinking...' : toolName?.replace(/_/g, ' ')}
							</span>
						)}
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ color: currentConfig.color }}>
								{currentConfig.text}
							</span>
							<Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: currentConfig.color }} />
						</div>
					</div>
				</div>

				{/* Collapsible/Progress section */}
				<div className="flex items-center gap-2">
					{progress !== undefined && (
						<div className="w-12 h-1 bg-void-bg-3 rounded-full overflow-hidden">
							<div 
								className="h-full transition-all duration-500 ease-out"
								style={{ width: `${progress * 100}%`, backgroundColor: currentConfig.color }}
							/>
						</div>
					)}
					{hasDetails && (
						<button
							onClick={() => setIsExpanded(!isExpanded)}
							className={`p-1 hover:bg-void-bg-3 rounded-md transition-all ${isExpanded ? 'text-void-accent bg-void-accent/5' : 'text-void-fg-4'}`}
						>
							<ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
						</button>
					)}
				</div>
			</div>

			{/* Enhanced collapsible file details */}
			<ExpandCollapse isExpanded={isExpanded}>
				{hasDetails && fileInfo && (
					<div className="mx-2 p-3 bg-void-bg-4/50 rounded-xl border border-void-border-2/50 animate-in fade-in zoom-in-95 duration-200">
						<div className="flex items-center gap-2 text-[10px] font-mono text-void-fg-3 truncate">
							<Folder size={10} className="opacity-50" />
							{fileInfo.path}
						</div>
						{fileInfo.extra && <div className="mt-1 text-[10px] font-bold text-void-accent opacity-80">{fileInfo.extra}</div>}
					</div>
				)}
			</ExpandCollapse>
		</div>
	);
};

/**
 * Expand/collapse animation for tool calls
 * Uses max-height for GPU-accelerated animation
 */
export const ExpandCollapse = ({ isExpanded, children }: { isExpanded: boolean, children: React.ReactNode }) => {
	return (
		<div
			style={{
				maxHeight: isExpanded ? '500px' : '0px',
				opacity: isExpanded ? 1 : 0,
				overflow: 'hidden',
				transition: 'max-height 200ms ease-out, opacity 150ms ease-out',
			}}
		>
			{children}
		</div>
	);
};

/**
 * Pulse animation for loading states
 */
export const Pulse = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="animate-pulse">
			{children}
		</div>
	);
};

/**
 * Shimmer effect for loading content
 */
export const Shimmer = ({ className = '' }: { className?: string }) => {
	return (
		<div className={`relative overflow-hidden bg-void-bg-2 rounded ${className}`}>
			<div
				className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
			/>
		</div>
	);
};

/**
 * Scale-in animation for buttons/actions
 */
export const ScaleIn = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return (
		<div
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? 'scale(1)' : 'scale(0.9)',
				transition: 'opacity 200ms ease-out, transform 200ms ease-out',
			}}
		>
			{children}
		</div>
	);
};

/**
 * Smooth state transition component for tool call states
 */
export const StateTransition = ({
	children,
	state,
	duration = 300
}: {
	children: React.ReactNode,
	state: string,
	duration?: number
}) => {
	const [currentState, setCurrentState] = useState(state);
	const [isTransitioning, setIsTransitioning] = useState(false);

	useEffect(() => {
		if (currentState !== state) {
			setIsTransitioning(true);
			const timer = setTimeout(() => {
				setCurrentState(state);
				setIsTransitioning(false);
			}, duration / 2);
			return () => clearTimeout(timer);
		}
	}, [state, currentState, duration]);

	return (
		<div
			style={{
				opacity: isTransitioning ? 0.7 : 1,
				transform: isTransitioning ? 'scale(0.98)' : 'scale(1)',
				transition: `opacity ${duration}ms ease-in-out, transform ${duration}ms ease-in-out`,
			}}
		>
			{children}
		</div>
	);
};

/**
 * Staggered animation for multiple items
 */
export const StaggeredAnimation = ({
	children,
	staggerDelay = 100,
	initialDelay = 0
}: {
	children: React.ReactNode[],
	staggerDelay?: number,
	initialDelay?: number
}) => {
	return (
		<>
			{React.Children.map(children, (child, index) => (
				<FadeIn
					key={index}
					delay={initialDelay + (index * staggerDelay)}
					duration={250}
				>
					{child}
				</FadeIn>
			))}
		</>
	);
};

/**
 * Pulse-once animation for attention grabbing
 */
export const PulseOnce = ({ children, trigger }: { children: React.ReactNode, trigger: boolean }) => {
	const [shouldPulse, setShouldPulse] = useState(false);

	useEffect(() => {
		if (trigger) {
			setShouldPulse(true);
			const timer = setTimeout(() => setShouldPulse(false), 600);
			return () => clearTimeout(timer);
		}
	}, [trigger]);

	return (
		<div
			style={{
				transform: shouldPulse ? 'scale(1.05)' : 'scale(1)',
				transition: 'transform 300ms ease-out',
			}}
		>
			{children}
		</div>
	);
};

/**
 * Smooth height animation for content changes
 * Uses max-height for better performance (no layout measurements)
 */
export const SmoothHeight = ({ children, isVisible, maxHeight = '1000px' }: { children: React.ReactNode, isVisible: boolean, maxHeight?: string }) => {
	return (
		<div
			style={{
				maxHeight: isVisible ? maxHeight : '0px',
				opacity: isVisible ? 1 : 0,
				overflow: 'hidden',
				transition: 'max-height 250ms ease-out, opacity 200ms ease-out',
			}}
		>
			{children}
		</div>
	);
};
