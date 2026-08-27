/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { INotificationActions, INotificationHandle, INotificationService } from '../../../../platform/notification/common/notification.js';
import { IMetricsService } from '../common/metricsService.js';
import { IVoidUpdateService } from '../common/voidUpdateService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import * as dom from '../../../../base/browser/dom.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';
import { IAction } from '../../../../base/common/actions.js';




const notifyUpdate = (res: VoidCheckUpdateRespose & { message: string }, notifService: INotificationService, updateService: IUpdateService, onDismiss?: () => void): INotificationHandle => {
	const message = res?.message || 'This is a very old version of A-Coder, please download the latest version! [A-Coder Editor](https://github.com/hamishfromatech/A-Coder/releases/latest)!'

	let actions: INotificationActions | undefined

	if (res?.action) {
		const primary: IAction[] = []

		if (res.action === 'reinstall') {
			primary.push({
				label: `Reinstall`,
				id: 'void.updater.reinstall',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					const { window } = dom.getActiveWindow()
					window.open('https://github.com/hamishfromatech/A-Coder/releases/latest')
				}
			})
		}

		if (res.action === 'download') {
			primary.push({
				label: `Download`,
				id: 'void.updater.download',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					updateService.downloadUpdate()
				}
			})
		}


		if (res.action === 'apply') {
			primary.push({
				label: `Apply`,
				id: 'void.updater.apply',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					updateService.applyUpdate()
				}
			})
		}

		if (res.action === 'restart') {
			primary.push({
				label: `Restart`,
				id: 'void.updater.restart',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					updateService.quitAndInstall()
				}
			})
		}

		primary.push({
			id: 'void.updater.site',
			enabled: true,
			label: `A-Coder IDE Site`,
			tooltip: '',
			class: undefined,
			run: () => {
				const { window } = dom.getActiveWindow()
				window.open('https://github.com/hamishfromatech/A-Coder')
			}
		})

		actions = {
			primary: primary,
			secondary: [{
				id: 'void.updater.close',
				enabled: true,
				label: `Keep current version`,
				tooltip: '',
				class: undefined,
				run: () => {
					notifController.close()
				}
			}]
		}
	}
	else {
		actions = undefined
	}

	const notifController = notifService.notify({
		severity: Severity.Info,
		message: message,
		sticky: true,
		progress: actions ? { worked: 0, total: 100 } : undefined,
		actions: actions,
	})

	// Track when user dismisses the notification
	if (onDismiss) {
		notifController.onDidClose(() => {
			onDismiss()
		})
	}

	return notifController
}
const notifyErrChecking = (notifService: INotificationService): INotificationHandle => {
	const message = `A-Coder Error: There was an error checking for updates. If this persists, please get in touch or reinstall A-Coder [here](https://github.com/hamishfromatech/A-Coder/releases/latest)!`
	const notifController = notifService.notify({
		severity: Severity.Info,
		message: message,
		sticky: true,
	})
	return notifController
}


const performVoidCheck = async (
	explicit: boolean,
	notifService: INotificationService,
	voidUpdateService: IVoidUpdateService,
	metricsService: IMetricsService,
	updateService: IUpdateService,
): Promise<{ controller: INotificationHandle | null; version: string | undefined }> => {

	const metricsTag = explicit ? 'Manual' : 'Auto'

	metricsService.capture(`A-Coder Update ${metricsTag}: Checking...`, {})
	const res = await voidUpdateService.check(explicit)
	if (!res) {
		const notifController = notifyErrChecking(notifService);
		metricsService.capture(`A-Coder Update ${metricsTag}: Error`, { res })
		return { controller: notifController, version: undefined }
	}

	// Get version from response if available
	const version = 'version' in res ? res.version : undefined

	if (res.message) {
		// Skip showing notification if user already dismissed this version (non-explicit only)
		if (!explicit && version && version === userDismissedVersion) {
			metricsService.capture(`A-Coder Update ${metricsTag}: Dismissed`, { res })
			return { controller: null, version }
		}

		const notifController = notifyUpdate(res, notifService, updateService, () => {
			// Track dismissed version when user closes notification
			if (version) {
				userDismissedVersion = version
			}
		})
		metricsService.capture(`A-Coder Update ${metricsTag}: Yes`, { res })
		return { controller: notifController, version }
	}
	else {
		metricsService.capture(`A-Coder Update ${metricsTag}: No`, { res })
		return { controller: null, version }
	}
}


// Action
let lastNotifController: INotificationHandle | null = null
let userDismissedVersion: string | null = null

const closeLastNotification = () => {
	if (lastNotifController) {
		lastNotifController.close()
		lastNotifController = null
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'void.voidCheckUpdate',
			title: localize2('voidCheckUpdate', 'A-Coder IDE: Check for Updates'),
			menu: [{
				id: MenuId.MenubarHelpMenu,
				group: '5_update',
				order: 1
			}]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voidUpdateService = accessor.get(IVoidUpdateService)
		const notifService = accessor.get(INotificationService)
		const metricsService = accessor.get(IMetricsService)
		const updateService = accessor.get(IUpdateService)

		// Clear the dismissed flag when manually checking for updates
		userDismissedVersion = null
		closeLastNotification()

		const result = await performVoidCheck(true, notifService, voidUpdateService, metricsService, updateService)

		if (result.controller) {
			lastNotifController = result.controller
		}
	}
})

// on mount
class VoidUpdateWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.voidUpdate'
	constructor(
		@IVoidUpdateService voidUpdateService: IVoidUpdateService,
		@IMetricsService metricsService: IMetricsService,
		@INotificationService notifService: INotificationService,
		@IUpdateService updateService: IUpdateService,
	) {
		super()

		const autoCheck = async () => {
			// Close any existing notification before showing a new one
			closeLastNotification()

			const result = await performVoidCheck(false, notifService, voidUpdateService, metricsService, updateService)

			if (result.controller) {
				lastNotifController = result.controller
			}
		}

		// check once 5 seconds after mount
		// check every 3 hours
		const { window } = dom.getActiveWindow()

		const initId = window.setTimeout(() => autoCheck(), 5 * 1000)
		this._register({ dispose: () => window.clearTimeout(initId) })


		const intervalId = window.setInterval(() => autoCheck(), 3 * 60 * 60 * 1000) // every 3 hrs
		this._register({ dispose: () => window.clearInterval(intervalId) })

	}
}
registerWorkbenchContribution2(VoidUpdateWorkbenchContribution.ID, VoidUpdateWorkbenchContribution, WorkbenchPhase.BlockRestore);
