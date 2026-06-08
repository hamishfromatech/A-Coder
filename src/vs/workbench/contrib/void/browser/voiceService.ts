/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

export interface STTRequest {
	baseUrl: string;
	model: string;
	apiKey: string;
	audioBase64: string;
	language?: string;
}

export interface STTResponse {
	success: boolean;
	text?: string;
	error?: string;
}

export interface TTSRequest {
	baseUrl: string;
	model: string;
	voice: string;
	apiKey: string;
	text: string;
	responseFormat?: string;
	speed?: number;
}

export interface TTSResponse {
	success: boolean;
	audioBase64?: string;
	error?: string;
}

export const IVoiceService = createDecorator<IVoiceService>('voiceService');

export interface IVoiceService {
	readonly _serviceBrand: undefined;
	transcribe(request: STTRequest): Promise<STTResponse>;
	synthesize(request: TTSRequest): Promise<TTSResponse>;
}

export class VoiceService implements IVoiceService {
	readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
	) { }

	transcribe(request: STTRequest): Promise<STTResponse> {
		try {
			const channel = this.mainProcessService.getChannel('void-channel-voice');
			if (!channel || typeof channel.call !== 'function') {
				console.error('[VoiceService] Voice channel not available or invalid');
				return Promise.resolve({ success: false, error: 'Voice channel not available' });
			}
			return channel.call('transcribe', request) as Promise<STTResponse>;
		} catch (e) {
			console.error('[VoiceService] transcribe error:', e);
			return Promise.resolve({ success: false, error: e instanceof Error ? e.message : 'Voice service error' });
		}
	}

	synthesize(request: TTSRequest): Promise<TTSResponse> {
		try {
			const channel = this.mainProcessService.getChannel('void-channel-voice');
			if (!channel || typeof channel.call !== 'function') {
				console.error('[VoiceService] Voice channel not available or invalid');
				return Promise.resolve({ success: false, error: 'Voice channel not available' });
			}
			return channel.call('synthesize', request) as Promise<TTSResponse>;
		} catch (e) {
			console.error('[VoiceService] synthesize error:', e);
			return Promise.resolve({ success: false, error: e instanceof Error ? e.message : 'Voice service error' });
		}
	}
}

registerSingleton(IVoiceService, VoiceService, InstantiationType.Eager);
