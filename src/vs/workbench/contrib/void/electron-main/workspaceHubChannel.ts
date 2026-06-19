/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { IWorkspaceRegistryService } from '../common/workspaceRegistryTypes.js';

/**
 * IPC Channel for workspace hub communication.
 * Allows renderer processes to communicate with the main process registry.
 */
export class WorkspaceHubChannel implements IServerChannel {

	constructor(
		private readonly registryService: IWorkspaceRegistryService
	) { }

	/**
	 * Handle calls from renderer process
	 */
	call<T>(_ctx: any, command: string, arg?: any): Promise<T> {
		switch (command) {
			case 'register':
				return Promise.resolve(this.registryService.registerWorkspace(arg) as T);

			case 'unregister':
				this.registryService.unregisterWorkspace(arg);
				return Promise.resolve(undefined as T);

			case 'heartbeat':
				this.registryService.heartbeat(arg.workspaceId, arg.threads, arg.activeOperations);
				return Promise.resolve(undefined as T);

			case 'updateThread':
				this.registryService.updateThread(arg.workspaceId, arg.thread);
				return Promise.resolve(undefined as T);

			case 'fullSync':
				this.registryService.fullSync(arg.workspaceId, arg.threads, arg.activeOperations);
				return Promise.resolve(undefined as T);

			case 'getWorkspaces':
				return Promise.resolve(this.registryService.getWorkspaces() as T);

			case 'getWorkspace':
				return Promise.resolve(this.registryService.getWorkspace(arg) as T);

			case 'sendCommand':
				this.registryService.sendCommand(arg);
				return Promise.resolve(undefined as T);

			default:
				return Promise.reject(new Error(`Unknown command: ${command}`));
		}
	}

	/**
	 * Handle event subscriptions from renderer process
	 */
	listen<T>(_ctx: any, event: string, arg?: any): Event<T> {
		switch (event) {
			case 'onDidChangeWorkspaces':
				return this.registryService.onDidChangeWorkspaces as Event<T>;

			case 'onCommand':
				return this.registryService.onDidReceiveCommand as Event<T>;

			default:
				throw new Error(`Unknown event: ${event}`);
		}
	}
}