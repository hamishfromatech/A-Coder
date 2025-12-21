# A-Coder: The Intelligent Agentic IDE

<div align="center">
	<img
		src="./resources/a-coder-transparent-512.png"
	 	alt="A-Coder Logo"
		width="200"
	 	height="200"
	/>
	<h3>Elevating Developer Productivity through Agentic AI</h3>
</div>

---

## What is A-Coder?

**A-Coder** is a modern, open-source, AI-native code editor designed for high-performance engineering. Built as a sophisticated fork of [Void](https://voideditor.com) (on top of VS Code), A-Coder integrates deeply with LLMs to provide a seamless, **agentic development experience**.

A-Coder is more than just an assistant; it's a teammate that reasons about your codebase, executes complex plans, and handle the repetitive tasks of software engineering, allowing you to focus on high-level architecture and problem-solving.

---

## 🚀 Key Feature Sets

### 🧠 Versatile Chat Modes
A-Coder adapts to your workflow with specialized modes for every task:
*   **💬 Normal Mode:** Balanced AI assistance for general coding and questions.
*   **🔍 Gather Mode:** Context-heavy research mode for deep codebase analysis.
*   **🤖 Agent Mode:** The full ReAct (Reason + Act) loop. AI takes the wheel to research, plan, and implement features autonomously.
*   **🎓 Student Mode:** A personal coding tutor. A-Coder explains concepts and guides you through learning, with adjustable levels from **Beginner** to **Advanced**.

### 🛠️ Professional AI Tooling
Our AI agents come equipped with a professional-grade toolset:
*   **File Operations:** Read (with smart pagination), create, delete, and rewrite files across your project.
*   **Context Discovery:** Tools for directory tree visualization, pathname search, and symbol outlining.
*   **Terminal Integration:** AI can run commands in temporary or persistent terminals to install packages, run tests, or execute your code.
*   **Self-Correction:** AI automatically analyzes linting and compiler errors to debug and fix its own code applications.

### ⚡ Precision & Reliability
We've engineered A-Coder for enterprise reliability:
*   **Anchor-Based Matching:** Robust handling of AI placeholders like `// ... existing code ...`, ensuring edits land exactly where intended.
*   **Fuzzy matching:** Intelligent fallback logic using Levenshtein distance to successfully apply changes even when models make minor text errors.
*   **Morph Fast Apply:** High-speed, high-accuracy code application powered by the Morph AI engine.
*   **TOON Result Compression:** 30-70% token reduction for tool outputs, saving costs and fitting more code into the AI's context window.

### 🎨 Next-Generation DX (Developer Experience)
*   **Modern Enterprise UI:** A beautiful, glassy aesthetic using Tailwind CSS and Lucide icons, fully theme-aware and optimized for focus.
*   **One-Click Migration:** Seamlessly import your extensions and settings from **VS Code**, **Cursor**, or **Windsurf**.
*   **MCP Integration:** Extend A-Coder with the **Model Context Protocol (MCP)** to connect custom toolsets and external data sources.
*   **Mobile API:** Monitor and control your IDE remotely via a secure REST/WebSocket API—perfect for mobile companion apps.
*   **Vision Support:** Drag and drop images or screenshots directly into chat for visual debugging and rapid UI implementation.

---

## 🔒 Privacy & Control

*   **Direct-to-Provider:** A-Coder sends messages directly to your chosen providers (Anthropic, OpenAI, Gemini, etc.) or local models (Ollama, LM Studio). No middleman, no data retention.
*   **Global AI Instructions:** Define your own system-level rules (e.g., "Always use functional programming", "No semicolons in JS").
*   **Tool Permissions:** Granular control over which tools the AI can run automatically and which require your manual approval.
*   **Data Portability:** Easily export and import your full chat history and settings as JSON.

---

## 🛠️ Getting Started

A-Coder is built for developers, by developers.

### Installation
[Link to download latest binaries for Windows, macOS, and Linux]

### For Contributors
Ready to help build the future of AI coding?
- 📖 [Development Guide](./docs/DEVELOPMENT_GUIDE.md) - How to build and run from source.
- 🧭 [Codebase Guide](./docs/VOID_CODEBASE_GUIDE.md) - Architecture and service overview.

---

## The Stack
A-Coder leverages a cutting-edge stack to provide its seamless experience:
- **Core:** VS Code (Monaco Editor, Extension Host)
- **UI:** React, Tailwind CSS, Lucide Icons
- **AI Orchestration:** Custom TypeScript services for Agentic loops and tool management
- **Communication:** Model Context Protocol (MCP), WebSocket-based Mobile API

---

*A-Coder is a fork of [Void](https://github.com/voideditor/void), which is a fork of [VS Code](https://github.com/microsoft/vscode). We are proud members of the open-source community.*
