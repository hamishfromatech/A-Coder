/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef } from 'react';
import { Search, Wand2, Eraser, FileText, Lightbulb, Repeat, TerminalSquare, Target, Minimize2 } from 'lucide-react';
import { useAccessor, usePluginServiceState } from '../util/services.js';
import { BUILTIN_SLASH_COMMANDS } from '../../../../common/slashCommands.js';
import { SlashCommandDef } from '../../../../common/slashCommandTypes.js';

export interface SlashCommand {
	id: string;
	label: string;
	description: string;
	icon: React.ReactNode;
	/** What happens when the command is invoked. `client-clear` clears the thread;
	 *  `client-goal` installs/clears a session goal Stop hook (no LLM send);
	 *  `client-compact` compresses the conversation into a /compact snapshot (no LLM
	 *  send — the snapshot takes effect on the next turn);
	 *  `llm-prompt` expands `prompt`/`expand` and sends the result to the LLM. */
	action: 'client-clear' | 'client-goal' | 'client-compact' | 'llm-prompt';
	/** Prompt template for `llm-prompt` (plugin/personal commands). `$ARGUMENTS` is substituted. */
	prompt?: string;
	/** Custom expander for built-in commands. Takes precedence over `prompt`. */
	expand?: (args: string) => string;
	/** Where this command came from. */
	source?: string;
}

// Per-label icons for the built-in commands. Plugin/personal commands fall back to TerminalSquare.
const BUILTIN_ICONS: { [label: string]: React.ReactNode } = {
	search: <Search size={14} />,
	summarize: <FileText size={14} />,
	fix: <Wand2 size={14} />,
	clear: <Eraser size={14} />,
	continue: <Repeat size={14} />,
	explain: <Lightbulb size={14} />,
	goal: <Target size={14} />,
	compact: <Minimize2 size={14} />,
};

/** Build the React SlashCommand list for the 6 built-ins (from common/slashCommands.ts). */
const BUILTIN_COMMANDS: SlashCommand[] = BUILTIN_SLASH_COMMANDS.map(def => defToSlashCommand(def, 'builtin'));

/** Plugin/personal commands discovered on disk, kept in sync by `useSlashCommands`. */
let extraCommands: SlashCommand[] = [];

function defToSlashCommand(def: SlashCommandDef, source: string): SlashCommand {
	return {
		id: def.label,
		label: def.label,
		description: def.description,
		icon: BUILTIN_ICONS[def.label] ?? <TerminalSquare size={14} />,
		action: def.clientAction === 'client-clear' ? 'client-clear' : (def.clientAction === 'client-goal' || def.clientAction === 'client-goal-clear' ? 'client-goal' : (def.clientAction === 'client-compact' || def.clientAction === 'client-compact-clear' ? 'client-compact' : 'llm-prompt')),
		prompt: def.prompt || '',
		expand: def.expand,
		source,
	};
}

/** The full active command list: built-ins first, then plugin/personal (built-ins win on label clash). */
function activeCommands(): SlashCommand[] {
	const byLabel = new Map<string, SlashCommand>();
	for (const c of BUILTIN_COMMANDS) byLabel.set(c.label, c);
	for (const c of extraCommands) if (!byLabel.has(c.label)) byLabel.set(c.label, c);
	return [...byLabel.values()];
}

export interface ParsedSlashCommand {
	command: SlashCommand | null;
	/** The text after the slash command word, trimmed. */
	rest: string;
	/** Whether the input started with a recognized slash command. */
	isSlashCommand: boolean;
}

export const parseSlashCommand = (text: string): ParsedSlashCommand => {
	const trimmed = text.trim();
	if (!trimmed.startsWith('/')) {
		return { command: null, rest: trimmed, isSlashCommand: false };
	}
	const withoutPrefix = trimmed.slice(1);
	const firstSpaceIdx = withoutPrefix.search(/\s/);
	const commandLabel = firstSpaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpaceIdx);
	const rest = firstSpaceIdx === -1 ? '' : withoutPrefix.slice(firstSpaceIdx + 1).trim();
	const command = activeCommands().find(cmd => cmd.label === commandLabel.toLowerCase()) || null;
	return { command, rest, isSlashCommand: true };
};

/**
 * Hook returning the live slash-command list (built-ins + plugin/personal commands).
 * Re-fetches plugin commands whenever the PluginService state changes. Call this in
 * the component that renders the menu so it re-renders when plugins are enabled/disabled.
 */
export const useSlashCommands = (): SlashCommand[] => {
	const accessor = useAccessor();
	const pluginService = accessor.get('IPluginService');
	const pluginState = usePluginServiceState();
	const [cmds, setCmds] = useState<SlashCommand[]>(() => activeCommands());

	useEffect(() => {
		let cancelled = false;
		pluginService.getCommands()
			.then((defs: SlashCommandDef[]) => {
				if (cancelled) return;
				extraCommands = defs.map(d => defToSlashCommand(d, d.source));
				setCmds(activeCommands());
			})
			.catch(() => { /* ignore — built-ins still available */ });
		return () => { cancelled = true };
		// Re-run when plugins change (enable/disable/install alters the contributed commands).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pluginState, pluginService]);

	return cmds;
};

interface SlashCommandMenuProps {
	query: string;
	isOpen: boolean;
	onSelect: (command: SlashCommand) => void;
	onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({ query, isOpen, onSelect, onClose }) => {
	const [selectedIdx, setSelectedIdx] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

	const commands = useSlashCommands();
	const filtered = commands.filter(cmd =>
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
			if (!isOpen) return;
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				e.stopPropagation();
				setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				e.stopPropagation();
				setSelectedIdx(prev => Math.max(prev - 1, 0));
			} else if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				if (filtered[selectedIdx]) {
					onSelect(filtered[selectedIdx]);
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener('keydown', handleKeyDown, true);
		return () => document.removeEventListener('keydown', handleKeyDown, true);
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
			className="popover absolute bottom-full left-0 mb-2 w-full bg-void-bg-1 rounded-xl flex flex-col overflow-hidden"
			style={{ maxHeight: '280px', zIndex: 'var(--void-z-dropdown)' }}
		>
			<div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-void-fg-3 bg-void-bg-2 border-b border-void-border-2 select-none">
				Slash Commands
			</div>
			<div className="overflow-y-auto py-1">
				{filtered.map((cmd, i) => (
					<div
						key={cmd.id + cmd.source}
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