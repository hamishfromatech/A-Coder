
/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { defaultModelsOfProvider, defaultProviderSettings, ModelOverrides } from './modelCapabilities.js';
import { ToolApprovalType } from './toolsServiceTypes.js';
import { VoidSettingsState } from './voidSettingsService.js'


type UnionOfKeys<T> = T extends T ? keyof T : never;



export type ProviderName = keyof typeof defaultProviderSettings
export const providerNames = Object.keys(defaultProviderSettings) as ProviderName[]

export const localProviderNames = ['ollama', 'vLLM', 'lmStudio'] satisfies ProviderName[] // all local names
export const nonlocalProviderNames = providerNames.filter((name) => !(localProviderNames as string[]).includes(name)) // all non-local names

type CustomSettingName = UnionOfKeys<typeof defaultProviderSettings[ProviderName]>
type CustomProviderSettings<providerName extends ProviderName> = {
	[k in CustomSettingName]: k extends keyof typeof defaultProviderSettings[providerName] ? string : undefined
}
export const customSettingNamesOfProvider = (providerName: ProviderName) => {
	return Object.keys(defaultProviderSettings[providerName]) as CustomSettingName[]
}



export type VoidStatefulModelInfo = { // <-- STATEFUL
	modelName: string,
	type: 'default' | 'autodetected' | 'custom';
	isHidden: boolean, // whether or not the user is hiding it (switched off)
}



type CommonProviderSettings = {
	_didFillInProviderSettings: boolean | undefined, // undefined initially, computed when user types in all fields
	models: VoidStatefulModelInfo[],
}

export type SettingsAtProvider<providerName extends ProviderName> = CustomProviderSettings<providerName> & CommonProviderSettings

// part of state
export type SettingsOfProvider = {
	[providerName in ProviderName]: SettingsAtProvider<providerName>
}


export type SettingName = keyof SettingsAtProvider<ProviderName>

type DisplayInfoForProviderName = {
	title: string,
	desc?: string,
}

export const displayInfoOfProviderName = (providerName: ProviderName): DisplayInfoForProviderName => {
	if (providerName === 'anthropic') {
		return { title: 'Anthropic', }
	}
	else if (providerName === 'openAI') {
		return { title: 'OpenAI', }
	}
	else if (providerName === 'deepseek') {
		return { title: 'DeepSeek', }
	}
	else if (providerName === 'openRouter') {
		return { title: 'OpenRouter', }
	}
	else if (providerName === 'ollama') {
		return { title: 'Ollama', }
	}
	else if (providerName === 'vLLM') {
		return { title: 'vLLM', }
	}
	else if (providerName === 'liteLLM') {
		return { title: 'LiteLLM', }
	}
	else if (providerName === 'lmStudio') {
		return { title: 'LM Studio', }
	}
	else if (providerName === 'openAICompatible') {
		return { title: 'OpenAI-Compatible', }
	}
	else if (providerName === 'gemini') {
		return { title: 'Gemini', }
	}
	else if (providerName === 'groq') {
		return { title: 'Groq', }
	}
	else if (providerName === 'xAI') {
		return { title: 'Grok (xAI)', }
	}
	else if (providerName === 'mistral') {
		return { title: 'Mistral', }
	}
	else if (providerName === 'googleVertex') {
		return { title: 'Google Vertex AI', }
	}
	else if (providerName === 'microsoftAzure') {
		return { title: 'Microsoft Azure OpenAI', }
	}
	else if (providerName === 'awsBedrock') {
		return { title: 'AWS Bedrock', }
	}
	else if (providerName === 'aCoder') {
		return { title: 'A-Coder', desc: 'Free models with sign-in' }
	}

	throw new Error(`descOfProviderName: Unknown provider name: "${providerName}"`)
}

