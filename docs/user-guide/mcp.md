# MCP (Model Context Protocol)

MCP lets the A-Coder agent call tools exposed by any **MCP-compatible server** — external data sources, APIs, browser automation, internal tools, etc. A-Coder auto-discovers servers you declare and exposes their tools to the model.

> Manage MCP servers in **Settings → MCP Tools**.

---

## Config file

MCP servers are declared in **`~/.a-coder/mcp.json`**. A-Coder creates this file on first launch with a sample `chrome-devtools` entry and watches it for changes — editing it triggers an automatic refresh. Use the **reveal config file** action in Settings to open it.

### stdio servers (local child processes)

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "env": { "KEY": "value" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    }
  }
}
```

### SSE / URL servers (remote)

```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://example.com/sse",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

---

## Enabling servers

New servers default to **off** — you must toggle them on explicitly in Settings → MCP Tools. This prevents first-launch from auto-spawning `npx` processes or connecting to remote servers without your consent.

Each server's on/off state is remembered per server name.

---

## Tool approval

Tools from connected MCP servers are exposed to the model under the **MCP tools** approval category. The model will prompt before calling them unless you enable **Auto-approve MCP tools** in Settings → Tools & Permissions. This setting also gates external-tool calls made inside subagents.

When **TOON** compression (`enableToolResultTOON`) is on, verbose MCP tool results are compacted before being fed back to the model (only when TOON is at least 10% smaller). See [Context Management](context-management.md#toon-compression).

---

## What the agent sees

A-Coder aggregates tools from all *on* servers and lists them in the model's system prompt alongside the built-in tools. The model calls an MCP tool like any other; A-Coder routes the call to the right server over IPC (stdio servers run in the main process).

A bundled **Chrome DevTools MCP** sample is included for browser automation (navigate, click, screenshot, inspect network, run Lighthouse audits, etc.) — see the Chrome DevTools MCP skills for usage patterns.

---

## Mobile API access

When the Mobile API is enabled, MCP is also exposed remotely: `GET /api/v1/mcp/servers`, `GET /api/v1/mcp/tools`, and `PUT /api/v1/mcp/servers/:name/toggle`. See [Mobile API](mobile-api.md).