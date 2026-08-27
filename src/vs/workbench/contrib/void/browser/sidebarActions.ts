/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';


import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';

import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { VOID_VIEW_CONTAINER_ID, VOID_VIEW_ID } from './sidebarPane.js';
import { IMetricsService } from '../common/metricsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VOID_TOGGLE_SETTINGS_ACTION_ID } from './actionIDs.js';
import { VOID_CTRL_L_ACTION_ID } from './actionIDs.js';
import { VOID_OPEN_AGENT_MANAGER_ACTION_ID } from './actionIDs.js';
import { localize2 } from '../../../../nls.js';
import { IChatThreadService, ThreadType } from './chatThreadService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IAgentManagerService } from './agentManager.contribution.js';
import { IMCPModalService } from './mcpModalService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

// ---------- Register commands and keybindings ----------


export const roundRangeToLines = (range: IRange | null | undefined, options: { emptySelectionBehavior: 'null' | 'line' }) => {
	if (!range)
		return null

	// treat as no selection if selection is empty
	if (range.endColumn === range.startColumn && range.endLineNumber === range.startLineNumber) {
		if (options.emptySelectionBehavior === 'null')
			return null
		else if (options.emptySelectionBehavior === 'line')
			return { startLineNumber: range.startLineNumber, startColumn: 1, endLineNumber: range.startLineNumber, endColumn: 1 }
	}

	// IRange is 1-indexed
	const endLine = range.endColumn === 1 ? range.endLineNumber - 1 : range.endLineNumber // e.g. if the user triple clicks, it selects column=0, line=line -> column=0, line=line+1
	const newRange: IRange = {
		startLineNumber: range.startLineNumber,
		startColumn: 1,
		endLineNumber: endLine,
		endColumn: Number.MAX_SAFE_INTEGER
	}
	return newRange
}

// const getContentInRange = (model: ITextModel, range: IRange | null) => {
// 	if (!range)
// 		return null
// 	const content = model.getValueInRange(range)
// 	const trimmedContent = content
// 		.replace(/^\s*\n/g, '') // trim pure whitespace lines from start
// 		.replace(/\n\s*$/g, '') // trim pure whitespace lines from end
// 	return trimmedContent
// }



const VOID_OPEN_SIDEBAR_ACTION_ID = 'void.sidebar.open'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: VOID_OPEN_SIDEBAR_ACTION_ID, title: localize2('voidOpenSidebar', 'A-Coder IDE: Open Sidebar'), f1: true });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)
		await chatThreadsService.focusCurrentChat()
	}
})


// cmd L
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CTRL_L_ACTION_ID,
			f1: true,
			title: localize2('voidCmdL', 'A-Coder IDE: Add Selection to Chat'),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		// Get services
		const commandService = accessor.get(ICommandService)
		const viewsService = accessor.get(IViewsService)
		const metricsService = accessor.get(IMetricsService)
		const editorService = accessor.get(ICodeEditorService)
		const chatThreadService = accessor.get(IChatThreadService)

		metricsService.capture('Ctrl+L', {})

		// capture selection and model before opening the chat panel
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return

		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })

		// open panel
		const wasAlreadyOpen = viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)
		if (!wasAlreadyOpen) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID)
		}

		// Add selection to chat
		// add line selection
		if (selectionRange) {
			editor?.setSelection({
				startLineNumber: selectionRange.startLineNumber,
				endLineNumber: selectionRange.endLineNumber,
				startColumn: 1,
				endColumn: Number.MAX_SAFE_INTEGER
			})
			chatThreadService.addNewStagingSelection({
				type: 'CodeSelection',
				uri: model.uri,
				language: model.getLanguageId(),
				range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
				state: { wasAddedAsCurrentFile: false },
			})
		}
		// add file
		else {
			chatThreadService.addNewStagingSelection({
				type: 'File',
				uri: model.uri,
				language: model.getLanguageId(),
				state: { wasAddedAsCurrentFile: false },
			})
		}

		await chatThreadService.focusCurrentChat()
	}
})


