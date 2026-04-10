/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { FileAccess } from '../../../../base/common/network.js';

export interface ISoundService {
	readonly _serviceBrand: undefined;
	playSound(soundName: string): Promise<void>;
}

export const ISoundService = createDecorator<ISoundService>('SoundService');

export class SoundService implements ISoundService {
	_serviceBrand: undefined;

	private readonly playingSounds = new Set<string>();
	private readonly sounds = new Map<string, HTMLAudioElement>();

	async playSound(soundName: string): Promise<void> {
		if (soundName === 'none' || !soundName) {
			return;
		}

		// Prevent playing the same sound multiple times simultaneously
		if (this.playingSounds.has(soundName)) {
			return;
		}

		this.playingSounds.add(soundName);

		try {
			const fileName = `${soundName}.wav`;
			const url = FileAccess.asBrowserUri(`vs/workbench/contrib/void/browser/media/${fileName}`).toString(true);

			console.log('[SoundService] Playing sound:', soundName, 'from URL:', url);

			let audio = this.sounds.get(url);
			if (audio) {
				audio.currentTime = 0;
				await audio.play();
			} else {
				audio = await this.playAudio(url);
				this.sounds.set(url, audio);
			}
		} catch (e) {
			console.error('[SoundService] Error playing sound:', e);
		} finally {
			this.playingSounds.delete(soundName);
		}
	}

	/**
	 * Play the given audio url.
	 */
	private async playAudio(url: string): Promise<HTMLAudioElement> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(url);
			audio.volume = 1.0;

			audio.addEventListener('ended', () => {
				console.log('[SoundService] Sound ended:', url);
				resolve(audio);
			});

			audio.addEventListener('error', (e) => {
				console.error('[SoundService] Audio error event:', e.error, 'url:', url);
				reject(e.error || new Error('Audio error'));
			});

			audio.addEventListener('canplaythrough', () => {
				console.log('[SoundService] Audio can play through:', url);
			});

			audio.play().catch(e => {
				console.error('[SoundService] Audio play() rejected:', e, 'url:', url);
				reject(e);
			});
		});
	}

	constructor() {}
}

// Register the service
registerSingleton(ISoundService, SoundService, InstantiationType.Delayed);