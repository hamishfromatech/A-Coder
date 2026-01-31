/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	SmallProseWrapper,
	BottomChildren,
	CodeChildren,
	getTitle,
	toolNameToDesc,
	ResultWrapper,
	ToolHeaderParams
} from './ToolResultHelpers.js';

// Wrapper for image generation results
export const MediaResultWrapper: ResultWrapper<'generate_image'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as BuiltinToolName, toolMessage.params, accessor)

	const isRejected = toolMessage.type === 'rejected'
	const icon = <ImageIcon size={12} strokeWidth={2.5} />
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon, isRejected }

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
		const result = toolMessage.result as any
		const markdown = result?.markdown || ''
		
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="py-2">
					<ChatMarkdownRender
						string={markdown}
						chatMessageLocation={undefined}
						isApplyEnabled={false}
						isLinkDetectionEnabled={true}
					/>
				</div>
				{result?.url && (
					<BottomChildren title='URL'>
						<CodeChildren>{result.url}</CodeChildren>
					</BottomChildren>
				)}
			</ToolChildrenWrapper>
		)
		componentParams.isOpen = true; // Open by default to show the media
	} else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>{String(toolMessage.result)}</CodeChildren>
		</BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />
}
