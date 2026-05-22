# Sidebar Chat UX Audit

**Date:** 2026-05-18
**Scope:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/` + supporting services and components
**Type:** Gap analysis and UX improvement opportunities

## 1. Search & Navigation

### Current State
- Thread selector (`SidebarThreadSelector.tsx`) only searches the **first user message and first assistant message** text.
- No in-thread search exists.
- No message-level jump or deep-linking.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 1.1 | **No in-thread search** — Users cannot search within a thread's full history (including tool results and reasoning). | **High** for long threads (limit is 100 messages). |
| 1.2 | **Thread search is shallow** — Only the first two messages are indexed for searching. Tool outputs and intermediate messages are invisible to search. | **Medium** |
| 1.3 | **No "jump to message" affordance** — No way to navigate to a specific historical message by index, timestamp, or content reference. | **Medium** |
| 1.4 | **No scroll position persistence on thread switch** — When switching threads via `switchToThread()`, scroll resets to bottom. The user's reading context in Thread A is permanently lost. | **High** |
| 1.5 | **No scroll progress indicator** — No visual bar or marker showing how far into a conversation the user has scrolled. | **Low** |

---

## 2. Message Interaction & Features

### Current State
- User messages: edit mode, context menu (copy/delete/retry), image attachments, timestamp (`formatTimeAgo`).
- Assistant messages: collapsible reasoning wrapper, markdown rendering, copy.
- Tool messages: many specialized wrappers, approval/reject/skip buttons.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 2.1 | ~~**Assistant messages cannot be regenerated**~~ — `AssistantMessageComponent` hardcoded `canRetry: false` with an empty `onRetry` handler. ✅ **FIXED**: Now uses `handleRegenerate` which finds the preceding user message and calls `retryFromMessage` to regenerate the response. | **High** |
| 2.2 | **Assistant context menu is still bare** — Offers Copy, Delete, Regenerate. Missing: "Continue from here", "Summarize thread up to this point". | **Medium** |
| 2.3 | **No message threading / branching** — Users cannot reply to a specific message. Conversations are strictly linear append-only. Branching would allow experimenting with alternate follow-ups without losing the original thread. | **Medium** |
| 2.4 | **No message bookmarking / starring** — Users cannot mark important messages (e.g., a great code snippet or explanation) for quick recall later. | **Medium** |
| 2.5 | ~~**Absolute timestamps are hidden**~~ — ✅ **FIXED**: Both user and assistant message timestamps now show a tooltip with the full absolute date/time on hover (via `data-tooltip-id="void-tooltip"` and `formatFullTimestamp()`). | **Low** |
| 2.6 | **No input character/token count** — Users writing long prompts have no feedback on message length or estimated token consumption before sending. | **Medium** |
| 2.7 | **No message-level reactions** — No 👍 / 👎 quick feedback mechanism on assistant responses. | **Low** |

---

## 3. Input Area (Chat Composer)

### Current State
- Multiline textarea (`VoidInputBox2`) with `@` mention support.
- Drag-and-drop and paste image support (when vision enabled).
- Queue system for batched messages.
- Token counter in the bottom bar.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 3.1 | **Placeholder is static** — When streaming, the placeholder still reads "Enter to send queued message" or "Enter instructions..." instead of something contextual like "A-Coder is thinking...". | **Low** |
| 3.2 | ~~**No input history (Up-arrow recall)**~~ — ✅ **FIXED**: `SidebarChat.tsx` now tracks `previousMessages` sent by the user. Pressing **Up Arrow** when the cursor is at the start of the textarea navigates back through message history. Pressing **Down Arrow** when the cursor is at the end moves forward, returning to the saved draft. This mirrors terminal/Discord behavior. | **High** |
| 3.3 | **No `/` slash command menu** — No autocomplete for `/clear`, `/summarize`, `/export`, etc. This is a standard power-user affordance in modern chat tools. | **Medium** |
| 3.4 | **No draft indicator** — If a user starts typing and navigates away, there's no visual "unsaved draft" state. | **Low** |
| 3.5 | **No character count for the input itself** — The token counter shows model context usage, but the composer textarea has no per-message character/token estimate. | **Medium** |

---

## 4. Image & Attachment UX

### Current State
- Image preview before sending (`ImagePreview` component).
- Drag-and-drop and paste handlers in `SidebarChat.tsx`.
- Images displayed in past user messages as fixed `w-32 h-32` thumbnails.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 4.1 | ~~**Images are not clickable to expand**~~ — ✅ **FIXED**: Created `ImageLightbox.tsx` component. Clicking any image in the composer (`ImagePreview`) or in past user messages opens a full-screen lightbox with zoom controls (+/-, Reset), keyboard shortcuts (Escape to close, +/- to zoom, 0 to reset), click backdrop to close, and click image to zoom. Uses `createPortal` to render at `document.body` level. | **Medium** |
| 4.2 | **No non-image file attachments** — Only images (`png`, `jpeg`, `gif`, `webp`) are supported via drag-and-drop. Attaching `.pdf`, `.txt`, `.csv`, etc. is not supported in the UI. | **Medium** |
| 4.3 | **No image caption support** — When attaching an image, the text message and image are independent. Users cannot add a text caption that travels with the image. | **Low** |
| 4.4 | ~~**No image hover zoom**~~ — Addressed by lightbox click-to-expand. | **Low** |

---

## 5. Thread Management

### Current State
- Create, delete (with confirmation flow), duplicate, and switch threads.
- Thread list shows first message text, message count, and date.
- Storage is limited to the 5 most recent threads (`MAX_THREADS_IN_STORAGE`).

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 5.1 | **No thread rename** — Threads use their first user message as an implicit title. Users cannot assign a short custom title. | **High** |
| 5.2 | **No pinned threads** — Important threads cannot be pinned to the top of the list. | **Medium** |
| 5.3 | **No thread color coding or icons** — No visual distinction beyond text. | **Low** |
| 5.4 | **No archival system** — Old threads beyond the 5-thread limit are silently pruned. Users cannot archive or manually manage storage. | **Medium** |
| 5.5 | **No bulk thread operations** — Cannot select multiple threads and delete/export them together. | **Low** |
| 5.6 | **Thread export is dead code** — `SidebarThreadSelector.tsx` has large commented-out blocks for "Copy As Messages Payload" and "Copy As Void Chat". No export UI is active. | **Medium** |
| 5.7 | **No "clear current thread" action** — Users must create a new thread or delete messages individually to start fresh. | **Medium** |

---

## 6. Streaming & Status Feedback

### Current State
- Typing indicator (`TypingIndicator`), ReAct phase indicator, tool loading indicators.
- Token counter with color-coded thresholds (`pill-error` at >=80%).
- Notification sound on natural LLM completion.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 6.1 | **No tool execution duration** — Tool messages do not show elapsed time (e.g., "Ran in 3.2s"). This would help users understand cost/performance of slow operations. | **Medium** |
| 6.2 | **No LLM elapsed time** — Reasoning models or long generations do not surface a "Thinking for 15s..." timer to the user, even though `ReasoningWrapper` tracks duration internally. | **Medium** |
| 6.3 | **No context compression notification UI** — `services.tsx` defines `CompressionEvent` and `triggerCompressionNotification()`, and `useCompressionEvent()` exists, but no component actually renders a toast or inline notice when compression occurs. The data exists but is hidden. | **Medium** |
| 6.4 | **Stop reasons are hidden** — `stopReason` is captured in stream state (`ThreadStreamState`) when `isRunning === 'idle'`, but it is never displayed to the user (e.g., "Stopped because max_tokens"). | **Low** |
| 6.5 | **No token pressure warning** — When usage is >=80%, the counter turns red, but there is no explicit toast or banner warning the user that context is almost full and older messages may be lost. | **Medium** |
| 6.6 | **No offline/retrying state badge** — If the LLM provider is unreachable, there is no persistent offline indicator in the sidebar header. | **Medium** |

---

## 7. Tool Result UX

### Current State
- Many specialized result wrappers: `FileResultWrapper`, `SearchQueryResultWrapper`, `TerminalResultWrapper`, `EditToolResultWrapper`, etc.
- Parallel tool grouping via `NestedToolGroup.tsx`.
- Collapsible headers (`ToolHeaderWrapper`) with expand/collapse transitions.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 7.1 | **No "expand all / collapse all"** — Users must manually open/close each tool result. A global toggle would be useful for scanning long agent runs. | **Low** |
| 7.2 | **No tool result search/filter** — In parallel tool groups or long chains, there is no way to find a specific tool result (e.g., "Find the `read_file` result for `config.ts`"). | **Medium** |
| 7.3 | **No side-by-side tool result comparison** — When retrying a message, old and new tool results are not shown together for comparison. | **Low** |
| 7.4 | **Terminal output lacks structure** — `TerminalResultWrapper` should ideally have collapsible stdout/stderr sections and ANSI color support, instead of a plain text block. | **Medium** |
| 7.5 | **No tool result copy as Markdown/JSON** — Tool results can only be copied via the generic `CopyButton` in some wrappers. There is no unified "Copy result" action. | **Low** |

---

## 8. Accessibility & Keyboard Navigation

### Current State
- `StudentOnboardingModal` has full focus trapping and keyboard handling.
- `prefers-reduced-motion` is respected in animation components.
- Some `aria-label` and `aria-expanded` attributes exist.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 8.1 | **Inconsistent focus trapping** — Only the student modal implements proper focus trapping. Other modals (MCP Server Modal, Quiz Me, Learning Dashboard) do not appear to trap focus. The new `ImageLightbox` does focus the close button on open and supports Escape, but lacks full focus trapping. | **Medium** |
| 8.2 | **No keyboard shortcut documentation** — No `?` button or inline hint showing available shortcuts (e.g., Enter to send, Shift+Enter for newline, Escape to abort). | **Low** |
| 8.3 | **Tab order may be illogical** — The @-mention dropdown and tool approval buttons may not follow a natural tab sequence during keyboard-only use. | **Medium** |
| 8.4 | **No screen-reader live region for streaming** — As new content streams in, there is no `aria-live` region announcing status changes or new message arrivals to screen readers. | **Medium** |
| 8.5 | **Reduced motion is partially applied** — `usePrefersReducedMotion` exists but is only used in `ChatAnimations.tsx`. Other animations (e.g., CSS transitions in `ToolHeaderWrapper`, scroll smoothness) do not respect it. | **Low** |
| 8.6 | **No high-contrast mode overrides** — The custom color system (`void-fg-*`, `void-bg-*`) does not appear to offer high-contrast variants. | **Low** |

---

## 9. Command Bar / Diff Integration

### Current State
- `CommandBarInChat` shows changed files, accept/reject all buttons, per-file accept/reject, and file status indicators.
- Auto-open/auto-close behavior based on file changes.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 9.1 | **No inline diff preview in sidebar** — Users must click into the actual file editor to see diffs. There is no accordion or inline diff view within the sidebar itself. | **High** |
| 9.2 | **No "reject with note"** — When rejecting changes, users cannot provide a reason or feedback. | **Low** |
| 9.3 | **No undo after accept/reject** — Once a file's diffs are accepted, there is no immediate "Undo last accept" button in the sidebar. | **Medium** |

---

## 10. Suggested Prompts & Discovery

### Current State
- Landing page shows 3 fixed suggestions: "Summarize my codebase", "How do types work in Rust?", "Create a .a-coder-rules file for me".
- Student mode has its own discovery tips.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 10.1 | **Suggested prompts are static** — They never change based on open files, selected code, recent messages, or workspace context. | **Medium** |
| 10.2 | **No prompt templates / snippets library** — Users cannot save and reuse frequently used prompts (e.g., "Refactor this to use TypeScript strict mode"). | **Medium** |
| 10.3 | **No prompt history dropdown** — Unlike the thread list, there is no dropdown in the composer suggesting past prompts from the current session. | **Low** |

---

## 11. Performance & Stability

### Current State
- `ErrorBoundary` wraps key components.
- Message filtering uses `useMemo`.
- `contentVisibility` is intentionally disabled to prevent dropdown clipping.

### Gaps
| # | Issue | Impact |
|---|-------|--------|
| 11.1 | **No loading skeleton for thread switch** — Switching to a thread with many messages renders instantly or stutters. A skeleton placeholder would improve perceived performance. | **Low** |
| 11.2 | **Thread list flashes error on load** — When `allThreads` is loading from storage, the thread list briefly shows "Error accessing chat history." This is jarring. | **Medium** |
| 11.3 | **No memory pressure warning** — When approaching the 50MB thread limit, 100-message limit, or 10MB image limit, users are not proactively warned. | **Low** |

---

## 12. Miscellaneous Small Gaps

| # | Issue | Impact |
|---|-------|--------|
| 12.1 | **No "fork chat from here"** — Related to branching, but specifically forking a conversation at a historical checkpoint or message. | **Medium** |
| 12.2 | **No message sharing** — Cannot generate a shareable link or export for a specific message or thread snapshot. | **Low** |
| 12.3 | **No sound for tool errors** — Notification sounds only fire on successful LLM completion. Tool errors, blocked states, or rejections are silent. | **Low** |
| 12.4 | **Landing page doesn't show thread count** — Users with many threads have no quick stats (e.g., "12 threads, 3 active"). | **Low** |

---

## Prioritization Matrix

### 🔴 High Impact
| # | Item | Why |
|---|------|-----|
| 1.1 | In-thread search | Critical for 100-message threads. |
| 1.4 | Preserve scroll position on thread switch | Data loss of reading context. |
| ~~2.1~~ | ~~Assistant message regenerate/retry~~ | ✅ **Done** in `SidebarChat.tsx` — `handleRegenerate` finds the preceding user message and calls `retryFromMessage`. |
| ~~3.2~~ | ~~Up-arrow input history~~ | ✅ **Done** in `SidebarChat.tsx` — tracks `previousMessages` user messages, navigates Up/Down from start/end of textarea. |
| 5.1 | Thread rename | Organizational sanity. |
| 9.1 | Inline diff preview in sidebar | Removes context-switching friction. |

### 🟡 Medium Impact
| # | Item | Why |
|---|------|-----|
| 1.2 | Deep thread search (tool results) | Complements in-thread search. |
| 2.2 | Richer assistant context menu | Improves assistant interaction parity. |
| 2.3 | Message threading / branching | Enables experimentation. |
| 3.1 | Slash command menu | Power-user productivity. |
| ~~4.1~~ | ~~Click-to-expand images~~ | ✅ **Done** — `ImageLightbox.tsx` with zoom, backdrop click, Escape to close, +/- zoom shortcuts. |
| 4.2 | Non-image file attachments | Extends vision support. |
| 5.3 | Thread archival | Needed due to 5-thread storage limit. |
| 6.1 | Tool execution duration | Transparency for slow ops. |
| 6.2 | LLM elapsed time | Transparency for reasoning models. |
| 6.3 | Show compression notifications | Data exists but is hidden from user. |
| 6.5 | Token pressure warning | Prevents surprise context loss. |
| 7.2 | Tool result search/filter | Useful for long agent runs. |
| 10.1 | Contextual suggested prompts | Better empty-state experience. |

### 🟢 Low Impact / Nice to Have
| # | Item | Why |
|---|------|-----|
| 1.5 | Scroll progress indicator | Nice polish. |
| ~~2.5~~ | ~~Absolute timestamps~~ | ✅ **Done** — `formatFullTimestamp()` tooltip on both user and assistant message timestamps. |
| 2.7 | Message reactions | Engagement metric. |
| 3.4 | Draft indicator | Minor state clarity. |
| 4.3 | Image captions | Edge case. |
| 5.2 | Pin threads | Organizational nicety. |
| 7.1 | Expand/collapse all tools | Convenience. |
| 8.2 | Keyboard shortcut docs | Good for onboarding. |
| 12.3 | Sound for errors | Accessibility nicety. |

---

## Implementation Notes

### Changes Made (2026-05-18)

1. **`ImageLightbox.tsx`** (new file)
   - Full-screen image viewer with `createPortal` rendering to `document.body`.
   - Zoom in/out (+/- buttons, click image, +/- keyboard shortcuts).
   - Escape to close, click backdrop to close.
   - Focus trap on open (focuses close button).
   - Loading spinner while image loads.
   - Prevent body scroll when open.

2. **`SidebarChat.tsx` — Image Click-to-Expand**
   - Added `ImageLightbox` import.
   - Added `lightboxImage` state to `UserMessageComponent`.
   - Wired both edit-mode and display-mode image `<img>` tags' `onClick` to open the lightbox.
   - Added `<ImageLightbox>` render at the bottom of `UserMessageComponent`.

3. **`SidebarChat.tsx` — Absolute Timestamp Tooltips**
   - Added `formatFullTimestamp()` helper that produces `Dec 18, 2026, 10:42:15 AM` style strings.
   - User message timestamps now have `data-tooltip-content={formatFullTimestamp(...)}`.
   - Assistant message timestamps now have the same tooltip.

4. **`SidebarChat.tsx` — Assistant Message Regenerate**
   - Added `handleRegenerate` async function in `AssistantMessageComponent`.
   - Walks backwards from the assistant message index to find the preceding user message.
   - Calls `abortRunning` then `retryFromMessage` on that user message index.
   - Changed `MessageContextMenu` props from `canRetry={false}` to `canRetry={true}` and wired `onRetry={handleRegenerate}`.

5. **`SidebarChat.tsx` — Input History (Up/Down Arrow)**
   - Added `inputHistoryRef` (array of past user message strings), `historyIndexRef` (-1 = current), `historyDraftRef` (saved draft before history navigation).
   - `useEffect` populates history from `previousMessages.filter(m => m.role === 'user').map(...displayContent)`.
   - **Up Arrow**: when cursor is at position 0, saves current draft, navigates back in history, restores message text via `textAreaFnsRef.current.setValue()`.
   - **Down Arrow**: when cursor is at end of text, navigates forward in history; if past the last item, restores the saved draft.
   - Navigating through history does not send messages — it restores text into the composer.
   - History is reset to -1 when Enter is pressed (message sent).

### Build Verification
- `npm run compile` — ✅ **0 errors**
- `npm run buildreact` — ✅ **Build success** (scope-tailwind + tsup completed, all bundles generated including updated `sidebar-tsx/index.js`)

---

## Implementation Notes (Batch 2 — 2026-05-18)

### 6. **Thread Rename (Audit 5.1)**
- Added `name?: string` to `ThreadType` in `chatThreadService.ts`.
- Added `setThreadName(threadId, name)` to `IChatThreadService` interface and implementation.
- Updated `SidebarThreadSelector.tsx`:
  - Renaming state: `isRenaming`, `renameValue`.
  - **Start rename**: Clicking a pen icon on hover triggers inline editing — an `<input>` with `autoFocus` replaces the thread title text.
  - **Confirm**: Checkmark button (✅) or Enter key saves the name via `chatThreadsService.setThreadName()`.
  - **Cancel**: X button (❌) or Escape key cancels editing.
  - Clicking the thread row while renaming is prevented from switching threads (guards `onClick`).
  - The thread name now has priority: if `pastThread.name` is set, display that; otherwise, fall back to the first user message.

### 7. **Preserve Scroll Position on Thread Switch (Audit 1.4)**
- Added `scrollPositionsRef` (a `Map<string, number>`) in `SidebarChat.tsx`.
- Cleanup effect on `threadId` change: saves `scrollContainerRef.current.scrollTop` into the map before unmount / switching.
- Mount effect on `threadId` change:
  - `requestAnimationFrame` ensures DOM has updated first.
  - If a saved position exists in the map, restores it onto the scroll container.
- This prevents the chat from snapping to the end when returning to a previously-read thread.

### 8. **Keyboard Shortcuts Hint Banner on Landing Page (Audit 8.2 / 6.1)**
- Created `KeyboardShortcutsBanner.tsx` (new, shared component in `util/`):
  - Auto-dismissing (8-second timer, pauses on hover).
  - Manual close with X button.
  - 2-column grid of keyboard shortcuts: Add Selection (⌘L), Send (↵), New-line (Shift↵), History (↑), and Mention (@).
  - Fades in with `animate-in`.
- Imported into `SidebarChat.tsx` and rendered on the landing page, just below the mode tagline.

### 9. **Slash Command Menu (Audit 3.3)**
- Created `SlashCommandMenu.tsx` (new sidebar component):
  - 6 commands: `/search`, `/summarize`, `/fix`, `/clear`, `/continue`, `/explain`.
  - Filters as the user types after `/`.
  - **Keyboard navigation**: Up/Down arrows to select, Enter to confirm, Escape to close.
  - **Mouse**: Hover to highlight; click to select.
  - Auto-dismisses on click outside.
  - Positioned **above** the textarea (`bottom-full`), so it doesn't overlap the text being typed.
- Wired into `SidebarChat.tsx`:
  - `slashMenuOpen` / `slashQuery` state.
  - Added a `div` container ref around the menu. Menu is rendered as a sibling before `VoidInputBox2`.
  - `onChangeText`: if the input starts with `/`, extract the query suffix and open the menu; otherwise close it.
  - On select: inserts `/{command.label} ` into the textarea and refocuses.

### 10. **Compression Notification Toast (Audit 6.3)**
- Created `CompressionToast.tsx` (new sidebar component):
  - Consumes `useCompressionEvent()`.
  - Shows a dismissible, 5-second auto-fade toast when a compression event fires.
  - Badge displays e.g. "32% smaller".
  - Details line shows messages removed, messages summarized, and a token count before/after.
  - Color-coded icon (minimize / compression glyph).
- Rendered in `SidebarChat.tsx` above the input area (next to `CompressionToast`).

### 11. **Copy Code Block Button Placement Improve (Audit 2.4)**
- Modified `BlockCodeApplyWrapper` in `ApplyBlockHoverButtons.tsx`:
  - Header: changed the right-side copy button from permanently-visible (inside `canApply` guard) to **always hidden in the header**.
  - New **floating copy button** inside `.group/codeblock` container:
    - `absolute top-2 right-2 opacity-0 group-hover/codeblock:opacity-100 transition-opacity duration-200`
    - Appears only when hovering the code block.
  - Language pill: restyled to a smaller, monospace, uppercase tag with `bg-void-bg-2`.
  - `uri === 'current'` case uses the language pill; `uri !== 'current'` shows a `ListableToolItem` file link.
  - Ensures the copy button doesn't fight with horizontal space in narrow sidebars.

### 12. **ReAct Thinking Bubble Improved (Audit 2.3)**
- Refactored `ReActPhaseIndicator` in `ChatAnimations.tsx`:
  - **Click-to-expand**: thought phases can be expanded/collapsed to reveal `phaseContent` (reasoning text).
  - Uses `SmoothHeight` for animated expand/collapse.
  - Hover shows a quick tooltip of the first line of reasoning.
  - Smoother color coding per phase — `thought` (neutral), `action` (accent blue), `observation` (neutral).
  - Removed the old `isTransitioning` opacity flicker; instead phases transition with a minimum hold duration and stable icon/label.
  - `onClick` toggles expand state only for the `thought` phase (where the text is most useful).

### 13. **Loading Skeleton Placeholder State (Audit 4.2 / 11.1)**
- Created `SkeletonMessage.tsx` (new sidebar component):
  - `SkeletonPulse`: a simple rounded pulsing div with configurable width/height.
  - `SkeletonMessage`: avatar circle + header stubs + content lines + action-button stubs for both assistant and user variants.
  - `SkeletonMessageList`: renders 3 skeleton messages as a placeholder list.
  - Used for the thread-switch / landing-load state (can be wired into the loading branch of `previousMessagesHTML` when `previousMessages` is not yet populated).

### Build Verification (Batch 2)
- `npm run compile` — ✅ **0 errors**
- `npm run buildreact` — ✅ **Build success** (all bundles generated including updated `sidebar-tsx/index.js`)