export const subTextMdOfProviderName = (providerName: ProviderName): string => {

	if (providerName === 'anthropic') return 'Get your [API Key here](https://console.anthropic.com/settings/keys).'
	if (providerName === 'openAI') return 'Get your [API Key here](https://platform.openai.com/api-keys).'
	if (providerName === 'deepseek') return 'Get your [API Key here](https://platform.deepseek.com/api_keys).'
	if (providerName === 'openRouter') return 'Get your [API Key here](https://openrouter.ai/settings/keys). Read about [rate limits here](https://openrouter.ai/docs/api-reference/limits).'
	if (providerName === 'gemini') return 'Get your [API Key here](https://aistudio.google.com/apikey). Read about [rate limits here](https://ai.google.dev/gemini-api/docs/rate-limits#current-rate-limits).'
	if (providerName === 'groq') return 'Get your [API Key here](https://console.groq.com/keys).'
	if (providerName === 'xAI') return 'Get your [API Key here](https://console.x.ai).'
	if (providerName === 'mistral') return 'Get your [API Key here](https://console.mistral.ai/api-keys).'
	if (providerName === 'openAICompatible') return `Use any provider that's OpenAI-compatible (use this for llama.cpp and more).`
	if (providerName === 'googleVertex') return 'You must authenticate before using Vertex with A-Coder. Read more about endpoints [here](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library), and regions [here](https://cloud.google.com/vertex-ai/docs/general/locations#available-regions).'
	if (providerName === 'microsoftAzure') return 'Read more about endpoints [here](https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP), and get your API key [here](https://learn.microsoft.com/en-us/azure/search/search-security-api-keys?tabs=rest-use%2Cportal-find%2Cportal-query#find-existing-keys).'
	if (providerName === 'awsBedrock') return 'Connect via a LiteLLM proxy or the AWS [Bedrock-Access-Gateway](https://github.com/aws-samples/bedrock-access-gateway). LiteLLM Bedrock setup docs are [here](https://docs.litellm.ai/docs/providers/bedrock).'
	if (providerName === 'ollama') return 'Read more about custom [Endpoints here](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-expose-ollama-on-my-network).'
	if (providerName === 'vLLM') return 'Read more about custom [Endpoints here](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server).'
	if (providerName === 'lmStudio') return 'Read more about custom [Endpoints here](https://lmstudio.ai/docs/app/api/endpoints/openai).'
	if (providerName === 'liteLLM') return 'Read more about endpoints [here](https://docs.litellm.ai/docs/providers/openai_compatible).'
	if (providerName === 'aCoder') return 'Sign in with Google or GitHub to use A-Coder models for free.'

	throw new Error(`subTextMdOfProviderName: Unknown provider name: "${providerName}"`)
}

