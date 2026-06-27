# Built-in Tools

In **Code** and **Plan** modes, the AI can call tools to read your codebase, edit files, run commands, plan work, teach, and more. This page is the complete reference for every built-in tool and which ones need your approval.

> Tools are what make A-Coder an *agent* rather than a chatbot. The model decides which tool to call based on your request; A-Coder executes it and feeds the result back so the model can continue.

---

## Approval at a glance

Only the tools listed under **Approval required** below prompt you before running. **All other tools auto-approve** — they're read/search/inspect/plan/teach operations that can't modify your project.

If you want to skip prompts entirely for a category, enable **Auto-approve** for that category in Settings → Tools & Permissions (see [Tool Approval & Terminal](tool-approval-and-terminal.md)).

| Approval category | Tools in this category |
|---|---|
| **edits** | create / delete / rewrite / edit files & folders, `edit_files`, walkthrough writes |
| **terminal** | `run_command`, open/kill persistent terminal |
| **code execution** | `run_code`, skill scripts, skill benchmarks |
| **skills** | install / uninstall skills |
| **image generation** | `generate_image` |
| **repo** | mutating Morph repo ops: init / clone / add / commit / push / pull / checkout / branch |
| **forms** | `render_form` |
| **quizzes** | `create_quiz` |
| **MCP tools** | external MCP / Composio / ACP tool calls |
| *(auto-approved)* | everything else — all read/search/plan/teach tools + read-only repo queries |

> **Asymmetries worth knowing**
> - `run_persistent_command` runs a shell command in an *existing* terminal but is **auto-approved** — the approval gate is on opening/creating terminals and `run_command`.
> - `generate_video` is **auto-approved** while `generate_image` requires approval (only image generation is treated as a paid external call).
> - Read-only `repo_*` tools (`repo_status`, `repo_log`, `repo_list_branches`, …) are **auto-approved**; only mutating repo ops prompt.

---

## Context gathering (read & search) — auto-approved

| Tool | Purpose |
|---|---|
| `read_file` | Read a file with line-number prefixes. Supports `start_line`/`end_line` ranges and pagination for files >1 MB. |
| `outline_file` | Get imports, classes, functions, and signatures with line numbers — no implementation. Great prelude to a targeted `read_file`. |
| `ls_dir` | List a directory's immediate children (paginated). |
| `get_dir_tree` | Recursive tree diagram of a directory. |
| `search_pathnames_only` | Filename/path search (not contents). |
| `search_for_files` | Full-text content search across files; supports regex. |
| `search_in_file` | Search within one file; returns matching line numbers. |
| `read_lint_errors` | Get lint/diagnostic errors for a file (used for self-correction). |
| `fast_context` | Morph semantic search (warpGrep) over the repo. Requires Morph Fast Context. |
| `codebase_search` | Semantic search over Morph Repo Storage (indexed code). Requires Repo Storage. |

## File editing — approval: `edits`

| Tool | Purpose |
|---|---|
| `create_file_or_folder` | Create a file or folder (trailing slash ⇒ folder). |
| `delete_file_or_folder` | Delete a file or folder; recursive option. |
| `rewrite_file` | Replace an entire file's contents. Uses Morph Fast Apply if enabled. Returns lint errors. |
| `edit_file` | Find-and-replace the **first exact match** of `old_string` → `new_string` in one file. Fails if the string isn't found or isn't unique. Returns lint errors. |
| `edit_files` | Atomic multi-file find-and-replace (1–3 edits). Pre-validates every `old_string` is present and unique *before* applying any — no partial state. Can't combine with other tools in the same turn. |
| `update_walkthrough` | Create/append/replace `walkthrough.md` at the workspace root. |
| `open_walkthrough_preview` | Open a walkthrough file in a preview tab. |

### Why exact-match editing?

`edit_file` requires `old_string` to match **exactly and uniquely**, just like Claude Code. This makes edits predictable: the model can't silently edit the wrong occurrence, and when the text isn't found A-Coder shows similar blocks to help it retry. This is intentional — it trades a little model effort for a lot of safety.

## Terminal — approval: `terminal`

| Tool | Purpose |
|---|---|
| `run_command` | Run a shell command. With a `terminal_id` or `is_background`, runs in a persistent terminal; otherwise a hidden temporary terminal. Honors a timeout (seconds). |
| `open_persistent_terminal` | Open a long-lived terminal at a `cwd`. |
| `kill_persistent_terminal` | Close a persistent terminal. |
| `run_persistent_command` *(auto-approved)* | Run a command in an *existing* persistent terminal. |
| `wait` *(auto-approved)* | Block until a persistent-terminal command finishes or times out. |
| `check_terminal_status` *(auto-approved)* | Non-blocking status check of a persistent terminal. |

## Code execution — approval: `code execution`

