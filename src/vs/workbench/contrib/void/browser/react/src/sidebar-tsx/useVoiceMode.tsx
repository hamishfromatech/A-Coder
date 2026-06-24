/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessor, useSettingsState } from '../util/services.js';
import { voidDevWarn } from '../../../../common/devLog.js';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface UseVoiceModeOptions {
	threadId: string;
	/** Called when STT returns a transcription. The caller should place it in the input box. */
	onTranscription: (text: string) => void;
}

interface UseVoiceModeReturn {
	phase: VoicePhase;
	audioLevel: number;
	error: string | null;
	isListening: boolean;
	startListening: () => void;
	stopListening: () => void;
	stopAudioPlayback: () => void;
	/** Call before sending a message that was composed via voice so the next assistant response is spoken (if TTS is enabled). */
	prepareResponseTTS: () => void;
}

const PREFERRED_MIME_TYPE = 'audio/webm;codecs=opus';
const FALLBACK_MIME_TYPE = 'audio/webm';
const DEFAULT_MIME_TYPE = '';

const getSupportedMimeType = (): string => {
	if (typeof MediaRecorder === 'undefined') {
		return DEFAULT_MIME_TYPE;
	}
	if (MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)) {
		return PREFERRED_MIME_TYPE;
	}
	if (MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)) {
		return FALLBACK_MIME_TYPE;
	}
	return DEFAULT_MIME_TYPE;
};

const mimeTypeOfTtsFormat = (format: string): string => {
	switch (format) {
		case 'opus': return 'audio/opus';
		case 'aac': return 'audio/aac';
		case 'flac': return 'audio/flac';
		case 'wav': return 'audio/wav';
		case 'pcm': return 'audio/wav';
		case 'mp3':
		default: return 'audio/mp3';
	}
};

