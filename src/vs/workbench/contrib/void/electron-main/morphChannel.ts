/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { MorphClient } from '@morphllm/morphsdk';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * IPC Channel for Morph Fast Apply using SDK
 * Handles code application requests from renderer
 */
export class MorphChannel implements IServerChannel {
	private morphClients: Map<string, MorphClient> = new Map();

	/**
	 * In-flight abortable Morph calls, keyed by the renderer-supplied `_requestId`.
	 * Lets the renderer cancel a long-running fastContext/codebaseSearch via the
	 * `abortMorph` command. A CancellationToken can't cross IPC, so the renderer
	 * sends a requestId instead and we map it to an AbortController here.
	 */
	private inFlightAbort = new Map<string, AbortController>();

	private getMorphClient(apiKey: string): MorphClient {
		if (!this.morphClients.has(apiKey)) {
			this.morphClients.set(apiKey, new MorphClient({ apiKey }));
		}
		return this.morphClients.get(apiKey)!;
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'abortMorph': {
				const { requestId } = arg as { requestId: string };
				const ctrl = this.inFlightAbort.get(requestId);
				if (ctrl) {
					ctrl.abort();
					this.inFlightAbort.delete(requestId);
				}
				return true;
			}

			case 'fastContext': {
				const { query, repoRoot, apiKey, _requestId } = arg as {
					query: string;
					repoRoot: string;
					apiKey: string;
					_requestId?: string;
				};

				console.log('[MorphChannel] Starting Fast Context (warpGrep)...');
				console.log('[MorphChannel] Query:', query);
				console.log('[MorphChannel] Repo root:', repoRoot);

				// Track this call so the renderer can abort it via `abortMorph`.
				// The SDK may or may not honour the AbortSignal; either way the
				// renderer stops blocking once it cancels, and we clean up here.
				const ctrl = new AbortController();
				if (_requestId) {
					this.inFlightAbort.set(_requestId, ctrl);
				}

				try {
					// Get Morph client (cast to any to access experimental APIs not in typings)
					const morph = this.getMorphClient(apiKey) as any;

					// Guard against older SDKs that don't expose warpGrep
					if (!morph?.warpGrep?.execute) {
						throw new Error('Morph SDK does not support warpGrep (fast context). Please update @morphllm/morphsdk or disable fast_context.');
					}

					// Execute warpGrep. Pass the abort signal best-effort; SDKs that
					// ignore unknown options are unaffected.
					console.log('[MorphChannel] Calling Morph warpGrep SDK...');
					const result = await morph.warpGrep.execute({
						query,
						repoRoot,
						signal: ctrl.signal,
					});

					if (!result.success) {
						console.error('[MorphChannel] warpGrep failed:', result.error);
						throw new Error(`Morph warpGrep failed: ${result.error}`);
					}

					console.log(`[MorphChannel] Successfully received ${result.contexts.length} contexts from Morph`);
					return result.contexts;

				} catch (error) {
					console.error('[MorphChannel] Error in fastContext:', error);
					throw error;
				} finally {
					if (_requestId) {
						this.inFlightAbort.delete(_requestId);
					}
				}
			}

			case 'codebaseSearch': {
				const { apiKey, query, repoId, branch, commitHash, target_directories, limit, _requestId } = arg as {
					apiKey: string;
					query: string;
					repoId: string;
					branch?: string;
					commitHash?: string;
					target_directories: string[];
					limit: number;
					_requestId?: string;
				};

				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.codebaseSearch?.search) {
					throw new Error('Morph SDK does not support codebaseSearch. Please update @morphllm/morphsdk to a git-enabled version.');
				}

				const ctrl = new AbortController();
				if (_requestId) {
					this.inFlightAbort.set(_requestId, ctrl);
				}

				try {
					const results = await morph.codebaseSearch.search({
						query,
						repoId,
						branch,
						commitHash,
						target_directories,
						limit,
						signal: ctrl.signal,
					});
					return results;
				} finally {
					if (_requestId) {
						this.inFlightAbort.delete(_requestId);
					}
				}
			}

			case 'repoInit': {
				const { apiKey, repoId, dir } = arg as { apiKey: string; repoId?: string; dir?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.init) throw new Error('Morph SDK does not support git.init. Please update @morphllm/morphsdk.');
				return morph.git.init({ repoId, dir });
			}

			case 'repoClone': {
				const { apiKey, repoId, dir } = arg as { apiKey: string; repoId: string; dir: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.clone) throw new Error('Morph SDK does not support git.clone. Please update @morphllm/morphsdk.');
				return morph.git.clone({ repoId, dir });
			}

			case 'repoAdd': {
				const { apiKey, dir, filepath } = arg as { apiKey: string; dir?: string; filepath?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.add) throw new Error('Morph SDK does not support git.add. Please update @morphllm/morphsdk.');
				return morph.git.add({ dir, filepath });
			}

