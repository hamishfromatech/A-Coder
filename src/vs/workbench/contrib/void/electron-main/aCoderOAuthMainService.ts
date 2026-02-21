/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { shell, safeStorage } from 'electron';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as http from 'http';
import * as crypto from 'crypto';

/**
 * A-Coder Backend API URL
 * All requests are proxied through this backend which holds the master API key
 */
const ACODER_BACKEND_URL = process.env.ACODER_API_URL || 'https://api.a-coder.dev/v1';

/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'github';

/**
 * Authentication state for A-Coder provider
 */
export interface ACoderAuthState {
	/** Whether the user is authenticated */
	isAuthenticated: boolean;
	/** The user's email address from OAuth */
	userEmail?: string;
	/** The OAuth provider used (google or github) */
	authProvider?: OAuthProvider;
	/** The user ID from A-Coder backend */
	userId?: string;
	/** When the token expires (Unix timestamp in seconds) */
	expiresAt?: number;
}

/**
 * Model listing from A-Coder backend
 */
export interface ACoderModelResponse {
	models: Array<{
		id: string;
		name: string;
		contextLength: number;
		supportsTools: boolean;
		isHidden?: boolean;
	}>;
}

/**
 * Token exchange response from A-Coder backend
 */
interface ACoderTokenResponse {
	sessionToken: string;
	refreshToken: string;
	expiresIn: number; // seconds
	userEmail: string;
	userId: string;
}

/**
 * OAuth state for in-progress flow
 */
interface OAuthFlowState {
	codeVerifier: string;
	state: string;
	resolve?: (result: ACoderTokenResponse) => void;
	reject?: (error: Error) => void;
}

/**
 * Main Process A-Coder OAuth Service
 * Handles OAuth authentication flow with PKCE, secure token storage, and model fetching.
 *
 * Authentication Flow:
 * 1. User clicks "Sign in with Google/GitHub"
 * 2. Service generates PKCE code_verifier and code_challenge
 * 3. Opens browser to A-Coder's OAuth endpoint with PKCE parameters
 * 4. A-Coder backend handles OAuth with Google/GitHub
 * 5. Callback is received via local HTTP server (loopback)
 * 6. A-Coder backend exchanges OAuth code for session token
 * 7. Tokens are stored encrypted using Electron's safeStorage
 * 8. Desktop app uses session token for API requests (proxied through A-Coder backend)
 *
 * Security:
 * - Uses PKCE (RFC 7636) for authorization code flow
 * - Loopback redirect URI (http://127.0.0.1:PORT) per RFC 8252
 * - State parameter for CSRF protection
 * - Tokens encrypted with OS-level encryption (safeStorage)
 * - Master chutes.ai API key never leaves the backend
 */
export interface IACoderOAuthMainService {
	readonly _serviceBrand: undefined;

	/** Current authentication state */
	readonly authState: ACoderAuthState;

	/** Event that fires when authentication state changes */
	readonly onDidChangeAuthState: Event<ACoderAuthState>;

	/** Event that fires when models are updated */
	readonly onDidUpdateModels: Event<ACoderModelResponse>;

	/**
	 * Initiate Google OAuth sign-in flow
	 * Opens a browser window for the user to authenticate
	 * @returns Promise that resolves when authentication is complete
	 */
	initiateGoogleAuth(): Promise<void>;

	/**
	 * Initiate GitHub OAuth sign-in flow
	 * Opens a browser window for the user to authenticate
	 * @returns Promise that resolves when authentication is complete
	 */
	initiateGitHubAuth(): Promise<void>;

	/**
	 * Sign out and clear authentication state
	 * Clears all stored tokens and notifies the backend
	 */
	signOut(): Promise<void>;

	/**
	 * Check if the user is currently authenticated
	 */
	isAuthenticated(): boolean;

	/**
	 * Get the authenticated user's email
	 */
	getUserEmail(): string | undefined;

	/**
	 * Get the session token for API requests
	 * This token is used to authenticate with A-Coder's backend
	 * @returns Session token or null if not authenticated
	 */
	getSessionToken(): string | null;

