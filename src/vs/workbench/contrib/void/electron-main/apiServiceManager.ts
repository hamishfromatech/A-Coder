/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ApiServer } from './apiServer.js';
import { ApiRouter } from './api/apiRouter.js';
import { ApiRoutes, ApiVersionProvider } from './api/apiRoutes.js';
import { ApiChannel } from './apiChannel.js';

/**
 * API Service Manager
 * Manages the lifecycle of the Mobile API server
 */
export class ApiServiceManager {
	private apiServer: ApiServer | null = null;
	private router: ApiRouter | null = null;
	private apiChannel: ApiChannel;

	constructor(
		private readonly getSettings: () => { enabled: boolean, port: number, tokens: string[], tunnelUrl?: string },
		private readonly validateToken: (token: string) => boolean,
		private readonly getVersion: ApiVersionProvider,
	) {
		this.apiChannel = new ApiChannel();
	}

	/**
	 * Get the API channel for IPC communication
	 */
	getChannel(): IServerChannel {
		return this.apiChannel;
	}

	/**
	 * Start the API server if enabled
	 */
	async start(): Promise<void> {
		const settings = this.getSettings();

		if (!settings.enabled) {
			return;
		}

		if (this.apiServer?.isRunning()) {
			return;
		}

		try {
			// Create server
			this.apiServer = new ApiServer(settings.port, this.validateToken);
			this.router = new ApiRouter();

			// Create routes with renderer call function
			new ApiRoutes(this.router, async (method, params) => {
				return new Promise((resolve, reject) => {
					// Forward to renderer via IPC channel
					this.apiChannel.call(null, method, params)
						.then(resolve)
						.catch(reject);
				});
			}, this.getVersion);

			// Connect router to server
			this.apiServer.onRequest((event) => {
				this.router!.handle(event.req, event.res);
			});

			// Start server
			await this.apiServer.start();
		} catch (err) {
			console.error('[API Service] Failed to start:', err);
			throw err;
		}
	}

	/**
	 * Stop the API server
	 */
	async stop(): Promise<void> {
		if (this.apiServer) {
			await this.apiServer.stop();
			this.apiServer = null;
			this.router = null;
		}
	}

	/**
	 * Restart the API server (e.g., when settings change)
	 */
	async restart(): Promise<void> {
		await this.stop();
		await this.start();
	}

	/**
	 * Broadcast event to WebSocket clients
	 */
	broadcast(event: { type: string, channel: string, event: string, data: any }): void {
		if (this.apiServer) {
			this.apiServer.broadcast(event);
		}
	}
}
