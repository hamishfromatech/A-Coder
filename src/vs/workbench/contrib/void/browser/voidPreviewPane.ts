/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import * as nls from '../../../../nls.js';
import { EditorExtensions } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mountVoidPreview } from './react/out/void-preview-tsx/index.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';

export class VoidPreviewInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.preview';

	constructor(
		public readonly title: string,
		public readonly content: string,
		public readonly resourceUri: URI,
		public readonly options?: { isImplementationPlan?: boolean, isWalkthrough?: boolean, planId?: string, threadId?: string }
	) {
		super();
	}

	override get typeId(): string {
		return VoidPreviewInput.ID;
	}

	override get resource(): URI {
		return this.resourceUri;
	}

	override getName(): string {
		return this.title;
	}

	override getIcon() {
		return Codicon.eye;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof VoidPreviewInput) {
			return otherInput.resourceUri.toString() === this.resourceUri.toString();
		}

		return false;
	}
}

class VoidPreviewPane extends EditorPane {
	static readonly ID = 'workbench.pane.void.preview';

	private _mountResult: { rerender: (props?: any) => void; dispose: () => void } | undefined;
	private _container: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(VoidPreviewPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		const ownerDocument = parent.ownerDocument;
		this._container = ownerDocument.createElement('div');
		this._container.style.height = '100%';
		this._container.style.width = '100%';

		parent.appendChild(this._container);
	}

	override async setInput(input: VoidPreviewInput, options: any, context: any, token: any): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!this._container) return;

		const ownerDocument = this._container.ownerDocument;

		if (!this._mountResult) {
			this.instantiationService.invokeFunction(accessor => {
				this._mountResult = mountVoidPreview(this._container!, accessor, {
					title: input.title,
					content: input.content,
					...input.options
				}, ownerDocument);
				this._register(toDisposable(() => this._mountResult?.dispose()));
			});
		} else {
			this._mountResult.rerender({ 
				title: input.title, 
				content: input.content,
				...input.options 
			});
		}
	}

	layout(dimension: Dimension): void {
	}
}

// Register Preview pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(VoidPreviewPane, VoidPreviewPane.ID, nls.localize('VoidPreviewPane', "A-Coder IDE Preview Pane")),
	[new SyncDescriptor(VoidPreviewInput)]
);