	/**
	 * Get the user ID from A-Coder backend
	 */
	getUserId(): string | undefined;

	/**
	 * Fetch available models from A-Coder backend
	 * @returns List of available models
	 */
	fetchModels(): Promise<ACoderModelResponse>;

	/**
	 * Refresh the session token using the refresh token
	 * Automatically called when session token is about to expire
	 */
	refreshSessionToken(): Promise<void>;
}

export const IACoderOAuthMainService = createDecorator<IACoderOAuthMainService>('aCoderOAuthMainService');

/**
 * Storage keys for encrypted tokens
 */
const STORAGE_KEY_SESSION_TOKEN = 'void.aCoder.sessionToken';
const STORAGE_KEY_REFRESH_TOKEN = 'void.aCoder.refreshToken';
const STORAGE_KEY_USER_DATA = 'void.aCoder.userData';
const STORAGE_KEY_EXPIRES_AT = 'void.aCoder.expiresAt';

/**
 * Helper to generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
	// Generate code verifier (43-128 characters, base64url encoded)
	const codeVerifier = crypto.randomBytes(32).toString('base64url');

	// Generate code challenge using SHA-256 (S256 method)
	const codeChallenge = crypto
		.createHash('sha256')
		.update(codeVerifier)
		.digest('base64url');

	return { codeVerifier, codeChallenge };
}

/**
 * Helper to encrypt data using safeStorage
 */
function encryptData(data: string): Buffer {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error('Encryption not available on this platform');
	}
	return safeStorage.encryptString(data);
}

/**
 * Helper to decrypt data using safeStorage
 */
function decryptData(data: Buffer): string {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error('Encryption not available on this platform');
	}
	return safeStorage.decryptString(data);
}

/**
 * Implementation of A-Coder OAuth Main Service
 */
export class ACoderOAuthMainService implements IACoderOAuthMainService {
	declare readonly _serviceBrand: undefined;

	private _authState: ACoderAuthState;
	private readonly _onDidChangeAuthState = new Emitter<ACoderAuthState>();
	private readonly _onDidUpdateModels = new Emitter<ACoderModelResponse>();

	// In-memory tokens (loaded from encrypted storage on startup)
	private _sessionToken: string | null = null;
	private _refreshToken: string | null = null;
	private _userId: string | null = null;
	private _expiresAt: number = 0;

	// Local server for OAuth callback
	private _callbackServer: http.Server | null = null;
	private _callbackPort: number = 0;

	// Current OAuth flow state
	private _currentFlow: OAuthFlowState | null = null;

	// Models cache
	private _models: ACoderModelResponse | null = null;

	// Token refresh timer
	private _refreshTimer: NodeJS.Timeout | null = null;

	constructor() {
		// Initialize from encrypted storage
		this._authState = {
			isAuthenticated: false,
		};

		this.loadEncryptedTokens();
		this.startTokenRefreshMonitor();
	}

	get authState(): ACoderAuthState {
		return this._authState;
	}

	get onDidChangeAuthState(): Event<ACoderAuthState> {
		return this._onDidChangeAuthState.event;
	}

	get onDidUpdateModels(): Event<ACoderModelResponse> {
		return this._onDidUpdateModels.event;
	}

	private setAuthState(newState: Partial<ACoderAuthState>): void {
		this._authState = { ...this._authState, ...newState };
		this._onDidChangeAuthState.fire(this._authState);
	}

