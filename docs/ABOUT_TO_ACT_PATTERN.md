# "About to Act" Pattern Detection

## Problem Solved
LLMs (especially some models like kimi-k2) often **announce** they're about to use a tool but don't actually invoke it:

```
LLM: "I can see the issue. Let me add the initialize method to the PostProcessor class:"
[3 dots animation] ❌ No tool UI shown
[User has to click Continue to make it actually act]
```

## Solution
Detect when the LLM is announcing an intention to act and show the appropriate tool UI **immediately**, giving users visual feedback that the LLM is about to perform an action.

## Implementation

### 1. Frontend Pattern Detection (UI)
**File:** `SidebarChat.tsx` (both src and src2)

```typescript
const detectAboutToActTool = (text: string | undefined): { toolName: string; intent: string } | null => {
  if (!text) return null;
  
  const trimmed = text.trim();
  // Check if ends with colon (common pattern: "Let me edit the file:")
  if (!trimmed.endsWith(':')) return null;
  
  // Get last sentence/phrase before the colon
  const lastPart = trimmed.split(/[.!]/).pop()?.toLowerCase() || '';
  
  // Detect tool intentions
  if (lastPart.match(/let me (edit|modify|update|change|fix)/)) 
    return { toolName: 'edit_file', intent: 'editing' };
  if (lastPart.match(/let me (read|check|look at|examine|view)/)) 
    return { toolName: 'read_file', intent: 'reading' };
  if (lastPart.match(/let me (create|add|make)/)) 
    return { toolName: 'create_file_or_folder', intent: 'creating' };
  if (lastPart.match(/let me (delete|remove)/)) 
    return { toolName: 'delete_file_or_folder', intent: 'deleting' };
  if (lastPart.match(/let me (run|execute)/)) 
    return { toolName: 'run_command', intent: 'running' };
  
  // Also check for "I'll" and "I will" patterns
  if (lastPart.match(/i'?ll (edit|modify|update|change|fix)/)) 
    return { toolName: 'edit_file', intent: 'editing' };
  if (lastPart.match(/i'?ll (read|check|look at|examine|view)/)) 
    return { toolName: 'read_file', intent: 'reading' };
  if (lastPart.match(/i will (edit|modify|update|change|fix)/)) 
    return { toolName: 'edit_file', intent: 'editing' };
  if (lastPart.match(/i will (read|check|look at|examine|view)/)) 
    return { toolName: 'read_file', intent: 'reading' };
  
  return null;
};
```

### 2. Backend Auto-Continue
**File:** `chatThreadService.ts`

When the LLM stops after announcing it will act, automatically continue **without showing a "continue" message to the user**:

```typescript
const detectAboutToAct = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed.endsWith(':')) return false;
  
  const lastPart = trimmed.split(/[.!]/).pop()?.toLowerCase() || '';
  
  // Detect action announcements
  return !!(
    lastPart.match(/let me (edit|modify|update|change|fix|read|check|...)/) ||
    lastPart.match(/i'?ll (edit|modify|update|change|fix|read|check|...)/) ||
    lastPart.match(/i will (edit|modify|update|change|fix|read|check|...)/)
  );
};

if (detectAboutToAct(info.fullText)) {
  console.log(`[chatThreadService] Detected 'About to Act' pattern, auto-continuing...`)
  // Don't add visible "continue" message - just continue the loop
  shouldSendAnotherMessage = true
}
```

**Key difference from UI detection:**
- UI: Shows anticipatory UI ("Editing...")
- Backend: Silently continues the conversation loop
- User never sees a "continue" message in chat history

### Detected Patterns

**Editing:**
- "Let me edit the file:"
- "Let me **also** edit the config:"
- "Let me modify the code:"
- "**Additionally**, let me update this:"
- "**Next**, I'll fix the issue:"
- "**Now** let me change this:"
- "**First**, I'll edit the main file:"
- "I will update the component:"

**Reading:**
- "Let me read the file:"
- "Let me **also** check the config:"
- "**Additionally**, let me look at this:"
- "**Next**, I'll examine the file:"
- "**Now** let me view the code:"
- "I'll check the implementation:"

**Creating:**
- "Let me create a new file:"
- "Let me **also** add a component:"
- "**Additionally**, I'll make a helper:"
- "**Next**, let me create the test:"

**Deleting:**
- "Let me delete this file:"
- "Let me **also** remove the old code:"
- "**Additionally**, I'll delete the unused files:"

**Running:**
- "Let me run the command:"
- "Let me **also** execute the tests:"
- "**Next**, I'll run the build:"

## UI Display

### Priority Order
```typescript
const activeToolName = 
  toolCallSoFar?.name ||                    // 1. Actual tool being generated
  currThreadStreamState?.toolInfo?.toolName || // 2. Tool executing
  aboutToActTool?.toolName;                 // 3. About to act pattern ✨

const shouldShowToolUI = 
  toolIsGenerating ||           // Show during generation
  isRunning === 'tool' ||       // Show during execution
  (aboutToActTool && isRunning === 'LLM'); // Show when announcing ✨
```

