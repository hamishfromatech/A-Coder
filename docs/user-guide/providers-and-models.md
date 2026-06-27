# Providers & Models

A-Coder connects directly to model providers — your messages go straight to Anthropic, OpenAI, your local Ollama server, etc. There is no proxy and no data retention on A-Coder's side (unless you use the hosted A-Coder provider).

This page covers every provider, how models are discovered, per-feature model selection, and the capability overrides you can tune per model.

---

## Cloud providers

| Provider | Setting fields | Default models | Notes |
|---|---|---|---|
| **Anthropic** | API key | claude-opus-4-0, claude-sonnet-4-0, claude-3-7-sonnet, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus | Key → [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **OpenAI** | API key | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o4-mini | Key → [platform.openai.com](https://platform.openai.com/api-keys) |
| **Google Gemini** | API key | gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-2.0-flash-lite | Key → [aistudio.google.com](https://aistudio.google.com/apikey). See [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). |
| **xAI (Grok)** | API key | grok-2, grok-3, grok-3-mini, grok-3-fast, grok-3-mini-fast | Key → [console.x.ai](https://console.x.ai) |
| **DeepSeek** | API key | deepseek-chat, deepseek-reasoner | Key → [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| **Mistral** | API key | codestral, devstral-small, mistral-large, mistral-medium, ministral-3b, ministral-8b | Key → [console.mistral.ai](https://console.mistral.ai/api-keys) |
| **Groq** | API key | qwen-qwq-32b, llama-3.3-70b-versatile, llama-3.1-8b-instant | Key → [console.groq.com](https://console.groq.com/keys) |
| **OpenRouter** | API key | claude-opus-4, claude-sonnet-4, qwen3-235b, deepseek-r1, and more | Aggregator — 100+ models. Key → [openrouter.ai](https://openrouter.ai/settings/keys). See [limits](https://openrouter.ai/docs/api-reference/limits). |
| **Google Vertex AI** | region, project | (add models manually) | Authenticate with Google Cloud first. [Endpoints](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library), [regions](https://cloud.google.com/vertex-ai/docs/general/locations). |
| **Microsoft Azure OpenAI** | resource (project), API key, API version | (add models manually) | [Endpoints](https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions), [find keys](https://learn.microsoft.com/en-us/azure/search/search-security-api-keys). Default API version `2024-05-01-preview`. |
| **AWS Bedrock** | API key, region, endpoint | (add models manually) | Connect via [LiteLLM proxy](https://docs.litellm.ai/docs/providers/bedrock) or the [Bedrock Access Gateway](https://github.com/aws-samples/bedrock-access-gateway). |
| **A-Coder (hosted)** | API key | claude-sonnet-4, claude-3-5-sonnet, claude-3-5-haiku, claude-opus-4 | Cloud-hosted models. Key → [a-coder.dev](https://a-coder.dev). Models auto-fetched. |
| **OpenAdapter** | API key | (auto-fetched from `/v1/models`) | OpenAI-compatible aggregator, flat-rate. Key → [openadapter.in](https://openadapter.in). |

## Local providers

Local providers run models on your own hardware. A-Coder **auto-detects** the models each one exposes — no manual model entry needed.

| Provider | Setting fields | Default endpoint | Notes |
|---|---|---|---|
| **Ollama** | endpoint | `http://127.0.0.1:11434` | Models auto-detected. Ollama models also get **Download** buttons in Settings. [Custom endpoints](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-expose-ollama-on-my-network). |
| **Ollama Cloud** | endpoint, API key | `https://ollama.com` | Hosted Ollama models. Key → [ollama.com/settings/keys](https://ollama.com/settings/keys). Models auto-fetched. |
| **LM Studio** | endpoint | `http://localhost:1234` | Models auto-detected. [Endpoints](https://lmstudio.ai/docs/app/api/endpoints/openai). |
| **vLLM** | endpoint | `http://localhost:8000` | Models auto-detected. [Endpoints](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server). |
| **llama.cpp** | endpoint | `http://127.0.0.1:8080` | Run `./llama-server`; models auto-fetched from `/v1/models`. |
| **LiteLLM** | endpoint | (blank; e.g. `http://localhost:4000`) | Unified gateway. [Endpoints](https://docs.litellm.ai/docs/providers/openai_compatible). |
| **OpenAI-Compatible** | baseURL, API key, custom headers | (blank; e.g. `https://my-server.com/v1`) | Connect any OpenAI-compatible API. `headersJSON` lets you send custom headers. **Do not** include `/chat/completions` in the baseURL. |

### Auto-refresh models

The **Auto-detect local models** toggle (Settings → Manage Models, `autoRefreshModels`) re-fetches the model list from local providers and the hosted aggregators (A-Coder, OpenAdapter) whenever you open Settings. Leave it on unless your local server is slow to respond.

Providers whose models can be refreshed: `ollama`, `ollamaCloud`, `vLLM`, `lmStudio`, `llamaCpp`, `aCoder`, `openAdapter`.

---

## Per-feature model selection

Each feature can use a different model. In **Settings → Features**, set the model for Chat, Quick Edit, Autocomplete, Apply, Commit Messages, Vision, and Smart Tool Picker. If a feature has no model selected, A-Coder uses any enabled model.

See [Getting Started](getting-started.md#3-choose-a-model-for-each-feature) for the feature table.

---

## Model capability overrides

Every model has a capability profile (context window, tool-calling format, FIM support, reasoning, temperature). A-Coder ships known values for popular models and falls back to sensible defaults for unknown ones. You can override the following per model in Settings (the **Model Overrides** panel):

| Override | What it controls |
|---|---|
| `contextWindow` | Input token limit (default 256,768) |
| `reservedOutputTokenSpace` | Space reserved for output (default 16,384) |
| `supportsSystemMessage` | `false` / `system-role` / `developer-role` / `separated` (how the system prompt is sent) |
| `specialToolFormat` | `openai-style` / `anthropic-style` / `gemini-style` / `marker-style`. If a model can't call tools natively, A-Coder falls back to **XML tool calling** in agent mode. |
| `supportsFIM` | Whether the model uses fill-in-the-middle format for autocomplete |
| `defaultTemperature` | Recommended sampling temperature |
| `reasoningCapabilities` | Whether the model reasons/thinks, and whether reasoning can be turned off |
| `additionalOpenAIPayload` | Extra fields appended to OpenAI-compatible request bodies |

### Reasoning (thinking) controls

For models that support reasoning (e.g. Claude with extended thinking, OpenAI o-series, DeepSeek-R1, Qwen3, Grok), A-Coder exposes per-model reasoning options:

- **Reasoning enabled** — turn thinking on/off (only if the model allows it; some models always reason).
- **Reasoning budget** — a token slider (Anthropic-style).
- **Reasoning effort** — a discrete slider like `low`/`medium`/`high` (OpenAI-style).

Open-source models that emit `<think>…</think>` tags (or `<llama:think>`, etc.) are parsed automatically — the reasoning is shown in a dedicated reasoning card without polluting the answer.

### Tool calling without native support

If `specialToolFormat` is unset for a model (i.e. it can't call tools natively), A-Coder automatically switches that model to **XML tool calling** in agent mode — it instructs the model to emit tool calls as XML, which A-Coder parses. This means even tool-weak local models can drive the agent. See [XML Tool Calling](../XML_TOOL_CALLING_IMPLEMENTATION.md) for internals.

---

## Adding a custom model

1. In Settings, open the provider.
2. Use **Add model** and type the exact model name your provider expects (e.g. `openai/gpt-oss-20b` on OpenRouter).
3. Enable it and assign it to a feature.

For local and hosted aggregating providers, models are detected automatically — you only add a custom model when the auto-detection misses one or you want to pin a specific name.

---

## Privacy

- **Direct-to-provider:** messages go straight to the provider you configured. A-Coder does not relay them.
- **Zero retention:** A-Coder stores nothing on its own servers and does not use your data for training. (The hosted A-Coder provider forwards to the inference proxy as needed — see its terms.)
- **Local models:** for full privacy, use Ollama / LM Studio / vLLM / llama.cpp so no data leaves your machine.