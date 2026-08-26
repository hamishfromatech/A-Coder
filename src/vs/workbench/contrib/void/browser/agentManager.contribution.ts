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
	 * Reads the full contents of a walkthrough file from disk (returns '' if
	 * the read fails). Lets the inline walkthrough wrapper refresh open
	 * preview tabs with the complete content rather than the truncated
	 * ~1000-char preview the tool returns.
	 */
	getWalkthroughContent(filePath: string): Promise<string>;

	/**
	 * Opens Agent Manager with arbitrary markdown content (for implementation plans, etc.)
	 */
	openContentPreview(title: string, content: string, options?: { isImplementationPlan?: boolean, planId?: string, threadId?: string }): Promise<void>;

	/**
	 * Marks the current implementation plan for the given thread as approved
	 * for execution, and auto-promotes its steps into a todo list on the
	 * shared PlanningService singleton so the agent can execute them via
	 * update_todo without re-creating the steps. Throws if no plan exists
	 * for the thread. The React preview UI lives in a separate bundle and
	 * can't reach the singletons directly, so it goes through this service.
	 */
	approveImplementationPlan(threadId: string): void;

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