/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { voidDevLog } from '../common/devLog.js';

export const IMorphService = createDecorator<IMorphService>('MorphService');

export interface IMorphService {
	_serviceBrand: undefined;

	/**
	 * Gather context using Morph Fast Context (warpGrep) API
	 * @param query Search query
	 * @param repoRoot Root directory of the repository
	 * @param token Optional cancellation token; when cancelled the call rejects
	 *   locally and best-effort asks the main process to abort the SDK call.
	 * @returns The context results from Morph
	 */
	fastContext(params: {
		query: string;
		repoRoot: string;
		token?: CancellationToken;
	}): Promise<{ file: string; content: string }[]>;

	/**
	 * Apply code changes using Morph Fast Apply API
	 */
	applyCodeChange(params: {
		instruction: string;
		originalCode: string;
		updatedCode: string;
		model?: 'morph-v3-fast' | 'morph-v3-large' | 'auto';
	}): Promise<string>;

	/**
	 * Morph Repo Storage: codebase semantic search
	 */
	codebaseSearch(params: {
		query: string;
		repoId?: string;
		branch?: string;
		commitHash?: string;
		target_directories?: string[];
		limit?: number;
		token?: CancellationToken;
	}): Promise<{
		success: boolean;
		results: Array<{
			filepath: string;
			content: string;
			rerankScore: number;
			language: string;
			startLine: number;
			endLine: number;
		}>;
		stats: { searchTimeMs: number };
	}>;

	/**
	 * Morph Repo Storage: git operations
	 */
	repoInit(params: { repoId?: string; dir?: string }): Promise<{ success: boolean }>;
	repoClone(params: { repoId: string; dir: string }): Promise<{ success: boolean }>;
	repoAdd(params: { dir?: string; filepath?: string }): Promise<{ success: boolean }>;
	repoCommit(params: { dir?: string; message: string; metadata?: Record<string, any> }): Promise<{ success: boolean; commitSha?: string }>;
	repoPush(params: { dir?: string; branch?: string; index?: boolean; waitForEmbeddings?: boolean }): Promise<{ success: boolean }>;
	repoPull(params: { dir?: string }): Promise<{ success: boolean }>;
	repoStatus(params: { dir?: string; filepath: string }): Promise<any>;
	repoStatusMatrix(params: { dir?: string }): Promise<any[]>;
	repoLog(params: { dir?: string; depth?: number }): Promise<any[]>;
	repoCheckout(params: { dir?: string; ref: string }): Promise<{ success: boolean }>;
	repoBranch(params: { dir?: string; name: string }): Promise<{ success: boolean }>;
	repoListBranches(params: { dir?: string }): Promise<string[]>;
	repoCurrentBranch(params: { dir?: string }): Promise<string>;
	repoResolveRef(params: { dir?: string; ref: string }): Promise<string>;
	repoGetCommitMetadata(params: { repoId?: string; commitHash: string }): Promise<any>;
	repoWaitForEmbeddings(params: { repoId?: string; timeoutMs?: number }): Promise<{ success: boolean }>;
}

export class MorphService implements IMorphService {
	_serviceBrand: undefined;

	constructor(
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IMainProcessService private readonly _mainProcessService: IMainProcessService,
	) { }

	async fastContext(params: {
		query: string;
		repoRoot: string;
		token?: CancellationToken;
	}): Promise<{ file: string; content: string }[]> {
		const { query, repoRoot, token } = params;

		voidDevLog('[MorphService] Starting fastContext...');
		voidDevLog('[MorphService] Query:', query);
		voidDevLog('[MorphService] Repo root:', repoRoot);

		// Get API key from settings
		const apiKey = this._settingsService.state.globalSettings.morphApiKey;
		if (!apiKey) {
			console.error('[MorphService] No API key configured');
			throw new Error('Morph API key not configured. Please add your API key in Settings.');
		}

		// Get IPC channel to electron-main
		const channel = this._mainProcessService.getChannel('void-channel-morph');

		voidDevLog('[MorphService] Calling Morph SDK (warpGrep) via IPC channel...');

		try {
			// Call the main process to use Morph SDK. Race against the cancellation
			// token so a Stop/abort doesn't block the chat on a slow Morph call.
			const requestId = generateUuid();
			const callPromise = channel.call('fastContext', {
				query,
				repoRoot,
				apiKey,
				_requestId: requestId,
			}) as Promise<{ file: string; content: string }[]>;

			const contexts = await this._raceWithAbort(callPromise, token, requestId, channel);

			voidDevLog(`[MorphService] Successfully received ${contexts.length} contexts from Morph`);
			return contexts;
		} catch (error) {
			console.error('[MorphService] IPC call failed for fastContext:', error);
			throw error;
		}
	}

