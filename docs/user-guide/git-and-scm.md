# Git & Source Control

A-Coder adds AI-powered source-control features on top of VS Code's Git integration: one-click AI commit messages and a set of repo tools the agent can call directly.

---

## AI commit messages

In the Source Control view, use the **AI commit message** action to generate a commit message from your staged changes. A-Coder sends the diff to the **Commit Messages** model (`SCM` feature) and inserts the result into the commit box.

- **Sync with Chat Model** (`syncSCMToChat`, default on) — use the current chat model instead of the dedicated SCM model. Turn off if you want commit messages to always use a specific (e.g. cheap fast) model.

---

## Repo tools (Morph Repo Storage)

When [Morph Repo Storage](morph.md#repo-storage) is enabled, the agent can drive git directly through `repo_*` tools. Mutating ops require **repo** approval; read-only ops are auto-approved.

### Mutating (approval: `repo`)

| Tool | Purpose |
|---|---|
| `repo_init` | Initialize a repo |
| `repo_clone` | Clone a repo |
| `repo_add` | Stage files (`.` for all) |
| `repo_commit` | Commit staged changes (with optional metadata) |
| `repo_push` | Push, optionally indexing embeddings |
| `repo_pull` | Pull latest changes |
| `repo_checkout` | Checkout a branch or commit |
| `repo_branch` | Create a new branch |

### Read-only (auto-approved)

| Tool | Purpose |
|---|---|
| `repo_status` / `repo_status_matrix` | File status (single / all) |
| `repo_log` | Commit history |
| `repo_list_branches` / `repo_current_branch` | Branches / current branch |
| `repo_resolve_ref` | Resolve a ref to a commit hash |
| `repo_get_commit_metadata` | Metadata + chat history for a commit |
| `repo_wait_for_embeddings` | Block until embeddings finish |

---

## Semantic repo search

With Repo Storage enabled, the agent can call `codebase_search` to semantically search your indexed codebase (and git history) — far better than keyword grep for "where do we handle authentication" questions. See [Morph](morph.md).

## Typical workflows

- **"Commit my changes"** — the agent runs `repo_status_matrix`, reviews the diff, drafts a message, then `repo_add` + `repo_commit`.
- **"What did we change last week?"** — `repo_log --depth 20` and summarize.
- **"Create a branch for the auth refactor"** — `repo_branch` + `repo_checkout`.

For everyday commits, the AI commit-message button is faster than driving the agent — reserve the repo tools for multi-step flows.