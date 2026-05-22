/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Wand2, Eraser, FileText, Lightbulb, Repeat } from 'lucide-react';

export interface SlashCommand {
	id: string;
	label: string;
	description: string;
	icon: React.ReactNode;
}

const SLASH_COMMANDS: SlashCommand[] = [
	{ id: 'search', label: 'search', description: 'Search codebase for symbols, files, or definitions', icon: <Search size={14} /> },
	{ id: 'summarize', label: 'summarize', description: 'Summarize current thread or selected code', icon: <FileText size={14} /> },
	{ id: 'fix', label: 'fix', description: 'Fix lint errors or obvious bugs in selected code', icon: <Wand2 size={14} /> },
	{ id: 'clear', label: 'clear', description: 'Clear the current chat thread', icon: <Eraser size={14} /> },
	{ id: 'continue', label: 'continue', description: 'Continue the assistant response', icon: <Repeat size={14} /> },
	{ id: 'explain', label: 'explain', description: 'Explain the current selection or code', icon: <Lightbulb size={14} /> },
];

interface SlashCommandMenuProps {
	query: string;
	isOpen: boolean;
	onSelect: (command: SlashCommand) => void;
	onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({ query, isOpen, onSelect, onClose, inputRef }) => {
	const [selectedIdx, setSelectedIdx] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

	const filtered = SLASH_COMMANDS.filter(cmd =>
		cmd.label.toLowerCase().startsWith(query.toLowerCase()) ||
		cmd.description.toLowerCase().includes(query.toLowerCase())
	);

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIdx(0);
	}, [query]);

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				setSelectedIdx(prev => Math.max(prev - 1, 0));
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (filtered[selectedIdx]) {
					onSelect(filtered[selectedIdx]);
				}
			} else if (e.key === 'Escape') {
				onClose();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, filtered, selectedIdx, onSelect, onClose]);

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return;
		const handleClick = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [isOpen, onClose]);

	// Scroll selected into view
	useEffect(() => {
		const el = itemRefs.current[selectedIdx];
		if (el && containerRef.current) {
			el.scrollIntoView({ block: 'nearest' });
		}
	}, [selectedIdx]);

	if (!isOpen || filtered.length === 0) return null;

	return (
		<div
			ref={containerRef}
			className="absolute bottom-full left-0 mb-2 w-full bg-void-bg-1 border border-void-border-2 rounded-xl shadow-lg flex flex-col overflow-hidden z-[100]"
			style={{ maxHeight: '280px' }}
		>
			<div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-void-fg-3 bg-void-bg-2 border-b border-void-border-2 select-none">
				Slash Commands
			</div>
			<div className="overflow-y-auto py-1">
				{filtered.map((cmd, i) => (
					<div
						key={cmd.id}
						ref={el => { itemRefs.current[i] = el; }}
						className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors duration-150 ${
							i === selectedIdx
								? 'bg-void-accent/10 text-void-accent'
								: 'text-void-fg-2 hover:bg-void-bg-2 hover:text-void-fg-1'
						}`}
						onClick={() => onSelect(cmd)}
						onMouseEnter={() => setSelectedIdx(i)}
					>
						<div className={`p-1 rounded-md ${i === selectedIdx ? 'bg-void-accent/20' : 'bg-void-bg-3'}`}>
							<span className={i === selectedIdx ? 'text-void-accent' : 'text-void-fg-3'}>{cmd.icon}</span>
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-sm font-medium truncate">/{cmd.label}</span>
							<span className="text-[11px] text-void-fg-4 truncate">{cmd.description}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default SlashCommandMenu;
