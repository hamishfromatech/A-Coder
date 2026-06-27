# Context Management

Long conversations hit token limits. A-Coder manages this with semantic context gathering, rolling-window history, TOON compression of tool outputs, and a configurable agent iteration cap.

---

## Context gathering

Before answering, the agent gathers context from your codebase using read-only tools (auto-approved, run in parallel):

- `read_file`, `outline_file`, `ls_dir`, `get_dir_tree` — structure & content
- `search_pathnames_only`, `search_for_files`, `search_in_file` — search
- `fast_context` — Morph semantic search (if enabled)
- `codebase_search` — semantic search over Morph Repo Storage (if enabled)

The model decides what to read based on your request. You can also explicitly attach files with **@-mentions** in the chat input.

## Rolling window & summarization

As a conversation grows, A-Coder preserves recent messages while compressing older history so the model keeps its key context without blowing the context window. This is handled by the context compression service and a rolling message window.

## TOON compression

**TOON** (Token-Oriented Object Notation) is a compact JSON alternative that drops unnecessary quotes and whitespace. When **Enable TOON** (`enableToolResultTOON`) is on, verbose tool results (especially MCP tool outputs) are encoded in TOON before being fed back to the model — **only when it's at least 10% smaller** than the plain string, and only for objects/arrays over 100 chars. The result is prefixed `[TOON]\n` so the model knows the encoding.

Typical savings: **30–70% token reduction** on verbose tool outputs, which directly lowers cost and extends how long a conversation can run.

Find it in **Settings → Features → Tools & Permissions → Enable TOON**. Off by default.

## Agent iteration cap

The **Max Iterations** setting (`maxAgentIterations`, default `50`) bounds how many tool-call loops the agent runs in Code mode before stopping. Lower it for cheaper/faster runs; raise it for complex multi-step tasks. Find it in **Settings → Features → Agent Mode**.

## Model context-window overrides

You can tune the model's perceived context window and reserved output space per model (Settings → model overrides). See [Providers & Models → Model capability overrides](providers-and-models.md#model-capability-overrides).

- `contextWindow` — input token limit (default 256,768)
- `reservedOutputTokenSpace` — space reserved for output (default 16,384)

A-Coder auto-detects context windows for local providers (Ollama, LM Studio, vLLM, llama.cpp) and uses known values for popular cloud models; unknown models fall back to the defaults, which you can override.