# Quick Edit (Ctrl+K)

Quick Edit is inline AI editing: select some code, press **`Ctrl+K`** (`Cmd+K` on macOS), describe the change in plain language, and the model rewrites your selection in place.

---

## How it works

1. Select the code you want to change (a line, a block, a function).
2. Press **`Ctrl+K`** — a small prompt bar appears.
3. Type your instruction ("extract this into a helper", "add error handling", "convert to async/await", "make this a React hook").
4. The model rewrites the selection and shows the result; accept or reject.

Quick Edit uses the **Quick Edit** model (the `Ctrl+K` feature). Set it in **Settings → Features**.

---

## Related settings

| Setting | Default | Purpose |
|---|---|---|
| Quick Edit **model** (Features tab) | — | Model used for Quick Edit. |
| `syncApplyToChat` | `true` | Use the current chat model for applying changes (shared with the Apply feature). |

---

## Quick Edit vs. Chat Code mode

- **Quick Edit (`Ctrl+K`)** is for *surgical, local* edits — you've already selected the code and know what you want. Fast, no chat overhead.
- **Code mode** (sidebar) is for *broader, multi-file, agentic* work — the model decides what to touch across the codebase.

Use Quick Edit for the 80% of edits that are "rewrite this selection"; switch to Code mode when the task spans files or needs exploration.