	/**
	 * Load tokens from encrypted storage (safeStorage)
	 */
	private loadEncryptedTokens(): void {
		try {
			const userData = this.readFromStorage(STORAGE_KEY_USER_DATA);
			const sessionTokenEncrypted = this.readFromStorage(STORAGE_KEY_SESSION_TOKEN);
			const refreshTokenEncrypted = this.readFromStorage(STORAGE_KEY_REFRESH_TOKEN);
			const expiresAtStr = this.readFromStorage(STORAGE_KEY_EXPIRES_AT);

			if (userData && sessionTokenEncrypted && refreshTokenEncrypted) {
				const parsed = JSON.parse(userData);
				this._sessionToken = decryptData(sessionTokenEncrypted);
				this._refreshToken = decryptData(refreshTokenEncrypted);
				this._userId = parsed.userId;
				this._expiresAt = parseInt(expiresAtStr || '0', 10);

				if (this._sessionToken && this._refreshToken) {
					this._authState = {
						isAuthenticated: true,
						userEmail: parsed.userEmail,
						authProvider: parsed.authProvider,
						userId: this._userId,
						expiresAt: this._expiresAt,
					};
					console.log('[ACoderOAuth] Loaded encrypted tokens from storage');
				}
			}
		} catch (e) {
			console.error('[ACoderOAuth] Failed to load encrypted tokens:', e);
		}
	}

	/**
	 * Save tokens to encrypted storage (safeStorage)
	 */
	private saveEncryptedTokens(): void {
		try {
			if (this._sessionToken && this._refreshToken) {
				const userData = JSON.stringify({
					userEmail: this._authState.userEmail,
					userId: this._userId,
					authProvider: this._authState.authProvider,
				});

				this.writeToStorage(STORAGE_KEY_USER_DATA, userData);
				this.writeToStorage(STORAGE_KEY_SESSION_TOKEN, encryptData(this._sessionToken).toString('base64'));
				this.writeToStorage(STORAGE_KEY_REFRESH_TOKEN, encryptData(this._refreshToken).toString('base64'));
				this.writeToStorage(STORAGE_KEY_EXPIRES_AT, this._expiresAt.toString());

				console.log('[ACoderOAuth] Saved tokens to encrypted storage');
			}
		} catch (e) {
			console.error('[ACoderOAuth] Failed to save encrypted tokens:', e);
		}
	}

	/**
	 * Clear all encrypted tokens
	 */
	private clearEncryptedTokens(): void {
		this.removeFromStorage(STORAGE_KEY_SESSION_TOKEN);
		this.removeFromStorage(STORAGE_KEY_REFRESH_TOKEN);
		this.removeFromStorage(STORAGE_KEY_USER_DATA);
		this.removeFromStorage(STORAGE_KEY_EXPIRES_AT);

		this._sessionToken = null;
		this._refreshToken = null;
		this._userId = null;
		this._expiresAt = 0;

		console.log('[ACoderOAuth] Cleared all encrypted tokens');
	}

	/**
	 * Helper to read from app storage (using safeStorage for sensitive data)
	 */
	private readFromStorage(key: string): string | null {
		// For now, use electron-store or similar
		// In production, this should use Electron's safeStorage properly
		// This is a placeholder - implement actual storage
		return null;
	}

	/**
	 * Helper to write to app storage (using safeStorage for sensitive data)
	 */
	private writeToStorage(key: string, value: string): void {
		// For now, use electron-store or similar
		// In production, this should use Electron's safeStorage properly
		// This is a placeholder - implement actual storage
	}

	/**
	 * Helper to remove from app storage
	 */
	private removeFromStorage(key: string): void {
		// For now, use electron-store or similar
		// In production, this should use Electron's safeStorage properly
		// This is a placeholder - implement actual storage
	}

