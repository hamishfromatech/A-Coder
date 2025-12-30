/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2 } from 'lucide-react';
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

// Default wrapper for tools that just show their result as markdown or JSON
export const DefaultToolResultWrapper: ResultWrapper<BuiltinToolName> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as BuiltinToolName, toolMessage.params, accessor)

	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }

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
		const resultStr = result?.template || (typeof result === 'string' ? result : JSON.stringify(result, null, 2))
		componentParams.children = <ToolChildrenWrapper>
			<SmallProseWrapper>
				<ChatMarkdownRender
					string={resultStr}
					chatMessageLocation={undefined}
					isApplyEnabled={false}
					isLinkDetectionEnabled={true}
				/>
			</SmallProseWrapper>
		</ToolChildrenWrapper>
	} else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>{String(toolMessage.result)}</CodeChildren>
		</BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />
}
