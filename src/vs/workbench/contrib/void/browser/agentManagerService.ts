/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMetricsService } from '../common/metricsService.js';
import { IAgentManagerService } from './agentManager.contribution.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow, IAuxiliaryWindowOpenOptions } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { mountAgentManager } from './react/out/agent-manager-tsx/index.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VoidPreviewInput } from './voidPreviewPane.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceRemoteControlService } from './workspaceRemoteControlService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { implementationPlanningService } from '../common/implementationPlanningService.js';
import { planningService } from '../common/planningService.js';
import { voidDevLog } from '../common/devLog.js';

const AGENT_MANAGER_STATE_KEY = 'void.agentManager.state';

export class AgentManagerService extends Disposable implements IAgentManagerService {
	readonly _serviceBrand: undefined;
	private _auxiliaryWindow: IAuxiliaryWindow | null = null;
	private _isOpen: boolean = false;
	private _isOpening: boolean = false;
	private _mountDisposables = new DisposableStore();
	private _windowDisposables = new DisposableStore();

	private readonly _onDidOpenFile = this._register(new Emitter<URI>());
	readonly onDidOpenFile = this._onDidOpenFile.event;

	private readonly _onDidOpenWalkthrough = this._register(new Emitter<{ filePath: string, preview: string, threadId?: string }>());
	readonly onDidOpenWalkthrough = this._onDidOpenWalkthrough.event;

	private readonly _onDidOpenContent = this._register(new Emitter<{ title: string, content: string }>());
	readonly onDidOpenContent = this._onDidOpenContent.event;

	constructor(
		@IMetricsService private readonly _metricsService: IMetricsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
	}

	openFile(uri: URI): void {
		this._onDidOpenFile.fire(uri);
	}

