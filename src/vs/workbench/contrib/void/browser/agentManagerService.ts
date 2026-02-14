/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMetricsService } from '../common/metricsService.js';
import { IAgentManagerService } from './agentManager.contribution.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
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

export class AgentManagerService extends Disposable implements IAgentManagerService {
	readonly _serviceBrand: undefined;
    private _auxiliaryWindow: IAuxiliaryWindow | null = null;
    private _isOpen: boolean = false;
    private _isOpening: boolean = false;
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
    ) {
        super();
    }

    openFile(uri: URI): void {
        this._onDidOpenFile.fire(uri);
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
            const auxWindow = await this._auxiliaryWindowService.open({
                nativeTitlebar: true,
                disableFullscreen: false,
                bounds: { width: 1200, height: 800 }
            });

            this._auxiliaryWindow = auxWindow;
            this._isOpen = true;
            this._isOpening = false;

            // Wait for styles to load to ensure correct rendering
            await auxWindow.whenStylesHaveLoaded;

            const container = auxWindow.container;
            container.classList.add('void-agent-manager-root');
            container.style.height = '100%';
            container.style.width = '100%';

            // Create a wrapper in the main window context to avoid the restricted createElement in the auxiliary window
            const reactWrapper = mainWindow.document.createElement('div');
            reactWrapper.style.height = '100%';
            reactWrapper.style.width = '100%';
            reactWrapper.style.position = 'relative'; // Ensure absolute children are contained
            reactWrapper.style.overflow = 'hidden'; // Prevent leaking content

            // Add the scoping class to the container
            reactWrapper.classList.add('@@void-scope');

            // HACK: Force the ownerDocument to be the main window's document.
            // React 18 uses container.ownerDocument to create new elements.
            // By overriding this property, we ensure that even when the wrapper is appended
            // to the auxiliary window (which would normally change its ownerDocument),
            // React still sees and uses the main window's document.
            Object.defineProperty(reactWrapper, 'ownerDocument', {
                get: () => mainWindow.document,
                configurable: true
            });

            // Create a child instantiation service for the auxiliary window
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
                        } catch (error) {
                            // ignore
                        }
                    }
                } as IEditorProgressService]
            ));
            this._windowDisposables.add(scopedInstantiationService);

            // Mount React Agent Manager
            scopedInstantiationService.invokeFunction(accessor => {
                // @ts-ignore
                const mountRes = mountAgentManager(reactWrapper, accessor, undefined, mainWindow.document);
                if (mountRes && !!mountRes.dispose) {
                    this._windowDisposables.add(mountRes);
                }
            });

            container.appendChild(reactWrapper);

            // Handle window closure
            this._windowDisposables.add(auxWindow.onUnload(() => {
                this._isOpen = false;
                this._isOpening = false;
                this._auxiliaryWindow = null;
                this._windowDisposables.clear();
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
        // Always open in React tab
        const resource = URI.from({
            scheme: 'void-preview',
            path: filePath
        });

        const input = this._instantiationService.createInstance(VoidPreviewInput, 'Walkthrough: ' + filePath.split('/').pop(), preview, resource, {
            isWalkthrough: true,
            planId: filePath,
            threadId: options?.threadId
        });
        await this._editorService.openEditor(input, { pinned: true });

        // Also fire event for Agent Manager if it's open
        if (this._isOpen) {
            this._onDidOpenWalkthrough.fire({ filePath, preview, threadId: options?.threadId });
        }
    }

    async openContentPreview(title: string, content: string, options?: { isImplementationPlan?: boolean, planId?: string, threadId?: string }): Promise<void> {
        // Always open in React tab
        const resource = URI.from({
            scheme: 'void-preview',
            path: title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        });

        // Check if an editor with this resource is already open to avoid creating duplicate inputs that leak
        const existingEditor = this._editorService.findEditors(resource).find(e => e instanceof VoidPreviewInput);
        
        let input: VoidPreviewInput;
        if (existingEditor) {
            input = existingEditor as VoidPreviewInput;
            // Update the existing input's content/title if needed (assuming VoidPreviewInput supports this or rerender will handle it)
            // For now, we just reuse it.
        } else {
            input = this._instantiationService.createInstance(VoidPreviewInput, title, content, resource, options);
        }

        await this._editorService.openEditor(input, { pinned: true });

        // Also fire event for Agent Manager if it's open
        if (this._isOpen) {
            this._onDidOpenContent.fire({ title, content });
        }
    }

    closeAgentManager(): void {
        if (this._auxiliaryWindow) {
            this._auxiliaryWindow.dispose();
            this._auxiliaryWindow = null;
        }
        this._isOpen = false;
        this._windowDisposables.clear();
    }

    isAgentManagerOpen(): boolean {
        return this._isOpen;
    }
}