/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { WorkspaceConnection, WorkspaceRemoteCommand } from '../common/workspaceRegistryTypes.js';

/**
 * Service used by the Agent Manager auxiliary window to read the cross-window
 * registry and to issue remote-control commands targeting other workspace windows.
 *
 * This service only makes sense in the Agent Manager context, but it is a normal
 * singleton so it is reachable from the auxiliary window's scoped instantiation
 * service. Workspace windows do not use it.
 */
export interface IWorkspaceRemoteControlService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires whenever the hub broadcasts an updated workspace list. Also fires once
	 * shortly after construction with the initial pull.
	 */
	readonly onDidReceiveWorkspaces: Event<WorkspaceConnection[]>;

	/**
	 * Pull the current workspace list from the hub.
	 */
	getWorkspaces(): Promise<WorkspaceConnection[]>;

	/**
	 * Send a remote-control command to a target workspace window (focus it, open
	 * a thread, stop a running operation, send a message, or add a task). The hub
	 * routes focus main-process-side and broadcasts the rest to the target window.
	 */
	sendCommand(command: WorkspaceRemoteCommand): Promise<void>;
}

export const IWorkspaceRemoteControlService = createDecorator<IWorkspaceRemoteControlService>('workspaceRemoteControlService');

class WorkspaceRemoteControlService extends Disposable implements IWorkspaceRemoteControlService {
	_serviceBrand: undefined;

	private readonly channel: IChannel;

	private readonly _onDidReceiveWorkspaces = this._register(new Emitter<WorkspaceConnection[]>());
	readonly onDidReceiveWorkspaces: Event<WorkspaceConnection[]> = this._onDidReceiveWorkspaces.event;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super();
		this.channel = mainProcessService.getChannel('void-channel-workspace-hub');

		// Subscribe to hub broadcasts.
		this._register(this.channel.listen<WorkspaceConnection[]>('onDidChangeWorkspaces')(workspaces => {
			this._onDidReceiveWorkspaces.fire(workspaces);
		}));

		// Seed with an immediate pull so the panel isn't empty until the next broadcast.
		this.getWorkspaces().then(workspaces => {
			console.log('[WorkspaceRemoteControl] initial getWorkspaces returned', workspaces.length, 'workspaces')
			this._onDidReceiveWorkspaces.fire(workspaces);
		}).catch(err => {
			console.error('[WorkspaceRemoteControl] Initial getWorkspaces failed:', err);
		});
	}

	getWorkspaces(): Promise<WorkspaceConnection[]> {
		return this.channel.call<WorkspaceConnection[]>('getWorkspaces');
	}

	sendCommand(command: WorkspaceRemoteCommand): Promise<void> {
		return this.channel.call('sendCommand', command).then(() => undefined);
	}
}

registerSingleton(IWorkspaceRemoteControlService, WorkspaceRemoteControlService, InstantiationType.Delayed);