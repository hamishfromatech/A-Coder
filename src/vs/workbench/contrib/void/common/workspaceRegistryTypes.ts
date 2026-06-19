/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Summary of a thread within a workspace
 * Lightweight representation for cross-workspace tracking
 */
export interface WorkspaceThreadSummary {
	id: string;
	title: string;           // Truncated to 50 chars
	status: 'idle' | 'streaming' | 'awaiting_user' | 'error';
	lastMessage: string;     // Truncated to 100 chars
	timestamp: number;
	messageCount: number;
}

/**
 * Represents a connected workspace in the multi-workspace registry
 */
export interface WorkspaceConnection {
	id: string;
	name: string;
	path: string;
	status: 'connected' | 'disconnected' | 'inactive';
	lastSeen: number;
	threads: WorkspaceThreadSummary[];
	activeOperations: number;
	color: string;           // UI color for workspace badge
	windowId?: number;        // Electron BrowserWindow id (for cross-window focus)
}

/**
 * Message types for workspace hub communication
 */
export type WorkspaceHubMessage =
	| { type: 'register'; workspace: Omit<WorkspaceConnection, 'status' | 'lastSeen' | 'threads' | 'activeOperations'> }
	| { type: 'unregister'; workspaceId: string }
	| { type: 'heartbeat'; workspaceId: string; threads: WorkspaceThreadSummary[]; activeOperations: number }
	| { type: 'thread-update'; workspaceId: string; thread: WorkspaceThreadSummary }
	| { type: 'full-sync'; workspaceId: string; threads: WorkspaceThreadSummary[]; activeOperations: number };

/**
 * Response types from the workspace hub
 */
export type WorkspaceHubResponse =
	| { type: 'registered'; workspaceId: string }
	| { type: 'workspaces'; workspaces: WorkspaceConnection[] }
	| { type: 'error'; message: string };

/**
 * Registry state containing all connected workspaces
 */
export interface WorkspaceRegistryState {
	workspaces: WorkspaceConnection[];
	lastUpdated: number;
}

/**
 * Remote-control command issued from the Agent Manager to a target workspace window.
 * The hub handles 'focus' main-process-side; all other variants are broadcast on
 * onDidReceiveCommand and acted on by the matching workspace window's dispatcher.
 */
export type WorkspaceRemoteCommand =
	| { type: 'focus'; targetWorkspaceId: string }
	| { type: 'openThread'; targetWorkspaceId: string; threadId: string }
	| { type: 'stop'; targetWorkspaceId: string; threadId: string }
	| { type: 'sendMessage'; targetWorkspaceId: string; threadId?: string; userMessage: string; images?: string[] }
	| { type: 'createTask'; targetWorkspaceId: string; threadId: string; description: string };

/**
 * Service interface for the workspace registry
 * Main process service maintaining the central registry
 */
export interface IWorkspaceRegistryService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeWorkspaces: Event<WorkspaceConnection[]>;

	/**
	 * Fires when a remote-control command is dispatched. Workspace windows filter
	 * for their own targetWorkspaceId; the Agent Manager never subscribes.
	 */
	readonly onDidReceiveCommand: Event<WorkspaceRemoteCommand>;

	/**
	 * Dispatch a remote-control command. 'focus' is handled here (main-process);
	 * all other variants are broadcast on onDidReceiveCommand.
	 */
	sendCommand(command: WorkspaceRemoteCommand): void;

	/**
	 * Get all currently registered workspaces
	 */
	getWorkspaces(): WorkspaceConnection[];

	/**
	 * Register a new workspace connection
	 */
	registerWorkspace(workspace: Omit<WorkspaceConnection, 'status' | 'lastSeen' | 'threads' | 'activeOperations'>): string;

	/**
	 * Unregister a workspace connection
	 */
	unregisterWorkspace(workspaceId: string): void;

	/**
	 * Update workspace heartbeat (called periodically to indicate liveness)
	 */
	heartbeat(workspaceId: string, threads: WorkspaceThreadSummary[], activeOperations: number): void;

	/**
	 * Update a specific thread in a workspace
	 */
	updateThread(workspaceId: string, thread: WorkspaceThreadSummary): void;

	/**
	 * Full sync of workspace state
	 */
	fullSync(workspaceId: string, threads: WorkspaceThreadSummary[], activeOperations: number): void;

	/**
	 * Get a specific workspace by ID
	 */
	getWorkspace(workspaceId: string): WorkspaceConnection | undefined;
}

export const IWorkspaceRegistryService = createDecorator<IWorkspaceRegistryService>('workspaceRegistryService');

/**
 * Service interface for browser-side workspace connection
 * Connects the renderer to the main process hub
 */
export interface IWorkspaceConnectionService {
	readonly _serviceBrand: undefined;

	readonly onDidReceiveWorkspaces: Event<WorkspaceConnection[]>;

	/**
	 * The workspace id of this window, or null if this window is not a
	 * registered workspace (e.g. the Agent Manager auxiliary window).
	 */
	getWorkspaceId(): string | null;

	/**
	 * Get all workspaces from the hub
	 */
	getAllWorkspaces(): Promise<WorkspaceConnection[]>;

	/**
	 * Send a heartbeat to the hub
	 */
	sendHeartbeat(threads: WorkspaceThreadSummary[], activeOperations: number): Promise<void>;

	/**
	 * Update a specific thread
	 */
	updateThread(thread: WorkspaceThreadSummary): Promise<void>;

	/**
	 * Full sync of current workspace state
	 */
	fullSync(threads: WorkspaceThreadSummary[], activeOperations: number): Promise<void>;
}

export const IWorkspaceConnectionService = createDecorator<IWorkspaceConnectionService>('workspaceConnectionService');

/**
 * Service interface for generating thread summaries
 */
export interface IThreadSummaryService {
	readonly _serviceBrand: undefined;

	/**
	 * Generate a lightweight summary from a thread
	 */
	generateSummary(threadId: string): WorkspaceThreadSummary | null;

	/**
	 * Generate summaries for all threads in the current workspace
	 */
	generateAllSummaries(): WorkspaceThreadSummary[];

	/**
	 * Get the current active operations count
	 */
	getActiveOperationsCount(): number;
}

export const IThreadSummaryService = createDecorator<IThreadSummaryService>('threadSummaryService');

// Constants
export const WORKSPACE_HEARTBEAT_INTERVAL = 25000; // 25 seconds
export const WORKSPACE_INACTIVITY_THRESHOLD = 60000; // 60 seconds
export const TITLE_TRUNCATE_LENGTH = 50;
export const MESSAGE_TRUNCATE_LENGTH = 100;

// Workspace colors for UI badges
export const WORKSPACE_COLORS = [
	'#3b82f6', // blue
	'#10b981', // emerald
	'#f59e0b', // amber
	'#ef4444', // red
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#06b6d4', // cyan
	'#84cc16', // lime
];