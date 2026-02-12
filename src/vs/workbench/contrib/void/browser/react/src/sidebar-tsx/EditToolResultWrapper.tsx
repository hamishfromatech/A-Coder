/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState, useIsDark } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatMarkdownRender, getApplyBoxId, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { CopyButton, EditToolAcceptRejectButtonsHTML, useEditToolStreamState } from '../markdown/ApplyBlockHoverButtons.js';
import { VoidDiffEditor } from '../util/inputs.js';
import { detectLanguage } from '../../../../common/helpers/languageHelpers.js';
import { 
	ToolHeaderWrapper, 
	ToolChildrenWrapper, 
	SmallProseWrapper, 
	BottomChildren, 
	CodeChildren, 
	getTitle, 
	toolNameToDesc,
	voidOpenFileFn,
	ResultWrapper,
	ToolHeaderParams,
	WrapperProps
} from './ToolResultHelpers.js';

const EditToolHeaderButtons = ({ applyBoxId, uri, codeStr, toolName, threadId }: { threadId: string, applyBoxId: string, uri: URI, codeStr: string, toolName: 'edit_file' | 'rewrite_file' }) => {
	const { streamState } = useEditToolStreamState({ applyBoxId, uri })
	return <div className='flex items-center gap-1'>
		{streamState === 'idle-no-changes' && <CopyButton codeStr={codeStr} toolTipName='Copy' />}
		<EditToolAcceptRejectButtonsHTML type={toolName} codeStr={codeStr} applyBoxId={applyBoxId} uri={uri} threadId={threadId} />
	</div>
}

export const EditToolChildren = ({ uri, code, type, chatMessageLocation }: { uri: URI | undefined, code: string, type: 'diff' | 'rewrite', chatMessageLocation: ChatMessageLocation | undefined }) => {
	const accessor = useAccessor()
	const languageService = accessor.get('ILanguageService')

	// Check if code is defined and has valid diff format
	const hasValidDiffFormat = type === 'diff' && code && (
		code.includes('<<<<<<< ORIGINAL') &&
		code.includes('=======') &&
		code.includes('>>>>>>> UPDATED')
	);

	const content = type === 'diff' ?
		(hasValidDiffFormat ?
			<VoidDiffEditor uri={uri} originalUpdatedBlocks={code} />
			: code ? <ChatMarkdownRender string={`\
\`\`\`${uri ? detectLanguage(languageService, { uri, fileContents: code }) : ''}
${code}
\`\`\``} codeURI={uri} chatMessageLocation={chatMessageLocation} isApplyEnabled={true} />
			: <div className="w-full p-4 text-void-fg-3 text-sm">
				<div className="mb-2 font-medium">No code to display</div>
				<div className="text-void-fg-4 text-xs">The edit was applied successfully.</div>
			</div>)
		: <ChatMarkdownRender string={`\
\`\`\`${uri ? detectLanguage(languageService, { uri, fileContents: code }) : ''}
${code}
\`\`\``} codeURI={uri} chatMessageLocation={chatMessageLocation} isApplyEnabled={true} />

	return <div className='!select-text cursor-auto'>
		<SmallProseWrapper>{content}</SmallProseWrapper>
	</div>
}

export const EditToolResultWrapper: ResultWrapper<'edit_file' | 'rewrite_file'> = ({ toolMessage, threadId, messageIdx }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)
	const isRejected = toolMessage.type === 'rejected'

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
	const { params, name } = toolMessage
	const desc1OnClick = () => voidOpenFileFn(params.uri, accessor)

	// Calculate diff stats (only for rewrite_file with full content)
	let diffStatsElement: React.ReactNode = null;
	// For edit_file, construct diff format from old_string/new_string
	// For rewrite_file, use newContent
	const content = toolMessage.name === 'edit_file'
		? `<<<<<<< ORIGINAL\n${params.old_string}\n=======\n${params.new_string}\n>>>>>>> UPDATED`
		: params.newContent;

	if (toolMessage.type === 'running_now' && toolMessage.name === 'rewrite_file' && content) {
		// Only calculate stats for rewrite_file since edit_file now does simple replacement
		const oldLineCount = content.split('\n').length;
		if (oldLineCount > 0) {
			diffStatsElement = (
				<span className='flex items-center gap-1 text-xs ml-1.5'>
					<span className='text-void-fg-3'>{oldLineCount} lines</span>
				</span>
			);
		}
	}

	const componentParams: ToolHeaderParams = {
		title,
		desc1: diffStatsElement ? <span className='flex items-center'>{desc1}{diffStatsElement}</span> : desc1,
		desc1OnClick,
		desc1Info,
		isError: false,
		icon: null,
		isRejected,
		isOpen: toolMessage.type === 'running_now' || toolMessage.type === 'tool_request' || undefined,
	}

	const editToolType = toolMessage.name === 'edit_file' ? 'diff' : 'rewrite'
	
	if (toolMessage.type === 'running_now' || toolMessage.type === 'tool_request') {
		if (toolMessage.type === 'running_now') {
			componentParams.desc2 = (
				<div className="flex items-center gap-2 px-2 py-1 bg-void-accent/10 rounded-full border border-void-accent/20">
					<span className="text-[10px] font-bold text-void-accent uppercase tracking-wider">Streaming</span>
					<Loader2 className="w-3 h-3 animate-spin text-void-accent" />
				</div>
			);
		}

		const activity = toolMessage.type === 'running_now' && streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: undefined;

		componentParams.children = <ToolChildrenWrapper>
			{activity && (
				<div className="flex items-center gap-2 py-2 mb-2 border-b border-void-border-2/30">
					<Loader2 className="w-3 h-3 animate-spin text-void-accent" />
					<span className="text-xs italic text-void-fg-3">{activity}</span>
				</div>
			)}
			<EditToolChildren uri={params.uri} code={content} type={editToolType} chatMessageLocation={{ threadId, messageIdx }} />
		</ToolChildrenWrapper>
	} else {
		const applyBoxId = getApplyBoxId({ threadId, messageIdx, tokenIdx: 'N/A' })
		componentParams.desc2 = <EditToolHeaderButtons applyBoxId={applyBoxId} uri={params.uri} codeStr={content} toolName={name} threadId={threadId} />
		componentParams.children = <ToolChildrenWrapper>
			<EditToolChildren uri={params.uri} code={content} type={editToolType} chatMessageLocation={{ threadId, messageIdx }} />
		</ToolChildrenWrapper>

		if (toolMessage.type === 'success' || toolMessage.type === 'rejected') {
			const result = toolMessage.result as any;
			if (result?.lintErrors && result.lintErrors.length > 0) {
				componentParams.bottomChildren = <BottomChildren title='Lint errors'>
					{result.lintErrors.map((error: any, i: number) => (
						<div key={i} className='whitespace-nowrap'>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
					))}
				</BottomChildren>
			}
		} else if (toolMessage.type === 'tool_error') {
			componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
		}
	}

	return <ToolHeaderWrapper {...componentParams} />
}
