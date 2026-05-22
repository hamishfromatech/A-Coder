/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Keyboard, X, Command, CornerDownLeft, ArrowUp } from 'lucide-react';

interface KeyboardShortcutsBannerProps {
	keybindingString?: string;
}

export const KeyboardShortcutsBanner: React.FC<KeyboardShortcutsBannerProps> = ({ keybindingString }) => {
	const [visible, setVisible] = useState(true);
	const [isHovered, setIsHovered] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (!isHovered) {
				setVisible(false);
			}
		}, 8000);
		return () => clearTimeout(timer);
	}, [isHovered]);

	if (!visible) return null;

	const shortcuts = [
		{ keys: keybindingString || '⌘L', label: 'Add selection' },
		{ keys: '↵', label: 'Send message' },
		{ keys: 'Shift↵', label: 'New line' },
		{ keys: '↑', label: 'Navigate history' },
		{ keys: '@', label: 'Mention file/symbol' },
	];

	return (
		<div
			className="mt-6 px-4 py-3 bg-void-bg-2 border border-void-border-2 rounded-xl max-w-sm w-full relative animate-in fade-in slide-in-from-bottom-2 duration-500"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<button
				onClick={() => setVisible(false)}
				className="absolute top-1 right-1 p-1 text-void-fg-4 hover:text-void-fg-2 transition-colors"
				aria-label="Dismiss keyboard shortcuts"
			>
				<X size={12} />
			</button>

			<div className="flex items-center gap-2 mb-2.5">
				<Keyboard size={14} className="text-void-accent" />
				<span className="text-xs font-semibold text-void-fg-2 uppercase tracking-wider">Keyboard Shortcuts</span>
			</div>

			<div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
				{shortcuts.map((shortcut) => (
					<div key={shortcut.label} className="flex items-center justify-between gap-2">
						<span className="text-[11px] text-void-fg-3">{shortcut.label}</span>
						<span className="text-[10px] font-mono px-1.5 py-0.5 bg-void-bg-3 border border-void-border-1 rounded text-void-fg-2">
							{shortcut.keys}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};

export default KeyboardShortcutsBanner;
