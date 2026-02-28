/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { chat_userMessageContent, isABuiltinToolName } from '../common/prompt/prompts.js';
import { AnthropicReasoning, getErrorMessage, RawToolCallObj, RawToolParamsObj } from '../common/sendLLMMessageTypes.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { FeatureName, ModelSelection, ModelSelectionOptions } from '../common/voidSettingsTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, ToolCallParams, ToolName, ToolResult } from '../common/toolsServiceTypes.js';
import { IToolsService } from './toolsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ChatMessage, CheckpointEntry, CodespanLocationLink, StagingSelectionItem, ToolMessage, ImageAttachment, StudentSession, StudentExercise, ActiveWorkflow, QueueBehavior } from '../common/chatThreadServiceTypes.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IMetricsService } from '../common/metricsService.js';
import { shorten } from '../../../../base/common/labels.js';
import { IVoidModelService } from '../common/voidModelService.js';
import { findLast, findLastIdx } from '../../../../base/common/arraysFind.js';
import { IEditCodeService } from './editCodeServiceInterface.js';
import { VoidFileSnapshot, DiffBasedCheckpoint, createDiffBasedCheckpoint, applyDiffBasedCheckpoint } from '../common/editCodeServiceTypes.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { truncate } from '../../../../base/common/strings.js';
import { THREAD_STORAGE_KEY } from '../common/storageKeys.js';
import { IVisionService } from './visionService.js';
import { IConvertToLLMMessageService } from './convertToLLMMessageService.js';
import { IToolOrchestrationService } from './toolOrchestrationService.js';
import { timeout } from '../../../../base/common/async.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IDirectoryStrService } from '../common/directoryStrService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IMCPService } from '../common/mcpService.js';
import { RawMCPToolCall } from '../common/mcpServiceTypes.js';
import { StreamingXMLParser, ReActPhase } from './streamingXMLParser.js';


// related to retrying when LLM message has error
const CHAT_RETRIES = 3 // Number of retries for LLM errors (including empty responses)
const RETRY_DELAY = 2000 // Delay between retries in milliseconds
export const AUTO_CONTINUE_CHAR_THRESHOLD = 200; // Still used by UI auto-continue

// MEMORY OPTIMIZATION: Maximum messages per thread to prevent unbounded memory growth
// Each message can be several KB with tool results, images, etc.
// Increased from 15 to 100 with UI virtualization for performance
const MAX_MESSAGES_PER_THREAD = 100;

// MEMORY OPTIMIZATION: Maximum checkpoints per thread to prevent memory bloat
const MAX_CHECKPOINTS_PER_THREAD = 5;

// MEMORY OPTIMIZATION: Maximum tool call history per thread to prevent unbounded memory growth
// Tool calls can store large params and results
const MAX_TOOL_CALL_HISTORY_PER_THREAD = 100;

// MEMORY OPTIMIZATION: Maximum length of tool result strings to prevent memory bloat
const MAX_TOOL_RESULT_LENGTH = 10000;

// MEMORY OPTIMIZATION: Maximum images per message to prevent memory bloat
// Base64 images can be several MB each
const MAX_IMAGES_PER_MESSAGE = 5;

// MEMORY OPTIMIZATION: Maximum message queue size per thread
const MAX_MESSAGE_QUEUE_PER_THREAD = 10;

// MEMORY OPTIMIZATION: Maximum total size of all images in a message (10MB)
const MAX_TOTAL_IMAGE_SIZE_MB = 10;

const splitThinkTags = (input: string): { displayText: string; reasoningText: string } => {
	if (!input) {
		return { displayText: '', reasoningText: '' }
	}
	// Treat the special placeholder as empty content
	if (input === '(empty message)') {
		return { displayText: '', reasoningText: '' }
	}

	const reasoningParts: string[] = []

	// Helper to extract content from both closed and unclosed tags
	const extractFromTags = (text: string, openTag: string, closeTag: string): string => {
		let currentText = text
		let lastIndex = 0

		// Optimization: check if tag exists at all before doing complex work
		if (!text.includes(openTag)) return text;

		while (true) {
			const openIdx = currentText.indexOf(openTag, lastIndex)
			if (openIdx === -1) break

			const closeIdx = currentText.indexOf(closeTag, openIdx + openTag.length)

			if (closeIdx !== -1) {
				// Found closed tag
				const content = currentText.substring(openIdx + openTag.length, closeIdx).trim()
				if (content) reasoningParts.push(content)
				currentText = currentText.substring(0, openIdx) + currentText.substring(closeIdx + closeTag.length)
				lastIndex = openIdx
			} else {
				// Found unclosed tag - take everything until the end
				const content = currentText.substring(openIdx + openTag.length).trim()
				if (content) reasoningParts.push(content)

				// Keep the open tag if it's not closed, so user sees it's streaming
				// but only return the text BEFORE the tag as display content
				currentText = currentText.substring(0, openIdx)
				break // No more closed tags possible after an unclosed one
			}
		}
		return currentText
	}

	let remainingText = input
	remainingText = extractFromTags(remainingText, '<think>', '</think>')
	remainingText = extractFromTags(remainingText, '<reasoning>', '</reasoning>')

	return { 
		displayText: remainingText.trim(), 
		reasoningText: reasoningParts.join('\n\n') 
	}
}

const mergeReasoningContent = (existing?: string | null, fromTags?: string | null): string => {
	const primary = (existing ?? '').trim()
	const secondary = (fromTags ?? '').trim()
	if (!primary) return secondary
	if (!secondary) return primary

	// PERFORMANCE OPTIMIZATION: Avoid expensive includes on large strings.
	// If the strings are similar in length, they might be the same.
	if (primary === secondary) return primary

	// If one is significantly longer, it likely contains the other.
	// We only check for inclusion if the length difference is small or if strings are small.
	if (primary.length < 1000 && secondary.length < 1000) {
		if (primary.includes(secondary)) return primary
		if (secondary.includes(primary)) return secondary
	}

	// Otherwise, we assume they are different and append them.
	// To prevent unbounded growth, we don't re-append the same secondary many times.
	// This is a heuristic: if primary ends with the start of secondary, we might want to merge,
	// but simple appending is safer and faster for most cases.
	return `${primary}\n\n${secondary}`.trim()
}

// Task planning system inspired by Cursor's approach
export interface TaskPlan {
	id: string
	description: string
	status: 'pending' | 'in_progress' | 'completed' | 'blocked'
	dependencies?: string[]
	created_at: number
	completed_at?: number
}

const partitionReasoningContent = (fullText: string, existingReasoning?: string | null): { displayText: string, reasoningText: string } => {
	const { displayText, reasoningText } = splitThinkTags(fullText)
	const mergedReasoning = mergeReasoningContent(existingReasoning, reasoningText)
	const normalizedDisplay = displayText.replace(/[\s\u00a0]+$/, '')
	return {
		displayText: normalizedDisplay,
		reasoningText: mergedReasoning,
	}
}

/**
 * Heuristic to detect if the LLM message sounds "unfinished" or like it intended to call a tool but didn't.
 * Returns 'silent' if we should auto-continue without a poke, 'poke' if we should add a user message.
 */
