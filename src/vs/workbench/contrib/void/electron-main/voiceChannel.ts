/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { voidDevLog } from '../common/devLog.js';

interface STTRequest {
	baseUrl: string;
	model: string;
	apiKey: string;
	audioBase64: string; // base64-encoded audio (webm/opus)
	language?: string;
}

interface STTResponse {
	success: boolean;
	text?: string;
	error?: string;
}

interface TTSRequest {
	baseUrl: string;
	model: string;
	voice: string;
	apiKey: string;
	text: string;
	responseFormat?: string;
	speed?: number;
}

interface TTSResponse {
	success: boolean;
	audioBase64?: string; // base64-encoded audio (mp3/opus)
	error?: string;
}

interface TTSRequestBody {
	model: string;
	input: string;
	voice: string;
	response_format: string;
	speed?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const STT_ENDPOINT = '/audio/transcriptions';
const TTS_ENDPOINT = '/audio/speech';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/**
 * IPC Channel for Voice (STT + TTS)
 * Handles speech-to-text and text-to-speech requests from renderer process
 */
export class VoiceChannel implements IServerChannel {

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'transcribe': {
				const request = arg as STTRequest;
				return this.handleSTT(request);
			}
			case 'synthesize': {
				const request = arg as TTSRequest;
				return this.handleTTS(request);
			}
			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not supported: ${event}`);
	}

	dispose(): void {
		// Nothing to dispose
	}

	private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, { ...init, signal: controller.signal });
			return response;
		} finally {
			clearTimeout(timeout);
		}
	}

	private validateSTTRequest(request: STTRequest): string | null {
		if (!isNonEmptyString(request.baseUrl)) {
			return 'STT server URL is missing';
		}
		if (!isNonEmptyString(request.model)) {
			return 'STT model is missing';
		}
		if (!isNonEmptyString(request.audioBase64)) {
			return 'No audio data provided';
		}
		return null;
	}

	private validateTTSRequest(request: TTSRequest): string | null {
		if (!isNonEmptyString(request.baseUrl)) {
			return 'TTS server URL is missing';
		}
		if (!isNonEmptyString(request.model)) {
			return 'TTS model is missing';
		}
		if (!isNonEmptyString(request.text)) {
			return 'No text provided to speak';
		}
		return null;
	}

	private async handleSTT(request: STTRequest): Promise<STTResponse> {
		const validationError = this.validateSTTRequest(request);
		if (validationError) {
			return { success: false, error: validationError };
		}

		const { baseUrl, model, apiKey, audioBase64, language } = request;

		try {
			const url = `${baseUrl}${STT_ENDPOINT}`;

			// Convert base64 to Buffer for multipart form data
			const audioBuffer = Buffer.from(audioBase64, 'base64');

			const boundary = `----VoiceFormBoundary${Math.random().toString(36).substring(2)}`;

			const formParts: Buffer[] = [];

			// model field
			formParts.push(Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`,
				'utf-8'
			));

			// language field (optional)
			if (language) {
				formParts.push(Buffer.from(
					`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
					'utf-8'
				));
			}

			// audio file field
			formParts.push(Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
				'utf-8'
			));
			formParts.push(audioBuffer);
			formParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'));

			const body = Buffer.concat(formParts);

			const headers: Record<string, string> = {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
			};
			if (apiKey) {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}

			voidDevLog('[VoiceChannel] STT request to:', url);

			const response = await this.fetchWithTimeout(url, {
				method: 'POST',
				headers,
				body,
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[VoiceChannel] STT failed:', response.status, errorText);
				return {
					success: false,
					error: `STT failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
				};
			}

			const data = await response.json() as { text?: unknown };

			if (!isNonEmptyString(data.text)) {
				return {
					success: false,
					error: 'No transcription returned from API',
				};
			}

			voidDevLog('[VoiceChannel] STT success');
			return {
				success: true,
				text: data.text,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown STT error';
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[VoiceChannel] STT timed out');
				return { success: false, error: 'STT request timed out — check your server' };
			}
			console.error('[VoiceChannel] STT error:', error);
			return {
				success: false,
				error: `STT error: ${message}`,
			};
		}
	}

	private async handleTTS(request: TTSRequest): Promise<TTSResponse> {
		const validationError = this.validateTTSRequest(request);
		if (validationError) {
			return { success: false, error: validationError };
		}

		const { baseUrl, model, voice, apiKey, text, responseFormat, speed } = request;

		try {
			const url = `${baseUrl}${TTS_ENDPOINT}`;

			const requestBody: TTSRequestBody = {
				model,
				input: text,
				voice,
				response_format: responseFormat || 'mp3',
			};

			if (speed !== undefined) {
				requestBody.speed = speed;
			}

			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};
			if (apiKey) {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}

			voidDevLog('[VoiceChannel] TTS request to:', url);

			const response = await this.fetchWithTimeout(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[VoiceChannel] TTS failed:', response.status, errorText);
				return {
					success: false,
					error: `TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
				};
			}

			// Get audio as ArrayBuffer and convert to base64
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			const audioBase64 = buffer.toString('base64');

			voidDevLog('[VoiceChannel] TTS success');
			return {
				success: true,
				audioBase64,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown TTS error';
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[VoiceChannel] TTS timed out');
				return { success: false, error: 'TTS request timed out — check your server' };
			}
			console.error('[VoiceChannel] TTS error:', error);
			return {
				success: false,
				error: `TTS error: ${message}`,
			};
		}
	}
}
