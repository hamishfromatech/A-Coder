/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import * as nls from '../../../../nls.js';
import { EditorExtensions } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';


import { mountVoidSettings } from './react/out/void-settings-tsx/index.js'
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';


// refer to preferences.contribution.ts keybindings editor

class VoidSettingsInput extends EditorInput {

	static readonly ID: string = 'workbench.input.void.settings';

	static readonly RESOURCE = URI.from({ // I think this scheme is invalid, it just shuts up TS
		scheme: 'void',  // Custom scheme for our editor (try Schemas.https)
		path: 'settings'
	})
	readonly resource = VoidSettingsInput.RESOURCE;

	constructor(public readonly initialTab?: string) {
		super();
	}

	override get typeId(): string {
		return VoidSettingsInput.ID;
	}

	override getName(): string {
		return nls.localize('voidSettingsInputsName', 'A-Coder\'s Settings');
	}

	override getIcon() {
		return Codicon.checklist // symbol for the actual editor pane
	}

}


class VoidSettingsPane extends EditorPane {
	static readonly ID = 'workbench.test.myCustomPane';

	private _mountResult: { rerender: (props?: any) => void; dispose: () => void } | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(VoidSettingsPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';

		const settingsElt = document.createElement('div');
		settingsElt.style.height = '100%';
		settingsElt.style.width = '100%';

		parent.appendChild(settingsElt);

		// Mount React into the scrollable content
		this.instantiationService.invokeFunction(accessor => {
			this._mountResult = mountVoidSettings(settingsElt, accessor, { initialTab: (this.input as VoidSettingsInput)?.initialTab });
			this._register(toDisposable(() => this._mountResult?.dispose()));
		});
	}

	override async setInput(input: VoidSettingsInput, options: any, context: any, token: any): Promise<void> {
		await super.setInput(input, options, context, token);
		if (this._mountResult && input instanceof VoidSettingsInput) {
			this._mountResult.rerender({ initialTab: input.initialTab });
		}
	}

	layout(dimension: Dimension): void {
		// if (!settingsElt) return
		// settingsElt.style.height = `${dimension.height}px`;
		// settingsElt.style.width = `${dimension.width}px`;
	}


	override get minimumWidth() { return 700 }

}

// register Settings pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(VoidSettingsPane, VoidSettingsPane.ID, nls.localize('VoidSettingsPane', "A-Coder\'s Settings Pane")),
	[new SyncDescriptor(VoidSettingsInput)]
);


// register the gear on the top right
export const VOID_TOGGLE_SETTINGS_ACTION_ID = 'workbench.action.toggleVoidSettings'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TOGGLE_SETTINGS_ACTION_ID,
			title: nls.localize2('voidSettings', "A-Coder: Toggle Settings"),
			icon: Codicon.settingsGear,
			menu: [
				{
					id: MenuId.LayoutControlMenuSubmenu,
					group: 'z_end',
				},
				{
					id: MenuId.LayoutControlMenu,
					when: ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both'),
					group: 'z_end'
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, args?: { tab?: string }): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		const instantiationService = accessor.get(IInstantiationService);

		const initialTab = args?.tab;

		// if is open, focus it or switch tab
		const openEditors = editorService.findEditors(VoidSettingsInput.RESOURCE); // should only have 0 or 1 elements...
		if (openEditors.length !== 0) {
			const openEditor = openEditors[0].editor
			const isCurrentlyOpen = editorService.activeEditor?.resource?.fsPath === openEditor.resource?.fsPath
			
			if (isCurrentlyOpen && !initialTab) {
				await editorService.closeEditors(openEditors)
			} else {
				// If it's already open but we want a specific tab, we need a way to tell the pane.
				// We can re-open it with the new input containing the tab.
				const input = instantiationService.createInstance(VoidSettingsInput, initialTab);
				await editorGroupService.activeGroup.openEditor(input);
			}
			return;
		}


		// else open it
		const input = instantiationService.createInstance(VoidSettingsInput, initialTab);

		await editorGroupService.activeGroup.openEditor(input);
	}
})



export const ACODER_OPEN_SETTINGS_ACTION_ID = 'workbench.action.openA-CoderSettings'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ACODER_OPEN_SETTINGS_ACTION_ID,
			title: nls.localize2('a-coderSettingsAction2', "A-Coder: Open Settings"),
			f1: true,
			icon: Codicon.settingsGear,
		});
	}
	async run(accessor: ServicesAccessor, args?: { tab?: string }): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const initialTab = args?.tab;

		// close all instances if found
		const openEditors = editorService.findEditors(VoidSettingsInput.RESOURCE);
		if (openEditors.length > 0) {
			await editorService.closeEditors(openEditors);
		}

		// then, open one single editor
		const input = instantiationService.createInstance(VoidSettingsInput, initialTab);
		await editorService.openEditor(input);
	}
})

// Back-compat alias for callers still importing the previous identifier name.
export const VOID_OPEN_SETTINGS_ACTION_ID = ACODER_OPEN_SETTINGS_ACTION_ID;





// add to settings gear on bottom left
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	group: '0_command',
	command: {
		id: VOID_TOGGLE_SETTINGS_ACTION_ID,
		title: nls.localize('voidSettingsActionGear', "A-Coder\'s Settings")
	},
	order: 1
});
