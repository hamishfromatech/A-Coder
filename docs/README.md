# A-Coder Documentation

A-Coder is an AI-native code editor built on VS Code. These docs cover everything you need to use it — from your first chat to configuring local models, MCP servers, and the Mobile API.

> New here? Start with **[Getting Started](user-guide/getting-started.md)** — you'll be running your first AI-assisted edit in a few minutes.

---

## User Guide

The user guide is organized by topic. Every essential feature and setting is covered.

### Getting started

- [Getting Started](user-guide/getting-started.md) — install, connect a model, run your first chat and edit
- [Interface Tour](user-guide/interface-tour.md) — the sidebar, editor overlays, settings panes, and views
- [Keyboard Shortcuts & Commands](user-guide/keyboard-shortcuts.md) — every A-Coder keybinding and slash command

### Chat & modes

- [Chat Modes](user-guide/chat-modes.md) — Chat / Plan / Code / Learn and when to use each
- [Learn Mode](user-guide/learn-mode.md) — the AI tutor: levels, exercises, hints, quizzes, badges, streaks
- [Proactive Coach](user-guide/proactive-coach.md) — ambient coaching suggestions while you work

### Models & providers

- [Providers & Models](user-guide/providers-and-models.md) — every provider (cloud + local), per-feature model selection, capability & reasoning overrides
- [Settings Reference](user-guide/settings-reference.md) — every setting, grouped by Settings tab, with defaults

### Editing & code

- [Autocomplete](user-guide/autocomplete.md) — inline FIM completions
- [Quick Edit (Ctrl+K)](user-guide/quick-edit.md) — inline AI editing
- [Inline Diffs](user-guide/inline-diffs.md) — applying/rejecting AI edits, auto-accept, Fast Apply
- [Built-in Tools](user-guide/tools.md) — the complete agent tool catalog
- [Tool Approval & Terminal](user-guide/tool-approval-and-terminal.md) — approval categories, auto-approve, terminal allow/deny patterns
- [Context Management](user-guide/context-management.md) — context gathering, TOON compression, agent iteration cap
- [Git & SCM](user-guide/git-and-scm.md) — AI commit messages and repo tools

### Multimodal & media

- [Vision](user-guide/vision.md) — image understanding from chat
- [Media Generation](user-guide/media-generation.md) — image & video generation tools
- [Voice & Audio](user-guide/voice.md) — speech-to-text and text-to-speech

### Integrations

- [MCP](user-guide/mcp.md) — Model Context Protocol servers
- [ACP Agents](user-guide/acp.md) — Agent Communication Protocol agent servers
- [Skills](user-guide/skills.md) — markdown skill packages in `~/.a-coder/skills/`
- [Morph](user-guide/morph.md) — Fast Context, Fast Apply, Repo Storage
- [Composio](user-guide/composio.md) — 1000+ app integrations and trigger webhooks
- [Subagents & Agent Manager](user-guide/agent-manager.md) — focused delegations and multi-workspace orchestration
- [Mobile API](user-guide/mobile-api.md) — REST + WebSocket remote control

---

## Quick reference

### Add a model

1. **Settings → Manage Models** → pick a provider.
2. Cloud: paste your **API key**. Local: confirm the **endpoint** (auto-filled) — models auto-detect.
3. Enable the model(s) you want. Assign models to features in **Settings → Features**.

See [Providers & Models](user-guide/providers-and-models.md).

### Pick a chat mode

| Mode | Use when |
|---|---|
| 💬 Chat | Quick questions, no file access |
| 🔍 Plan | Research & scope before editing |
| 🤖 Code | Actually change code, run commands |
| 🎓 Learn | Get tutored, practice, quiz yourself |

See [Chat Modes](user-guide/chat-modes.md).

### Essential shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Quick Edit |
| `Ctrl+L` | Add selection to chat |
| `Ctrl+Shift+L` | New chat |
| `Ctrl+Shift+A` | Open Agent Manager |
| `Tab` | Accept autocomplete |

Full list: [Keyboard Shortcuts](user-guide/keyboard-shortcuts.md).

---

## Contributing & building from source

- [Development Guide](DEVELOPMENT_GUIDE.md) — build, run, and package A-Coder
- [Contributing Guidelines](HOW_TO_CONTRIBUTE.md) — setup for Mac, Windows, Linux
- [Codebase Guide](VOID_CODEBASE_GUIDE.md) — architecture overview
- [Windows Build Guide](WINDOWS_BUILD_GUIDE.md) — platform-specific build notes

---

## Release notes & project docs

- [Release Notes](release-notes.md) — version history and changelog
- [Design Document](../DESIGN.md) — product/design rationale
- [Pitch Deck](PITCH_DECK.md) — product overview

---

## Developer & internal notes

