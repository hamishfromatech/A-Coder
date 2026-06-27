/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IEncryptionService } from '../../../../platform/encryption/common/encryptionService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IMetricsService } from './metricsService.js';
import { defaultProviderSettings, getModelCapabilities, ModelOverrides } from './modelCapabilities.js';
import { VOID_SETTINGS_STORAGE_KEY } from './storageKeys.js';
import { IHookService } from './hookService.js';
import { voidDevWarn } from './devLog.js';
import { defaultSettingsOfProvider, FeatureName, ProviderName, ModelSelectionOfFeature, SettingsOfProvider, SettingName, providerNames, ModelSelection, modelSelectionsEqual, featureNames, VoidStatefulModelInfo, GlobalSettings, GlobalSettingName, defaultGlobalSettings, ModelSelectionOptions, OptionsOfModelSelection, ChatMode, OverridesOfModel, defaultOverridesOfModel, MCPUserStateOfName as MCPUserStateOfName, MCPUserState } from './voidSettingsTypes.js';


// name is the name in the dropdown
export type ModelOption = { name: string, selection: ModelSelection }



type SetSettingOfProviderFn = <S extends SettingName>(
	providerName: ProviderName,
	settingName: S,
	newVal: SettingsOfProvider[ProviderName][S extends keyof SettingsOfProvider[ProviderName] ? S : never],
) => Promise<void>;

type SetModelSelectionOfFeatureFn = <K extends FeatureName>(
	featureName: K,
	newVal: ModelSelectionOfFeature[K],
) => Promise<void>;

type SetGlobalSettingFn = <T extends GlobalSettingName>(settingName: T, newVal: GlobalSettings[T]) => void;

type SetOptionsOfModelSelection = (featureName: FeatureName, providerName: ProviderName, modelName: string, newVal: Partial<ModelSelectionOptions>) => void


export type VoidSettingsState = {
	readonly settingsOfProvider: SettingsOfProvider; // optionsOfProvider
	readonly modelSelectionOfFeature: ModelSelectionOfFeature; // stateOfFeature
	readonly optionsOfModelSelection: OptionsOfModelSelection;
	readonly overridesOfModel: OverridesOfModel;
	readonly globalSettings: GlobalSettings;
	readonly mcpUserStateOfName: MCPUserStateOfName; // user-controlled state of MCP servers
	readonly acpUserStateOfName: MCPUserStateOfName; // user-controlled state of ACP servers (separate from MCP to avoid same-name collisions)

	readonly _modelOptions: ModelOption[] // computed based on the two above items
}

// type RealVoidSettings = Exclude<keyof VoidSettingsState, '_modelOptions'>
// type EventProp<T extends RealVoidSettings = RealVoidSettings> = T extends 'globalSettings' ? [T, keyof VoidSettingsState[T]] : T | 'all'


export interface IVoidSettingsService {
	readonly _serviceBrand: undefined;
	readonly state: VoidSettingsState; // in order to play nicely with react, you should immutably change state
	readonly waitForInitState: Promise<void>;

	onDidChangeState: Event<void>;

	setSettingOfProvider: SetSettingOfProviderFn;
	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn;
	setOptionsOfModelSelection: SetOptionsOfModelSelection;
	setGlobalSetting: SetGlobalSettingFn;
	// setMCPServerStates: (newStates: MCPServerStates) => Promise<void>;

	// setting to undefined CLEARS it, unlike others:
	setOverridesOfModel(providerName: ProviderName, modelName: string, overrides: Partial<ModelOverrides> | undefined): Promise<void>;

	dangerousSetState(newState: VoidSettingsState): Promise<void>;
	resetState(): Promise<void>;

	setAutodetectedModels(providerName: ProviderName, modelNames: string[], logging: object): void;
	toggleModelHidden(providerName: ProviderName, modelName: string): void;
	addModel(providerName: ProviderName, modelName: string): void;
	deleteModel(providerName: ProviderName, modelName: string): boolean;

	addMCPUserStateOfNames(userStateOfName: MCPUserStateOfName): Promise<void>;
	removeMCPUserStateOfNames(serverNames: string[]): Promise<void>;
	setMCPServerState(serverName: string, state: MCPUserState): Promise<void>;