type DisplayInfo = {
	title: string;
	placeholder: string;
	isPasswordField?: boolean;
}
export const displayInfoOfSettingName = (providerName: ProviderName, settingName: SettingName): DisplayInfo => {
	if (settingName === 'apiKey') {
		return {
			title: 'API Key',

			// **Please follow this convention**:
			// The word "key..." here is a placeholder for the hash. For example, sk-ant-key... means the key will look like sk-ant-abcdefg123...
			placeholder: providerName === 'anthropic' ? 'sk-ant-key...' : // sk-ant-api03-key
				providerName === 'openAI' ? 'sk-proj-key...' :
					providerName === 'deepseek' ? 'sk-key...' :
						providerName === 'openRouter' ? 'sk-or-key...' : // sk-or-v1-key
							providerName === 'gemini' ? 'AIzaSy...' :
								providerName === 'groq' ? 'gsk_key...' :
									providerName === 'openAICompatible' ? 'sk-key...' :
										providerName === 'xAI' ? 'xai-key...' :
											providerName === 'mistral' ? 'api-key...' :
												providerName === 'googleVertex' ? 'AIzaSy...' :
													providerName === 'microsoftAzure' ? 'key-...' :
														providerName === 'awsBedrock' ? 'key-...' :
															'',

			isPasswordField: true,
		}
	}
	else if (settingName === 'endpoint') {
		return {
			title: providerName === 'ollama' ? 'Endpoint' :
				providerName === 'vLLM' ? 'Endpoint' :
					providerName === 'lmStudio' ? 'Endpoint' :
						providerName === 'openAICompatible' ? 'baseURL' : // (do not include /chat/completions)
							providerName === 'googleVertex' ? 'baseURL' :
								providerName === 'microsoftAzure' ? 'baseURL' :
									providerName === 'liteLLM' ? 'baseURL' :
										providerName === 'awsBedrock' ? 'Endpoint' :
											'(never)',

			placeholder: providerName === 'ollama' ? defaultProviderSettings.ollama.endpoint
				: providerName === 'vLLM' ? defaultProviderSettings.vLLM.endpoint
					: providerName === 'openAICompatible' ? 'https://my-website.com/v1'
						: providerName === 'lmStudio' ? defaultProviderSettings.lmStudio.endpoint
							: providerName === 'liteLLM' ? 'http://localhost:4000'
								: providerName === 'awsBedrock' ? 'http://localhost:4000/v1'
									: '(never)',


		}
	}
	else if (settingName === 'headersJSON') {
		return { title: 'Custom Headers', placeholder: '{ "X-Request-Id": "..." }' }
	}
	else if (settingName === 'region') {
		// vertex only
		return {
			title: 'Region',
			placeholder: providerName === 'googleVertex' ? defaultProviderSettings.googleVertex.region
				: providerName === 'awsBedrock'
					? defaultProviderSettings.awsBedrock.region
					: ''
		}
	}
	else if (settingName === 'azureApiVersion') {
		// azure only
		return {
			title: 'API Version',
			placeholder: providerName === 'microsoftAzure' ? defaultProviderSettings.microsoftAzure.azureApiVersion
				: ''
		}
	}
	else if (settingName === 'project') {
		return {
			title: providerName === 'microsoftAzure' ? 'Resource'
				: providerName === 'googleVertex' ? 'Project'
					: '',
			placeholder: providerName === 'microsoftAzure' ? 'my-resource'
				: providerName === 'googleVertex' ? 'my-project'
					: ''

		}

	}
	else if (settingName === '_didFillInProviderSettings') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}
	else if (settingName === 'models') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}

	throw new Error(`displayInfo: Unknown setting name: "${settingName}"`)
}


const defaultCustomSettings: Record<CustomSettingName, undefined> = {
	apiKey: undefined,
	endpoint: undefined,
	region: undefined, // googleVertex
	project: undefined,
	azureApiVersion: undefined,
	headersJSON: undefined,
}


const modelInfoOfDefaultModelNames = (defaultModelNames: string[]): { models: VoidStatefulModelInfo[] } => {
	return {
		models: defaultModelNames.map((modelName, i) => ({
			modelName,
			type: 'default',
			isHidden: defaultModelNames.length >= 10, // hide all models if there are a ton of them, and make user enable them individually
		}))
	}
}

// used when waiting and for a type reference
export const defaultSettingsOfProvider: SettingsOfProvider = {
	anthropic: {
		...defaultCustomSettings,
		...defaultProviderSettings.anthropic,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.anthropic),
		_didFillInProviderSettings: undefined,
	},
	openAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.openAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAI),
		_didFillInProviderSettings: undefined,
	},
	deepseek: {
		...defaultCustomSettings,
		...defaultProviderSettings.deepseek,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.deepseek),
		_didFillInProviderSettings: undefined,
	},
	gemini: {
		...defaultCustomSettings,
		...defaultProviderSettings.gemini,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.gemini),
		_didFillInProviderSettings: undefined,
	},
	xAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.xAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.xAI),
		_didFillInProviderSettings: undefined,
	},
	mistral: {
		...defaultCustomSettings,
		...defaultProviderSettings.mistral,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.mistral),
		_didFillInProviderSettings: undefined,
	},
	liteLLM: {
		...defaultCustomSettings,
		...defaultProviderSettings.liteLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.liteLLM),
		_didFillInProviderSettings: undefined,
	},
	lmStudio: {
		...defaultCustomSettings,
		...defaultProviderSettings.lmStudio,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.lmStudio),
		_didFillInProviderSettings: undefined,
	},
	groq: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.groq,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.groq),
		_didFillInProviderSettings: undefined,
	},
	openRouter: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openRouter,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openRouter),
		_didFillInProviderSettings: undefined,
	},
	openAICompatible: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openAICompatible,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAICompatible),
		_didFillInProviderSettings: undefined,
	},
	ollama: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.ollama,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.ollama),
		_didFillInProviderSettings: undefined,
	},
	vLLM: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.vLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.vLLM),
		_didFillInProviderSettings: undefined,
	},
	googleVertex: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.googleVertex,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.googleVertex),
		_didFillInProviderSettings: undefined,
	},
	microsoftAzure: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.microsoftAzure,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.microsoftAzure),
		_didFillInProviderSettings: undefined,
	},
	awsBedrock: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.awsBedrock,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.awsBedrock),
		_didFillInProviderSettings: undefined,
	},
	aCoder: { // free models with OAuth sign-in
		...defaultCustomSettings,
		...defaultProviderSettings.aCoder,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.aCoder),
		// aCoder doesn't require user to fill in settings - authentication is handled via OAuth
		_didFillInProviderSettings: true,
	},
}


