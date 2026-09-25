/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	getModelCapabilities,
	getMaxOutputTokens,
	getReservedOutputTokenSpace,
} from '../../common/modelCapabilities.js';
import { generatedModelCatalog } from '../../common/modelCatalog.generated.js';
import type { GeneratedModelCatalog } from '../../common/modelCatalog.generated.js';
import type { OverridesOfModel } from '../../common/voidSettingsTypes.js';

// typed view so arbitrary lookups are allowed
const catalog: GeneratedModelCatalog = generatedModelCatalog;

const emptyOverridesOfModel = Object.fromEntries(
	['anthropic', 'openAI', 'deepseek', 'ollama', 'ollamaCloud', 'vLLM', 'openRouter', 'openAICompatible', 'gemini', 'groq', 'xAI', 'mistral', 'lmStudio', 'liteLLM', 'googleVertex', 'microsoftAzure', 'awsBedrock', 'aCoder', 'openAdapter', 'llamaCpp'].map(p => [p, {}])
) as OverridesOfModel;

suite('modelCapabilities - context window / max output tokens', () => {

	test('static table entries win over the generated catalog', () => {
		const caps = getModelCapabilities('anthropic', 'claude-3-7-sonnet-20250219', emptyOverridesOfModel);
		assert.strictEqual(caps.isUnrecognizedModel, false);
		assert.strictEqual(caps.contextWindow, 200_000);
		assert.strictEqual(caps.reservedOutputTokenSpace, 8_192);
	});

	test('catalog fallback recognizes unknown models with per-model data', () => {
		// pick a model that models.dev knows but the hand-written tables don't
		const openRouterModel = Object.keys(catalog['openRouter'] ?? {})
			.find(id => !id.toLowerCase().includes('claude') && !id.toLowerCase().includes('gpt')
				&& !id.toLowerCase().includes('gemini') && !id.toLowerCase().includes('grok'));
		assert.ok(openRouterModel, 'expected at least one uncataloged-in-tables openrouter model');
		const catalogEntry = catalog['openRouter'][openRouterModel];

		const caps = getModelCapabilities('openRouter', openRouterModel, emptyOverridesOfModel);
		assert.strictEqual(caps.isUnrecognizedModel, false);
		assert.strictEqual(caps.contextWindow, catalogEntry.contextWindow);
		assert.strictEqual(caps.maxOutputTokens, catalogEntry.maxTokens);
	});

	test('openRouter vendor/model ids resolve via path-segment match', () => {
		const vendorModel = Object.keys(catalog['openRouter'] ?? {}).find(id => id.includes('/'));
		assert.ok(vendorModel, 'expected vendor-prefixed openrouter ids');
		const caps = getModelCapabilities('openRouter', vendorModel.toUpperCase(), emptyOverridesOfModel);
		assert.strictEqual(caps.contextWindow, catalog['openRouter'][vendorModel].contextWindow);
	});

	test('getMaxOutputTokens: hand-listed openRouter models with null reserved space get catalog caps', () => {
		const opts = { isReasoningEnabled: false, overridesOfModel: emptyOverridesOfModel };
		const openRouterModel = Object.keys(catalog['openRouter'] ?? {})[0];
		const cap = getMaxOutputTokens('openRouter', openRouterModel, opts);
		assert.strictEqual(cap, catalog['openRouter'][openRouterModel].maxTokens);
	});

	test('getMaxOutputTokens: reservedOutputTokenSpace wins for hand-written non-null entries', () => {
		const opts = { isReasoningEnabled: false, overridesOfModel: emptyOverridesOfModel };
		const reserved = getReservedOutputTokenSpace('anthropic', 'claude-3-7-sonnet-20250219', opts);
		assert.strictEqual(reserved, 8_192);
		assert.strictEqual(getMaxOutputTokens('anthropic', 'claude-3-7-sonnet-20250219', opts), 8_192);
	});

	test('getMaxOutputTokens: user override wins over everything', () => {
		const opts = {
			isReasoningEnabled: false,
			overridesOfModel: {
				...emptyOverridesOfModel,
				openAI: { 'gpt-4o': { maxOutputTokens: 1234 } },
			} as OverridesOfModel,
		};
		assert.strictEqual(getMaxOutputTokens('openAI', 'gpt-4o', opts), 1234);
	});

	test('user overrides still apply on catalog-resolved models', () => {
		const openRouterModel = Object.keys(catalog['openRouter'] ?? {})[0];
		const catalogEntry = catalog['openRouter'][openRouterModel];
		const caps = getModelCapabilities('openRouter', openRouterModel, {
			...emptyOverridesOfModel,
			openRouter: {
				[openRouterModel]: { contextWindow: catalogEntry.contextWindow + 1 },
			},
		} as OverridesOfModel);
		assert.strictEqual(caps.contextWindow, catalogEntry.contextWindow + 1);
	});

	test('fully unknown models still fall through to defaults', () => {
		const caps = getModelCapabilities('openAICompatible', 'totally-made-up-model-xyz', emptyOverridesOfModel);
		assert.strictEqual(caps.isUnrecognizedModel, true);
		assert.strictEqual(caps.contextWindow, 256_768);
		// unknown models fall back to the reserved-space default (16384) as their output cap
		assert.strictEqual(getMaxOutputTokens('openAICompatible', 'totally-made-up-model-xyz', { isReasoningEnabled: false, overridesOfModel: emptyOverridesOfModel }), 16_384);
	});

});