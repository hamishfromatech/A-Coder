/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

/**
 * Authentication state for A-Coder provider
 */
export interface ACoderAuthState {
	/** Whether the user is authenticated */
	isAuthenticated: boolean;
	/** The user's email address from OAuth */
	userEmail?: string;
	/** The OAuth provider used (google or github) */
	authProvider?: 'google' | 'github';
	/** The user ID from A-Coder backend */
	userId?: string;
	/** When the token expires (Unix timestamp in seconds) */
	expiresAt?: number;
}

/**
 * Model information from A-Coder backend
 */
export interface ACoderModelInfo {
	id: string;
	name: string;
	contextLength: number;
	supportsTools: boolean;
	isHidden?: boolean;
}

/**
 * Service for managing A-Coder OAuth authentication.
 *
 * This is the browser-side service that communicates with the main process.
 * The actual OAuth flow, token management, and secure storage happen in the main process.
 *
 * Authentication Flow:
 * 1. User clicks "Sign in with Google/GitHub" in UI
 * 2. Browser service calls main process to initiate OAuth
 * 3. Main process opens browser for OAuth flow
 * 4. Main process handles callback and stores encrypted tokens
 * 5. Main process notifies browser of state change
 * 6. Browser service updates UI and provides session token for API requests
 */
export interface IACoderOAuthService {
	readonly _serviceBrand: undefined;

	/** Current authentication state */
	readonly authState: ACoderAuthState;

	/** Event that fires when authentication state changes */
	readonly onDidChangeAuthState: Event<ACoderAuthState>;

	/** Event that fires when models are updated */
	readonly onDidUpdateModels: Event<ACoderModelInfo[]>;

	/**
	 * Initiate Google OAuth sign-in flow
	 * Opens a browser window for the user to authenticate
	 */
	initiateGoogleAuth(): Promise<void>;

	/**
	 * Initiate GitHub OAuth sign-in flow
	 * Opens a browser window for the user to authenticate
	 */
	initiateGitHubAuth(): Promise<void>;

	/**
	 * Sign out and clear authentication state
	 */
	signOut(): Promise<void>;

	/**
	 * Check if the user is currently authenticated
	 */
	isAuthenticated(): boolean;

	/**
	 * Get the authenticated user's email
	 * Returns undefined if not authenticated
	 */
	getUserEmail(): string | undefined;

	/**
	 * Get the user ID from A-Coder backend
	 * Returns undefined if not authenticated
	 */
	getUserId(): string | undefined;

	/**
	 * Get the session token for API requests
	 * This token is used to authenticate with A-Coder's backend
	 * which proxies requests to chutes.ai with the master API key
	 */
	getSessionToken(): string | null;

	/**
	 * Fetch available models from A-Coder backend
	 * @returns List of available models
	 */
	fetchModels(): Promise<ACoderModelInfo[]>;

	/**
	 * Get cached models if available
	 * Returns null if models haven't been fetched yet
	 */
	getCachedModels(): ACoderModelInfo[] | null;
}

export const IACoderOAuthService = createDecorator<IACoderOAuthService>('aCoderOAuthService');

// Import main service interface after this interface is defined to avoid circular dependency
import { IACoderOAuthMainService } from '../electron-main/aCoderOAuthMainService.js';
import type { ACoderModelResponse } from '../electron-main/aCoderOAuthMainService.js';

/**
 * Implementation of A-Coder OAuth service (browser-side)
 * Communicates with main process via IPC for actual OAuth operations
 */
export class ACoderOAuthService implements IACoderOAuthService {
	declare readonly _serviceBrand: undefined;

	private _authState: ACoderAuthState;
	private readonly _onDidChangeAuthState = new Emitter<ACoderAuthState>();
	private readonly _onDidUpdateModels = new Emitter<ACoderModelInfo[]>();

	// Models cache
	private _models: ACoderModelInfo[] | null = null;

	constructor(
		@IACoderOAuthMainService private readonly _mainService: IACoderOAuthMainService,
	) {
		// Initialize from main service state
		this._authState = { ..._mainService.authState };

		// Listen for state changes from main process
		_mainService.onDidChangeAuthState(state => {
			this._authState = { ...state };
			this._onDidChangeAuthState.fire(this._authState);
		});

		// Listen for model updates from main process
		_mainService.onDidUpdateModels((response: ACoderModelResponse) => {
			this._models = response.models;
			this._onDidUpdateModels.fire(this._models || []);
		});
	}

	get authState(): ACoderAuthState {
		return this._authState;
	}

	get onDidChangeAuthState(): Event<ACoderAuthState> {
		return this._onDidChangeAuthState.event;
	}

	get onDidUpdateModels(): Event<ACoderModelInfo[]> {
		return this._onDidUpdateModels.event;
	}

	/**
	 * Initiate Google OAuth sign-in flow
	 */
	async initiateGoogleAuth(): Promise<void> {
		console.log('[ACoderOAuth] Initiating Google OAuth...');
		return this._mainService.initiateGoogleAuth();
	}

	/**
	 * Initiate GitHub OAuth sign-in flow
	 */
	async initiateGitHubAuth(): Promise<void> {
		console.log('[ACoderOAuth] Initiating GitHub OAuth...');
		return this._mainService.initiateGitHubAuth();
	}

	/**
	 * Sign out and clear authentication state
	 */
	async signOut(): Promise<void> {
		console.log('[ACoderOAuth] Signing out...');
		return this._mainService.signOut();
	}

	/**
	 * Check if the user is currently authenticated
	 */
	isAuthenticated(): boolean {
		return this._mainService.isAuthenticated();
	}

	/**
	 * Get the authenticated user's email
	 */
	getUserEmail(): string | undefined {
		return this._mainService.getUserEmail();
	}

	/**
	 * Get the user ID from A-Coder backend
	 */
	getUserId(): string | undefined {
		return this._mainService.getUserId();
	}

	/**
	 * Get the session token for API requests
	 */
	getSessionToken(): string | null {
		return this._mainService.getSessionToken();
	}

	/**
	 * Fetch available models from A-Coder backend
	 */
	async fetchModels(): Promise<ACoderModelInfo[]> {
		const response = await this._mainService.fetchModels();
		this._models = response.models;
		return this._models;
	}

	/**
	 * Get cached models if available
	 */
	getCachedModels(): ACoderModelInfo[] | null {
		return this._models;
	}
}

// Register as a singleton
registerSingleton(IACoderOAuthService, ACoderOAuthService, InstantiationType.Delayed);