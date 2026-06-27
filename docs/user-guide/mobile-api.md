# Mobile API & Remote Control

The Mobile API is a built-in **REST + WebSocket server** that exposes A-Coder's agent, workspace, planning, settings, and MCP features to mobile and remote clients. It's **disabled by default** for security.

> Configure in **Settings → API & Mobile**.

---

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `apiEnabled` | `false` | Enable the API server. |
| `apiPort` | `3737` | Port the server listens on. |
| `apiTokens` | `[]` | Valid API tokens (generate/manage in Settings). |
| `apiTunnelUrl` | — | Optional Cloudflare Tunnel URL for remote access. |

## Authentication

- Tokens use the format `acoder_<random-string>`.
- Send as `Authorization: Bearer <token>` for HTTP, or `?token=<token>` for WebSocket.
- The server binds to **`127.0.0.1` only** (localhost) unless you expose it via a tunnel.
- `GET /api/v1/health` is the only unauthenticated endpoint.

Generate tokens in Settings → API & Mobile. Treat them like passwords — anyone with a token can drive your editor.

---

## REST endpoints

All paths are prefixed `/api/v1`.

### Chat & threads
- `GET /threads` — list threads
- `GET /threads/:id` — get a thread
- `POST /threads` — create a thread
- `POST /threads/:id/messages` — send a message (streams via WebSocket)
- `DELETE /threads/:id`
- `GET /threads/:id/status`
- `POST /threads/:id/cancel`
- `POST /threads/:id/approve` / `POST /threads/:id/reject` — approve/reject a pending tool call

### Workspace & files
- `GET /workspace` — workspace info
- `GET /workspace/files` — list files
- `GET /workspace/files/tree` — directory tree
- `GET /workspace/files/:path` — read a file (supports `start_line` / `end_line` / `page_number`)
- `GET /workspace/files/:path/outline` — file outline
- `GET /workspace/files/:path/raw` — binary streaming with `Range` support
- `POST /workspace/search` — content search
- `GET /workspace/diagnostics` — lint/diagnostic errors
- `GET /workspace/folder/:path` — folder contents (name / path / type / uri / size)

### Planning
- `GET /planning/current` — current plan
- `POST /planning/create` — create a plan
- `PATCH /planning/tasks/:id` — update a task

### Settings
- `GET /settings`, `GET /settings/models`, `GET /settings/model`, `PUT /settings/model`
- `GET /settings/mode`, `PUT /settings/mode` — modes: `normal` (Chat), `gather` (Plan), `agent` (Code)

### MCP
- `GET /mcp/servers`, `GET /mcp/tools`, `PUT /mcp/servers/:name/toggle`

---

## WebSocket

Connect to `ws://localhost:3737?token=<token>` and subscribe to channels: `chat`, `workspace`, `planning`.

Key events:
- `stream_state_changed` — with `isRunning` (`LLM` / `tool` / `awaiting_user` / `idle`), `content`, `reasoning`, `toolCall`, `toolInfo`, `tokenUsage`
- `message_added`

This is how a mobile client shows live streaming responses and tool-call approvals.

---

## Cloudflare Tunnel (optional)

To reach the API from outside your machine without opening a port:

```bash
# 1. Install cloudflared
brew install cloudflared        # macOS

# 2. Create a tunnel
cloudflared tunnel create acoder-api

# 3. Configure ingress → your local server
#    (in ~/.cloudflared/config.yml)
#    ingress:
#      - hostname: api.yourdomain.com
#        service: http://localhost:3737

# 4. Run it
cloudflared tunnel run acoder-api
```

Paste the resulting hostname into **Settings → API & Mobile → Tunnel URL** (`apiTunnelUrl`). Clients then connect to `https://api.yourdomain.com` instead of `localhost:3737`.

> The same tunnel pattern applies to [Composio triggers](composio.md#triggers--webhooks).

---

## Security notes

- The server is off by default and localhost-bound by default.
- Every endpoint except `/health` requires a bearer token.
- A tunnel exposes the server publicly — use a strong token and rotate it. Consider restricting the tunnel hostname in your Cloudflare dashboard.