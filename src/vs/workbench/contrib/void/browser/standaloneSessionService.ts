/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { StandaloneSession } from '../common/chatThreadServiceTypes.js';

const STANDALONE_SESSIONS_KEY = 'void.standaloneSessions';
const ACTIVE_STANDALONE_SESSION_KEY = 'void.activeStandaloneSession';

export interface IStandaloneSessionService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeSessions: Event<StandaloneSession[]>;
	readonly onDidChangeActiveSession: Event<string | null>;

	getSessions(): StandaloneSession[];
	getActiveSession(): StandaloneSession | null;
	createSession(name?: string, workspaceId?: string): StandaloneSession;
	switchToSession(sessionId: string): void;
	deleteSession(sessionId: string): void;
	renameSession(sessionId: string, name: string): void;
	updateSessionWorkspace(sessionId: string, workspaceId: string | null, workspaceName?: string, workspacePath?: string): void;
}

export const IStandaloneSessionService = createDecorator<IStandaloneSessionService>('standaloneSessionService');

class StandaloneSessionService extends Disposable implements IStandaloneSessionService {
	readonly _serviceBrand: undefined;

	private _sessions: StandaloneSession[] = [];
	private _activeSessionId: string | null = null;

	private readonly _onDidChangeSessions = this._register(new Emitter<StandaloneSession[]>());
	readonly onDidChangeSessions: Event<StandaloneSession[]> = this._onDidChangeSessions.event;

	private readonly _onDidChangeActiveSession = this._register(new Emitter<string | null>());
	readonly onDidChangeActiveSession: Event<string | null> = this._onDidChangeActiveSession.event;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._loadSessions();
	}

	private _loadSessions(): void {
		try {
			const sessionsStr = this._storageService.get(STANDALONE_SESSIONS_KEY, StorageScope.APPLICATION);
			if (sessionsStr) {
				const parsed = JSON.parse(sessionsStr);
				if (Array.isArray(parsed)) {
					this._sessions = parsed;
				}
			}
		} catch {
			this._sessions = [];
		}

		// Ensure at least one default session exists
		if (this._sessions.length === 0) {
			this._createDefaultSession();
		}

		// Load active session
		try {
			const activeId = this._storageService.get(ACTIVE_STANDALONE_SESSION_KEY, StorageScope.APPLICATION);
			if (activeId && this._sessions.some(s => s.id === activeId)) {
				this._activeSessionId = activeId;
			} else {
				this._activeSessionId = this._sessions[0]?.id || null;
			}
		} catch {
			this._activeSessionId = this._sessions[0]?.id || null;
		}
	}

	private _saveSessions(): void {
		this._storageService.store(
			STANDALONE_SESSIONS_KEY,
			JSON.stringify(this._sessions),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
		this._onDidChangeSessions.fire(this._sessions);
	}

	private _saveActiveSession(): void {
		if (this._activeSessionId) {
			this._storageService.store(
				ACTIVE_STANDALONE_SESSION_KEY,
				this._activeSessionId,
				StorageScope.APPLICATION,
				StorageTarget.USER
			);
		}
		this._onDidChangeActiveSession.fire(this._activeSessionId);
	}

	private _createDefaultSession(): void {
		const session: StandaloneSession = {
			id: generateUuid(),
			name: 'General',
			createdAt: Date.now(),
			workspaceId: null,
			workspaceName: null,
			workspacePath: null,
		};
		this._sessions = [session];
		this._activeSessionId = session.id;
		this._saveSessions();
		this._saveActiveSession();
	}

	getSessions(): StandaloneSession[] {
		return [...this._sessions];
	}

	getActiveSession(): StandaloneSession | null {
		if (!this._activeSessionId) return null;
		return this._sessions.find(s => s.id === this._activeSessionId) || null;
	}

	createSession(name?: string, workspaceId?: string): StandaloneSession {
		const existingWorkspaceSession = workspaceId 
			? this._sessions.find(s => s.workspaceId === workspaceId)
			: null;
		
		if (existingWorkspaceSession) {
			this.switchToSession(existingWorkspaceSession.id);
			return existingWorkspaceSession;
		}

		const session: StandaloneSession = {
			id: generateUuid(),
			name: name || 'New Session',
			createdAt: Date.now(),
			workspaceId: workspaceId || null,
			workspaceName: null,
			workspacePath: null,
		};

		this._sessions.push(session);
		this._activeSessionId = session.id;
		this._saveSessions();
		this._saveActiveSession();
		return session;
	}

	switchToSession(sessionId: string): void {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) return;

		this._activeSessionId = sessionId;
		this._saveActiveSession();
	}

	deleteSession(sessionId: string): void {
		if (this._sessions.length <= 1) {
			// Don't delete the last session - rename it instead
			const session = this._sessions.find(s => s.id === sessionId);
			if (session) {
				session.name = 'General';
				session.workspaceId = null;
				session.workspaceName = null;
				session.workspacePath = null;
				this._saveSessions();
			}
			return;
		}

		this._sessions = this._sessions.filter(s => s.id !== sessionId);
		
		if (this._activeSessionId === sessionId) {
			this._activeSessionId = this._sessions[0]?.id || null;
			this._saveActiveSession();
		}
		
		this._saveSessions();
	}

	renameSession(sessionId: string, name: string): void {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) return;

		session.name = name;
		this._saveSessions();
	}

	updateSessionWorkspace(sessionId: string, workspaceId: string | null, workspaceName?: string, workspacePath?: string): void {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) return;

		// Don't allow duplicate workspace associations
		if (workspaceId && workspaceId !== session.workspaceId) {
			const existing = this._sessions.find(s => s.workspaceId === workspaceId && s.id !== sessionId);
			if (existing) {
				// Switch to existing session for this workspace
				this.switchToSession(existing.id);
				return;
			}
		}

		session.workspaceId = workspaceId;
		session.workspaceName = workspaceName || null;
		session.workspacePath = workspacePath || null;
		this._saveSessions();
	}
}

registerSingleton(IStandaloneSessionService, StandaloneSessionService, InstantiationType.Delayed);