	/**
	 * Start a local HTTP server for OAuth callback
	 * Uses loopback address (127.0.0.1) as per RFC 8252
	 */
	private async startCallbackServer(): Promise<number> {
		return new Promise((resolve, reject) => {
			this._callbackServer = http.createServer((req, res) => {
				const url = new URL(req.url!, `http://${req.headers.host}`);

				if (url.pathname === '/callback') {
					const code = url.searchParams.get('code');
					const state = url.searchParams.get('state');
					const error = url.searchParams.get('error');
					const errorDescription = url.searchParams.get('error_description');

					// Send response to close the browser window
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end(`
						<html>
						<head><title>A-Coder Authentication</title></head>
						<body>
							<script>
								window.close();
							</script>
							<h1>${error ? 'Authentication Failed' : 'Authentication Successful'}</h1>
							<p>${error ? errorDescription : 'You can close this window.'}</p>
						</body>
						</html>
					`);

					if (error) {
						this._currentFlow?.reject?.(new Error(`OAuth error: ${error} - ${errorDescription}`));
					} else if (code && state && this._currentFlow) {
						// Handle the callback
						this.handleOAuthCallback(code, state)
							.then(result => this._currentFlow?.resolve?.(result))
							.catch(error => this._currentFlow?.reject?.(error));
					}

					// Close the server after handling the callback
					setTimeout(() => {
						this._callbackServer?.close();
						this._callbackServer = null;
					}, 1000);
				}
			});

			// Listen on a random port on loopback
			this._callbackServer.listen(0, '127.0.0.1', () => {
				const address = this._callbackServer!.address() as { port: number };
				this._callbackPort = address.port;
				resolve(this._callbackPort);
			});

			this._callbackServer.on('error', reject);
		});
	}

	/**
	 * Initiate OAuth flow for a given provider
	 */
	private async initiateOAuthFlow(provider: OAuthProvider): Promise<void> {
		console.log(`[ACoderOAuth] Initiating ${provider} OAuth...`);

		// Generate PKCE parameters
		const { codeVerifier, codeChallenge } = generatePKCE();
		const state = generateUuid();

		// Start the callback server
		const port = await this.startCallbackServer();
		const redirectUri = `http://127.0.0.1:${port}/callback`;

		// Create a promise for the OAuth result
		const oauthPromise = new Promise<ACoderTokenResponse>((resolve, reject) => {
			this._currentFlow = {
				codeVerifier,
				state,
				resolve,
				reject,
			};
		});

		// Build the OAuth URL that points to A-Coder's backend
		// The backend will handle the actual OAuth with the provider
		const oauthUrl = `${ACODER_BACKEND_URL}/auth/${provider}?` +
			`redirect_uri=${encodeURIComponent(redirectUri)}&` +
			`code_challenge=${codeChallenge}&` +
			`code_challenge_method=S256&` +
			`state=${state}`;

		// Open the browser
		await shell.openExternal(oauthUrl);

		console.log(`[ACoderOAuth] Opening OAuth URL: ${oauthUrl}`);

		// Wait for the callback
		const result = await oauthPromise;

		// Store the tokens
		this._sessionToken = result.sessionToken;
		this._refreshToken = result.refreshToken;
		this._expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn;

		this.saveEncryptedTokens();

		this.setAuthState({
			isAuthenticated: true,
			userEmail: result.userEmail,
			authProvider: provider,
			userId: result.userId,
			expiresAt: this._expiresAt,
		});

		console.log(`[ACoderOAuth] Successfully authenticated as ${result.userEmail}`);
	}

