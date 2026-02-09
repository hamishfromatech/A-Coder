/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export interface IMainProcessSettingsService {
	readonly _serviceBrand: undefined;

	/**
	 * Get current API settings
	 */
	getApiSettings(): {
		enabled: boolean;
		port: number;
		tokens: string[];
		tunnelUrl?: string;
	};

	/**
	 * Update API settings (called via IPC from renderer process)
	 */
	updateApiSettings(settings: Partial<{
		enabled: boolean;
		port: number;
		tokens: string[];
		tunnelUrl?: string;
	}>): void;

	/**
	 * Event fired when settings change
	 */
	onDidChangeSettings: Event<void>;
}

export const IMainProcessSettingsService = createDecorator<IMainProcessSettingsService>('mainProcessSettingsService');

/**
 * Main Process Settings Service
 * Provides settings for main process services (like the API server)
 */
export class MainProcessSettingsService extends Disposable implements IMainProcessSettingsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSettings = new Emitter<void>();
	readonly onDidChangeSettings: Event<void> = this._onDidChangeSettings.event;

	// Default settings - these will be updated via IPC from renderer process
	private _apiSettings = {
		enabled: false,
		port: 3737,
		tokens: [] as string[],
		tunnelUrl: undefined as string | undefined,
	};

	constructor() {
		super();
	}

	getApiSettings() {
		return { ...this._apiSettings };
	}

	/**
	 * Update API settings (called via IPC from renderer process)
	 */
	updateApiSettings(settings: Partial<{
		enabled: boolean;
		port: number;
		tokens: string[];
		tunnelUrl?: string;
	}>) {
		const oldSettings = { ...this._apiSettings };

		if (settings.enabled !== undefined) this._apiSettings.enabled = settings.enabled;
		if (settings.port !== undefined) this._apiSettings.port = settings.port;
		if (settings.tokens !== undefined) this._apiSettings.tokens = settings.tokens;
		if (settings.tunnelUrl !== undefined) this._apiSettings.tunnelUrl = settings.tunnelUrl;

		// Fire event if settings actually changed
		if (JSON.stringify(oldSettings) !== JSON.stringify(this._apiSettings)) {
			this._onDidChangeSettings.fire();
		}
	}

	override dispose(): void {
		this._onDidChangeSettings.dispose();
		super.dispose();
	}
}

registerSingleton(IMainProcessSettingsService, MainProcessSettingsService, InstantiationType.Eager);
