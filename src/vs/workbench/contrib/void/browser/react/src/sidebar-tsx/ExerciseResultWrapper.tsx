/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Target, AlertTriangle, Ban } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	getTitle,
	toolNameToDesc,
	ResultWrapper,
	ToolHeaderParams,
} from './ToolResultHelpers.js';
import { InlineExerciseBlock, ExerciseType } from '../learning-tsx/InlineExerciseBlock.js';

type CreateExerciseParams = {
	title: string;
	instructions: string;
	type: ExerciseType;
	language: string;
	initial_code: string;
	expected_solution: string;
	hints?: string[];
	difficulty?: 'easy' | 'medium' | 'hard';
};

/**
 * Renders a `create_exercise` tool call as a fully interactive code exercise
 * inline in the chat. The student can edit the starter code, submit for instant
 * client-side validation against the expected solution, and reveal progressive
 * hints — no follow-up tool call or display_lesson needed.
 */
export const ExerciseResultWrapper: ResultWrapper<'create_exercise'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor();
	const streamState = useChatThreadsStreamState(threadId);

	const title = getTitle(toolMessage);
	const { desc1 } = toolNameToDesc(toolMessage.name as BuiltinToolName, toolMessage.params, accessor);
	const isRejected = toolMessage.type === 'rejected';

	const params = toolMessage.params as CreateExerciseParams | undefined;

	// Stable exercise id: prefer the server-minted id from the result, fall back
	// to the tool-message id (stable across reloads).
	const result = toolMessage.type === 'success' ? (toolMessage.result as { exerciseId?: string } | undefined) : undefined;
	const exerciseId = result?.exerciseId || toolMessage.id;
	const lessonId = `exercise_${threadId}`;

	const componentParams: ToolHeaderParams = {
		isRunning: toolMessage.type === 'running_now',
		title,
		desc1,
		isError: false,
		icon: <Target size={12} strokeWidth={2.5} className="text-void-accent" />,
		isRejected,
		isOpen: true,
	};

	// Safety check: need at least instructions + initial_code to render a usable exercise
	const hasRequiredFields = params && params.instructions && params.initial_code && params.expected_solution;

	if (!hasRequiredFields) {
		const stillRunning = toolMessage.type === 'running_now' || toolMessage.type === 'tool_request';
		componentParams.isError = !stillRunning;
		componentParams.children = (
			<ToolChildrenWrapper>
				{stillRunning ? (
					<div className="flex items-center gap-2 py-2 mb-3">
						<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
						<span className="text-xs italic text-void-fg-3">Loading exercise...</span>
					</div>
				) : (
					<div className="flex items-center gap-2 py-2 mb-3 text-void-error">
						<AlertTriangle size={14} />
						<span className="text-xs">Exercise data missing or invalid.</span>
					</div>
				)}
			</ToolChildrenWrapper>
		);
		return <ToolHeaderWrapper {...componentParams} />;
	}

	// The interactive editor is available in every non-terminal state — the
	// student can practice as soon as the params arrive and keep going after the
	// tool call settles. Only rejected / error states replace it.
	if (toolMessage.type === 'tool_error') {
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="px-3 py-2 bg-void-warning/10 border border-void-warning/30 rounded-lg">
					<div className="flex items-start gap-2">
						<AlertTriangle size={14} className="text-void-warning flex-shrink-0 mt-0.5" />
						<span className="text-sm text-void-warning">Error: {String(toolMessage.result)}</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
		return <ToolHeaderWrapper {...componentParams} />;
	}

	if (toolMessage.type === 'rejected') {
		componentParams.children = (
			<ToolChildrenWrapper>
				<div className="px-3 py-2 bg-void-fg-4/10 border border-void-fg-4/30 rounded-lg">
					<div className="flex items-center gap-2">
						<Ban size={14} className="text-void-fg-4 flex-shrink-0" />
						<span className="text-sm text-void-fg-3">Skipped</span>
					</div>
				</div>
			</ToolChildrenWrapper>
		);
		return <ToolHeaderWrapper {...componentParams} />;
	}

	// running_now / tool_request / success → render the live exercise.
	const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
		? streamState.toolInfo.content
		: undefined;

	componentParams.children = (
		<ToolChildrenWrapper>
			{activity && (
				<div className="flex items-center gap-2 py-2 mb-3 border-b border-void-border-2/30">
					<div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
					<span className="text-xs italic text-void-fg-3">{activity}</span>
				</div>
			)}
			<InlineExerciseBlock
				exerciseId={exerciseId}
				lessonId={lessonId}
				type={params!.type}
				title={params!.title}
				instructions={params!.instructions}
				initialCode={params!.initial_code}
				language={params!.language}
				expectedSolution={params!.expected_solution}
				hints={params!.hints}
				threadId={threadId}
			/>
		</ToolChildrenWrapper>
	);

	return <ToolHeaderWrapper {...componentParams} />;
};

export default ExerciseResultWrapper;