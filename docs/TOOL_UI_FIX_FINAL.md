# Tool UI Visibility - Final Fix

## Issue
The tool UI (like `EditToolSoFar` for file operations) wasn't showing during tool execution. Instead, users only saw a generic 3-dot loading animation.

## Root Cause
There were **two** loading indicators competing:

1. **`generatingTool`** (line 3498) - Correctly shows `EditToolSoFar` when tool is executing
2. **`ToolLoadingIndicator`** (lines 3505-3513) - Generic indicator that was OVERRIDING the proper UI

The second indicator was rendering AFTER `generatingTool`, so it appeared on screen instead of the proper tool UI.

## Fix Applied

### File: `src/sidebar-tsx/SidebarChat.tsx`

**Removed duplicate tool loading indicator (lines 3505-3513):**

```tsx
// ❌ REMOVED - This was overriding the proper tool UI
{(isRunning === 'tool' || isAnyToolActivity) ? (
  <ProseWrapper>
    <ToolLoadingIndicator 
      toolName={hasToolName ? toolCallSoFar?.name : currThreadStreamState?.toolInfo?.toolName} 
      toolParams={hasToolName ? toolCallSoFar?.rawParams : currThreadStreamState?.toolInfo?.rawParams}
    />
  </ProseWrapper>
) : null}
```

**Kept the correct tool UI (line 3498):**

```tsx
// ✅ CORRECT - Shows EditToolSoFar during execution
{generatingTool}
```

## How It Works Now

### Rendering Order:
1. Previous messages
2. Current streaming message (if any)
3. **Tool UI** (`generatingTool`) - Shows `EditToolSoFar` or `ToolLoadingIndicator` as appropriate
4. Typing indicator (3 dots) - Only when LLM is thinking, NOT when tool is executing
5. Continue button (when idle)

### Tool UI Logic (`generatingTool`):
```tsx
const shouldShowToolUI = toolIsGenerating || isRunning === 'tool';

const generatingTool = shouldShowToolUI && activeToolName ? (
  isFileRelatedTool(activeToolName) ? (
    <EditToolSoFar ... />  // ✅ Shows file path, operation, live updates
  ) : (
    <ToolLoadingIndicator ... />  // ✅ Shows generic loading for other tools
  )
) : isGeneratingXMLToolCall ? (
  <div>Parsing tool call...</div>  // ✅ Shows while XML is being generated
) : null
```

## What Users See Now

### Before Fix:
```
LLM: "Let me fix these issues:"
[3 dots animation] ❌ Generic, no info
```

### After Fix:
```
LLM: "Let me fix these issues:"
┌─────────────────────────────────┐
│ ✏️ Editing file                 │
│ features.js                     │
│                                 │
│ [Live diff preview]             │
└─────────────────────────────────┘
```

## Testing

### Test Case 1: File Edit
1. Ask LLM to edit a file
2. **Expected:** See `EditToolSoFar` component immediately
3. **Expected:** Shows file path and operation type
4. **Expected:** Live diff updates as edit progresses

### Test Case 2: Read File
1. Ask LLM to read a file
2. **Expected:** See `EditToolSoFar` component with "Reading file" indicator
3. **Expected:** Shows file path

### Test Case 3: Terminal Command
1. Ask LLM to run a command
2. **Expected:** See `ToolLoadingIndicator` with command details
3. **Expected:** NOT the generic 3-dot animation

### Test Case 4: XML Tools
1. Use model without native tool calling
2. Ask LLM to use a tool
3. **Expected:** "Parsing tool call..." while XML is being generated
4. **Expected:** Proper tool UI once parsing completes

## Files Modified
- `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
  - Removed duplicate `ToolLoadingIndicator` (lines 3505-3513)
  - Kept `generatingTool` as the single source of truth

## Related Fixes
This completes the tool UI visibility fix started earlier. The full solution includes:

1. ✅ Using `toolInfo` as fallback when `toolCallSoFar` isn't available
2. ✅ Showing UI when `isRunning === 'tool'` (not just during generation)
3. ✅ Removing duplicate loading indicator that was overriding the proper UI

## Result
Users now see proper, informative tool UI during ALL tool executions (both native and XML), not just generic loading animations.
