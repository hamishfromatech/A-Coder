/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CodeActionContext, CodeActionTriggerType } from '../../../../editor/common/languages.js';
import { URI } from '../../../../base/common/uri.js';
import * as dom from '../../../../base/browser/dom.js';
import { voidDevLog } from '../common/devLog.js';

export interface IMarkerCheckService {
	readonly _serviceBrand: undefined;
}

export const IMarkerCheckService = createDecorator<IMarkerCheckService>('markerCheckService');

class MarkerCheckService extends Disposable implements IMarkerCheckService {
	_serviceBrand: undefined;

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		const check = async () => {
			const allMarkers = this._markerService.read();
			const errors = allMarkers.filter(marker => marker.severity === MarkerSeverity.Error);

			if (errors.length > 0) {
				// CPU OPTIMIZATION: Limit to first 3 errors to prevent long-running loops
				const errorsToProcess = errors.slice(0, 3);
				for (const error of errorsToProcess) {

					voidDevLog(`----------------------------------------------`);

					voidDevLog(`${error.resource.fsPath}: ${error.startLineNumber} ${error.message} ${error.severity}`); // ! all errors in the file

					try {
						// Get the text model for the file
						const modelReference = await this._textModelService.createModelReference(error.resource);
						const model = modelReference.object.textEditorModel;

						// Create a range from the marker
						const range = new Range(
							error.startLineNumber,
							error.startColumn,
							error.endLineNumber,
							error.endColumn
						);

						// Get code action providers for this model
						const codeActionProvider = this._languageFeaturesService.codeActionProvider;
						const providers = codeActionProvider.ordered(model);

						if (providers.length > 0) {
							// Request code actions from each provider
							for (const provider of providers) {
								const context: CodeActionContext = {
									trigger: CodeActionTriggerType.Invoke, // keeping 'trigger' since it works
									only: 'quickfix'  // adding this to filter for quick fixes
								};

								const actions = await provider.provideCodeActions(
									model,
									range,
									context,
									CancellationToken.None
								);

								if (actions?.actions?.length) {

									const quickFixes = actions.actions.filter(action => action.isPreferred);  // ! all quickFixes for the error
									// const quickFixesForImports = actions.actions.filter(action => action.isPreferred && action.title.includes('import'));  // ! all possible imports
									// quickFixesForImports

									if (quickFixes.length > 0) {
										voidDevLog('Available Quick Fixes:');
										quickFixes.forEach(action => {
											voidDevLog(`- ${action.title}`);
										});
									}
								}
							}
						}

						// Dispose the model reference
						modelReference.dispose();
					} catch (e) {
						console.error('Error getting quick fixes:', e);
					}
				}
			}
		}
		const { window } = dom.getActiveWindow()
		// CPU OPTIMIZATION: Increased interval from 5s to 60s and only run when window is focused
		const intervalId = window.setInterval(async () => {
			if (dom.getActiveWindow().document.hasFocus()) {
				await check();
			}
		}, 60000);
		// Clear the interval when the service is disposed — without this the
		// timer (and its model references) would outlive the service.
		this._register(toDisposable(() => window.clearInterval(intervalId)));
	}




	fixErrorsInFiles(uris: URI[], contextSoFar: []) {
		// const allMarkers = this._markerService.read();


		// check errors in files


		// give LLM errors in files



	}

	// private _onMarkersChanged = (changedResources: readonly URI[]): void => {
	// 	for (const resource of changedResources) {
	// 		const markers = this._markerService.read({ resource });

	// 		if (markers.length === 0) {
	// 			voidDevLog(`${resource.fsPath}: No diagnostics`);
	// 			continue;
	// 		}

	// 		voidDevLog(`Diagnostics for ${resource.fsPath}:`);
	// 		markers.forEach(marker => this._logMarker(marker));
	// 	}
	// };


}

registerSingleton(IMarkerCheckService, MarkerCheckService, InstantiationType.Delayed);
