# Autocomplete (Inline FIM Completions)

A-Coder can suggest code completions inline as you type, using **FIM** (fill-in-the-middle) — the model sees the code before and after your cursor and predicts what goes in the middle.

> Configure in **Settings → Features → Autocomplete**.

---

## Enable it

| Setting | Default | Purpose |
|---|---|---|
| `enableAutocomplete` | `false` | Master toggle for inline completions. |
| `showInlineSuggestions` | `true` | Display ghost-text suggestions in the editor (UI). |
| Autocomplete **model** (Features tab) | — | The model used for completions. |

Autocomplete is **off by default** — turn it on and assign an **Autocomplete** model. Use a small, fast model (e.g. a Codestral / Qwen Coder / gpt-4.1-mini / local model) for low latency; the chat model is usually overkill for completions.

---

## FIM model requirement

The model must support FIM (`supportsFIM: true` in its capability profile). Known FIM models include Codestral, Qwen 2.5 Coder, StarCoder2, CodeGemma. If you assign a non-FIM model, completions won't work correctly — pick a model marked as FIM-capable. See [Providers & Models](providers-and-models.md#model-capability-overrides).

---

## Using it

1. Type in the editor; suggestions appear as ghost text after your cursor.
2. Accept with **Tab** (or your configured accept key).
3. Dismiss with **Esc**.

Completions are computed against your current file context (prefix + suffix around the cursor) and your **Global Instructions** (`aiInstructions`), so your coding conventions are respected.

---

## Tips

- Autocomplete runs frequently — use a cheap/fast model to keep latency low and cost down.
- Local models (Ollama / LM Studio / vLLM / llama.cpp) are great for autocomplete privacy and latency, especially a small FIM model.
- If suggestions feel intrusive, disable `showInlineSuggestions` to stop the ghost text while keeping the feature on, or turn the master toggle off.