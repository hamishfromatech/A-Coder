/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0 See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IMainProcessSettingsService } from './mainProcessSettingsService.js';

/**
 * Type for pending requests that may aggregate responses from multiple renderers
 */
interface PendingRequest {
	resolve: (result: any) => void;
	reject: (error: any) => void;
	responses?: any[];
	aggregate?: (responses: any[]) => any;
}

/**
 * API Channel for IPC communication between main and renderer processes
 * Allows the API server (main process) to call services in the renderer process
 * and allows the renderer to control the API server
 */
export class ApiChannel implements IServerChannel {

	private readonly _onApiRequest = new Emitter<{ method: string, params: any, requestId: string }>();
	private apiServiceManager: any | null = null;
	private settingsService: IMainProcessSettingsService | null = null;

	// Store pending requests
	private readonly pendingRequests = new Map<string, PendingRequest>();
	private requestIdCounter = 0;

	// Track registered renderers for aggregating responses from multiple windows
	private rendererCount = 0;

	constructor() { }

	/**
	 * Set the API service manager (called from main process)
	 */
	setApiServiceManager(manager: any): void {
		this.apiServiceManager = manager;
	}

	/**
	 * Set the settings service (called from main process)
	 */
	setSettingsService(service: IMainProcessSettingsService): void {
		this.settingsService = service;
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
			// Update the settings in the main process settings service
			if (this.settingsService) {
				this.settingsService.updateApiSettings(params);
			}
			// Restart the server with the new settings
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

		// Handle renderer registration - track how many renderers are available
		if (command === 'registerRenderer') {
			this.rendererCount++;
			return { success: true };
		}

		// Handle API response from renderer
		if (command === 'apiResponse') {
			const { requestId, result, error } = params;
			const pending = this.pendingRequests.get(requestId);
			if (pending) {
				// Check if this is an aggregated request waiting for multiple responses
				if (pending.aggregate && pending.responses) {
					pending.responses.push(result);
					if (pending.responses.length >= this.rendererCount) {
						// All renderers have responded, resolve with aggregated result
						this.pendingRequests.delete(requestId);
						pending.resolve(pending.aggregate(pending.responses));
					}
				} else {
					// Single response mode - first response wins
					this.pendingRequests.delete(requestId);
					if (error) {
						pending.reject(new Error(error));
					} else {
						pending.resolve(result);
					}
				}
			}
			return;
		}

		// Forward all other API requests to the renderer process
		const requestId = `req_${++this.requestIdCounter}`;

		// For getWorkspace, aggregate responses from all renderers
		const shouldAggregate = command === 'getWorkspace';

		return new Promise((resolve, reject) => {
			// Store the promise handlers
			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				responses: shouldAggregate ? [] : undefined,
				aggregate: shouldAggregate ? (responses: any[]) => {
					// Aggregate workspace responses from all renderers
					const allFolders: any[] = [];
					const allOpenFiles: any[] = [];
					let activeFile: any = null;

					for (const response of responses) {
						if (response.workspace) {
							if (response.workspace.folders) {
								allFolders.push(...response.workspace.folders);
							}
							if (response.workspace.openFiles) {
								allOpenFiles.push(...response.workspace.openFiles);
							}
							// Use the first non-null active file
							if (!activeFile && response.workspace.activeFile) {
								activeFile = response.workspace.activeFile;
							}
						}
					}

					return {
						workspace: {
							folders: allFolders,
							openFiles: allOpenFiles,
							activeFile,
						}
					};
				} : undefined
			});

			// Fire the event to all renderers
			this._onApiRequest.fire({
				method: command,
				params,
				requestId
			});

			// Set a timeout in case the renderer(s) don't respond
			setTimeout(() => {
				const pending = this.pendingRequests.get(requestId);
				if (pending) {
					this.pendingRequests.delete(requestId);
					// If aggregating and we have at least one response, use that
					if (pending.aggregate && pending.responses && pending.responses.length > 0) {
						resolve(pending.aggregate(pending.responses));
					} else {
						reject(new Error(`Timeout waiting for renderer response to ${command}`));
					}
				}
			}, 30000); // 30 second timeout
		});
	}
}