			case 'repoCommit': {
				const { apiKey, dir, message, metadata } = arg as { apiKey: string; dir?: string; message: string; metadata?: Record<string, any> };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.commit) throw new Error('Morph SDK does not support git.commit. Please update @morphllm/morphsdk.');
				return morph.git.commit({ dir, message, metadata });
			}

			case 'repoPush': {
				const { apiKey, dir, branch, index, waitForEmbeddings } = arg as { apiKey: string; dir?: string; branch?: string; index?: boolean; waitForEmbeddings?: boolean };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.push) throw new Error('Morph SDK does not support git.push. Please update @morphllm/morphsdk.');
				return morph.git.push({ dir, branch, index, waitForEmbeddings });
			}

			case 'repoPull': {
				const { apiKey, dir } = arg as { apiKey: string; dir?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.pull) throw new Error('Morph SDK does not support git.pull. Please update @morphllm/morphsdk.');
				return morph.git.pull({ dir });
			}

			case 'repoStatus': {
				const { apiKey, dir, filepath } = arg as { apiKey: string; dir?: string; filepath: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.status) throw new Error('Morph SDK does not support git.status. Please update @morphllm/morphsdk.');
				return morph.git.status({ dir, filepath });
			}

			case 'repoStatusMatrix': {
				const { apiKey, dir } = arg as { apiKey: string; dir?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.statusMatrix) throw new Error('Morph SDK does not support git.statusMatrix. Please update @morphllm/morphsdk.');
				return morph.git.statusMatrix({ dir });
			}

			case 'repoLog': {
				const { apiKey, dir, depth } = arg as { apiKey: string; dir?: string; depth?: number };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.log) throw new Error('Morph SDK does not support git.log. Please update @morphllm/morphsdk.');
				return morph.git.log({ dir, depth });
			}

			case 'repoCheckout': {
				const { apiKey, dir, ref } = arg as { apiKey: string; dir?: string; ref: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.checkout) throw new Error('Morph SDK does not support git.checkout. Please update @morphllm/morphsdk.');
				return morph.git.checkout({ dir, ref });
			}

			case 'repoBranch': {
				const { apiKey, dir, name } = arg as { apiKey: string; dir?: string; name: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.branch) throw new Error('Morph SDK does not support git.branch. Please update @morphllm/morphsdk.');
				return morph.git.branch({ dir, name });
			}

			case 'repoListBranches': {
				const { apiKey, dir } = arg as { apiKey: string; dir?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.listBranches) throw new Error('Morph SDK does not support git.listBranches. Please update @morphllm/morphsdk.');
				return morph.git.listBranches({ dir });
			}

			case 'repoCurrentBranch': {
				const { apiKey, dir } = arg as { apiKey: string; dir?: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.currentBranch) throw new Error('Morph SDK does not support git.currentBranch. Please update @morphllm/morphsdk.');
				return morph.git.currentBranch({ dir });
			}

			case 'repoResolveRef': {
				const { apiKey, dir, ref } = arg as { apiKey: string; dir?: string; ref: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.resolveRef) throw new Error('Morph SDK does not support git.resolveRef. Please update @morphllm/morphsdk.');
				return morph.git.resolveRef({ dir, ref });
			}

			case 'repoGetCommitMetadata': {
				const { apiKey, repoId, commitHash } = arg as { apiKey: string; repoId?: string; commitHash: string };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.getCommitMetadata) throw new Error('Morph SDK does not support git.getCommitMetadata. Please update @morphllm/morphsdk.');
				return morph.git.getCommitMetadata({ repoId, commitHash });
			}

			case 'repoWaitForEmbeddings': {
				const { apiKey, repoId, timeoutMs } = arg as { apiKey: string; repoId?: string; timeoutMs?: number };
				const morph = this.getMorphClient(apiKey) as any;
				if (!morph?.git?.waitForEmbeddings) throw new Error('Morph SDK does not support git.waitForEmbeddings. Please update @morphllm/morphsdk.');
				return morph.git.waitForEmbeddings({ repoId, timeout: timeoutMs });
			}

			case 'applyCodeChange': {
				const { instruction, originalCode, updatedCode, filePath, apiKey } = arg as {
					instruction: string;
					originalCode: string;
					updatedCode: string;
					filePath: string;
					apiKey: string;
				};

				console.log('[MorphChannel] Starting Fast Apply...');
				console.log('[MorphChannel] Instruction:', instruction);
				console.log('[MorphChannel] File path:', filePath);
				console.log('[MorphChannel] Original code length:', originalCode.length);
				console.log('[MorphChannel] Updated code length:', updatedCode.length);

				// Create temp file with original content in current directory
				// SDK seems to treat paths as relative to CWD, so use current directory
				const tempFileName = `morph-${Date.now()}-${path.basename(filePath)}`;
				const tempFilePath = path.resolve(tempFileName);

				try {
					console.log('[MorphChannel] Writing temp file:', tempFilePath);
					await fs.writeFile(tempFilePath, originalCode, 'utf8');

					// Get Morph client
					const morph = this.getMorphClient(apiKey);

					// Execute Fast Apply - use just filename since SDK prepends CWD
					console.log('[MorphChannel] Calling Morph Fast Apply SDK...');
					const result = await morph.fastApply.execute({
						target_filepath: tempFileName,
						instructions: instruction,
						code_edit: updatedCode
					});

					console.log('[MorphChannel] Fast Apply result:', {
						success: result.success,
						linesAdded: result.changes?.linesAdded,
						linesRemoved: result.changes?.linesRemoved,
						linesModified: result.changes?.linesModified
					});

					if (!result.success) {
						console.error('[MorphChannel] Fast Apply failed:', result.error);
						throw new Error(`Morph Fast Apply failed: ${result.error}`);
					}

					// Read the modified file
					const appliedCode = await fs.readFile(tempFilePath, 'utf8');
					console.log('[MorphChannel] Successfully received applied code, length:', appliedCode.length);

					return appliedCode;

				} catch (error) {
					console.error('[MorphChannel] Error:', error);
					throw error;
				} finally {
					// Always clean up temp file
					try {
						await fs.access(tempFilePath);
						await fs.unlink(tempFilePath);
						console.log('[MorphChannel] Cleaned up temp file');
					} catch (cleanupError) {
						// File doesn't exist or couldn't be deleted - that's fine
						if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
							console.error('[MorphChannel] Failed to cleanup temp file:', cleanupError);
						}
					}
				}
			}
			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not supported: ${event}`);
	}
}
