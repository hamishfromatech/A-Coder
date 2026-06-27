# Keyboard Shortcuts & Commands

A-Coder's own keybindings, layered on top of VS Code's. On macOS, `CtrlCmd` means `Cmd`; elsewhere `Ctrl`.

> All commands are also in the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) — search for "A-Coder".

---

## Core AI shortcuts

| Shortcut | Action | Notes |
|---|---|---|
| `Ctrl+K` | **Quick Edit** | Inline AI edit on the current selection. Editor-only (not in terminals). See [Quick Edit](quick-edit.md). |
| `Ctrl+L` | **Add Selection to Chat** | Sends the active editor selection (or current file) to the sidebar as a context chip. |
| `Ctrl+Shift+L` | **New Chat** | Start a fresh thread. |
| `Ctrl+Shift+A` | **Open Agent Manager** | Open the Agent Manager window. |

---

## Inline diff shortcuts

These act on AI-proposed edits. Accept/reject auto-advance to the next diff.

| Shortcut | Action |
|---|---|
| `Cmd+Alt+Shift+Enter` *(mac: `Ctrl+Alt+Enter`)* | Accept Diff |
| `Cmd+Alt+Shift+Backspace` *(mac: `Ctrl+Alt+Backspace`)* | Reject Diff |
| `Cmd+Alt+Shift+Down` | Go to Next Diff |
| `Cmd+Alt+Shift+Up` | Go to Previous Diff |
| `Cmd+Alt+Shift+Right` | Go to Next File with Diffs |
| `Cmd+Alt+Shift+Left` | Go to Previous File with Diffs |
| `Alt+Shift+Enter` | Accept All Diffs in Current File |
| `Alt+Shift+Backspace` | Reject All Diffs in Current File |
| `Cmd+Shift+Enter` | Accept All Diffs in All Files |
| `Cmd+Shift+Backspace` | Reject All Diffs in All Files |

See [Inline Diffs](inline-diffs.md).

---

## Chat input shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message (queues if the model is running) |
| `Enter` `Enter` (within 500 ms) | **Force-send** — abort current response and submit |
| `Escape` | Abort the running response |
| `Up` / `Down` (at input start/end) | Navigate input history |
| `/` | Open slash-command menu |

### Slash commands

| Command | What it does |
|---|---|
| `/search` | Codebase search |
| `/summarize` | Summarize the selection/thread |
| `/fix` | Fix lint/bugs in the selection |
| `/clear` | Clear the current thread |
| `/continue` | Continue the assistant's last response |
| `/explain` | Explain the selection |

---

## Autocomplete

| Shortcut | Action |
|---|---|
| `Tab` | Accept the inline FIM suggestion |

Requires [Autocomplete](autocomplete.md) enabled and a FIM-capable model.

---

## Rebinding

A-Coder inherits VS Code's keybinding system. To rebind, open **Keyboard Shortcuts** (`Cmd+K Cmd+S`), search for the action title (e.g. "A-Coder: Quick Edit"), and assign your own key. Your keybindings live in `keybindings.json`, which A-Coder can import from VS Code / Cursor / Windsurf via Settings → System → Migration.

---

## Command palette commands

Useful "A-Coder:" commands in the palette:

- **A-Coder: Quick Edit**
- **A-Coder: Add Selection to Chat**
- **A-Coder: Open Settings** / **A-Coder: Toggle Settings**
- **A-Coder: Generate Commit Message** (also on the SCM input box sparkle icon)
- **Open Agent Manager**
- Accept/reject/navigate diff commands (listed above)