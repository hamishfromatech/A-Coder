/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information. 
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	SmallProseWrapper,
	BottomChildren,
	CodeChildren,
	ListableToolItem,
	getTitle,
	toolNameToDesc,
	getRelative,
	voidOpenFileFn,
	getBasename,
	ResultWrapper,
	ToolHeaderParams
} from './ToolResultHelpers.js';

export const SearchQueryResultWrapper: ResultWrapper<'ls_dir' | 'search_pathnames_only' | 'search_for_files' | 'search_in_file' | 'get_dir_tree' | 'fast_context' | 'codebase_search'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)
	const toolsService = accessor.get('IToolsService')

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as any, toolMessage.params, accessor)
	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }

	const { params } = toolMessage

	// Specific tool info/hints
	if (toolMessage.name === 'get_dir_tree' && params.uri) {
		const rel = getRelative(params.uri, accessor)
		if (rel) componentParams.info = `Only search in ${rel}`
	} else if (toolMessage.name === 'search_pathnames_only' && params.includePattern) {
		componentParams.info = `Only search in ${params.includePattern}`
	} else if (toolMessage.name === 'search_for_files' && (params.searchInFolder || params.isRegex)) {
		let info: string[] = []
		if (params.searchInFolder) {
			const rel = getRelative(params.searchInFolder, accessor)
			if (rel) info.push(`Only search in ${rel}`)
		}
		if (params.isRegex) info.push(`Uses regex search`)
		componentParams.info = info.join('; ')
	} else if (toolMessage.name === 'search_in_file') {
		const infoarr: string[] = []
		const uriStr = getRelative(params.uri, accessor)
		if (uriStr) infoarr.push(uriStr)
		if (params.isRegex) infoarr.push(`Uses regex search`)
		componentParams.info = infoarr.join('; ')
	}

	if (toolMessage.type === 'running_now') {
		const activity = streamState?.isRunning === 'tool' && streamState.toolInfo.id === toolMessage.id
			? streamState.toolInfo.content
			: `Searching...`;

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
	else if (toolMessage.type === 'success') {
		const { result } = toolMessage
		
		switch (toolMessage.name) {
			case 'get_dir_tree':
				componentParams.children = <ToolChildrenWrapper>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={`\`\`\`\n${result.str}\n\`\`\`}`}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ToolChildrenWrapper>
				break;

			case 'ls_dir':
				componentParams.numResults = result.children?.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = !result.children || result.children.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.children.map((child: any, i: number) => (
							<ListableToolItem key={i}
								name={`${child.name}${child.isDirectory ? '/' : ''}`}
								className='w-full overflow-auto'
								onClick={() => voidOpenFileFn(child.uri, accessor)}
							/>
						))}
						{result.hasNextPage && <ListableToolItem name='Results truncated (Results truncated).' isSmall={true} className='w-full overflow-auto' />}
					</ToolChildrenWrapper>
				break;

			case 'search_pathnames_only':
			case 'search_for_files':
				componentParams.numResults = result.uris.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = result.uris.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.uris.map((uri: any, i: number) => (
							<ListableToolItem key={i}
								name={getBasename(uri.fsPath)}
								className='w-full overflow-auto'
								onClick={() => voidOpenFileFn(uri, accessor)}
							/>
						))}
						{result.hasNextPage && <ListableToolItem name='Results truncated.' isSmall={true} className='w-full overflow-auto' />}
					</ToolChildrenWrapper>
				break;

			case 'search_in_file':
				componentParams.numResults = result.lines.length;
				componentParams.children = result.lines.length === 0 ? undefined :
					<ToolChildrenWrapper>
						<CodeChildren><pre className='font-mono whitespace-pre'>
							{toolsService.stringOfResult['search_in_file'](params, result)}
						</pre></CodeChildren>
					</ToolChildrenWrapper>
				break;

			case 'fast_context':
				const contexts = result?.contexts ?? []
				componentParams.numResults = contexts.length
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className='flex flex-col gap-2'>
							{contexts.length === 0 && <SmallProseWrapper>No contexts found.</SmallProseWrapper>}
							{contexts.map((ctx: any, i: number) => (
								<div key={i} className='rounded border border-void-border-2 bg-void-bg-2/60 px-3 py-2 space-y-1'>
									<div className='flex items-center justify-between gap-2 text-sm text-void-fg-2'>
										<span className='font-medium truncate'>{ctx.file}</span>
									</div>
									<CodeChildren><pre className='font-mono whitespace-pre-wrap'>{ctx.content}</pre></CodeChildren>
								</div>
							))}
						</div>
					</ToolChildrenWrapper>
				)
				break;

			case 'codebase_search':
				const searchResults = result?.results ?? []
				componentParams.numResults = searchResults.length
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className='flex flex-col gap-2'>
							{searchResults.length === 0 && <SmallProseWrapper>No results found.</SmallProseWrapper>}
							{searchResults.map((res: any, i: number) => (
								<div key={i} className='rounded border border-void-border-2 bg-void-bg-2/60 px-3 py-2 space-y-1'>
									<div className='flex items-center justify-between gap-2 text-sm text-void-fg-2'>
										<span className='font-medium truncate'>{res.filepath}</span>
										<span className='text-[10px] font-bold text-void-accent bg-void-accent/10 px-1.5 py-0.5 rounded'>{(res.rerankScore * 100).toFixed(1)}% match</span>
									</div>
									<CodeChildren><pre className='font-mono whitespace-pre-wrap'>{res.content}</pre></CodeChildren>
								</div>
							))}
						</div>
					</ToolChildrenWrapper>
				)
				break;
		}
	}
	else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>{String(toolMessage.result)}</CodeChildren>
		</BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />
}
