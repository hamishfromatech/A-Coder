/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IWorkspaceConnectionService, WorkspaceConnection, WorkspaceThreadSummary, WORKSPACE_HEARTBEAT_INTERVAL } from '../common/workspaceRegistryTypes.js';
import { IThreadSummaryService } from '../common/workspaceRegistryTypes.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { voidDevLog } from '../common/devLog.js';
import { WORKSPACE_REGISTRY_STORAGE_KEY } from '../common/storageKeys.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IChatThreadService } from './chatThreadService.js';

/**
 * Browser-side service that connects to the main process hub.
 * Registers the workspace on init and sends periodic heartbeats.
 */
class WorkspaceConnectionService extends Disposable implements IWorkspaceConnectionService {
	_serviceBrand: undefined;

	private workspaceId: string | null = null;
	private workspaceName: string = '';
	private workspacePath: string = '';
	private heartbeatInterval: NodeJS.Timeout | null = null;
	private channel: IChannel | null = null;
	private readonly windowId: number;

	private readonly _onDidReceiveWorkspaces = this._register(new Emitter<WorkspaceConnection[]>());
	readonly onDidReceiveWorkspaces: Event<WorkspaceConnection[]> = this._onDidReceiveWorkspaces.event;

	constructor(
		@IThreadSummaryService private readonly threadSummaryService: IThreadSummaryService,
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this.windowId = nativeHostService.windowId;
		this.initialize();
	}

	/**
	 * The workspace id of this window, or null if it is not registered
	 * (e.g. the Agent Manager auxiliary window).
	 */
	getWorkspaceId(): string | null {
		return this.workspaceId;
	}

