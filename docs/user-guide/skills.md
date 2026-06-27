# Skills

Skills are reusable, markdown-defined packages of instructions, scripts, references, and assets that the agent can load on demand. Think of them as lightweight, installable expertise — a skill teaches the agent *how* to do a specific task deterministically, with optional executable scripts.

> Skills are A-Coder's analog of Claude Code's skills, but they live in **`~/.a-coder/skills/`** (not `.claude/skills/`).

---

## Where skills live

```
~/.a-coder/skills/{skill_name}/
  SKILL.md        (required)  — YAML frontmatter + markdown instructions
  scripts/        (optional)  — executable .py / .sh / .js scripts
  references/     (optional)  — docs loaded on demand
  assets/         (optional)  — templates / images / fonts / data
```

Manage them in **Settings → AI Skills**, which has two tabs: **Installed** and **Marketplace**.

---

## Writing a skill

A minimal `SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does — shown to the agent so it knows when to load it
version: 1.0.0
author: Jane
tags: [code, refactor]
dependencies: [pytest]
requires: [python>=3.10]
min_acoder_version: 0.5.0
---

# My Skill

Step-by-step instructions the agent follows when this skill is loaded.
Use concrete, imperative steps. Reference scripts in `scripts/` and docs
in `references/` as needed.
```

If you omit the frontmatter, A-Coder falls back to the first heading as the name and the first paragraph as the description.

The `description` is the most important field — it's what the model sees when deciding whether to `load_skill`. Make it specific about *when* to use the skill.

### Scripts

Place executable scripts in `scripts/`. The agent runs them with `execute_skill_script` (Python / Bash / Node.js), passing `args` and honoring a timeout (default 60 s, max 300 s).

### References & assets

- `references/` — docs the agent pulls lazily with `load_skill_reference` when it needs more detail.
- `assets/` — templates, images, or data files fetched with `get_skill_asset`, supporting `{{variable}}` interpolation.

---

## Installing & removing skills

- **Marketplace** tab — browse and install community skills.
- **From source** — the `install_skill` tool installs from `github`, a `url`, or a `local` path, with an optional `branch`.
- **Remove** — `uninstall_skill` deletes the skill folder.

> Installing and uninstalling skills require the **skills** approval category (they mutate `~/.a-coder/skills` and may run `git clone`). Loading and reading skills are auto-approved.

---

## Tools the agent uses

| Tool | Approval | Purpose |
|---|---|---|
| `list_skills` | auto | List available skills with metadata |
| `load_skill` | auto | Load a skill's `SKILL.md` and discover scripts/references/assets |
| `load_skill_reference` | auto | Load a doc from `references/` |
| `get_skill_asset` | auto | Fetch an asset with `{{variable}}` interpolation |
| `execute_skill_script` | `code execution` | Run a script from `scripts/` |
| `get_skill_metrics` | auto | Usage count, success rate, avg duration |
| `list_skill_benchmarks` | auto | List a skill's benchmarks |
| `run_skill_benchmark` | `code execution` | Run a skill's benchmark tests (0–100 score) |
| `install_skill` | `skills` | Install from github / url / local |
| `uninstall_skill` | `skills` | Remove a skill |

See [Built-in Tools](tools.md#skills--installuninstall-skills-rest-auto-approved) for parameter details.

---

## How the model uses skills

1. You ask a question whose answer is encoded in a skill.
2. The model sees the skill `description`s in its tool list and calls `load_skill` for the relevant one.
3. The skill's instructions enrich subsequent turns; the model may then `load_skill_reference`, `get_skill_asset`, or `execute_skill_script` as the instructions direct.
4. When the task is done, the skill's instructions naturally fall out of relevance.

Skills are idempotent — loading the same skill twice is a no-op.