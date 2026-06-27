# Settings Reference

Every A-Coder setting, what it does, and its default. Settings are grouped to match the **Settings** tabs (`Cmd+,` / `Ctrl+,`): Manage Models, Local Models, Cloud Providers, Features, Images & Media, System, MCP Tools, ACP Agents, App Integrations, AI Skills, API & Mobile, Voice & Audio.

> Defaults shown are for a fresh install. Booleans default to the safer/more-private option unless noted.

---

## Manage Models

| Setting | Type | Default | Description |
|---|---|---|---|
| `autoRefreshModels` | boolean | `true` | Auto-detect models from local servers and hosted aggregators each time Settings opens. Turn off if your local server is slow. |

This tab also lists every provider's models with enable/disable toggles, and lets you add custom model names.

## Local Models / Cloud Providers (per-provider)

Each provider has its own fields. See [Providers & Models](providers-and-models.md) for the full provider table.

| Field | Applies to | Description |
|---|---|---|
| `apiKey` | most cloud + Ollama Cloud + A-Coder + OpenAdapter | Provider API key. Masked. |
| `endpoint` / `baseURL` | Ollama, Ollama Cloud, vLLM, LM Studio, llama.cpp, LiteLLM, OpenAI-Compatible, AWS Bedrock | Server URL. For OpenAI-Compatible, don't include `/chat/completions`. |
| `headersJSON` | OpenAI-Compatible | Custom HTTP headers as a JSON object, e.g. `{ "X-Request-Id": "..." }`. |
| `region` | Google Vertex, AWS Bedrock | Cloud region. |
| `project` / `resource` | Google Vertex (`project`), Azure (`resource`) | Cloud project/resource name. |
| `azureApiVersion` | Microsoft Azure | Azure API version (default `2024-05-01-preview`). |

