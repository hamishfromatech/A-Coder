# Double-Tap Enter to Force Send

## Feature
Press Enter twice quickly (within 500ms) to force send a message and abort the current operation. This is useful for interrupting the LLM during tool execution, tool approval, or any running state.

## Use Cases

### 1. **During Tool Approval**
```
LLM: "I need approval to edit file.js"
[Waiting for approval]
User types: "Actually, just read it instead"
User: Enter Enter (double-tap)
→ Aborts approval wait
→ Sends new message immediately
```

### 2. **During Tool Execution**
```
LLM: [Editing file...]
User types: "Stop, that's wrong!"
User: Enter Enter (double-tap)
→ Aborts tool execution
→ Sends correction immediately
```

### 3. **During LLM Response**
```
LLM: [Generating long response...]
User types: "Skip to the solution"
User: Enter Enter (double-tap)
→ Stops generation
→ Sends new instruction
```

## Implementation

### Detection Logic
```typescript
const lastEnterPressRef = useRef<number>(0);
const DOUBLE_TAP_THRESHOLD = 500; // ms

const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    const now = Date.now();
    const timeSinceLastEnter = now - lastEnterPressRef.current;
    
    // Double-tap Enter: Force send and abort current operation
    if (timeSinceLastEnter < DOUBLE_TAP_THRESHOLD && isRunning) {
      console.log('[SidebarChat] Double-tap Enter detected - forcing send');
      e.preventDefault();
      lastEnterPressRef.current = 0; // Reset
      
      // Abort current operation first
      onAbort().then(() => {
        // Small delay to ensure abort completes
        setTimeout(() => {
          onSubmit();
        }, 100);
      });
    } else {
      // Single Enter: Normal submit (or queue if running)
      lastEnterPressRef.current = now;
      onSubmit();
    }
  }
}, [onSubmit, onAbort, isRunning]);
```

## Behavior

### Single Enter
**When NOT running:**
- Sends message immediately

**When running:**
- Queues message (processed after current operation)
- Updates `lastEnterPressRef` for double-tap detection

### Double Enter (< 500ms apart)
**When running:**
1. Detects double-tap
2. Prevents default (no queue)
3. Aborts current operation
4. Waits 100ms for abort to complete
5. Sends message immediately
6. Resets double-tap timer

**When NOT running:**
- Acts as two separate single Enters
- Sends message twice (normal behavior)

## Timing

**Threshold:** 500ms between Enter presses

**Why 500ms?**
- Fast enough to feel intentional
- Slow enough to avoid accidental triggers
- Standard double-click timing

**Abort Delay:** 100ms
- Ensures abort operation completes
- Prevents race conditions
- Allows UI to update

## User Feedback

### Console Logging
```
[SidebarChat] Double-tap Enter detected - forcing send and aborting current operation
```

### Visual Feedback
- Current operation stops immediately
- Loading indicators disappear
- New message appears in chat
- LLM starts processing new message

## Edge Cases

### 1. **First Enter Queues, Second Enter Force Sends**
```
LLM: [Running]
User: Enter (queues message)
User: Enter (< 500ms) → Force send!
Result: Aborts, sends immediately (queue is cleared)
```

### 2. **Shift+Enter (New Line)**
```
User: Shift+Enter (new line)
User: Enter (< 500ms)
Result: Normal send (Shift+Enter doesn't count)
```

### 3. **IME Composition (Asian Languages)**
```
User: Enter while composing
Result: Ignored (e.nativeEvent.isComposing check)
```

### 4. **Not Running**
```
LLM: [Idle]
User: Enter Enter
Result: Sends message twice (no force send needed)
```

## Integration with Message Queue

### Normal Flow (Single Enter)
```
LLM: [Running]
User: Types message
User: Enter (single)
→ Message queued
→ Will send after current operation
```

### Force Send Flow (Double Enter)
```
LLM: [Running]
User: Types message
User: Enter Enter (double)
→ Aborts current operation
→ Clears queue
→ Sends immediately
```

## Comparison with Other Actions

| Action | Effect | When Available |
|--------|--------|----------------|
| **Single Enter** | Send/Queue | Always |
| **Double Enter** | Abort + Force Send | When running |
| **Escape** | Abort only | When running |
| **Stop Button** | Abort only | When running |
| **Send Button** | Send/Queue | Always |

## Files Modified
- `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- `/src/vs/workbench/contrib/void/browser/react/src2/sidebar-tsx/SidebarChat.tsx`

## Testing

### Test Case 1: Double-Tap During Tool Execution
1. Ask LLM to edit a file
2. While editing, type new message
3. Press Enter twice quickly
4. **Expected:** Tool execution stops, new message sent immediately

### Test Case 2: Double-Tap During Approval
1. LLM requests approval for tool
2. Type new message
3. Press Enter twice quickly
4. **Expected:** Approval cancelled, new message sent

### Test Case 3: Single Enter While Running
1. LLM is working
2. Type message
3. Press Enter once
4. **Expected:** Message queued, not sent immediately

### Test Case 4: Slow Double Enter
1. LLM is working
2. Press Enter
3. Wait 600ms
4. Press Enter again
5. **Expected:** Two separate single Enters (queue twice)

### Test Case 5: Triple Enter
1. LLM is working
2. Press Enter three times quickly
3. **Expected:** First two trigger force send, third is ignored

## Result
Users can now interrupt any operation by double-tapping Enter, providing a quick way to course-correct or stop unwanted actions! 🎉
