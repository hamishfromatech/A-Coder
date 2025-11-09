# Message Queue System

## Overview
Implemented a message queue system that allows users to send follow-up messages while the LLM is actively working (editing files, running tools, etc.). Messages are queued and automatically processed after the current operation completes.

## Problem Solved
**Before:** If a user tried to send a message while the LLM was working, the current operation would be aborted, losing progress.

**After:** Messages are queued and processed sequentially, preserving all work and allowing natural conversation flow.

## Implementation

### Core Components

#### 1. Message Queue Storage
**File:** `chatThreadService.ts` line 358

```typescript
private readonly messageQueue: { 
  [threadId: string]: Array<{ 
    userMessage: string, 
    selections?: StagingSelectionItem[] 
  }> 
} = {}
```

- One queue per thread
- Stores message content and any file selections
- In-memory only (not persisted)

#### 2. Queue Management Methods

**`_queueMessage()`** - Adds message to queue
- Called when user sends message while LLM is running
- Fires `onDidChangeCurrentThread` event to update UI
- Logs queue length for debugging

**`_hasQueuedMessages()`** - Checks if queue has messages
- Used to determine if auto-continue should process queue
- Returns boolean

**`_processNextQueuedMessage()`** - Processes next queued message
- Shifts message from queue
- Calls `_addUserMessageAndStreamResponse()` to process it
- Recursive: if more messages in queue, they'll be processed after this one completes

**`getQueuedMessagesCount()`** - Public API for UI
- Returns number of queued messages for a thread
- Used to show queue indicator in UI

**`clearMessageQueue()`** - Public API to clear queue
- Useful for "stop" or "cancel" actions
- Fires event to update UI

### 3. Integration Points

#### A. Message Submission (line 1427-1443)
```typescript
async addUserMessageAndStreamResponse({ userMessage, _chatSelections, threadId }) {
  const isRunning = this.streamState[threadId]?.isRunning;
  
  if (isRunning) {
    // Queue instead of aborting
    this._queueMessage(threadId, userMessage, _chatSelections);
    return;
  }
  
  // Process immediately if not running
  await this._addUserMessageAndStreamResponse({ userMessage, _chatSelections, threadId });
}
```

**Key change:** Instead of aborting the current operation, messages are now queued.

#### B. Auto-Continue Integration (line 1040-1049)
```typescript
else {
  console.log(`[chatThreadService] Text-only response, stopping`)
  justCompletedToolCall = false
  
  // Check if there are queued messages to process
  if (this._hasQueuedMessages(threadId)) {
    console.log(`[chatThreadService] Found queued messages, will process next`)
    shouldSendAnotherMessage = true
  }
}
```

**Behavior:** After LLM completes a response, check if there are queued messages. If yes, continue the loop to process them.

#### C. Post-Loop Processing (line 1063-1066)
```typescript
// Process next queued message if any
if (!isRunningWhenEnd) {
  await this._processNextQueuedMessage(threadId)
}
```

**Ensures:** Queued messages are processed even if auto-continue logic didn't trigger.

## Flow Diagrams

### Normal Flow (No Queue)
```
User sends message
     ↓
isRunning? No
     ↓
Process immediately
     ↓
LLM responds
     ↓
Done
```

### Queued Flow
```
User sends message #1
     ↓
isRunning? No
     ↓
Process message #1
     ↓
LLM working... (isRunning = 'tool')
     ↓
User sends message #2
     ↓
isRunning? Yes → Queue message #2
     ↓
LLM completes message #1
     ↓
Check queue → Found message #2
     ↓
Process message #2
     ↓
LLM working...
     ↓
LLM completes message #2
     ↓
Check queue → Empty
     ↓
Done
```

### Multiple Queued Messages
```
LLM working on message #1
     ↓
User sends #2 → Queued [#2]
User sends #3 → Queued [#2, #3]
User sends #4 → Queued [#2, #3, #4]
     ↓
Message #1 completes
     ↓
Process #2 (queue: [#3, #4])
     ↓
Message #2 completes
     ↓
Process #3 (queue: [#4])
     ↓
Message #3 completes
     ↓
Process #4 (queue: [])
     ↓
Message #4 completes
     ↓
Done
```

## UI Integration (To Be Implemented)

### Recommended UI Elements

#### 1. Queue Indicator
Show when messages are queued:
```tsx
{queuedCount > 0 && (
  <div className="queue-indicator">
    {queuedCount} message{queuedCount > 1 ? 's' : ''} queued
  </div>
)}
```

