/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Volume2, PhoneOff, Loader2, AlertCircle } from 'lucide-react';
import { useAccessor, useSettingsState, useChatThreadsState } from '../util/services.js';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceModePanelProps {
	threadId: string;
	exitVoiceMode: () => void;
}

export const VoiceModePanel: React.FC<VoiceModePanelProps> = ({ threadId, exitVoiceMode }) => {
	const accessor = useAccessor();
	const settingsState = useSettingsState();
	const chatThreadsService = accessor.get('IChatThreadService');
	const [phase, setPhase] = useState<VoicePhase>('idle');
	const [error, setError] = useState<string | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const sttEnabled = settingsState.sttEnabled ?? false;
	const sttServerUrl = settingsState.sttServerUrl ?? 'http://localhost:11434/v1';
	const sttModel = settingsState.sttModel ?? 'whisper-1';
	const sttApiKey = settingsState.sttApiKey ?? '';
	const ttsEnabled = settingsState.ttsEnabled ?? false;
	const ttsServerUrl = settingsState.ttsServerUrl ?? 'http://localhost:11434/v1';
	const ttsModel = settingsState.ttsModel ?? 'tts-1';
	const ttsVoice = settingsState.ttsVoice ?? 'alloy';
	const ttsApiKey = settingsState.ttsApiKey ?? '';

	const startListening = useCallback(async () => {
		setError(null);
		setPhase('listening');
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
			const chunks: BlobPart[] = [];
			mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
			mediaRecorder.onstop = async () => {
				stream.getTracks().forEach(t => t.stop());
				const blob = new Blob(chunks, { type: 'audio/webm' });
				const reader = new FileReader();
				reader.onload = async () => {
					const base64Audio = (reader.result as string).split(',')[1];
					setPhase('transcribing');
					try {
						const result = await accessor.call('void-channel-voice', 'transcribe', {
							baseUrl: sttServerUrl, model: sttModel, apiKey: sttApiKey, audioBase64: base64Audio,
						}) as { success: boolean; text?: string; error?: string };
						if (result.success && result.text) {
							setPhase('thinking');
							chatThreadsService.sendUserMessage(threadId, result.text);
							if (!ttsEnabled) setPhase('idle');
						} else {
							setPhase('error');
							setError(result.error || 'Transcription failed');
						}
					} catch (e) {
						setPhase('error');
						setError(e instanceof Error ? e.message : 'Unknown STT error');
					}
				};
				reader.readAsDataURL(blob);
			};
			mediaRecorderRef.current = mediaRecorder;
			mediaRecorder.start();
		} catch (e) {
			setPhase('error');
			setError(e instanceof Error ? e.message : 'Microphone access denied');
		}
	}, [threadId, sttServerUrl, sttModel, sttApiKey, ttsEnabled, accessor, chatThreadsService]);

	const stopListening = useCallback(() => {
		if (mediaRecorderRef.current?.state === 'recording') {
			mediaRecorderRef.current.stop();
		}
	}, []);

	useEffect(() => {
		if (!ttsEnabled || phase !== 'thinking') return;
		const disposable = chatThreadsService.onDidChangeThreads(() => {
			const thread = chatThreadsService.getThread(threadId);
			if (!thread) return;
			const msgs = thread.messages;
			const lastMsg = msgs[msgs.length - 1];
			if (lastMsg?.role === 'assistant' && !lastMsg.isStreaming) {
				setPhase('speaking');
				accessor.call('void-channel-voice', 'synthesize', {
					baseUrl: ttsServerUrl, model: ttsModel, voice: ttsVoice, apiKey: ttsApiKey, text: lastMsg.content,
				}).then((result: any) => {
					if (result.success && result.audioBase64) {
						const audio = new Audio(`data:audio/mp3;base64,${result.audioBase64}`);
						audioRef.current = audio;
						audio.onended = () => { setPhase('idle'); };
						audio.play().catch(() => { setPhase('idle'); });
					} else {
						setPhase('idle');
					}
				}).catch(() => { setPhase('idle'); });
			}
		});
		return () => disposable.dispose();
	}, [ttsEnabled, phase, threadId, ttsServerUrl, ttsModel, ttsVoice, ttsApiKey, accessor, chatThreadsService]);

	const phaseConfig: Record<VoicePhase, { icon: React.ReactNode; label: string; color: string }> = {
		idle: { icon: <Mic size={20} />, label: 'Tap to speak', color: 'text-void-fg-2' },
		listening: { icon: <Mic size={20} />, label: 'Listening...', color: 'text-red-500' },
		transcribing: { icon: <Loader2 size={20} className="animate-spin" />, label: 'Transcribing...', color: 'text-void-fg-2' },
		thinking: { icon: <Loader2 size={20} className="animate-spin" />, label: 'Thinking...', color: 'text-void-fg-2' },
		speaking: { icon: <Volume2 size={20} />, label: 'Speaking...', color: 'text-void-accent' },
		error: { icon: <AlertCircle size={20} />, label: error ?? 'Error', color: 'text-red-500' },
	};

	const config = phaseConfig[phase];

	return (
		<div className="flex flex-col items-center justify-center h-full bg-void-bg-1 text-void-fg-1 p-6">
			<button
				className="flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200 cursor-pointer"
				style={{ backgroundColor: phase === 'listening' ? 'rgb(239 68 68 / 0.2)' : phase === 'speaking' ? 'rgb(59 130 246 / 0.2)' : 'rgb(255 255 255 / 0.05)' }}
				onClick={phase === 'listening' ? stopListening : startListening}
			>
				<span className={config.color}>{config.icon}</span>
			</button>
			<p className="mt-3 text-sm text-void-fg-3">{config.label}</p>
			<button
				className="mt-4 px-4 py-2 text-sm text-void-fg-3 bg-void-bg-2 rounded-lg cursor-pointer border border-void-border-2 hover:bg-void-bg-3 transition-colors"
				onClick={exitVoiceMode}
			>
				<PhoneOff size={14} className="inline mr-1" /> Exit voice mode
			</button>
		</div>
	);
};