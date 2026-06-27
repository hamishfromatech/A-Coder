# Composio App Integrations

[Composio](https://composio.dev) is a marketplace of 1000+ external apps (GitHub, Jira, Slack, Gmail, Notion, …) that A-Coder can expose to the agent as tools, plus trigger/webhook subscriptions for inbound events.

> Configure in **Settings → App Integrations**.

---

## Connect an app

1. Add your **Composio API key**.
2. Browse the **Available Apps** list (filterable by category). Each app shows its auth schemes, tool count, and trigger count.
3. Click an app to start a connection. OAuth2 apps redirect you to authenticate; API-key apps take a key.
4. Once connected, the app appears under **Connected Apps** with its status (`pending` / `active` / `failed` / `expired`).
5. **Enable** the app to add it to `composioEnabledToolkits` — only enabled apps expose their tools to the model.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `composioApiKey` | `''` | Composio API key. |
| `composioConnections` | `{}` | Connected accounts (toolkit slug → account ID). |
| `composioEnabledToolkits` | `[]` | Slugs of apps whose tools are exposed to the model. |

---

## How the agent uses connected apps

For each enabled toolkit, A-Coder fetches the app's tool definitions (name, description, JSON-Schema parameters, toolkitSlug, toolSlug) and lists them in the model's system prompt. The model invokes a Composio tool like any other; A-Coder executes it via a Composio Tool Router session and returns the result.

Composio tool calls are gated by the **MCP tools** approval category (the bucket for all external tools). Enable **Auto-approve MCP tools** to run them without prompts.

---

## Triggers & webhooks

Composio **triggers** let external apps push events into A-Coder (e.g. "a GitHub PR was opened", "a Jira ticket changed"). Enable them under **Trigger Webhooks**.

| Setting | Default | Purpose |
|---|---|---|
| `composioTriggersEnabled` | `false` | Enable the trigger webhook listener. |
| `composioTriggerPort` | — | Webhook listener port (defaults to the Mobile API port `apiPort`). |
| `composioTriggerTunnelUrl` | — | Optional Cloudflare Tunnel URL so external apps can reach your listener. |
| `composioTriggerSecret` | — | HMAC secret for webhook signature verification (auto-generated on first webhook). |

The webhook endpoint listens at `/composio/triggers`. Trigger types are `webhook` or `poll`. Each trigger instance is tied to a connected account and config; you can enable/disable individual triggers.

> For external apps to reach your local listener, expose it with a Cloudflare Tunnel and paste the tunnel URL into `composioTriggerTunnelUrl` (same pattern as the [Mobile API tunnel](mobile-api.md#cloudflare-tunnel-optional)).