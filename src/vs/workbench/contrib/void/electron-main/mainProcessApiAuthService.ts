/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { randomUUID } from 'crypto';

export interface IMainProcessApiAuthService {
	readonly _serviceBrand: undefined;

	/**
	 * Generate a new API token
	 * @returns The generated token
	 */
	generateToken(): Promise<string>;

	/**
	 * Validate an API token
	 * @param token The token to validate
	 * @returns True if the token is valid
	 */
	validateToken(token: string): boolean;

	/**
	 * Revoke an API token
	 * @param token The token to revoke
	 */
	revokeToken(token: string): Promise<void>;

	/**
	 * Get all active tokens
	 * @returns Array of active tokens
	 */
	getTokens(): string[];

	/**
	 * Set tokens (called from settings service)
	 * @param tokens Array of tokens
	 */
	setTokens(tokens: string[]): void;
}

export const IMainProcessApiAuthService = createDecorator<IMainProcessApiAuthService>('mainProcessApiAuthService');

/**
 * Main Process API Authentication Service
 * Manages API tokens in the main process
 */
export class MainProcessApiAuthService implements IMainProcessApiAuthService {

	declare readonly _serviceBrand: undefined;

	private _tokens: string[] = [];

	constructor() {
	}

	async generateToken(): Promise<string> {
		// Generate a secure random token (UUID v4)
		const token = `acoder_${this.generateUuid()}`;

		// Add to tokens
		this._tokens = [...this._tokens, token];

		return token;
	}

	validateToken(token: string): boolean {
		const isValid = this._tokens.includes(token);
		return isValid;
	}

	async revokeToken(token: string): Promise<void> {
		const index = this._tokens.indexOf(token);
		if (index !== -1) {
			this._tokens = this._tokens.filter(t => t !== token);
		}
	}

	getTokens(): string[] {
		return [...this._tokens];
	}

	setTokens(tokens: string[]): void {
		this._tokens = [...tokens];
	}

	/**
	 * Generate a UUID v4 using Node.js crypto (CSPRNG)
	 */
	private generateUuid(): string {
		// Use Node.js native randomUUID for cryptographically secure tokens
		return randomUUID();
	}
}

registerSingleton(IMainProcessApiAuthService, MainProcessApiAuthService, InstantiationType.Eager);
