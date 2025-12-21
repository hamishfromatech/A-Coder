/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


import { useAccessor, useCommandBarState, useIsDark } from '../util/services.js';

import '../styles.css'
import { useCallback, useEffect, useState, useRef } from 'react';
import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';
import { acceptAllBg, acceptBorder, buttonFontSize, buttonTextColor, rejectAllBg, rejectBg, rejectBorder } from '../../../../common/helpers/colors.js';
import { VoidCommandBarProps } from '../../../voidCommandBarService.js';
import { Check, EllipsisVertical, Menu, MoveDown, MoveLeft, MoveRight, MoveUp, X } from 'lucide-react';
import {
	VOID_GOTO_NEXT_DIFF_ACTION_ID,
	VOID_GOTO_PREV_DIFF_ACTION_ID,
	VOID_GOTO_NEXT_URI_ACTION_ID,
	VOID_GOTO_PREV_URI_ACTION_ID,
	VOID_ACCEPT_FILE_ACTION_ID,
	VOID_REJECT_FILE_ACTION_ID,
	VOID_ACCEPT_ALL_DIFFS_ACTION_ID,
	VOID_REJECT_ALL_DIFFS_ACTION_ID
} from '../../../actionIDs.js';

export const VoidCommandBarMain = ({ uri, editor }: VoidCommandBarProps) => {
	const isDark = useIsDark()

	return <div
		className={`@@void-scope ${isDark ? 'dark' : ''}`}
	>
		<VoidCommandBar uri={uri} editor={editor} />
	</div>
}



