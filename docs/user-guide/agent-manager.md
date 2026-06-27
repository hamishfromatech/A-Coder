# Subagents & Agent Manager

A-Coder has two related "more than one agent" features: **subagents** (focused one-off delegations within a chat) and the **Agent Manager** (a separate window that aggregates chats, workspaces, and dashboards, including across multiple workspaces).

---

## Subagents

A subagent is a focused agent run with its own isolated context, an optional custom system prompt, and a restricted tool set. The parent model delegates a well-scoped task via the `run_subagent` tool and gets back only the final summary — keeping the parent's context clean.

### Built-in subagent types

| Type | Role | Tools | External tools? |
|---|---|---|---|
| `general` (default) | Autonomous coding — reads, edits, runs commands | read + create/delete/edit files + terminal + todos | opt-in via `allow_external_tools` |
| `code-reviewer` | **Read-only** security/quality review | read tools only | — |
| `architect` | **Read-only** architecture analysis & design | read tools only | — |
| `researcher` | **Read-only** factual Q&A with file:line citations | read tools only | — |
| `test-runner` | Runs tests/builds, analyzes failures, reports (doesn't fix) | read + terminal | — |

### `run_subagent` parameters

- `description` (required) — a well-scoped task description.
- `subagent_type` — one of the types above; defaults to `general`.
- `prompt` — optional custom prompt.
- `tools` — comma-separated builtin tool-name allowlist to override the type's defaults.
- `background` — `true` detaches and returns immediately; the result is delivered via notification when done.
- `allow_external_tools` — `true` also exposes MCP/Composio/ACP tools (still gated by your **Auto-approve MCP tools** setting).

> Subagents **cannot spawn further subagents** — this prevents unbounded recursion.

### When to use subagents

- Delegate a focused review ("review src/auth for SQL injection") to `code-reviewer` without polluting your main context.
- Hand a research question to `researcher` and get back a cited answer.
- Run a test suite via `test-runner` and get a pass/fail report.
- Background a long task (`background: true`) and keep chatting while it runs.

---

## Agent Manager

The Agent Manager opens an **auxiliary window** that aggregates your chats, workspaces, and dashboards in one place — useful when running many parallel agent tasks or monitoring several projects.

Open it from the command palette / A-Coder views. It mounts a React `AgentManager` surface with:

- A unified **dashboard** aggregating threads and operations.
- Per-workspace views and chat selectors.

### Multi-workspace (opt-in, localhost-only)

With multi-workspace enabled, A-Coder instances register with a local **Workspace Registry** and broadcast state over a **localhost WebSocket hub** (the first instance becomes the hub; others fail over if it disconnects). The Agent Manager gains a **Multi-View** tab with:

- `WorkspaceList` — registered workspaces with live liveness (🟢 connected / 🟡 warning / ⚪ offline).
- `MultiWorkspaceThreadSelector` — pick threads across projects.
- `UnifiedDashboard` — threads and operations aggregated across projects.

Broadcast messages: `register`, `heartbeat`, `thread-update`, `operation-start`, `operation-complete`, `sync-request`. The agent also gains `list_workspaces`, `switch_workspace`, and `broadcast_message` tools.

> **Privacy:** multi-workspace is opt-in and localhost-only — no data leaves your machine. See [`docs/agent-manager-multi-workspace.md`](../agent-manager-multi-workspace.md) for the full design.