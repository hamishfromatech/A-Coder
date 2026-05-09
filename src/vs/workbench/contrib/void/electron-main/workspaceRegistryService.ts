/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IWorkspaceRegistryService, WorkspaceConnection, WorkspaceThreadSummary, WORKSPACE_INACTIVITY_THRESHOLD, WORKSPACE_COLORS } from '../common/workspaceRegistryTypes.js';
import { generateUuid } from '../../../../base/common/uuid.js';

/**
 * Main process service maintaining the central workspace registry.
 * Tracks all connected VS Code windows and their thread states.
 */
export class WorkspaceRegistryService extends Disposable implements IWorkspaceRegistryService {
	_serviceBrand: undefined;

	private readonly workspaces: Map<string, WorkspaceConnection> = new Map();
	private heartbeatCheckInterval: NodeJS.Timeout | null = null;

	private readonly _onDidChangeWorkspaces = this._register(new Emitter<WorkspaceConnection[]>());
	readonly onDidChangeWorkspaces: Event<WorkspaceConnection[]> = this._onDidChangeWorkspaces.event;

	constructor() {
		super();
		this.startHeartbeatCheck();
	}

	/**
	 * Start periodic check for inactive workspaces
	 */
	private startHeartbeatCheck(): void {
		this.heartbeatCheckInterval = setInterval(() => {
			this.checkInactiveWorkspaces();
		}, 10000); // Check every 10 seconds
	}

	/**
	 * Check for workspaces that have missed heartbeats
	 */
	private checkInactiveWorkspaces(): void {
		const now = Date.now();
		let changed = false;

		for (const [id, workspace] of this.workspaces) {
			const timeSinceLastSeen = now - workspace.lastSeen;

			if (timeSinceLastSeen > WORKSPACE_INACTIVITY_THRESHOLD) {
				if (workspace.status === 'connected') {
					workspace.status = 'inactive';
					changed = true;
				} else if (timeSinceLastSeen > WORKSPACE_INACTIVITY_THRESHOLD * 3) {
					// Remove workspaces that have been inactive for 3x the threshold
					this.workspaces.delete(id);
					changed = true;
				}
			}
		}

		if (changed) {
			this.notifyChange();
		}
	}

	/**
	 * Get all currently registered workspaces
	 */
	getWorkspaces(): WorkspaceConnection[] {
		return Array.from(this.workspaces.values());
	}

	/**
	 * Register a new workspace connection
	 */
	registerWorkspace(workspace: Omit<WorkspaceConnection, 'status' | 'lastSeen' | 'threads' | 'activeOperations'>): string {
		const id = workspace.id || generateUuid();
		const colorIndex = this.workspaces.size % WORKSPACE_COLORS.length;

		const newWorkspace: WorkspaceConnection = {
			...workspace,
			id,
			status: 'connected',
			lastSeen: Date.now(),
			threads: [...(workspace as any).threads || []], // Clone to prevent external mutation
			activeOperations: 0,
			color: workspace.color || WORKSPACE_COLORS[colorIndex]
		};

		if (this.workspaces.has(id)) {
			console.warn(`[WorkspaceRegistry] Workspace ID ${id} already exists, rejecting registration to prevent hijacking`);
			throw new Error(`Workspace ID ${id} is already registered`);
		}

		this.workspaces.set(id, newWorkspace);
		this.notifyChange();

		return id;
	}

	/**
	 * Unregister a workspace connection
	 */
	unregisterWorkspace(workspaceId: string): void {
		if (this.workspaces.has(workspaceId)) {
			this.workspaces.delete(workspaceId);
			this.notifyChange();
		}
	}

	/**
	 * Update workspace heartbeat
	 */
	heartbeat(workspaceId: string, threads: WorkspaceThreadSummary[], activeOperations: number): void {
		const workspace = this.workspaces.get(workspaceId);
		if (workspace) {
			workspace.lastSeen = Date.now();
			workspace.status = 'connected';
			workspace.threads = threads;
			workspace.activeOperations = activeOperations;
			this.notifyChange();
		}
	}

	/**
	 * Update a specific thread in a workspace
	 */
	updateThread(workspaceId: string, thread: WorkspaceThreadSummary): void {
		const workspace = this.workspaces.get(workspaceId);
		if (workspace) {
			const threadIndex = workspace.threads.findIndex(t => t.id === thread.id);
			if (threadIndex >= 0) {
				workspace.threads[threadIndex] = thread;
			} else {
				workspace.threads.push(thread);
			}
			this.notifyChange();
		}
	}

	/**
	 * Full sync of workspace state
	 */
	fullSync(workspaceId: string, threads: WorkspaceThreadSummary[], activeOperations: number): void {
		const workspace = this.workspaces.get(workspaceId);
		if (workspace) {
			workspace.lastSeen = Date.now();
			workspace.status = 'connected';
			workspace.threads = threads;
			workspace.activeOperations = activeOperations;
			this.notifyChange();
		}
	}

	/**
	 * Get a specific workspace by ID
	 */
	getWorkspace(workspaceId: string): WorkspaceConnection | undefined {
		return this.workspaces.get(workspaceId);
	}

	/**
	 * Notify listeners of workspace changes
	 */
	private notifyChange(): void {
		this._onDidChangeWorkspaces.fire(this.getWorkspaces());
	}

	override dispose(): void {
		if (this.heartbeatCheckInterval) {
			clearInterval(this.heartbeatCheckInterval);
		}
		super.dispose();
	}
}