# Getting Started with A-Coder

A-Coder is an AI-native code editor built on VS Code. It adds four AI modes (Chat, Plan, Code, Learn), inline autocomplete, quick edits, agent tool use, and a rich set of integrations — all running directly against the model provider of your choice.

This guide gets you from a fresh install to your first AI-assisted edit in a few minutes.

---

## 1. Install A-Coder

Download the latest release for your platform from the [releases page](https://github.com/hamishfromatech/A-Coder/releases).

**macOS:** After dragging the app to `/Applications`, remove the quarantine attribute before first launch (Gatekeeper otherwise blocks unsigned builds):

```bash
sudo xattr -d com.apple.quarantine "/Applications/A-Coder.app"
```

**Windows / Linux:** Use the platform installer from the releases page.

A-Coder is a drop-in replacement for VS Code — your settings, keybindings, and extensions from VS Code, Cursor, or Windsurf can be imported on first launch (see **Settings → System → Migration**).

---

## 2. Connect a model provider

A-Coder talks directly to model providers — there is no middleman. You can use a cloud API key or a local model server.

1. Open **Settings** (`Cmd+,` / `Ctrl+,`) and go to **Manage Models**.
2. Pick a provider and add the required fields:
   - **Cloud providers** (Anthropic, OpenAI, Gemini, Groq, DeepSeek, OpenRouter, xAI, Mistral, …) — paste your **API key**. A link to each provider's key page is shown beneath the field.
   - **Local providers** (Ollama, LM Studio, vLLM, llama.cpp, LiteLLM) — enter the server **endpoint** (defaults are pre-filled) and A-Coder auto-detects the models you have running.
3. Enable the model(s) you want to use. Cloud providers ship a curated default model list; local providers fetch models live. If a provider lists many models, they start hidden and you enable them individually.

> **Tip:** A-Coder (the built-in hosted provider) and OpenAdapter fetch their model lists automatically once you add an API key — no manual model entry needed.

See [Providers & Models](providers-and-models.md) for the full provider list, per-feature model selection, and reasoning controls.

---

## 3. Choose a model for each feature

A-Coder lets you assign a different model to each capability. In **Settings → Features**, set the model for:

| Feature | What it powers |
|---|---|
| **Chat** | Sidebar conversation (all four modes) |
| **Quick Edit** | Inline `Ctrl+K` edits |
| **Autocomplete** | Inline FIM completions as you type |
| **Apply** | Applying AI-suggested code changes to files |
| **Commit Messages** | One-click AI commit messages in Source Control |
| **Vision** | Image understanding when you drop images into chat |
| **Smart Tool Picker** | Tool orchestration — a separate model that picks tools for a request |

You can leave a feature unset; A-Coder will fall back to any enabled model. You only need to pick a model explicitly when you want a feature to use a *different* model than chat (e.g. a small fast model for autocomplete).

---

## 4. Run your first chat

1. Open the A-Coder sidebar (`Cmd+L` / `Ctrl+L`).
2. Choose a **mode** from the dropdown at the bottom of the chat:

   | Mode | Best for |
   |---|---|
   | **💬 Chat** | Conversation only, no tools — questions, ideas, advice |
   | **🔍 Plan** | Research, plan & document — reads files but doesn't edit |
   | **🤖 Code** | Edit files & run commands — full agent autonomy |
   | **🎓 Learn** | Interactive tutoring with exercises, hints, and quizzes |

3. Type your message and send. In **Code** mode the model will propose edits and commands; you approve each one unless you've enabled auto-approval (see [Tool Approval & Terminal](tool-approval-and-terminal.md)).

> Send a message with **double-tap Enter** (two quick `Enter` presses) to force-send even while the model is still streaming — useful for course-correcting mid-response.

---

## 5. Try inline editing

- **`Ctrl+K`** — Open Quick Edit on the current selection. Describe the change and the model rewrites the selection inline.
- **Autocomplete** — Enable **Settings → Features → Autocomplete** to get inline FIM completions as you type. Accept with `Tab`.
- **Diff zones** — When the model edits a file in Code mode, the change appears as an inline diff you can **Apply** or **Reject**. Enable **Auto-accept LLM Changes** in Settings → Tools & Permissions to skip the prompt.

---

## 6. Where to go next

- [Interface Tour](interface-tour.md) — the sidebar, settings panes, and views
- [Chat Modes](chat-modes.md) — when to use each mode
- [Built-in Tools](tools.md) — everything the agent can do
- [Settings Reference](settings-reference.md) — every setting explained
- [Integrations](../README.md#integrations) — MCP, Morph, Composio, Mobile API, Skills, and more

---

## Building from source

If you'd rather build from source, see the [Development Guide](../DEVELOPMENT_GUIDE.md). Quick version:

```bash
npm install          # Node.js v22 required (see .nvmrc)
npm run buildreact   # one-time React build
npm run watch        # watch TypeScript
./scripts/code.sh   # launch the dev app; Cmd+R to reload
```