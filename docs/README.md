# A-Coder Documentation

This directory contains technical documentation, implementation guides, and development resources for A-Coder, an AI-powered coding assistant built as a VS Code extension.

## Quick Links

- [Development Guide](#development) - Get started building A-Coder
- [Tool Architecture](#tools) - Understanding the tool system
- [Codebase Guide](./VOID_CODEBASE_GUIDE.md) - Architecture overview

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development](#development)
- [Tools & LLM Integration](#tools--llm-integration)
- [Features & Enhancements](#features--enhancements)
- [API & Integration](#api--integration)
- [Performance & Optimization](#performance--optimization)
- [Architecture & Design](#architecture--design)
- [Bug Fixes & Improvements](#bug-fixes--improvements)

---

## Getting Started

| File | Description |
|------|-------------|
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | Complete guide for building, running, and packaging A-Coder |
| [HOW_TO_CONTRIBUTE.md](HOW_TO_CONTRIBUTE.md) | Contribution guidelines and prerequisites |
| [VOID_CODEBASE_GUIDE.md](VOID_CODEBASE_GUIDE.md) | Architecture overview of the A-Coder codebase |
| [WINDOWS_BUILD_GUIDE.md](WINDOWS_BUILD_GUIDE.md) | Platform-specific build instructions for Windows |

---

## Development

### Core Development
- **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - Primary development guide with build commands, debugging tips, and common issues
- **[HOW_TO_CONTRIBUTE.md](HOW_TO_CONTRIBUTE.md)** - Setup instructions for Mac, Windows, and Linux development environments
- **[VOID_CODEBASE_GUIDE.md](VOID_CODEBASE_GUIDE.md)** - Understanding the codebase structure and key components

### Workflow & Patterns
- **[ABOUT_TO_ACT_PATTERN.md](ABOUT_TO_ACT_PATTERN.md)** - The "about to act" UI pattern for confirming operations
- **[PROMPT_REFACTOR_PLAN.md](PROMPT_REFACTOR_PLAN.md)** - Plans for refactoring prompt generation

---

## Tools & LLM Integration

### Tool Architecture
- **[TOOL_ARCHITECTURE.md](TOOL_ARCHITECTURE.md)** - Comprehensive guide to the built-in tools system (read_file, edit_file, rewrite_file, etc.)

### Tool Calling
- **[XML_TOOL_CALLING_IMPLEMENTATION.md](XML_TOOL_CALLING_IMPLEMENTATION.md)** - XML-based tool calling for models without native support
- **[XML_TOOL_CALL_LOADING_UI_BEST_PRACTICES.md](XML_TOOL_CALL_LOADING_UI_BEST_PRACTICES.md)** - UI best practices for tool loading states
- **[TOOL_CALLING_FIX.md](TOOL_CALLING_FIX.md)** - Fixes for tool calling issues
- **[TOOL_UI_FIX_FINAL.md](TOOL_UI_FIX_FINAL.md)** - Final UI fixes for tools
- **[TOOL_UI_VISIBILITY_FIX.md](TOOL_UI_VISIBILITY_FIX.md)** - Tool visibility improvements
- **[TOOLSSERVICE_FIX_WALKTHROUGH.md](TOOLSSERVICE_FIX_WALKTHROUGH.md)** - ToolsService debugging walkthrough

### LLM Provider Integration
- **[OLLAMA_CLOUD_TOOL_CALLING_IMPROVEMENTS.md](OLLAMA_CLOUD_TOOL_CALLING_IMPROVEMENTS.md)** - Ollama Cloud API tool calling enhancements
- **[OLLAMA_CLOUD_TOOL_CALLING_BUG.md](OLLAMA_CLOUD_TOOL_CALLING_BUG.md)** - Bug report and workaround for Ollama Cloud
- **[LATEST_MODELS_TOOL_CALLING_ANALYSIS.md](LATEST_MODELS_TOOL_CALLING_ANALYSIS.md)** - Analysis of tool calling support across LLMs
- **[LM_STUDIO_COMPARISON_AND_IMPROVEMENTS.md](LM_STUDIO_COMPARISON_AND_IMPROVEMENTS.md)** - LM Studio provider integration
- **[POLLINATIONS.md](POLLINATIONS.md)** - Pollinations API provider integration

### Context & Prompts
- **[CONTEXT_WINDOW_IMPLEMENTATION.md](CONTEXT_WINDOW_IMPLEMENTATION.md)** - Context window management and token counting
- **[CONTEXT_FIX_TOOL_CALLS.md](CONTEXT_FIX_TOOL_CALLS.md)** - Fix for context issues with tool calls
- **[CONTEXT_COMPRESSION_COMPLETE.md](CONTEXT_COMPRESSION_COMPLETE.md)** - Context compression implementation
- **[MESSAGE_QUEUE_SYSTEM.md](MESSAGE_QUEUE_SYSTEM.md)** - Message queue for LLM streaming

---

## Features & Enhancements

### Agent Features
- **[agent-manager-multi-workspace.md](agent-manager-multi-workspace.md)** - Multi-workspace agent management
- **[student-mode-plan.md](student-mode-plan.md)** - Student mode feature planning
- **[student-enhancements.md](student-enhancements.md)** - Student mode enhancements implementation

### Code Execution
- **[CODE_EXECUTION_IMPLEMENTATION.md](CODE_EXECUTION_IMPLEMENTATION.md)** - Code execution feature implementation
- **[CODE_EXECUTION_COMPLETE.md](CODE_EXECUTION_COMPLETE.md)** - Complete code execution documentation

### Vision Support
- **[VISION_SUPPORT_IMPLEMENTATION.md](VISION_SUPPORT_IMPLEMENTATION.md)** - Vision/multimodal capabilities

### File Operations
- **[MORPH_INTEGRATION_COMPLETE.md](MORPH_INTEGRATION_COMPLETE.md)** - Morph code diff viewer integration
- **[MORPH_FAST_APPLY_INTEGRATION.md](MORPH_FAST_APPLY_INTEGRATION.md)** - Fast apply functionality
- **[MORPH_CORS_FIX.md](MORPH_CORS_FIX.md)** - CORS fix for Morph integration

### Auto-Continue & UX
- **[AUTO_CONTINUE_CHARACTER_LIMIT.md](AUTO_CONTINUE_CHARACTER_LIMIT.md)** - Auto-continue based on character limit
- **[AUTO_CONTINUE_TOGGLE_FIX.md](AUTO_CONTINUE_TOGGLE_FIX.md)** - Auto-continue toggle fixes
- **[SILENT_AUTO_CONTINUE_SUMMARY.md](SILENT_AUTO_CONTINUE_SUMMARY.md)** - Silent auto-continue feature
- **[DOUBLE_TAP_ENTER_FORCE_SEND.md](DOUBLE_TAP_ENTER_FORCE_SEND.md)** - Double-tap Enter to send message

---

## API & Integration

### Mobile API
- **[MOBILE_API_IMPLEMENTATION.md](MOBILE_API_IMPLEMENTATION.md)** - Complete Mobile API documentation for companion apps
- **[FOLDER_CONTENTS_API.md](FOLDER_CONTENTS_API.md)** - Folder contents API endpoint

### External APIs
- **[rebrand.md](rebrand.md)** - Rebranding documentation

---

## Performance & Optimization

- **[optimisation.md](optimisation.md)** - Performance optimizations
- **[LARGE_CODEBASE_MEMORY_ANALYSIS.md](LARGE_CODEBASE_MEMORY_ANALYSIS.md)** - Memory analysis for large codebases

---

## Architecture & Design

### System Design
- **[TOOL_ARCHITECTURE.md](TOOL_ARCHITECTURE.md)** - Tool system architecture
- **[VOID_CODEBASE_GUIDE.md](VOID_CODEBASE_GUIDE.md)** - Overall codebase architecture
- **[MESSAGE_QUEUE_SYSTEM.md](MESSAGE_QUEUE_SYSTEM.md)** - Message queue system design

### Planning & Analysis
- **[LARGE_CODEBASE_MEMORY_ANALYSIS.md](LARGE_CODEBASE_MEMORY_ANALYSIS.md)** - Memory patterns for large codebases
- **[walkthrough-feature.md](walkthrough-feature.md)** - Walkthrough feature planning

---

## Bug Fixes & Improvements

### Bug Fixes
- **[EDIT_FILE_UI_FIX.md](EDIT_FILE_UI_FIX.md)** - Edit file UI fixes
- **[TOOL_UI_FIX_FINAL.md](TOOL_UI_FIX_FINAL.md)** - Tool UI fixes
- **[TOOL_UI_VISIBILITY_FIX.md](TOOL_UI_VISIBILITY_FIX.md)** - Tool visibility fixes
- **[audit_report.md](audit_report.md)** - Security audit findings

### Fine-Tuning
- **[fine-tuning.md](fine-tuning.md)** - Model fine-tuning documentation

### Implementation Notes
- **[TOON_IMPLEMENTATION.md](TOON_IMPLEMENTATION.md)** - Toon feature implementation notes

---

## Documentation Standards

This repository follows these documentation standards:

1. **Markdown format** - All documentation uses GitHub Flavored Markdown
2. **Code blocks** - Code examples include syntax highlighting
3. **Section headers** - Clear hierarchical structure
4. **Link syntax** - Use relative links for internal docs (e.g., `[Guide](./FILE.md)`)

---

## Key Concepts

### A-Coder Code Location

**All A-Coder code lives in `src/vs/workbench/contrib/void/`** - do NOT modify files outside this directory without consulting the user first.

```
src/vs/workbench/contrib/void/
├── browser/          # Browser process (React UI, tool execution)
├── electron-main/    # Main process (LLM calls, MCP connections)
└── common/            # Shared types and service interfaces
```

### Tool Categories

| Category | Tools |
|----------|-------|
| Context Gathering | `read_file`, `ls_dir`, `get_dir_tree`, `search_for_files`, `search_in_file` |
| File Manipulation | `create_file_or_folder`, `delete_file_or_folder`, `rewrite_file`, `edit_file` |
| Terminal | `run_command`, `run_persistent_command`, `open_persistent_terminal` |

### Supported LLM Providers

- OpenAI-compatible APIs (including Azure, AWS Bedrock, OpenRouter)
- Anthropic (Claude)
- Google Gemini
- Ollama (local & cloud)
- LM Studio
- Pollinations
- DeepSeek, Groq, Mistral, xAI Grok, vLLM, and more

---

## Contributing

See [HOW_TO_CONTRIBUTE.md](HOW_TO_CONTRIBUTE.md) for contribution guidelines.

When adding new documentation:
1. Use descriptive filenames
2. Add a brief description at the top
3. Update this README.md to reference new files
4. Follow existing formatting conventions

---

## Quick Command Reference

```bash
# Development
npm install                    # Install dependencies
npm run watch                  # Watch for changes
npm run buildreact             # Build React components
npm run compile                # Compile TypeScript
./scripts/code.sh              # Launch development build

# Production
npm run gulp -- vscode-darwin-arm64    # Build for macOS ARM
hdiutil create -volname "A-Coder" ...  # Create DMG
```

---

## Support

For issues, questions, or contributions:
- GitHub Issues: [github.com/hamishfromatech/A-Coder/issues](https://github.com/hamishfromatech/A-Coder/issues)
- See [HOW_TO_CONTRIBUTE.md](HOW_TO_CONTRIBUTE.md) for more information