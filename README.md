# Welcome to A-Coder.

<div align="center">
	<img
		src="./a-coder-transparent-512.png"
	 	alt="A-Coder Logo"
		width="300"
	 	height="300"
	/>
</div>

A-Coder is an open-source AI-powered code editor, forked from Void.

Use AI agents on your codebase, checkpoint and visualize changes, and bring any model or host locally. A-Coder sends messages directly to providers without retaining your data.

This repo contains the full sourcecode for A-Coder. If you're new, welcome!

- 🧭 Original Void: [voideditor.com](https://voideditor.com)

- 📖 [Development Guide](./docs/DEVELOPMENT_GUIDE.md)
- 🛠️ [Latest Models Tool Calling Analysis](./docs/LATEST_MODELS_TOOL_CALLING_ANALYSIS.md)
- ⚠️ [Ollama Cloud Tool Calling Bug](./docs/OLLAMA_CLOUD_TOOL_CALLING_BUG.md)


## Recent Features & Fixes

### 🖼️ Vision Support (NEW!)
**Feature:** Upload images to chat via drag & drop or copy/paste. Images are processed by a dedicated vision model to generate descriptions that work with ANY LLM.

**Architecture:**
- Vision is a separate feature with its own model selection
- Images processed by vision model (GPT-4V, Claude 3, Gemini, etc.)
- Descriptions appended to user message
- Main chat LLM receives text-only message (works with non-vision models!)

**Benefits:**
- ✅ Works with ANY chat model (GPT-3.5, Llama, Mistral, etc.)
- ✅ User controls which vision model processes images
- ✅ Cost optimization (use cheaper vision models)
- ✅ Universal compatibility

**Usage:**
1. Enable "Vision Support" in Settings → Feature Options
2. Select your preferred vision model
3. Drag & drop or paste images into chat
4. Images are analyzed and descriptions added to your message

**Details:** See [VISION_SUPPORT_IMPLEMENTATION.md](./docs/VISION_SUPPORT_IMPLEMENTATION.md)

---

### 📬 Message Queue Visual Indicator (NEW!)
**Feature:** Clear visual feedback when messages are queued while LLM is running.

**UI Improvements:**
- Shows banner: "X message(s) queued"
- Displays hint: "Enter to send queued message (⏎)"
- Updates input placeholder dynamically
- Real-time count updates

**User Experience:**
- Before: Silent queuing, user confusion
- After: Clear visual feedback, user knows exactly what's happening

---

### 🚫 Empty Message Filter (FIXED)
**Issue:** LLMs sometimes returned empty responses showing as "(empty message)" in chat.

**Fix:** Filter out empty assistant messages before rendering in UI.

**Result:** Clean chat history without "(empty message)" clutter.

---

### ✅ Ollama Cloud Tool Calling (FIXED)
**Issue:** Ollama Cloud models were returning `500 unmarshal` errors when using native tool calling.

**Root Cause:** Our tool schemas were missing `type` fields, causing llama.cpp's JSON schema parser to fail.

**Fix:** Updated `sendLLMMessage.impl.ts` to include `type: 'string'` in all tool parameter schemas.

**Status:** ✅ Fixed! All Ollama Cloud models now use native OpenAI-style tool calling.

**Details:** See [OLLAMA_CLOUD_TOOL_CALLING_BUG.md](./docs/OLLAMA_CLOUD_TOOL_CALLING_BUG.md)


## Development

To get started developing A-Coder, see [DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md) for complete instructions on:
- Running in development mode
- Building for production
- Creating DMG installers


## Reference

A-Coder is a fork of [Void](https://github.com/voideditor/void), which itself is a fork of [VS Code](https://github.com/microsoft/vscode). For a guide to the codebase, see [VOID_CODEBASE_GUIDE.md](./docs/VOID_CODEBASE_GUIDE.md).