export type ModelSelection = { providerName: ProviderName, modelName: string }

export const modelSelectionsEqual = (m1: ModelSelection, m2: ModelSelection) => {
	return m1.modelName === m2.modelName && m1.providerName === m2.providerName
}

// this is a state
export const featureNames = ['Chat', 'Ctrl+K', 'Autocomplete', 'Apply', 'SCM', 'Vision', 'ToolOrchestration'] as const
export type ModelSelectionOfFeature = Record<(typeof featureNames)[number], ModelSelection | null>
export type FeatureName = keyof ModelSelectionOfFeature

export const displayInfoOfFeatureName = (featureName: FeatureName) => {
	// editor:
	if (featureName === 'Autocomplete')
		return 'Autocomplete'
	else if (featureName === 'Ctrl+K')
		return 'Quick Edit'
	// sidebar:
	else if (featureName === 'Chat')
		return 'Chat'
	else if (featureName === 'Apply')
		return 'Apply'
	// source control:
	else if (featureName === 'SCM')
		return 'Commit Message Generator'
	// vision:
	else if (featureName === 'Vision')
		return 'Vision (Image Processing)'
	// tool orchestration:
	else if (featureName === 'ToolOrchestration')
		return 'Tool Orchestration'
	else
		throw new Error(`Feature Name ${featureName} not allowed`)
}


// the models of these can be refreshed (in theory all can, but not all should)
export const refreshableProviderNames = localProviderNames
export type RefreshableProviderName = typeof refreshableProviderNames[number]

// models that come with download buttons
export const hasDownloadButtonsOnModelsProviderNames = ['ollama'] as const satisfies ProviderName[]





// use this in isFeatuerNameDissbled
export const isProviderNameDisabled = (providerName: ProviderName, settingsState: VoidSettingsState) => {

	const settingsAtProvider = settingsState.settingsOfProvider[providerName]
	const isAutodetected = (refreshableProviderNames as string[]).includes(providerName)

	const isDisabled = settingsAtProvider.models.length === 0
	if (isDisabled) {
		return isAutodetected ? 'providerNotAutoDetected' : (!settingsAtProvider._didFillInProviderSettings ? 'notFilledIn' : 'addModel')
	}
	return false
}

export const isFeatureNameDisabled = (featureName: FeatureName, settingsState: VoidSettingsState) => {
	// if has a selected provider, check if it's enabled
	const selectedProvider = settingsState.modelSelectionOfFeature[featureName]

	if (selectedProvider) {
		const { providerName } = selectedProvider
		return isProviderNameDisabled(providerName, settingsState)
	}

	// if there are any models they can turn on, tell them that
	const canTurnOnAModel = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName].models.filter(m => m.isHidden).length !== 0)
	if (canTurnOnAModel) return 'needToEnableModel'

	// if there are any providers filled in, then they just need to add a model
	const anyFilledIn = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName]._didFillInProviderSettings)
	if (anyFilledIn) return 'addModel'

	return 'addProvider'
}







export type ChatMode = 'code' | 'plan' | 'chat' | 'learn'

export type StudentLevel = 'beginner' | 'intermediate' | 'advanced'


