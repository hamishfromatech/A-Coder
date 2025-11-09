/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useRef } from 'react';

/**
 * Fade-in animation for messages
 */
export const FadeIn = ({ children, delay = 0, duration = 300 }: { children: React.ReactNode, delay?: number, duration?: number }) => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return (
		<div
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
				transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
			}}
		>
			{children}
		</div>
	);
};

/**
 * Slide-in from left animation (for user messages)
 */
export const SlideInLeft = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return (
		<div
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? 'translateX(0)' : 'translateX(-12px)',
				transition: 'opacity 250ms ease-out, transform 250ms ease-out',
			}}
		>
			{children}
		</div>
	);
};

/**
 * Slide-in from right animation (for assistant messages)
 */
export const SlideInRight = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return (
		<div
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? 'translateX(0)' : 'translateX(12px)',
				transition: 'opacity 250ms ease-out, transform 250ms ease-out',
			}}
		>
			{children}
		</div>
	);
};

/**
 * Typing indicator with smooth wave animation (for LLM response)
 */
export const TypingIndicator = () => {
	// Generate unique ID for this instance to avoid keyframe conflicts
	const animId = useRef(`wave-${Math.random().toString(36).substr(2, 9)}`).current;
	
	return (
		<>
			<style>{`
				@keyframes ${animId} {
					0%, 60%, 100% {
						transform: scale(1);
						opacity: 0.6;
					}
					30% {
						transform: scale(1.3);
						opacity: 1;
					}
				}
			`}</style>
			<div className="flex items-center gap-1 py-2">
				<div className="flex gap-1.5">
					<div 
						className="w-2 h-2 rounded-full"
						style={{ 
							backgroundColor: 'var(--vscode-void-accent, #007acc)',
							animation: `${animId} 1.4s ease-in-out infinite`,
							animationDelay: '0s'
						}} 
					/>
					<div 
						className="w-2 h-2 rounded-full"
						style={{ 
							backgroundColor: 'var(--vscode-void-accent, #007acc)',
							animation: `${animId} 1.4s ease-in-out infinite`,
							animationDelay: '0.2s'
						}} 
					/>
					<div 
						className="w-2 h-2 rounded-full"
						style={{ 
							backgroundColor: 'var(--vscode-void-accent, #007acc)',
							animation: `${animId} 1.4s ease-in-out infinite`,
							animationDelay: '0.4s'
						}} 
					/>
				</div>
			</div>
		</>
	);
};

/**
 * Tool loading indicator with spinner and collapsible details
 */
export const ToolLoadingIndicator = ({ toolName, toolParams }: { toolName?: string, toolParams?: any }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	
	// Extract file info for file-related tools
	const getFileInfo = () => {
		if (!toolParams) return null;
		
		if (toolName === 'edit_file' || toolName === 'rewrite_file') {
			const uri = toolParams.uri?.fsPath || toolParams.uri;
			if (uri) {
				const fileName = uri.split('/').pop() || uri;
				
				// Calculate diff stats for edit_file
				let diffStats = null;
				if (toolName === 'edit_file' && toolParams.searchReplaceBlocks) {
					let addedLines = 0;
					let removedLines = 0;
					const blocks = toolParams.searchReplaceBlocks.split('<<<<<<< ORIGINAL').slice(1);
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
	
	return (
		<div className="flex flex-col gap-1 py-2">
			<div className="flex items-center gap-2">
				{/* File name with diff stats for edit_file */}
				{fileInfo && fileInfo.fileName ? (
					<div className="flex items-center gap-1.5">
						<span className="text-void-fg-3 text-sm">{fileInfo.fileName}</span>
						{fileInfo.diffStats && (
							<span className='flex items-center gap-1 text-xs'>
								{fileInfo.diffStats.addedLines > 0 && (
									<span className='text-green-500'>+{fileInfo.diffStats.addedLines}</span>
								)}
								{fileInfo.diffStats.removedLines > 0 && (
									<span className='text-red-500'>-{fileInfo.diffStats.removedLines}</span>
								)}
							</span>
						)}
					</div>
				) : toolName ? (
					<span className="text-void-fg-3 text-sm">
						{toolName.replace(/_/g, ' ')}
					</span>
				) : null}
				{/* Single spinning circle */}
				<div 
					className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full"
					style={{ 
						animation: 'spin 0.8s linear infinite'
					}} 
				/>
				{/* Collapsible icon for file details */}
				{hasDetails && (
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className="text-void-fg-4 hover:text-void-fg-2 transition-colors ml-1"
						aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 12 12"
							fill="none"
							style={{
								transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
								transition: 'transform 200ms ease-in-out'
							}}
						>
							<path
								d="M3 4.5L6 7.5L9 4.5"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
				)}
			</div>
			
			{/* Collapsible file details */}
			{hasDetails && isExpanded && fileInfo && (
				<div className="text-xs text-void-fg-4 pl-5 py-1 font-mono">
					<div className="flex items-center gap-1">
						<span className="text-void-fg-3">{fileInfo.fileName}</span>
						{fileInfo.extra && <span>{fileInfo.extra}</span>}
					</div>
					<div className="text-void-fg-5 truncate" title={fileInfo.path}>
						{fileInfo.path}
					</div>
				</div>
			)}
		</div>
	);
};

/**
 * Expand/collapse animation for tool calls
 */
export const ExpandCollapse = ({ isExpanded, children }: { isExpanded: boolean, children: React.ReactNode }) => {
	const contentRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | undefined>(isExpanded ? undefined : 0);

	useEffect(() => {
		if (contentRef.current) {
			const contentHeight = contentRef.current.scrollHeight;
			setHeight(isExpanded ? contentHeight : 0);
		}
	}, [isExpanded]);

	return (
		<div
			style={{
				height: height,
				overflow: 'hidden',
				transition: 'height 200ms ease-in-out',
			}}
		>
			<div ref={contentRef}>
				{children}
			</div>
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
				className="absolute inset-0 -translate-x-full animate-shimmer"
				style={{
					background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
					animation: 'shimmer 2s infinite',
				}}
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
