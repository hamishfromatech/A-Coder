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

const EditToolHeaderButtons = ({ applyBoxId, uri, codeStr, toolName, threadId }: { threadId: string, applyBoxId: string, uri: URI, codeStr: string, toolName: 'edit_file' | 'rewrite_file' | 'edit_files' }) => {
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

// Type guard for single edit tool params
const isSingleEditParams = (params: any): params is { uri: URI, old_string: string, new_string: string } => {
	return params && params.uri && typeof params.old_string === 'string' && typeof params.new_string === 'string'
}

// Type guard for multi edit tool params
const isMultiEditParams = (params: any): params is { edits: Array<{ uri: URI, old_string: string, new_string: string }> } => {
	return params && Array.isArray(params.edits)
}

export const EditToolResultWrapper: ResultWrapper<'edit_file' | 'rewrite_file' | 'edit_files'> = ({ toolMessage, threadId, messageIdx }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)
	const isRejected = toolMessage.type === 'rejected'

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
	const { params, name } = toolMessage

	// Build content and determine structure
	const isMulti = name === 'edit_files'

	// For single edit: uri, old_string, new_string
	// For multi edit: edits array
	let editsList: Array<{ uri: URI, content: string, key: string }> = []

	if (isMulti && isMultiEditParams(params)) {
		editsList = params.edits.map((edit, i) => ({
			uri: edit.uri,
			content: `<<<<<<< ORIGINAL\n${edit.old_string}\n=======\n${edit.new_string}\n>>>>>>> UPDATED`,
			key: `${edit.uri.fsPath}-${i}`
		}))
	} else if (!isMulti && isSingleEditParams(params)) {
		editsList = [{
			uri: params.uri,
			content: name === 'edit_file'
				? `<<<<<<< ORIGINAL\n${params.old_string}\n=======\n${params.new_string}\n>>>>>>> UPDATED`
				: params.newContent ?? '',
			key: params.uri.fsPath
		}]
	}

	// desc1 onClick for header
	const desc1OnClick = isMulti && editsList.length > 0
		? () => voidOpenFileFn(editsList[0].uri, accessor)
		: !isMulti && editsList.length > 0
			? () => voidOpenFileFn(editsList[0].uri, accessor)
			: undefined

	// Calculate diff stats (only for rewrite_file with full content)
	let diffStatsElement: React.ReactNode = null;
	if (toolMessage.type === 'running_now' && name === 'rewrite_file' && editsList.length > 0) {
		const oldLineCount = editsList[0].content.split('\n').length;
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

	const editToolType = name === 'rewrite_file' ? 'rewrite' : 'diff'

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
			{editsList.map(({ uri, content }) => (
				<EditToolChildren key={uri.toString()} uri={uri} code={content} type={editToolType} chatMessageLocation={{ threadId, messageIdx }} />
			))}
		</ToolChildrenWrapper>
	} else {
		const acceptRejectAll = isMulti ? (
			<div className="flex items-center gap-1">
				{editsList.map(({ uri, content }, i) => {
					const applyBoxId = getApplyBoxId({ threadId, messageIdx, tokenIdx: `N/A-${i}` })
					return <EditToolHeaderButtons key={uri.toString()} applyBoxId={applyBoxId} uri={uri} codeStr={content} toolName={name} threadId={threadId} />
				})}
			</div>
		) : editsList.length > 0 ? (
			(() => {
				const applyBoxId = getApplyBoxId({ threadId, messageIdx, tokenIdx: 'N/A' })
				return <EditToolHeaderButtons applyBoxId={applyBoxId} uri={editsList[0].uri} codeStr={editsList[0].content} toolName={name} threadId={threadId} />
			})()
		) : null

		componentParams.desc2 = acceptRejectAll

		componentParams.children = <ToolChildrenWrapper>
			{isMulti && editsList.length > 0 && (
				<div className="flex flex-col gap-2 mb-2">
					{editsList.map(({ uri, content, key }, i) => (
						<div key={key} className="border border-void-border-2 rounded-lg overflow-hidden">
							<div className="flex items-center px-3 py-1.5 bg-void-bg-3 border-b border-void-border-2">
								<span className="text-xs font-medium text-void-fg-2">{uri.path.split('/').pop()}</span>
								<span className="text-xs text-void-fg-4 ml-2 italic">{uri.fsPath}</span>
							</div>
							<div className="p-2">
								<EditToolChildren uri={uri} code={content} type={editToolType} chatMessageLocation={{ threadId, messageIdx }} />
							</div>
						</div>
					))}
				</div>
			)}
			{!isMulti && editsList.length > 0 && (
				<EditToolChildren uri={editsList[0].uri} code={editsList[0].content} type={editToolType} chatMessageLocation={{ threadId, messageIdx }} />
			)}
		</ToolChildrenWrapper>

		if (toolMessage.type === 'success' || toolMessage.type === 'rejected') {
			const result = toolMessage.result as any;
			if (isMulti && result?.results) {
				// Multi-edit: show lint errors per file
				const allErrors = result.results.filter((r: any) => r.lintErrors?.length > 0)
				if (allErrors.length > 0) {
					componentParams.bottomChildren = <BottomChildren title='Lint errors'>
						{allErrors.map((r: any, i: number) => (
							<div key={i} className="mb-2">
								<div className="text-xs font-medium text-void-fg-2 mb-1">{r.uri}</div>
								{r.lintErrors.map((error: any, j: number) => (
									<div key={j} className='whitespace-nowrap text-xs'>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
								))}
							</div>
						))}
					</BottomChildren>
				}
			} else if (result?.lintErrors && result.lintErrors.length > 0) {
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
