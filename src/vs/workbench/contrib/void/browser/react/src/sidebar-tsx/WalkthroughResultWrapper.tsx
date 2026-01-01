/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react'
import { URI } from '../../../../../../../base/common/uri.js'
import { useAccessor } from '../util/services.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { ToolName } from '../../../../common/toolsServiceTypes.js'

interface WalkthroughResultWrapperProps {
	toolMessage: {
		name: ToolName
		params: any
		content: string
		result?: any
		id: string // Add the missing id property
	}
	messageIdx: number
	threadId: string
}

const WalkthroughResultWrapper: React.FC<WalkthroughResultWrapperProps> = ({
	toolMessage,
	messageIdx,
	threadId
}) => {
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const chatThreadsService = accessor.get('IChatThreadService') as any
	const agentManagerService = accessor.get('IAgentManagerService') as any

	const [refreshKey, setRefreshKey] = useState(0)
	const [latestWalkthrough, setLatestWalkthrough] = useState(toolMessage)
	const [isExpanded, setIsExpanded] = useState(true) // Add collapsible state

	// Check for newer walkthrough updates in this thread
	useEffect(() => {
		const checkForUpdates = () => {
			if (!chatThreadsService) return
			const thread = chatThreadsService.state.allThreads[threadId]
			if (!thread) return

			const messages = thread.messages || []
			const walkthroughMessages = messages.filter((m: any) => m.name === 'update_walkthrough' || m.name === 'open_walkthrough_preview')
			const latest = walkthroughMessages[walkthroughMessages.length - 1]

			if (latest && latest.id !== toolMessage.id) {
				setLatestWalkthrough(latest)
				setRefreshKey(prev => prev + 1)
			}
		}

		// Check on mount and when messages change
		checkForUpdates()
	}, [threadId, toolMessage.id, chatThreadsService, chatThreadsService?.state?.allThreads?.[threadId]?.messages?.length])

	const result = latestWalkthrough.result?.result || latestWalkthrough.result
	const toolName = latestWalkthrough.name

	if (!result || typeof result === 'string') {
		return (
			<div className="@@void-scope">
				<div className="void-walkthrough-result w-full rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-2 shadow-sm">
					<div className="flex items-center gap-2 px-3 py-2">
						<div
							className="w-3 h-3 border-2 rounded-full border-void-accent"
							style={{
								borderTopColor: 'transparent',
								animation: 'spin 0.8s linear infinite'
							}}
						/>
						<span className="text-void-fg-3 text-sm">
							{toolName === 'update_walkthrough' ? 'Updating walkthrough...' : 'Preparing walkthrough...'}
						</span>
					</div>
				</div>
			</div>
		)
	}

	// Handle open_walkthrough_preview tool result
	if (toolName === 'open_walkthrough_preview') {
		return (
			<div className="@@void-scope">
				<div className="void-walkthrough-result border border-void-border-2 rounded-lg overflow-hidden bg-void-bg-2 p-3">
					<div className="flex items-center gap-2 text-void-fg-1">
						<span className="text-lg">👁️</span>
						<div className="text-sm font-medium">{result.message || 'Walkthrough preview opened'}</div>
					</div>
				</div>
			</div>
		)
	}

	// If it's not a walkthrough result object with preview, don't render
	if (!result.preview && !result.filePath) {
		return null
	}

	const openWalkthrough = async () => {
		if (!agentManagerService) {
			console.error('agentManagerService not available')
			return
		}

		try {
			// Always call openWalkthroughPreview, the service will decide how to handle it
			// (e.g., opening a React tab)
			await agentManagerService.openWalkthroughPreview(result.filePath, result.preview)
		} catch (error) {
			console.error('Failed to open walkthrough:', error)
			// Last resort fallback to raw file open
			if (commandService) {
				try {
					const uri = URI.file(result.filePath)
					await commandService.executeCommand('vscode.open', uri)
				} catch (fallbackError) {
					console.error('Fallback also failed:', fallbackError)
				}
			}
		}
	}

	const getActionIcon = () => {
		switch (result.action) {
			case 'created': return '📝'
			case 'updated': return '✏️'
			case 'appended': return '➕'
			default: return '📄'
		}
	}

	const getActionText = () => {
		switch (result.action) {
			case 'created': return 'Created'
			case 'updated': return 'Updated'
			case 'appended': return 'Appended to'
			default: return 'Modified'
		}
	}

		return (

			<div className="@@void-scope">

				<div className="void-walkthrough-result border border-void-border-2 rounded-lg overflow-hidden bg-void-bg-4 shadow-sm">

					{/* Header */}

					<div className="bg-void-bg-4/50 px-3 py-2">

						<div

							className="flex items-center justify-between cursor-pointer hover:bg-void-bg-4-hover transition-colors rounded px-2 py-1"

							onClick={() => setIsExpanded(!isExpanded)}

						>

	
					<div className="flex items-center gap-2 min-w-0 flex-1">
						<svg
							className={`w-4 h-4 text-void-fg-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
						<span className="text-lg flex-shrink-0">{getActionIcon()}</span>
						<div className="min-w-0 flex-1">
							<div className="font-medium text-void-fg-1 truncate">
								Walkthrough {getActionText().toLowerCase()}
							</div>
							<div className="text-xs text-void-fg-4 font-mono truncate" title={result.filePath}>
								{result.filePath}
							</div>
						</div>
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation() // Prevent header collapse when clicking Open
							openWalkthrough()
						}}
						className="px-3 py-1 bg-void-bg-3 hover:bg-void-bg-4 text-void-fg-1 border border-void-border-2 rounded-md text-sm flex items-center gap-1 transition-colors flex-shrink-0"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
						</svg>
						Open
					</button>
				</div>
			</div>

			{/* Collapsible Content */}
			{isExpanded && (
				<div className="p-3">
					<div className="text-sm font-medium text-void-fg-2 mb-2">Preview:</div>
					<div className="bg-void-bg-4/40 border border-void-border-2 rounded-md p-4 max-h-[500px] overflow-y-auto prose prose-sm prose-invert max-w-none">
						<ChatMarkdownRender
							key={refreshKey}
							string={result.preview}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</div>
				</div>
			)}

			{/* Update indicator */}
			{latestWalkthrough.id !== toolMessage.id && (
				<div className="px-3 pb-2 text-xs text-void-fg-4 italic">
					This walkthrough has been updated. See latest version above.
				</div>
			)}
			</div>
		</div>
	)
}

export default WalkthroughResultWrapper
