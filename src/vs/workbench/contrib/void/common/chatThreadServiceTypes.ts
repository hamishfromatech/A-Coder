/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VoidFileSnapshot, DiffBasedCheckpoint } from './editCodeServiceTypes.js';
import { AnthropicReasoning, RawToolParamsObj } from './sendLLMMessageTypes.js';
import { ToolCallParams, ToolName, ToolResult } from './toolsServiceTypes.js';

export type ToolMessage<T extends ToolName> = {
	role: 'tool';
	content: string; // give this result to LLM (string of value)
	id: string;
	rawParams: RawToolParamsObj;
	mcpServerName: string | undefined; // the server name at the time of the call
	thought_signature?: string;
	parallelBatchId?: string; // groups parallel tool calls together in UI
} & (
		// in order of events:
		| { type: 'invalid_params', result: null, name: T, }

		| { type: 'tool_request', result: null, name: T, params: ToolCallParams<T>, }  // params were validated, awaiting user

		| { type: 'running_now', result: null, name: T, params: ToolCallParams<T>, }

		| { type: 'tool_error', result: string, name: T, params: ToolCallParams<T>, } // error when tool was running
		| { type: 'success', result: Awaited<ToolResult<T>>, name: T, params: ToolCallParams<T>, }
		| { type: 'rejected', result: null, name: T, params: ToolCallParams<T> }
	) // user rejected

export type DecorativeCanceledTool = {
	role: 'interrupted_streaming_tool';
	name: ToolName;
	mcpServerName: string | undefined; // the server name at the time of the call
}


// MEMORY OPTIMIZATION: Diff-based checkpoints to reduce memory usage
// Instead of storing full file snapshots, we store diffs from the previous checkpoint
export type CheckpointEntry = {
	role: 'checkpoint';
	type: 'user_edit' | 'tool_edit';
	// MEMORY OPTIMIZATION: New diff-based storage (preferred for memory efficiency)
	// Stores only the changes from the previous checkpoint instead of full file content
	diffBasedCheckpointsOfURI?: { [fsPath: string]: DiffBasedCheckpoint | undefined };
	// Reference to previous checkpoint index for diff chain reconstruction
	previousCheckpointIdx?: number | null;
	// Legacy full snapshot storage (for backwards compatibility)
	voidFileSnapshotOfURI?: { [fsPath: string]: VoidFileSnapshot | undefined };

	userModifications: {
		diffBasedCheckpointsOfURI?: { [fsPath: string]: DiffBasedCheckpoint | undefined };
		voidFileSnapshotOfURI?: { [fsPath: string]: VoidFileSnapshot | undefined };
	};
}


// Image attachment for vision-capable models
export type ImageAttachment = {
	base64: string; // base64 encoded image data (without data:image/... prefix)
	mimeType: string; // e.g. 'image/png', 'image/jpeg'
	name?: string; // optional filename
}

// WARNING: changing this format is a big deal!!!!!! need to migrate old format to new format on users' computers so people don't get errors.
export type ChatMessage =
	| {
		role: 'user';
		content: string; // content displayed to the LLM on future calls - allowed to be '', will be replaced with (empty)
		displayContent: string; // content displayed to user  - allowed to be '', will be ignored
		selections: StagingSelectionItem[] | null; // the user's selection
		images?: ImageAttachment[]; // optional images for vision models
		visionAnalysis?: string; // vision model's analysis of images (hidden from display, shown as skeleton)
		state: {
			stagingSelections: StagingSelectionItem[];
			isBeingEdited: boolean;
		}
		orchestrationResult?: {
			suggestions: Array<{
				toolName: string;
				toolParams?: Record<string, any>;
				reasoning: string;
				confidence: 'high' | 'medium' | 'low';
			}>;
			reasoning: string;
			summary: string;
		};
	} | {
		role: 'assistant';
		displayContent: string; // content received from LLM  - allowed to be '', will be replaced with (empty)
		reasoning: string; // reasoning from the LLM, used for step-by-step thinking

		anthropicReasoning: AnthropicReasoning[] | null; // anthropic reasoning
	}
	| ToolMessage<ToolName>
	| DecorativeCanceledTool
	| CheckpointEntry


// one of the square items that indicates a selection in a chat bubble
export type StagingSelectionItem = {
	type: 'File';
	uri: URI;
	language: string;
	state: { wasAddedAsCurrentFile: boolean; };
} | {
	type: 'CodeSelection';
	range: [number, number];
	uri: URI;
	language: string;
	state: { wasAddedAsCurrentFile: boolean; };
} | {
	type: 'Folder';
	uri: URI;
	language?: undefined;
	state?: undefined;
}


// a link to a symbol (an underlined link to a piece of code)
export type CodespanLocationLink = {
	uri: URI, // we handle serialization for this
	displayText: string,
	selection?: { // store as JSON so dont have to worry about serialization
		startLineNumber: number
		startColumn: number,
		endLineNumber: number
		endColumn: number,
	} | undefined
} | null

// Student mode exercise tracking
export type StudentExercise = {
	id: string;
	topic: string;
	difficulty: 'easy' | 'medium' | 'hard';
	language: string;
	type: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';
	createdAt: number;
	hintLevel: number; // 0 = no hints, 1-3 = hints given, 4 = solution shown
	status: 'active' | 'completed' | 'skipped';
}

export type StudentSession = {
	activeExercises: { [exerciseId: string]: StudentExercise };
	completedExerciseCount: number;
	conceptsLearned: string[];
}

// Workflow tracking for agent mode
export type WorkflowTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface WorkflowTask {
	id: string;
	description: string;
	status: WorkflowTaskStatus;
	dependencies: string[];
	notes?: string;
}

export type WorkflowStatus = 'planning' | 'active' | 'paused' | 'completed' | 'failed';

export interface ActiveWorkflow {
	id: string;
	goal: string;
	tasks: WorkflowTask[];
	currentTaskId: string | null;
	status: WorkflowStatus;
	createdAt: number;
}

export type QueueBehavior = 'immediate' | 'wait_for_workflow' | 'hold';

// Standalone session for workspace isolation in agent manager
export type StandaloneSession = {
	id: string;
	name: string;
	createdAt: number;
	workspaceId: string | null; // null = global session not tied to a workspace
	workspaceName: string | null;
	workspacePath: string | null;
}
