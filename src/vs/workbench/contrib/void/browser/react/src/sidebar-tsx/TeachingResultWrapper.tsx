/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Brain } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	getTitle,
	ResultWrapper,
	ToolHeaderParams,
} from './ToolResultHelpers.js';
import { TeachingContent } from './TeachingContent.js';

export const TeachingResultWrapper: ResultWrapper<'explain_code' | 'teach_concept' | 'create_exercise' | 'check_answer' | 'give_hint' | 'create_lesson_plan'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);

	const title = getTitle(toolMessage);
	const isRejected = toolMessage.type === 'rejected';
	const componentParams: ToolHeaderParams = {
		title,
		desc1: '',
		isError: false,
		icon: <Brain size={12} className="text-void-accent" />,
		isRejected,
	};

	if (toolMessage.type === 'running_now') {
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;
		if (activity) {
			componentParams.children = (
				<ToolChildrenWrapper>
					<div className="flex items-center gap-2 py-1">
						<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-xs italic text-void-fg-3">{activity}</span>
					</div>
				</ToolChildrenWrapper>
			);
			componentParams.isOpen = true;
		}
	} else if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
		const result = toolMessage.result as any;
		const resultContent = result?.template || (typeof result === 'string' ? result : '');

		componentParams.children = (
			<ToolChildrenWrapper>
				<TeachingContent
					toolName={toolMessage.name as BuiltinToolName}
					resultContent={resultContent}
					threadId={threadId}
				/>
			</ToolChildrenWrapper>
		);
		componentParams.isOpen = true;
	}

	return <ToolHeaderWrapper {...componentParams} />;
};

export default TeachingResultWrapper;
