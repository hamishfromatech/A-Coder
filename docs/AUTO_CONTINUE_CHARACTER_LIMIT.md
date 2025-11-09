# Auto-Continue Character Limit Implementation

## Summary
Implemented a character length check for the user-facing auto-continue feature to match the existing "silent" auto-continue behavior. Auto-continuation now only occurs if the last assistant response is less than 200 characters.

**IMPORTANT:** The "silent" auto-continue (after tool calls) is truly silent - it does NOT add a "continue" message to the chat history. Only the user-facing auto-continue toggle shows "continue" messages.

## Changes Made

### 1. Silent Auto-Continue (Already Existed)
**File:** `src/vs/workbench/contrib/void/browser/chatThreadService.ts` (line 1027)
- Automatically sends "continue" after tool calls if response < 200 chars
- Prevents models from stopping after saying "let me check..." without providing actual response

### 2. User Auto-Continue (Updated)
**Files:**
- `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- `src/vs/workbench/contrib/void/browser/react/src2/sidebar-tsx/SidebarChat.tsx`

**Changes:**
1. **ContinueButton Component** (lines 480, 533-551):
   - Added `lastResponseLength` parameter
   - Modified auto-continue logic to check `lastResponseLength < 200`
   - Added console logging for debugging

2. **ContinueButton Usage** (lines 3495-3514):
   - Calculate `lastResponseLength` from last assistant message
   - Pass length to ContinueButton component

## Behavior

### Before
- User auto-continue would trigger regardless of response length
- Could create infinite loops with long responses

### After
- User auto-continue only triggers if response < 200 characters
- Matches silent auto-continue behavior
- Prevents infinite loops
- Console logs show when auto-continue is triggered or skipped

## Example Console Output
```
[ContinueButton] Auto-continuing (response length: 45 chars)
[ContinueButton] Skipping auto-continue (response length: 523 chars >= 200)
```

## Testing
1. Enable auto-continue in the Continue button settings menu
2. Send a message that results in a short response (< 200 chars)
   - Auto-continue should trigger
3. Send a message that results in a long response (>= 200 chars)
   - Auto-continue should NOT trigger
   - Continue button remains visible for manual use
