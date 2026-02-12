# Performance Optimisation Plan: A-Coder

## 1. Executive Summary
This document outlines the identified performance bottlenecks. The primary goal is to eliminate UI freezes, reduce compute resource overhead, and ensure a fluid user experience even when dealing with large files or complex directory structures.

---

## 2. Identified Blockers

### 2.1. Main Thread Text Processing
*   **The Problem:** Heavy operations like `findTextInCode` (in `editCodeService.ts`) and `search_in_file` (in `toolsService.ts`) run synchronously on the UI thread.
*   **Impact:** Files larger than 1MB cause the application to hang for several seconds during search/replace or linting analysis.
*   **Specific Symbols:** `extractSearchReplaceBlocks`, `_instantlyApplySRBlocks`, `findTextInCode`.

### 2.2. Inefficient Large File Handling
*   **The Problem:** `ToolsService.read_file` loads the entire file content into memory even when requesting a specific page or line range.
*   **Impact:** Excessive memory pressure and potential crashes on extremely large files (e.g., log files, minified bundles).
*   **Specific Symbols:** `ToolsService.callTool['read_file']`.

### 2.3. Coarse-Grained Yielding
*   **The Problem:** The agent loop yields to the event loop only every 3 iterations. `DirectoryStrService` yields based on item counts (every 50-100 items).
*   **Impact:** A single heavy iteration (e.g., an LLM edit on a large file) can still block the UI for much longer than the 16ms budget required for 60fps.
*   **Specific Symbols:** `ChatThreadService._runChatAgent`, `DirectoryStrService.yieldToEventLoop`.

### 2.4. Terminal Buffer Inefficiency
*   **The Problem:** `TerminalToolService.readTerminal` uses `Array.unshift()` while iterating over the buffer.
*   **Impact:** This is an $O(n^2)$ operation. As terminal scrollback grows, reading the terminal state becomes exponentially slower and blocks the main thread.
*   **Specific Symbols:** `TerminalToolService.readTerminal`.

### 2.5. Synchronous Token Counting Fallback
*   **The Problem:** `TokenCountingService` falls back to synchronous character estimation on the main thread if IPC is busy or fails.
*   **Impact:** Accumulated latency during message preparation for long chat histories.

---

## 3. Proposed Solutions & Implementation Plan

### Phase 1: Immediate Wins (The "Low Hanging Fruit")

#### 3.1. Optimize Terminal Reading
*   **Action:** Replace `unshift()` with `push()` and a single `reverse()` call.
*   **Target:** `src/vs/workbench/contrib/void/browser/terminalToolService.ts`

#### 3.2. Implement Range-Based File Reading
*   **Action:** Update `read_file` tool to use `IFileService.readFile` with `length` and `offset` options instead of `voidModelService.getModelSafe` which loads the full model.
*   **Target:** `src/vs/workbench/contrib/void/browser/toolsService.ts`

---

### Phase 2: Architectural Improvements

#### 3.3. Web Worker Offloading
*   **Action:** Create a `TextProcessing.worker.ts`.
*   **Tasks to Move:**
    *   Regex searching (`findTextInCode`).
    *   Search/Replace block extraction (`extractSearchReplaceBlocks`).
    *   Token counting (Tiktoken initialization and execution).
*   **Target:** Create `src/vs/workbench/contrib/void/browser/workers/` directory.

#### 3.4. Time-Sliced Yielding
*   **Action:** Implement a `Scheduler` utility that tracks execution time.
*   **Logic:**
    ```typescript
    if (performance.now() - startTime > 12) { // 12ms limit to allow 4ms for browser tasks
        await yieldToEventLoop();
        startTime = performance.now();
    }
    ```
*   **Target:** Integrate into `ChatThreadService` loop and `DirectoryStrService` traversal.

---

### Phase 3: Advanced Optimization

#### 3.5. Background Context Management
*   **Action:** Move `ContextCompressionService` logic to the background.
*   **Logic:** Calculate token counts and prepare summaries *incrementally* as messages are added to the thread, rather than blocking the "Send" action.
*   **Target:** `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`

#### 3.6. Incremental Tool Results
*   **Action:** Modify `IToolsService` to support an `onProgress` callback for search tools.
*   **Logic:** Stream filenames back to the UI as they are found by `search_pathnames_only` instead of waiting for the full search to complete.

---

## 4. Verification & Metrics

*   **Responsiveness Test:** Use Chrome DevTools "Long Tasks" monitor. No task should exceed 50ms during an agent run.
*   **Memory Profiling:** Ensure `read_file` on a 100MB file does not increase heap usage by more than 10MB (the page size).
*   **Terminal Stress Test:** Fill terminal with 10,000 lines and measure `readTerminal` latency (Target: < 10ms).
