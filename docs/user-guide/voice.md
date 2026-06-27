# Voice & Audio (STT / TTS)

A-Coder supports speech-to-text on the chat input (dictate your message) and text-to-speech on assistant responses (have answers read aloud), via any **OpenAI-compatible** STT/TTS endpoint. Defaults target a local Ollama instance so it works without a paid API.

> Configure in **Settings → Voice & Audio**.

---

## Speech-to-Text (STT)

| Setting | Default | Purpose |
|---|---|---|
| `sttEnabled` | `false` | Show the microphone button in the chat input. |
| `sttServerUrl` | `http://localhost:11434/v1` | OpenAI-compatible STT endpoint. |
| `sttModel` | `whisper-1` | STT model name. |
| `sttApiKey` | `''` | Optional API key. |

When enabled, a microphone icon appears in the chat composer. Recorded audio (base64) is sent to the STT endpoint and the transcribed text is inserted into your message.

## Text-to-Speech (TTS)

| Setting | Default | Purpose |
|---|---|---|
| `ttsEnabled` | `false` | Speak assistant messages aloud. |
| `ttsServerUrl` | `http://localhost:11434/v1` | OpenAI-compatible TTS endpoint. |
| `ttsModel` | `tts-1` | TTS model name. |
| `ttsVoice` | `alloy` | Voice identifier. |
| `ttsApiKey` | `''` | Optional API key. |
| `ttsResponseFormat` | `mp3` | Audio format: `mp3` / `opus` / `aac` / `flac` / `wav` / `pcm`. |

When enabled, assistant messages are synthesized to audio and played back.

---

## How it works

Audio is sent to the main process over the `void-channel-voice` IPC channel and forwarded to your configured endpoint. `transcribe()` returns `{ success, text, error }`; `synthesize()` returns `{ success, audioBase64, error }`. The defaults assume a local Ollama server exposing Whisper-compatible STT and a TTS model — install matching models (`ollama pull whisper`, etc.) or point the URLs at OpenAI/another provider.