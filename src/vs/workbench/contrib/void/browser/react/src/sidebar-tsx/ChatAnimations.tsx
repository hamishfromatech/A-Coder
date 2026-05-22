/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useRef } from 'react';
import { Brain, Eye, Loader2, File, Pencil, Database, Check, ChevronDown, Folder } from 'lucide-react';

/**
 * Check if user prefers reduced motion
 */
const usePrefersReducedMotion = () => {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		setPrefersReducedMotion(mediaQuery.matches);

		const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
		mediaQuery.addEventListener('change', handler);
		return () => mediaQuery.removeEventListener('change', handler);
	}, []);

	return prefersReducedMotion;
};

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

/**
 * Typing indicator with smooth cross-fade shimmer text
 */
export const TypingIndicator = ({
	state = 'thinking',
}: {
	state?: 'thinking' | 'processing' | 'generating';
}) => {
	const allMessages = MESSAGES_BY_STATE[state] ?? MESSAGES_BY_STATE.thinking;
	const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * allMessages.length));
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [displayMessage, setDisplayMessage] = useState(allMessages[messageIndex]);
	const prefersReducedMotion = usePrefersReducedMotion();

	useEffect(() => {
		if (prefersReducedMotion) return;

		let transitionTimer: ReturnType<typeof setTimeout> | null = null;
		const interval = window.setInterval(() => {
			setIsTransitioning(true);
			transitionTimer = setTimeout(() => {
				setMessageIndex(prev => (prev + 1) % allMessages.length);
				setIsTransitioning(false);
			}, 300);
		}, 8000);
		return () => {
			window.clearInterval(interval);
			if (transitionTimer) clearTimeout(transitionTimer);
		};
	}, [allMessages.length, prefersReducedMotion]);

	useEffect(() => {
		setDisplayMessage(allMessages[messageIndex]);
	}, [messageIndex, allMessages]);

	useEffect(() => {
		if (prefersReducedMotion) {
			const newMessages = MESSAGES_BY_STATE[state] || MESSAGES_BY_STATE.thinking;
			const newIndex = Math.floor(Math.random() * newMessages.length);
			setMessageIndex(newIndex);
			setDisplayMessage(newMessages[newIndex]);
			setIsTransitioning(false);
			return;
		}

		setIsTransitioning(true);
		setTimeout(() => {
			const newMessages = MESSAGES_BY_STATE[state] || MESSAGES_BY_STATE.thinking;
			const newIndex = Math.floor(Math.random() * newMessages.length);
			setMessageIndex(newIndex);
			setDisplayMessage(newMessages[newIndex]);
			setIsTransitioning(false);
		}, 300);
	}, [state, prefersReducedMotion]);

	return (
		<div className="py-2 h-8 flex items-center">
			<span
				className={`text-sm select-none text-shimmer animate-text-shimmer transition-all duration-500 ease-in-out ${isTransitioning && !prefersReducedMotion ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}
			>
				{displayMessage}
			</span>
		</div>
	);
};

/**
 * ReAct phase indicator — icon-only by default, expands on hover
 */
const MIN_PHASE_DURATION = 500;

export const ReActPhaseIndicator = ({
	phase,
	phaseContent
}: {
	phase?: 'thought' | 'action' | 'observation' | null;
	phaseContent?: string;
}) => {
	const [displayPhase, setDisplayPhase] = useState(phase);
	const [isExpanding, setIsExpanding] = useState(false);
	const [tooltipVisible, setTooltipVisible] = useState(false);
	const [showContent, setShowContent] = useState(false);
	const lastPhaseChange = useRef(Date.now());
	const prefersReducedMotion = usePrefersReducedMotion();

	useEffect(() => {
		if (phase === displayPhase) return;

		const now = Date.now();
		const timeSinceLastChange = now - lastPhaseChange.current;

		const updatePhase = () => {
			if (prefersReducedMotion) {
				setDisplayPhase(phase);
				return;
			}
			// If transitioning *to* thought, expand content automatically
			if (phase === 'thought') {
				setIsExpanding(true);
				setShowContent(true);
			}
			setDisplayPhase(phase);
			lastPhaseChange.current = Date.now();
		};

		if (timeSinceLastChange < MIN_PHASE_DURATION) {
			const timer = setTimeout(updatePhase, MIN_PHASE_DURATION - timeSinceLastChange);
			return () => clearTimeout(timer);
		} else {
			updatePhase();
		}
	}, [phase, displayPhase, prefersReducedMotion]);

	if (!displayPhase) return null;

	const phaseConfig = {
		thought: {
			icon: <Brain size={14} />,
			label: 'Thinking',
			color: 'text-void-fg-3',
			bgColor: 'bg-void-bg-3',
		},
		action: {
			icon: <Loader2 size={14} className={prefersReducedMotion ? '' : 'animate-spin'} />,
			label: 'Acting',
			color: 'text-void-accent',
			bgColor: 'bg-void-accent/10',
		},
		observation: {
			icon: <Eye size={14} />,
			label: 'Observing',
			color: 'text-void-fg-3',
			bgColor: 'bg-void-bg-3',
		}
	};

	const config = phaseConfig[displayPhase];

	return (
		<div className="my-1">
			<div
			className={`inline-flex items-center gap-2 py-1.5 px-2.5 rounded-lg border border-void-border-2 ${config.bgColor} cursor-default select-none`}
			onMouseEnter={() => setTooltipVisible(true)}
		onMouseLeave={() => setTooltipVisible(false)}
			onClick={() => {
				if (displayPhase === 'thought') {
					setIsExpanding(!isExpanding);
					if (!isExpanding) setShowContent(true);
					else setTimeout(() => setShowContent(false), 200);
				}
			}}
			>
				<span className={`${config.color} flex items-center flex-shrink-0`}>
					{config.icon}
				</span>
				<span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
				{tooltipVisible && phaseContent && !isExpanding && (
					<div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-void-bg-1 border border-void-border-2 rounded-lg shadow-lg text-[10px] text-void-fg-3 max-w-[200px] whitespace-normal break-words pointer-events-none z-50">
						{phaseContent}
					</div>
				)}
			</div>
			<SmoothHeight isVisible={isExpanding && showContent}>
				<div className="mt-1.5 pl-3 border-l-2 border-void-border-2">
					<div className="text-[11px] text-void-fg-4 leading-relaxed whitespace-pre-wrap font-mono">
						{phaseContent}
					</div>
				</div>
			</SmoothHeight>
		</div>
	);
};

/**
 * Minimal tool loading indicator — single line with icon, name, and subtle spinner
 */
export const ToolLoadingIndicator = ({
	toolName,
	toolParams,
}: {
	toolName?: string,
	toolParams?: any,
	stage?: 'preparing' | 'executing' | 'completing',
	progress?: number
}) => {
	const prefersReducedMotion = usePrefersReducedMotion();

	// Extract file name for file-related tools
	const getFileName = () => {
		if (!toolParams) return null;
		if (toolName === 'edit_file' || toolName === 'rewrite_file' || toolName === 'read_file' || toolName === 'create_file_or_folder') {
			const uri = toolParams.uri?.fsPath || toolParams.uri;
			if (uri) return uri.split('/').pop() || uri;
		}
		return null;
	};

	const fileName = getFileName();
	const displayName = fileName || (toolName === 'detecting...' ? 'Thinking...' : toolName?.replace(/_/g, ' '));

	return (
		<div className="flex items-center gap-2 py-2 px-1">
			<span className="text-void-fg-4 flex items-center">
				{toolName?.includes('read') || toolName?.includes('search') ? <File size={14} /> :
				 toolName?.includes('edit') || toolName?.includes('rewrite') ? <Pencil size={14} /> :
				 <Database size={14} />}
			</span>
			<span className="text-xs text-void-fg-3 truncate">{displayName}</span>
			<Loader2 size={12} className={`text-void-fg-4 flex-shrink-0 ${prefersReducedMotion ? '' : 'animate-spin'}`} />
		</div>
	);
};

/**
 * Expand/collapse animation for tool calls
 * Uses max-height for GPU-accelerated animation
 * Respects prefers-reduced-motion for accessibility
 */
export const ExpandCollapse = ({ isExpanded, children }: { isExpanded: boolean, children: React.ReactNode }) => {
	const prefersReducedMotion = usePrefersReducedMotion();

	return (
		<div
			style={{
				maxHeight: isExpanded ? '500px' : '0px',
				opacity: isExpanded ? 1 : 0,
				overflow: 'hidden',
				transition: prefersReducedMotion ? 'none' : 'max-height 200ms ease-out, opacity 150ms ease-out',
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
