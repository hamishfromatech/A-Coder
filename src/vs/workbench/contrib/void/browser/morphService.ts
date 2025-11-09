/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

export const IMorphService = createDecorator<IMorphService>('MorphService');

export interface IMorphService {
	_serviceBrand: undefined;
	
	/**
	 * Apply code changes using Morph Fast Apply API
	 * @param instruction First-person description of the change
	 * @param originalCode Complete original file content
	 * @param updatedCode Code snippet with changes (can use // ... existing code ... markers)
	 * @param model Morph model to use ('morph-v3-fast', 'morph-v3-large', or 'auto')
	 * @returns The applied code from Morph
	 */
	applyCodeChange(params: {
		instruction: string;
		originalCode: string;
		updatedCode: string;
		model?: 'morph-v3-fast' | 'morph-v3-large' | 'auto';
	}): Promise<string>;
}

export class MorphService implements IMorphService {
	_serviceBrand: undefined;

	constructor(
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IMainProcessService private readonly _mainProcessService: IMainProcessService,
	) { }

	async applyCodeChange(params: {
		instruction: string;
		originalCode: string;
		updatedCode: string;
		model?: 'morph-v3-fast' | 'morph-v3-large' | 'auto';
	}): Promise<string> {
		const { instruction, originalCode, updatedCode, model } = params;
		
		console.log('[MorphService] Starting applyCodeChange...');
		console.log('[MorphService] Instruction:', instruction);
		console.log('[MorphService] Original code length:', originalCode.length);
		console.log('[MorphService] Updated code length:', updatedCode.length);
		
		// Get API key and model from settings
		const apiKey = this._settingsService.state.globalSettings.morphApiKey;
		if (!apiKey) {
			console.error('[MorphService] No API key configured');
			throw new Error('Morph API key not configured. Please add your API key in Settings.');
		}
		
		// Use model from parameter or fall back to settings
		const selectedModel = model || this._settingsService.state.globalSettings.morphModel;
		console.log('[MorphService] Using model:', selectedModel);

		// Get IPC channel to electron-main
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		
		console.log('[MorphService] Calling Morph SDK via IPC channel...');
		
		try {
			// Call the main process to use Morph SDK
			const appliedCode = await channel.call('applyCodeChange', {
				instruction,
				originalCode,
				updatedCode,
				filePath: 'temp.ts', // Temp file name, actual path created in main process
				apiKey,
				model: selectedModel
			}) as string;

			console.log('[MorphService] Successfully received applied code, length:', appliedCode.length);
			return appliedCode;
		} catch (error) {
			console.error('[MorphService] IPC call failed:', error);
			throw error;
		}
	}
}

registerSingleton(IMorphService, MorphService, InstantiationType.Delayed);
