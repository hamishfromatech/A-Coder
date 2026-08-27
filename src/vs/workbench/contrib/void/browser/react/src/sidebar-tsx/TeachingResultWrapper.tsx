/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Brain, BookOpen, Code, ClipboardList } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	getTitle,
	toolNameToDesc,
	ResultWrapper,
	ToolHeaderParams,
} from './ToolResultHelpers.js';

/**
 * Renders the prompt-scaffolding teaching tools (teach_concept, explain_code,
 * create_lesson_plan).
 *
 * These tools don't carry student-facing content themselves — they return a
 * structure template that guides the LLM, which then writes the real lesson and
 * shows it via `display_lesson`. So inline we only show a compact "preparing
 * your lesson" state (plus any live tool activity) rather than rendering the
 * empty template scaffold, which previously showed up as meaningless placeholder
 * headings like "(Clear definition for beginner level)".
 */
const ICON_FOR: Record<string, React.ReactNode> = {
	explain_code: <Code size={12} className="text-void-accent" />,
	teach_concept: <BookOpen size={12} className="text-void-accent" />,
	create_lesson_plan: <ClipboardList size={12} className="text-void-accent" />,
};

const LABEL_FOR: Record<string, string> = {
	explain_code: 'Preparing your code explanation',
	teach_concept: 'Preparing your lesson',
	create_lesson_plan: 'Preparing your lesson plan',
};

export const TeachingResultWrapper: ResultWrapper<'explain_code' | 'teach_concept' | 'create_lesson_plan'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);

	const title = getTitle(toolMessage);
	const { desc1 } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);
	const isRejected = toolMessage.type === 'rejected';

	const componentParams: ToolHeaderParams = {
		isRunning: toolMessage.type === 'running_now',
		title,
		desc1,
		isError: false,
		icon: ICON_FOR[toolMessage.name] ?? <Brain size={12} className="text-void-accent" />,
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
		// The real lesson content is delivered separately via display_lesson.
		// Keep this inline state compact and honest — no empty scaffold.
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="flex items-center gap-2 py-1.5 px-1">
					<BookOpen size={13} className="text-void-fg-3 flex-shrink-0" />
					<span className="text-xs text-void-fg-3">{LABEL_FOR[toolMessage.name] ?? 'Preparing your lesson'} — it will open in a dedicated tab.</span>
				</div>
			</ToolChildrenWrapper>
		);
		componentParams.isOpen = true;
	}

	return <ToolHeaderWrapper {...componentParams} />;
};

export default TeachingResultWrapper;