	/**
	 * Handle OAuth callback from the local server
	 * Exchanges the authorization code with A-Coder's backend
	 */
	private async handleOAuthCallback(code: string, state: string): Promise<ACoderTokenResponse> {
		console.log('[ACoderOAuth] Handling OAuth callback...');

		// Verify state for CSRF protection
		if (state !== this._currentFlow?.state) {
			throw new Error('Invalid OAuth state. Possible CSRF attack.');
		}

		// Exchange code for tokens with A-Coder backend
		const response = await fetch(`${ACODER_BACKEND_URL}/auth/exchange`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				code,
				codeVerifier: this._currentFlow.codeVerifier,
				state,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to exchange code: ${error}`);
		}

		const result = await response.json() as ACoderTokenResponse;
		return result;
	}

	/**
	 * Initiate Google OAuth sign-in flow
	 */
	async initiateGoogleAuth(): Promise<void> {
		return this.initiateOAuthFlow('google');
	}

	/**
	 * Initiate GitHub OAuth sign-in flow
	 */
	async initiateGitHubAuth(): Promise<void> {
		return this.initiateOAuthFlow('github');
	}

	/**
	 * Sign out and clear authentication state
	 */
	async signOut(): Promise<void> {
		console.log('[ACoderOAuth] Signing out...');

		// Notify the backend to revoke tokens
		if (this._sessionToken) {
			try {
				await fetch(`${ACODER_BACKEND_URL}/auth/revoke`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this._sessionToken}`,
					},
				});
			} catch (e) {
				console.error('[ACoderOAuth] Failed to revoke token:', e);
			}
		}

		// Clear tokens
		this.clearEncryptedTokens();

		// Clear auth state
		this._authState = {
			isAuthenticated: false,
		};

		// Clear models
		this._models = null;

		// Stop refresh timer
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
			this._refreshTimer = null;
		}

		this._onDidChangeAuthState.fire(this._authState);
	}

	/**
	 * Check if the user is currently authenticated
	 */
	isAuthenticated(): boolean {
		return this._authState.isAuthenticated && !!this._sessionToken;
	}

	/**
	 * Get the authenticated user's email
	 */
	getUserEmail(): string | undefined {
		return this._authState.userEmail;
	}

	/**
	 * Get the session token for API requests
	 */
	getSessionToken(): string | null {
		return this._sessionToken;
	}

	/**
	 * Get the user ID from A-Coder backend
	 */
	getUserId(): string | undefined {
		return this._userId;
	}

	/**
	 * Fetch available models from A-Coder backend
	 */
	async fetchModels(): Promise<ACoderModelResponse> {
		if (!this._sessionToken) {
			throw new Error('Not authenticated. Please sign in first.');
		}

		console.log('[ACoderOAuth] Fetching models from A-Coder backend...');

		const response = await fetch(`${ACODER_BACKEND_URL}/models`, {
			headers: {
				'Authorization': `Bearer ${this._sessionToken}`,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to fetch models: ${error}`);
		}

		const result = await response.json() as ACoderModelResponse;
		this._models = result;
		this._onDidUpdateModels.fire(result);

		console.log(`[ACoderOAuth] Fetched ${result.models.length} models`);
		return result;
	}

	/**
	 * Refresh the session token using the refresh token
	 */
	async refreshSessionToken(): Promise<void> {
		if (!this._refreshToken) {
			throw new Error('No refresh token available. Please sign in again.');
		}

		console.log('[ACoderOAuth] Refreshing session token...');

		const response = await fetch(`${ACODER_BACKEND_URL}/auth/refresh`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				refreshToken: this._refreshToken,
			}),
		});

		if (!response.ok) {
			// Refresh token is invalid, need to sign in again
			this.clearEncryptedTokens();
			this.setAuthState({ isAuthenticated: false });
			throw new Error('Refresh token expired. Please sign in again.');
		}

		const result = await response.json() as ACoderTokenResponse;

		this._sessionToken = result.sessionToken;
		this._refreshToken = result.refreshToken;
		this._expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn;

		this.saveEncryptedTokens();

		this.setAuthState({
			expiresAt: this._expiresAt,
		});

		console.log('[ACoderOAuth] Session token refreshed successfully');
	}

	/**
	 * Start monitoring token expiry and refresh automatically
	 */
	private startTokenRefreshMonitor(): void {
		const checkAndRefresh = async () => {
			if (!this.isAuthenticated()) {
				return;
			}

			const now = Math.floor(Date.now() / 1000);
			const timeUntilExpiry = this._expiresAt - now;

			// Refresh 5 minutes before expiry
			if (timeUntilExpiry <= 300) {
				try {
					await this.refreshSessionToken();
				} catch (e) {
					console.error('[ACoderOAuth] Failed to refresh token:', e);
				}
			}

			// Check again in 1 minute
			this._refreshTimer = setTimeout(checkAndRefresh, 60000);
		};

		// Start checking
		this._refreshTimer = setTimeout(checkAndRefresh, 60000);
	}
}

registerSingleton(IACoderOAuthMainService, ACoderOAuthMainService, InstantiationType.Eager);