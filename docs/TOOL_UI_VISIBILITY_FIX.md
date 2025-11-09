# Tool UI Visibility Fix

## Problem
When the LLM invokes a tool (both native and XML-based), the tool UI (like `EditToolSoFar` for file operations) was not shown during tool execution. Users only saw a generic 3-dot animation until the tool completed.

### User Experience Issue
1. LLM says: "Let me edit this file for you"
2. User sees: Generic typing animation (3 dots)
3. Tool executes: Still just 3 dots ❌
4. Tool completes: NOW the tool UI appears ✅

**This was wrong** - the tool UI should appear immediately when execution starts.

## Root Cause

### Code Flow Analysis

**Native Tool Calling:**
1. LLM generates tool call → `toolCallSoFar` populated → `toolIsGenerating = true` → Shows `EditToolSoFar` ✅
2. Tool executes → `isRunning = 'tool'` → Only showed `ToolLoadingIndicator` ❌

**XML Tool Calling:**
1. LLM generates XML → `isGeneratingXMLToolCall = true` → Shows generic spinner
2. XML parsed → Tool executes → `isRunning = 'tool'` → Only showed `ToolLoadingIndicator` ❌

### The Bug
In `SidebarChat.tsx` lines 3428-3458 (before fix):

```tsx
const generatingTool = toolIsGenerating ? (
  // Shows EditToolSoFar only when toolIsGenerating
  <EditToolSoFar toolCallSoFar={toolCallSoFar} />
) : null
```

The problem: `toolIsGenerating` is only true while the LLM is streaming the tool call parameters. Once the tool starts executing (`isRunning === 'tool'`), `toolIsGenerating` becomes false, so the UI disappears.

## Solution

### Changes Made

**File:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
**Lines:** 3427-3477

### Key Changes:

1. **Added fallback to `toolInfo`:**
```tsx
const activeToolName = toolCallSoFar?.name || currThreadStreamState?.toolInfo?.toolName;
const activeToolParams = toolCallSoFar?.rawParams || currThreadStreamState?.toolInfo?.rawParams;
```

2. **Show UI during execution:**
```tsx
const shouldShowToolUI = toolIsGenerating || isRunning === 'tool';
```

3. **Create proper `RawToolCallObj` from `toolInfo`:**
```tsx
toolCallSoFar={toolCallSoFar || {
  name: activeToolName as any,
  rawParams: activeToolParams || {},
  doneParams: [],
  id: currThreadStreamState?.toolInfo?.id || 'executing-tool',
  isDone: false
}}
```

## How It Works Now

### Data Sources (Priority Order):
1. **`toolCallSoFar`** - Tool call being streamed from LLM
2. **`toolInfo`** - Tool currently executing (from `chatThreadService`)
3. **Fallback** - Generic loading indicator

### State Flow:

**Native Tools:**
```
LLM streaming → toolCallSoFar exists → EditToolSoFar shown
                     ↓
Tool executing → toolInfo exists → EditToolSoFar STILL shown ✅
                     ↓
Tool completes → Tool message added to history
```

**XML Tools:**
```
LLM streaming XML → isGeneratingXMLToolCall → "Parsing tool call..." spinner
                          ↓
XML parsed → Tool executing → toolInfo exists → EditToolSoFar shown ✅
                          ↓
Tool completes → Tool message added to history
```

## Benefits

### 1. **Immediate Feedback**
Users see the tool UI as soon as execution starts, not after it completes.

### 2. **Works for Both Tool Types**
- ✅ Native tool calling (OpenAI, Anthropic, Gemini)
- ✅ XML tool calling (fallback for models without native support)

### 3. **Progressive Disclosure**
Users can see:
- Which tool is being invoked
- What parameters are being used
- Live updates during execution (for streaming tools)

### 4. **Better UX for File Operations**
File-related tools (`edit_file`, `read_file`, etc.) show the `EditToolSoFar` component immediately, which displays:
- File path
- Operation type
- Live diff preview (for edits)

## Testing

### Test Case 1: Native Tool (edit_file)
1. Ask LLM to edit a file
2. **Expected:** `EditToolSoFar` appears immediately when tool starts executing
3. **Expected:** Shows file path and operation details
4. **Expected:** UI persists throughout execution

### Test Case 2: XML Tool (read_file)
1. Use a model without native tool calling
2. Ask LLM to read a file
3. **Expected:** "Parsing tool call..." appears while XML is being generated
4. **Expected:** `EditToolSoFar` appears as soon as tool starts executing
5. **Expected:** Shows file path and operation details

### Test Case 3: Non-File Tool (run_command)
1. Ask LLM to run a terminal command
2. **Expected:** `ToolLoadingIndicator` appears immediately
3. **Expected:** Shows command being executed

## Technical Details

### Stream State Structure
```typescript
currThreadStreamState = {
  isRunning: 'tool' | 'LLM' | 'idle' | 'awaiting_user',
  llmInfo: {
    toolCallSoFar: RawToolCallObj | null,  // While LLM is generating
    // ...
  },
  toolInfo: {
    toolName: string,
    toolParams: any,
    rawParams: RawToolParamsObj,
    id: string,
    // ...
  }
}
```

### When Each Field is Populated:
- **`toolCallSoFar`**: During LLM streaming (native tools only)
- **`toolInfo`**: During tool execution (both native and XML)
- **`isRunning === 'tool'`**: During tool execution

## Files Modified
1. `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
2. `/src/vs/workbench/contrib/void/browser/react/src2/sidebar-tsx/SidebarChat.tsx`

Both files received identical changes.

## Related Issues
- Improved UX for XML tool calling
- Better visibility into tool execution
- Reduced user confusion about what the LLM is doing