	addACPUserStateOfNames(userStateOfName: MCPUserStateOfName): Promise<void>;
	removeACPUserStateOfNames(serverNames: string[]): Promise<void>;
	setACPServerState(serverName: string, state: MCPUserState): Promise<void>;
}




const _modelsWithSwappedInNewModels = (options: { existingModels: VoidStatefulModelInfo[], models: string[], type: 'autodetected' | 'default' }) => {
	const { existingModels, models, type } = options

	const existingModelsMap: Record<string, VoidStatefulModelInfo> = {}
	for (const existingModel of existingModels) {
		existingModelsMap[existingModel.modelName] = existingModel
	}

	const newDefaultModels = models.map((modelName, i) => ({ modelName, type, isHidden: !!existingModelsMap[modelName]?.isHidden, }))

	return [
		...newDefaultModels, // swap out all the models of this type for the new models of this type
		...existingModels.filter(m => {
			const keep = m.type !== type
			return keep
		})
	]
}


export const modelFilterOfFeatureName: {
	[featureName in FeatureName]: {
		filter: (
			o: ModelSelection,
			opts: { chatMode: ChatMode, overridesOfModel: OverridesOfModel }
		) => boolean;
		emptyMessage: null | { message: string, priority: 'always' | 'fallback' }
	} } = {
	'Autocomplete': { filter: (o, opts) => getModelCapabilities(o.providerName, o.modelName, opts.overridesOfModel).supportsFIM, emptyMessage: { message: 'No models support FIM', priority: 'always' } },
	'Chat': { filter: o => true, emptyMessage: null, },
	'Ctrl+K': { filter: o => true, emptyMessage: null, },
	'Apply': { filter: o => true, emptyMessage: null, },
	'SCM': { filter: o => true, emptyMessage: null, },
	'Vision': { filter: o => true, emptyMessage: null, }, // All models can be used for vision processing
	'ToolOrchestration': { filter: o => true, emptyMessage: null, }, // All models can be used for tool orchestration
}


const _stateWithMergedDefaultModels = (state: VoidSettingsState): VoidSettingsState => {
	let newSettingsOfProvider = state.settingsOfProvider

	// recompute default models
	for (const providerName of providerNames) {
		const defaultModels = defaultSettingsOfProvider[providerName]?.models ?? []
		const currentModels = newSettingsOfProvider[providerName]?.models ?? []
		const defaultModelNames = defaultModels.map(m => m.modelName)
		const newModels = _modelsWithSwappedInNewModels({ existingModels: currentModels, models: defaultModelNames, type: 'default' })
		newSettingsOfProvider = {
			...newSettingsOfProvider,
			[providerName]: {
				...newSettingsOfProvider[providerName],
				models: newModels,
			},
		}
	}
	return {
		...state,
		settingsOfProvider: newSettingsOfProvider,
	}
}

