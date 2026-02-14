/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentManagerService } from './agentManagerService.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';

export interface IAgentManagerService {
	readonly _serviceBrand: undefined;
	readonly onDidOpenFile: Event<URI>;
	readonly onDidOpenWalkthrough: Event<{ filePath: string, preview: string, threadId?: string }>;
	readonly onDidOpenContent: Event<{ title: string, content: string }>;

	/**
	 * Opens Agent Manager
	 */
	openAgentManager(): Promise<void>;

	/**
	 * Opens Agent Manager with walkthrough content
	 */
	openWalkthroughPreview(filePath: string, preview: string, options?: { threadId?: string }): Promise<void>;

	/**
	 * Opens Agent Manager with arbitrary markdown content (for implementation plans, etc.)
	 */
	openContentPreview(title: string, content: string, options?: { isImplementationPlan?: boolean, planId?: string, threadId?: string }): Promise<void>;

	/**
	 * Closes the Agent Manager
	 */
	closeAgentManager(): void;

	/**
	 * Checks if Agent Manager is currently open
	 */
	isAgentManagerOpen(): boolean;

	/**
	 * Request to open a file in the Agent Manager preview pane
	 */
	openFile(uri: URI): void;
}

// Create the service decorator
export const IAgentManagerService = createDecorator<IAgentManagerService>('voidAgentManagerService');

// Register the Agent Manager service as a singleton
registerSingleton(IAgentManagerService, AgentManagerService, InstantiationType.Delayed);