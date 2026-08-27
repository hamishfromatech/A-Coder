/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { Folder } from 'lucide-react';

interface WorkspaceCardProps {
	folder: {
		name: string;
		uri: {
			fsPath: string;
			toString(): string;
		};
	};
	index?: number;
	onClick?: () => void;
}

/** Flat folder row for the Files tab. This is an info card, not a button —
 *  it only claims interactivity when an `onClick` is actually provided. */
export const WorkspaceCard = memo(({ folder, index, onClick }: WorkspaceCardProps) => {
	const interactive = !!onClick;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (interactive && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onClick?.();
		}
	};

	return (
		<div
			className={`group flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors ${
				interactive ? 'cursor-pointer hover:bg-void-row-hover' : ''
			}`}
			onClick={onClick}
			onKeyDown={interactive ? handleKeyDown : undefined}
			role={interactive ? 'button' : undefined}
			tabIndex={interactive ? 0 : undefined}
			aria-label={interactive ? `Open workspace ${folder.name}` : undefined}
		>
			<span className='grid size-8 shrink-0 place-items-center rounded-md border border-void-hairline bg-void-bg-2'>
				<Folder className='size-4 text-void-fg-3' />
			</span>
			<span className='min-w-0 flex-1'>
				<span className='block truncate text-[13px] font-normal text-void-scaffold-text transition-colors group-hover:text-void-fg-2'>
					{folder.name}
				</span>
				<span className='block truncate font-mono text-[10px] text-void-scaffold-meta'>
					{folder.uri.fsPath}
				</span>
			</span>
				<span className='h-1.5 w-1.5 shrink-0 rounded-full bg-void-success/85' aria-hidden={true} />
		</div>
	);
});

WorkspaceCard.displayName = 'WorkspaceCard';