### Visual Feedback
When "About to Act" is detected:

```tsx
<div className="flex items-center gap-2 py-2 text-void-fg-3 bg-void-bg-2 rounded-lg px-3 border border-void-border-3">
  <div className="w-3 h-3 border-2 border-void-accent border-t-transparent rounded-full animate-spin" />
  <span className="text-sm capitalize">{aboutToActTool.intent}...</span>
</div>
```

**Displays:**
- "Editing..." (with spinner)
- "Reading..." (with spinner)
- "Creating..." (with spinner)
- "Deleting..." (with spinner)
- "Running..." (with spinner)

## User Experience

### Before
```
LLM: "Let me add the initialize method to the PostProcessor class:"
[Generic 3-dot animation]
[User confused - is it doing something?]
[User clicks Continue] ❌
[NOW the tool executes]
```

### After
```
LLM: "Let me add the initialize method to the PostProcessor class:"
┌─────────────────────────────────┐
│ ⟳ Editing...                    │  ← UI shows immediately
└─────────────────────────────────┘
[System auto-continues silently] ✅  ← No "continue" message visible
[LLM actually calls edit_file tool]
┌─────────────────────────────────┐
│ ✏️ Editing file                 │  ← Full tool UI appears
│ PostProcessor.js                │
│                                 │
│ [Live diff preview]             │
└─────────────────────────────────┘
```

**User never sees:**
- ❌ "continue" message in chat
- ❌ Need to click Continue button
- ❌ Confusion about whether it's working

**User sees:**
- ✅ "Editing..." immediately
- ✅ Seamless transition to actual tool execution
- ✅ Professional, polished experience

## Benefits

### 1. **Immediate Visual Feedback**
Users see that the LLM is about to act, even before the tool call happens

### 2. **Reduced Confusion**
No more wondering "Is it stuck?" or "Do I need to click Continue?"

### 3. **Better UX for Chatty Models**
Some models (like kimi-k2) are verbose and announce their actions - this makes that behavior feel intentional and professional

### 4. **Anticipatory UI**
Shows the user what's coming next, preparing them for the action

### 5. **Silent Auto-Continue**
System automatically prompts LLM to execute the action without cluttering chat history with "continue" messages

### 6. **Works with Message Queue**
If user sends a follow-up while "Editing..." is shown, it gets queued properly

## Edge Cases Handled

### 1. **False Positives**
Pattern only triggers if:
- Text ends with `:` (colon)
- Matches specific action verbs
- LLM is currently running (`isRunning === 'LLM'`)

### 2. **Multiple Colons**
Only checks the last sentence/phrase before the final colon

### 3. **Actual Tool Call**
If actual tool call comes through, it takes priority over the pattern

### 4. **Tool Execution**
Once tool starts executing, switches from "Editing..." to actual `EditToolSoFar` UI

## Testing

### Test Case 1: Basic Pattern
1. LLM says: "Let me edit the file:"
2. **Expected:** Shows "Editing..." with spinner
3. **Expected:** When tool call comes through, shows full `EditToolSoFar` UI

### Test Case 2: I'll Pattern
1. LLM says: "I'll read the configuration file:"
2. **Expected:** Shows "Reading..." with spinner

### Test Case 3: No Colon
1. LLM says: "Let me edit the file"
2. **Expected:** No anticipatory UI (no colon)

### Test Case 4: Mid-Sentence Colon
1. LLM says: "The file has: some content. Let me edit it:"
2. **Expected:** Detects "Let me edit it:" (last phrase)

### Test Case 5: Tool Already Executing
1. Tool is running
2. **Expected:** Shows actual tool UI, not anticipatory UI

## Files Modified
- `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- `/src/vs/workbench/contrib/void/browser/react/src2/sidebar-tsx/SidebarChat.tsx`

## Future Enhancements

### 1. **More Patterns**
Add detection for:
- "Now I'll..."
- "Next, I'll..."
- "First, let me..."

### 2. **File Name Extraction**
Parse the announcement to extract file names:
- "Let me edit `main.js`:" → Show "Editing main.js..."

### 3. **Multi-Step Detection**
- "First, let me read the file. Then I'll edit it:"
- Show sequence: "Reading..." → "Editing..."

### 4. **Confidence Scoring**
- Strong match: Show full UI
- Weak match: Show subtle indicator

## Technical Notes

- Pattern detection runs on every LLM text update
- Regex patterns are case-insensitive
- Only triggers when `isRunning === 'LLM'` (not during tool execution)
- Falls back gracefully if pattern doesn't match
- Zero performance impact (simple regex on small text)

## Result
Users now get immediate, clear visual feedback when the LLM announces it's about to perform an action, making the experience feel more responsive and professional!