	async applyCodeChange(params: {
		instruction: string;
		originalCode: string;
		updatedCode: string;
		model?: 'morph-v3-fast' | 'morph-v3-large' | 'auto';
	}): Promise<string> {
		const { instruction, originalCode, updatedCode, model } = params;

		voidDevLog('[MorphService] Starting applyCodeChange...');
		voidDevLog('[MorphService] Instruction:', instruction);
		voidDevLog('[MorphService] Original code length:', originalCode.length);
		voidDevLog('[MorphService] Updated code length:', updatedCode.length);

		// Get API key and model from settings
		const apiKey = this._settingsService.state.globalSettings.morphApiKey;
		if (!apiKey) {
			console.error('[MorphService] No API key configured');
			throw new Error('Morph API key not configured. Please add your API key in Settings.');
		}

		// Use model from parameter or fall back to settings
		const selectedModel = model || this._settingsService.state.globalSettings.morphModel;
		voidDevLog('[MorphService] Using model:', selectedModel);

		// Get IPC channel to electron-main
		const channel = this._mainProcessService.getChannel('void-channel-morph');

		voidDevLog('[MorphService] Calling Morph SDK via IPC channel...');

		try {
			// Call the main process to use Morph SDK
			const appliedCode = await channel.call('applyCodeChange', {
				instruction,
				originalCode,
				updatedCode,
				filePath: 'temp.ts', // Temp file name, actual path created in main process
				apiKey,
				model: selectedModel
			}) as string;

			voidDevLog('[MorphService] Successfully received applied code, length:', appliedCode.length);
			return appliedCode;
		} catch (error) {
			console.error('[MorphService] IPC call failed:', error);
			throw error;
		}
	}

	private _getApiKey(): string {
		const apiKey = this._settingsService.state.globalSettings.morphApiKey;
		if (!apiKey) {
			throw new Error('Morph API key not configured. Please add your API key in Settings.');
		}
		return apiKey;
	}

	private _getRepoDefaults() {
		const gs = this._settingsService.state.globalSettings;
		return {
			repoId: gs.morphRepoId,
			branch: gs.morphRepoBranch || 'main',
			index: gs.morphRepoIndexOnPush ?? true,
			waitForEmbeddings: gs.morphRepoWaitForEmbeddings ?? false,
		};
	}

	async codebaseSearch(params: {
		query: string;
		repoId?: string;
		branch?: string;
		commitHash?: string;
		target_directories?: string[];
		limit?: number;
		token?: CancellationToken;
	}) {
		const apiKey = this._getApiKey();
		const defaults = this._getRepoDefaults();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		const requestId = generateUuid();
		const callPromise = channel.call('codebaseSearch', {
			apiKey,
			query: params.query,
			repoId: params.repoId ?? defaults.repoId,
			branch: params.branch ?? defaults.branch,
			commitHash: params.commitHash,
			target_directories: params.target_directories ?? [],
			limit: params.limit ?? 10,
			_requestId: requestId,
		}) as Promise<{
			success: boolean;
			results: Array<{
				filepath: string;
				content: string;
				rerankScore: number;
				language: string;
				startLine: number;
				endLine: number;
			}>;
			stats: { searchTimeMs: number };
		}>;
		return this._raceWithAbort(callPromise, params.token, requestId, channel);
	}