The files below are **implementation notes, audit reports, and design records** — useful when hacking on A-Coder itself, not required for everyday use. All A-Coder code lives in `src/vs/workbench/contrib/void/`.

### Architecture & internals
- [Tool Architecture](TOOL_ARCHITECTURE.md) — the built-in tools system
- [Message Queue System](MESSAGE_QUEUE_SYSTEM.md) — LLM streaming message queue
- [TOON Implementation](TOON_IMPLEMENTATION.md) — token-optimized output notation
- [Context Window Implementation](CONTEXT_WINDOW_IMPLEMENTATION.md)
- [Context Compression Complete](CONTEXT_COMPRESSION_COMPLETE.md)
- [XML Tool Calling Implementation](XML_TOOL_CALLING_IMPLEMENTATION.md)
- [XML Tool Call Loading UI Best Practices](XML_TOOL_CALL_LOADING_UI_BEST_PRACTICES.md)
- [XML](xml.md)
- [Latest Models Tool Calling Analysis](LATEST_MODELS_TOOL_CALLING_ANALYSIS.md)
- [About To Act Pattern](ABOUT_TO_ACT_PATTERN.md)
- [Prompt Refactor Plan](PROMPT_REFACTOR_PLAN.md)
- [Folder Contents API](FOLDER_CONTENTS_API.md)
- [Mobile API Implementation](MOBILE_API_IMPLEMENTATION.md)

### Integrations & providers
- [Morph Integration Complete](MORPH_INTEGRATION_COMPLETE.md)
- [Morph Fast Apply Integration](MORPH_FAST_APPLY_INTEGRATION.md)
- [Morph CORS Fix](MORPH_CORS_FIX.md)
- [Ollama Cloud Tool Calling Improvements](OLLAMA_CLOUD_TOOL_CALLING_IMPROVEMENTS.md)
- [Ollama Cloud Tool Calling Bug](OLLAMA_CLOUD_TOOL_CALLING_BUG.md)
- [LM Studio Comparison and Improvements](LM_STUDIO_COMPARISON_AND_IMPROVEMENTS.md)
- [Pollinations](POLLINATIONS.md)
- [Agent Manager Multi-Workspace](agent-manager-multi-workspace.md)
- [Vision Support Implementation](VISION_SUPPORT_IMPLEMENTATION.md)
- [Code Execution Implementation](CODE_EXECUTION_IMPLEMENTATION.md) · [Complete](CODE_EXECUTION_COMPLETE.md)

### UX & features
- [Sidebar Audit](sidebar-audit.md)
- [IDE Command Bar Audit](ide-command-bar-audit.md)
- [Learn Mode Audit](learn-mode-audit.md)
- [Student Mode Plan](student-mode-plan.md) · [Student Enhancements](student-enhancements.md)
- [Walkthrough Feature](walkthrough-feature.md)
- [Double-Tap Enter Force Send](DOUBLE_TAP_ENTER_FORCE_SEND.md)
- [Auto-Continue Character Limit](AUTO_CONTINUE_CHARACTER_LIMIT.md) · [Toggle Fix](AUTO_CONTINUE_TOGGLE_FIX.md) · [Silent Auto-Continue Summary](SILENT_AUTO_CONTINUE_SUMMARY.md)
- [Edit File UI Fix](EDIT_FILE_UI_FIX.md)
- [Tool UI Fix Final](TOOL_UI_FIX_FINAL.md) · [Tool UI Visibility Fix](TOOL_UI_VISIBILITY_FIX.md)
- [Tool Calling Fix](TOOL_CALLING_FIX.md)
- [ToolsService Fix Walkthrough](TOOLSSERVICE_FIX_WALKTHROUGH.md)
- [Context Fix Tool Calls](CONTEXT_FIX_TOOL_CALLS.md)

### Performance, tuning & audits
- [Optimisation](optimisation.md)
- [Large Codebase Memory Analysis](LARGE_CODEBASE_MEMORY_ANALYSIS.md)
- [Audit Report](audit_report.md)
- [Fine-Tuning](fine-tuning.md)
- [Rebrand](rebrand.md)

---

## Documentation standards

- All documentation uses GitHub-Flavored Markdown with syntax-highlighted code blocks.
- User-facing docs live in [`user-guide/`](user-guide/); implementation notes live at the top level of `docs/`.
- Use relative links for internal references (e.g. `[Guide](./FILE.md)`).
- When adding a user-facing page, add it to the **User Guide** section above. When adding an implementation note, add it to **Developer & internal notes**.

## Support

- GitHub Issues: [github.com/hamishfromatech/A-Coder/issues](https://github.com/hamishfromatech/A-Coder/issues)
- See [Contributing Guidelines](HOW_TO_CONTRIBUTE.md) for more.