	/**
	 * Initialize the workspace connection
	 */
	private async initialize(): Promise<void> {
		// Auxiliary windows (e.g. the Agent Manager) are not workspaces — they must
		// never register with the hub. They may still read the registry.
		if (this.auxiliaryWindowService.getWindow(this.windowId)) {
			voidDevLog('[WorkspaceConnection] skipping registration — auxiliary window', this.windowId)
			return;
		}
		voidDevLog('[WorkspaceConnection] initialize() starting for window', this.windowId)

		// Get workspace info
		const workspace = this.workspaceContextService.getWorkspace();
		const folders = workspace.folders;

		if (folders.length > 0) {
			this.workspacePath = folders[0].uri.fsPath;
			this.workspaceName = folders[0].name;
		} else {
			this.workspaceName = 'Untitled Workspace';
			this.workspacePath = '';
		}

		// Try to get or create workspace ID from storage
		const storedId = this.storageService.get(WORKSPACE_REGISTRY_STORAGE_KEY, StorageScope.WORKSPACE);
		if (storedId) {
			this.workspaceId = storedId;
		} else {
			this.workspaceId = generateUuid();
			this.storageService.store(WORKSPACE_REGISTRY_STORAGE_KEY, this.workspaceId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		// Register with the hub
		await this.registerWithHub();

		// Start heartbeat
		this.startHeartbeat();

		// Listen for workspace changes
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length > 0) {
				this.workspacePath = folders[0].uri.fsPath;
				this.workspaceName = folders[0].name;
			}
		}));

		// Push live updates to the hub: the 25s heartbeat alone leaves the Agent
		// Manager reading stale thread status for up to 25s after a thread starts
		// or stops streaming. Watch the thread service's own change events and
		// debounce a full sync (500ms) so cross-window status is near-realtime.
		this._register(this.chatThreadService.onDidChangeCurrentThread(() => this.scheduleLiveSync()));
		this._register(this.chatThreadService.onDidChangeStreamState(() => this.scheduleLiveSync()));
		this._register(this.chatThreadService.onDidChangeMessageQueue(() => this.scheduleLiveSync()));
	}

	/**
	 * Debounced full sync driven by thread-service change events. Also acts as
	 * a fallback while a thread is streaming: a periodic tick keeps the
	 * Agent Manager's live indicators fresh even if events are missed.
	 */
	private liveSyncTimeout: NodeJS.Timeout | null = null;
	private scheduleLiveSync(): void {
		if (this.liveSyncTimeout) return;
		this.liveSyncTimeout = setTimeout(() => {
			this.liveSyncTimeout = null;
			void this.fullSync(
				this.threadSummaryService.generateAllSummaries(),
				this.threadSummaryService.getActiveOperationsCount()
			);
		}, 500);
	}

	/**
	 * Register this workspace with the main process hub
	 */
	private async registerWithHub(): Promise<void> {
		if (!this.workspaceId) return;

		try {
			// The hub channel is registered on the main process IPC server.
			this.channel = this.mainProcessService.getChannel('void-channel-workspace-hub');
			voidDevLog('[WorkspaceConnection] got hub channel, registering', { id: this.workspaceId, name: this.workspaceName, windowId: this.windowId })

			if (this.channel) {
				const registeredId = await this.channel.call('register', {
					id: this.workspaceId,
					name: this.workspaceName,
					path: this.workspacePath,
					windowId: this.windowId
				});
				voidDevLog('[WorkspaceConnection] register call returned', registeredId)

				// Push an immediate full sync so the Agent Manager sees this window's
				// current threads without waiting for the first 25s heartbeat.
				await this.fullSync(
					this.threadSummaryService.generateAllSummaries(),
					this.threadSummaryService.getActiveOperationsCount()
				)
				voidDevLog('[WorkspaceConnection] full sync done; registered OK')

				// Listen for workspace updates
				const event = this.channel.listen<WorkspaceConnection[]>('onDidChangeWorkspaces');
				this._register(event(workspaces => {
					this._onDidReceiveWorkspaces.fire(workspaces);
				}));
			}
		} catch (err) {
			console.error('[WorkspaceConnection] Failed to register with hub:', err);
		}
	}

	/**
	 * Start the heartbeat interval
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeatInternal();
		}, WORKSPACE_HEARTBEAT_INTERVAL);
	}

	/**
	 * Internal heartbeat sender
	 */
	private async sendHeartbeatInternal(): Promise<void> {
		if (!this.workspaceId || !this.channel) return;

		try {
			const threads = this.threadSummaryService.generateAllSummaries();
			const activeOperations = this.threadSummaryService.getActiveOperationsCount();

			await this.channel.call('heartbeat', {
				workspaceId: this.workspaceId,
				threads,
				activeOperations
			});
		} catch (err) {
			console.error('[WorkspaceConnection] Heartbeat failed:', err);
		}
	}

	/**
	 * Get all workspaces from the hub
	 */
	async getAllWorkspaces(): Promise<WorkspaceConnection[]> {
		if (!this.channel) {
			return [];
		}

		try {
			return await this.channel.call('getWorkspaces');
		} catch (err) {
			console.error('[WorkspaceConnection] Failed to get workspaces:', err);
			return [];
		}
	}

	/**
	 * Send a heartbeat to the hub
	 */
	async sendHeartbeat(threads: WorkspaceThreadSummary[], activeOperations: number): Promise<void> {
		if (!this.workspaceId || !this.channel) return;

		try {
			await this.channel.call('heartbeat', {
				workspaceId: this.workspaceId,
				threads,
				activeOperations
			});
		} catch (err) {
			console.error('[WorkspaceConnection] Heartbeat failed:', err);
		}
	}

	/**
	 * Update a specific thread
	 */
	async updateThread(thread: WorkspaceThreadSummary): Promise<void> {
		if (!this.workspaceId || !this.channel) return;

		try {
			await this.channel.call('updateThread', {
				workspaceId: this.workspaceId,
				thread
			});
		} catch (err) {
			console.error('[WorkspaceConnection] Update thread failed:', err);
		}
	}

	/**
	 * Full sync of current workspace state
	 */
	async fullSync(threads: WorkspaceThreadSummary[], activeOperations: number): Promise<void> {
		if (!this.workspaceId || !this.channel) return;

		try {
			await this.channel.call('fullSync', {
				workspaceId: this.workspaceId,
				threads,
				activeOperations
			});
		} catch (err) {
			console.error('[WorkspaceConnection] Full sync failed:', err);
		}
	}

	override dispose(): void {
		if (this.liveSyncTimeout) {
			clearTimeout(this.liveSyncTimeout);
			this.liveSyncTimeout = null;
		}
		// Unregister from hub
		if (this.workspaceId && this.channel) {
			this.channel.call('unregister', this.workspaceId).catch(err => {
				console.error('[WorkspaceConnection] Unregister failed:', err);
			});
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}
		super.dispose();
	}
}

registerSingleton(IWorkspaceConnectionService, WorkspaceConnectionService, InstantiationType.Delayed);