/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Volume2, PhoneOff, Loader2, AlertCircle } from 'lucide-react';
import { useAccessor, useSettingsState } from '../util/services.js';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceModePanelProps {
	threadId: string;
	exitVoiceMode: () => void;
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

export const VoiceModePanel: React.FC<VoiceModePanelProps> = ({ threadId, exitVoiceMode }) => {
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
	const mountedRef = useRef(true);

	const sttEnabled = settingsState.sttEnabled ?? false;
	const sttServerUrl = settingsState.sttServerUrl ?? 'http://localhost:11434/v1';
	const sttModel = settingsState.sttModel ?? 'whisper-1';
	const sttApiKey = settingsState.sttApiKey ?? '';
	const ttsEnabled = settingsState.ttsEnabled ?? false;
	const ttsServerUrl = settingsState.ttsServerUrl ?? 'http://localhost:11434/v1';
	const ttsModel = settingsState.ttsModel ?? 'tts-1';
	const ttsVoice = settingsState.ttsVoice ?? 'alloy';
	const ttsApiKey = settingsState.ttsApiKey ?? '';

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
			audioContextRef.current.close().catch(() => { });
			audioContextRef.current = null;
		}
		safeSetAudioLevel(0);
	}, [safeSetAudioLevel]);

	const reset = useCallback(() => {
		stopAudioPlayback();
		stopMediaTracks();
		inFlightRef.current = { stt: false, tts: false };
		hasSpokenRef.current = false;
	}, [stopAudioPlayback, stopMediaTracks]);

	const safeSetPhase = useCallback((next: VoicePhase) => {
		if (mountedRef.current) setPhase(next);
	}, []);
	const safeSetError = useCallback((next: string | null) => {
		if (mountedRef.current) setError(next);
	}, []);
	const safeSetAudioLevel = useCallback((next: number) => {
		if (mountedRef.current) setAudioLevel(next);
	}, []);

	// Cleanup everything when the panel unmounts or the user exits voice mode.
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			reset();
		};
	}, [reset]);

	// Escape key exits voice mode.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				exitVoiceMode();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [exitVoiceMode]);

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

	const handleTranscription = useCallback(async (base64Audio: string) => {
		if (inFlightRef.current.stt) return;
		inFlightRef.current.stt = true;
		safeSetPhase('transcribing');
		try {
			const voiceService = accessor.get('IVoiceService');
			const result = await voiceService.transcribe({
				baseUrl: sttServerUrl,
				model: sttModel,
				apiKey: sttApiKey,
				audioBase64: base64Audio,
			});
			if (!result.success || !result.text) {
				safeSetPhase('error');
				safeSetError(result.error || "Couldn’t hear that — try again?");
				return;
			}
			safeSetPhase(ttsEnabled ? 'thinking' : 'idle');
			chatThreadsService.sendUserMessage(threadId, result.text);
			hasSpokenRef.current = false;
		} catch (e) {
			safeSetPhase('error');
			safeSetError(e instanceof Error ? e.message : 'Audio error — check your microphone');
		} finally {
			inFlightRef.current.stt = false;
		}
	}, [threadId, sttServerUrl, sttModel, sttApiKey, ttsEnabled, accessor, chatThreadsService, safeSetPhase, safeSetError]);

	const startListening = useCallback(async () => {
		if (phase === 'listening' || phase === 'transcribing' || phase === 'thinking' || phase === 'speaking') {
			return;
		}
		safeSetError(null);
		safeSetAudioLevel(0);
		safeSetPhase('listening');

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
			const chunks: BlobPart[] = [];
			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};
			mediaRecorder.onstop = () => {
				stopMediaTracks();
				const blobType = mimeType ? mimeType.split(';')[0] : 'audio/webm';
				const blob = new Blob(chunks, { type: blobType });
				const reader = new FileReader();
				reader.onload = () => {
					const base64Audio = (reader.result as string).split(',')[1];
					void handleTranscription(base64Audio);
				};
				reader.onerror = () => {
					safeSetPhase('error');
					safeSetError('Failed to read recorded audio');
				};
				reader.readAsDataURL(blob);
			};
			mediaRecorder.onerror = () => {
				stopMediaTracks();
				safeSetPhase('error');
				safeSetError('Recorder error — try again');
			};
			mediaRecorderRef.current = mediaRecorder;
			mediaRecorder.start();
		} catch (e) {
			stopMediaTracks();
			safeSetPhase('error');
			safeSetError(e instanceof Error ? e.message : 'Microphone access denied — allow it in your browser settings');
		}
	}, [phase, startMetering, stopMediaTracks, handleTranscription, safeSetPhase, safeSetError, safeSetAudioLevel]);

	const stopListening = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state === 'recording') {
			recorder.stop();
		} else {
			stopMediaTracks();
		}
	}, [stopMediaTracks]);

	// TTS: speak the latest committed assistant message after the user sends a voice message.
	useEffect(() => {
		if (!ttsEnabled || phase !== 'thinking' || inFlightRef.current.tts || hasSpokenRef.current) {
			return;
		}
		const disposable = chatThreadsService.onDidChangeThreads(() => {
			const thread = chatThreadsService.getThread(threadId);
			if (!thread) return;
			const msgs = thread.messages;
			const lastMsg = msgs[msgs.length - 1];
			if (lastMsg?.role !== 'assistant' || lastMsg.isStreaming) {
				return;
			}
			if (inFlightRef.current.tts || hasSpokenRef.current) {
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
				text: lastMsg.content,
			})
				.then((result) => {
					if (!result.success || !result.audioBase64) {
						throw new Error(result.error || 'TTS failed');
					}
					const audio = new Audio(`data:audio/mp3;base64,${result.audioBase64}`);
					audioRef.current = audio;
					audio.onended = () => {
						hasSpokenRef.current = true;
						safeSetPhase('idle');
					};
					audio.onerror = () => {
						throw new Error('Failed to play spoken response');
					};
					return audio.play();
				})
				.catch((e) => {
					hasSpokenRef.current = true;
					stopAudioPlayback();
					safeSetPhase('error');
					safeSetError(e instanceof Error ? e.message : 'Could not speak the response');
				})
				.finally(() => {
					inFlightRef.current.tts = false;
				});
		});
		return () => disposable.dispose();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ttsEnabled, phase, threadId, ttsServerUrl, ttsModel, ttsVoice, ttsApiKey, accessor, chatThreadsService, stopAudioPlayback, safeSetPhase, safeSetError]);

	const isSTTDisabled = !sttEnabled;
	const phaseConfig: Record<VoicePhase, { icon: React.ReactNode; label: string; color: string }> = {
		idle: {
			icon: <Mic size={20} />,
			label: isSTTDisabled ? 'Speech-to-text is disabled in settings' : 'Tap to speak',
			color: 'text-void-fg-2',
		},
		listening: { icon: <Mic size={20} />, label: 'Listening...', color: 'text-red-500' },
		transcribing: { icon: <Loader2 size={20} className="animate-spin" />, label: 'Transcribing...', color: 'text-void-fg-2' },
		thinking: { icon: <Loader2 size={20} className="animate-spin" />, label: 'Thinking...', color: 'text-void-fg-2' },
		speaking: { icon: <Volume2 size={20} />, label: 'Speaking...', color: 'text-void-accent' },
		error: { icon: <AlertCircle size={20} />, label: error ?? 'Something went wrong', color: 'text-red-500' },
	};

	const config = phaseConfig[phase];
	const canStart = phase === 'idle' || phase === 'error';
	const isRecording = phase === 'listening';
	const buttonLabel = isRecording ? 'Stop listening' : canStart ? 'Start listening' : 'Voice busy';

	return (
		<div className="flex flex-col items-center justify-center h-full bg-void-bg-1 text-void-fg-1 p-6">
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{config.label}
				{error ? ` Error: ${error}` : ''}
			</div>
			<button
				className="flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 focus:ring-offset-void-bg-1"
				style={{
					backgroundColor: isRecording ? 'rgb(239 68 68 / 0.2)' : phase === 'speaking' ? 'rgb(59 130 246 / 0.2)' : 'rgb(255 255 255 / 0.05)',
					transform: isRecording ? `scale(${1 + audioLevel * 0.15})` : undefined,
				}}
				onClick={isRecording ? stopListening : startListening}
				disabled={!isRecording && !canStart}
				aria-label={buttonLabel}
				aria-pressed={isRecording}
				aria-live="off"
			>
				<span className={config.color}>{config.icon}</span>
			</button>
			<p className="mt-3 text-sm text-void-fg-3">{config.label}</p>
			{error && (
				<p className="mt-2 text-xs text-red-400 text-center max-w-xs" role="alert">
					{error}
				</p>
			)}
			<button
				className="mt-4 px-4 py-2 text-sm text-void-fg-3 bg-void-bg-2 rounded-lg cursor-pointer border border-void-border-2 hover:bg-void-bg-3 transition-colors focus:outline-none focus:ring-2 focus:ring-void-accent focus:ring-offset-2 focus:ring-offset-void-bg-1"
				onClick={exitVoiceMode}
				aria-label="Stop voice mode"
			>
				<PhoneOff size={14} className="inline mr-1" /> Stop voice mode
			</button>
		</div>
	);
};
