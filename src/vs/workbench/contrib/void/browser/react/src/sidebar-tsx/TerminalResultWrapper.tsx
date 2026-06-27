/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Folder, Copy as CopyIcon, Check, SkipForward, X } from 'lucide-react';
import { useAccessor, useChatThreadsStreamState } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { BlockCode } from '../util/inputs.js';
import { persistentTerminalNameOfId } from '../../../terminalToolService.js';
import { suggestedAllowPattern } from '../../../../common/terminalApproval.js';
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

export const TerminalCommandApproval = ({ command, cwd, threadId, toolId }: { command: string, cwd?: string | null, threadId: string, toolId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const metricsService = accessor.get('IMetricsService')
	const workspaceContextService = accessor.get('IWorkspaceContextService')
	const voidSettingsService = accessor.get('IVoidSettingsService')

	const workspaceFolders = workspaceContextService.getWorkspace().folders
	const firstFolder = workspaceFolders[0]?.uri.fsPath
	const displayPath = cwd && firstFolder
		? (cwd.startsWith(firstFolder) ? '~' + cwd.slice(firstFolder.length).replace(/^\//, '/') : cwd)
		: cwd || '~'

	const onRun = useCallback(() => {
		try { chatThreadsService.approveLatestToolRequest(threadId, toolId); metricsService.capture('Tool Request Accepted', { tool: 'run_command' }); }
		catch (e) { console.error('Error while approving command:', e) }
	}, [chatThreadsService, metricsService, threadId, toolId])

	// Run this command AND add its base pattern to the allow list so future
	// matching commands auto-run without prompting.
	const onAlwaysAllow = useCallback(() => {
		try {
			const pattern = suggestedAllowPattern(command)
			if (pattern) {
				const current = voidSettingsService.state.globalSettings.terminalAllowPatterns ?? []
				if (!current.includes(pattern)) {
					voidSettingsService.setGlobalSetting('terminalAllowPatterns', [...current, pattern])
				}
			}
			chatThreadsService.approveLatestToolRequest(threadId, toolId)
			metricsService.capture('Tool Request Accepted', { tool: 'run_command', alwaysAllow: true })
		}
		catch (e) { console.error('Error while always-allowing command:', e) }
	}, [chatThreadsService, metricsService, voidSettingsService, command, threadId, toolId])

	const onSkip = useCallback(() => {
		try { chatThreadsService.skipLatestToolRequest(threadId, toolId); metricsService.capture('Tool Request Skipped', { tool: 'run_command' }); }
		catch (e) { console.error('Error while skipping command:', e) }
	}, [chatThreadsService, metricsService, threadId, toolId])

	const onCopy = useCallback(() => { navigator.clipboard.writeText(command) }, [command])

	const onCancel = useCallback(() => {
		try { chatThreadsService.rejectLatestToolRequest(threadId, toolId); metricsService.capture('Tool Request Rejected', { tool: 'run_command' }); }
		catch (e) { console.error('Error while rejecting command:', e) }
	}, [chatThreadsService, metricsService, threadId, toolId])

	const allowPattern = suggestedAllowPattern(command)

	return (
		<div className="rounded-xl overflow-hidden border border-void-border-2 bg-void-bg-4 shadow-lg my-3 mx-1 animate-in fade-in slide-in-from-top-2 duration-300">
			<div className="px-4 py-3 font-mono text-[13px] leading-relaxed relative group">
				<div className="flex items-start gap-2">
					<span className="text-void-accent font-bold opacity-70 mt-1"><Play size={10} strokeWidth={3} /></span>
					<span className="text-void-fg-1 break-all">{command}</span>
				</div>
				<div className="mt-2 text-[10px] text-void-fg-4 font-bold uppercase tracking-wider flex items-center gap-1.5"><Folder size={10} />{displayPath}</div>
			</div>
			<div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-void-border-2 bg-void-bg-2">
				<button onClick={onCopy} className="p-2 text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 rounded-lg transition-all active:scale-90" data-tooltip-id='void-tooltip' data-tooltip-content='Copy command' data-tooltip-place='top'><CopyIcon size={14} /></button>
				{allowPattern && (
					<button
						onClick={onAlwaysAllow}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-void-bg-3 text-void-fg-1 hover:bg-void-bg-4 rounded-lg text-xs font-bold uppercase tracking-wider border border-void-border-2 transition-all active:scale-95"
						data-tooltip-id='void-tooltip'
						data-tooltip-content={`Run now and auto-allow "${allowPattern}" in future`}
						data-tooltip-place='top'
					>
						<Check size={12} strokeWidth={3} />Always allow
					</button>
				)}
				<button onClick={onRun} className="flex items-center gap-2 px-4 py-1.5 bg-[var(--vscode-button-background)] text-white hover:bg-[var(--vscode-button-hoverBackground)] rounded-lg shadow-sm text-xs font-bold uppercase tracking-wider transition-all active:scale-95"><Play size={12} strokeWidth={3} />Run</button>
				<button onClick={onSkip} className="px-3 py-1.5 bg-void-bg-2 text-void-fg-2 hover:bg-void-bg-3 rounded-lg text-xs font-bold uppercase tracking-wider border border-void-border-2 transition-all active:scale-95">Skip</button>
				<button onClick={onCancel} className="px-3 py-1.5 text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95">Cancel</button>
			</div>
		</div>
	)
}

export const CommandToolResultWrapper: ResultWrapper<'run_command' | 'run_persistent_command' | 'wait' | 'check_terminal_status'> = ({ toolMessage, threadId }) => {
	const accessor = useAccessor()
	const terminalToolsService = accessor.get('ITerminalToolService')
	const toolsService = accessor.get('IToolsService')
	const streamState = useChatThreadsStreamState(threadId)
	const divRef = useRef<HTMLDivElement | null>(null)

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name as 'run_command' | 'run_persistent_command' | 'wait' | 'check_terminal_status', toolMessage.params, accessor)
	const isRejected = toolMessage.type === 'rejected'
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError: false, icon: null, isRejected }

	useEffect(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		const attachTerminal = async () => {
			if (streamState?.isRunning !== 'tool' || toolMessage.name !== 'run_command' || toolMessage.type !== 'running_now') return;
			await streamState?.interrupt;
			if (disposed) return;
			const container = divRef.current;
			if (!container) return;
			const runParams = toolMessage.name === 'run_command' ? toolMessage.params : undefined
			const terminal = runParams?.terminalId ? terminalToolsService.getTemporaryTerminal(runParams.terminalId) : undefined
			if (!terminal) return;
			terminal.attachToElement(container);
			terminal.setVisible(true);
			resizeObserver = new ResizeObserver((entries) => {
				const height = entries[0].borderBoxSize[0].blockSize;
				const width = entries[0].borderBoxSize[0].inlineSize;
				if (typeof terminal.layout === 'function') terminal.layout({ width, height });
			});
			resizeObserver.observe(container);
		}
		attachTerminal()
		return () => {
			disposed = true;
			if (resizeObserver) {
				resizeObserver.disconnect();
				resizeObserver = null;
			}
		}
	}, [terminalToolsService, toolMessage, streamState]);

	if (toolMessage.type === 'success') {
		const { result } = toolMessage
		let msg = "";
		if (toolMessage.name === 'run_command') msg = toolsService.stringOfResult['run_command'](toolMessage.params, result)
		else if (toolMessage.name === 'run_persistent_command') msg = toolsService.stringOfResult['run_persistent_command'](toolMessage.params, result)
		else if (toolMessage.name === 'check_terminal_status') msg = toolsService.stringOfResult['check_terminal_status'](toolMessage.params, result)
		else msg = toolsService.stringOfResult['wait'](toolMessage.params, result)

		if (toolMessage.name === 'run_persistent_command' || toolMessage.name === 'wait' || toolMessage.name === 'check_terminal_status') {
			componentParams.info = persistentTerminalNameOfId(toolMessage.params.persistentTerminalId)
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
			const command = toolMessage.params.command
			const cwd = toolMessage.params.cwd || null
			return <TerminalCommandApproval command={command} cwd={cwd} threadId={threadId} toolId={toolMessage.id} />
		}
	}

	return <ToolHeaderWrapper {...componentParams} isOpen={toolMessage.type === 'running_now' ? true : undefined} />
}