Per model you can also set **capability overrides** (context window, reserved output, system-message mode, tool format, FIM, temperature, reasoning) and **reasoning options** (enabled, budget, effort). See [Providers & Models → Model capability overrides](providers-and-models.md#model-capability-overrides).

## Features

Per-feature model selection (Chat, Quick Edit, Autocomplete, Apply, Commit Messages, Vision, Smart Tool Picker) plus these toggles:

| Setting | Type | Default | Description |
|---|---|---|---|
| `enableAutocomplete` | boolean | `false` | Master switch for inline FIM autocomplete. |
| `showInlineSuggestions` | boolean | `true` | Display ghost-text suggestions in the editor (UI option). |
| `chatMode` | `chat`/`plan`/`code`/`learn` | `code` | Active chat mode. See [Chat Modes](chat-modes.md). |
| `studentLevel` | `beginner`/`intermediate`/`advanced` | `beginner` | Learn-mode difficulty. See [Learn Mode](learn-mode.md). |
| `maxAgentIterations` | number | `50` | Maximum agent loop iterations in Code mode before stopping. |
| `syncApplyToChat` | boolean | `true` | Use the current chat model for applying changes (instead of the dedicated Apply model). |
| `syncSCMToChat` | boolean | `true` | Use the current chat model for commit messages (instead of the dedicated SCM model). |
| `enableFastApply` | boolean | `true` | Use the fast-apply strategy for code application. |
| `enableVisionSupport` | boolean | `false` | Allow image inputs in chat (drag-drop / paste). See [Vision](vision.md). |
| `enableToolOrchestration` | boolean | `false` | Smart Tool Picker — a separate model analyzes requests and suggests tools. |
| `enableToolResultTOON` | boolean | `false` | Compress tool outputs with TOON (30–70% token reduction). See [Context Management](context-management.md). |
| `includeToolLintErrors` | boolean | `true` | Feed lint errors back to the model after edits for self-correction. |

### Morph settings (within Features)

| Setting | Type | Default | Description |
|---|---|---|---|
| `enableMorphFastApply` | boolean | `false` | Use the Morph API for intelligent code application. |
| `enableMorphFastContext` | boolean | `false` | Use Morph for fast semantic context gathering. |
| `enableMorphRepoStorage` | boolean | `false` | Enable Morph Repo Storage (git + semantic search). |
| `morphApiKey` | string | `''` | Morph API key. |
| `morphModel` | `morph-v3-fast`/`morph-v3-large`/`auto` | `auto` | Which Morph model to use. |
| `morphRepoId` | string? | — | Repo identifier for Repo Storage. |
| `morphRepoBranch` | string? | `main` | Branch for Repo Storage operations. |
| `morphRepoIndexOnPush` | boolean? | `true` | Generate embeddings after push. |
| `morphRepoWaitForEmbeddings` | boolean? | `false` | Block push until embeddings finish. |

See [Morph](morph.md).

### Tools & Permissions (within Features)

| Setting | Type | Default | Description |
|---|---|---|---|
| `autoApprove` | `{ [approvalType]?: boolean }` | `{}` | Per-category auto-approve (edits, terminal, code execution, skills, image generation, repo, forms, quizzes, MCP tools). See [Tool Approval](tool-approval-and-terminal.md). |
| `autoAcceptLLMChanges` | boolean | `false` | Apply AI file changes automatically without the Accept/Reject prompt. |
| `includeToolLintErrors` | boolean | `true` | (listed above; lives here too) |

### Terminal Auto-Approval (within Features)

| Setting | Type | Default | Description |
|---|---|---|---|
| `autoApprove['terminal']` | boolean | `false` | Master toggle: run every command without asking (deny list still wins). |
| `terminalReadOnlyAutoApprove` | boolean | `false` | Auto-run a built-in read-only command set (`ls`, `cat`, `pwd`, `git status`, …). |
| `terminalAllowPatterns` | string[] | `[]` | Command prefixes/globs that auto-run even when the master toggle is off. |
| `terminalDenyPatterns` | string[] | `[]` | Commands that always prompt, overriding the master toggle and allow list. |

See [Tool Approval & Terminal](tool-approval-and-terminal.md) for the full resolution order.

### Notification Sound (within Features)

| Setting | Type | Default | Description |
|---|---|---|---|
| `notificationSound` | string | `none` | Sound to play when an LLM response completes. `none` = silent. |

### Proactive Coach (within Features)

| Setting | Type | Default | Description |
|---|---|---|---|
| `enableProactiveCoach` | boolean | `false` | Show proactive learning-coach suggestions while you type. |
| `proactiveCoachIntervalSeconds` | number | `120` | Minimum seconds between coach checks. |

## Images & Media

| Setting | Type | Default | Description |
|---|---|---|---|
| `enableMediaGeneration` | boolean | `false` | Enable the image/video generation tools. |
| `imageGenerationApiKey` | string | `''` | API key for the image-generation service. |
| `imageGenerationBaseUrl` | string | `http://localhost:11434/v1` | OpenAI-compatible image-generation endpoint. |
| `imageGenerationModel` | string | `x/flux2-klein:4b` | Default image-generation model. |

See [Media Generation](media-generation.md). (`generate_image` requires approval; `generate_video` is auto-approved.)

## System

| Setting | Type | Default | Description |
|---|---|---|---|
| `aiInstructions` | string | `''` | Global custom system prompt appended to every request — your coding standards, conventions, persona. |
| `disableSystemMessage` | boolean | `false` | Suppress the system message entirely (for models that misbehave with one). |
| `isOnboardingComplete` | boolean | `false` | Whether first-run onboarding has finished. |

**Migration** (System tab): one-click import of settings, keybindings, and extensions from VS Code, Cursor, or Windsurf.

**Data Management** (System tab): export/import chat history as JSON; reset application settings; clear chat history.

**Privacy & Support** (System tab): anonymous usage reporting toggle; replay the onboarding experience.

## MCP Tools

Add and manage **MCP servers**. Each server has an on/off toggle (`MCPUserState.isOn`). See [MCP](mcp.md).

## ACP Agents

Manage **ACP (Agent Client Protocol) agent servers**. See the ACP section.

## App Integrations (Composio)

| Setting | Type | Default | Description |
|---|---|---|---|
| `composioApiKey` | string | `''` | Your Composio API key. |
| `composioConnections` | `{ [toolkitSlug]: accountId }` | `{}` | Connected apps (toolkit → account ID). |
| `composioEnabledToolkits` | string[] | `[]` | Toolkits exposed to the model. |
| `composioTriggersEnabled` | boolean | `false` | Enable trigger webhooks. |
| `composioTriggerPort` | number? | — | Webhook listener port (defaults to `apiPort`). |
| `composioTriggerTunnelUrl` | string? | — | Optional Cloudflare Tunnel URL for triggers. |
| `composioTriggerSecret` | string? | — | Webhook signature-verification secret (auto-generated on first webhook). |

See [Composio](composio.md).

## AI Skills

Manage installed skills (installed vs marketplace tabs). Skills live in `~/.a-coder/skills/`. See [Skills](skills.md).

## API & Mobile

| Setting | Type | Default | Description |
|---|---|---|---|
| `apiEnabled` | boolean | `false` | Enable the Mobile API server (REST + WebSocket). Off by default for security. |
| `apiPort` | number | `3737` | Port for the API server. |
| `apiTokens` | string[] | `[]` | Valid API tokens for authentication. Generate/manage in Settings. |
| `apiTunnelUrl` | string? | — | Optional Cloudflare Tunnel URL for secure remote access. |

See [Mobile API](mobile-api.md).

## Voice & Audio

### Speech-to-Text (STT)

| Setting | Type | Default | Description |
|---|---|---|---|
| `sttEnabled` | boolean | `false` | Enable speech-to-text in the chat input (microphone). |
| `sttServerUrl` | string | `http://localhost:11434/v1` | OpenAI-compatible STT endpoint. |
| `sttModel` | string | `whisper-1` | STT model name. |
| `sttApiKey` | string | `''` | Optional API key for the STT endpoint. |

### Text-to-Speech (TTS)

| Setting | Type | Default | Description |
|---|---|---|---|
| `ttsEnabled` | boolean | `false` | Speak assistant messages aloud. |
| `ttsServerUrl` | string | `http://localhost:11434/v1` | OpenAI-compatible TTS endpoint. |
| `ttsModel` | string | `tts-1` | TTS model name. |
| `ttsVoice` | string | `alloy` | Voice identifier. |
| `ttsApiKey` | string | `''` | Optional API key for the TTS endpoint. |
| `ttsResponseFormat` | `mp3`/`opus`/`aac`/`flac`/`wav`/`pcm` | `mp3` | Audio output format. |

See [Voice & Audio](voice.md).

## About

Version, release notes, update status, and links. See [Release Notes](../release-notes.md).

---

## Learning settings (Learn mode)

These live under the Learn-mode UI, not the main Settings tabs.

| Setting | Type | Default | Description |
|---|---|---|---|
| `preferredFontSize` | `small`/`medium`/`large` | `medium` | Lesson font size. |
| `preferredCodeTheme` | `light`/`dark`/`auto` | `auto` | Code-block theme in lessons. |
| `enableCelebrations` | boolean | `true` | Celebration animations on achievements. |
| `enableSoundEffects` | boolean | `false` | Sound effects on achievements. |
| `enableAnimations` | boolean | `true` | Animations in learning UI. |
| `enableReducedMotion` | boolean | `false` | Reduce motion (accessibility). |
| `enableHighContrast` | boolean | `false` | High-contrast learning UI (accessibility). |

---

## Per-conversation state (not in Settings)

These are managed per chat thread, not in global settings:

- **Model selection per feature** (`modelSelectionOfFeature`) — see Features tab.
- **Per-model reasoning options** (`reasoningEnabled`, `reasoningBudget`, `reasoningEffort`, `morphFastContext`) — set in the model/reasoning UI.
- **Per-model capability overrides** (`OverridesOfModel`) — see Providers & Models.
- **MCP server on/off state** (`MCPUserStateOfName`).

---

## Where settings are stored

A-Coder persists settings through VS Code's storage layer (see `storageKeys.ts` and `voidSettingsService.ts`). Use **Settings → System → Data Management** to export/import the full set as JSON for portability across machines.