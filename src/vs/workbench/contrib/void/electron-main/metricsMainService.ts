/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageTarget, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IApplicationStorageMainService } from '../../../../platform/storage/electron-main/storageMainService.js';

import { IMetricsService, LLMGenerationEvent, FileOperationEvent, EditorAnalyticsEvent, LayoutAnalyticsEvent, CommandAnalyticsEvent, SessionAnalyticsEvent } from '../common/metricsService.js';
import { PostHog } from 'posthog-node'
import { OPT_OUT_KEY, COHORT_KEY, FIRST_SESSION_KEY, LAST_SESSION_KEY, USER_EMAIL_KEY } from '../common/storageKeys.js';
import { voidDevLog } from '../common/devLog.js';


const os = isWindows ? 'windows' : isMacintosh ? 'mac' : isLinux ? 'linux' : null
const _getOSInfo = () => {
	try {
		const { platform, arch } = process // see platform.ts
		return { platform, arch }
	}
	catch (e) {
		return { osInfo: { platform: '??', arch: '??' } }
	}
}
const osInfo = _getOSInfo()

// we'd like to use devDeviceId on telemetryService, but that gets sanitized by the time it gets here as 'someValue.devDeviceId'



export class MetricsMainService extends Disposable implements IMetricsService {
	_serviceBrand: undefined;

	private readonly client: PostHog

	private _initProperties: object = {}

	// Session tracking fields - Analytics enhancement
	private _sessionId: string | undefined;
	private _sessionStartTime: number | undefined;
	private _sessionActivities: Record<string, number> = {};

	private _heartbeatInterval: NodeJS.Timeout | null = null;


	// helper - looks like this is stored in a .vscdb file in ~/Library/Application Support/Void
	private _memoStorage(key: string, target: StorageTarget, setValIfNotExist?: string) {
		const currVal = this._appStorage.get(key, StorageScope.APPLICATION)
		if (currVal !== undefined) return currVal
		const newVal = setValIfNotExist ?? generateUuid()
		this._appStorage.store(key, newVal, StorageScope.APPLICATION, target)
		return newVal
	}


	// this is old, eventually we can just delete this since all the keys will have been transferred over
	// returns 'NULL' or the old key
	private get oldId() {
		// check new storage key first
		const newKey = 'void.app.oldMachineId'
		const newOldId = this._appStorage.get(newKey, StorageScope.APPLICATION)
		if (newOldId) return newOldId

		// put old key into new key if didn't already
		const oldValue = this._appStorage.get('void.machineId', StorageScope.APPLICATION) ?? 'NULL' // the old way of getting the key
		this._appStorage.store(newKey, oldValue, StorageScope.APPLICATION, StorageTarget.MACHINE)
		return oldValue

		// in a few weeks we can replace above with this
		// private get oldId() {
		// 	return this._memoStorage('void.app.oldMachineId', StorageTarget.MACHINE, 'NULL')
		// }
	}


	// the main id
	private get distinctId() {
		const oldId = this.oldId
		const setValIfNotExist = oldId === 'NULL' ? undefined : oldId
		return this._memoStorage('void.app.machineId', StorageTarget.MACHINE, setValIfNotExist)
	}

