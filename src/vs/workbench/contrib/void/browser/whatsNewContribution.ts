/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { WHATS_NEW_LAST_VERSION_KEY } from '../common/storageKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { timeout } from '../../../../base/common/async.js';
import { voidDevLog, voidDevWarn } from '../common/devLog.js';

// Contribution that checks version and opens release notes on update
export class WhatsNewCheckContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.whatsNewCheck';

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.checkAndOpenWhatsNew();
	}

	private async checkAndOpenWhatsNew(): Promise<void> {
		// Get current version from product service
		const currentVersion = this.productService['voidVersion'] as string | undefined;
		const voidRelease = this.productService['voidRelease'] as string | undefined;

		if (!currentVersion) {
			return;
		}

		// Get the last seen version
		const lastSeenVersion = this.storageService.get(
			WHATS_NEW_LAST_VERSION_KEY,
			StorageScope.APPLICATION,
			''
		);

		// Build the full version string (e.g., "1.5.3 (0048)")
		const fullVersion = voidRelease ? `${currentVersion} (${voidRelease})` : currentVersion;

		// If this is the first run or version has changed
		if (lastSeenVersion !== fullVersion) {
			voidDevLog(`[A-Coder What's New] Version changed from "${lastSeenVersion}" to "${fullVersion}". Opening release notes...`);

			// Wait a bit for the workbench to be ready
			// MEMORY FIX: Use a cancellable timeout that respects this component's lifecycle
			try {
				const promise = timeout(5000);
				this._register(toDisposable(() => promise.cancel()));
				await promise;
			} catch (e) {
				// Cancelled
				return;
			}

			// Open the GitHub releases page. We deliberately point at the
			// releases list rather than a version-specific tag URL, since the
			// tag for the current build may not exist on GitHub (dev builds,
			// unreleased versions). Only mark this version "seen" once an open
			// actually succeeded — otherwise a failed open would silently
			// suppress the prompt on every future launch.
			let opened = false
			try {
				await this.openerService.open(URI.parse('https://github.com/hamishfromatech/A-Coder/releases'));
				opened = true
			} catch (error) {
				voidDevWarn('[A-Coder What\'s New] Failed to open releases page:', error);
			}

			if (opened) {
				this.storageService.store(
					WHATS_NEW_LAST_VERSION_KEY,
					fullVersion,
					StorageScope.APPLICATION,
					StorageTarget.MACHINE
				);
			}
		}
	}
}

// Register the check contribution
registerWorkbenchContribution2(
	WhatsNewCheckContribution.ID,
	WhatsNewCheckContribution,
	WorkbenchPhase.AfterRestored
);