const _validatedModelState = (state: Omit<VoidSettingsState, '_modelOptions'>): VoidSettingsState => {

	let newSettingsOfProvider = state.settingsOfProvider

	// recompute _didFillInProviderSettings
	for (const providerName of providerNames) {
		const settingsAtProvider = newSettingsOfProvider[providerName]

		const didFillInProviderSettings = Object.keys(defaultProviderSettings[providerName]).every(key => !!settingsAtProvider[key as keyof typeof settingsAtProvider])

		if (didFillInProviderSettings === settingsAtProvider._didFillInProviderSettings) continue

		newSettingsOfProvider = {
			...newSettingsOfProvider,
			[providerName]: {
				...settingsAtProvider,
				_didFillInProviderSettings: didFillInProviderSettings,
			},
		}
	}

	// update model options
	let newModelOptions: ModelOption[] = []
	for (const providerName of providerNames) {
		const providerTitle = providerName // displayInfoOfProviderName(providerName).title.toLowerCase() // looks better lowercase, best practice to not use raw providerName
		if (!newSettingsOfProvider[providerName]._didFillInProviderSettings) continue // if disabled, don't display model options
		for (const { modelName, isHidden } of newSettingsOfProvider[providerName].models) {
			if (isHidden) continue
			newModelOptions.push({ name: `${modelName} (${providerTitle})`, selection: { providerName, modelName } })
		}
	}

	// now that model options are updated, make sure the selection is valid
	// if the user-selected model is no longer in the list, update the selection for each feature that needs it to something relevant (the 0th model available, or null)
	let newModelSelectionOfFeature = state.modelSelectionOfFeature
	for (const featureName of featureNames) {

		const { filter } = modelFilterOfFeatureName[featureName]
		const filterOpts = { chatMode: state.globalSettings.chatMode, overridesOfModel: state.overridesOfModel }
		const modelOptionsForThisFeature = newModelOptions.filter((o) => filter(o.selection, filterOpts))

		const modelSelectionAtFeature = newModelSelectionOfFeature[featureName]
		const selnIdx = modelSelectionAtFeature === null ? -1 : modelOptionsForThisFeature.findIndex(m => modelSelectionsEqual(m.selection, modelSelectionAtFeature!))

		if (selnIdx !== -1) continue // still in list, no need to update

		newModelSelectionOfFeature = {
			...newModelSelectionOfFeature,
			[featureName]: modelOptionsForThisFeature.length === 0 ? null : modelOptionsForThisFeature[0].selection
		}
	}


	const newState = {
		...state,
		settingsOfProvider: newSettingsOfProvider,
		modelSelectionOfFeature: newModelSelectionOfFeature,
		overridesOfModel: state.overridesOfModel,
		_modelOptions: newModelOptions,
	} satisfies VoidSettingsState

	return newState
}





const defaultState = () => {
	const d: VoidSettingsState = {
		settingsOfProvider: deepClone(defaultSettingsOfProvider),
		modelSelectionOfFeature: {
			'Chat': null,
			'Ctrl+K': null,
			'Autocomplete': null,
			'Apply': null,
			'SCM': null,
			'Vision': { providerName: 'ollama', modelName: 'qwen3-vl:235b-instruct-cloud' }, // Default vision model
			'ToolOrchestration': { providerName: 'ollama', modelName: 'glm-4.7:cloud' }, // Default tool orchestration model
		},
		globalSettings: deepClone(defaultGlobalSettings),
		optionsOfModelSelection: { 'Chat': {}, 'Ctrl+K': {}, 'Autocomplete': {}, 'Apply': {}, 'SCM': {}, 'Vision': {}, 'ToolOrchestration': {} },
		overridesOfModel: deepClone(defaultOverridesOfModel),
		_modelOptions: [], // computed later
		mcpUserStateOfName: {},
		acpUserStateOfName: {},
	}
	return d
}


