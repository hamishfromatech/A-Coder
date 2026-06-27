# ACP Agents

ACP (Agent Communication Protocol) is an open standard ([i-am-bee/acp](https://github.com/i-am-bee/acp)) for talking to external **agent servers**. A-Coder can connect to any ACP server and expose its agents to the model as tools.

> Configure in **Settings → ACP Agents**.

---

## Config file

ACP servers are declared in **`~/.a-coder/acp.json`**. A-Coder creates this file on first launch with a sample `agent-hub` entry and watches it for changes.

```json
{
  "acpServers": {
    "agent-hub": {
      "url": "http://localhost:8000",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

Each entry is a server `url` plus optional `headers`. Use **reveal config file** in Settings to open and edit it.

---

## How it works

1. A-Coder connects to each server and fetches its list of **agents** (each with a name, description, and supported content types).
2. For each agent, A-Coder registers a tool named **`acp_{serverName}_{agentName}`** so the model can invoke it.
3. When the model calls that tool, A-Coder sends a run request (`agent`, `input`, optional `session_id`) to the server and streams back events: `run.created`, `run.in_progress`, `run.awaiting`, `run.completed`, `run.failed`, `message`, `thought`, `tool_call`.

Server state is shown in Settings as `loading` / `success` / `offline` / `error`.

---

## Tool approval

ACP agent calls are gated by the **MCP tools** approval category (the bucket for all external tools). Enable **Auto-approve MCP tools** in Settings → Tools & Permissions to run them without prompts. This setting also gates ACP calls made inside subagents.

---

## ACP vs. MCP

Both connect external tools to the model; the difference is the protocol:

- **MCP** (Settings → MCP Tools) exposes *tools* from MCP servers (stdio or SSE). Best for data sources, browser automation, file systems.
- **ACP** (Settings → ACP Agents) exposes *agents* from ACP servers (HTTP). Best for delegating to other agentic systems that run their own model↔tool loops.

Use whichever your target server speaks — many integrations publish MCP servers; agent frameworks increasingly speak ACP.