// New chat keybind + menu button
const VOID_CMD_SHIFT_L_ACTION_ID = 'void.cmdShiftL'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CMD_SHIFT_L_ACTION_ID,
			title: 'New Chat',
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension,
			},
			icon: { id: 'add' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), }],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		const metricsService = accessor.get(IMetricsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		const editorService = accessor.get(ICodeEditorService)
		metricsService.capture('Chat Navigation', { type: 'Start New Chat' })

		// get current selections and value to transfer
		const oldThreadId = chatThreadsService.state.currentThreadId
		const oldThread = chatThreadsService.state.allThreads[oldThreadId]

		// Wait for old thread UI with timeout to prevent hanging
		const oldUI = await Promise.race([
			oldThread?.state.mountedInfo?.whenMounted ?? Promise.resolve(null),
			new Promise<null>(resolve => setTimeout(() => resolve(null), 1000))
		])

		const oldSelns = oldThread?.state.stagingSelections
		const oldVal = oldUI?.textAreaRef?.current?.value

		// open and focus new thread
		chatThreadsService.openNewThread()

		// Use focusCurrentChat with its built-in timeout protection
		await chatThreadsService.focusCurrentChat()

		// set new thread values
		const newThreadId = chatThreadsService.state.currentThreadId
		const newThread = chatThreadsService.state.allThreads[newThreadId]

		// Wait for new thread UI with timeout
		const newUI = await Promise.race([
			newThread?.state.mountedInfo?.whenMounted ?? Promise.resolve(null),
			new Promise<null>(resolve => setTimeout(() => resolve(null), 1000))
		])

		chatThreadsService.setCurrentThreadState({ stagingSelections: oldSelns, })
		if (newUI?.textAreaRef?.current && oldVal) newUI.textAreaRef.current.value = oldVal


		// if has selection, add it
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return
		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })
		if (!selectionRange) return
		editor?.setSelection({ startLineNumber: selectionRange.startLineNumber, endLineNumber: selectionRange.endLineNumber, startColumn: 1, endColumn: Number.MAX_SAFE_INTEGER })
		chatThreadsService.addNewStagingSelection({
			type: 'CodeSelection',
			uri: model.uri,
			language: model.getLanguageId(),
			range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
			state: { wasAddedAsCurrentFile: false },
		})
	}
})

// History menu button
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.historyAction',
			title: 'View Past Chats',
			icon: { id: 'history' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), }]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		const chatThreadsService = accessor.get(IChatThreadService)
		const metricsService = accessor.get(IMetricsService)
		const quickInputService = accessor.get(IQuickInputService)
		const notificationService = accessor.get(INotificationService)

		metricsService.capture('Chat Navigation', { type: 'History' })

		// Show a quick-pick of past threads instead of starting a new chat.
		const allThreads = chatThreadsService.state.allThreads
		const currentThreadId = chatThreadsService.state.currentThreadId
		const threadEntries = Object.values(allThreads ?? {})
			.filter((t): t is ThreadType => !!t)
			.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))

		if (threadEntries.length === 0) {
			notificationService.info('No past chats yet. Start a new chat to begin.')
			return
		}

		const labelFor = (thread: ThreadType): string => {
			if (thread.name) return thread.name
			const firstUser = thread.messages.find(m => m.role === 'user')
			const text = firstUser?.content?.trim()
			if (text) return text.length > 60 ? text.slice(0, 60) + '…' : text
			return 'New Chat'
		}

		const picks = threadEntries.map(thread => ({
			id: thread.id,
			label: labelFor(thread),
			description: thread.id === currentThreadId ? 'current' : undefined,
			detail: new Date(thread.lastModified).toLocaleString(),
			picked: thread.id === currentThreadId,
		}))

		const selected = await quickInputService.pick(picks, {
			placeHolder: threadEntries.length === 1 ? 'Open your chat' : 'Select a past chat to open',
		})
		if (!selected || !selected.id || selected.id === currentThreadId) return

		chatThreadsService.switchToThread(selected.id)
		await chatThreadsService.focusCurrentChat()

	}
})

// MCP servers menu
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.mcpServerAction',
			title: 'MCP Servers',
			icon: { id: 'server' },
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', VOID_VIEW_ID),
				order: 1100 // Position it next to Agent Manager
			}]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const mcpModalService = accessor.get(IMCPModalService);

		// Open the React modal
		mcpModalService.openModal();
	}
})

// Settings gear
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.settingsAction',
			title: `A-Coder IDE's Settings`,
			icon: { id: 'settings-gear' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), order: 1200 }]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService)
		commandService.executeCommand(VOID_TOGGLE_SETTINGS_ACTION_ID)
	}
})

// Agent Manager action
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_AGENT_MANAGER_ACTION_ID,
			title: localize2('voidOpenAgentManager', 'Open Agent Manager'),
			icon: { id: 'window' },
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', VOID_VIEW_ID),
				order: 1000
			}],
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.VoidExtension,
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const agentManagerService = accessor.get(IAgentManagerService)

		try {
			await agentManagerService.openAgentManager()
		} catch (error) {
			console.error('Failed to open Agent Manager:', error)
		}
	}
})

// export class TabSwitchListener extends Disposable {

// 	constructor(
// 		onSwitchTab: () => void,
// 		@ICodeEditorService private readonly _editorService: ICodeEditorService,
// 	) {
// 		super()

// 		// when editor switches tabs (models)
// 		const addTabSwitchListeners = (editor: ICodeEditor) => {
// 			this._register(editor.onDidChangeModel(e => {
// 				if (e.newModelUrl?.scheme !== 'file') return
// 				onSwitchTab()
// 			}))
// 		}

// 		const initializeEditor = (editor: ICodeEditor) => {
// 			addTabSwitchListeners(editor)
// 		}

// 		// initialize current editors + any new editors
// 		for (let editor of this._editorService.listCodeEditors()) initializeEditor(editor)
// 		this._register(this._editorService.onCodeEditorAdd(editor => { initializeEditor(editor) }))
// 	}
// }
