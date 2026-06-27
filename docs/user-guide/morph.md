# Morph Integration

[Morph](https://morph.so) provides three capabilities A-Coder can use to speed up and improve code work:

1. **Fast Context** — semantic search (`warpGrep`) over your repo, faster and more relevant than keyword grep.
2. **Fast Apply** — intelligent code application; applies an instruction/edit pair to a file with higher accuracy than naive replacement.
3. **Repo Storage** — git operations plus semantic codebase search over a remote-indexed repo.

> Configure in **Settings → Features → Morph Settings**. A **Morph API key** is required for all three.

---

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `morphApiKey` | `''` | Required for all Morph calls. |
| `morphModel` | `auto` | `morph-v3-fast` / `morph-v3-large` / `auto`. |
| `enableMorphFastApply` | `false` | Use Morph for code application (`rewrite_file`). |
| `enableMorphFastContext` | `false` | Use Morph for semantic context gathering (`fast_context`). |
| `enableMorphRepoStorage` | `false` | Enable git + semantic search over a repo. |
| `morphRepoId` | — | Repo identifier for Repo Storage. |
| `morphRepoBranch` | `main` | Branch for Repo Storage operations. |
| `morphRepoIndexOnPush` | `true` | Generate embeddings after push. |
| `morphRepoWaitForEmbeddings` | `false` | Block push until embeddings finish. |

---

## Fast Context

When enabled, the model can call the `fast_context` tool (auto-approved) to run a semantic search across your repo and get back relevant `{file, content}` snippets. This is more useful than `search_for_files` for "find where we handle X" queries.

You can also enable Fast Context per model via the **morphFastContext** model option, so only specific models use it.

## Fast Apply

When enabled, `rewrite_file` uses Morph to apply changes rather than overwriting the file wholesale — better at preserving surrounding code and intent.

## Repo Storage

Repo Storage gives the agent a git workspace plus semantic search over indexed code (`codebase_search`). Enable it and set `morphRepoId` / `morphRepoBranch`.

- **`repo_*` tools** (see [Built-in Tools](tools.md#morph-repo-storage--mutating-repo-read-only-auto-approved)): mutating ops (`init`, `clone`, `add`, `commit`, `push`, `pull`, `checkout`, `branch`) require **repo** approval; read-only ops (`status`, `log`, `list_branches`, …) are auto-approved.
- **Index on push** — when `morphRepoIndexOnPush` is on, embeddings are generated automatically after `repo_push`. Set `morphRepoWaitForEmbeddings` to block the push until indexing finishes (slower, but the index is guaranteed fresh).
- **`codebase_search`** — semantic search over the indexed repo; params include `query`, `repo_id`, `branch`, `commit_hash`, `target_directories`, `limit`.