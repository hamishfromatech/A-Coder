# Media Generation (Images & Video)

A-Coder can generate images and short videos from text prompts via any **OpenAI-compatible** image/video generation endpoint, and render the result inline in chat.

> Configure in **Settings → Images & Media**.

---

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `enableMediaGeneration` | `false` | Master toggle — shows/hides the `generate_image` tool. |
| `imageGenerationBaseUrl` | `http://localhost:11434/v1` | OpenAI-compatible endpoint (defaults to local Ollama). |
| `imageGenerationModel` | `x/flux2-klein:4b` | Default model. |
| `imageGenerationApiKey` | `''` | API key for the endpoint (if required). |

The feature is off by default — A-Coder won't enable a keyed feature with an empty API key. Set your endpoint and key, then toggle it on.

---

## Tools

| Tool | Approval | Params | Output |
|---|---|---|---|
| `generate_image` | `image generation` | `prompt`, optional `filename`, `width` (default 1024), `height` (default 1024), `quality` (`low`/`medium`/`high`/`hd`) | Markdown with the image URL, rendered in chat. |
| `generate_video` | *(auto-approved)* | `prompt`, optional `filename`, `width`, `height`, `quality` | Markdown with the video URL. |

> **Asymmetry:** `generate_image` requires approval because it's a paid external call; `generate_video` is auto-approved. See [Tool Approval](tool-approval-and-terminal.md).

The model decides when to generate media based on your request ("generate a logo for…", "make a hero illustration of…"). When `enableMediaGeneration` is off, the `generate_image` tool is hidden from the model entirely.

---

## Provider examples

### Local (Ollama)
```
imageGenerationBaseUrl = http://localhost:11434/v1
imageGenerationModel   = x/flux2-klein:4b
```
Pull a model with `ollama pull <model>` first.

### Pollinations
[Pollinations](https://pollinations.ai) (`https://gen.pollinations.ai`) offers image models (`flux`, `turbo`, `gptimage`, `kontext`, `seedream`, `nanobanana`) and video models (`veo`, `seedance`, `seedance-pro`). See [`docs/POLLINATIONS.md`](../POLLINATIONS.md) for the exact options interfaces and the Bring-Your-Own-Pollen (user-pays) auth flow.

### Any OpenAI-compatible server
Point `imageGenerationBaseUrl` at your server's `/v1` root (don't include `/images/generations`).