| Tool | Purpose |
|---|---|
| `run_code` | Execute TypeScript/JavaScript in a sandbox that can call back into tools via `tools.*`. Hard 5-minute safety cap. |
| `execute_skill_script` | Run a script from a skill's `scripts/` folder (Python / Bash / Node.js). |
| `run_skill_benchmark` | Run a skill's benchmark tests; returns a 0–100 score. |

## Morph Repo Storage — mutating: `repo`, read-only: auto-approved

> All repo tools require the **Morph Repo Storage** setting to be enabled.

| Mutating (approval `repo`) | Read-only (auto-approved) |
|---|---|
| `repo_init`, `repo_clone`, `repo_add`, `repo_commit`, `repo_push`, `repo_pull`, `repo_checkout`, `repo_branch` | `repo_status`, `repo_status_matrix`, `repo_log`, `repo_list_branches`, `repo_current_branch`, `repo_resolve_ref`, `repo_get_commit_metadata`, `repo_wait_for_embeddings` |

See [Git & SCM](git-and-scm.md) and [Morph](morph.md).

## Planning & tasks — auto-approved

| Tool | Purpose |
|---|---|
| `create_todo` | Create a structured todo list with task IDs and dependencies. |
| `update_todo` | Set a task's status (`pending`/`in_progress`/`complete`/`failed`/`skipped`). |
| `get_todos` | Get the current todo list. |
| `add_todos` | Append tasks to the current plan. |

## Implementation planning — auto-approved

| Tool | Purpose |
|---|---|
| `create_implementation_plan` | Create a detailed, previewable, approvable plan with steps, complexity, files, and dependencies. Opens a preview tab. |
| `preview_implementation_plan` | Re-display the current plan for review. |
| `execute_implementation_plan` | Execute the approved plan one step at a time (respects dependencies). |
| `update_implementation_step` | Update a step's status and notes. |
| `get_implementation_status` | Get the current plan state. |

## Teaching & Learn mode — auto-approved

| Tool | Purpose |
|---|---|
| `explain_code` | Line-by-line explanation at the student's level. |
| `teach_concept` | Teach a concept from scratch (analogy + example + exercise). |
| `create_exercise` | Generate a practice exercise (`fill_blank` / `fix_bug` / `write_function` / `extend_code`). |
| `check_answer` | Validate a student's solution without giving away the answer. |
| `give_hint` | Progressive hint, levels 1→4 (vague → solution). |
| `create_lesson_plan` | Create a multi-module learning path. |
| `display_lesson` | Render a markdown lesson in a dedicated preview tab. |

See [Learn Mode](learn-mode.md).

## Skills — install/uninstall: `skills`, rest auto-approved

| Tool | Approval | Purpose |
|---|---|---|
| `load_skill` | auto | Load a skill's `SKILL.md` and discover its scripts/references/assets. |
| `list_skills` | auto | List available skills with metadata. |
| `load_skill_reference` | auto | Load a doc from a skill's `references/` folder. |
| `get_skill_asset` | auto | Retrieve an asset (template/image/data) with `{{variable}}` interpolation. |
| `install_skill` | `skills` | Install from `github`, `url`, or `local`. |
| `uninstall_skill` | `skills` | Remove a skill. |
| `get_skill_metrics` | auto | Usage count, success rate, avg duration, benchmark history. |
| `list_skill_benchmarks` | auto | List a skill's available benchmarks. |

See [Skills](skills.md).

## Media generation — image: `image generation`, video: auto-approved

| Tool | Approval | Purpose |
|---|---|---|
| `generate_image` | `image generation` | Generate an image from a text prompt via an OpenAI-compatible API. Returns markdown with the image URL. |
| `generate_video` | auto | Generate a video from a text prompt. |

See [Media Generation](media-generation.md).

## Generative UI — `forms` / `quizzes`

| Tool | Approval | Purpose |
|---|---|---|
| `render_form` | `forms` | Show an interactive form (single/multiple choice, checkbox, text) and return responses. |
| `create_quiz` | `quizzes` | Show an interactive quiz with immediate feedback and scoring. |

## Subagents — auto-approved

| Tool | Purpose |
|---|---|
| `run_subagent` | Spawn a focused sub-agent with isolated context and a restricted tool set. Types: `general`, `code-reviewer`, `architect`, `researcher`, `test-runner`. Can run in the background. Subagents cannot spawn further subagents. |

See [Agent Manager](agent-manager.md).

## External tools (MCP / Composio / ACP)

Connected external tools (MCP servers, Composio apps, ACP agents) are exposed to the model under the **MCP tools** approval category. See [MCP](mcp.md), [Composio](composio.md), and the ACP section.

---

## How tools are chosen

- The model picks tools from its system prompt, which lists every enabled tool with its description and parameter schema.
- Read-only tools run **in parallel** for faster responses.
- If **Tool Orchestration (Smart Tool Picker)** is enabled, a separate model first analyzes your request and suggests the right tools before the main model runs.
- Models without native tool calling fall back to **XML tool calling** so they can still drive the agent.