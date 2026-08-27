/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import { Folder } from 'lucide-react';
import { useWorkspaceFolders } from '../util/services.js';
import { WorkspaceCard } from './WorkspaceCard.js';

export const WorkspacesView = memo(() => {
	const folders = useWorkspaceFolders();

	return (
		<div className="flex flex-col gap-3 p-4">
			{folders.map((folder, index) => (
				<WorkspaceCard key={folder.uri.toString()} folder={folder} index={index} />
			))}
			{folders.length === 0 && (
				<div className="flex flex-col items-center justify-center p-12 text-void-fg-4">
					<div className="w-16 h-16 rounded-2xl bg-void-bg-2 border border-dashed border-void-border-2 flex items-center justify-center mb-4">
						<Folder className="w-7 h-7 opacity-30" />
					</div>
					<p className="text-sm font-semibold text-void-fg-3 mb-2">No Workspace Open</p>
					<p className="text-xs text-void-fg-4 text-center max-w-[200px]">Open a folder in VS Code to start working with A-Coder IDE.</p>
				</div>
			)}
		</div>
	);
});

WorkspacesView.displayName = 'WorkspacesView';