# Tool Approval & Terminal Control

A-Coder only runs sensitive tools after you approve them. This page explains the approval categories, the per-category auto-approve toggles, and the terminal command policy that layers on top.

> **Where to find these:** Settings → Tools & Permissions, and Settings → Tools & Permissions → Terminal Auto-Approval.

---

## Approval categories

When the model wants to call a sensitive tool, A-Coder shows a prompt. The categories are:

| Category | What it covers |
|---|---|
| **edits** | Creating, deleting, rewriting, or editing files and folders |
| **terminal** | Running shell commands; opening/killing persistent terminals |
| **code execution** | Running code in the sandbox; skill scripts and benchmarks |
| **skills** | Installing or uninstalling skills |
| **image generation** | Generating images (paid external call) |
| **repo** | Mutating Morph Repo Storage operations (commit, push, checkout, …) |
| **forms** | Showing interactive forms |
| **quizzes** | Showing interactive quizzes |
| **MCP tools** | Calls to connected MCP / Composio / ACP tools |

**Everything else is auto-approved** — read, search, inspect, plan, and teach tools can't change your project, so they run without prompts. See [Built-in Tools](tools.md#approval-at-a-glance) for which tools fall where.

---

## Auto-approve per category

For each category above there's an **Auto-approve {category}** toggle in Settings → Tools & Permissions. Turning one on means that category runs without prompting you.

- Auto-approve **edits** → the model edits files freely (still shown as diffs you can reject).
- Auto-approve **terminal** → commands run without the terminal prompt (still subject to the terminal policy below).
- Auto-approve **MCP tools** → connected external tools run without prompts.

> **Auto-accept LLM Changes** is a related but separate toggle: when on, AI-suggested file changes are applied automatically without showing the Accept/Reject diff prompt. Combine with caution — it removes your last chance to veto an edit.

---

## Terminal auto-approval policy

Terminal commands have a layered policy that sits on top of the `terminal` auto-approve toggle. Configure it under **Settings → Terminal Auto-Approval**.

### Master toggle: Auto-approve all terminal commands
When **on**, every command runs without asking — **except** commands matching the deny list (below). This is the broadest setting; use it only in trusted/sandboxed environments.

### Auto-run read-only commands
When **on**, a built-in read-only command set auto-runs even when the master toggle is off:

- `ls`, `cat`, `pwd`, `find`, `grep`, `head`, `tail`, `wc`
- `git status`, `git diff`, `git log`, `git show`, `git branch`, `git remote`
- …and similar safe inspection commands.

Off by default. Great middle ground: leave the master toggle off, enable this, and only mutating commands prompt.

### Allow list (`terminalAllowPatterns`)
Command prefixes/globs that auto-run **even when the master toggle is off**. Examples:

```
ls
git status
npm run *
pnpm test
```

Use this to whitelist routine safe commands specific to your project.

### Deny list (`terminalDenyPatterns`)
Commands that **always prompt**, overriding both the master toggle and the allow list. Examples:

```
rm
git push
git push --force
sudo
```

The deny list is the safety net — put destructive or irreversible commands here so they can never auto-run.

### Resolution order

1. If the command matches a **deny** pattern → **always prompt** (wins).
2. Else if the **master toggle** is on → auto-run.
3. Else if the command matches an **allow** pattern → auto-run.
4. Else if **Auto-run read-only commands** is on and the command is in the read-only set → auto-run.
5. Else → **prompt**.

---

## Self-correction via lint errors

The **Include Tool Lint Errors** toggle (Settings → Tools & Permissions) feeds lint/diagnostic errors back to the model after an edit. The model sees the errors it introduced and can fix them in the next turn. On by default; turn off if your project's linter is noisy and confuses the model.

Related tool: `read_lint_errors` (auto-approved) lets the model deliberately check a file's diagnostics.

---

## Summary checklist

- **Cautious default:** all auto-approve off, read-only auto-run off, deny list with `rm`/`sudo`/`git push --force`. You approve everything sensitive.
- **Fast but safe:** auto-approve `edits`, read-only auto-run **on**, deny list with `rm`/`git push --force`. Edits and safe commands flow; dangerous commands still ask.
- **Full autonomy (agent mode):** master terminal toggle on, auto-approve `edits` + `code execution`, deny list still populated. Closest to a fully autonomous agent — keep a deny list.