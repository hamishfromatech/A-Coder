# Vision (Image Understanding)

A-Coder can understand images you attach to chat — screenshots, UI mockups, diagrams, error photos — and reason about them in the conversation.

> Configure in **Settings → Features → Vision**.

---

## Enable it

1. Turn on **Vision Support Enabled** (`enableVisionSupport`).
2. Assign a **Vision** model in Settings → Features — a multimodal model (e.g. GPT-4o, Gemini, Claude with vision, Llama 4). A-Coder will throw if no vision model is selected.

## Using it

- **Drag-and-drop** an image into the chat input, or **paste** from clipboard.
- Add an optional prompt ("what's wrong with this UI?", "describe this architecture diagram", "reproduce this design in React").
- A-Coder sends the image to the selected vision model as an OpenAI multimodal message (`text` + `image_url` with base64 data), gets back a description, and feeds that description into the chat so the main model can act on it.

## What it's good for

- **Debug UIs from screenshots** — "this layout is broken, here's a screenshot, fix it."
- **Reproduce designs** — drop a mockup and ask for the component.
- **Read diagrams / charts** — ask questions about architecture or data.
- **Extract text/code from images** — OCR-style requests.

---

## Privacy

Images are sent directly to the vision model's provider. For full privacy, use a local multimodal model (e.g. via Ollama/LM Studio) as the Vision model so images never leave your machine.