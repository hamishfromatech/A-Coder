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
import { implementationPlanningService } from '../common/implementationPlanningService.js';

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
				this._auxiliaryWindow.window.focus();
			}
			return;
		}

		this._isOpening = true;
		this._metricsService.capture('Agent Manager', { action: 'open_attempt' });

		try {
			const savedState = this._loadWindowState();

			const auxWindow = await this._auxiliaryWindowService.open({
				nativeTitlebar: true,
				disableFullscreen: false,
				bounds: savedState?.bounds ?? { width: 1200, height: 800 },
				mode: savedState?.mode,
				zoomLevel: savedState?.zoomLevel,
			});

			this._auxiliaryWindow = auxWindow;
			this._isOpen = true;
			this._isOpening = false;

			await auxWindow.whenStylesHaveLoaded;

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
				const mountRes = mountAgentManager(reactWrapper, accessor, undefined, mainWindow.document) as { rerender: (props?: unknown) => void; dispose: () => void } | undefined;
				if (mountRes?.dispose) {
					this._mountDisposables.add(mountRes);
				}
			});

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
			this._isOpening = false;
			console.error('Failed to open Agent Manager window:', error);
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
		// Delegates to the shared singleton (same instance the create/preview
		// tool handlers use), so the approved flag is visible to
		// execute_implementation_plan. Throws if no plan exists for the thread.
		implementationPlanningService.approvePlan(threadId);
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
