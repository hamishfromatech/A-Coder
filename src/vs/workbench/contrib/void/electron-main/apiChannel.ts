/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event, Emitter } from '../../../../base/common/event.js';

/**
 * API Channel for IPC communication between main and renderer processes
 * Allows the API server (main process) to call services in the renderer process
 * and allows the renderer to control the API server
 */
export class ApiChannel implements IServerChannel {

	private readonly _onApiRequest = new Emitter<{ method: string, params: any, requestId: string }>();
	private apiServiceManager: any | null = null;

	// Store pending requests
	private readonly pendingRequests = new Map<string, { resolve: (result: any) => void, reject: (error: any) => void }>();
	private requestIdCounter = 0;

	constructor() { }

	/**
	 * Set the API service manager (called from main process)
	 */
	setApiServiceManager(manager: any): void {
		this.apiServiceManager = manager;
	}

	listen(_: unknown, event: string): Event<any> {
		if (event === 'onApiRequest') {
			return this._onApiRequest.event;
		}
		throw new Error(`Unknown event: ${event}`);
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		// Handle API server control commands
		if (command === 'startApiServer') {
			if (this.apiServiceManager) {
				return this.apiServiceManager.start();
			} else {
				console.error('[ApiChannel] ApiServiceManager not set!');
			}
		}
		if (command === 'stopApiServer') {
			if (this.apiServiceManager) {
				return this.apiServiceManager.stop();
			}
		}
		if (command === 'restartApiServer' && this.apiServiceManager) {
			return this.apiServiceManager.restart();
		}
		if (command === 'updateApiSettings' && this.apiServiceManager) {
			// Update settings and restart if needed
			return this.apiServiceManager.restart();
		}

		// Handle WebSocket broadcast from renderer
		if (command === 'broadcast') {
			if (this.apiServiceManager) {
				this.apiServiceManager.broadcast(params);
				return { success: true };
			}
			return { success: false, reason: 'API server not running' };
		}

		// Handle renderer registration
		if (command === 'registerRenderer') {
			return { success: true };
		}

		// Handle API response from renderer
		if (command === 'apiResponse') {
			const { requestId, result, error } = params;
			const pending = this.pendingRequests.get(requestId);
			if (pending) {
				this.pendingRequests.delete(requestId);
				if (error) {
					pending.reject(new Error(error));
				} else {
					pending.resolve(result);
				}
			}
			return;
		}

		// Forward all other API requests to the renderer process
		const requestId = `req_${++this.requestIdCounter}`;

		return new Promise((resolve, reject) => {
			// Store the promise handlers
			this.pendingRequests.set(requestId, { resolve, reject });

			// Fire the event to the renderer
			this._onApiRequest.fire({
				method: command,
				params,
				requestId
			});

			// Set a timeout in case the renderer doesn't respond
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error(`Timeout waiting for renderer response to ${command}`));
				}
			}, 30000); // 30 second timeout
		});
	}
}