	/**
	 * Race an IPC call against a CancellationToken. On cancellation, reject locally
	 * so the chat flow stops waiting, and best-effort ask the main process to abort
	 * the underlying Morph SDK call (the SDK call may not be cancellable, in which
	 * case it simply completes in the background and its result is dropped — but we
	 * no longer block on it). Without a token, this is a plain await.
	 */
	private _raceWithAbort<T>(callPromise: Promise<T>, token: CancellationToken | undefined, requestId: string, channel: IChannel): Promise<T> {
		if (!token) {
			return callPromise;
		}
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const cancellationListener = token.onCancellationRequested(() => {
				if (settled) return;
				settled = true;
				cancellationListener.dispose();
				// Best-effort: tell main to abort. Don't await — we reject immediately.
				channel.call('abortMorph', { requestId }).catch(() => { });
				reject(new Error('Morph call was cancelled.'));
			});
			callPromise.then(
				(v) => { if (!settled) { settled = true; cancellationListener.dispose(); resolve(v); } },
				(e) => { if (!settled) { settled = true; cancellationListener.dispose(); reject(e); } }
			);
		});
	}

	async repoInit(params: { repoId?: string; dir?: string }) {
		const apiKey = this._getApiKey();
		const defaults = this._getRepoDefaults();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoInit', {
			apiKey,
			repoId: params.repoId ?? defaults.repoId,
			dir: params.dir,
		}) as Promise<{ success: boolean }>;
	}

	async repoClone(params: { repoId: string; dir: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoClone', { apiKey, ...params }) as Promise<{ success: boolean }>;
	}

	async repoAdd(params: { dir?: string; filepath?: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoAdd', { apiKey, ...params }) as Promise<{ success: boolean }>;
	}

	async repoCommit(params: { dir?: string; message: string; metadata?: Record<string, any> }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoCommit', { apiKey, ...params }) as Promise<{ success: boolean; commitSha?: string }>;
	}

	async repoPush(params: { dir?: string; branch?: string; index?: boolean; waitForEmbeddings?: boolean }) {
		const apiKey = this._getApiKey();
		const defaults = this._getRepoDefaults();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoPush', {
			apiKey,
			dir: params.dir,
			branch: params.branch ?? defaults.branch,
			index: params.index ?? defaults.index,
			waitForEmbeddings: params.waitForEmbeddings ?? defaults.waitForEmbeddings,
		}) as Promise<{ success: boolean }>;
	}

	async repoPull(params: { dir?: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoPull', { apiKey, ...params }) as Promise<{ success: boolean }>;
	}

	async repoStatus(params: { dir?: string; filepath: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoStatus', { apiKey, ...params }) as Promise<any>;
	}

	async repoStatusMatrix(params: { dir?: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoStatusMatrix', { apiKey, ...params }) as Promise<any[]>;
	}

	async repoLog(params: { dir?: string; depth?: number }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoLog', { apiKey, ...params }) as Promise<any[]>;
	}

	async repoCheckout(params: { dir?: string; ref: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoCheckout', { apiKey, ...params }) as Promise<{ success: boolean }>;
	}

	async repoBranch(params: { dir?: string; name: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoBranch', { apiKey, ...params }) as Promise<{ success: boolean }>;
	}

	async repoListBranches(params: { dir?: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoListBranches', { apiKey, ...params }) as Promise<string[]>;
	}

	async repoCurrentBranch(params: { dir?: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoCurrentBranch', { apiKey, ...params }) as Promise<string>;
	}

	async repoResolveRef(params: { dir?: string; ref: string }) {
		const apiKey = this._getApiKey();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoResolveRef', { apiKey, ...params }) as Promise<string>;
	}

	async repoGetCommitMetadata(params: { repoId?: string; commitHash: string }) {
		const apiKey = this._getApiKey();
		const defaults = this._getRepoDefaults();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoGetCommitMetadata', {
			apiKey,
			repoId: params.repoId ?? defaults.repoId,
			commitHash: params.commitHash,
		}) as Promise<any>;
	}

	async repoWaitForEmbeddings(params: { repoId?: string; timeoutMs?: number }) {
		const apiKey = this._getApiKey();
		const defaults = this._getRepoDefaults();
		const channel = this._mainProcessService.getChannel('void-channel-morph');
		return channel.call('repoWaitForEmbeddings', {
			apiKey,
			repoId: params.repoId ?? defaults.repoId,
			timeoutMs: params.timeoutMs ?? 120000,
		}) as Promise<{ success: boolean }>;
	}
}

registerSingleton(IMorphService, MorphService, InstantiationType.Delayed);