export const useVoiceMode = ({ threadId, onTranscription }: UseVoiceModeOptions): UseVoiceModeReturn => {
	const accessor = useAccessor();
	const settingsState = useSettingsState();
	const chatThreadsService = accessor.get('IChatThreadService');

	const [phase, setPhase] = useState<VoicePhase>('idle');
	const [error, setError] = useState<string | null>(null);
	const [audioLevel, setAudioLevel] = useState(0);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const inFlightRef = useRef({ stt: false, tts: false });
	const hasSpokenRef = useRef(false);
	const pendingTTSRef = useRef(false);
	const mountedRef = useRef(true);

	// Realtime STT state.
	const isRecordingRef = useRef(false);
	const isSendingRef = useRef(false);
	const audioChunksRef = useRef<{ blob: Blob; index: number }[]>([]);
	const transcriptRef = useRef('');
	const nextChunkIndexRef = useRef(0);
	const nextExpectedChunkIndexRef = useRef(0);
	const onTranscriptionRef = useRef(onTranscription);
	onTranscriptionRef.current = onTranscription;

	// Safe state setters must be declared before any callback that depends on them.
	const safeSetPhase = useCallback((next: VoicePhase) => {
		if (mountedRef.current) setPhase(next);
	}, []);
	const safeSetError = useCallback((next: string | null) => {
		if (mountedRef.current) setError(next);
	}, []);
	const safeSetAudioLevel = useCallback((next: number) => {
		if (mountedRef.current) setAudioLevel(next);
	}, []);

	const voiceSettings = settingsState.globalSettings;
	const sttEnabled = voiceSettings.sttEnabled ?? false;
	const sttServerUrl = voiceSettings.sttServerUrl ?? 'http://localhost:11434/v1';
	const sttModel = voiceSettings.sttModel ?? 'whisper-1';
	const sttApiKey = voiceSettings.sttApiKey ?? '';
	const ttsEnabled = voiceSettings.ttsEnabled ?? false;
	const ttsServerUrl = voiceSettings.ttsServerUrl ?? 'http://localhost:11434/v1';
	const ttsModel = voiceSettings.ttsModel ?? 'tts-1';
	const ttsVoice = voiceSettings.ttsVoice ?? 'alloy';
	const ttsApiKey = voiceSettings.ttsApiKey ?? '';
	const ttsResponseFormat = voiceSettings.ttsResponseFormat ?? 'mp3';

	const stopAudioPlayback = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current = null;
		}
	}, []);

	const stopMediaTracks = useCallback(() => {
		streamRef.current?.getTracks().forEach(t => t.stop());
		streamRef.current = null;
		mediaRecorderRef.current = null;
		analyserRef.current = null;
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
			audioContextRef.current.close().catch((e: unknown) => { voidDevWarn('[voiceMode] audioContext.close failed:', e) });
			audioContextRef.current = null;
		}
		safeSetAudioLevel(0);
	}, [safeSetAudioLevel]);

	const reset = useCallback(() => {
		stopAudioPlayback();
		stopMediaTracks();
		inFlightRef.current = { stt: false, tts: false };
		hasSpokenRef.current = false;
		pendingTTSRef.current = false;
		isRecordingRef.current = false;
		isSendingRef.current = false;
		audioChunksRef.current = [];
		transcriptRef.current = '';
		nextChunkIndexRef.current = 0;
		nextExpectedChunkIndexRef.current = 0;
		if (mountedRef.current) setPhase('idle');
		if (mountedRef.current) setError(null);
	}, [stopAudioPlayback, stopMediaTracks, safeSetPhase, safeSetError]);

	// Cleanup everything when the hook unmounts.
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			reset();
		};
	}, [reset]);

	const startMetering = useCallback((stream: MediaStream) => {
		try {
			const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
			audioContextRef.current = audioContext;
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			analyserRef.current = analyser;

			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			const tick = () => {
				if (!analyserRef.current) return;
				analyserRef.current.getByteFrequencyData(dataArray);
				const sum = dataArray.reduce((a, b) => a + b, 0);
				const average = sum / dataArray.length / 255;
				safeSetAudioLevel(Math.min(1, Math.max(0, average * 2.5)));
				animationFrameRef.current = requestAnimationFrame(tick);
			};
			tick();
		} catch (e) {
			// Metering is optional; ignore failures.
		}
	}, [safeSetAudioLevel]);

	const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve((reader.result as string).split(',')[1]);
			reader.onerror = () => reject(new Error('Failed to read recorded audio'));
			reader.readAsDataURL(blob);
		});
	}, []);

	const sendAudioChunk = useCallback(async (base64Audio: string) => {
		try {
			const voiceService = accessor.get('IVoiceService');
			const result = await voiceService.transcribe({
				baseUrl: sttServerUrl,
				model: sttModel,
				apiKey: sttApiKey,
				audioBase64: base64Audio,
			});
			if (!result.success || !result.text) {
				safeSetError(result.error || "Couldn’t hear that — try again?");
				return;
			}
			// Append the new chunk to the running transcript and stream the full text back.
			transcriptRef.current += (transcriptRef.current ? ' ' : '') + result.text.trim();
			onTranscriptionRef.current(transcriptRef.current);
		} catch (e) {
			safeSetError(e instanceof Error ? e.message : 'Audio error — check your microphone');
		}
	}, [sttServerUrl, sttModel, sttApiKey, accessor, safeSetError]);

	const processSendQueue = useCallback(async () => {
		if (isSendingRef.current) return;
		const next = audioChunksRef.current.find(c => c.index === nextExpectedChunkIndexRef.current);
		if (!next) return;
		isSendingRef.current = true;
		try {
			const base64 = await blobToBase64(next.blob);
			await sendAudioChunk(base64);
		} finally {
			audioChunksRef.current = audioChunksRef.current.filter(c => c.index !== nextExpectedChunkIndexRef.current);
			nextExpectedChunkIndexRef.current += 1;
			isSendingRef.current = false;
			// Continue draining the queue.
			processSendQueue();
			// If recording has stopped and the queue is empty, settle into the final phase.
			if (!isRecordingRef.current && audioChunksRef.current.length === 0) {
				safeSetPhase(ttsEnabled && pendingTTSRef.current ? 'thinking' : 'idle');
			}
		}
	}, [blobToBase64, sendAudioChunk, safeSetPhase, ttsEnabled]);

	const startListening = useCallback(async () => {
		if (!sttEnabled) {
			safeSetError('Speech-to-text is disabled in settings');
			return;
		}
		if (phase === 'listening' || phase === 'transcribing') {
			return;
		}
		// Stop any previous playback before recording again.
		stopAudioPlayback();
		safeSetError(null);
		safeSetAudioLevel(0);
		safeSetPhase('listening');

		// Reset streaming state for a fresh session.
		isRecordingRef.current = false;
		isSendingRef.current = false;
		audioChunksRef.current = [];
		transcriptRef.current = '';
		nextChunkIndexRef.current = 0;
		nextExpectedChunkIndexRef.current = 0;

		try {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				throw new Error('Microphone access is not supported in this environment');
			}
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (!mountedRef.current) {
				stream.getTracks().forEach(t => t.stop());
				return;
			}
			streamRef.current = stream;
			startMetering(stream);

			const mimeType = getSupportedMimeType();
			const options = mimeType ? { mimeType } : undefined;
			const mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size === 0) return;
				const index = nextChunkIndexRef.current;
				nextChunkIndexRef.current += 1;
				audioChunksRef.current.push({ blob: e.data, index });
				processSendQueue();
			};

			mediaRecorder.onstop = () => {
				isRecordingRef.current = false;
				stopMediaTracks();
				// If no chunks are queued or in flight, reset immediately.
				if (audioChunksRef.current.length === 0 && !isSendingRef.current) {
					safeSetPhase(ttsEnabled && pendingTTSRef.current ? 'thinking' : 'idle');
					return;
				}
				// Otherwise, drain the queue and let processSendQueue settle the phase.
				safeSetPhase('transcribing');
				processSendQueue();
			};

			mediaRecorder.onerror = () => {
				isRecordingRef.current = false;
				stopMediaTracks();
				safeSetPhase('error');
				safeSetError('Recorder error — try again');
			};

			mediaRecorderRef.current = mediaRecorder;
			isRecordingRef.current = true;
			// Emit a new chunk every 1.5 seconds so transcription streams in realtime.
			mediaRecorder.start(1500);
		} catch (e) {
			stopMediaTracks();
			safeSetPhase('error');
			safeSetError(e instanceof Error ? e.message : 'Microphone access denied — allow it in your browser settings');
		}
	}, [sttEnabled, phase, startMetering, stopMediaTracks, stopAudioPlayback, processSendQueue, safeSetPhase, safeSetError, safeSetAudioLevel, ttsEnabled]);

	const stopListening = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state === 'recording') {
			recorder.stop();
		} else {
			stopMediaTracks();
		}
		// The recorder.onstop handler will drain any remaining chunks and settle the phase.
	}, [stopMediaTracks]);

	const prepareResponseTTS = useCallback(() => {
		if (!ttsEnabled) return;
		pendingTTSRef.current = true;
		hasSpokenRef.current = false;
	}, [ttsEnabled]);

	// TTS: speak the latest committed assistant message after a voice message is sent.
	useEffect(() => {
		if (!ttsEnabled || !pendingTTSRef.current || inFlightRef.current.tts || hasSpokenRef.current) {
			return;
		}
		const disposable = chatThreadsService.onDidChangeCurrentThread(() => {
			if (!pendingTTSRef.current || inFlightRef.current.tts || hasSpokenRef.current) {
				return;
			}
			const thread = chatThreadsService.getThread(threadId);
			if (!thread) return;
			const msgs = thread.messages;
			const lastMsg = msgs[msgs.length - 1];
			if (lastMsg?.role !== 'assistant' || lastMsg.isStreaming) {
				return;
			}
			inFlightRef.current.tts = true;
			safeSetPhase('speaking');
			const voiceService = accessor.get('IVoiceService');
			voiceService.synthesize({
				baseUrl: ttsServerUrl,
				model: ttsModel,
				voice: ttsVoice,
				apiKey: ttsApiKey,
				responseFormat: ttsResponseFormat,
				text: lastMsg.displayContent || '',
			})
				.then((result: { success: boolean; audioBase64?: string; error?: string }) => {
					if (!result.success || !result.audioBase64) {
						throw new Error(result.error || 'TTS failed');
					}
					const audioMimeType = mimeTypeOfTtsFormat(ttsResponseFormat);
					const audio = new Audio(`data:${audioMimeType};base64,${result.audioBase64}`);
					audioRef.current = audio;
					audio.onended = () => {
						hasSpokenRef.current = true;
						pendingTTSRef.current = false;
						safeSetPhase('idle');
					};
					audio.onerror = () => {
						throw new Error('Failed to play spoken response');
					};
					return audio.play();
				})
				.catch((e: unknown) => {
					hasSpokenRef.current = true;
					pendingTTSRef.current = false;
					stopAudioPlayback();
					safeSetPhase('error');
					safeSetError(e instanceof Error ? e.message : 'Could not speak the response');
				})
				.finally(() => {
					inFlightRef.current.tts = false;
				});
		});
		return () => disposable.dispose();
		// Deps intentionally omit the stable ref-based setters already captured above; re-subscribing on every render would churn the TTS stream.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ttsEnabled, threadId, ttsServerUrl, ttsModel, ttsVoice, ttsApiKey, ttsResponseFormat, accessor, chatThreadsService, stopAudioPlayback, safeSetPhase, safeSetError]);

	return {
		phase,
		audioLevel,
		error,
		isListening: phase === 'listening',
		startListening,
		stopListening,
		stopAudioPlayback,
		prepareResponseTTS,
	};
};