	private _loadWindowState(): IAuxiliaryWindowOpenOptions | undefined {
		const raw = this._storageService.get(AGENT_MANAGER_STATE_KEY, StorageScope.APPLICATION);
		if (!raw) return undefined;
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	private _saveWindowState(window: IAuxiliaryWindow): void {
		const state = window.createState();
		this._storageService.store(AGENT_MANAGER_STATE_KEY, JSON.stringify(state), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	async openAgentManager(): Promise<void> {
		if (this._isOpen || this._isOpening) {
			if (this._auxiliaryWindow) {
				// Use hostService.focus, not DOM window.focus(): in Electron the
				// latter fails to bring floating (auxiliary) windows to the front,
				// notably on Windows.
				this._hostService.focus(this._auxiliaryWindow.window).catch(() => { /* window may be gone */ });
			}
			voidDevLog('agentManager: open skipped (already open or opening)')
			return;
		}

		this._isOpening = true;
		this._metricsService.capture('Agent Manager', { action: 'open_attempt' });
		voidDevLog('agentManager: open starting')

		try {
			const savedState = this._loadWindowState();
			voidDevLog('agentManager: savedState', savedState ? { hasBounds: !!savedState.bounds, mode: savedState.mode } : null)

			const auxWindow = await this._auxiliaryWindowService.open({
				nativeTitlebar: true,
				disableFullscreen: false,
				bounds: savedState?.bounds ?? { width: 1200, height: 800 },
				mode: savedState?.mode,
				zoomLevel: savedState?.zoomLevel,
			});
			voidDevLog('agentManager: auxiliary window opened')

			this._auxiliaryWindow = auxWindow;
			this._isOpen = true;
			this._isOpening = false;

			// Windows does not reliably bring a freshly opened `window.open` popup
			// to the front the way macOS/Linux do. Raise it via the host service
			// (DOM window.focus() fails to bring floating windows to the front in
			// Electron on Windows) — and do it BEFORE awaiting styles, so a stall in
			// the aux workbench boot can't leave an invisible, unfocused popup with
			// no error.
			this._hostService.focus(auxWindow.window).catch(() => { /* ignore */ })

			// Don't let a hung aux workbench boot (whenStylesHaveLoaded never
			// resolves) block the mount forever and leave a blank invisible
			// window. Race it with a timeout; if styles haven't loaded by then,
			// mount anyway — a brief unstyled flash beats hanging invisibly.
			await Promise.race([
				auxWindow.whenStylesHaveLoaded,
				new Promise<void>(resolve => setTimeout(resolve, 5000)),
			]);
			voidDevLog('agentManager: styles loaded (or timed out)')

			const container = auxWindow.container;
			container.classList.add('void-agent-manager-root');
			container.style.height = '100%';
			container.style.width = '100%';

			// VS Code patches the auxiliary window's document.createElement(ns) to
			// throw, to force elements to be created in the MAIN window's context
			// (so `instanceof HTMLElement` keeps working). React reads ownerDocument
			// lazily and some shared helpers use the global `document`, so the
			// per-element ownerDocument pin below alone is not enough. Delegate the
			// aux document's element factories to the main window's document — this
			// is exactly the "always use the main window" behaviour VS Code expects.
			const auxDoc = container.ownerDocument;
			const mainDoc = mainWindow.document;
			auxDoc.createElement = mainDoc.createElement.bind(mainDoc);
			auxDoc.createElementNS = mainDoc.createElementNS.bind(mainDoc);

			const reactWrapper = mainWindow.document.createElement('div');
			reactWrapper.style.height = '100%';
			reactWrapper.style.width = '100%';
			reactWrapper.style.position = 'relative';
			reactWrapper.style.overflow = 'hidden';

			// React 18 reads container.ownerDocument lazily at render time
			// (getOwnerDocumentFromRootContainer in react-dom-client) to determine
			// which document to use for createElement calls. VS Code auxiliary windows
			// block document.createElement to prevent cross-window instanceof breakage.
			// By pinning ownerDocument to the main window, React always creates elements
			// in the main window context, which is the intended pattern for aux windows.
			Object.defineProperty(reactWrapper, 'ownerDocument', {
				get: () => mainWindow.document,
				configurable: true
			});

			const scopedInstantiationService = this._instantiationService.createChild(new ServiceCollection(
				[IEditorProgressService, {
					_serviceBrand: undefined,
					show: () => ({
						total: () => { },
						worked: () => { },
						done: () => { }
					}),
					showWhile: async (promise: Promise<unknown>) => {
						try {
							await promise;
						} catch {
							// ignore
						}
					}
				} as IEditorProgressService]
			));
			this._windowDisposables.add(scopedInstantiationService);

			scopedInstantiationService.invokeFunction(accessor => {
				// Eagerly start the cross-window reader so the panel has live data
				// before the React tree mounts.
				accessor.get(IWorkspaceRemoteControlService);
				voidDevLog('agentManager: mounting React tree')
				const mountRes = mountAgentManager(reactWrapper, accessor, undefined, mainWindow.document) as { rerender: (props?: unknown) => void; dispose: () => void } | undefined;
				if (mountRes?.dispose) {
					this._mountDisposables.add(mountRes);
				}
			});
			voidDevLog('agentManager: mount complete')

			container.appendChild(reactWrapper);

			this._windowDisposables.add(auxWindow.onUnload(() => {
				this._saveWindowState(auxWindow);
				this._mountDisposables.clear();
				this._windowDisposables.clear();
				this._isOpen = false;
				this._isOpening = false;
				this._auxiliaryWindow = null;
				this._metricsService.capture('Agent Manager', { action: 'closed' });
			}));

			this._metricsService.capture('Agent Manager', { action: 'open_success' });

		} catch (error) {
			voidDevLog('agentManager: open failed', error)
			console.error('Failed to open Agent Manager window:', error);
			// Full reset so a failed open (or a mount throw after the window was
			// already created) doesn't leave _isOpen/_isOpening stuck and silently
			// make every later trigger a no-op. Dispose the partially-opened
			// window and clear all bookkeeping so the next attempt starts clean.
			this._mountDisposables.clear();
			this._windowDisposables.clear();
			if (this._auxiliaryWindow) {
				try { this._auxiliaryWindow.dispose(); } catch { /* ignore */ }
				this._auxiliaryWindow = null;
			}
			this._isOpen = false;
			this._isOpening = false;
			this._notificationService.error(localize('agentManager.openError', 'Failed to open Agent Manager. Please try again.'));
		}
	}

	async openWalkthroughPreview(filePath: string, preview: string, options?: { threadId?: string }): Promise<void> {
		const resource = URI.from({
			scheme: 'void-preview',
			path: filePath
		});

		// Always read the full file fresh so the preview tab shows the entire
		// walkthrough, not the ~1000-char truncated `preview` the tool returns
		// (that truncation is only meant to keep the tool result sent to the
		// LLM small). Fall back to the passed preview only if the read fails.
		let content = preview
		try {
			const fileContent = await this._fileService.readFile(URI.file(filePath))
			const full = fileContent.value.toString()
			if (full.length > 0) content = full
		} catch {
			// keep fallback `preview`
		}

		const input = this._instantiationService.createInstance(VoidPreviewInput, 'Walkthrough: ' + filePath.split('/').pop(), content, resource, {
			isWalkthrough: true,
			planId: filePath,
			threadId: options?.threadId
		});
		await this._editorService.openEditor(input, { pinned: true });

		if (this._isOpen) {
			this._onDidOpenWalkthrough.fire({ filePath, preview: content, threadId: options?.threadId });
		}
	}

	/**
	 * Reads the full contents of a walkthrough file from disk. Used by the
	 * inline walkthrough wrapper to refresh open preview tabs with the
	 * complete (non-truncated) content after an update.
	 */
	async getWalkthroughContent(filePath: string): Promise<string> {
		try {
			const fileContent = await this._fileService.readFile(URI.file(filePath))
			return fileContent.value.toString()
		} catch {
			return ''
		}
	}

	async openContentPreview(title: string, content: string, options?: { isImplementationPlan?: boolean, planId?: string, threadId?: string }): Promise<void> {
		const resource = URI.from({
			scheme: 'void-preview',
			path: title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
		});

		const existingEditor = this._editorService.findEditors(resource).find(e => e instanceof VoidPreviewInput);

		if (existingEditor) {
			await this._editorService.openEditor(existingEditor as VoidPreviewInput, { pinned: true });
		} else {
			const input = this._instantiationService.createInstance(VoidPreviewInput, title, content, resource, options);
			await this._editorService.openEditor(input, { pinned: true });
		}

		if (this._isOpen) {
			this._onDidOpenContent.fire({ title, content });
		}
	}

	approveImplementationPlan(threadId: string): void {
		// Marks the current implementation plan approved, then auto-promotes its
		// steps into a todo list on the shared PlanningService singleton (the
		// same instance the create_todo/update_todo tool handlers use). This
		// means the agent can start executing via update_todo right away — it
		// does NOT need to re-emit the steps with create_todo (saving a large
		// tool call + tokens, and preserving step ids/dependencies/files).
		// Throws if no plan exists for the thread.
		implementationPlanningService.approvePlan(threadId); // throws if no plan
		const plan = implementationPlanningService.getCurrentPlan(threadId)!;
		try {
			planningService.createPlan(
				plan.goal,
				plan.steps.map(s => ({
					id: s.id,
					description: `${s.title} — ${s.description}${s.files.length ? ` (files: ${s.files.join(', ')})` : ''}`,
					dependencies: s.dependencies,
				})),
				threadId
			);
		} catch (e) {
			console.warn('[AgentManagerService] auto-promote implementation plan to todos failed (non-blocking):', e);
		}
	}

	closeAgentManager(): void {
		if (this._auxiliaryWindow) {
			this._auxiliaryWindow.dispose();
			this._auxiliaryWindow = null;
		}
		this._isOpen = false;
		this._mountDisposables.clear();
		this._windowDisposables.clear();
	}

	isAgentManagerOpen(): boolean {
		return this._isOpen;
	}
}
