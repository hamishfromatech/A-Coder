# Edit File Tool UI Fix - Immediate Display

## Issue
The edit_file tool UI was only showing up after the tool was about to finish being used, while other tools showed their UI immediately when detected.

## Root Cause
The ReAct streaming parser was detecting the "Action" phase when it saw `<function_calls>`, but it wasn't creating a preliminary tool call object. The UI waits for `toolCallSoFar` to be non-null before showing the tool interface, but this only happened after the XML parser fully parsed the tool name and parameters.

For edit_file specifically, this could take a while because the LLM needs to generate all the search/replace blocks before the XML parser could create a complete tool call object.

## Solution Implemented

### 1. Preliminary Tool Call Object
**File:** `src/vs/workbench/contrib/void/browser/streamingXMLParser.ts`
**Lines:** 71-78

Added creation of a preliminary tool call object when Action phase is detected:
```typescript
// Create a preliminary tool call object for immediate UI feedback
const preliminaryToolCall: RawToolCallObj = {
    name: 'detecting...',
    rawParams: {},
    doneParams: [],
    id: this.toolCallId,
    isDone: false
};
```

### 2. Immediate UI Feedback
**File:** `src/vs/workbench/contrib/void/browser/streamingXMLParser.ts`
**Lines:** 80-85

The parser now immediately returns the Action phase with the preliminary tool call:
```typescript
// Immediately return action detection with preliminary tool call for UI updates
const result: StreamingReActResult = {
    phase: this.currentPhase,
    toolCall: preliminaryToolCall,
    isComplete: false
};
```

### 3. UI Updates for "Detecting..." State
**File:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
**Line:** 3850

Updated the `hasToolName` check to exclude the "detecting..." state:
```typescript
const hasToolName = !!(toolCallSoFar && toolCallSoFar.name && toolCallSoFar.name !== 'detecting...')
```

**File:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/ChatAnimations.tsx`
**Line:** 459

Enhanced the tool name display to show a user-friendly message:
```typescript
{toolName === 'detecting...' ? 'Detecting tool...' : toolName.replace(/_/g, ' ')}
```

## Result

### Before
- LLM starts generating `<function_calls>`
- UI waits for complete tool call parsing
- Tool UI appears only at the end (after all parameters generated)

### After
- LLM starts generating `<function_calls>`
- ReAct parser immediately detects Action phase
- Preliminary tool call created with name "detecting..."
- UI shows "Detecting tool..." immediately
- As tool name is parsed, UI updates to show actual tool name
- Full tool interface appears as soon as parameters are available

## Benefits

1. **Immediate Feedback:** Users see that a tool is being called right away
2. **Consistent Experience:** All tools now show UI immediately when detected
3. **Smooth Transitions:** "Detecting tool..." → actual tool name → full interface
4. **Better UX:** No more waiting for complex tools like edit_file to finish parsing

The edit_file tool (and all other tools) now show their UI immediately when the LLM starts typing the tool call, providing the same responsive experience across all tool types.
