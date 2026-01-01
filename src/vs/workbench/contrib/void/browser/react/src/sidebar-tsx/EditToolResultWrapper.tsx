/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState, useIsDark } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatMarkdownRender, getApplyBoxId, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { CopyButton, EditToolAcceptRejectButtonsHTML, useEditToolStreamState } from '../markdown/ApplyBlockHoverButtons.js';
import { VoidDiffEditor } from '../util/inputs.js';
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

	const hasValidDiffFormat = type === 'diff' && (
		code.includes('<<<<<<< ORIGINAL') &&
		code.includes('=======') &&
		code.includes('>>>>>>> UPDATED')
	);

	const content = type === 'diff' ?
		(hasValidDiffFormat ?
			<VoidDiffEditor uri={uri} originalUpdatedBlocks={code} />
			: <div className="w-full p-4 text-void-fg-3 text-sm">
				<div className="mb-2 font-medium">Processing diff...</div>
				<div className="text-void-fg-4 text-xs">Waiting for complete ORIGINAL/UPDATED blocks.</div>
			</div>)
		: <ChatMarkdownRender string={`\
\`\`\`${uri ? detectLanguage(null as any, { uri, fileContents: code }) : ''}
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

	// Calculate diff stats
	let diffStatsElement: React.ReactNode = null;
	const content = toolMessage.name === 'edit_file' ? (toolMessage.params as any).originalUpdatedBlocks : (toolMessage.params as any).newContent;

	if (toolMessage.type === 'running_now' && toolMessage.name === 'edit_file' && content) {
		let addedLines = 0;
		let removedLines = 0;
		const blocks = content.split('<<<<<<< ORIGINAL').slice(1);
		blocks.forEach((block: string) => {
			const parts = block.split('=======');
			if (parts.length === 2) {
				const original = parts[0].trim();
				const updated = parts[1].split('>>>>>>> UPDATED')[0].trim();
				removedLines += original ? original.split('\n').length : 0;
				addedLines += updated ? updated.split('\n').length : 0;
			}
		});

		if (addedLines > 0 || removedLines > 0) {
			diffStatsElement = (
				<span className='flex items-center gap-1 text-xs ml-1.5'>
					{addedLines > 0 && <span className='text-green-500'>+{addedLines}</span>}
					{removedLines > 0 && <span className='text-red-500'>-{removedLines}</span>}
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