export type GlobalSettings = {
	autoRefreshModels: boolean;
	aiInstructions: string;
	enableAutocomplete: boolean;
	syncApplyToChat: boolean;
	syncSCMToChat: boolean;
	enableFastApply: boolean;
	chatMode: ChatMode;
	studentLevel: StudentLevel;
	autoApprove: { [approvalType in ToolApprovalType]?: boolean };
	showInlineSuggestions: boolean;
	includeToolLintErrors: boolean;
	isOnboardingComplete: boolean;
	disableSystemMessage: boolean;
	autoAcceptLLMChanges: boolean;
	enableVisionSupport: boolean;
	enableMorphFastApply: boolean; // Use Morph API for intelligent code application
	enableMorphFastContext: boolean; // Use Morph API for fast context gathering
	enableMorphRepoStorage: boolean; // Use Morph Repo Storage (git + semantic search)
	morphRepoId?: string; // Repo identifier for Morph Repo Storage
	morphRepoBranch?: string; // Branch to use for Morph Repo Storage operations
	morphRepoIndexOnPush?: boolean; // Whether to index embeddings on push
	morphRepoWaitForEmbeddings?: boolean; // Whether to block push until embeddings finish
	morphApiKey: string; // API key for Morph
	morphModel: 'morph-v3-fast' | 'morph-v3-large' | 'auto'; // Morph model to use
	enableToolResultTOON: boolean;
	maxAgentIterations: number; // Maximum number of iterations in agent mode
	imageGenerationBaseUrl: string; // Base URL for OpenAI-compatible image generation API
	imageGenerationModel: string; // Default model for image generation
	enableMediaGeneration: boolean; // Enable/disable image generation tool
	enableToolOrchestration: boolean; // Enable/disable universal tool orchestration
	// Mobile API settings
	apiEnabled: boolean; // Enable/disable the Mobile API server
	apiPort: number; // Port for the API server (default: 3737)
	apiTokens: string[]; // List of valid API tokens for authentication
	apiTunnelUrl?: string; // Optional Cloudflare Tunnel URL for secure remote access
}

export const defaultGlobalSettings: GlobalSettings = {
	autoRefreshModels: true,
	aiInstructions: '',
	enableAutocomplete: false,
	syncApplyToChat: true,
	syncSCMToChat: true,
	enableFastApply: true,
	chatMode: 'code',
	studentLevel: 'beginner',
	autoApprove: {},
	showInlineSuggestions: true,
	includeToolLintErrors: true,
	isOnboardingComplete: false,
	disableSystemMessage: false,
	autoAcceptLLMChanges: false,
	enableVisionSupport: false,
	enableMorphFastApply: false,
	enableMorphFastContext: false,
	enableMorphRepoStorage: false,
	morphRepoId: undefined,
	morphRepoBranch: 'main',
	morphRepoIndexOnPush: true,
	morphRepoWaitForEmbeddings: false,
	morphApiKey: '',
	morphModel: 'auto',
	enableToolResultTOON: false,
	maxAgentIterations: 50,
	enableMediaGeneration: true, // Media generation enabled by default
	imageGenerationBaseUrl: 'http://localhost:11434/v1', // Default to Ollama
	imageGenerationModel: 'x/flux2-klein:4b', // Default model for image generation
	enableToolOrchestration: false, // Tool orchestration disabled by default (requires setup)
	// Mobile API defaults
	apiEnabled: false, // Disabled by default for security
	apiPort: 3737, // Default port
	apiTokens: [], // No tokens by default
	apiTunnelUrl: undefined, // No tunnel URL by default
}

export type GlobalSettingName = keyof GlobalSettings
export const globalSettingNames = Object.keys(defaultGlobalSettings) as GlobalSettingName[]












export type ModelSelectionOptions = {
	reasoningEnabled?: boolean;
	reasoningBudget?: number;
	reasoningEffort?: string;
	morphFastContext?: boolean; // Use Morph Fast Context for context gathering
}

export type OptionsOfModelSelection = {
	[featureName in FeatureName]: Partial<{
		[providerName in ProviderName]: {
			[modelName: string]: ModelSelectionOptions | undefined
		}
	}>
}





