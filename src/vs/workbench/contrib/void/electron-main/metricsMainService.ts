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

import { IMetricsService, LLMGenerationEvent } from '../common/metricsService.js';
import { PostHog } from 'posthog-node'
import { OPT_OUT_KEY } from '../common/storageKeys.js';


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
			...osInfo,
		}

		const identifyMessage = {
			distinctId: this.distinctId,
			properties: this._initProperties,
		}

		const didOptOut = this._appStorage.getBoolean(OPT_OUT_KEY, StorageScope.APPLICATION, false)

		console.log('User is opted out of basic A-Coder metrics?', didOptOut)
		if (didOptOut) {
			this.client.optOut()
		}
		else {
			this.client.optIn()
			this.client.identify(identifyMessage)
		}


		console.log('A-Coder posthog metrics info:', JSON.stringify(identifyMessage, null, 2))
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
}


