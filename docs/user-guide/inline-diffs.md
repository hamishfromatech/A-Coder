# Inline Diffs & Applying Changes

When the model edits a file (in Code mode or via Quick Edit), A-Coder shows the change as an **inline diff** you can review, accept, or reject — never a silent overwrite.

---

## Diff zones

Each proposed edit appears inline in the editor with the additions/deletions highlighted. You get:

- **Accept** — apply the change to the file.
- **Reject** — discard the change.

This is your last line of defense before an edit lands. You can review each change individually as the agent works.

---

## Auto-accept LLM Changes

The **Auto-accept LLM Changes** toggle (`autoAcceptLLMChanges`, default `false`) — in Settings → Tools & Permissions — skips the Accept/Reject prompt and applies AI file changes automatically. The change still lands as a diff (visible in the editor / Source Control), but you're not asked to approve.

> Only enable this if you trust the model and want a hands-off agent loop. Combine with caution — it removes your per-edit veto. A safer middle ground is auto-approving the `edits` category (which still shows diffs) rather than `autoAcceptLLMChanges`.

---

## The Apply model

Applying a code change to a file is itself an AI step — A-Coder uses the **Apply** model to turn the model's intent into the exact new file contents.

| Setting | Default | Purpose |
|---|---|---|
| Apply **model** (Features tab) | — | Model used to apply changes. |
| `syncApplyToChat` | `true` | Use the current chat model for applying changes instead of the dedicated Apply model. |
| `enableFastApply` | `true` | Use the fast-apply strategy. |

### Morph Fast Apply

For higher-accuracy application, enable **Morph Fast Apply** (`enableMorphFastApply`) — A-Coder sends the instruction + file to Morph, which applies the change intelligently (better at preserving surrounding code). Requires a [Morph API key](morph.md#fast-apply).

---

## Edit tools that produce diffs

| Tool | Approval | Behavior |
|---|---|---|
| `rewrite_file` | `edits` | Replace entire file contents (uses Morph Fast Apply if enabled). Returns lint errors. |
| `edit_file` | `edits` | Find-and-replace the **first exact, unique** match of `old_string` → `new_string`. Fails if not found or not unique. |
| `edit_files` | `edits` | Atomic multi-file find-and-replace (1–3 edits), pre-validated before any apply. |
| `create_file_or_folder` / `delete_file_or_folder` | `edits` | Create / delete files and folders. |

The exact-match requirement on `edit_file` (like Claude Code) makes edits predictable — the model can't silently edit the wrong occurrence. When text isn't found, A-Coder shows similar blocks to help the model retry. See [Built-in Tools → File editing](tools.md#file-editing--approval-edits).

---

## Lint self-correction

With **Include Tool Lint Errors** on (`includeToolLintErrors`, default `true`), lint/diagnostic errors from an edit are fed back to the model so it can fix them in the next turn. Turn off if your linter is noisy and confuses the model. The model can also call `read_lint_errors` deliberately to check a file's diagnostics.