/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { WorkspaceRemoteCommand, IWorkspaceConnectionService } from '../common/workspaceRegistryTypes.js';
import { IChatThreadService } from './chatThreadService.js';

/**
 * Receives remote-control commands broadcast by the hub and dispatches the ones
 * addressed to THIS workspace window to the chat thread service.
 *
 * Auxiliary windows (the Agent Manager) never instantiate this service, so they
 * never act on commands — they only send them.
 */
export interface IWorkspaceCommandDispatcher {
	readonly _serviceBrand: undefined;
}

export const IWorkspaceCommandDispatcher = createDecorator<IWorkspaceCommandDispatcher>('workspaceCommandDispatcher');

class WorkspaceCommandDispatcher extends Disposable implements IWorkspaceCommandDispatcher {
	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
		@IAuxiliaryWindowService auxiliaryWindowService: IAuxiliaryWindowService,
		@IWorkspaceConnectionService connectionService: IWorkspaceConnectionService,
		@IChatThreadService chatThreadService: IChatThreadService
	) {
		super();

		// Never act inside an auxiliary window (the Agent Manager sends, not receives).
		if (auxiliaryWindowService.getWindow(nativeHostService.windowId)) {
			return;
		}

		const channel: IChannel = mainProcessService.getChannel('void-channel-workspace-hub');

		this._register(channel.listen<WorkspaceRemoteCommand>('onCommand')(command => {
			const myWorkspaceId = connectionService.getWorkspaceId();
			if (!myWorkspaceId || command.targetWorkspaceId !== myWorkspaceId) {
				return;
			}
			this.handleCommand(command, chatThreadService);
		}));
	}

	private handleCommand(command: WorkspaceRemoteCommand, chatThreadService: IChatThreadService): void {
		switch (command.type) {
			case 'focus':
				// Handled main-process-side by the hub; nothing to do here.
				return;

			case 'openThread': {
				if (chatThreadService.state.allThreads[command.threadId]) {
					chatThreadService.switchToThread(command.threadId);
				} else {
					console.warn(`[WorkspaceCommandDispatcher] openThread: thread ${command.threadId} not found`);
				}
				return;
			}

			case 'stop': {
				chatThreadService.abortRunning(command.threadId).catch(err => {
					console.error('[WorkspaceCommandDispatcher] stop failed:', err);
				});
				return;
			}

			case 'sendMessage': {
				// v1: text only. Remote image sending is deferred.
				// If no threadId (or an unknown one) is given, open a fresh thread so a
				// non-coder can just "send to this project" without picking a conversation.
				let threadId = command.threadId;
				if (!threadId || !chatThreadService.state.allThreads[threadId]) {
					chatThreadService.openNewThread();
					threadId = chatThreadService.getCurrentThread().id;
				} else {
					chatThreadService.switchToThread(threadId);
				}
				chatThreadService.addUserMessageAndStreamResponse({
					userMessage: command.userMessage,
					threadId
				}).catch(err => {
					console.error('[WorkspaceCommandDispatcher] sendMessage failed:', err);
				});
				return;
			}

			case 'createTask': {
				try {
					chatThreadService.createTask(command.threadId, command.description);
				} catch (err) {
					console.error('[WorkspaceCommandDispatcher] createTask failed:', err);
				}
				return;
			}
		}
	}
}

registerSingleton(IWorkspaceCommandDispatcher, WorkspaceCommandDispatcher, InstantiationType.Delayed);