	// just to see if there are ever multiple machineIDs per userID (instead of this, we should just track by the user's email)
	private get userId() {
		return this._memoStorage('void.app.userMachineId', StorageTarget.USER)
	}

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IEnvironmentMainService private readonly _envMainService: IEnvironmentMainService,
		@IApplicationStorageMainService private readonly _appStorage: IApplicationStorageMainService,
	) {
		super()
		this.client = new PostHog('phc_2JUflk80xdIy6wphTpa1TYtjJupiIpartdetzQo0l8p', {
			host: 'https://us.i.posthog.com',
		})

		this.initialize() // async
	}

	async initialize() {
		// very important to await whenReady!
		await this._appStorage.whenReady

		const { commit, version, voidVersion, release, quality } = this._productService

		const isDevMode = !this._envMainService.isBuilt // found in abstractUpdateService.ts

		// Determine cohort for user segmentation - Analytics enhancement
		const firstSession = this._appStorage.get(FIRST_SESSION_KEY, StorageScope.APPLICATION);
		const now = Date.now();
		let cohort: string;

		if (!firstSession) {
			cohort = 'new';
			this._appStorage.store(FIRST_SESSION_KEY, now.toString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			const daysSinceFirst = Math.floor((now - parseInt(firstSession)) / (1000 * 60 * 60 * 24));
			if (daysSinceFirst <= 1) cohort = 'returning_1day';
			else if (daysSinceFirst <= 7) cohort = 'returning_7day';
			else if (daysSinceFirst <= 30) cohort = 'returning_30day';
			else cohort = 'returning_30plus';
		}

		this._appStorage.store(COHORT_KEY, cohort, StorageScope.APPLICATION, StorageTarget.MACHINE);

		// custom properties we identify
		this._initProperties = {
			commit,
			vscodeVersion: version,
			voidVersion: voidVersion,
			release,
			os,
			quality,
			distinctId: this.distinctId,
			distinctIdUser: this.userId,
			oldId: this.oldId,
			isDevMode,
			cohort, // Added cohort for analytics
			...osInfo,
		}

		const identifyMessage = {
			distinctId: this.distinctId,
			properties: this._initProperties,
		}

		const didOptOut = this._appStorage.getBoolean(OPT_OUT_KEY, StorageScope.APPLICATION, false)

		voidDevLog('User is opted out of basic A-Coder metrics?', didOptOut)
		if (didOptOut) {
			this.client.optOut()
		}
		else {
			this.client.optIn()
			this.client.identify(identifyMessage)
			// Capture app_opened for DAU/WAU tracking
			this.capture('app_opened', { ...this._initProperties })
			// Start heartbeat to capture active status for long-running sessions
			this._startHeartbeat()
		}


		voidDevLog('A-Coder posthog metrics info:', JSON.stringify(identifyMessage, null, 2))
	}

	private _startHeartbeat() {
		// Send heartbeat every 12 hours (43200000 ms)
		this._heartbeatInterval = setInterval(() => {
			this.capture('heartbeat', { ...this._initProperties })
		}, 12 * 60 * 60 * 1000)
	}

	override dispose(): void {
		if (this._heartbeatInterval) {
			clearInterval(this._heartbeatInterval)
			this._heartbeatInterval = null
		}
		super.dispose()
	}


	capture: IMetricsService['capture'] = (event, params) => {
		const capture = { distinctId: this.distinctId, event, properties: params } as const
		// console.log('full capture:', this.distinctId)
		this.client.capture(capture)
	}

	// LLM Observability - captures generation events in PostHog AI format
	// This follows the PostHog AI SDK event structure for LLM analytics
	captureLLMGeneration: IMetricsService['captureLLMGeneration'] = (event: LLMGenerationEvent) => {
		// Use PostHog's recommended event name for LLM observability
		// See: https://posthog.com/docs/ai-engineering/observability
		const capture = {
			distinctId: this.distinctId,
			event: '$ai_generation',
			properties: {
				// PostHog AI standard properties
				$ai_provider: event.providerName,
				$ai_model: event.modelName,
				$ai_trace_id: event.traceId,
				$ai_latency: event.latencyMs,
				$ai_input_tokens: event.inputTokens,
				$ai_output_tokens: event.outputTokens,
				$ai_total_tokens: event.totalTokens,

				// Custom A-Coder properties
				first_token_latency_ms: event.firstTokenLatencyMs,
				message_count: event.messageCount,
				has_tools: event.hasTools,
				tool_count: event.toolCount,
				chat_mode: event.chatMode,
				has_tool_call: event.hasToolCall,
				tool_call_name: event.toolCallName,
				response_length: event.responseLength,
				reasoning_length: event.reasoningLength,
				status: event.status,
				error_message: event.errorMessage,
				feature: event.feature,
			}
		} as const

		console.log('[PostHog] Capturing $ai_generation event:', JSON.stringify({
			provider: event.providerName,
			model: event.modelName,
			status: event.status,
			latencyMs: event.latencyMs,
			feature: event.feature,
		}))
		this.client.capture(capture)
	}

	setOptOut: IMetricsService['setOptOut'] = (newVal: boolean) => {
		if (newVal) {
			this._appStorage.store(OPT_OUT_KEY, 'true', StorageScope.APPLICATION, StorageTarget.MACHINE)
		}
		else {
			this._appStorage.remove(OPT_OUT_KEY, StorageScope.APPLICATION)
		}
	}

	async getDebuggingProperties() {
		return this._initProperties
	}

	// NEW METHODS - Analytics enhancement

	captureFileOperation(event: FileOperationEvent): void {
		this.capture('file_operation', {
			operation: event.operation,
			file_extension: event.fileExtension,
			file_size_category: this._categorizeFileSize(event.fileSize),
			is_workspace_file: event.isWorkspaceFile,
			language: event.language,
		});
	}

	captureEditorEvent(event: EditorAnalyticsEvent): void {
		this.capture('editor_event', {
			type: event.type,
			file_extension: event.fileExtension,
			language: event.language,
			is_workspace_file: event.isWorkspaceFile,
			tab_count: event.tabCount,
		});
	}

	captureLayoutEvent(event: LayoutAnalyticsEvent): void {
		this.capture('layout_event', {
			type: event.type,
			part: event.part,
			visible: event.visible,
			position: event.position,
		});
	}

	captureCommandEvent(event: CommandAnalyticsEvent): void {
		this.capture('command_executed', event);
	}

	captureSessionEvent(event: SessionAnalyticsEvent): void {
		this.capture('session_event', {
			type: event.type,
			duration_ms: event.durationMs,
			duration_category: event.durationMs ? this._categorizeDuration(event.durationMs) : undefined,
			activities: event.activities,
		});
	}

	setUserEmail(email?: string): void {
		if (!email || !this._isValidEmail(email)) return;
		const hashedEmail = this._hashEmail(email);
		this._appStorage.store(USER_EMAIL_KEY, email, StorageScope.APPLICATION, StorageTarget.USER);
		this.client.identify({ distinctId: this.distinctId, properties: { ...this._initProperties, email: hashedEmail } });
	}

	startSession(): void {
		this._sessionId = generateUuid();
		this._sessionStartTime = Date.now();
		this._sessionActivities = {};
		this.captureSessionEvent({ type: 'session_start' });
	}

	endSession(): void {
		if (!this._sessionId || !this._sessionStartTime) return;
		const duration = Date.now() - this._sessionStartTime;
		this.captureSessionEvent({ type: 'session_end', durationMs: duration, activities: this._sessionActivities });
		this._appStorage.store(LAST_SESSION_KEY, Date.now().toString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	// Helper methods - Analytics enhancement

	private _categorizeFileSize(bytes: number): string {
		if (bytes < 10240) return 'small';
		if (bytes < 102400) return 'medium';
		if (bytes < 1048576) return 'large';
		return 'huge';
	}

	private _categorizeDuration(ms: number): string {
		if (ms < 300000) return 'short';
		if (ms < 1800000) return 'medium';
		if (ms < 7200000) return 'long';
		return 'very_long';
	}

	private _isValidEmail(email: string): boolean {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	private _hashEmail(email: string): string {
		let hash = 0;
		for (let i = 0; i < email.length; i++) {
			hash = ((hash << 5) - hash) + email.charCodeAt(i);
			hash = hash & hash;
		}
		return `email_${hash.toString(36)}`;
	}
}


