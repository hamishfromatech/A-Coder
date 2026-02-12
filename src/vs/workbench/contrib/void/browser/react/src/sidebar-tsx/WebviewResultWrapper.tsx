/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { Globe, ExternalLink, Image as ImageIcon, Search, FileText, Database, Loader2 } from 'lucide-react';
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

type WebviewToolName =
	| 'open_url'
	| 'fetch_url'
	| 'open_devtools'
	| 'click_element'
	| 'get_page_text'
	| 'webview_screenshot'
	| 'search_web'
	| 'browse_resources';

// Wrapper for all webview/browser tool results
export const WebviewResultWrapper: ResultWrapper<WebviewToolName> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const streamState = useChatThreadsStreamState(threadId)

	const toolName = toolMessage.name as BuiltinToolName;
	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolName, toolMessage.params, accessor)

	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, isRejected }

	// Icon based on tool type
	const getIcon = () => {
		switch (toolName) {
			case 'open_url':
			case 'fetch_url':
				return <Globe size={12} strokeWidth={2.5} />
			case 'search_web':
				return <Search size={12} strokeWidth={2.5} />
			case 'get_page_text':
			case 'browse_resources':
				return <FileText size={12} strokeWidth={2.5} />
			case 'webview_screenshot':
				return <ImageIcon size={12} strokeWidth={2.5} />
			default:
				return <Database size={12} strokeWidth={2.5} />
		}
	}

	componentParams.icon = getIcon()

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
		const result = toolMessage.result as any;

		switch (toolName) {
			case 'open_url':
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className="space-y-2 py-2">
							<div className="flex items-center gap-2">
								<span className="text-void-fg-3 text-xs">Webview ID:</span>
								<span className="font-mono text-xs bg-void-bg-3 px-2 py-1 rounded">{result.webviewId}</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-void-fg-3 text-xs">Title:</span>
								<span className="text-xs">{result.title}</span>
							</div>
						</div>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			case 'fetch_url':
				componentParams.children = (
					<ToolChildrenWrapper>
						{result.text && (
							<div className="py-2">
								<div className="text-void-fg-3 text-xs mb-1">Extracted Text:</div>
								<CodeChildren>{result.text.substring(0, 5000)}{result.text.length > 5000 ? '\n\n... (truncated)' : ''}</CodeChildren>
							</div>
						)}
						<BottomChildren title="HTML Info">
							<div className="text-xs text-void-fg-3">
								<div>Length: {result.html.length.toLocaleString()} characters</div>
							</div>
						</BottomChildren>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			case 'get_page_text':
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className="py-2">
							<CodeChildren>{result.text.substring(0, 10000)}{result.text.length > 10000 ? '\n\n... (truncated)' : ''}</CodeChildren>
						</div>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			case 'webview_screenshot':
				componentParams.children = (
					<ToolChildrenWrapper>
						{result.imageData && (
							<div className="py-2">
								<img
									src={result.imageData}
									alt="Screenshot"
									className="max-w-full rounded-lg border border-void-border-2"
								/>
							</div>
						)}
						{result.visionAnalysis && (
							<div className="py-2">
								<div className="text-void-fg-3 text-xs mb-1">Vision Analysis:</div>
								<SmallProseWrapper>
									{result.visionAnalysis}
								</SmallProseWrapper>
							</div>
						)}
						{result.filePath && (
							<BottomChildren title="File">
								<CodeChildren>{result.filePath}</CodeChildren>
							</BottomChildren>
						)}
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			case 'search_web':
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className="space-y-3 py-2">
							{result.results && result.results.map((r: any, i: number) => (
								<div key={i} className="p-2 bg-void-bg-2 rounded border border-void-border-2">
									<div className="flex items-start gap-2">
										<span className="text-void-fg-4 text-xs mt-0.5">{i + 1}.</span>
										<div className="flex-1 min-w-0">
											<a
												href={r.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-xs font-medium text-void-accent hover:text-void-accent-hover flex items-center gap-1"
											>
												<ExternalLink size={10} />
												<span className="truncate">{r.title}</span>
											</a>
											<div className="text-[11px] text-void-fg-3 mt-1 truncate">{r.url}</div>
											<div className="text-[11px] text-void-fg-2 mt-1">{r.snippet}</div>
										</div>
									</div>
								</div>
							))}
							{(!result.results || result.results.length === 0) && (
								<div className="text-xs text-void-fg-3 py-2">No results found.</div>
							)}
						</div>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			case 'browse_resources':
				componentParams.children = (
					<ToolChildrenWrapper>
						<div className="space-y-2 py-2">
							{result.resources && result.resources.length > 0 ? (
								Object.entries(
									result.resources.reduce((acc: Record<string, typeof result.resources>, r: any) => {
										if (!acc[r.type]) acc[r.type] = [];
										acc[r.type].push(r);
										return acc;
									}, {})
								).map(([type, resources]: [string, any[]]) => (
									<div key={type}>
										<div className="text-xs font-medium text-void-fg-1 mb-1 flex items-center gap-1">
											<span>{type.toUpperCase()}</span>
											<span className="text-void-fg-3">({resources.length})</span>
										</div>
										{resources.slice(0, 5).map((r: any, i: number) => (
											<div key={i} className="text-[11px] text-void-fg-2 truncate ml-2">
												{r.url}
											</div>
										))}
										{resources.length > 5 && (
											<div className="text-[11px] text-void-fg-3 ml-2">
												... and {resources.length - 5} more
											</div>
										)}
									</div>
								))
							) : (
								<div className="text-xs text-void-fg-3 py-2">No resources found.</div>
							)}
						</div>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
				break;

			default:
				// open_devtools, click_element - show the message with helpful context
				const isError = result.error !== undefined;
				const showHelpfulMessage = toolName === 'open_devtools' || toolName === 'webview_screenshot';

				componentParams.children = (
					<ToolChildrenWrapper>
						<div className="py-2">
							{isError ? (
								<div className={`
									p-3 rounded-lg border
									${showHelpfulMessage ? 'bg-orange-500/10 border-orange-500/30' : 'bg-red-500/10 border-red-500/30'}
								`}>
									<div className="flex items-start gap-2 mb-2">
										{showHelpfulMessage ? (
											<ImageIcon size={16} className="text-orange-500 flex-shrink-0" />
										) : (
											<Database size={16} className="text-red-500 flex-shrink-0" />
										)}
										<div className="flex-1">
											<div className={`text-sm font-semibold ${showHelpfulMessage ? 'text-orange-500' : 'text-red-500'}`}>
												{showHelpfulMessage ? 'Webview Required' : 'Action Failed'}
											</div>
											<div className="text-xs text-void-fg-2 mt-1">{result.message}</div>
										</div>
									</div>
									{showHelpfulMessage && (
										<div className="mt-3 pt-3 border-t border-orange-500/20">
											<div className="text-[10px] text-void-fg-3 mb-1">To fix this:</div>
											<ol className="text-xs text-void-fg-2 space-y-1 ml-3 list-decimal">
												<li>Use the "Open URL" command first to create a webview</li>
												<li>Then use screenshot or devtools on that webview</li>
												<li>Example: "Open https://example.com, then take screenshot"</li>
											</ol>
										</div>
									)}
								</div>
							) : (
								<div className="text-xs text-void-fg-2 py-2">{result.message}</div>
							)}
						</div>
					</ToolChildrenWrapper>
				);
				componentParams.isOpen = true;
		}
	} else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>{String(toolMessage.result)}</CodeChildren>
		</BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />
}