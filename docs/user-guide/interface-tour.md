# Interface Tour

A-Coder is VS Code with an AI layer. Everything you know from VS Code works the same; A-Coder adds an AI sidebar, a Settings pane, an Agent Manager, and a handful of editor overlays.

---

## The AI sidebar (Chat)

A-Coder's chat lives in the **secondary side bar** (the right-hand panel), under the **Chat** view (`workbench.view.void`). It auto-opens on startup.

The sidebar contains:

- **Chat thread list** — switch between multiple simultaneous conversations (New Chat: `Cmd+Shift+L`).
- **Mode dropdown** — switch between Chat / Plan / Code / Learn. See [Chat Modes](chat-modes.md).
- **Chat area** — messages, reasoning cards, tool-call results, generated media, inline exercises & quizzes (Learn mode).
- **Message queue** — when the model is running, new messages queue with a "N queued" indicator; each queued message can be force-sent or removed.
- **Input box** — type your message. Features:
  - **`@`-mentions** — attach files, code selections, or folders as context chips.
  - **`Ctrl+L`** — add the active editor selection (or current file) as a context chip.
  - **Prospective selections** — up to 3 recently-opened files suggested for quick attach.
  - **Slash commands** — start input with `/` for `/search`, `/summarize`, `/fix`, `/clear`, `/continue`, `/explain`.
  - **Image attach** — drag-drop or paste images (png/jpeg/gif/webp) when [Vision](vision.md) is on.
  - **Microphone** — dictate input (STT) when [Voice](voice.md) is on.
  - **Enter** to send; **double-tap Enter** within 500 ms to force-send mid-response; **Escape** to abort; **ArrowUp/Down** to navigate input history.
  - **Auto-continue toggle** — when on, short responses auto-continue.

### Toolbar buttons (sidebar header)

| Button | Action |
|---|---|
| New Chat | Start a fresh thread |
| History | View past chats |
| MCP Servers | Open the MCP config |
| Agent Manager | Open the Agent Manager window |
| Settings | Open A-Coder Settings |

---

## Editor overlays

- **Quick Edit (`Ctrl+K`)** — inline edit bar on the current selection. See [Quick Edit](quick-edit.md).
- **Inline diffs** — AI edits appear as accept/reject diff zones with a command bar showing the keybinding hints. See [Inline Diffs](inline-diffs.md).
- **Autocomplete** — ghost-text FIM completions (Tab to accept). See [Autocomplete](autocomplete.md).
- **Proactive Coach** — a dismissible coaching bubble when enabled. See [Proactive Coach](proactive-coach.md).
- **Selection helper widget** — assists with selection-based actions.

---

## Settings pane

Opened from the sidebar gear or `Cmd+,`. It's an editor tab with a left nav:

| Nav item | What's here |
|---|---|
| **Manage Models** | All providers' models, enable/disable, auto-refresh toggle |
| **Local Models** | Ollama / LM Studio / vLLM / llama.cpp / LiteLLM / Ollama Cloud / OpenAI-Compatible |
| **Cloud Providers** | Anthropic / OpenAI / Gemini / Groq / DeepSeek / OpenRouter / xAI / Mistral / Vertex / Azure / Bedrock / A-Coder / OpenAdapter |
| **Features** | Per-feature model selection + autocomplete, vision, tool orchestration, Morph, tools & permissions, terminal auto-approval, UI options, notification sound, proactive coach |
| **Images & Media** | Media generation toggle + image endpoint config |
| **System** | Global instructions, migration, data management, privacy & support |
| **MCP Tools** | MCP servers |
| **ACP Agents** | ACP agent servers |
| **App Integrations** | Composio marketplace + triggers |
| **AI Skills** | Installed / marketplace skills |
| **API & Mobile** | Mobile API server, tokens, tunnel |
| **Voice & Audio** | STT / TTS |
| **About A-Coder** | Version, release notes, updates |

See [Settings Reference](settings-reference.md) for every setting.

---

## Agent Manager

A separate window (`Cmd+Shift+A`) aggregating chats, workspaces, and dashboards — including across multiple workspaces when multi-workspace is enabled. See [Subagents & Agent Manager](agent-manager.md).

---

## Other views

- **Preview pane** — renders lessons, walkthroughs, and implementation-plan markdown in a dedicated tab.
- **Onboarding** — first-run setup flow; replayable from Settings → System → Privacy & Support.
- **What's New** — surfaces release-note highlights after updates.

---

## Per-project instructions (`.a-coder-rules`)

Drop a `.a-coder-rules` file in your workspace root. A-Coder auto-loads it as model instructions whenever the workspace is opened — a project-local companion to the global **Global Instructions** (`aiInstructions`) setting. Use it for repo-specific conventions ("use tabs", "tests in `__tests__/`", "prefer our internal `fetch` wrapper").