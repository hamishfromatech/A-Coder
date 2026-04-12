/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import * as dom from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProactiveLearningService, ProactiveCoachObservation } from './proactiveLearningService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatThreadService } from './chatThreadService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { mountProactiveCoachBubble } from './react/out/void-editor-widgets-tsx/index.js';

export type ProactiveCoachProps = {
	observation: ProactiveCoachObservation;
	onDismiss: () => void;
	onDiscuss: () => void;
};

export class ProactiveCoachContribution extends Disposable implements IEditorContribution, IOverlayWidget {
	public static readonly ID = 'editor.contrib.proactiveCoach';

	// React
	private _rootHTML: HTMLElement;
	private _rerender: (props?: any) => void = () => {};
	private _reactComponentDisposable: IDisposable | null = null;

	// Internal
	private _isVisible = false;
	private _currentObservation: ProactiveCoachObservation | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IProactiveLearningService private readonly _proactiveLearningService: IProactiveLearningService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IChatThreadService private readonly _chatThreadService: IChatThreadService,
		@IVoidSettingsService private readonly _voidSettingsService: IVoidSettingsService,
	) {
		super();

		// Create the container element for React component
		const { root, content } = dom.h('div@root', [
			dom.h('div@content', []),
		]);

		root.style.position = 'absolute';
		root.style.display = 'none';
		root.style.pointerEvents = 'none';
		root.style.zIndex = '1000';
		root.style.top = '16px';
		root.style.right = '16px';

		// Initialize React component
		this._instantiationService.invokeFunction(accessor => {
			if (this._reactComponentDisposable) {
				this._reactComponentDisposable.dispose();
			}
			const res = mountProactiveCoachBubble(content, accessor);
			if (!res) return;

			this._reactComponentDisposable = res;
			this._rerender = res.rerender;

			this._register(this._reactComponentDisposable);
		});

		this._rootHTML = root;

		// Register as overlay widget
		this._editor.addOverlayWidget(this);

		// Listen for observations
		this._register(
			this._proactiveLearningService.onObservation(observation => {
				this._onObservation(observation);
			})
		);

		// Listen for settings changes
		this._register(
			this._voidSettingsService.onDidChangeState(() => {
				const { enableProactiveCoach } = this._voidSettingsService.state.globalSettings;
				if (!enableProactiveCoach) {
					this._hideBubble();
				}
			})
		);

		// Hide when editor loses focus
		this._register(
			this._editor.onDidBlurEditorText(() => {
				this._hideBubble();
			})
		);

		// Reposition on scroll/layout
		this._register(
			this._editor.onDidScrollChange(() => this._updatePosition())
		);
		this._register(
			this._editor.onDidLayoutChange(() => this._updatePosition())
		);
	}

	// IOverlayWidget implementation
	public getId(): string {
		return ProactiveCoachContribution.ID;
	}

	public getDomNode(): HTMLElement {
		return this._rootHTML;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return null; // We position manually
	}

	private _onObservation(observation: ProactiveCoachObservation): void {
		const { enableProactiveCoach } = this._voidSettingsService.state.globalSettings;

		if (!enableProactiveCoach) {
			return;
		}

		// Check if this observation is for the current editor
		const model = this._editor.getModel();
		if (!model || model.uri.toString() !== observation.uri.toString()) {
			return;
		}

		this._currentObservation = observation;
		this._showBubble();
	}

	private _showBubble(): void {
		if (!this._currentObservation) {
			return;
		}

		this._isVisible = true;
		this._rootHTML.style.display = 'block';
		this._rootHTML.style.pointerEvents = 'auto';

		this._rerender({
			observation: this._currentObservation,
			onDismiss: () => {
				this._hideBubble();
				this._proactiveLearningService.dismissObservation();
			},
			onDiscuss: () => {
				this._handleDiscuss();
			},
		});

		this._updatePosition();
	}

	private _hideBubble(): void {
		this._isVisible = false;
		this._rootHTML.style.display = 'none';
		this._rootHTML.style.pointerEvents = 'none';
		this._currentObservation = null;
	}

	private _updatePosition(): void {
		if (!this._isVisible) {
			return;
		}

		const top = 16;
		const right = 16;

		this._rootHTML.style.top = `${top}px`;
		this._rootHTML.style.right = `${right}px`;
	}

	private async _handleDiscuss(): Promise<void> {
		if (!this._currentObservation) {
			return;
		}

		const { uri, lineNumber, message } = this._currentObservation;

		// Hide the bubble
		this._hideBubble();

		// Switch to learn mode
		this._voidSettingsService.setGlobalSetting('chatMode', 'learn');

		// Open the sidebar
		this._viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID);

		// Add the code as a staging selection
		this._chatThreadService.addNewStagingSelection({
			type: 'CodeSelection',
			uri,
			language: this._editor.getModel()?.getLanguageId() ?? 'plaintext',
			range: [lineNumber, lineNumber],
			state: { wasAddedAsCurrentFile: false },
		});

		// Focus the chat
		await this._chatThreadService.focusCurrentChat();

		// Pre-populate a user message in the textarea
		const thread = this._chatThreadService.getCurrentThread();
		const mountedInfo = thread.state.mountedInfo;
		if (mountedInfo) {
			const ui = await Promise.race([
				mountedInfo.whenMounted,
				new Promise<null>(resolve => setTimeout(() => resolve(null), 1000)),
			]);
			if (ui?.textAreaRef?.current) {
				ui.textAreaRef.current.value = `I was writing code and got a suggestion: ${message}`;
			}
		}
	}
}

registerEditorContribution(
	ProactiveCoachContribution.ID,
	ProactiveCoachContribution,
	EditorContributionInstantiation.Eager
);
