/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IMetricsService, CommandAnalyticsEvent } from '../common/metricsService.js';

export const ICommandAnalyticsService = createDecorator<ICommandAnalyticsService>('commandAnalyticsService');

export interface ICommandAnalyticsService {
	readonly _serviceBrand: undefined;
}

export class CommandAnalyticsService extends Disposable implements ICommandAnalyticsService {
	_serviceBrand: undefined;

	// Saved so dispose() can restore the original (un-wrapped) executeCommand.
	private _originalExecuteCommand: ((commandId: string, ...args: any[]) => Promise<unknown>) | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IMetricsService private readonly _metricsService: IMetricsService,
	) {
		super();
		this._wrapCommandService();
	}

	private _wrapCommandService(): void {
		const originalExecuteCommand = this._commandService.executeCommand.bind(this._commandService);
		this._originalExecuteCommand = originalExecuteCommand as any;

		(this._commandService as any).executeCommand = async (commandId: string, ...args: any[]) => {
			this._trackCommandExecution(commandId);

			return (originalExecuteCommand as any)(commandId, ...args);
		};
	}

	override dispose(): void {
		// Restore the original executeCommand so we don't leave a stale wrapper
		// pointing at a disposed service (and so the patch doesn't outlive this
		// service instance).
		if (this._originalExecuteCommand) {
			(this._commandService as any).executeCommand = this._originalExecuteCommand;
			this._originalExecuteCommand = undefined;
		}
		super.dispose();
	}

	private _trackCommandExecution(commandId: string): void {
		// Simple heuristic for source detection
		let source: CommandAnalyticsEvent['source'] = 'unknown';

		// Commands with 'workbench.action.' are often from menu
		if (commandId.startsWith('workbench.action.')) {
			source = 'menu';
		}
		// Commands with 'void.' are custom A-Coder commands
		else if (commandId.startsWith('void.')) {
			source = 'menu';
		}

		this._metricsService.captureCommandEvent({
			commandId,
			source,
		});
	}
}

registerSingleton(ICommandAnalyticsService, CommandAnalyticsService, InstantiationType.Delayed);