/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Folder, Copy as CopyIcon, Check, SkipForward, X } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { BlockCode } from '../util/inputs.js';
import { persistentTerminalNameOfId } from '../../../terminalToolService.js';
import { 
	ToolHeaderWrapper, 
	ToolChildrenWrapper, 
	BottomChildren, 
	CodeChildren, 
	getTitle, 
	toolNameToDesc,
	getRelative,
	ResultWrapper,
	ToolHeaderParams,
	WrapperProps
} from './ToolResultHelpers.js';

export const TerminalCommandApproval = ({ command, cwd, threadId }: { command: string, cwd?: string | null, threadId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const metricsService = accessor.get('IMetricsService')
	const workspaceContextService = accessor.get('IWorkspaceContextService')

	const workspaceFolders = workspaceContextService.getWorkspace().folders
	const firstFolder = workspaceFolders[0]?.uri.fsPath
	const displayPath = cwd && firstFolder
		? (cwd.startsWith(firstFolder) ? '~' + cwd.slice(firstFolder.length).replace(/^\//, '/') : cwd)
		: cwd || '~'

	const onRun = useCallback(() => {
		try { chatThreadsService.approveLatestToolRequest(threadId); metricsService.capture('Tool Request Accepted', { tool: 'run_command' }); }
		catch (e) { console.error('Error while approving command:', e) }
	}, [chatThreadsService, metricsService, threadId])

	const onSkip = useCallback(() => {
		try { chatThreadsService.skipLatestToolRequest(threadId); metricsService.capture('Tool Request Skipped', { tool: 'run_command' }); }
		catch (e) { console.error('Error while skipping command:', e) }
	}, [chatThreadsService, metricsService, threadId])

	const onCopy = useCallback(() => { navigator.clipboard.writeText(command) }, [command])

	const onCancel = useCallback(() => {
		try { chatThreadsService.rejectLatestToolRequest(threadId); metricsService.capture('Tool Request Rejected', { tool: 'run_command' }); }
		catch (e) { console.error('Error while rejecting command:', e) }
	}, [chatThreadsService, metricsService, threadId])

	return (
		<div className="rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-4 shadow-xl my-3 mx-1 animate-in fade-in slide-in-from-top-2 duration-300">
			<div className="px-4 py-3 font-mono text-[13px] leading-relaxed relative group">
				<div className="flex items-start gap-2">
					<span className="text-void-accent font-bold opacity-70 mt-1"><Play size={10} strokeWidth={3} /></span>
					<span className="text-void-fg-1 break-all">{command}</span>
				</div>
				<div className="mt-2 text-[10px] text-void-fg-4 font-bold uppercase tracking-wider flex items-center gap-1.5"><Folder size={10} />{displayPath}</div>
			</div>
			<div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-void-border-2 bg-void-bg-2/30">
				<button onClick={onCopy} className="p-2 text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 rounded-lg transition-all active:scale-90" data-tooltip-id='void-tooltip' data-tooltip-content='Copy command' data-tooltip-place='top'><CopyIcon size={14} /></button>
				<button onClick={onRun} className="flex items-center gap-2 px-4 py-1.5 bg-[#0e70c0] text-white hover:bg-[#1177cb] rounded-lg shadow-sm text-xs font-bold uppercase tracking-wider transition-all active:scale-95"><Play size={12} strokeWidth={3} />Run</button>
				<button onClick={onSkip} className="px-3 py-1.5 bg-void-bg-2 text-void-fg-2 hover:bg-void-bg-3 rounded-lg text-xs font-bold uppercase tracking-wider border border-void-border-2 transition-all active:scale-95">Skip</button>
				<button onClick={onCancel} className="px-3 py-1.5 text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95">Cancel</button>
			</div>
		</div>
	)
}

export const CommandToolResultWrapper: ResultWrapper<'run_command' | 'run_persistent_command' | 'wait'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const terminalToolsService = accessor.get('ITerminalToolService')
	const toolsService = accessor.get('IToolsService')
	const streamState = useChatThreadsStreamState(threadId)
	const divRef = useRef<HTMLDivElement | null>(null)

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as any, toolMessage.params, accessor)
	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }

	useEffect(() => {
		const attachTerminal = async () => {
			if (streamState?.isRunning !== 'tool' || toolMessage.name !== 'run_command' || toolMessage.type !== 'running_now') return;
			await streamState?.interrupt;
			const container = divRef.current;
			if (!container) return;
			const terminal = terminalToolsService.getTemporaryTerminal((toolMessage.params as any).terminalId);
			if (!terminal) return;
			terminal.attachToElement(container);
			terminal.setVisible(true);
			const resizeObserver = new ResizeObserver((entries) => {
				const height = entries[0].borderBoxSize[0].blockSize;
				const width = entries[0].borderBoxSize[0].inlineSize;
				if (typeof terminal.layout === 'function') terminal.layout({ width, height });
			});
			resizeObserver.observe(container);
			return () => { terminal.detachFromElement(); resizeObserver.disconnect(); }
		}
		attachTerminal()
	}, [terminalToolsService, toolMessage, streamState]);

	if (toolMessage.type === 'success') {
		const { result } = toolMessage
		let msg = "";
		if (toolMessage.name === 'run_command') msg = toolsService.stringOfResult['run_command'](toolMessage.params as any, result as any)
		else if (toolMessage.name === 'run_persistent_command') msg = toolsService.stringOfResult['run_persistent_command'](toolMessage.params as any, result as any)
		else msg = toolsService.stringOfResult['wait'](toolMessage.params as any, result as any)

		if (toolMessage.name === 'run_persistent_command' || toolMessage.name === 'wait') {
			componentParams.info = persistentTerminalNameOfId((toolMessage.params as any).persistentTerminalId)
		}

		componentParams.children = <ToolChildrenWrapper className='whitespace-pre text-nowrap overflow-auto text-sm'>
			<div className='!select-text cursor-auto'><BlockCode initValue={`${msg.trim()}`} language='shellscript' /></div>
		</ToolChildrenWrapper>
	} else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
	} else if (toolMessage.type === 'running_now') {
		if (toolMessage.name === 'run_command') componentParams.children = <div ref={divRef} className='relative h-[300px] text-sm' />
	} else if (toolMessage.type === 'tool_request') {
		if (toolMessage.name === 'run_command' || toolMessage.name === 'run_persistent_command') {
			const command = (toolMessage.params as any).command
			const cwd = (toolMessage.params as any).cwd || null
			return <TerminalCommandApproval command={command} cwd={cwd} threadId={threadId} />
		}
	}

	return <ToolHeaderWrapper {...componentParams} isOpen={toolMessage.name === 'run_command' && toolMessage.type === 'running_now' ? true : undefined} />
}