export const AcceptAllButtonWrapper = ({ text, onClick, className, ...props }: { text: string, onClick: () => void, className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
	<button
		className={`
			px-3 py-1
			flex items-center gap-1.5
			text-white text-[11px] font-medium text-nowrap
			rounded-md
			cursor-pointer
			transition-all duration-200 hover:brightness-110 active:scale-95
			${className}
		`}
		style={{
			backgroundColor: 'var(--vscode-button-background)',
			color: 'var(--vscode-button-foreground)',
			border: 'none',
		}}
		type='button'
		onClick={onClick}
		{...props}
	>
		{text ? <span>{text}</span> : <Check size={14} strokeWidth={2.5} />}
	</button>
)

export const RejectAllButtonWrapper = ({ text, onClick, className, ...props }: { text: string, onClick: () => void, className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
	<button
		className={`
			px-3 py-1
			flex items-center gap-1.5
			text-white text-[11px] font-medium text-nowrap
			rounded-md
			cursor-pointer
			transition-all duration-200 hover:brightness-110 active:scale-95
			${className}
		`}
		style={{
			backgroundColor: 'var(--vscode-button-secondaryBackground)',
			color: 'var(--vscode-button-secondaryForeground)',
			border: 'none',
		}}
		type='button'
		onClick={onClick}
		{...props}
	>
		{text ? <span>{text}</span> : <X size={14} strokeWidth={2.5} />}
	</button>
)



export const VoidCommandBar = ({ uri, editor }: VoidCommandBarProps) => {
	const accessor = useAccessor()
	const editCodeService = accessor.get('IEditCodeService')
	const editorService = accessor.get('ICodeEditorService')
	const metricsService = accessor.get('IMetricsService')
	const commandService = accessor.get('ICommandService')
	const commandBarService = accessor.get('IVoidCommandBarService')
	const voidModelService = accessor.get('IVoidModelService')
	const keybindingService = accessor.get('IKeybindingService')
	const { stateOfURI: commandBarState, sortedURIs: sortedCommandBarURIs } = useCommandBarState()
	const [showAcceptRejectAllButtons, setShowAcceptRejectAllButtons] = useState(false)

	// latestUriIdx is used to remember place in leftRight
	const _latestValidUriIdxRef = useRef<number | null>(null)

	// i is the current index of the URI in sortedCommandBarURIs
	const i_ = sortedCommandBarURIs.findIndex(e => e.fsPath === uri?.fsPath)
	const currFileIdx = i_ === -1 ? null : i_
	useEffect(() => {
		if (currFileIdx !== null) _latestValidUriIdxRef.current = currFileIdx
	}, [currFileIdx])

	const uriIdxInStepper = currFileIdx !== null ? currFileIdx // use currFileIdx if it exists, else use latestNotNullUriIdxRef
		: _latestValidUriIdxRef.current === null ? null
			: _latestValidUriIdxRef.current < sortedCommandBarURIs.length ? _latestValidUriIdxRef.current
				: null

	// when change URI, scroll to the proper spot
	useEffect(() => {
		setTimeout(() => {
			// check undefined
			if (!uri) return
			const s = commandBarService.stateOfURI[uri.fsPath]
			if (!s) return
			const { diffIdx } = s
			commandBarService.goToDiffIdx(diffIdx ?? 0)
		}, 50)
	}, [uri, commandBarService])

	if (uri?.scheme !== 'file') return null // don't show in editors that we made, they must be files

	// Using service methods directly

	const currDiffIdx = uri ? commandBarState[uri.fsPath]?.diffIdx ?? null : null
	const sortedDiffIds = uri ? commandBarState[uri.fsPath]?.sortedDiffIds ?? [] : []
	const sortedDiffZoneIds = uri ? commandBarState[uri.fsPath]?.sortedDiffZoneIds ?? [] : []

	const isADiffInThisFile = sortedDiffIds.length !== 0
	const isADiffZoneInThisFile = sortedDiffZoneIds.length !== 0
	const isADiffZoneInAnyFile = sortedCommandBarURIs.length !== 0

	const streamState = uri ? commandBarService.getStreamState(uri) : null
	const showAcceptRejectAll = streamState === 'idle-has-changes'

	const nextDiffIdx = commandBarService.getNextDiffIdx(1)
	const prevDiffIdx = commandBarService.getNextDiffIdx(-1)
	const nextURIIdx = commandBarService.getNextUriIdx(1)
	const prevURIIdx = commandBarService.getNextUriIdx(-1)

	const upDownDisabled = prevDiffIdx === null || nextDiffIdx === null
	const leftRightDisabled = prevURIIdx === null || nextURIIdx === null

	// accept/reject if current URI has changes
	const onAcceptFile = () => {
		if (!uri) return
		editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'accept', removeCtrlKs: false, _addToHistory: true })
		metricsService.capture('Accept File', {})
	}
	const onRejectFile = () => {
		if (!uri) return
		editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'reject', removeCtrlKs: false, _addToHistory: true })
		metricsService.capture('Reject File', {})
	}

	const onAcceptAll = () => {
		commandBarService.acceptOrRejectAllFiles({ behavior: 'accept' });
		metricsService.capture('Accept All', {})
		setShowAcceptRejectAllButtons(false);
	}

	const onRejectAll = () => {
		commandBarService.acceptOrRejectAllFiles({ behavior: 'reject' });
		metricsService.capture('Reject All', {})
		setShowAcceptRejectAllButtons(false);
	}



	const _upKeybinding = keybindingService.lookupKeybinding(VOID_GOTO_PREV_DIFF_ACTION_ID);
	const _downKeybinding = keybindingService.lookupKeybinding(VOID_GOTO_NEXT_DIFF_ACTION_ID);
	const _leftKeybinding = keybindingService.lookupKeybinding(VOID_GOTO_PREV_URI_ACTION_ID);
	const _rightKeybinding = keybindingService.lookupKeybinding(VOID_GOTO_NEXT_URI_ACTION_ID);
	const _acceptFileKeybinding = keybindingService.lookupKeybinding(VOID_ACCEPT_FILE_ACTION_ID);
	const _rejectFileKeybinding = keybindingService.lookupKeybinding(VOID_REJECT_FILE_ACTION_ID);
	const _acceptAllKeybinding = keybindingService.lookupKeybinding(VOID_ACCEPT_ALL_DIFFS_ACTION_ID);
	const _rejectAllKeybinding = keybindingService.lookupKeybinding(VOID_REJECT_ALL_DIFFS_ACTION_ID);

	const upKeybindLabel = editCodeService.processRawKeybindingText(_upKeybinding?.getLabel() || '');
	const downKeybindLabel = editCodeService.processRawKeybindingText(_downKeybinding?.getLabel() || '');
	const leftKeybindLabel = editCodeService.processRawKeybindingText(_leftKeybinding?.getLabel() || '');
	const rightKeybindLabel = editCodeService.processRawKeybindingText(_rightKeybinding?.getLabel() || '');
	const acceptFileKeybindLabel = editCodeService.processRawKeybindingText(_acceptFileKeybinding?.getAriaLabel() || '');
	const rejectFileKeybindLabel = editCodeService.processRawKeybindingText(_rejectFileKeybinding?.getAriaLabel() || '');
	const acceptAllKeybindLabel = editCodeService.processRawKeybindingText(_acceptAllKeybinding?.getAriaLabel() || '');
	const rejectAllKeybindLabel = editCodeService.processRawKeybindingText(_rejectAllKeybinding?.getAriaLabel() || '');


	if (!isADiffZoneInAnyFile) return null

	// For pages without a current file index, show a simplified command bar
	if (currFileIdx === null) {
		return (
			<div className="pointer-events-auto">
				<div className="flex bg-void-bg-2 shadow-xl border border-void-border-2 rounded-xl p-1 items-center gap-1">
					<div className="flex items-center px-3 h-8">
						<span className="text-xs font-medium text-void-fg-1 whitespace-nowrap">
							{`${sortedCommandBarURIs.length} file${sortedCommandBarURIs.length === 1 ? '' : 's'} changed`}
						</span>
					</div>
					<button
						className="text-xs font-semibold whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:brightness-110 active:scale-95 transition-all h-8 px-4 rounded-lg"
						onClick={() => commandBarService.goToURIIdx(nextURIIdx)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								commandBarService.goToURIIdx(nextURIIdx);
							}
						}}
					>
						Next <MoveRight className='size-3.5' />
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="pointer-events-auto flex flex-col items-end gap-1.5">


			{/* Accept All / Reject All buttons that appear when the vertical ellipsis is clicked */}
			{showAcceptRejectAllButtons && showAcceptRejectAll && (
				<div className="flex justify-end">
					<div className="inline-flex bg-void-bg-1/95 backdrop-blur-md rounded-xl shadow-2xl border border-void-border-2 p-1 gap-1">
						<AcceptAllButtonWrapper
							text={`Accept All`}
							data-tooltip-id='void-tooltip'
							data-tooltip-content={acceptAllKeybindLabel}
							data-tooltip-delay-show={500}
							onClick={onAcceptAll}
						/>
						<RejectAllButtonWrapper
							text={`Reject All`}
							data-tooltip-id='void-tooltip'
							data-tooltip-content={rejectAllKeybindLabel}
							data-tooltip-delay-show={500}
							onClick={onRejectAll}
						/>
					</div>
				</div>
			)}

			<div className="flex items-center h-10 bg-void-bg-1/95 backdrop-blur-md rounded-xl shadow-2xl border border-void-border-2 p-1 gap-1">

				{/* Diff Navigation Group */}
				<div className="flex items-center h-full px-2 gap-1 border-r border-void-border-2/50 mr-1">
					<button
						className="p-1.5 hover:bg-void-bg-2 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={upDownDisabled}
						onClick={() => commandBarService.goToDiffIdx(prevDiffIdx)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								commandBarService.goToDiffIdx(prevDiffIdx);
							}
						}}
						data-tooltip-id="void-tooltip"
						data-tooltip-content={`${upKeybindLabel ? `${upKeybindLabel}` : ''}`}
						data-tooltip-delay-show={500}
					>
						<MoveUp className='size-3.5 text-void-fg-1' />
					</button>
					<span className={`text-xs font-semibold whitespace-nowrap px-1 min-w-[80px] text-center ${!isADiffInThisFile ? 'text-void-fg-3 font-normal' : 'text-void-fg-1'}`}>
						{isADiffInThisFile
							? `Diff ${(currDiffIdx ?? 0) + 1} of ${sortedDiffIds.length}`
							: streamState === 'streaming'
								? 'No changes yet'
								: 'No changes'
						}

					</span>
					<button
						className="p-1.5 hover:bg-void-bg-2 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={upDownDisabled}
						onClick={() => commandBarService.goToDiffIdx(nextDiffIdx)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								commandBarService.goToDiffIdx(nextDiffIdx);
							}
						}}
						data-tooltip-id="void-tooltip"
						data-tooltip-content={`${downKeybindLabel ? `${downKeybindLabel}` : ''}`}
						data-tooltip-delay-show={500}
					>
						<MoveDown className='size-3.5 text-void-fg-1' />
					</button>
				</div>



				{/* File Navigation Group */}
				<div className="flex items-center h-full px-2 gap-1 border-r border-void-border-2/50 mr-1">
					<button
						className="p-1.5 hover:bg-void-bg-2 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={leftRightDisabled}
						onClick={() => commandBarService.goToURIIdx(prevURIIdx)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								commandBarService.goToURIIdx(prevURIIdx);
							}
						}}
						data-tooltip-id="void-tooltip"
						data-tooltip-content={`${leftKeybindLabel ? `${leftKeybindLabel}` : ''}`}
						data-tooltip-delay-show={500}
					>
						<MoveLeft className='size-3.5 text-void-fg-1' />
					</button>
					<span className="text-xs font-semibold whitespace-nowrap px-1 mx-0.5 text-void-fg-1 min-w-[80px] text-center">
						{currFileIdx !== null
							? `File ${currFileIdx + 1} of ${sortedCommandBarURIs.length}`
							: `${sortedCommandBarURIs.length} file${sortedCommandBarURIs.length === 1 ? '' : 's'}`
						}
					</span>
					<button
						className="p-1.5 hover:bg-void-bg-2 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
						disabled={leftRightDisabled}
						onClick={() => commandBarService.goToURIIdx(nextURIIdx)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								commandBarService.goToURIIdx(nextURIIdx);
							}
						}}
						data-tooltip-id="void-tooltip"
						data-tooltip-content={`${rightKeybindLabel ? `${rightKeybindLabel}` : ''}`}
						data-tooltip-delay-show={500}
					>
						<MoveRight className='size-3.5 text-void-fg-1' />
					</button>
				</div>


				{/* Accept/Reject buttons - only shown when appropriate */}
				{showAcceptRejectAll && (
					<div className='flex items-center gap-1 mr-1'>
						<AcceptAllButtonWrapper
							text={`Accept File`}
							data-tooltip-id='void-tooltip'
							data-tooltip-content={acceptFileKeybindLabel}
							data-tooltip-delay-show={500}
							onClick={onAcceptFile}
							className="h-8"
						/>
						<RejectAllButtonWrapper
							text={`Reject File`}
							data-tooltip-id='void-tooltip'
							data-tooltip-content={rejectFileKeybindLabel}
							data-tooltip-delay-show={500}
							onClick={onRejectFile}
							className="h-8"
						/>
					</div>
				)}
				{/* Triple colon menu button */}
				{showAcceptRejectAll && (
					<button
						className={`p-1.5 hover:bg-void-bg-2 rounded-md transition-all ${showAcceptRejectAllButtons ? 'bg-void-bg-2 text-void-accent' : 'text-void-fg-3 hover:text-void-fg-1'}`}
						onClick={() => setShowAcceptRejectAllButtons(!showAcceptRejectAllButtons)}
					>
						<EllipsisVertical className="size-4" />
					</button>
				)}
			</div>
		</div>
	)
}




