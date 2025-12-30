/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { MAX_FILE_CHARS_PAGE } from '../../../../common/prompt/prompts.js';
import { 
	ToolHeaderWrapper, 
	ToolChildrenWrapper, 
	BottomChildren, 
	CodeChildren, 
	getTitle, 
	toolNameToDesc,
	voidOpenFileFn,
	ResultWrapper,
	ToolHeaderParams
} from './ToolResultHelpers.js';

export const FileResultWrapper: ResultWrapper<'read_file' | 'outline_file'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);
	const isRejected = toolMessage.type === 'rejected'
	const { params } = toolMessage
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected, }

	// Handle line ranges for read_file
	let range: [number, number] | undefined = undefined
	if (toolMessage.name === 'read_file' && toolMessage.params && (toolMessage.params.startLine !== null || toolMessage.params.endLine !== null)) {
		range = [toolMessage.params.startLine || 1, toolMessage.params.endLine || 1]
	}

	if (toolMessage.type === 'success') {
		const { result } = toolMessage
		componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor, range) }
		
		if (toolMessage.name === 'read_file') {
			if (result.hasNextPage && params.pageNumber === 1)
				componentParams.desc2 = `(truncated after ${Math.round(MAX_FILE_CHARS_PAGE) / 1000}k)`
			else if (params.pageNumber > 1)
				componentParams.desc2 = `(part ${params.pageNumber})`
		}
	}
	else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>{String(toolMessage.result)}</CodeChildren>
		</BottomChildren>
	}
	else if (toolMessage.type === 'running_now') {
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
	}

	return <ToolHeaderWrapper {...componentParams} />
}