export const IVoidSettingsService = createDecorator<IVoidSettingsService>('VoidSettingsService');
export class VoidSettingsService extends Disposable implements IVoidSettingsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event; // this is primarily for use in react, so react can listen + update on state changes

	state: VoidSettingsState;

	private readonly _resolver: () => void
	waitForInitState: Promise<void> // await this if you need a valid state initially

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IEncryptionService private readonly _encryptionService: IEncryptionService,
		@IMetricsService private readonly _metricsService: IMetricsService,
		// could have used this, but it's clearer the way it is (+ slightly different eg StorageTarget.USER)
		// @ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		// Resolved lazily inside setGlobalSetting (for the ModeSwitch hook) to break
		// the HookService ↔ VoidSettingsService construction cycle: HookService
		// eagerly injects IVoidSettingsService, so we must not eagerly inject it back.
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super()

		// at the start, we haven't read the partial config yet, but we need to set state to something
		this.state = defaultState()
		let resolver: () => void = () => { }
		this.waitForInitState = new Promise((res, rej) => resolver = res)
		this._resolver = resolver

		this.readAndInitializeState()
	}




	dangerousSetState = async (newState: VoidSettingsState) => {
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()
		// Only propagate Chat model to Apply/SCM when their sync flags are on
		// (matches the gating in setGlobalSetting below).
		if (this.state.globalSettings.syncApplyToChat) this._onUpdate_syncApplyToChat()
		if (this.state.globalSettings.syncSCMToChat) this._onUpdate_syncSCMToChat()
	}
	async resetState() {
		await this.dangerousSetState(defaultState())
	}




	async readAndInitializeState() {
		let readS: VoidSettingsState
		try {
			readS = await this._readState();
			// 1.0.3 addition, remove when enough users have had this code run
			if (readS.globalSettings.includeToolLintErrors === undefined) readS.globalSettings.includeToolLintErrors = true

			// autoapprove is now an obj not a boolean (1.2.5)
			if (typeof readS.globalSettings.autoApprove === 'boolean') readS.globalSettings.autoApprove = {}

			// 1.8.5 add terminal command auto-approval policy fields
			if (!Array.isArray(readS.globalSettings.terminalAllowPatterns)) readS.globalSettings.terminalAllowPatterns = []
			if (!Array.isArray(readS.globalSettings.terminalDenyPatterns)) readS.globalSettings.terminalDenyPatterns = []
			if (typeof readS.globalSettings.terminalReadOnlyAutoApprove !== 'boolean') readS.globalSettings.terminalReadOnlyAutoApprove = false

			// 1.3.5 add source control feature
			if (readS.modelSelectionOfFeature && !readS.modelSelectionOfFeature['SCM']) {
				readS.modelSelectionOfFeature['SCM'] = deepClone(readS.modelSelectionOfFeature['Chat'])
				readS.optionsOfModelSelection['SCM'] = deepClone(readS.optionsOfModelSelection['Chat'])
			}
			// add disableSystemMessage feature
			if (readS.globalSettings.disableSystemMessage === undefined) readS.globalSettings.disableSystemMessage = false;

			// add autoAcceptLLMChanges feature
			if (readS.globalSettings.autoAcceptLLMChanges === undefined) readS.globalSettings.autoAcceptLLMChanges = false;

			// add Mobile API settings (1.4.0+)
			if (readS.globalSettings.apiEnabled === undefined) readS.globalSettings.apiEnabled = false;
			if (readS.globalSettings.apiPort === undefined) readS.globalSettings.apiPort = 3737;
			if (readS.globalSettings.apiTokens === undefined) readS.globalSettings.apiTokens = [];
			if (readS.globalSettings.apiTunnelUrl === undefined) readS.globalSettings.apiTunnelUrl = undefined;

			// image generation settings (1.5.0+)
			if (readS.globalSettings.imageGenerationBaseUrl === undefined) {
				readS.globalSettings.imageGenerationBaseUrl = 'http://localhost:11434/v1';
			}
			if (readS.globalSettings.imageGenerationModel === undefined) {
				readS.globalSettings.imageGenerationModel = 'x/flux2-klein:4b';
			}
			// migration: update old 'sd' model to 'x/flux2-klein:4b'
			if (readS.globalSettings.imageGenerationModel === 'sd') {
				readS.globalSettings.imageGenerationModel = 'x/flux2-klein:4b';
			}
			if (readS.globalSettings.enableMediaGeneration === undefined) {
				readS.globalSettings.enableMediaGeneration = false;
			}
			if (readS.globalSettings.imageGenerationApiKey === undefined) {
				readS.globalSettings.imageGenerationApiKey = '';
			}
			// clean up old pollinations settings if they exist
			delete (readS.globalSettings as any).pollinationsApiKey;
			delete (readS.globalSettings as any).pollinationsImageModel;
			delete (readS.globalSettings as any).pollinationsVideoModel;

			// migrate old 'sd' model to flux2-klein (1.5.0+)
			if (readS.globalSettings.imageGenerationModel === 'sd') {
				readS.globalSettings.imageGenerationModel = 'x/flux2-klein:4b';
			}

			// Composio App Marketplace settings (1.6.0+)
			if (readS.globalSettings.composioApiKey === undefined) {
				readS.globalSettings.composioApiKey = '';
			}
			if (readS.globalSettings.composioConnections === undefined) {
				readS.globalSettings.composioConnections = {};
			}
			if (readS.globalSettings.composioEnabledToolkits === undefined) {
				readS.globalSettings.composioEnabledToolkits = [];
			}

			// notification sound setting (1.6.8+)
			if (readS.globalSettings.notificationSound === undefined) readS.globalSettings.notificationSound = 'none';

			// Voice / STT / TTS migration (1.7.0+)
		if (readS.globalSettings.sttEnabled === undefined) readS.globalSettings.sttEnabled = false;
		if (readS.globalSettings.sttServerUrl === undefined) readS.globalSettings.sttServerUrl = 'http://localhost:11434/v1';
		if (readS.globalSettings.sttModel === undefined) readS.globalSettings.sttModel = 'whisper-1';
		if (readS.globalSettings.sttApiKey === undefined) readS.globalSettings.sttApiKey = '';
		if (readS.globalSettings.ttsEnabled === undefined) readS.globalSettings.ttsEnabled = false;
		if (readS.globalSettings.ttsServerUrl === undefined) readS.globalSettings.ttsServerUrl = 'http://localhost:11434/v1';
		if (readS.globalSettings.ttsModel === undefined) readS.globalSettings.ttsModel = 'tts-1';
		if (readS.globalSettings.ttsVoice === undefined) readS.globalSettings.ttsVoice = 'alloy';
		if (readS.globalSettings.ttsApiKey === undefined) readS.globalSettings.ttsApiKey = '';

		// Plugins + marketplace settings (Claude Code compatibility)
		if (!Array.isArray(readS.globalSettings.pluginsEnabled)) readS.globalSettings.pluginsEnabled = [];
		if (!Array.isArray(readS.globalSettings.marketplaces)) readS.globalSettings.marketplaces = [];
		// Hooks (Claude Code compatibility): backfill user-global hooks if missing.
		if (readS.globalSettings.userHooks === undefined || readS.globalSettings.userHooks === null) readS.globalSettings.userHooks = {};
		}
		catch (e) {
			readS = defaultState()
		}

		// the stored data structure might be outdated, so we need to update it here
		try {
			readS = {
				...defaultState(),
				...readS,
				// Deep-merge globalSettings over defaults so fields added in newer
				// versions backfill for upgraded installs (a plain spread above
				// would replace the whole default globalSettings blob, leaving new
				// fields undefined and crashing callers that assume they exist).
				globalSettings: {
					...defaultGlobalSettings,
					...(readS.globalSettings ?? {}),
				},
				// Deep-merge nested state maps so newly-added providers (e.g. llamaCpp) backfill
				// with empty defaults for users upgrading from older versions.
				overridesOfModel: {
					...defaultOverridesOfModel,
					...(readS.overridesOfModel ?? {}),
				},
				// no idea why this was here, seems like a bug
				// ...defaultSettingsOfProvider,
				// ...readS.settingsOfProvider,
			}

			for (const providerName of providerNames) {
				readS.settingsOfProvider[providerName] = {
					...defaultSettingsOfProvider[providerName],
					...readS.settingsOfProvider[providerName],
				} as any

				// conversion from 1.0.3 to 1.2.5 (can remove this when enough people update)
				for (const m of readS.settingsOfProvider[providerName].models) {
					if (!m.type) {
						const old = (m as { isAutodetected?: boolean; isDefault?: boolean })
						if (old.isAutodetected)
							m.type = 'autodetected'
						else if (old.isDefault)
							m.type = 'default'
						else m.type = 'custom'
					}
				}

				// remove when enough people have had it run (default is now {})
				if (providerName === 'openAICompatible' && !readS.settingsOfProvider[providerName].headersJSON) {
					readS.settingsOfProvider[providerName].headersJSON = '{}'
				}
			}

			// Migration: Set default Vision model if it's null (for users upgrading from before Vision feature)
			if (!readS.modelSelectionOfFeature['Vision']) {
				readS.modelSelectionOfFeature['Vision'] = { providerName: 'ollama', modelName: 'qwen3-vl:235b-instruct-cloud' }
			}
			// Migration: Set default ToolOrchestration model if it's null
			if (!readS.modelSelectionOfFeature['ToolOrchestration']) {
				readS.modelSelectionOfFeature['ToolOrchestration'] = { providerName: 'ollama', modelName: 'glm-4.7:cloud' }
			}
		}
		catch (e) {
			readS = defaultState()
		}

		this.state = readS
		this.state = _stateWithMergedDefaultModels(this.state)
		this.state = _validatedModelState(this.state);


		this._resolver();
		this._onDidChangeState.fire();

	}


	private async _readState(): Promise<VoidSettingsState> {
		const encryptedState = this._storageService.get(VOID_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION)

		if (!encryptedState)
			return defaultState()

		const stateStr = await this._encryptionService.decrypt(encryptedState)
		const state = JSON.parse(stateStr)
		return state
	}


	private async _storeState() {
		const state = this.state
		const encryptedState = await this._encryptionService.encrypt(JSON.stringify(state))
		this._storageService.store(VOID_SETTINGS_STORAGE_KEY, encryptedState, StorageScope.APPLICATION, StorageTarget.USER);
	}

	setSettingOfProvider: SetSettingOfProviderFn = async (providerName, settingName, newVal) => {

		const newModelSelectionOfFeature = this.state.modelSelectionOfFeature

		const newOptionsOfModelSelection = this.state.optionsOfModelSelection

		const newSettingsOfProvider: SettingsOfProvider = {
			...this.state.settingsOfProvider,
			[providerName]: {
				...this.state.settingsOfProvider[providerName],
				[settingName]: newVal,
			}
		}

		const newGlobalSettings = this.state.globalSettings
		const newOverridesOfModel = this.state.overridesOfModel
		const newMCPUserStateOfName = this.state.mcpUserStateOfName
		const newACPUserStateOfName = this.state.acpUserStateOfName

		const newState = {
			modelSelectionOfFeature: newModelSelectionOfFeature,
			optionsOfModelSelection: newOptionsOfModelSelection,
			settingsOfProvider: newSettingsOfProvider,
			globalSettings: newGlobalSettings,
			overridesOfModel: newOverridesOfModel,
			mcpUserStateOfName: newMCPUserStateOfName,
			acpUserStateOfName: newACPUserStateOfName,
		}

		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()

	}


	private _onUpdate_syncApplyToChat() {
		// if sync is turned on, sync (call this whenever Chat model or !!sync changes)
		this.setModelSelectionOfFeature('Apply', deepClone(this.state.modelSelectionOfFeature['Chat'])).catch(err => {
			console.error('[VoidSettings] syncApplyToChat failed:', err);
		});
	}

	private _onUpdate_syncSCMToChat() {
		this.setModelSelectionOfFeature('SCM', deepClone(this.state.modelSelectionOfFeature['Chat'])).catch(err => {
			console.error('[VoidSettings] syncSCMToChat failed:', err);
		});
	}

	setGlobalSetting: SetGlobalSettingFn = async (settingName, newVal) => {
		// ModeSwitch hook: when the chat mode is changing, give hooks a chance to
		// block the switch or rewrite the target mode. Resolved lazily to avoid the
		// construction cycle (see constructor). `from` is captured before the state
		// reassignment below; `to` is the incoming value (possibly rewritten by the
		// hook's `updatedInput.to`). On block, return without changing the mode.
		if (settingName === 'chatMode') {
			const from = this.state.globalSettings.chatMode
			let to = newVal as ChatMode
			try {
				const hookService = this._instantiationService.invokeFunction(accessor => accessor.get(IHookService))
				const res = await hookService.fireModeSwitch(from, to)
				if (res.decision === 'block') return
				if (res.updatedInput && typeof res.updatedInput.to === 'string') {
					to = res.updatedInput.to as ChatMode
				}
				newVal = to as typeof newVal
			} catch (err) {
				voidDevWarn('[hooks] ModeSwitch fire threw (non-blocking):', err)
			}
		}

		const newState: VoidSettingsState = {
			...this.state,
			globalSettings: {
				...this.state.globalSettings,
				[settingName]: newVal
			}
		}
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()

		// hooks
		if (this.state.globalSettings.syncApplyToChat) this._onUpdate_syncApplyToChat()
		if (this.state.globalSettings.syncSCMToChat) this._onUpdate_syncSCMToChat()

	}


	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn = async (featureName, newVal) => {
		const newState: VoidSettingsState = {
			...this.state,
			modelSelectionOfFeature: {
				...this.state.modelSelectionOfFeature,
				[featureName]: newVal
			}
		}

		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()

		// hooks
		if (featureName === 'Chat') {
			// When Chat model changes, update synced features (only if their
			// sync flags are on, matching setGlobalSetting).
			if (this.state.globalSettings.syncApplyToChat) this._onUpdate_syncApplyToChat()
			if (this.state.globalSettings.syncSCMToChat) this._onUpdate_syncSCMToChat()
		}
	}


	setOptionsOfModelSelection = async (featureName: FeatureName, providerName: ProviderName, modelName: string, newVal: Partial<ModelSelectionOptions>) => {
		const newState: VoidSettingsState = {
			...this.state,
			optionsOfModelSelection: {
				...this.state.optionsOfModelSelection,
				[featureName]: {
					...this.state.optionsOfModelSelection[featureName],
					[providerName]: {
						...this.state.optionsOfModelSelection[featureName][providerName],
						[modelName]: {
							...this.state.optionsOfModelSelection[featureName][providerName]?.[modelName],
							...newVal
						}
					}
				}
			}
		}
		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()
	}

	setOverridesOfModel = async (providerName: ProviderName, modelName: string, overrides: Partial<ModelOverrides> | undefined) => {
		const providerOverrides = this.state.overridesOfModel?.[providerName] ?? {};
		const newState: VoidSettingsState = {
			...this.state,
			overridesOfModel: {
				...this.state.overridesOfModel,
				[providerName]: {
					...providerOverrides,
					[modelName]: overrides === undefined ? undefined : {
						...providerOverrides[modelName],
						...overrides
					},
				}
			}
		};

		this.state = _validatedModelState(newState);
		await this._storeState();
		this._onDidChangeState.fire();

		this._metricsService.capture('Update Model Overrides', { providerName, modelName, overrides });
	}




	setAutodetectedModels(providerName: ProviderName, autodetectedModelNames: string[], logging: object) {

		const { models } = this.state.settingsOfProvider[providerName]
		const oldModelNames = models.map(m => m.modelName)

		const newModels = _modelsWithSwappedInNewModels({ existingModels: models, models: autodetectedModelNames, type: 'autodetected' })
		this.setSettingOfProvider(providerName, 'models', newModels).catch(err => {
			console.error('[VoidSettings] setAutodetectedModels failed:', err);
		})

		// if the models changed, log it
		const new_names = newModels.map(m => m.modelName)
		if (!(oldModelNames.length === new_names.length
			&& oldModelNames.every((_, i) => oldModelNames[i] === new_names[i]))
		) {
			this._metricsService.capture('Autodetect Models', { providerName, newModels: newModels, ...logging })
		}
	}
	toggleModelHidden(providerName: ProviderName, modelName: string) {


		const { models } = this.state.settingsOfProvider[providerName]
		const modelIdx = models.findIndex(m => m.modelName === modelName)
		if (modelIdx === -1) return
		const newIsHidden = !models[modelIdx].isHidden
		const newModels: VoidStatefulModelInfo[] = [
			...models.slice(0, modelIdx),
			{ ...models[modelIdx], isHidden: newIsHidden },
			...models.slice(modelIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels).catch(err => {
			console.error('[VoidSettings] toggleModelHidden failed:', err);
		})

		this._metricsService.capture('Toggle Model Hidden', { providerName, modelName, newIsHidden })

	}
	addModel(providerName: ProviderName, modelName: string) {
		const { models } = this.state.settingsOfProvider[providerName]
		const existingIdx = models.findIndex(m => m.modelName === modelName)
		if (existingIdx !== -1) return // if exists, do nothing
		const newModels = [
			...models,
			{ modelName, type: 'custom', isHidden: false } as const
		]
		this.setSettingOfProvider(providerName, 'models', newModels).catch(err => {
			console.error('[VoidSettings] addModel failed:', err);
		})

		this._metricsService.capture('Add Model', { providerName, modelName })

	}
	deleteModel(providerName: ProviderName, modelName: string): boolean {
		const { models } = this.state.settingsOfProvider[providerName]
		const delIdx = models.findIndex(m => m.modelName === modelName)
		if (delIdx === -1) return false
		const newModels = [
			...models.slice(0, delIdx), // delete the idx
			...models.slice(delIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels).catch(err => {
			console.error('[VoidSettings] deleteModel failed:', err);
		})

		this._metricsService.capture('Delete Model', { providerName, modelName })

		return true
	}

	// MCP Server State
	private _setMCPUserStateOfName = async (newStates: MCPUserStateOfName) => {
		const newState: VoidSettingsState = {
			...this.state,
			mcpUserStateOfName: {
				...this.state.mcpUserStateOfName,
				...newStates
			}
		};
		this.state = _validatedModelState(newState);
		await this._storeState();
		this._onDidChangeState.fire();
		this._metricsService.capture('Set MCP Server States', { newStates });
	}

	addMCPUserStateOfNames = async (newMCPStates: MCPUserStateOfName) => {
		const { mcpUserStateOfName: mcpServerStates } = this.state
		const newMCPServerStates = {
			...mcpServerStates,
			...newMCPStates,
		}
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Add MCP Servers', { servers: Object.keys(newMCPStates).join(', ') });
	}

	removeMCPUserStateOfNames = async (serverNames: string[]) => {
		const { mcpUserStateOfName: mcpServerStates } = this.state
		const newMCPServerStates = {
			...mcpServerStates,
		}
		serverNames.forEach(serverName => {
			if (serverName in newMCPServerStates) {
				delete newMCPServerStates[serverName]
			}
		})
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Remove MCP Servers', { servers: serverNames.join(', ') });
	}

	setMCPServerState = async (serverName: string, state: MCPUserState) => {
		const { mcpUserStateOfName } = this.state
		const newMCPServerStates = {
			...mcpUserStateOfName,
			[serverName]: state,
		}
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Update MCP Server State', { serverName, state });
	}

	// ACP servers keep their own user-state map so a same-named MCP and ACP
	// server don't collide on the same `mcpUserStateOfName` entry.
	private _setACPUserStateOfName = async (newStates: MCPUserStateOfName) => {
		const newState: VoidSettingsState = {
			...this.state,
			acpUserStateOfName: {
				...this.state.acpUserStateOfName,
				...newStates
			}
		};
		this.state = _validatedModelState(newState);
		await this._storeState();
		this._onDidChangeState.fire();
		this._metricsService.capture('Set ACP Server States', { newStates });
	}

	addACPUserStateOfNames = async (newACPStates: MCPUserStateOfName) => {
		const { acpUserStateOfName: acpServerStates } = this.state
		const newACPServerStates = {
			...acpServerStates,
			...newACPStates,
		}
		await this._setACPUserStateOfName(newACPServerStates)
		this._metricsService.capture('Add ACP Servers', { servers: Object.keys(newACPStates).join(', ') });
	}

	removeACPUserStateOfNames = async (serverNames: string[]) => {
		const { acpUserStateOfName: acpServerStates } = this.state
		const newACPServerStates = {
			...acpServerStates,
		}
		serverNames.forEach(serverName => {
			if (serverName in newACPServerStates) {
				delete newACPServerStates[serverName]
			}
		})
		await this._setACPUserStateOfName(newACPServerStates)
		this._metricsService.capture('Remove ACP Servers', { servers: serverNames.join(', ') });
	}

	setACPServerState = async (serverName: string, state: MCPUserState) => {
		const { acpUserStateOfName } = this.state
		const newACPServerStates = {
			...acpUserStateOfName,
			[serverName]: state,
		}
		await this._setACPUserStateOfName(newACPServerStates)
		this._metricsService.capture('Update ACP Server State', { serverName, state });
	}

}


registerSingleton(IVoidSettingsService, VoidSettingsService, InstantiationType.Eager);
