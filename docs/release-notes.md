# A-Coder Release Notes

## v1.7.0 — April 23, 2026 (Release 0065)

### New Features
- **Proactive AI Coach** — Settings UI and registered components for the new AI coach feature
- **Parallel Tool Execution** — Read-only tools now execute in parallel for faster responses; planning tools also support parallel execution
- **Notification Sounds** — Audio feedback on LLM response completion, with smart logic driven by the LLM finish reason
- **Image Generation API Key** — New global setting for configuring your image generation provider API key

### Improvements
- **Chat Animations** — Simplified to compact designs for a cleaner feel
- **Message Queue** — Fixed reactivity issues and added exponential retry backoff
- **Composio Integration** — Replaced raw API calls with the official `@composio/core` SDK; simplified UI and docs
- **Dynamic Parallel Tool Conflict Detection** — Prevents write conflicts when tools run concurrently
- **Token Caching** — Optimized with TTL and deduplication for reduced API costs

---

## v1.6.8 — April 9, 2026 (Release 0063)

### New Features
- **Chrome DevTools MCP Integration** — Browser tools now connect via Chrome DevTools Protocol
- **llamaCpp Provider** — OpenAI-compatible API integration with dynamic model fetching for local LLMs
- **OpenAdapter Provider** — Unlimited-usage flat-rate model provider with dynamic model fetching

### UI & Design
- **Settings Page Redesign** — Premium styling, animations, and theme-aware icons
- **Model Card Grid** — Simplified layout with improved theme-awareness and hover transitions
- **Reasoning Card** — Redesigned UI for viewing model reasoning
- **Design System** — Modernized UI components with improved styling across the app

### Improvements
- **Parallel Tool Execution** — Read-only tools execute concurrently for faster completions
- **Update Notifications** — Improved version tracking with dismissal state
- **Composio Triggers & Webhooks** — Receive real-time events from connected apps
- **Edit Tool** — Simplified to exact matching only for more reliable code edits
- **Quiz & Course Structure** — Multiple question types and test cases in lesson HTML generator

---

## v1.6.5 — March 23, 2026 (Release 0060)

### New Features
- **Composio App Marketplace** — Connect and manage third-party app integrations with a tool router
- **Composio Triggers & Webhooks** — Real-time event support for connected apps
- **Mermaid Diagrams** — Render Mermaid diagrams directly in chat markdown
- **Fill-in-the-Blank Component** — New interactive element for chat responses

### Improvements
- **Composio Tool Descriptions** — Clearer authentication workflow guidance and usage prerequisites
- **ContextView Positioning** — Fixed handling of fixed vs absolute positioning cases

---

## v1.6.0 — March 14, 2026 (Release 0055)

### New Features
- **Skill System Expansion** — Execution, evaluation, and marketplace features for skills
- **Agent Manager Refactor** — Improved rendering stability and new accessibility features

### Improvements
- **Edit Code Service** — Replaced n-gram similarity with Levenshtein distance; added trailing whitespace and tab normalization
- **Chat Rendering** — Fixed out-of-order messages by enforcing monotonic raw text and consistent stream partitioning for think tags
- **Memory Leak Prevention** — Improved lifecycle management in React components
- **Accessibility** — Added ARIA attributes and keyboard navigation improvements
- **Learning Dashboard** — Refactored quiz components to use centralized progress service
- **Chat Sidebar** — Removed virtualized rendering in favor of simplified display

---

## v1.5.8 — March 10, 2026 (Release 0053)

### Improvements
- **Chat Scroll Position** — Fixed initial scroll to show newest messages in the sidebar
- **Markdown Streaming** — Improved stability with content-based keys and memoization
- **Streaming Fallback** — Preprocessing for incomplete markdown structures with fallback rendering

---

## v1.5.6 — March 3, 2026 (Release 0051)

### New Features
- **A-Coder Provider** — Re-enabled with API key authentication
- **Text Selection Styling** — Dedicated CSS styles for selected text

### Improvements
- **Markdown Rendering** — Dependency updates and component refactoring
- **Streaming Markdown** — Proper handling of incomplete code blocks during live streaming

---

## v1.5.5 — February 25, 2026

### Improvements
- **Real-Time Streaming** — LLM responses and reasoning deltas stream in real-time
- **Streaming Display** — Plain text rendering during streaming prevents malformed markdown
- **UI Responsiveness** — Increased update frequency for smoother streaming experience
- **Repetition Detection** — Raw text analysis for Anthropic chat to detect repeated content
- **Memory Optimizations** — Reduced memory footprint across the application
- **UI Redesign** — Premium styling refresh

---

## v1.5.3 — February 21, 2026 (Release 0048)

### New Features
- **A-Coder OAuth Provider** — Built-in authentication provider (disabled pending further work)
- **Multi-Workspace Management** — React hooks for connected workspaces, aggregated statistics, and cross-workspace thread search
- **Learning Progress Tracking** — Skill mastery visualization with spaced repetition quizzes
- **Browser & Webview Tools** — AI assistant can interact with browser windows and webviews
- **Telemetry Services** — Comprehensive session, file, and UI interaction tracking
- **Quiz Creation Tool** — AI-generated quizzes with enriched result data structures

### Improvements
- **Edit Code Service** — Concurrent edit protection, binary data validation, size limits, and line ending normalization
- **Agent Manager UI** — New stats formatting, quick actions, and walkthrough handling
- **Emoji Rendering** — Replaced legacy Unicode with explicit escape sequences across tools and UI
- **Image Generation** — Switched to OpenAI-compatible API with local storage; moved to main process for SSL support
- **Edit File Tool** — Simplified to use string replacement instead of ORIGINAL/UPDATED blocks
- **Terminal Integration** — Improved command correlation with shell integration
- **Walkthrough Preview** — Fixed stale closures with live refresh for preview tabs

---

## Earlier Releases (January 2026)

### Key Highlights
- **Skills System** — Load specialized AI capabilities with a settings UI
- **Multiple Simultaneous Tool Calls** — Marker-based format for parallel tool execution
- **Agentic Workflows** — Multi-block code edits, auto-continuation for interrupted responses, Gemini 3 support
- **Interactive Forms** — Dynamic user preference gathering in agent workflows
- **Workflow Tracking** — Multi-step task orchestration for complex code requests
- **Issue Triage** — Automated workflow powered by Ollama Cloud API
- **Image & Video Generation** — Initially via Pollinations.ai, later migrated to OpenAI-compatible API
- **Model Search** — Filter models in settings UI
- **Lazy IPC & SCM Redesign** — Performance improvements to the source control management UI
- **Student Mode** — `display_lesson` support and enhanced documentation