const detectDanglingAgenticIntent = (text: string, reasoning: string): 'none' | 'silent' | 'poke' => {
	const combined = (text + ' ' + reasoning).trim();
	if (!combined) return 'none';

	// Patterns where the model is CLEARLY just about to emit a tool call or XML block
	// We can silently continue these to avoid UI noise
	const silentPatterns = [
		// Ends with Action: but no content (ReAct style)
		/Action:\s*$/i,
		// Ends with a tool call opening but no content
		/<function_calls>\s*$/is,
		/<invoke\s+name="[^"]*"\s*>\s*$/is,
		// Ends with "I will now use the [X] tool to [Y]:"
		/(?:I will|I'll|Let me|I'm going to|I'll now|I will now)\s+(?:use|call|invoke|execute)\s+(?:the\s+)?(?:[a-zA-Z0-9_-]+)\s+tool\s+to\s+[^.!?]*:\s*$/i,
		// Ends with a very specific "About to act" pattern
		/(?:Based on the above,|Therefore,|So,|I'll start by|I will begin by)\s+(?:I will|I'll|I'm going to)\s+(?:now\s+)?(?:read|edit|search|run|check|fix|update|create|delete)\s+[^.!?]*:\s*$/i,
	];

	if (silentPatterns.some(p => p.test(combined))) return 'silent';

	// Patterns indicating the LLM intended to call a tool but stopped at a more ambiguous point
	const pokePatterns = [
		// Interrupted intent to use a common tool at the end of a sentence
		/(?:I will|I'll|Let me|I'm going to|I'll now|I will now)\s+(?:read|edit|search|run|check|fix|update|create|delete|list|get|inspect|use|call|invoke|open|execute)\b[^.!?]*$/i,
		// ReAct style thought without action
		/Thought:\s*(?!.*Action:)/is,
		// Unclosed XML tags (already started but not finished)
		/<function_calls>(?!.*<\/function_calls>)/is,
		/<invoke\s+name="[^"]*"(?!.*<\/invoke>)/is,
		// Ends with a plan step but no action follows
		/Plan:\s*\d+\.\s+.*$/is,
	];

	if (pokePatterns.some(p => p.test(combined))) return 'poke';

	return 'none';
};


const findStagingSelectionIndex = (currentSelections: StagingSelectionItem[] | undefined, newSelection: StagingSelectionItem): number | null => {
	if (!currentSelections) return null

	for (let i = 0; i < currentSelections.length; i += 1) {
		const s = currentSelections[i]

		if (s.uri.fsPath !== newSelection.uri.fsPath) continue

		if (s.type === 'File' && newSelection.type === 'File') {
			return i
		}
		if (s.type === 'CodeSelection' && newSelection.type === 'CodeSelection') {
			if (s.uri.fsPath !== newSelection.uri.fsPath) continue
			// if there's any collision return true
			const [oldStart, oldEnd] = s.range
			const [newStart, newEnd] = newSelection.range
			if (oldStart !== newStart || oldEnd !== newEnd) continue
			return i
		}
		if (s.type === 'Folder' && newSelection.type === 'Folder') {
			return i
		}
	}
	return null
}


/*

Store a checkpoint of all "before" files on each x.
x's show up before user messages and LLM edit tool calls.

x     A          (edited A -> A')
(... user modified changes ...)
User message

x     A' B C     (edited A'->A'', B->B', C->C')
LLM Edit
x
LLM Edit
x
LLM Edit


INVARIANT:
A checkpoint appears before every LLM message, and before every user message (before user really means directly after LLM is done).
*/


type UserMessageType = ChatMessage & { role: 'user' }
type UserMessageState = UserMessageType['state']
const defaultMessageState: UserMessageState = {
	stagingSelections: [],
	isBeingEdited: false,
}

// a 'thread' means a chat message history

type WhenMounted = {
	textAreaRef: { current: HTMLTextAreaElement | null }; // the textarea that this thread has, gets set in SidebarChat
	scrollToBottom: () => void;
}



export type ThreadType = {
	id: string; // store the id here too
	createdAt: string; // ISO string
	lastModified: string; // ISO string

	messages: ChatMessage[];
	filesWithUserChanges: Set<string>;

	// this doesn't need to go in a state object, but feels right
	state: {
		currCheckpointIdx: number | null; // the latest checkpoint we're at (null if not at a particular checkpoint, like if the chat is streaming, or chat just finished and we haven't clicked on a checkpt)

		stagingSelections: StagingSelectionItem[];
		focusedMessageIdx: number | undefined; // index of the user message that is being edited (undefined if none)

		linksOfMessageIdx: { // eg. link = linksOfMessageIdx[4]['RangeFunction']
			[messageIdx: number]: {
				[codespanName: string]: CodespanLocationLink
			}
		}


		mountedInfo?: {
			whenMounted: Promise<WhenMounted>
			_whenMountedResolver: (res: WhenMounted) => void
			mountedIsResolvedRef: { current: boolean };
		}


		autoContinueEnabled: boolean;

		// Workflow tracking
		activeWorkflow: ActiveWorkflow | null;
		queueBehavior: QueueBehavior;

		// Student mode session state
		studentSession?: StudentSession;

		// Skills system: map of skill name to its instructions/content
		loadedSkills: { [skillName: string]: string };
	};
}

type ChatThreads = {
	[id: string]: undefined | ThreadType;
}


export type ThreadsState = {
	allThreads: ChatThreads;
	currentThreadId: string; // intended for internal use only
}

export type IsRunningType =
	| 'LLM' // the LLM is currently streaming
	| 'tool' // whether a tool is currently running
	| 'awaiting_user' // awaiting user call
	| 'idle' // nothing is running now, but the chat should still appear like it's going (used in-between calls)
	| undefined

export type ThreadStreamState = {
	[threadId: string]: undefined | {
		isRunning: undefined;
		error?: { message: string, fullError: Error | null, };
		llmInfo?: undefined;
		toolInfo?: undefined;
		interrupt?: undefined;
		tokenUsage?: { used: number, total: number, percentage: number };
	} | { // an assistant message is being written
		isRunning: 'LLM';
		error?: undefined;
		llmInfo: {
			displayContentSoFar: string;
			reasoningSoFar: string;
			toolCallsSoFar: RawToolCallObj[] | null;
			_rawTextBeforeStripping?: string; // For XML tool call detection in UI
			reactPhase?: ReActPhase | null; // Current ReAct phase for UI
			textDelta?: string; // Raw chunk for direct streaming
			reasoningDelta?: string; // Raw reasoning chunk for direct streaming
		};
		toolInfo?: undefined;
		interrupt: Promise<() => void>; // calling this should have no effect on state - would be too confusing. it just cancels the tool
		tokenUsage?: { used: number, total: number, percentage: number };
	} | { // a tool is being run
		isRunning: 'tool';
		error?: undefined;
		llmInfo?: undefined;
		toolInfo: {
			toolName: ToolName;
			toolParams: ToolCallParams<ToolName>;
			id: string;
			content: string;
			rawParams: RawToolParamsObj;
			mcpServerName: string | undefined;
		};
		interrupt: Promise<() => void>;
		tokenUsage?: { used: number, total: number, percentage: number };
	} | {
		isRunning: 'awaiting_user';
		error?: undefined;
		llmInfo?: undefined;
		toolInfo?: undefined;
		interrupt?: undefined;
		tokenUsage?: { used: number, total: number, percentage: number };
	} | {
		isRunning: 'idle';
		error?: undefined;
		llmInfo?: undefined;
		toolInfo?: undefined;
		interrupt: 'not_needed' | Promise<() => void>; // calling this should have no effect on state - would be too confusing. it just cancels the tool
		tokenUsage?: { used: number, total: number, percentage: number };
	}
}

const newThreadObject = () => {
	const now = new Date().toISOString()
	return {
		id: generateUuid(),
		createdAt: now,
		lastModified: now,
		messages: [],
		state: {
			currCheckpointIdx: null,
			stagingSelections: [],
			focusedMessageIdx: undefined,
			linksOfMessageIdx: {},
			autoContinueEnabled: false,
			activeWorkflow: null,
			queueBehavior: 'wait_for_workflow',
			loadedSkills: {},
		},
		filesWithUserChanges: new Set()
	} satisfies ThreadType
}






export interface IChatThreadService {
	readonly _serviceBrand: undefined;

	readonly state: ThreadsState;
	readonly streamState: ThreadStreamState; // not persistent

	onDidChangeCurrentThread: Event<void>;
	onDidChangeStreamState: Event<{ threadId: string }>

	getCurrentThread(): ThreadType;
	openNewThread(): void;
	switchToThread(threadId: string): void;

	// thread selector
	deleteThread(threadId: string): void;
	duplicateThread(threadId: string): void;

	// exposed getters/setters
	// these all apply to current thread
	getCurrentMessageState: (messageIdx: number) => UserMessageState
	setCurrentMessageState: (messageIdx: number, newState: Partial<UserMessageState>) => void
	getCurrentThreadState: () => ThreadType['state']
	setCurrentThreadState: (newState: Partial<ThreadType['state']>) => void

	// you can edit multiple messages - the one you're currently editing is "focused", and we add items to that one when you press cmd+L.
	getCurrentFocusedMessageIdx(): number | undefined;
	isCurrentlyFocusingMessage(): boolean;
	setCurrentlyFocusedMessageIdx(messageIdx: number | undefined): void;

	popStagingSelections(numPops?: number): void;
	addNewStagingSelection(newSelection: StagingSelectionItem): void;

	dangerousSetState: (newState: ThreadsState) => void;
	resetState: () => void;

	// // current thread's staging selections
	// closeCurrentStagingSelectionsInMessage(opts: { messageIdx: number }): void;
	// closeCurrentStagingSelectionsInThread(): void;

	// codespan links (link to symbols in the markdown)
	getCodespanLink(opts: { codespanStr: string, messageIdx: number, threadId: string }): CodespanLocationLink | undefined;
	addCodespanLink(opts: { newLinkText: string, newLinkLocation: CodespanLocationLink, messageIdx: number, threadId: string }): void;
	generateCodespanLink(opts: { codespanStr: string, threadId: string }): Promise<CodespanLocationLink>;
	getRelativeStr(uri: URI): string | undefined

	// entry pts
	abortRunning(threadId: string): Promise<void>;
	dismissStreamError(threadId: string): void;

	// call to edit a message
	editUserMessageAndStreamResponse({ userMessage, messageIdx, threadId }: { userMessage: string, messageIdx: number, threadId: string }): Promise<void>;

	// call to add a message
	addUserMessageAndStreamResponse({ userMessage, threadId, images, selections }: { userMessage: string, threadId: string, images?: ImageAttachment[], selections?: StagingSelectionItem[] }): Promise<void>;

	// approve/reject/skip
	approveLatestToolRequest(threadId: string, toolId?: string): void;
	rejectLatestToolRequest(threadId: string, toolId?: string): void;
	skipLatestToolRequest(threadId: string, toolId?: string): void;
	submitToolResult(threadId: string, toolId: string, result: any): void;

	// jump to history
	jumpToCheckpointBeforeMessageIdx(opts: { threadId: string, messageIdx: number, jumpToUserModified: boolean }): void;

	// message queue
	getQueuedMessagesCount(threadId: string): number;
	getQueuedMessages(threadId: string): Array<{ userMessage: string, selections?: StagingSelectionItem[], images?: ImageAttachment[] }>;
	removeQueuedMessage(threadId: string, index: number): void;
	clearMessageQueue(threadId: string): void;
	forceSendQueuedMessage(threadId: string, index: number): Promise<void>;

	focusCurrentChat: () => Promise<void>
	blurCurrentChat: () => Promise<void>

	getAutoContinuePreference(threadId: string): boolean;
	setAutoContinuePreference(threadId: string, enabled: boolean): void;

	// Task planning
	getTaskPlan(threadId: string): TaskPlan[];
	createTask(threadId: string, description: string, dependencies?: string[]): string;
	updateTaskStatus(threadId: string, taskId: string, status: TaskPlan['status']): void;
	deleteTask(threadId: string, taskId: string): void;
	clearTaskPlan(threadId: string): void;

	// Student mode session
	getStudentSession(threadId: string): StudentSession | undefined;
	initStudentSession(threadId: string): StudentSession;
	addExercise(threadId: string, exercise: Omit<StudentExercise, 'hintLevel' | 'status' | 'createdAt'>): StudentExercise;
	updateExerciseHintLevel(threadId: string, exerciseId: string): number;
	completeExercise(threadId: string, exerciseId: string): void;
	addConceptLearned(threadId: string, concept: string): void;

	// Skills
	loadSkill(threadId: string, skillName: string, instructions: string): void;

	// Workflow management
	getActiveWorkflow(threadId: string): ThreadType['state']['activeWorkflow'];
	setActiveWorkflowStatus(threadId: string, status: ActiveWorkflow['status']): void;
	clearWorkflow(threadId: string): void;
}

export const IChatThreadService = createDecorator<IChatThreadService>('chatThreadService');
class ChatThreadService extends Disposable implements IChatThreadService {
	_serviceBrand: undefined;

	// this fires when the current thread changes at all (a switch of currentThread, or a message added to it, etc)
	private readonly _onDidChangeCurrentThread = new Emitter<void>();
	readonly onDidChangeCurrentThread: Event<void> = this._onDidChangeCurrentThread.event;

	private readonly _onDidChangeStreamState = new Emitter<{ threadId: string }>();
	readonly onDidChangeStreamState: Event<{ threadId: string }> = this._onDidChangeStreamState.event;

	readonly streamState: ThreadStreamState = {}
	state: ThreadsState // allThreads is persisted, currentThread is not

	// Message queue: stores pending messages per thread
	private messageQueue: { [threadId: string]: Array<{ userMessage: string, selections?: StagingSelectionItem[], images?: ImageAttachment[] }> } = {}

	// Task planning: stores task plans per thread
	private taskPlans: { [threadId: string]: TaskPlan[] } = {}

	// PERFORMANCE: Debounce timer for storage
	private _storeThreadsDebounceTimer: any = null;
	private readonly MAX_THREADS_IN_STORAGE = 5;
	private _cleanupInterval: any = null;

	// used in checkpointing
	// private readonly _userModifiedFilesToCheckInCheckpoints = new LRUCache<string, null>(50)



	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IVoidModelService private readonly _voidModelService: IVoidModelService,
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IToolsService private readonly _toolsService: IToolsService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IMetricsService private readonly _metricsService: IMetricsService,
		@IEditCodeService private readonly _editCodeService: IEditCodeService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IConvertToLLMMessageService private readonly _convertToLLMMessagesService: IConvertToLLMMessageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IDirectoryStrService private readonly _directoryStringService: IDirectoryStrService,
		@IFileService private readonly _fileService: IFileService,
		@IMCPService private readonly _mcpService: IMCPService,
		@IVisionService private readonly _visionService: IVisionService,
		@IModelService private readonly _modelService: IModelService,
		@IToolOrchestrationService private readonly _orchestrationService: IToolOrchestrationService,
	) {
		super()
		this.state = { allThreads: {}, currentThreadId: null as unknown as string } // default state

		const readThreads = this._readAllThreads() || {}

		const allThreads = this._ensureThreadStateDefaults(readThreads)
		this.state = {
			allThreads: allThreads,
			currentThreadId: null as unknown as string, // gets set in startNewThread()
		}

		// always be in a thread
		this.openNewThread()


		// keep track of user-modified files
		const disposablesOfModelId: { [modelId: string]: IDisposable[] } = {}
		this._register(
			this._modelService.onModelAdded(e => {
				const uri = e.uri
				if (!(uri.toString() in disposablesOfModelId)) disposablesOfModelId[uri.toString()] = []
				disposablesOfModelId[uri.toString()].push(
					e.onDidChangeContent(() => {
						const threadId = this.state.currentThreadId
						const thread = this.state.allThreads[threadId]
						if (thread) {
							thread.filesWithUserChanges.add(uri.fsPath)
						}
					})
				)
			})
		)
		this._register(this._modelService.onModelRemoved(e => {
			const uri = e.uri
			if (!(uri.toString() in disposablesOfModelId)) return
			disposablesOfModelId[uri.toString()].forEach(d => d.dispose())
			delete disposablesOfModelId[uri.toString()]
		}))

	}

	private _clearUserChanges(threadId: string) {
		const thread = this.state.allThreads[threadId]
		if (thread) {
			thread.filesWithUserChanges.clear()
		}
	}

	override dispose() {
		if (this._storeThreadsDebounceTimer) {
			clearTimeout(this._storeThreadsDebounceTimer);
			this._storeAllThreadsNow(this.state.allThreads);
		}
		if (this._cleanupInterval) {
			clearInterval(this._cleanupInterval);
			this._cleanupInterval = null;
		}
		super.dispose();
	}

	async focusCurrentChat() {
		const threadId = this.state.currentThreadId
		const thread = this.state.allThreads[threadId]
		if (!thread) return
		const s = await thread.state.mountedInfo?.whenMounted
		if (!this.isCurrentlyFocusingMessage()) {
			s?.textAreaRef.current?.focus()
		}
	}
	async blurCurrentChat() {
		const threadId = this.state.currentThreadId
		const thread = this.state.allThreads[threadId]
		if (!thread) return
		const s = await thread.state.mountedInfo?.whenMounted
		if (!this.isCurrentlyFocusingMessage()) {
			s?.textAreaRef.current?.blur()
		}
	}



	dangerousSetState = (newState: ThreadsState) => {
		this.state = newState
		this._onDidChangeCurrentThread.fire()
	}
	resetState = () => {
		// MEMORY FIX: Clean up all auxiliary data when resetting state
		this.toolCallHistory = {};
		this.messageQueue = {};
		this.taskPlans = {};

		this.state = { allThreads: {}, currentThreadId: null as unknown as string } // see constructor
		this.openNewThread()
		this._onDidChangeCurrentThread.fire()
	}

	// !!! this is important for properly restoring URIs from storage
	// should probably re-use code from void/src/vs/base/common/marshalling.ts instead. but this is simple enough
	private _convertThreadDataFromStorage(threadsStr: string): ChatThreads {
		return JSON.parse(threadsStr, (key, value) => {
			if (value && typeof value === 'object' && value.$mid === 1) { // $mid is the MarshalledId. $mid === 1 means it is a URI
				return URI.from(value); // TODO URI.revive instead of this?
			}
			return value;
		});
	}

	private _readAllThreads(): ChatThreads | null {
		const threadsStr = this._storageService.get(THREAD_STORAGE_KEY, StorageScope.APPLICATION);
		if (!threadsStr) {
			return null
		}
		const threads = this._convertThreadDataFromStorage(threadsStr);

		return threads
	}

	private _storeAllThreads(threads: ChatThreads) {
		if (this._storeThreadsDebounceTimer) {
			clearTimeout(this._storeThreadsDebounceTimer);
		}

		this._storeThreadsDebounceTimer = setTimeout(() => {
			this._storeAllThreadsNow(threads);
			this._storeThreadsDebounceTimer = null;
		}, 1000); // 1 second debounce
	}

	private _storeAllThreadsNow(threads: ChatThreads) {
		const normalizedThreads = this._ensureThreadStateDefaults(threads)

		// PERFORMANCE: Prune old threads to prevent storage bloat and high memory usage
		const sortedThreadIds = Object.keys(normalizedThreads).sort((a, b) => {
			const timeA = new Date(normalizedThreads[a]?.lastModified ?? 0).getTime();
			const timeB = new Date(normalizedThreads[b]?.lastModified ?? 0).getTime();
			return timeB - timeA; // Descending order (newest first)
		});

		const prunedThreads: ChatThreads = {};
		// Keep the 20 most recent threads
		const threadIdsToKeep = sortedThreadIds.slice(0, this.MAX_THREADS_IN_STORAGE);
		threadIdsToKeep.forEach(id => {
			prunedThreads[id] = normalizedThreads[id];
		});

		// MEMORY FIX: Clean up auxiliary data for pruned threads
		const threadIdsToPrune = sortedThreadIds.slice(this.MAX_THREADS_IN_STORAGE);
		for (const threadId of threadIdsToPrune) {
			delete this.toolCallHistory[threadId];
			delete this.messageQueue[threadId];
			delete this.taskPlans[threadId];

			// ALSO: If we are pruning the current thread (unlikely but possible), clear it
			if (this.state.currentThreadId === threadId) {
				this.openNewThread();
			}
		}

		// Convert Sets to Arrays for JSON serialization
		const serializableThreads: any = {}; // Start with empty object
		for (const id of threadIdsToKeep) {
			const thread = normalizedThreads[id];
			if (!thread) continue;

			// Clone the thread to avoid modifying the original state
			const threadClone = { ...thread };
			if (threadClone.filesWithUserChanges instanceof Set) {
				threadClone.filesWithUserChanges = Array.from(threadClone.filesWithUserChanges) as any;
			}

			serializableThreads[id] = threadClone;
		}

		const serializedThreads = JSON.stringify(serializableThreads);
		this._storageService.store(
			THREAD_STORAGE_KEY,
			serializedThreads,
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}

	private _ensureThreadStateDefaults(threads: ChatThreads): ChatThreads {
		const nextThreads: ChatThreads = {}
		for (const [threadId, thread] of Object.entries(threads)) {
			if (!thread) {
				nextThreads[threadId] = thread
				continue
			}
			nextThreads[threadId] = {
				...thread,
				filesWithUserChanges: new Set(Array.isArray(thread.filesWithUserChanges) ? thread.filesWithUserChanges : []),
				state: {
					...thread.state,
					autoContinueEnabled: thread.state?.autoContinueEnabled ?? false,
					activeWorkflow: thread.state?.activeWorkflow ?? null,
					queueBehavior: thread.state?.queueBehavior ?? 'wait_for_workflow',
				},
			}
		}
		return nextThreads
	}


	// this should be the only place this.state = ... appears besides constructor
	private _setState(state: Partial<ThreadsState>, doNotRefreshMountInfo?: boolean) {
		const newState = {
			...this.state,
			...state
		}

		this.state = newState

		this._onDidChangeCurrentThread.fire()


		// if we just switched to a thread, update its current stream state if it's not streaming to possibly streaming
		const threadId = newState.currentThreadId
		const streamState = this.streamState[threadId]
		if (streamState?.isRunning === undefined && !streamState?.error) {

			// set streamState
			const messages = newState.allThreads[threadId]?.messages
			const lastMessage = messages && messages[messages.length - 1]
			// if awaiting user but stream state doesn't indicate it (happens if restart Void)
			if (lastMessage && lastMessage.role === 'tool' && lastMessage.type === 'tool_request')
				this._setStreamState(threadId, { isRunning: 'awaiting_user', })

			// if running now but stream state doesn't indicate it (happens if restart Void), cancel that last tool
			if (lastMessage && lastMessage.role === 'tool' && lastMessage.type === 'running_now') {

				this._updateLatestTool(threadId, { role: 'tool', type: 'rejected', content: lastMessage.content, id: lastMessage.id, rawParams: lastMessage.rawParams, result: null, name: lastMessage.name, params: lastMessage.params, mcpServerName: lastMessage.mcpServerName })
			}

		}


		// if we did not just set the state to true, set mount info
		if (doNotRefreshMountInfo) return

		let whenMountedResolver: (w: WhenMounted) => void
		const whenMountedPromise = new Promise<WhenMounted>((res) => whenMountedResolver = res)

		this._setThreadState(threadId, {
			mountedInfo: {
				whenMounted: whenMountedPromise,
				mountedIsResolvedRef: { current: false },
				_whenMountedResolver: (w: WhenMounted) => {
					whenMountedResolver(w)
					const mountInfo = this.state.allThreads[threadId]?.state.mountedInfo
					if (mountInfo) mountInfo.mountedIsResolvedRef.current = true
				},
			}
		}, true) // do not trigger an update



	}


	private _setStreamState(threadId: string, state: ThreadStreamState[string]) {
		// Preserve tokenUsage when updating state
		const currentTokenUsage = this.streamState[threadId]?.tokenUsage;
		if (state && currentTokenUsage) {
			state.tokenUsage = currentTokenUsage;
		}
		this.streamState[threadId] = state
		this._onDidChangeStreamState.fire({ threadId })

		// MEMORY OPTIMIZATION: If state is undefined, delete the key to free memory
		// This ensures the llmInfo with large strings is garbage collected
		if (state === undefined) {
			delete this.streamState[threadId];
		}
	}


	// ---------- streaming ----------



	private _currentModelSelectionProps = () => {
		// these settings should not change throughout the loop (eg anthropic breaks if you change its thinking mode and it's using tools)
		const featureName: FeatureName = 'Chat'
		const modelSelection = this._settingsService.state.modelSelectionOfFeature[featureName]
		const modelSelectionOptions = modelSelection ? this._settingsService.state.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName] : undefined
		return { modelSelection, modelSelectionOptions }
	}



	private _swapOutLatestStreamingToolWithResult = (threadId: string, tool: ChatMessage & { role: 'tool' }) => {
		const messages = this.state.allThreads[threadId]?.messages
		if (!messages) return false
		const lastMsg = messages[messages.length - 1]
		if (!lastMsg) return false

		if (lastMsg.role === 'tool' && lastMsg.type !== 'invalid_params') {
			this._editMessageInThread(threadId, messages.length - 1, tool)
			return true
		}
		return false
	}
	private _updateLatestTool = (threadId: string, tool: ChatMessage & { role: 'tool' }) => {
		const swapped = this._swapOutLatestStreamingToolWithResult(threadId, tool)
		if (swapped) return
		this._addMessageToThread(threadId, tool)
	}

	approveLatestToolRequest(threadId: string, toolId?: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		let toolMsgIdx = -1;
		if (toolId) {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request' && m.id === toolId);
		} else {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request');
		}

		if (toolMsgIdx === -1) return;

		const toolMsg = thread.messages[toolMsgIdx] as ToolMessage<ToolName> & { type: 'tool_request' };

		this._wrapRunAgentToNotify(
			this._runChatAgent({ callThisToolFirst: toolMsg, threadId, ...this._currentModelSelectionProps() })
			, threadId
		)
	}
	rejectLatestToolRequest(threadId: string, toolId?: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		let toolMsgIdx = -1;
		if (toolId) {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request' && m.id === toolId);
		} else {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request');
		}

		if (toolMsgIdx === -1) return;

		const toolMsg = thread.messages[toolMsgIdx] as ToolMessage<ToolName> & { type: 'tool_request' };

		let params: ToolCallParams<ToolName> = toolMsg.params

		const { name, id, rawParams, mcpServerName } = toolMsg

		const errorMessage = this.toolErrMsgs.rejected
		this._updateLatestTool(threadId, { role: 'tool', type: 'rejected', params: params, name: name, content: errorMessage, result: null, id, rawParams, mcpServerName })
		this._setStreamState(threadId, undefined)
	}

	skipLatestToolRequest(threadId: string, toolId?: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		let toolMsgIdx = -1;
		if (toolId) {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request' && m.id === toolId);
		} else {
			toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request');
		}

		if (toolMsgIdx === -1) return;

		const toolMsg = thread.messages[toolMsgIdx] as ToolMessage<ToolName> & { type: 'tool_request' };

		let params: ToolCallParams<ToolName> = toolMsg.params

		const { name, id, rawParams, mcpServerName } = toolMsg

		// Mark as skipped (similar to rejected but with different message)
		const skipMessage = 'Tool skipped by user - continuing with next action'
		this._updateLatestTool(threadId, { role: 'tool', type: 'rejected', params: params, name: name, content: skipMessage, result: null, id, rawParams, mcpServerName })

		// Continue the agent loop instead of stopping
		this._wrapRunAgentToNotify(
			this._runChatAgent({ threadId, ...this._currentModelSelectionProps() })
			, threadId
		)
	}

	submitToolResult(threadId: string, toolId: string, result: any) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		// Find the tool request message
		const toolMsgIdx = findLastIdx(thread.messages, m => m.role === 'tool' && m.type === 'tool_request' && m.id === toolId);
		if (toolMsgIdx === -1) {
			console.warn(`[chatThreadService] submitToolResult: Tool request not found for toolId ${toolId}`);
			return;
		}

		const toolMsg = thread.messages[toolMsgIdx] as ToolMessage<ToolName> & { type: 'tool_request' };
		const { name, rawParams, mcpServerName, thought_signature } = toolMsg;

		console.log(`[chatThreadService] submitToolResult: Submitting result for tool ${name} (id: ${toolId})`);

		// Format the result as a string for the LLM
		let toolResultStr: string;
		try {
			toolResultStr = JSON.stringify(result, null, 2);
		} catch (error) {
			toolResultStr = String(result);
		}

		console.log(`[chatThreadService] submitToolResult: Result: ${toolResultStr.substring(0, 200)}${toolResultStr.length > 200 ? '...' : ''}`);

		// Update the tool message with the result (type: 'success')
		this._updateLatestTool(threadId, {
			role: 'tool',
			type: 'success',
			name: name,
			params: toolMsg.params,
			result: result,
			content: toolResultStr,
			id: toolId,
			rawParams: rawParams,
			mcpServerName: mcpServerName,
			thought_signature: thought_signature
		});

		// Resume the agent directly (without re-executing the tool)
		// We use _runChatAgent without callThisToolFirst so it just continues
		// processing with the tool result we just added to the thread
		console.log(`[chatThreadService] submitToolResult: Resuming agent for thread ${threadId}`);
		this._wrapRunAgentToNotify(
			this._runChatAgent({ threadId, ...this._currentModelSelectionProps() })
			, threadId
		)
	}

	private _computeMCPServerOfToolName = (toolName: string) => {
		return this._mcpService.getMCPTools()?.find(t => t.name === toolName)?.mcpServerName
	}

	async abortRunning(threadId: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		// add assistant message
		if (this.streamState[threadId]?.isRunning === 'LLM') {
			const { displayContentSoFar, reasoningSoFar, toolCallsSoFar } = this.streamState[threadId].llmInfo
			this._addMessageToThread(threadId, { role: 'assistant', displayContent: displayContentSoFar, reasoning: reasoningSoFar, anthropicReasoning: null })
			if (toolCallsSoFar) {
				for (const tc of toolCallsSoFar) {
					this._addMessageToThread(threadId, { role: 'interrupted_streaming_tool', name: tc.name, mcpServerName: this._computeMCPServerOfToolName(tc.name) })
				}
			}
		}
		// add tool that's running
		else if (this.streamState[threadId]?.isRunning === 'tool') {
			const { toolName, toolParams, id, content: content_, rawParams, mcpServerName } = this.streamState[threadId].toolInfo
			const content = content_ || this.toolErrMsgs.interrupted
			this._updateLatestTool(threadId, { role: 'tool', name: toolName, params: toolParams, id, content, rawParams, type: 'rejected', result: null, mcpServerName })
		}
		// reject the tool for the user if relevant
		else if (this.streamState[threadId]?.isRunning === 'awaiting_user') {
			this.rejectLatestToolRequest(threadId)
		}
		else if (this.streamState[threadId]?.isRunning === 'idle') {
			// do nothing
		}

		// interrupt any effects
		const interrupt = await this.streamState[threadId]?.interrupt
		if (typeof interrupt === 'function')
			interrupt()


		this._setStreamState(threadId, undefined)
	}



	private readonly toolErrMsgs = {
		rejected: 'Tool call was rejected by the user.',
		interrupted: 'Tool call was interrupted by the user.',
		errWhenStringifying: (error: any) => `Tool call succeeded, but there was an error stringifying the output.\n${getErrorMessage(error)}`
	}


	// private readonly _currentlyRunningToolInterruptor: { [threadId: string]: (() => void) | undefined } = {}


	// Track tool call history for loop detection
	private toolCallHistory: { [threadId: string]: Array<{ name: string, params: any, result: any, type: string, _paramsKey?: string }> } = {};

	private _truncateToolResult(result: any): any {
		if (typeof result === 'string') {
			if (result.length > MAX_TOOL_RESULT_LENGTH) {
				return result.substring(0, MAX_TOOL_RESULT_LENGTH) + `... (truncated to ${MAX_TOOL_RESULT_LENGTH} characters)`;
			}
			return result;
		}

		if (result && typeof result === 'object') {
			// If it's a ToolResult object (e.g. from read_file)
			if ('content' in result && typeof result.content === 'string') {
				if (result.content.length > MAX_TOOL_RESULT_LENGTH) {
					return {
						...result,
						content: result.content.substring(0, MAX_TOOL_RESULT_LENGTH) + `... (truncated to ${MAX_TOOL_RESULT_LENGTH} characters)`
					};
				}
			}

			// Handle MCP tool results which often have a 'content' array
			if ('content' in result && Array.isArray(result.content)) {
				return {
					...result,
					content: result.content.map((item: any) => {
						if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
							if (item.text.length > MAX_TOOL_RESULT_LENGTH) {
								return { ...item, text: item.text.substring(0, MAX_TOOL_RESULT_LENGTH) + `... (truncated to ${MAX_TOOL_RESULT_LENGTH} characters)` };
							}
						}
						return item;
					})
				};
			}
		}

		return result;
	}

	// MEMORY OPTIMIZATION: Fast param comparison without JSON.stringify
	// Creates a hash key for params to avoid expensive stringify operations
	private _getToolParamsKey(toolName: string, params: any): string {
		if (!params) return toolName;
		// Fast path: extract key identifying fields instead of full stringify
		if (typeof params === 'object') {
			// For common tool params, use specific key fields
			if (params.uri?.fsPath) {
				return `${toolName}:${params.uri.fsPath}`;
			}
			if (params.query) {
				return `${toolName}:${params.query}`;
			}
			if (params.command) {
				return `${toolName}:${params.command}`;
			}
			// Fallback: use tool name + first few keys
			const keyParts = Object.keys(params).slice(0, 3).map(k => {
				const v = params[k];
				if (typeof v === 'string') return `${k}=${v.slice(0, 50)}`;
				if (typeof v === 'number') return `${k}=${v}`;
				if (v?.fsPath) return `${k}=${v.fsPath}`;
				return `${k}=obj`;
			});
			return `${toolName}:${keyParts.join(',')}`;
		}
		return `${toolName}:${String(params)}`;
	}

	// Predictive progress messages based on tool name
	private getPredictiveProgressMessage(toolName: string, params: any): string {
		switch (toolName) {
			case 'ls_dir': return `Exploring directory: ${params.uri?.fsPath || '...'}`;
			case 'read_file': return `Reading file: ${params.uri?.fsPath || '...'}`;
			case 'search_for_files': return `Searching codebase for: "${params.query}"`;
			case 'run_command': return `Executing command: "${params.command}"`;
			case 'edit_file': return `Applying edits to: ${params.uri?.fsPath || '...'}`;
			case 'rewrite_file': return `Rewriting file: ${params.uri?.fsPath || '...'}`;
			case 'get_dir_tree': return `Analyzing project structure...`;
			case 'search_pathnames_only': return `Locating files matching: "${params.query}"`;
			case 'create_plan': return `Architecting implementation plan...`;
			case 'fast_context': return `Morph: Searching for "${params.query}"...`;
			default: return `Executing ${toolName}...`;
		}
	}

	// returns true when the tool call is waiting for user approval
	private _runToolCall = async (
		threadId: string,
		toolName: ToolName,
		toolId: string,
		mcpServerName: string | undefined,
		opts: { preapproved: true, unvalidatedToolParams: RawToolParamsObj, validatedParams: ToolCallParams<ToolName>, thought_signature?: string } | { preapproved: false, unvalidatedToolParams: RawToolParamsObj, thought_signature?: string },
	): Promise<{ awaitingUserApproval?: boolean, interrupted?: boolean }> => {

		// ... internal vars ...
		let toolParams: ToolCallParams<ToolName>
		let toolResult: ToolResult<ToolName>
		let toolResultStr: string

		const isBuiltInTool = isABuiltinToolName(toolName)

		if (!opts.preapproved) {
			try {
				if (isBuiltInTool) {
					const params = this._toolsService.validateParams[toolName](opts.unvalidatedToolParams)
					toolParams = params
				}
				else {
					toolParams = opts.unvalidatedToolParams
				}
			}
			catch (error) {
				const errorMessage = getErrorMessage(error)
				this._addMessageToThread(threadId, { role: 'tool', type: 'invalid_params', rawParams: opts.unvalidatedToolParams, result: null, name: toolName, content: errorMessage, id: toolId, mcpServerName, thought_signature: opts.thought_signature })
				return {}
			}

			// LOOP DETECTION: Check if we've tried this exact failing call recently
			const history = this.toolCallHistory[threadId] || [];
			const lastCall = history[history.length - 1];
			// MEMORY OPTIMIZATION: Use fast key comparison instead of JSON.stringify
			const currentParamsKey = this._getToolParamsKey(toolName, toolParams);
			if (lastCall && lastCall.name === toolName && lastCall.type !== 'success') {
				const lastParamsKey = lastCall._paramsKey || this._getToolParamsKey(lastCall.name, lastCall.params);
				if (lastParamsKey === currentParamsKey) {
					// We are repeating a failing call. Add a note to help the agent break out.
					console.warn(`[chatThreadService] Loop detected for tool ${toolName}.`);
					// We don't block it here, but we will ensure the result contains a hint for the agent.
				}
			}

			if (toolName === 'edit_file') { this._addToolEditCheckpoint({ threadId, uri: (toolParams as BuiltinToolCallParams['edit_file']).uri }) }
			if (toolName === 'rewrite_file') { this._addToolEditCheckpoint({ threadId, uri: (toolParams as BuiltinToolCallParams['rewrite_file']).uri }) }

			const approvalType = isBuiltInTool ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools'
			if (approvalType) {
				const autoApprove = this._settingsService.state.globalSettings.autoApprove[approvalType]
				const content = toolName === 'render_form' || toolName === 'create_quiz' ? 'Please complete the interactive content below.' : '(Awaiting user permission...)'
				this._addMessageToThread(threadId, { role: 'tool', type: 'tool_request', content, result: null, name: toolName, params: toolParams, id: toolId, rawParams: opts.unvalidatedToolParams, mcpServerName, thought_signature: opts.thought_signature })

				// Special case: render_form and create_quiz never execute - they stay in tool_request state so the UI can display the interactive content
				if (toolName === 'render_form' || toolName === 'create_quiz') {
					return { awaitingUserApproval: true }
				}

				if (!autoApprove) {
					return { awaitingUserApproval: true }
				}
			}
		}
		else {
			toolParams = opts.validatedParams
		}

		// Use predictive progress message
		const progressMessage = this.getPredictiveProgressMessage(toolName, toolParams);
		const runningTool = { role: 'tool', type: 'running_now', name: toolName, params: toolParams, content: progressMessage, result: null, id: toolId, rawParams: opts.unvalidatedToolParams, mcpServerName, thought_signature: opts.thought_signature } as const
		this._updateLatestTool(threadId, runningTool)

		let interrupted = false
		let resolveInterruptor: (r: () => void) => void = () => { }
		const interruptorPromise = new Promise<() => void>(res => { resolveInterruptor = res })
		try {

			this._setStreamState(threadId, { isRunning: 'tool', interrupt: interruptorPromise, toolInfo: { toolName, toolParams, id: toolId, content: progressMessage, rawParams: opts.unvalidatedToolParams, mcpServerName } })

			if (isBuiltInTool) {
				const { result, interruptTool } = await this._toolsService.callTool[toolName](toolParams as any, {
					onData: (data) => {
						// Stream partial results to the UI for immersion
						const currentStreamState = this.streamState[threadId];
						if (currentStreamState?.isRunning === 'tool') {
							// Update the content with the latest data (keep it brief)
							const truncatedData = data.length > 500 ? data.slice(-500) : data;
							this._setStreamState(threadId, {
								...currentStreamState,
								toolInfo: {
									...currentStreamState.toolInfo,
									content: truncatedData
								}
							});
						}
					}
				})
				const interruptor = () => { interrupted = true; interruptTool?.() }
				resolveInterruptor(interruptor)

				toolResult = await result
			}
			else {
				const mcpTools = this._mcpService.getMCPTools()
				const mcpTool = mcpTools?.find(t => t.name === toolName)
				if (!mcpTool) { throw new Error(`MCP tool ${toolName} not found`) }
				if (!mcpTool.mcpServerName) { throw new Error(`MCP tool ${toolName} has no server name`) }

				resolveInterruptor(() => { })

				toolResult = (await this._mcpService.callMCPTool({
					serverName: mcpTool.mcpServerName,
					toolName: toolName,
					params: toolParams
				})).result
			}

			if (interrupted) { return { interrupted: true } } // the tool result is added where we interrupt, not here
		}
		catch (error) {
			resolveInterruptor(() => { }) // resolve for the sake of it
			if (interrupted) { return { interrupted: true } } // the tool result is added where we interrupt, not here

			const errorMessage = getErrorMessage(error)
			this._updateLatestTool(threadId, { role: 'tool', type: 'tool_error', params: toolParams, result: errorMessage, name: toolName, content: errorMessage, id: toolId, rawParams: opts.unvalidatedToolParams, mcpServerName, thought_signature: opts.thought_signature })
			return {}
		}

		// 4. stringify the result to give to the LLM
		try {
			if (isBuiltInTool) {
				toolResultStr = this._toolsService.stringOfResult[toolName](toolParams as any, toolResult as any)
			}
			// For MCP tools, handle the result based on its type
			else {
				toolResultStr = this._mcpService.stringifyResult(toolResult as RawMCPToolCall)
			}

			// LOOP DETECTION HINT: If we are repeating a failing call, add a hint for the agent
			const history = this.toolCallHistory[threadId] || [];
			// MEMORY OPTIMIZATION: Use fast key comparison instead of JSON.stringify on entire history
			const currentParamsKey = this._getToolParamsKey(toolName, toolParams);
			// Only check last 10 calls for performance
			const recentHistory = history.slice(-10);
			const isRepeat = recentHistory.some(h => {
				if (h.name !== toolName || h.type === 'success') return false;
				const historyParamsKey = h._paramsKey || this._getToolParamsKey(h.name, h.params);
				return historyParamsKey === currentParamsKey;
			});
			if (isRepeat) {
				toolResultStr += "\n\nNOTE: I've noticed you've tried this exact call before with a similar result. Please consider if you need to change your parameters, try a different tool, or ask the user for more information if you are stuck.";
			}
		} catch (error) {
			const errorMessage = this.toolErrMsgs.errWhenStringifying(error)
			const fullErrorStr = `${errorMessage}\n\nNOTE: If you've tried this before, consider a different approach.`;
			this._updateLatestTool(threadId, { role: 'tool', type: 'tool_error', params: toolParams, result: errorMessage, name: toolName, content: fullErrorStr, id: toolId, rawParams: opts.unvalidatedToolParams, mcpServerName, thought_signature: opts.thought_signature })

			// Update history
			if (!this.toolCallHistory[threadId]) this.toolCallHistory[threadId] = [];
			this.toolCallHistory[threadId].push({ name: toolName, params: toolParams, result: this._truncateToolResult(errorMessage), type: 'error', _paramsKey: this._getToolParamsKey(toolName, toolParams) });
			// MEMORY OPTIMIZATION: Prune history if it exceeds max limit
			if (this.toolCallHistory[threadId].length > MAX_TOOL_CALL_HISTORY_PER_THREAD) {
				this.toolCallHistory[threadId] = this.toolCallHistory[threadId].slice(-MAX_TOOL_CALL_HISTORY_PER_THREAD);
			}

			// Auto-update task status when tools fail
			this._updateTaskStatusFromToolExecution(threadId, toolName, 'error')

			return {}
		}

		// 5. add to history and keep going
		this._updateLatestTool(threadId, { role: 'tool', type: 'success', params: toolParams, result: toolResult, name: toolName, content: toolResultStr, id: toolId, rawParams: opts.unvalidatedToolParams, mcpServerName, thought_signature: opts.thought_signature })

		// SIDE EFFECT: if it's load_skill, update the thread's loadedSkills
		if (toolName === 'load_skill' && (toolResult as any).success) {
			this.loadSkill(threadId, (toolResult as any).skill_name, (toolResult as any).instructions);
		}

		// Update history
		if (!this.toolCallHistory[threadId]) this.toolCallHistory[threadId] = [];

		// MEMORY OPTIMIZATION: Truncate large tool results in history to prevent excessive memory usage
		const resultToStore = this._truncateToolResult(toolResult);

		this.toolCallHistory[threadId].push({ name: toolName, params: toolParams, result: resultToStore, type: 'success', _paramsKey: this._getToolParamsKey(toolName, toolParams) });
		// MEMORY OPTIMIZATION: Prune history if it exceeds max limit
		if (this.toolCallHistory[threadId].length > MAX_TOOL_CALL_HISTORY_PER_THREAD) {
			this.toolCallHistory[threadId] = this.toolCallHistory[threadId].slice(-MAX_TOOL_CALL_HISTORY_PER_THREAD);
		}

		// Auto-update task status when tools complete successfully
		this._updateTaskStatusFromToolExecution(threadId, toolName, 'success')

		return {}
	};




	private async _runChatAgent({
		threadId,
		modelSelection,
		modelSelectionOptions,
		callThisToolFirst,
		orchestrationResult,
	}: {
		threadId: string,
		modelSelection: ModelSelection | null,
		modelSelectionOptions: ModelSelectionOptions | undefined,
		callThisToolFirst?: ToolMessage<ToolName> & { type: 'tool_request' }
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
	}) {


		let interruptedWhenIdle = false
		const idleInterruptor = Promise.resolve(() => { interruptedWhenIdle = true })
		// _runToolCall does not need setStreamState({idle}) before it, but it needs it after it. (handles its own setStreamState)

		// above just defines helpers, below starts the actual function
		const { chatMode } = this._settingsService.state.globalSettings // should not change as we loop even if user changes it, so it goes here
		const { overridesOfModel } = this._settingsService.state

		let nMessagesSent = 0
		let nPokesThisLoop = 0
		let shouldSendAnotherMessage = true
		let isRunningWhenEnd: IsRunningType = undefined

		// before enter loop, call tool
		if (callThisToolFirst) {
			const { interrupted } = await this._runToolCall(threadId, callThisToolFirst.name, callThisToolFirst.id, callThisToolFirst.mcpServerName, { preapproved: true, unvalidatedToolParams: callThisToolFirst.rawParams, validatedParams: callThisToolFirst.params, thought_signature: callThisToolFirst.thought_signature })
			if (interrupted) {
				this._setStreamState(threadId, undefined)
				this._addUserCheckpoint({ threadId })

			}
		}
		this._setStreamState(threadId, { isRunning: 'idle', interrupt: 'not_needed' })  // just decorative, for clarity


		let lastYieldTime = Date.now()

		// tool use loop
		while (shouldSendAnotherMessage) {
			// PERFORMANCE: Yield to event loop if we've spent more than 16ms to prevent UI freezing
			if (Date.now() - lastYieldTime > 16) {
				await new Promise(resolve => setTimeout(resolve, 0));
				lastYieldTime = Date.now();
			}

			// false by default each iteration
			shouldSendAnotherMessage = false
			isRunningWhenEnd = undefined
			nMessagesSent += 1

			// Safety check: prevent infinite loops in agent mode
			const maxAgentIterations = this._settingsService.state.globalSettings.maxAgentIterations || 50
			if (chatMode === 'code' && nMessagesSent > maxAgentIterations) {
				console.warn(`[chatThreadService] Agent mode exceeded maximum iterations (${maxAgentIterations}), stopping loop`)
				this._setStreamState(threadId, {
					isRunning: undefined,
					error: {
						message: `Agent exceeded maximum iterations (${maxAgentIterations}). The task may be too complex or the AI may be stuck in a loop.`,
						fullError: null
					}
				})
				break
			}

			this._setStreamState(threadId, { isRunning: 'idle', interrupt: idleInterruptor })

			const chatMessages = this.state.allThreads[threadId]?.messages ?? []
			const loadedSkills = this.state.allThreads[threadId]?.state.loadedSkills
			console.log(`[_runChatAgent] threadId: ${threadId}, messages count: ${chatMessages.length}`);
			if (chatMessages.length > 0) {
				const lastMsg = chatMessages[chatMessages.length - 1];
				console.log(`[_runChatAgent] Last message role: ${lastMsg.role}`);
				if (lastMsg.role === 'user') {
					console.log(`[_runChatAgent] Last user message content length: ${(lastMsg as any).content?.length || 0}`);
				}
			}
			let { messages, separateSystemMessage, tokenUsage } = await this._convertToLLMMessagesService.prepareLLMChatMessages({
				chatMessages,
				modelSelection,
				chatMode,
				loadedSkills,
				orchestrationResult
			})

			// Update stream state with token usage
			this._setStreamState(threadId, { isRunning: 'idle', interrupt: idleInterruptor, tokenUsage })

			if (interruptedWhenIdle) {
				this._setStreamState(threadId, undefined)
				return
			}

			// Initialize ReAct parser for this iteration
			const reactParser = new StreamingXMLParser();
			let currentReActPhase: ReActPhase | null = null;
			let lastParsedLength = 0;

			let lastUpdateTime = 0;
			const UI_UPDATE_THROTTLE_MS = 50; // ~20 FPS - smoother for streaming, still CPU-friendly

			let shouldRetryLLM = true
			let nAttempts = 0
			while (shouldRetryLLM) {
				shouldRetryLLM = false
				nAttempts += 1

				type ResTypes =
					| { type: 'llmDone', toolCalls?: RawToolCallObj[], info: { fullText: string, fullReasoning: string, anthropicReasoning: AnthropicReasoning[] | null }, usage?: { promptTokens: number; completionTokens: number; } }
					| { type: 'llmError', error?: { message: string; fullError: Error | null; } }
					| { type: 'llmAborted' }

				let resMessageIsDonePromise: (res: ResTypes) => void // resolves when user approves this tool use (or if tool doesn't require approval)
				const messageIsDonePromise = new Promise<ResTypes>((res, rej) => { resMessageIsDonePromise = res })

				// Repetition detection: track last chunks to detect looping
				let lastChunks: string[] = [];
				const MAX_CHUNKS_TO_TRACK = 10;
				const REPETITION_THRESHOLD = 5; // If same chunk appears 5 times, it's looping

				const llmCancelToken = this._llmMessageService.sendLLMMessage({
					messagesType: 'chatMessages',
					chatMode,
					messages: messages,
					modelSelection,
					modelSelectionOptions,
					overridesOfModel,
					logging: { loggingName: `Chat - ${chatMode}`, loggingExtras: { threadId, nMessagesSent, chatMode } },
					separateSystemMessage: separateSystemMessage,
					onText: (params) => {
						let { fullText, fullReasoning, textDelta, reasoningDelta, toolCalls, _rawTextBeforeStripping } = params;
						// Backward compatibility for Main process running old code
						if (!toolCalls && (params as any).toolCall) {
							toolCalls = [(params as any).toolCall];
						}

						let parsed: { displayText: string, reasoningText: string };

						// PERFORMANCE: Use deltas if available to avoid O(N^2) processing
						const currentStreamState = this.streamState[threadId];
						if (textDelta !== undefined || reasoningDelta !== undefined) {
							const prevLlmInfo = currentStreamState?.isRunning === 'LLM' ? currentStreamState.llmInfo : undefined;
							const prevDisplayText = prevLlmInfo?.displayContentSoFar ?? '';
							const prevReasoningText = prevLlmInfo?.reasoningSoFar ?? '';

							// Note: fullText and fullReasoning are still used as fallback or for final consistency
							parsed = {
								displayText: textDelta !== undefined ? prevDisplayText + textDelta : fullText,
								reasoningText: reasoningDelta !== undefined ? prevReasoningText + reasoningDelta : fullReasoning
							};
						} else {
							parsed = partitionReasoningContent(fullText, fullReasoning)
						}

						// If parsed content is empty and we have raw text, try to partition the raw text
						if (!parsed.displayText && !parsed.reasoningText && _rawTextBeforeStripping) {
							parsed = partitionReasoningContent(_rawTextBeforeStripping, fullReasoning);
						}

						// Parse ReAct phases for enhanced UI detection
						const textToParse = _rawTextBeforeStripping || fullText;
						const newChunk = textToParse.slice(lastParsedLength);
						lastParsedLength = textToParse.length;

						// Parse ReAct phases and XML tool calls together
						const reactResult = reactParser.parseReAct(newChunk);
						if (reactResult) {
							currentReActPhase = reactResult.phase;
						}

						                        // Detect repetition
						                        const hasXMLToolCallInProgress = _rawTextBeforeStripping?.includes('<function_calls>');
						                        const hasNativeToolCall = !!toolCalls && toolCalls.length > 0;
						                        
						                        if (!hasNativeToolCall && !hasXMLToolCallInProgress) {
						                            // Combine display text and reasoning for repetition detection
						                            // This prevents false positives when only reasoning is streaming
						                            const combinedText = (parsed.displayText + " " + parsed.reasoningText).trim();
						                            const recentText = combinedText.slice(-50);
						                            
						                            if (recentText.length > 10) {
						                                // Only add if the text has actually changed to avoid false positives 
						                                // from redundant onText calls (e.g. from provider heartbeats)
						                                if (lastChunks.length === 0 || lastChunks[lastChunks.length - 1] !== recentText) {
						                                    lastChunks.push(recentText);
						                                    if (lastChunks.length > MAX_CHUNKS_TO_TRACK) {
						                                        lastChunks.shift();
						                                    }
						                                }
						
						                                const repetitionCount = lastChunks.filter(chunk => chunk === recentText).length;
						                                if (repetitionCount >= REPETITION_THRESHOLD) {
						                                    console.warn(`[chatThreadService] Text repetition detected. Count: ${repetitionCount}, Text: "${recentText.substring(0, 100)}..."`);
						                                    console.warn(`[chatThreadService] Repetition threshold reached (${REPETITION_THRESHOLD}), aborting LLM...`);
						                                    if (llmCancelToken) {
						                                        this._llmMessageService.abort(llmCancelToken);
						                                    }
						                                    return;
						                                }
						                            }
						                        } else {
						                            // Reset tracker when tools are detected
						                            lastChunks = [];
						                        }
						// Use tool calls from ReAct parser if available, otherwise use native tool calls
						let parsedToolCalls = toolCalls;
						if (!parsedToolCalls && reactResult?.toolCalls) {
							parsedToolCalls = reactResult.toolCalls;
						}

						// Throttle UI updates
						const now = Date.now();
						const hasNewNativeToolCall = !!toolCalls && (toolCalls.length !== (this.streamState[threadId]?.llmInfo?.toolCallsSoFar?.length ?? 0));

						// MEMORY OPTIMIZATION: Only stringify compare if lengths match (avoid expensive stringify on every char)
						let hasUpdatedXMLToolCall = false;
						if (reactResult?.toolCalls) {
							const prevToolCalls = this.streamState[threadId]?.llmInfo?.toolCallsSoFar;
							// Quick length check first
							if (!prevToolCalls || reactResult.toolCalls.length !== prevToolCalls.length) {
								hasUpdatedXMLToolCall = true;
							} else if (reactResult.isComplete) {
								// Only do expensive stringify comparison when complete, not on every char
								hasUpdatedXMLToolCall = JSON.stringify(reactResult.toolCalls) !== JSON.stringify(prevToolCalls);
							}
						}
						
						const isCriticalUpdate = hasNewNativeToolCall || hasUpdatedXMLToolCall || reactResult?.isComplete;
						
						if (now - lastUpdateTime < UI_UPDATE_THROTTLE_MS && !isCriticalUpdate) {
							return;
						}
						lastUpdateTime = now;

						this._setStreamState(threadId, {
							isRunning: 'LLM',
							llmInfo: {
								displayContentSoFar: parsed.displayText,
								reasoningSoFar: parsed.reasoningText,
								toolCallsSoFar: parsedToolCalls ?? null,
								_rawTextBeforeStripping,
								reactPhase: currentReActPhase,
								textDelta,
								reasoningDelta,
							},
							interrupt: Promise.resolve(() => { if (llmCancelToken) this._llmMessageService.abort(llmCancelToken) }),
							tokenUsage,
						})
					},
					onFinalMessage: async (params) => {
						let { fullText, fullReasoning, toolCalls, anthropicReasoning, usage } = params;
						// Backward compatibility for Main process running old code
						if (!toolCalls && (params as any).toolCall) {
							toolCalls = [(params as any).toolCall];
						}

						console.log(`[chatThreadService] onFinalMessage received - fullReasoning length: ${fullReasoning?.length ?? 0}, toolCalls: ${toolCalls?.length ?? 0}`)
						if (usage) {
							console.log(`[chatThreadService] Token usage received:`, usage);
							// Update token ratio for adaptive counting
							if (tokenUsage?.used && usage.promptTokens) {
								const { providerName, modelName } = modelSelection!;
								const fullModelName = `${providerName}:${modelName}`;
								// tokenUsage.used is our estimate, usage.promptTokens is actual
								// We pass both so the service can calculate and update the ratio
								// We access the service via the public method
								this._convertToLLMMessagesService.updateTokenRatio(fullModelName, tokenUsage.used, usage.promptTokens);
							}
						}
						const parsed = partitionReasoningContent(fullText, fullReasoning)
						console.log(`[chatThreadService] After partitioning - reasoningText length: ${parsed.reasoningText?.length ?? 0}`)
						resMessageIsDonePromise({ type: 'llmDone', toolCalls, info: { fullText: parsed.displayText, fullReasoning: parsed.reasoningText, anthropicReasoning }, usage }) // resolve with tool calls
					},
					onError: async (error) => {
						resMessageIsDonePromise({ type: 'llmError', error: error })
					},
					onAbort: () => {
						// stop the loop to free up the promise, but don't modify state (already handled by whatever stopped it)
						resMessageIsDonePromise({ type: 'llmAborted' })
						this._metricsService.capture('Agent Loop Done (Aborted)', { nMessagesSent, chatMode })
					},
				})

				// mark as streaming
				if (!llmCancelToken) {
					this._setStreamState(threadId, { isRunning: undefined, error: { message: 'There was an unexpected error when sending your chat message.', fullError: null } })
					break
				}

				this._setStreamState(threadId, { isRunning: 'LLM', llmInfo: { displayContentSoFar: '', reasoningSoFar: '', toolCallsSoFar: null, reactPhase: null }, interrupt: Promise.resolve(() => this._llmMessageService.abort(llmCancelToken)) })
				const llmRes = await messageIsDonePromise // wait for message to complete

				// if something else started running in the meantime
				if (this.streamState[threadId]?.isRunning !== 'LLM') {
					// console.log('Chat thread interrupted by a newer chat thread', this.streamState[threadId]?.isRunning)
					return
				}

				// llm res aborted
				if (llmRes.type === 'llmAborted') {
					this._setStreamState(threadId, undefined)
					return
				}
				// llm res error
				else if (llmRes.type === 'llmError') {
					const errorMsg = llmRes.error?.message || '';
					const isContextError = errorMsg.includes('400') || errorMsg.includes('context') || errorMsg.includes('too long') || errorMsg.includes('token');

					// Handle context length errors specifically by adjusting token estimation
					if (isContextError && nAttempts < CHAT_RETRIES) {
						console.warn(`[chatThreadService] Context length error detected: ${errorMsg}`);
						const { providerName, modelName } = modelSelection!;
						const fullModelName = `${providerName}:${modelName}`;
						
						// Force a more conservative ratio
						// Since we can't get actual usage on error, we just blindly increase the multiplier
						// This tells the token service "whatever you thought the count was, it's actually 1.5x higher"
						// We pass dummy values (estimated=1000, actual=1500) to force a 1.5 ratio update
						this._convertToLLMMessagesService.updateTokenRatio(fullModelName, 1000, 1500);
						console.log(`[chatThreadService] Bumped token ratio for ${fullModelName} due to context error`);
						
						shouldRetryLLM = true;
						this._setStreamState(threadId, {
							isRunning: undefined,
							error: { message: `Context limit hit, compressing and retrying... (attempt ${nAttempts}/${CHAT_RETRIES})`, fullError: null }
						});
						
						// Re-prepare messages with new ratio (this will trigger compression)
						const newPrep = await this._convertToLLMMessagesService.prepareLLMChatMessages({
							chatMessages,
							modelSelection,
							chatMode
						});
						
						// Update messages and token usage for the retry
						messages = newPrep.messages;
						separateSystemMessage = newPrep.separateSystemMessage;
						tokenUsage = newPrep.tokenUsage;
						
						// Update UI with new token usage
						this._setStreamState(threadId, { isRunning: 'idle', interrupt: idleInterruptor, tokenUsage });
					}

					// error, should retry
					if (nAttempts < CHAT_RETRIES) {
						shouldRetryLLM = true
						console.log(`[chatThreadService] LLM error, retrying (attempt ${nAttempts}/${CHAT_RETRIES})...`)
						// Show retry message briefly
						this._setStreamState(threadId, {
							isRunning: undefined,
							error: { message: `Retrying... (attempt ${nAttempts}/${CHAT_RETRIES})`, fullError: null }
						})
						await timeout(RETRY_DELAY)
						if (interruptedWhenIdle) {
							this._setStreamState(threadId, undefined)
							return
						}
						else {
							// Clear error before retry
							this._setStreamState(threadId, { isRunning: 'idle', interrupt: idleInterruptor })
							
							// Note: messages have already been re-prepared if it was a context error
							
							continue // retry
						}
					}
					// error, but too many attempts
					else {
						const { error } = llmRes
						const { displayContentSoFar, reasoningSoFar, toolCallsSoFar } = this.streamState[threadId].llmInfo
						this._addMessageToThread(threadId, { role: 'assistant', displayContent: displayContentSoFar, reasoning: reasoningSoFar, anthropicReasoning: null })
						if (toolCallsSoFar) {
							for (const tc of toolCallsSoFar) {
								this._addMessageToThread(threadId, { role: 'interrupted_streaming_tool', name: tc.name, mcpServerName: this._computeMCPServerOfToolName(tc.name) })
							}
						}

						this._setStreamState(threadId, { isRunning: undefined, error })
						return
					}
				}

				// llm res success
				const { toolCalls, info } = llmRes

									const responseLog = JSON.stringify({
										hasToolCalls: !!toolCalls && toolCalls.length > 0,
										toolCallsCount: toolCalls?.length ?? 0,
										fullText: info.fullText,
										reasoning: info.fullReasoning
									});
									console.log(`[chatThreadService] LLM response:`, responseLog.length > 1000 ? responseLog.substring(0, 1000) + '...' : responseLog)
								// Check for empty response and treat as error for retry
				// Note: Tool calls with empty content are valid (especially for Ollama)
				// Also treat "(empty message)" placeholder as empty
				const textContent = info.fullText?.trim() || ''
				const isEmptyResponse = (textContent.length === 0 || textContent === '(empty message)') && (!toolCalls || toolCalls.length === 0) && !info.fullReasoning && (!info.anthropicReasoning || info.anthropicReasoning.length === 0)
				if (isEmptyResponse) {
					// In both modes, retry with delay if we haven't exhausted attempts
					if (nAttempts < CHAT_RETRIES) {
						shouldRetryLLM = true
						console.warn(`[chatThreadService] LLM returned empty response, retrying (attempt ${nAttempts}/${CHAT_RETRIES})...`)
						
						// Show retry message briefly
						this._setStreamState(threadId, {
							isRunning: undefined,
							error: { message: `Empty response, retrying... (attempt ${nAttempts}/${CHAT_RETRIES})`, fullError: null }
						})
						
						await timeout(RETRY_DELAY)
						if (interruptedWhenIdle) {
							this._setStreamState(threadId, undefined)
							return
						}
						else {
							// Clear error before retry
							this._setStreamState(threadId, { isRunning: 'idle', interrupt: idleInterruptor })
							continue // retry current turn
						}
					}
					// Empty response but too many attempts
					else {
						console.error(`[chatThreadService] LLM returned empty response after ${CHAT_RETRIES} attempts, giving up`)
						
						if (chatMode === 'code') {
							// In agent mode, instead of just breaking, try adding a "poke" message to break the cycle
							// Only do this once to avoid infinite poking
							const messages = this.state.allThreads[threadId]?.messages || []
							const lastPokeIdx = findLastIdx(messages, m => m.role === 'user' && m.content.includes('I received an empty response'))
							
							if (lastPokeIdx === -1 || messages.length - lastPokeIdx > 2) {
								console.log('[chatThreadService] Agent mode: Adding poke message after empty responses')
								this._addMessageToThread(threadId, { 
									role: 'user', 
									content: 'I received an empty response from you. If you are stuck, please try a different approach or ask me for clarification. Otherwise, please continue with the task.',
									displayContent: 'Continuing after empty response...',
									selections: null,
									state: defaultMessageState
								})
								shouldSendAnotherMessage = true
								break // Exit retry loop to start a new turn with the poke message
							}
						}

						this._setStreamState(threadId, {
							isRunning: undefined,
							error: {
								message: `LLM returned empty response after ${CHAT_RETRIES} attempts. Please try again or check your model configuration.`,
								fullError: null
							}
						})
						break // Exit retry loop
					}
				}

				// Only add non-empty messages to thread
				if (!isEmptyResponse) {
					console.log(`[chatThreadService] Adding assistant message with reasoning length: ${info.fullReasoning?.length ?? 0}`)
					this._addMessageToThread(threadId, { role: 'assistant', displayContent: info.fullText, reasoning: info.fullReasoning, anthropicReasoning: info.anthropicReasoning })
				}

				this._setStreamState(threadId, { isRunning: 'idle', interrupt: 'not_needed' }) // just decorative for clarity

				// call tool(s) if there are any
				if (toolCalls && toolCalls.length > 0) {
					const mcpTools = this._mcpService.getMCPTools()
					console.log(`[chatThreadService] LLM called ${toolCalls.length} tool(s)`)

					let anyToolRan = false;

					for (const toolCall of toolCalls) {
						console.log(`[chatThreadService] LLM calling tool: ${toolCall.name}`)
						const paramsStr = JSON.stringify(toolCall.rawParams);
						console.log(`[chatThreadService] Tool call params:`, paramsStr.length > 1000 ? paramsStr.substring(0, 1000) + '...' : paramsStr)
						const mcpTool = mcpTools?.find(t => t.name === toolCall.name)
						
						const { awaitingUserApproval, interrupted } = await this._runToolCall(threadId, toolCall.name, toolCall.id, mcpTool?.mcpServerName, { preapproved: false, unvalidatedToolParams: toolCall.rawParams, thought_signature: toolCall.thought_signature })
						if (interrupted) {
							this._setStreamState(threadId, undefined)
							return
						}
						
						if (awaitingUserApproval) {
							isRunningWhenEnd = 'awaiting_user';
							shouldSendAnotherMessage = false;
							break; // STOP here, wait for user
						} else {
							anyToolRan = true;
						}
					}

					if (!isRunningWhenEnd && anyToolRan) {
						shouldSendAnotherMessage = true;
					}

					this._setStreamState(threadId, { isRunning: 'idle', interrupt: 'not_needed' }) // just decorative, for clarity
				}
				// Handle text-only responses (no tool call)
				// Following Claude Code / Continue pattern: If no tool call, task is complete.
				// The LLM knows when it needs to use tools - if it responds with just text, it's done.
				else if (!isEmptyResponse && (textContent.length > 0 && textContent !== '(empty message)' || info.fullReasoning)) {
					if (chatMode === 'code') {
						const thread = this.state.allThreads[threadId];
						const workflow = thread?.state.activeWorkflow;

						// NEW: If active workflow has pending tasks, continue loop
						const hasPendingTasks = workflow && workflow.status === 'active' &&
							workflow.tasks.some(t => t.status === 'pending' || t.status === 'in_progress');

						if (hasPendingTasks) {
							console.log(`[chatThreadService] Active workflow has pending tasks, continuing...`);
							shouldSendAnotherMessage = true;
							break; // Break retry loop to start new turn
						}

						// Detect interrupted responses (dangling intent or unfinished XML)
						const isInterruptedXML = reactParser.isParsingIncomplete();
						const danglingIntent = detectDanglingAgenticIntent(info.fullText, info.fullReasoning);

						if ((isInterruptedXML || danglingIntent !== 'none') && nPokesThisLoop < 3) {
							nPokesThisLoop += 1;

							if (danglingIntent === 'silent') {
								console.log(`[chatThreadService] Agent mode: Detected obvious 'About to Act' pattern, silently auto-continuing...`)
								// Silent auto-continue: just start another turn without adding a user message
								shouldSendAnotherMessage = true;
							} else {
								console.log(`[chatThreadService] Agent mode: Detected interrupted response (XML incomplete: ${isInterruptedXML}, intent: ${danglingIntent}). Poking model...`)
								this._addMessageToThread(threadId, {
									role: 'user',
									content: 'Your last response seemed interrupted or you mentioned an action without calling the corresponding tool. Please continue and call the tool now. Do not repeat your thought process, just proceed with the tool call.',
									displayContent: 'Continuing interrupted response...',
									selections: null,
									state: defaultMessageState
								})
								shouldSendAnotherMessage = true;
							}
							break; // Break retry loop to start new turn
						}

						// If the response is very short after a tool call, it might be an accidental termination
						// (e.g. just saying "Done." or "Okay." without actually being finished)
						const isVeryShortResponse = textContent.length < 25;
						const lastMessageWasToolResult = chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'tool';

						if (isVeryShortResponse && lastMessageWasToolResult && nPokesThisLoop < 3) {
							console.log(`[chatThreadService] Agent mode: Model returned short response (${textContent.length} chars) after tool call, silently auto-continuing...`)
							nPokesThisLoop += 1;
							shouldSendAnotherMessage = true;
							break;
						}

						// Handle models that output ONLY reasoning (thinking) without text or tool calls
						// These models (like Gemini 3 Pro with thinking) will reason then stop, expecting to continue
						const isOnlyReasoning = info.fullReasoning && info.fullReasoning.length > 10 && textContent.length === 0;
						if (isOnlyReasoning && nPokesThisLoop < 3) {
							console.log(`[chatThreadService] Agent mode: Model returned reasoning only (${info.fullReasoning.length} chars) without text or tool call, silently auto-continuing...`)
							nPokesThisLoop += 1;
							shouldSendAnotherMessage = true;
							break;
						}

						// Only terminate if no workflow or workflow is complete
						if (!workflow || workflow.status === 'completed') {
							console.log(`[chatThreadService] Agent mode: Text-only response (no tool call) - task complete`)
							shouldSendAnotherMessage = false
							break
						}
					}
				} // end while (attempts)
			} // end while (send message)

			// if awaiting user approval, keep isRunning true, else end isRunning
			this._setStreamState(threadId, { isRunning: isRunningWhenEnd })

			// add checkpoint before the next user message
			if (!isRunningWhenEnd) this._addUserCheckpoint({ threadId })

			// capture number of messages sent
			this._metricsService.capture('Agent Loop Done', { nMessagesSent, chatMode })

			// Process next queued message if any
			if (!isRunningWhenEnd) {
				const thread = this.state.allThreads[threadId];
				const workflow = thread?.state.activeWorkflow;
				const hasActiveWorkflow = workflow &&
					workflow.status === 'active' &&
					workflow.tasks.some(t => t.status === 'pending' || t.status === 'in_progress');

				if (hasActiveWorkflow && thread?.state.queueBehavior === 'wait_for_workflow') {
					console.log('[chatThreadService] Workflow active, holding queued message');
					// Don't process - wait for workflow completion
				} else {
					await this._processNextQueuedMessage(threadId);
				}
			}
		}
	}


	private _addCheckpoint(threadId: string, checkpoint: CheckpointEntry) {
		this._addMessageToThread(threadId, checkpoint)
		// // update latest checkpoint idx to the one we just added
		// const newThread = this.state.allThreads[threadId]
		// if (!newThread) return // should never happen
		// const currCheckpointIdx = newThread.messages.length - 1
		// this._setThreadState(threadId, { currCheckpointIdx: currCheckpointIdx })
	}



	private _editMessageInThread(threadId: string, messageIdx: number, newMessage: ChatMessage,) {
		const { allThreads } = this.state
		const oldThread = allThreads[threadId]
		if (!oldThread) return // should never happen
		// update state and store it
		const newThreads = {
			...allThreads,
			[oldThread.id]: {
				...oldThread,
				lastModified: new Date().toISOString(),
				messages: [
					...oldThread.messages.slice(0, messageIdx),
					newMessage,
					...oldThread.messages.slice(messageIdx + 1, Infinity),
				],
			}
		}
		this._storeAllThreads(newThreads)
		this._setState({ allThreads: newThreads }) // the current thread just changed (it had a message added to it)
	}


	private _getCheckpointInfo = (checkpointMessage: ChatMessage & { role: 'checkpoint' }, fsPath: string, opts: { includeUserModifiedChanges: boolean }): { voidFileSnapshot: VoidFileSnapshot | null } | undefined => {
		// Try new diff-based format first
		const diffCheckpoint = checkpointMessage.diffBasedCheckpointsOfURI?.[fsPath];
		if (diffCheckpoint) {
			// For diff-based checkpoints, we need to reconstruct the full content
			// by walking back through the checkpoint chain
			const fullContent = this._reconstructFileContentFromDiffs(checkpointMessage, fsPath);
			if (fullContent !== null) {
				return {
					voidFileSnapshot: {
						snapshottedDiffAreaOfId: diffCheckpoint.snapshottedDiffAreaOfId,
						entireFileCode: fullContent
					}
				};
			}
			return undefined;
		}

		// Fall back to legacy format
		const voidFileSnapshot = checkpointMessage.voidFileSnapshotOfURI?.[fsPath] ?? null;
		if (!voidFileSnapshot) return undefined;

		if (!opts.includeUserModifiedChanges) {
			return { voidFileSnapshot };
		}

		const userModifiedSnapshot = checkpointMessage.userModifications?.voidFileSnapshotOfURI?.[fsPath];
		return { voidFileSnapshot: userModifiedSnapshot ?? voidFileSnapshot };
	}

	/**
	 * Reconstruct file content by walking back through diff-based checkpoints
	 * and applying diffs from the earliest full snapshot
	 */
	private _reconstructFileContentFromDiffs(checkpointMessage: ChatMessage & { role: 'checkpoint' }, fsPath: string): string | null {
		const diffCheckpoint = checkpointMessage.diffBasedCheckpointsOfURI?.[fsPath];
		if (!diffCheckpoint) return null;

		// If this is a full snapshot, just return the content directly
		if (diffCheckpoint.isFullSnapshot) {
			return diffCheckpoint.fileContentDiffs[0]?.newText || null;
		}

		// For diff-based checkpoints, we need to walk back to find the first full snapshot
		// This is a simplified version - in practice we might want to cache reconstructed contents
		const threadId = this.state.currentThreadId;
		const thread = this.state.allThreads[threadId];
		if (!thread) return null;

		// Find the checkpoint index
		const checkpointIdx = thread.messages.findIndex(m => m === checkpointMessage);
		if (checkpointIdx === -1) return null;

		// Walk back to find a full snapshot
		let currentContent: string | null = null;
		const diffsToApply: typeof diffCheckpoint.fileContentDiffs = [];

		for (let i = checkpointIdx; i >= 0; i--) {
			const message = thread.messages[i];
			if (message.role !== 'checkpoint') continue;

			const checkpoint = message.diffBasedCheckpointsOfURI?.[fsPath];
			if (!checkpoint) {
				// Check legacy format
				const legacySnapshot = message.voidFileSnapshotOfURI?.[fsPath];
				if (legacySnapshot) {
					currentContent = legacySnapshot.entireFileCode;
					break;
				}
				continue;
			}

			if (checkpoint.isFullSnapshot) {
				currentContent = checkpoint.fileContentDiffs[0]?.newText || '';
				break;
			}

			// Collect diffs to apply (in reverse order)
			diffsToApply.unshift(...checkpoint.fileContentDiffs);
		}

		// If we found a base content, apply all collected diffs
		if (currentContent !== null) {
			// Apply diffs in order
			for (const diff of diffsToApply) {
				currentContent = applyDiffBasedCheckpoint(currentContent, {
					...diffCheckpoint,
					fileContentDiffs: [diff],
					isFullSnapshot: false
				});
			}
			// Finally apply the target checkpoint's diffs
			for (const diff of diffCheckpoint.fileContentDiffs) {
				currentContent = applyDiffBasedCheckpoint(currentContent, {
					...diffCheckpoint,
					fileContentDiffs: [diff],
					isFullSnapshot: false
				});
			}
		}

		return currentContent;
	}

	private _computeNewCheckpointInfo({ threadId }: { threadId: string }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		const lastCheckpointIdx = findLastIdx(thread.messages, (m) => m.role === 'checkpoint') ?? -1

		// MEMORY OPTIMIZATION: Store diffs instead of full snapshots
		const diffBasedCheckpointsOfURI: { [fsPath: string]: DiffBasedCheckpoint | undefined } = {}
		const previousCheckpointContents: { [fsPath: string]: string } = {}

		// Only process files that have actually changed to save compute
		for (const fsPath of thread.filesWithUserChanges) {
			const { model } = this._voidModelService.getModelFromFsPath(fsPath)
			if (!model) continue

			const newSnapshot = this._editCodeService.getVoidFileSnapshot(URI.file(fsPath))
			let previousSnapshot: VoidFileSnapshot | null = null

			// Find the last checkpoint for this specific file to compare
			if (lastCheckpointIdx !== -1) {
				const { lastIdxOfURI } = this._getCheckpointsBetween({ threadId, loIdx: 0, hiIdx: lastCheckpointIdx })
				const lastCheckpointIdxForFile = lastIdxOfURI[fsPath]

				if (lastCheckpointIdxForFile !== undefined) {
					const lastCheckpoint = thread.messages[lastCheckpointIdxForFile]
					if (lastCheckpoint.role === 'checkpoint') {
						// Get previous content from diff-based checkpoint
						const prevDiffCheckpoint = lastCheckpoint.diffBasedCheckpointsOfURI?.[fsPath];
						if (prevDiffCheckpoint && previousCheckpointContents[fsPath]) {
							// Reconstruct previous snapshot from diff
							const prevContent = previousCheckpointContents[fsPath];
							const prevFullContent = applyDiffBasedCheckpoint(prevContent, prevDiffCheckpoint);
							previousSnapshot = {
								snapshottedDiffAreaOfId: prevDiffCheckpoint.snapshottedDiffAreaOfId,
								entireFileCode: prevFullContent
							};
						} else {
							// Fall back to legacy format
							const res = this._getCheckpointInfo(lastCheckpoint, fsPath, { includeUserModifiedChanges: false })
							if (res?.voidFileSnapshot) {
								previousSnapshot = res.voidFileSnapshot
								previousCheckpointContents[fsPath] = res.voidFileSnapshot.entireFileCode;
							}
						}
					}
				}
			}

			// Create diff-based checkpoint
			const diffCheckpoint = createDiffBasedCheckpoint(previousSnapshot, newSnapshot)

			// Only store if there are actual changes or if it's the first checkpoint for this file
			if (diffCheckpoint.fileContentDiffs.length > 0 || !previousSnapshot) {
				diffBasedCheckpointsOfURI[fsPath] = diffCheckpoint
			}
		}

		return { diffBasedCheckpointsOfURI, previousCheckpointIdx: lastCheckpointIdx >= 0 ? lastCheckpointIdx : null }
	}


	private _addUserCheckpoint({ threadId }: { threadId: string }) {
		const { diffBasedCheckpointsOfURI, previousCheckpointIdx } = this._computeNewCheckpointInfo({ threadId }) ?? {}

		// Only add checkpoint if there are actual changes
		if (diffBasedCheckpointsOfURI && Object.keys(diffBasedCheckpointsOfURI).length > 0) {
			this._addCheckpoint(threadId, {
				role: 'checkpoint',
				type: 'user_edit',
				diffBasedCheckpointsOfURI: diffBasedCheckpointsOfURI ?? {},
				previousCheckpointIdx: previousCheckpointIdx,
				userModifications: { diffBasedCheckpointsOfURI: {}, },
			})
		}

		// Clear tracking after checkpointing (even if no changes found, we've processed them)
		this._clearUserChanges(threadId)
	}
	// call this right after LLM edits a file
	private _addToolEditCheckpoint({ threadId, uri, }: { threadId: string, uri: URI }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return
		const { model } = this._voidModelService.getModel(uri)
		if (!model) return // should never happen

		// Find the last checkpoint to compute diff from
		const lastCheckpointIdx = findLastIdx(thread.messages, (m) => m.role === 'checkpoint') ?? -1
		let previousSnapshot: VoidFileSnapshot | null = null

		if (lastCheckpointIdx !== -1) {
			const lastCheckpoint = thread.messages[lastCheckpointIdx]
			if (lastCheckpoint.role === 'checkpoint') {
				// Try to get previous content from the last checkpoint
				const prevDiffCheckpoint = lastCheckpoint.diffBasedCheckpointsOfURI?.[uri.fsPath];
				if (prevDiffCheckpoint) {
					// For tool edits, we always store full snapshot since it's a single file
					// and we need to ensure we have the complete state for restoration
					previousSnapshot = {
						snapshottedDiffAreaOfId: prevDiffCheckpoint.snapshottedDiffAreaOfId,
						entireFileCode: prevDiffCheckpoint.isFullSnapshot
							? prevDiffCheckpoint.fileContentDiffs[0]?.newText || model.getValue()
							: model.getValue() // Fallback
					};
				} else if (lastCheckpoint.voidFileSnapshotOfURI?.[uri.fsPath]) {
					// Fall back to legacy format
					previousSnapshot = lastCheckpoint.voidFileSnapshotOfURI[uri.fsPath]!;
				}
			}
		}

		const currentSnapshot = this._editCodeService.getVoidFileSnapshot(uri)
		const diffCheckpoint = createDiffBasedCheckpoint(previousSnapshot, currentSnapshot)

		this._addCheckpoint(threadId, {
			role: 'checkpoint',
			type: 'tool_edit',
			diffBasedCheckpointsOfURI: { [uri.fsPath]: diffCheckpoint },
			previousCheckpointIdx: lastCheckpointIdx >= 0 ? lastCheckpointIdx : null,
			userModifications: { diffBasedCheckpointsOfURI: {} },
		})
	}


	private _getCheckpointBeforeMessage = ({ threadId, messageIdx }: { threadId: string, messageIdx: number }): [CheckpointEntry, number] | undefined => {
		const thread = this.state.allThreads[threadId]
		if (!thread) return undefined
		for (let i = messageIdx; i >= 0; i--) {
			const message = thread.messages[i]
			if (message.role === 'checkpoint') {
				return [message, i]
			}
		}
		return undefined
	}

	private _getCheckpointsBetween({ threadId, loIdx, hiIdx }: { threadId: string, loIdx: number, hiIdx: number }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return { lastIdxOfURI: {} } // should never happen
		const lastIdxOfURI: { [fsPath: string]: number } = {}
		for (let i = loIdx; i <= hiIdx; i += 1) {
			const message = thread.messages[i]
			if (message?.role !== 'checkpoint') continue
			// Check new diff-based format first
			if (message.diffBasedCheckpointsOfURI) {
				for (const fsPath in message.diffBasedCheckpointsOfURI) {
					lastIdxOfURI[fsPath] = i
				}
			}
			// Fall back to legacy format
			if (message.voidFileSnapshotOfURI) {
				for (const fsPath in message.voidFileSnapshotOfURI) {
					lastIdxOfURI[fsPath] = i
				}
			}
		}
		return { lastIdxOfURI }
	}

	private _readCurrentCheckpoint(threadId: string): [CheckpointEntry, number] | undefined {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		const { currCheckpointIdx } = thread.state
		if (currCheckpointIdx === null) return

		const checkpoint = thread.messages[currCheckpointIdx]
		if (!checkpoint) return
		if (checkpoint.role !== 'checkpoint') return
		return [checkpoint, currCheckpointIdx]
	}
	private _addUserModificationsToCurrCheckpoint({ threadId }: { threadId: string }) {
		const { diffBasedCheckpointsOfURI } = this._computeNewCheckpointInfo({ threadId }) ?? {}
		const res = this._readCurrentCheckpoint(threadId)
		if (!res) return
		const [checkpoint, checkpointIdx] = res
		this._editMessageInThread(threadId, checkpointIdx, {
			...checkpoint,
			userModifications: { diffBasedCheckpointsOfURI: diffBasedCheckpointsOfURI ?? {}, },
		})
	}


	private _makeUsStandOnCheckpoint({ threadId }: { threadId: string }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return
		if (thread.state.currCheckpointIdx === null) {
			const lastMsg = thread.messages[thread.messages.length - 1]
			if (lastMsg?.role !== 'checkpoint')
				this._addUserCheckpoint({ threadId })
			this._setThreadState(threadId, { currCheckpointIdx: thread.messages.length - 1 })
		}
	}

	jumpToCheckpointBeforeMessageIdx({ threadId, messageIdx, jumpToUserModified }: { threadId: string, messageIdx: number, jumpToUserModified: boolean }) {

		// if null, add a new temp checkpoint so user can jump forward again
		this._makeUsStandOnCheckpoint({ threadId })

		const thread = this.state.allThreads[threadId]
		if (!thread) return
		if (this.streamState[threadId]?.isRunning) return

		const c = this._getCheckpointBeforeMessage({ threadId, messageIdx })
		if (c === undefined) return // should never happen

		const fromIdx = thread.state.currCheckpointIdx
		if (fromIdx === null) return // should never happen

		const [_, toIdx] = c
		if (toIdx === fromIdx) return

		// console.log(`going from ${fromIdx} to ${toIdx}`)

		// update the user's checkpoint
		this._addUserModificationsToCurrCheckpoint({ threadId })

		/*
	if undoing

	A,B,C are all files.
	x means a checkpoint where the file changed.

	A B C D E F G H I
	x x x x x   x           <-- you can't always go up to find the "before" version; sometimes you need to go down
	| | | | |   | x
	--x-|-|-|-x---x-|-----     <-- to
	| | | | x   x
	| | x x |
	| |   | |
	----x-|---x-x-------     <-- from
	  x

	We need to revert anything that happened between to+1 and from.
	**We do this by finding the last x from 0...`to` for each file and applying those contents.**
	We only need to do it for files that were edited since `to`, ie files between to+1...from.
	*/
		if (toIdx < fromIdx) {
			const { lastIdxOfURI } = this._getCheckpointsBetween({ threadId, loIdx: toIdx + 1, hiIdx: fromIdx })

			const idxes = function* () {
				for (let k = toIdx; k >= 0; k -= 1) { // first go up
					yield k
				}
				for (let k = toIdx + 1; k < thread.messages.length; k += 1) { // then go down
					yield k
				}
			}

			for (const fsPath in lastIdxOfURI) {
				// find the first instance of this file starting at toIdx (go up to latest file; if there is none, go down)
				for (const k of idxes()) {
					const message = thread.messages[k]
					if (message.role !== 'checkpoint') continue
					const res = this._getCheckpointInfo(message, fsPath, { includeUserModifiedChanges: jumpToUserModified })
					if (!res) continue
					const { voidFileSnapshot } = res
					if (!voidFileSnapshot) continue
					this._editCodeService.restoreVoidFileSnapshot(URI.file(fsPath), voidFileSnapshot)
					break
				}
			}
		}

		/*
	if redoing

	A B C D E F G H I J
	x x x x x   x     x
	| | | | |   | x x x
	--x-|-|-|-x---x-|-|---     <-- from
	| | | | x   x
	| | x x |
	| |   | |
	----x-|---x-x-----|---     <-- to
	  x           x


	We need to apply latest change for anything that happened between from+1 and to.
	We only need to do it for files that were edited since `from`, ie files between from+1...to.
	*/
		if (toIdx > fromIdx) {
			const { lastIdxOfURI } = this._getCheckpointsBetween({ threadId, loIdx: fromIdx + 1, hiIdx: toIdx })
			for (const fsPath in lastIdxOfURI) {
				// apply lowest down content for each uri
				for (let k = toIdx; k >= fromIdx + 1; k -= 1) {
					const message = thread.messages[k]
					if (message.role !== 'checkpoint') continue
					const res = this._getCheckpointInfo(message, fsPath, { includeUserModifiedChanges: jumpToUserModified })
					if (!res) continue
					const { voidFileSnapshot } = res
					if (!voidFileSnapshot) continue
					this._editCodeService.restoreVoidFileSnapshot(URI.file(fsPath), voidFileSnapshot)
					break
				}
			}
		}

		this._setThreadState(threadId, { currCheckpointIdx: toIdx })
	}


	private _wrapRunAgentToNotify(p: Promise<void>, threadId: string) {
		const notify = ({ error }: { error: string | null }) => {
			const thread = this.state.allThreads[threadId]
			if (!thread) return
			const userMsg = findLast(thread.messages, m => m.role === 'user')
			if (!userMsg) return
			if (userMsg.role !== 'user') return
			const messageContent = truncate(userMsg.displayContent, 50, '...')

			this._notificationService.notify({
				severity: error ? Severity.Warning : Severity.Info,
				message: error ? `Error: ${error} ` : `A new Chat result is ready.`,
				source: messageContent,
				sticky: true,
				actions: {
					primary: [{
						id: 'void.goToChat',
						enabled: true,
						label: `Jump to Chat`,
						tooltip: '',
						class: undefined,
						run: () => {
							this.switchToThread(threadId)
							// scroll to bottom
							this.state.allThreads[threadId]?.state.mountedInfo?.whenMounted.then(m => {
								m.scrollToBottom()
							})
						}
					}]
				},
			})
		}

		p.then(() => {
			if (threadId !== this.state.currentThreadId) notify({ error: null })
		}).catch((e) => {
			if (threadId !== this.state.currentThreadId) notify({ error: getErrorMessage(e) })
			throw e
		})
	}

	dismissStreamError(threadId: string): void {
		this._setStreamState(threadId, undefined)
	}


	private async _addUserMessageAndStreamResponse({ userMessage, _chatSelections, images, threadId, _isFromQueue = false }: { userMessage: string, _chatSelections?: StagingSelectionItem[], images?: ImageAttachment[], threadId: string, _isFromQueue?: boolean }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		// interrupt existing stream
		if (this.streamState[threadId]?.isRunning) {
			await this.abortRunning(threadId)
		}

		// add dummy before this message to keep checkpoint before user message idea consistent
		if (thread.messages.length === 0) {
			this._addUserCheckpoint({ threadId })
		}


		// add user's message to chat history
		const currSelns: StagingSelectionItem[] = _chatSelections ?? thread.state.stagingSelections

		// Process images FIRST if present (before adding message)
		let visionAnalysis: string | undefined;
		// MEMORY OPTIMIZATION: Validate and limit images to prevent memory bloat
		if (images && images.length > 0) {
			// Limit number of images
			if (images.length > MAX_IMAGES_PER_MESSAGE) {
				console.warn(`[Memory] Limiting images from ${images.length} to ${MAX_IMAGES_PER_MESSAGE}`);
				images = images.slice(0, MAX_IMAGES_PER_MESSAGE);
			}

			// Check total image size
			const totalSizeMB = images.reduce((sum, img) => sum + (img.base64?.length || 0) * 0.75 / 1024 / 1024, 0);
			if (totalSizeMB > MAX_TOTAL_IMAGE_SIZE_MB) {
				console.warn(`[Memory] Total image size ${totalSizeMB.toFixed(2)}MB exceeds limit of ${MAX_TOTAL_IMAGE_SIZE_MB}MB`);
				this._notificationService.notify({
					severity: Severity.Warning,
					message: `Images too large (${totalSizeMB.toFixed(1)}MB). Please use smaller images or fewer images.`,
				});
				images = []; // Clear images if too large
			}

			if (images.length > 0 && this._settingsService.state.globalSettings.enableVisionSupport) {
				// Show typing indicator while processing images
				this._setStreamState(threadId, { isRunning: 'idle', interrupt: 'not_needed' });

				try {
					visionAnalysis = await this._visionService.processImages(images, userMessage);
				} catch (error) {
					console.error(`[chatThreadService] Error processing images:`, error);
					this._notificationService.notify({
						severity: Severity.Warning,
						message: `Failed to process images: ${error instanceof Error ? error.message : 'Unknown error'}`,
					});
				} finally {
					// Clear stream state after processing
					this._setStreamState(threadId, undefined);
				}
			}

			// MEMORY OPTIMIZATION: Clear base64 image data after processing to prevent memory bloat
			// The visionAnalysis text is preserved, but the large base64 data is discarded
			if (images.length > 0) {
				images = images.map(img => ({
					...img,
					base64: '[processed]' // Replace base64 with placeholder
				}));
			}
		}

		// Build message content with vision analysis if available
		const messageContent = visionAnalysis
			? (userMessage ? `${userMessage}\n\n[Image Analysis]\n${visionAnalysis}` : `[Image Analysis]\n${visionAnalysis}`)
			: userMessage;

		let finalContent = await chat_userMessageContent(messageContent, currSelns, { directoryStrService: this._directoryStringService, fileService: this._fileService })

		// Tool Orchestration: Get tool suggestions before adding user message to thread
		let orchestrationResult: any = { suggestions: [], reasoning: '', summary: '' };
		const chatMode = this._settingsService.state.globalSettings.chatMode;

		// NEW: Auto-create workflow for complex requests in code mode
		if (chatMode === 'code' && userMessage.length > 50 && !_isFromQueue) {
			const isComplexRequest = this._detectComplexRequest(userMessage);
			if (isComplexRequest && !thread.state.activeWorkflow) {
				console.log('[chatThreadService] Complex request detected, initializing workflow...');

				// Create active workflow
				thread.state.activeWorkflow = {
					id: generateUuid(),
					goal: userMessage,
					tasks: [], // Will be populated by LLM via create_plan
					currentTaskId: null,
					status: 'planning',
					createdAt: Date.now()
				};

				thread.state.queueBehavior = 'wait_for_workflow';
				this._storeAllThreads(this.state.allThreads);
				this._onDidChangeCurrentThread.fire();
			}
		}

		if (this._settingsService.state.globalSettings.enableToolOrchestration) {
			console.log('[chatThreadService] Running tool orchestration...');
			this._setStreamState(threadId, { isRunning: 'idle', interrupt: 'not_needed' });
			try {
				orchestrationResult = await this._orchestrationService.orchestrate({
					userMessage: userMessage,
					chatMode: chatMode as any,
					onProgress: (reasoning) => {
						// Could show progress in UI if needed
					},
				});
				console.log('[chatThreadService] Orchestration result:', orchestrationResult);
			} catch (error) {
				console.error('[chatThreadService] Orchestration error:', error);
				orchestrationResult = { suggestions: [], reasoning: '', summary: '' };
			} finally {
				this._setStreamState(threadId, undefined);
			}
		}

		const userHistoryElt: ChatMessage = {
			role: 'user',
			content: finalContent,
			displayContent: userMessage,
			selections: currSelns,
			images,
			visionAnalysis,
			state: defaultMessageState,
			// Store orchestration result for use in LLM prompt
			orchestrationResult: orchestrationResult.suggestions.length > 0 ? orchestrationResult : undefined,
		}
		this._addMessageToThread(threadId, userHistoryElt)

		this._setThreadState(threadId, { currCheckpointIdx: null }) // no longer at a checkpoint because started streaming

		this._wrapRunAgentToNotify(
			this._runChatAgent({ threadId, ...this._currentModelSelectionProps(), orchestrationResult: orchestrationResult.suggestions.length > 0 ? orchestrationResult : undefined }),
			threadId,
		)

		// scroll to bottom
		this.state.allThreads[threadId]?.state.mountedInfo?.whenMounted.then(m => {
			m.scrollToBottom()
		})
	}


	async addUserMessageAndStreamResponse({ userMessage, selections, images, threadId }: { userMessage: string, selections?: StagingSelectionItem[], images?: ImageAttachment[], threadId: string }) {
		const thread = this.state.allThreads[threadId];
		if (!thread) return

		// Check if the thread is currently running
		const isRunning = this.streamState[threadId]?.isRunning;

		// NEW: Override workflow for manual send (not from queue)
		if (!isRunning && !this._hasQueuedMessages(threadId)) {
			this._overrideWorkflow(threadId);
		}

		// If the thread is running, queue the message instead of aborting
		if (isRunning) {
			console.log(`[chatThreadService] Thread ${threadId} is currently running. Queueing message.`);
			this._queueMessage(threadId, { userMessage, selections, images });
			return;
		}

		// Now call the original method to add the user message and stream the response
		await this._addUserMessageAndStreamResponse({ userMessage, _chatSelections: selections, images, threadId });
	}

	editUserMessageAndStreamResponse: IChatThreadService['editUserMessageAndStreamResponse'] = async ({ userMessage, messageIdx, threadId }) => {

		const thread = this.state.allThreads[threadId]
		if (!thread) return // should never happen

		if (thread.messages?.[messageIdx]?.role !== 'user') {
			throw new Error(`Error: editing a message with role !=='user'`)
		}

		// get prev and curr selections before clearing the message
		const currSelns = thread.messages[messageIdx].state.stagingSelections || [] // staging selections for the edited message

		// clear messages up to the index
		const slicedMessages = thread.messages.slice(0, messageIdx)
		this._setState({
			allThreads: {
				...this.state.allThreads,
				[thread.id]: {
					...thread,
					messages: slicedMessages
				}
			}
		})

		// re-add the message and stream it
		this._addUserMessageAndStreamResponse({ userMessage, _chatSelections: currSelns, threadId })
	}

	// ---------- Message Queue Methods ----------

	private _queueMessage(threadId: string, message: { userMessage: string, selections?: StagingSelectionItem[], images?: ImageAttachment[] }) {
		if (!this.messageQueue[threadId]) {
			this.messageQueue[threadId] = [];
		}
		// MEMORY OPTIMIZATION: Limit queue size to prevent unbounded memory growth
		if (this.messageQueue[threadId].length >= MAX_MESSAGE_QUEUE_PER_THREAD) {
			console.warn(`[Memory] Message queue for thread ${threadId} is full (${MAX_MESSAGE_QUEUE_PER_THREAD}). Dropping oldest message.`);
			this.messageQueue[threadId].shift(); // Remove oldest message
		}
		this.messageQueue[threadId].push(message);
		console.log(`[chatThreadService] Queued message for thread ${threadId}. Queue length: ${this.messageQueue[threadId].length}`);
		// Fire event to update UI
		this._onDidChangeCurrentThread.fire();
		// Trigger processing logic if we're idle
		if (!this.streamState[threadId]?.isRunning) {
			this._processNextQueuedMessage(threadId)
		}
	}

	private _hasQueuedMessages(threadId: string): boolean {
		return !!(this.messageQueue[threadId] && this.messageQueue[threadId].length > 0);
	}

	private async _processNextQueuedMessage(threadId: string) {
		if (!this._hasQueuedMessages(threadId)) {
			// ensure UI updates if queue emptied
			this._onDidChangeCurrentThread.fire();
			return;
		}
		if (this.streamState[threadId]?.isRunning) {
			return;
		}

		const nextMessage = this.messageQueue[threadId].shift();
		if (!nextMessage) return;

		console.log(`[chatThreadService] Processing queued message. Remaining in queue: ${this.messageQueue[threadId].length}`);
		// Fire event to update UI
		this._onDidChangeCurrentThread.fire();

		// Small delay to ensure UI updates
		await timeout(100);

		// Process the queued message
		await this._addUserMessageAndStreamResponse({
			userMessage: nextMessage.userMessage,
			_chatSelections: nextMessage.selections,
			images: nextMessage.images,
			threadId,
			_isFromQueue: true,  // NEW: Mark as from queue
		});
	}

	getQueuedMessagesCount(threadId: string): number {
		return this.messageQueue[threadId]?.length || 0;
	}

	getQueuedMessages(threadId: string): Array<{ userMessage: string, selections?: StagingSelectionItem[], images?: ImageAttachment[] }> {
		return this.messageQueue[threadId] || [];
	}

	removeQueuedMessage(threadId: string, index: number): void {
		if (this.messageQueue[threadId] && this.messageQueue[threadId][index]) {
			this.messageQueue[threadId].splice(index, 1);
			console.log(`[chatThreadService] Removed queued message at index ${index}. Remaining: ${this.messageQueue[threadId].length}`);
			this._onDidChangeCurrentThread.fire();
		}
	}

	clearMessageQueue(threadId: string) {
		if (this.messageQueue[threadId]) {
			this.messageQueue[threadId] = [];
			console.log(`[chatThreadService] Cleared message queue for thread ${threadId}`);
			this._onDidChangeCurrentThread.fire();
		}
	}

	async forceSendQueuedMessage(threadId: string, index: number): Promise<void> {
		const message = this.messageQueue[threadId]?.[index];
		if (!message) return;

		// Remove from queue
		this.messageQueue[threadId].splice(index, 1);
		console.log(`[chatThreadService] Force sending queued message at index ${index}`);
		this._onDidChangeCurrentThread.fire();

		// Abort current LLM if running
		const streamState = this.streamState[threadId];
		if (streamState?.isRunning && streamState.interrupt !== 'not_needed') {
			const interruptFn = await streamState.interrupt;
			if (typeof interruptFn === 'function') {
				interruptFn();
			}
		}

		// Wait a bit for abort to complete
		await new Promise(resolve => setTimeout(resolve, 100));

		// Send the message
		await this._addUserMessageAndStreamResponse({
			userMessage: message.userMessage,
			_chatSelections: message.selections,
			images: message.images,
			threadId
		});
	}

	/**
	 * Override the current active workflow (called when user manually sends message)
	 */
	private _overrideWorkflow(threadId: string): void {
		const thread = this.state.allThreads[threadId];
		if (!thread) return;

		if (thread.state.activeWorkflow) {
			console.log('[chatThreadService] Workflow override requested, clearing workflow');

			// Mark workflow as cancelled/failed
			thread.state.activeWorkflow = null;

			// Clear task plan
			this.clearTaskPlan(threadId);

			// Reset queue behavior
			this._updateThreadStateAndStore(threadId, { queueBehavior: 'wait_for_workflow' });

			this._onDidChangeCurrentThread.fire();
		}
	}

	/**
	 * Detect if a user request is complex enough to warrant workflow planning
	 */
	private _detectComplexRequest(message: string): boolean {
		const complexPatterns = [
			/redesign|refactor|implement|build.*system|create.*feature|add.*system/i,
			/multiple.*files|several.*pages|all.*components/i,
			/step\s+\d|first.*then|after.*that/i,
			/and.*also|and.*then|additionally/i,
			/complete.*system|full.*implementation/i,
		];

		return complexPatterns.some(pattern => pattern.test(message));
	}

	// ---------- the rest ----------

	private _getAllSeenFileURIs(threadId: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return []

		const fsPathsSet = new Set<string>()
		const uris: URI[] = []
		const addURI = (uri: URI) => {
			if (!fsPathsSet.has(uri.fsPath)) uris.push(uri)
			fsPathsSet.add(uri.fsPath)
			uris.push(uri)
		}

		for (const m of thread.messages) {
			// URIs of user selections
			if (m.role === 'user') {
				for (const sel of m.selections ?? []) {
					addURI(sel.uri)
				}
			}
			// URIs of files that have been read
			else if (m.role === 'tool' && m.type === 'success' && m.name === 'read_file') {
				const params = m.params as BuiltinToolCallParams['read_file']
				addURI(params.uri)
			}
		}
		return uris
	}



	getRelativeStr = (uri: URI) => {
		const isInside = this._workspaceContextService.isInsideWorkspace(uri)
		if (isInside) {
			const f = this._workspaceContextService.getWorkspace().folders.find(f => uri.fsPath.startsWith(f.uri.fsPath))
			if (f) { return uri.fsPath.replace(f.uri.fsPath, '') }
			else { return undefined }
		}
		else {
			return undefined
		}
	}


	// gets the location of codespan link so the user can click on it
	generateCodespanLink: IChatThreadService['generateCodespanLink'] = async ({ codespanStr: _codespanStr, threadId }) => {

		// process codespan to understand what we are searching for
		// TODO account for more complicated patterns eg `ITextEditorService.openEditor()`
		const functionOrMethodPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/; // `fUnCt10n_name`
		const functionParensPattern = /^([^\s(]+)\([^)]*\)$/; // `functionName( args )`

		let target = _codespanStr // the string to search for
		let codespanType: 'file-or-folder' | 'function-or-class'
		if (target.includes('.') || target.includes('/')) {

			codespanType = 'file-or-folder'
			target = _codespanStr

		} else if (functionOrMethodPattern.test(target)) {

			codespanType = 'function-or-class'
			target = _codespanStr

		} else if (functionParensPattern.test(target)) {
			const match = target.match(functionParensPattern)
			if (match && match[1]) {

				codespanType = 'function-or-class'
				target = match[1]

			}
			else { return null }
		}
		else {
			return null
		}

		// get history of all AI and user added files in conversation + store in reverse order (MRU)
		const prevUris = this._getAllSeenFileURIs(threadId).reverse()

		if (codespanType === 'file-or-folder') {
			const doesUriMatchTarget = (uri: URI) => uri.path.includes(target)

			// check if any prevFiles are the `target`
			for (const [idx, uri] of prevUris.entries()) {
				if (doesUriMatchTarget(uri)) {

					// shorten it

					// TODO make this logic more general
					const prevUriStrs = prevUris.map(uri => uri.fsPath)
					const shortenedUriStrs = shorten(prevUriStrs)
					let displayText = shortenedUriStrs[idx]
					const ellipsisIdx = displayText.lastIndexOf('…/');
					if (ellipsisIdx >= 0) {
						displayText = displayText.slice(ellipsisIdx + 2)
					}

					return { uri, displayText }
				}
			}

			// else search codebase for `target`
			let uris: URI[] = []
			try {
				const { result } = await this._toolsService.callTool['search_pathnames_only']({ query: target, includePattern: null, pageNumber: 0 })
				const { uris: uris_ } = await result
				uris = uris_
			} catch (e) {
				return null
			}

			for (const [idx, uri] of uris.entries()) {
				if (doesUriMatchTarget(uri)) {

					// TODO make this logic more general
					const prevUriStrs = prevUris.map(uri => uri.fsPath)
					const shortenedUriStrs = shorten(prevUriStrs)
					let displayText = shortenedUriStrs[idx]
					const ellipsisIdx = displayText.lastIndexOf('…/');
					if (ellipsisIdx >= 0) {
						displayText = displayText.slice(ellipsisIdx + 2)
					}


					return { uri, displayText }
				}
			}

		}


		if (codespanType === 'function-or-class') {


			// check all prevUris for the target
			for (const uri of prevUris) {

				const modelRef = await this._voidModelService.getModelSafe(uri)
				const { model } = modelRef
				if (!model) continue

				const matches = model.findMatches(
					target,
					false, // searchOnlyEditableRange
					false, // isRegex
					true,  // matchCase
					null, //' ',   // wordSeparators
					true   // captureMatches
				);

				const firstThree = matches.slice(0, 3);

				// take first 3 occurences, attempt to goto definition on them
				for (const match of firstThree) {
					const position = new Position(match.range.startLineNumber, match.range.startColumn);
					const definitionProviders = this._languageFeaturesService.definitionProvider.ordered(model);

					for (const provider of definitionProviders) {

						const _definitions = await provider.provideDefinition(model, position, CancellationToken.None);

						if (!_definitions) continue;

						const definitions = Array.isArray(_definitions) ? _definitions : [_definitions];

						for (const definition of definitions) {

							return {
								uri: definition.uri,
								selection: {
									startLineNumber: definition.range.startLineNumber,
									startColumn: definition.range.startColumn,
									endLineNumber: definition.range.endLineNumber,
									endColumn: definition.range.endColumn,
								},
								displayText: _codespanStr,
							};

							// const defModelRef = await this._textModelService.createModelReference(definition.uri);
							// const defModel = defModelRef.object.textEditorModel;

							// try {
							// 	const symbolProviders = this._languageFeaturesService.documentSymbolProvider.ordered(defModel);

							// 	for (const symbolProvider of symbolProviders) {
							// 		const symbols = await symbolProvider.provideDocumentSymbols(
							// 			defModel,
							// 			CancellationToken.None
							// 		);

							// 		if (symbols) {
							// 			const symbol = symbols.find(s => {
							// 				const symbolRange = s.range;
							// 				return symbolRange.startLineNumber <= definition.range.startLineNumber &&
							// 					symbolRange.endLineNumber >= definition.range.endLineNumber &&
							// 					(symbolRange.startLineNumber !== definition.range.startLineNumber || symbolRange.startColumn <= definition.range.startColumn) &&
							// 					(symbolRange.endLineNumber !== definition.range.endLineNumber || symbolRange.endColumn >= definition.range.endColumn);
							// 			});

							// 			// if we got to a class/function get the full range and return
							// 			if (symbol?.kind === SymbolKind.Function || symbol?.kind === SymbolKind.Method || symbol?.kind === SymbolKind.Class) {
							// 				return {
							// 					uri: definition.uri,
							// 					selection: {
							// 						startLineNumber: definition.range.startLineNumber,
							// 						startColumn: definition.range.startColumn,
							// 						endLineNumber: definition.range.endLineNumber,
							// 						endColumn: definition.range.endColumn,
							// 					}
							// 				};
							// 			}
							// 		}
							// 	}
							// } finally {
							// 	defModelRef.dispose();
							// }
						}
					}
				}
			}

			// unlike above do not search codebase (doesnt make sense)

		}

		return null

	}

	getCodespanLink({ codespanStr, messageIdx, threadId }: { codespanStr: string, messageIdx: number, threadId: string }): CodespanLocationLink | undefined {
		const thread = this.state.allThreads[threadId]
		if (!thread) return undefined;

		const links = thread.state.linksOfMessageIdx?.[messageIdx]
		if (!links) return undefined;

		const link = links[codespanStr]

		return link
	}

	async addCodespanLink({ newLinkText, newLinkLocation, messageIdx, threadId }: { newLinkText: string, newLinkLocation: CodespanLocationLink, messageIdx: number, threadId: string }) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		this._setState({

			allThreads: {
				...this.state.allThreads,
				[threadId]: {
					...thread,
					state: {
						...thread.state,
						linksOfMessageIdx: {
							...thread.state.linksOfMessageIdx,
							[messageIdx]: {
								...thread.state.linksOfMessageIdx?.[messageIdx],
								[newLinkText]: newLinkLocation
							}
						}
					}

				}
			}
		})
	}


	getCurrentThread(): ThreadType {
		const state = this.state
		const thread = state.allThreads[state.currentThreadId]
		if (!thread) throw new Error(`Current thread should never be undefined`)
		return thread
	}

	getCurrentFocusedMessageIdx() {
		const thread = this.getCurrentThread()

		// get the focusedMessageIdx
		const focusedMessageIdx = thread.state.focusedMessageIdx
		if (focusedMessageIdx === undefined) return;

		// check that the message is actually being edited
		const focusedMessage = thread.messages[focusedMessageIdx]
		if (focusedMessage.role !== 'user') return;
		if (!focusedMessage.state) return;

		return focusedMessageIdx
	}

	isCurrentlyFocusingMessage() {
		return this.getCurrentFocusedMessageIdx() !== undefined
	}

	switchToThread(threadId: string) {
		this._setState({ currentThreadId: threadId })
	}


	openNewThread() {
		// if a thread with 0 messages already exists, switch to it
		const { allThreads: currentThreads } = this.state
		for (const threadId in currentThreads) {
			if (currentThreads[threadId]!.messages.length === 0) {
				// switch to the existing empty thread and exit
				this.switchToThread(threadId)
				return
			}
		}
		// otherwise, start a new thread
		const newThread = newThreadObject()

		// update state
		const newThreads: ChatThreads = {
			...currentThreads,
			[newThread.id]: newThread
		}
		this._storeAllThreads(newThreads)
		this._setState({ allThreads: newThreads, currentThreadId: newThread.id })
	}


	deleteThread(threadId: string): void {
		const { allThreads: currentThreads } = this.state

		// delete the thread
		const newThreads = { ...currentThreads };
		delete newThreads[threadId];

		// MEMORY FIX: Clean up associated data structures to prevent memory leaks
		delete this.toolCallHistory[threadId];
		delete this.messageQueue[threadId];
		delete this.taskPlans[threadId];

		// store the updated threads
		this._storeAllThreads(newThreads);
		this._setState({ ...this.state, allThreads: newThreads })
	}

	duplicateThread(threadId: string) {
		const { allThreads: currentThreads } = this.state
		const threadToDuplicate = currentThreads[threadId]
		if (!threadToDuplicate) return
		const newThread = {
			...deepClone(threadToDuplicate),
			id: generateUuid(),
		}
		const newThreads = {
			...currentThreads,
			[newThread.id]: newThread,
		}
		this._storeAllThreads(newThreads)
		this._setState({ allThreads: newThreads })
	}


	private _addMessageToThread(threadId: string, message: ChatMessage) {
		const { allThreads } = this.state
		const oldThread = allThreads[threadId]
		if (!oldThread) return // should never happen

		// MEMORY OPTIMIZATION: Prune old messages if exceeding max limit
		let messages = [...oldThread.messages, message];

		// Limit total messages
		if (messages.length > MAX_MESSAGES_PER_THREAD) {
			messages = messages.slice(-MAX_MESSAGES_PER_THREAD);
			console.log(`[Memory] Pruned thread ${threadId} total messages to ${messages.length}`);
		}

		// MEMORY OPTIMIZATION: Limit number of checkpoints to prevent snapshot bloat
		const checkpointIndices = messages.reduce((acc, msg, idx) => {
			if (msg.role === 'checkpoint') acc.push(idx);
			return acc;
		}, [] as number[]);

		if (checkpointIndices.length > MAX_CHECKPOINTS_PER_THREAD) {
			const numToRemove = checkpointIndices.length - MAX_CHECKPOINTS_PER_THREAD;
			const indicesToRemove = new Set(checkpointIndices.slice(0, numToRemove));
			messages = messages.filter((_, idx) => !indicesToRemove.has(idx));
			console.log(`[Memory] Pruned ${numToRemove} old checkpoints from thread ${threadId}`);
		}

		// update state and store it
		const newThreads = {
			...allThreads,
			[oldThread.id]: {
				...oldThread,
				lastModified: new Date().toISOString(),
				messages,
			},
		}
		this._storeAllThreads(newThreads)
		this._setState({ allThreads: newThreads }) // the current thread just changed (it had a message added to it)

		// Recalculate token usage after adding message
		this._updateTokenUsage(threadId)
	}

	/**
	 * Recalculate and update token usage for the current thread
	 */
	private async _updateTokenUsage(threadId: string) {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		const modelSelection = this._settingsService.state.modelSelectionOfFeature['Chat']
		if (!modelSelection) return

		const { chatMode } = this._settingsService.state.globalSettings

		try {
			const { tokenUsage } = await this._convertToLLMMessagesService.prepareLLMChatMessages({
				chatMessages: thread.messages,
				modelSelection,
				chatMode,
				loadedSkills: thread.state.loadedSkills
			})

			// Update stream state with new token usage
			const currentState = this.streamState[threadId]
			if (currentState) {
				currentState.tokenUsage = tokenUsage
				this._onDidChangeStreamState.fire({ threadId })
			} else {
				// If no stream state, create one with just token usage
				this.streamState[threadId] = {
					isRunning: undefined,
					tokenUsage
				}
				this._onDidChangeStreamState.fire({ threadId })
			}
		} catch (error) {
			// Silently fail - token counting is not critical
			console.warn('[chatThreadService] Failed to update token usage:', error)
		}
	}

	// sets the currently selected message (must be undefined if no message is selected)
	setCurrentlyFocusedMessageIdx(messageIdx: number | undefined) {

		const threadId = this.state.currentThreadId
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		this._setState({
			allThreads: {
				...this.state.allThreads,
				[threadId]: {
					...thread,
					state: {
						...thread.state,
						focusedMessageIdx: messageIdx,
					}
				}
			}
		})

		// // when change focused message idx, jump - do not jump back when click edit, too confusing.
		// if (messageIdx !== undefined)
		// 	this.jumpToCheckpointBeforeMessageIdx({ threadId, messageIdx, jumpToUserModified: true })
	}


	addNewStagingSelection(newSelection: StagingSelectionItem): void {

		const focusedMessageIdx = this.getCurrentFocusedMessageIdx()

		// set the selections to the proper value
		let selections: StagingSelectionItem[] = []
		let setSelections = (s: StagingSelectionItem[]) => { }

		if (focusedMessageIdx === undefined) {
			selections = this.getCurrentThreadState().stagingSelections
			setSelections = (s: StagingSelectionItem[]) => this.setCurrentThreadState({ stagingSelections: s })
		} else {
			selections = this.getCurrentMessageState(focusedMessageIdx).stagingSelections
			setSelections = (s) => this.setCurrentMessageState(focusedMessageIdx, { stagingSelections: s })
		}

		// if matches with existing selection, overwrite (since text may change)
		const idx = findStagingSelectionIndex(selections, newSelection)
		if (idx !== null && idx !== -1) {
			setSelections([
				...selections!.slice(0, idx),
				newSelection,
				...selections!.slice(idx + 1, Infinity)
			])
		}
		// if no match, add it
		else {
			setSelections([...(selections ?? []), newSelection])
		}
	}


	// Pops the staging selections from the current thread's state
	popStagingSelections(numPops: number): void {

		numPops = numPops ?? 1;

		const focusedMessageIdx = this.getCurrentFocusedMessageIdx()

		// set the selections to the proper value
		let selections: StagingSelectionItem[] = []
		let setSelections = (s: StagingSelectionItem[]) => { }

		if (focusedMessageIdx === undefined) {
			selections = this.getCurrentThreadState().stagingSelections
			setSelections = (s: StagingSelectionItem[]) => this.setCurrentThreadState({ stagingSelections: s })
		} else {
			selections = this.getCurrentMessageState(focusedMessageIdx).stagingSelections
			setSelections = (s) => this.setCurrentMessageState(focusedMessageIdx, { stagingSelections: s })
		}

		setSelections([
			...selections.slice(0, selections.length - numPops)
		])

	}

	// set message.state
	private _setCurrentMessageState(state: Partial<UserMessageState>, messageIdx: number): void {

		const threadId = this.state.currentThreadId
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		this._setState({
			allThreads: {
				...this.state.allThreads,
				[threadId]: {
					...thread,
					messages: thread.messages.map((m, i) =>
						i === messageIdx && m.role === 'user' ? {
							...m,
							state: {
								...m.state,
								...state
							},
						} : m
					)
				}
			}
		})

	}

	// set thread.state
	private _setThreadState(threadId: string, state: Partial<ThreadType['state']>, doNotRefreshMountInfo?: boolean): void {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		this._setState({
			allThreads: {
				...this.state.allThreads,
				[thread.id]: {
					...thread,
					state: {
						...thread.state,
						...state
					}
				}
			}
		}, doNotRefreshMountInfo)

	}

	private _updateThreadStateAndStore(threadId: string, state: Partial<ThreadType['state']>): void {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		const updatedThread: ThreadType = {
			...thread,
			state: {
				...thread.state,
				...state
			}
		}

		const newThreads = {
			...this.state.allThreads,
			[threadId]: updatedThread
		}

		this._storeAllThreads(newThreads)
		this._setState({ allThreads: newThreads })
	}


	// closeCurrentStagingSelectionsInThread = () => {
	// 	const currThread = this.getCurrentThreadState()

	// 	// close all stagingSelections
	// 	const closedStagingSelections = currThread.stagingSelections.map(s => ({ ...s, state: { ...s.state, isOpened: false } }))

	// 	const newThread = currThread
	// 	newThread.stagingSelections = closedStagingSelections

	// 	this.setCurrentThreadState(newThread)

	// }

	// closeCurrentStagingSelectionsInMessage: IChatThreadService['closeCurrentStagingSelectionsInMessage'] = ({ messageIdx }) => {
	// 	const currMessage = this.getCurrentMessageState(messageIdx)

	// 	// close all stagingSelections
	// 	const closedStagingSelections = currMessage.stagingSelections.map(s => ({ ...s, state: { ...s.state, isOpened: false } }))

	// 	const newMessage = currMessage
	// 	newMessage.stagingSelections = closedStagingSelections

	// 	this.setCurrentMessageState(messageIdx, newMessage)

	// }



	getCurrentThreadState = () => {
		const currentThread = this.getCurrentThread()
		return currentThread.state
	}
	setCurrentThreadState = (newState: Partial<ThreadType['state']>) => {
		this._setThreadState(this.state.currentThreadId, newState)
	}

	getAutoContinuePreference(threadId: string): boolean {
		return this.state.allThreads[threadId]?.state.autoContinueEnabled ?? false
	}

	setAutoContinuePreference(threadId: string, enabled: boolean): void {
		this._updateThreadStateAndStore(threadId, { autoContinueEnabled: enabled })
	}

	// Task planning implementation
	getTaskPlan(threadId: string): TaskPlan[] {
		return this.taskPlans[threadId] || []
	}

	// Auto-update task status based on tool execution
	private _updateTaskStatusFromToolExecution(threadId: string, toolName: string, result: 'success' | 'error'): void {
		const tasks = this.taskPlans[threadId]
		if (!tasks || tasks.length === 0) return

		// Find tasks that might relate to this tool execution
		const toolToTaskMapping: { [key: string]: string[] } = {
			'read_file': ['read', 'examine', 'analyze', 'review', 'check'],
			'edit_file': ['edit', 'modify', 'change', 'update', 'fix', 'implement'],
			'rewrite_file': ['rewrite', 'refactor', 'restructure', 'reorganize'],
			'create_file_or_folder': ['create', 'add', 'make', 'build', 'generate'],
			'delete_file_or_folder': ['delete', 'remove', 'clean', 'clear'],
			'run_command': ['run', 'execute', 'start', 'launch', 'build', 'test'],
			'search_for_files': ['search', 'find', 'locate', 'look for'],
			'ls_dir': ['list', 'explore', 'browse', 'check'],
		}

		const taskKeywords = toolToTaskMapping[toolName] || []
		if (taskKeywords.length === 0) return

		// Find pending tasks that match the tool keywords
		const matchingTasks = tasks.filter(task =>
			task.status === 'pending' || task.status === 'in_progress'
		).filter(task =>
			taskKeywords.some(keyword =>
				task.description.toLowerCase().includes(keyword)
			)
		)

		// Update the first matching task to in_progress or completed
		if (matchingTasks.length > 0) {
			const taskToUpdate = matchingTasks[0]

			// If successful and there are multiple matching tasks, update first to completed, others to pending
			if (result === 'success' && matchingTasks.length > 1) {
				this.updateTaskStatus(threadId, taskToUpdate.id, 'completed')
				console.log(`[chatThreadService] Auto-updated task "${taskToUpdate.description}" to completed after ${toolName} success`)
			} else if (result === 'success') {
				this.updateTaskStatus(threadId, taskToUpdate.id, 'completed')
				console.log(`[chatThreadService] Auto-updated task "${taskToUpdate.description}" to completed after ${toolName} success`)
			} else {
				this.updateTaskStatus(threadId, taskToUpdate.id, 'blocked')
				console.log(`[chatThreadService] Auto-updated task "${taskToUpdate.description}" to blocked after ${toolName} error`)
			}

			// NEW: Update workflow state if active
			const thread = this.state.allThreads[threadId];
			const workflow = thread?.state.activeWorkflow;

			if (workflow && workflow.status === 'active') {
				// Check if all tasks are complete
				const allTasksComplete = tasks.every(t => t.status === 'completed');
				if (allTasksComplete) {
					workflow.status = 'completed';
					console.log(`[chatThreadService] Workflow "${workflow.goal}" completed`);
					this._storeAllThreads(this.state.allThreads);
					this._onDidChangeCurrentThread.fire();
				}
			}
		}
	}


	createTask(threadId: string, description: string, dependencies?: string[]): string {
		if (!this.taskPlans[threadId]) {
			this.taskPlans[threadId] = []
		}

		const task: TaskPlan = {
			id: generateUuid(),
			description,
			status: 'pending',
			dependencies,
			created_at: Date.now()
		}

		this.taskPlans[threadId].push(task)
		this._onDidChangeCurrentThread.fire() // Notify UI of change
		console.log(`[chatThreadService] Created task: ${description}`)
		return task.id
	}

	updateTaskStatus(threadId: string, taskId: string, status: TaskPlan['status']): void {
		const tasks = this.taskPlans[threadId]
		if (!tasks) return

		const task = tasks.find(t => t.id === taskId)
		if (!task) return

		task.status = status
		if (status === 'completed') {
			task.completed_at = Date.now()
		}

		this._onDidChangeCurrentThread.fire() // Notify UI of change
		console.log(`[chatThreadService] Updated task ${taskId} to status: ${status}`)
	}

	deleteTask(threadId: string, taskId: string): void {
		const tasks = this.taskPlans[threadId]
		if (!tasks) return

		const index = tasks.findIndex(t => t.id === taskId)
		if (index !== -1) {
			tasks.splice(index, 1)
			this._onDidChangeCurrentThread.fire() // Notify UI of change
			console.log(`[chatThreadService] Deleted task ${taskId}`)
		}
	}

	clearTaskPlan(threadId: string): void {
		this.taskPlans[threadId] = []
		this._onDidChangeCurrentThread.fire() // Notify UI of change
		console.log(`[chatThreadService] Cleared task plan for thread ${threadId}`)
	}

	// ==================== Student Mode Session ====================

	getStudentSession(threadId: string): StudentSession | undefined {
		return this.state.allThreads[threadId]?.state.studentSession
	}

	initStudentSession(threadId: string): StudentSession {
		const thread = this.state.allThreads[threadId]
		if (!thread) {
			throw new Error(`Thread ${threadId} not found`)
		}

		const session: StudentSession = {
			activeExercises: {},
			completedExerciseCount: 0,
			conceptsLearned: []
		}

		thread.state.studentSession = session
		this._onDidChangeCurrentThread.fire()
		return session
	}

	addExercise(threadId: string, exercise: Omit<StudentExercise, 'hintLevel' | 'status' | 'createdAt'>): StudentExercise {
		const thread = this.state.allThreads[threadId]
		if (!thread) {
			throw new Error(`Thread ${threadId} not found`)
		}

		// Initialize session if not exists
		if (!thread.state.studentSession) {
			this.initStudentSession(threadId)
		}

		const fullExercise: StudentExercise = {
			...exercise,
			hintLevel: 0,
			status: 'active',
			createdAt: Date.now()
		}

		thread.state.studentSession!.activeExercises[exercise.id] = fullExercise
		this._onDidChangeCurrentThread.fire()
		console.log(`[chatThreadService] Added exercise ${exercise.id} for thread ${threadId}`)
		return fullExercise
	}

	updateExerciseHintLevel(threadId: string, exerciseId: string): number {
		const thread = this.state.allThreads[threadId]
		const exercise = thread?.state.studentSession?.activeExercises[exerciseId]

		if (!exercise) {
			console.warn(`[chatThreadService] Exercise ${exerciseId} not found in thread ${threadId}`)
			return 1 // Default to level 1 if not found
		}

		// Increment hint level (max 4)
		const newLevel = Math.min(exercise.hintLevel + 1, 4)
		exercise.hintLevel = newLevel
		this._onDidChangeCurrentThread.fire()
		console.log(`[chatThreadService] Updated exercise ${exerciseId} to hint level ${newLevel}`)
		return newLevel
	}

	completeExercise(threadId: string, exerciseId: string): void {
		const thread = this.state.allThreads[threadId]
		const session = thread?.state.studentSession
		const exercise = session?.activeExercises[exerciseId]

		if (!exercise || !session) {
			console.warn(`[chatThreadService] Exercise ${exerciseId} not found in thread ${threadId}`)
			return
		}

		exercise.status = 'completed'
		session.completedExerciseCount++
		this._onDidChangeCurrentThread.fire()
		console.log(`[chatThreadService] Completed exercise ${exerciseId}. Total completed: ${session.completedExerciseCount}`)
	}

	addConceptLearned(threadId: string, concept: string): void {
		const thread = this.state.allThreads[threadId]
		if (!thread) return

		// Initialize session if not exists
		if (!thread.state.studentSession) {
			this.initStudentSession(threadId)
		}

		const session = thread.state.studentSession!
		if (!session.conceptsLearned.includes(concept)) {
			session.conceptsLearned.push(concept)
			this._onDidChangeCurrentThread.fire()
			console.log(`[chatThreadService] Added concept learned: ${concept}`)
		}
	}

	loadSkill(threadId: string, skillName: string, instructions: string): void {
		const thread = this.state.allThreads[threadId];
		if (!thread) return;

		const currentSkills = thread.state.loadedSkills || {};
		if (currentSkills[skillName]) return; // already loaded

		this._setThreadState(threadId, {
			loadedSkills: {
				...currentSkills,
				[skillName]: instructions
			}
		});
		console.log(`[chatThreadService] Loaded skill: ${skillName} for thread: ${threadId}`);
	}

	// Workflow management methods
	getActiveWorkflow = (threadId: string): ThreadType['state']['activeWorkflow'] => {
		return this.state.allThreads[threadId]?.state.activeWorkflow ?? null;
	}

	setActiveWorkflowStatus = (threadId: string, status: ActiveWorkflow['status']): void => {
		const thread = this.state.allThreads[threadId];
		if (!thread?.state.activeWorkflow) return;

		thread.state.activeWorkflow.status = status;
		this._storeAllThreads(this.state.allThreads);
		this._onDidChangeCurrentThread.fire();
	}

	clearWorkflow = (threadId: string): void => {
		this._overrideWorkflow(threadId);
	}

	// gets `staging` and `setStaging` of the currently focused element, given the index of the currently selected message (or undefined if no message is selected)

	getCurrentMessageState(messageIdx: number): UserMessageState {
		const currMessage = this.getCurrentThread()?.messages?.[messageIdx]
		if (!currMessage || currMessage.role !== 'user') return defaultMessageState
		return currMessage.state
	}
	setCurrentMessageState(messageIdx: number, newState: Partial<UserMessageState>) {
		const currMessage = this.getCurrentThread()?.messages?.[messageIdx]
		if (!currMessage || currMessage.role !== 'user') return
		this._setCurrentMessageState(newState, messageIdx)
	}



}

registerSingleton(IChatThreadService, ChatThreadService, InstantiationType.Delayed);
