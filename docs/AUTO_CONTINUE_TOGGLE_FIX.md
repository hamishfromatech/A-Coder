# Auto-Continue Toggle Fix

## Problem
When user toggles auto-continue ON, it doesn't actually trigger the continue action.

## Root Cause
The `hasAutoTriggeredRef` flag wasn't being reset when the toggle changed from OFF to ON. 

### The Flow (Broken)
```
1. User sees Continue button (LLM finished with short response)
2. User clicks toggle to enable auto-continue
3. useEffect runs BUT hasAutoTriggeredRef.current is already true (from previous render)
4. Auto-continue is skipped ❌
5. User has to manually click Continue
```

## Solution
Track the previous state of `autoContinue` and reset the trigger flag when it changes from `false` to `true`.

### Code Fix
```typescript
const hasAutoTriggeredRef = useRef(false);
const prevAutoContinueRef = useRef(autoContinue);

useEffect(() => {
  // Reset flag when auto-continue is toggled on (false -> true)
  if (autoContinue && !prevAutoContinueRef.current) {
    hasAutoTriggeredRef.current = false;
    console.log(`[ContinueButton] Auto-continue enabled, resetting trigger flag`);
  }
  prevAutoContinueRef.current = autoContinue;
  
  if (autoContinue && !hasAutoTriggeredRef.current && lastResponseLength < 200) {
    hasAutoTriggeredRef.current = true;
    console.log(`[ContinueButton] Auto-continuing (response length: ${lastResponseLength} chars)`);
    setTimeout(() => {
      onContinue();
    }, 100);
  }
  // ...
}, [autoContinue, onContinue, lastResponseLength]);
```

### The Flow (Fixed)
```
1. User sees Continue button (LLM finished with short response)
2. User clicks toggle to enable auto-continue
3. useEffect detects: autoContinue=true && prevAutoContinue=false
4. Resets hasAutoTriggeredRef.current = false ✅
5. Auto-continue triggers immediately ✅
6. "continue" message sent to LLM
```

## How It Works

### State Tracking
- `autoContinue`: Current toggle state (from localStorage)
- `prevAutoContinueRef`: Previous toggle state (from last render)
- `hasAutoTriggeredRef`: Whether we've already triggered for this response

### Detection Logic
```typescript
if (autoContinue && !prevAutoContinueRef.current) {
  // Toggle just changed from OFF to ON
  hasAutoTriggeredRef.current = false; // Reset flag
}
```

### Trigger Logic
```typescript
if (autoContinue && !hasAutoTriggeredRef.current && lastResponseLength < 200) {
  // All conditions met:
  // 1. Toggle is ON
  // 2. Haven't triggered yet for this response
  // 3. Response is short enough
  hasAutoTriggeredRef.current = true;
  onContinue(); // Trigger!
}
```

## Testing

### Test Case 1: Toggle ON with Short Response
1. LLM gives short response (< 200 chars)
2. Continue button appears
3. User toggles auto-continue ON
4. **Expected:** Immediately sends "continue"
5. **Expected:** Console log: "Auto-continue enabled, resetting trigger flag"
6. **Expected:** Console log: "Auto-continuing (response length: X chars)"

### Test Case 2: Toggle ON with Long Response
1. LLM gives long response (>= 200 chars)
2. Continue button appears
3. User toggles auto-continue ON
4. **Expected:** Does NOT auto-continue
5. **Expected:** Console log: "Skipping auto-continue (response length: X chars >= 200)"

### Test Case 3: Toggle Already ON
1. Auto-continue already enabled from previous session
2. LLM gives short response
3. **Expected:** Auto-continues immediately (no manual toggle needed)

### Test Case 4: Toggle OFF
1. Auto-continue is ON
2. User toggles it OFF
3. LLM gives short response
4. **Expected:** Does NOT auto-continue
5. **Expected:** Continue button remains visible for manual use

## Edge Cases Handled

### 1. **Rapid Toggle Changes**
- User toggles ON → OFF → ON quickly
- Each ON transition resets the flag
- Works correctly

### 2. **Component Re-renders**
- Component re-renders for other reasons
- `prevAutoContinueRef` tracks actual state changes
- Only resets on actual toggle change

### 3. **Multiple Responses**
- LLM gives response #1 (short)
- Auto-continues
- LLM gives response #2 (short)
- Auto-continues again
- Each response gets its own trigger

### 4. **Page Reload**
- Auto-continue state persists in localStorage
- On reload, if toggle is ON and response is short
- Auto-continues as expected

## Console Logging

**When toggle is enabled:**
```
[ContinueButton] Auto-continue enabled, resetting trigger flag
[ContinueButton] Auto-continuing (response length: 42 chars)
```

**When response is too long:**
```
[ContinueButton] Auto-continue enabled, resetting trigger flag
[ContinueButton] Skipping auto-continue (response length: 250 chars >= 200)
```

**When already triggered:**
```
(no logs - already triggered for this response)
```

## Files Modified
- `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- `/src/vs/workbench/contrib/void/browser/react/src2/sidebar-tsx/SidebarChat.tsx`

## Result
Auto-continue toggle now works immediately when enabled! Users can toggle it ON and the system will automatically send "continue" if the response is short enough.
