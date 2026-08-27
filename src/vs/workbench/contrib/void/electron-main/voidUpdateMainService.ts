/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IVoidUpdateService } from '../common/voidUpdateService.js';
import { VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';
import { voidDevLog } from '../common/devLog.js';



export class VoidMainUpdateService extends Disposable implements IVoidUpdateService {
	_serviceBrand: undefined;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IEnvironmentMainService private readonly _envMainService: IEnvironmentMainService,
		@IUpdateService private readonly _updateService: IUpdateService,
	) {
		super()
	}


	async check(explicit: boolean): Promise<VoidCheckUpdateRespose> {

		const isDevMode = !this._envMainService.isBuilt // found in abstractUpdateService.ts

		if (isDevMode) {
			return { message: null } as const
		}

		// if disabled and not explicitly checking, return early (commented out to allow background manual checks)
		// if (this._updateService.state.type === StateType.Disabled) {
		// 	if (!explicit)
		// 		return { message: null } as const
		// }

		await this._updateService.checkForUpdates(false) // implicity check, then handle result ourselves

		// checkForUpdates() resolves as soon as the check is *kicked off* — the
		// async state machine (Idle -> CheckingForUpdates -> Idle|AvailableForDownload|…)
		// continues via onStateChange. Reading `state` synchronously here would
		// return stale state (often CheckingForUpdates), so wait for it to settle
		// before reporting. Bounded by a timeout so we never hang.
		let state = this._updateService.state
		if (state.type === StateType.CheckingForUpdates) {
			state = await this._waitForStateSettle(30 * 1000)
		}

		voidDevLog('updateState', state)

		if (state.type === StateType.Uninitialized) {
			// The update service hasn't been initialized yet
			return { message: explicit ? 'Checking for updates soon...' : null, action: explicit ? 'reinstall' : undefined } as const
		}

		if (state.type === StateType.Idle) {
			// No updates currently available
			return { message: explicit ? 'No updates found!' : null, action: explicit ? 'reinstall' : undefined } as const
		}

		if (state.type === StateType.CheckingForUpdates) {
			// Still checking after the settle timeout — report in-progress
			return { message: explicit ? 'Checking for updates...' : null } as const
		}

		if (state.type === StateType.AvailableForDownload) {
			// Update available but requires manual download (mainly for Linux)
			return { message: 'A new update is available!', action: 'download', } as const
		}

		if (state.type === StateType.Downloading) {
			// Update is currently being downloaded
			return { message: explicit ? 'Currently downloading update...' : null } as const
		}

		if (state.type === StateType.Downloaded) {
			// Update has been downloaded but not yet ready
			return { message: explicit ? 'An update is ready to be applied!' : null, action: 'apply' } as const
		}

		if (state.type === StateType.Updating) {
			// Update is being applied
			return { message: explicit ? 'Applying update...' : null } as const
		}

		if (state.type === StateType.Ready) {
			// Update is ready
			const version = state.update?.version
			return { message: 'Restart A-Coder IDE to update!', action: 'restart', version } as const
		}

		if (state.type === StateType.Disabled) {
			return await this._manualCheckGHTagIfDisabled(explicit)
		}
		return null
	}

	/**
	 * Wait for the update service to leave the `CheckingForUpdates` state
	 * (resolving with the new state), or fall back to the current state after
	 * `timeoutMs`. `checkForUpdates` resolves before the check completes, so the
	 * caller must wait on `onStateChange` to observe the real outcome.
	 */
	private _waitForStateSettle(timeoutMs: number): Promise<State> {
		return new Promise<State>((resolve) => {
			let done = false
			let timer: ReturnType<typeof setTimeout> | undefined
			const sub = this._updateService.onStateChange(s => {
				if (s.type !== StateType.CheckingForUpdates && !done) {
					done = true
					sub.dispose()
					if (timer) clearTimeout(timer)
					resolve(s)
				}
			})
			timer = setTimeout(() => {
				if (!done) {
					done = true
					sub.dispose()
					resolve(this._updateService.state)
				}
			}, timeoutMs)
		})
	}






	private async _manualCheckGHTagIfDisabled(explicit: boolean): Promise<VoidCheckUpdateRespose> {
		try {
			const response = await fetch('https://api.github.com/repos/hamishfromatech/A-Coder/releases/latest');

			const data = await response.json();
			const version = data.tag_name;

			// Compare the A-Coder release version (product.json `voidVersion`)
			// against the GitHub release tag, stripping the leading `v` so
			// e.g. "1.8.5" === "v1.8.5". Do NOT use `productService.version` —
			// that's the VS Code base version (1.99.3) and never matches.
			const myVersion = (this._productService.voidVersion || '').replace(/^v/, '')
			const latestVersion = (version || '').replace(/^v/, '')

			const isUpToDate = myVersion === latestVersion // only makes sense if response.ok

			let message: string | null
			let action: 'reinstall' | undefined

			// explicit
			if (explicit) {
				if (response.ok) {
					if (!isUpToDate) {
						message = 'A new version of A-Coder IDE is available! Please reinstall (auto-updates are disabled on this OS) - it only takes a second!'
						action = 'reinstall'
					}
					else {
						message = 'A-Coder IDE is up-to-date!'
					}
				}
				else {
					message = `An error occurred when fetching the latest GitHub release tag. Please try again in ~5 minutes, or reinstall.`
					action = 'reinstall'
				}
			}
			// not explicit
			else {
				if (response.ok && !isUpToDate) {
					message = 'A new version of A-Coder IDE is available! Please reinstall (auto-updates are disabled on this OS) - it only takes a second!'
					action = 'reinstall'
				}
				else {
					message = null
				}
			}
			return { message, action, version: latestVersion } as const
		}
		catch (e) {
			if (explicit) {
				return {
					message: `An error occurred when fetching the latest GitHub release tag: ${e}. Please try again in ~5 minutes.`,
					action: 'reinstall',
				}
			}
			else {
				return { message: null } as const
			}
		}
	}
}