#### 2. Clear Queue Button
Allow users to clear the queue:
```tsx
{queuedCount > 0 && (
  <button onClick={() => chatThreadsService.clearMessageQueue(threadId)}>
    Clear Queue ({queuedCount})
  </button>
)}
```

#### 3. Input State
Show that message will be queued:
```tsx
{isRunning && (
  <div className="input-hint">
    Message will be queued and sent after current operation completes
  </div>
)}
```

### Usage in React Component
```tsx
const queuedCount = chatThreadsService.getQueuedMessagesCount(threadId);

// Show queue indicator
if (queuedCount > 0) {
  return (
    <div className="flex items-center gap-2">
      <Clock size={14} />
      <span>{queuedCount} queued</span>
      <button onClick={() => chatThreadsService.clearMessageQueue(threadId)}>
        Clear
      </button>
    </div>
  );
}
```

## Benefits

### 1. **No Lost Work**
- LLM operations are never aborted mid-execution
- All file edits complete successfully
- Tool calls finish properly

### 2. **Natural Conversation Flow**
- Users can send follow-ups without waiting
- Feels more like a real conversation
- Reduces friction in the UX

### 3. **Predictable Behavior**
- Messages are processed in order (FIFO)
- Clear queue state
- Deterministic execution

### 4. **Better for Long Operations**
- Users can queue multiple refinements while LLM works
- Particularly useful for file editing operations
- Reduces back-and-forth time

## Edge Cases Handled

### 1. **Queue During Tool Execution**
- Tool completes → Check queue → Process next message
- Works for both native and XML tools

### 2. **Queue During Auto-Continue**
- Auto-continue detects queued messages
- Processes queue instead of stopping
- Seamless integration

### 3. **Multiple Messages Queued**
- Processed sequentially (FIFO)
- Each message gets full LLM attention
- No message is lost

### 4. **User Aborts**
- Can clear queue manually
- Abort stops current operation
- Queue remains intact unless explicitly cleared

## Testing

### Test Case 1: Basic Queue
1. Send message #1 (starts LLM)
2. While LLM is working, send message #2
3. **Expected:** Message #2 is queued
4. **Expected:** After #1 completes, #2 is automatically processed

### Test Case 2: Multiple Queued Messages
1. Send message #1 (starts LLM)
2. Queue messages #2, #3, #4
3. **Expected:** All messages processed in order
4. **Expected:** No messages lost

### Test Case 3: Queue with Tool Execution
1. Ask LLM to edit a file
2. While file is being edited, send follow-up
3. **Expected:** Follow-up is queued
4. **Expected:** After edit completes, follow-up is processed

### Test Case 4: Clear Queue
1. Queue several messages
2. Click "Clear Queue"
3. **Expected:** Queue is emptied
4. **Expected:** Only current operation completes

## Future Enhancements

### 1. **Queue Persistence**
- Save queue to storage
- Restore on reload
- Useful for long-running operations

### 2. **Queue Reordering**
- Allow users to reorder queued messages
- Drag-and-drop interface
- Priority system

### 3. **Queue Preview**
- Show preview of queued messages
- Edit queued messages before they're processed
- Remove individual messages from queue

### 4. **Smart Queue Management**
- Detect duplicate/similar messages
- Merge related messages
- Suggest consolidation

## Console Logging

All queue operations are logged for debugging:

```
[chatThreadService] Thread abc123 is currently running. Queueing message.
[chatThreadService] Queued message for thread abc123. Queue length: 1
[chatThreadService] Found queued messages, will process next
[chatThreadService] Processing queued message. Remaining in queue: 0
```

## Files Modified
- `/src/vs/workbench/contrib/void/browser/chatThreadService.ts`
  - Added `messageQueue` property
  - Added queue management methods
  - Integrated with auto-continue
  - Updated interface

## API Summary

### Public Methods
```typescript
interface IChatThreadService {
  // Get number of queued messages for a thread
  getQueuedMessagesCount(threadId: string): number;
  
  // Clear all queued messages for a thread
  clearMessageQueue(threadId: string): void;
}
```

### Events
- `onDidChangeCurrentThread` - Fires when queue changes
- Use to update UI indicators

## Notes
- Queue is in-memory only (not persisted across sessions)
- Messages are processed FIFO (first in, first out)
- Queue is per-thread (each thread has its own queue)
- Auto-continue is queue-aware (checks queue before stopping)
