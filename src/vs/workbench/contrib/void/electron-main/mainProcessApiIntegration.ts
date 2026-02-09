/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ApiServiceManager } from './apiServiceManager.js';
import { IMainProcessSettingsService } from './mainProcessSettingsService.js';
import { IMainProcessApiAuthService } from './mainProcessApiAuthService.js';

export const IMainProcessApiIntegration = createDecorator<IMainProcessApiIntegration>('mainProcessApiIntegration');

export interface IMainProcessApiIntegration {
	readonly _serviceBrand: undefined;
	getApiServiceManager(): ApiServiceManager | null;
}

/**
 * Main Process API Integration
 * Manages the API server lifecycle in the main process
 */
export class MainProcessApiIntegration extends Disposable implements IMainProcessApiIntegration {

	declare readonly _serviceBrand: undefined;

	private apiServiceManager: ApiServiceManager | null = null;

	constructor(
		@IMainProcessSettingsService private readonly settingsService: IMainProcessSettingsService,
		@IMainProcessApiAuthService private readonly apiAuthService: IMainProcessApiAuthService,
	) {
		super();

		// Initialize API service manager
		this.initializeApiServer();

		// Listen for settings changes
		this._register(this.settingsService.onDidChangeSettings(() => {
			this.handleSettingsChange();
		}));
	}

	private async initializeApiServer() {
		// Get initial settings and sync tokens to auth service
		const settings = this.settingsService.getApiSettings();
		this.apiAuthService.setTokens(settings.tokens);

		// Create API service manager with dynamic settings function
		this.apiServiceManager = new ApiServiceManager(
			() => this.settingsService.getApiSettings(),
			(token: string) => this.apiAuthService.validateToken(token)
		);

		// Start if enabled
		if (settings.enabled) {
			try {
				await this.apiServiceManager.start();
			} catch (err) {
				console.error('[API Integration] Failed to start API server:', err);
			}
		}
	}

	private async handleSettingsChange() {
		if (!this.apiServiceManager) {
			return;
		}

		const settings = this.settingsService.getApiSettings();

		// Sync tokens to the auth service
		this.apiAuthService.setTokens(settings.tokens);

		if (settings.enabled) {
			try {
				// Restart server to pick up new settings
				await this.apiServiceManager.restart();
			} catch (err) {
				console.error('[API Integration] Failed to restart API server:', err);
			}
		} else {
			try {
				await this.apiServiceManager.stop();
			} catch (err) {
				console.error('[API Integration] Failed to stop API server:', err);
			}
		}
	}

	override dispose(): void {
		if (this.apiServiceManager) {
			this.apiServiceManager.stop();
		}
		super.dispose();
	}

	getApiServiceManager(): ApiServiceManager | null {
		return this.apiServiceManager;
	}
}