export type OverridesOfModel = {
	[providerName in ProviderName]: {
		[modelName: string]: Partial<ModelOverrides> | undefined
	}
}


const overridesOfModel = {} as OverridesOfModel
for (const providerName of providerNames) { overridesOfModel[providerName] = {} }
export const defaultOverridesOfModel = overridesOfModel



export interface MCPUserStateOfName {
	[serverName: string]: MCPUserState | undefined;
}

export interface MCPUserState {
	isOn: boolean;
}

// ======================================================== Learning Progress Types ========================================================

export type ExerciseType = 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code';

export interface LessonProgress {
	lessonId: string;
	title: string;
	completed: boolean;
	sectionsRead: string[]; // IDs of completed sections
	exercisesAttempted: { [exerciseId: string]: ExerciseAttempt };
	quizResults: QuizResult[];
	totalScore: number;
	timeSpent: number; // in seconds
	lastAccessed: number; // timestamp
}

export interface ExerciseAttempt {
	exerciseId: string;
	type: ExerciseType;
	attempts: number;
	solved: boolean;
	hintsUsed: number;
	timeSpent: number; // in seconds
	firstAttemptTime: number; // timestamp
	lastAttemptTime: number; // timestamp
}

export interface QuizResult {
	quizId: string;
	title: string;
	score: number;
	totalPoints: number;
	percentage: number;
	questionsCorrect: number;
	totalQuestions: number;
	timestamp: number;
}

export interface HintUsage {
	exerciseId: string;
	hintLevel: number; // 1-4
	timestamp: number;
}

export interface ThreadLearningProgress {
	threadId: string;
	lessons: { [lessonId: string]: LessonProgress };
	exercises: { [exerciseId: string]: ExerciseAttempt };
	quizzes: QuizResult[];
	hints: HintUsage[];
	streakCount: number; // consecutive days learning
	badges: Badge[];
	totalLessonsCompleted: number;
	totalExercisesSolved: number;
	totalTimeSpent: number; // in seconds
	startDate: number; // timestamp
	lastUpdated: number; // timestamp
}

export interface Badge {
	id: string;
	name: string;
	description: string;
	icon: string;
	unlockedAt: number;
	category: 'lessons' | 'exercises' | 'quizzes' | 'streaks' | 'milestones';
}

export interface LearningSettings {
	preferredFontSize: 'small' | 'medium' | 'large';
	preferredCodeTheme: 'light' | 'dark' | 'auto';
	enableCelebrations: boolean;
	enableSoundEffects: boolean;
	enableAnimations: boolean;
	enableReducedMotion: boolean;
	enableHighContrast: boolean;
}

export const defaultLearningSettings: LearningSettings = {
	preferredFontSize: 'medium',
	preferredCodeTheme: 'auto',
	enableCelebrations: true,
	enableSoundEffects: false,
	enableAnimations: true,
	enableReducedMotion: false,
	enableHighContrast: false,
};

export interface GlobalLearningProgress {
	threads: { [threadId: string]: ThreadLearningProgress };
	settings: LearningSettings;
	bookmarks: { [lessonId: string]: string[] }; // lesson ID -> section IDs
	notes: { [lessonId: string]: { [sectionId: string]: string } }; // lesson ID -> section ID -> note
	globalStats: {
		totalLessonsCompleted: number;
		totalExercisesSolved: number;
		totalQuizzesTaken: number;
		totalTimeSpent: number;
		currentStreak: number;
		longestStreak: number;
		lastLearningDate: number;
		lastUpdated: number;
	};
}

export const defaultGlobalLearningProgress: GlobalLearningProgress = {
	threads: {},
	settings: defaultLearningSettings,
	bookmarks: {},
	notes: {},
	globalStats: {
		totalLessonsCompleted: 0,
		totalExercisesSolved: 0,
		totalQuizzesTaken: 0,
		totalTimeSpent: 0,
		currentStreak: 0,
		longestStreak: 0,
		lastLearningDate: 0,
		lastUpdated: 0,
	},
};
