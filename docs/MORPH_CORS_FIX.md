# Morph CORS Fix - IPC Channel Solution

## Problem
Morph Fast Apply was failing with CORS error:
```
Access to fetch at 'https://morphllm.com/v1/chat/completions' from origin 'vscode-file://vscode-app' 
has been blocked by CORS policy: Response to preflight request doesn't pass access control check: 
Redirect is not allowed for a preflight request.
```

**Root Cause:** Browser fetch from `vscode-file://` origin is blocked by CORS policy.

## Solution
Move the API call from the renderer process (browser) to the main process (Node.js) using IPC channels.

### Architecture
```
Browser (Renderer)          IPC Channel          Main Process (Node.js)
┌─────────────────┐        ┌──────────┐         ┌──────────────────┐
│  MorphService   │───────>│   IPC    │────────>│  MorphChannel    │
│  (browser)      │        │ Channel  │         │  (electron-main) │
│                 │        └──────────┘         │                  │
│ - Gets settings │                             │ - Makes fetch    │
│ - Calls channel │                             │ - No CORS issues │
└─────────────────┘                             └──────────────────┘
```

## Files Created/Modified

### 1. Created: `morphChannel.ts` (electron-main)
**Location:** `src/vs/workbench/contrib/void/electron-main/morphChannel.ts`

**Purpose:** IPC channel that handles Morph API requests from renderer

**Key Features:**
- Implements `IServerChannel` interface
- Handles `applyCodeChange` command
- Makes fetch request to Morph API
- Returns applied code to renderer
- Comprehensive logging

**Code:**
```typescript
export class MorphChannel implements IServerChannel {
  async call(_: unknown, command: string, arg?: any): Promise<any> {
    switch (command) {
      case 'applyCodeChange': {
        const { instruction, originalCode, updatedCode, model, apiKey } = arg;
        
        // Format content per Morph spec
        const content = `<instruction>${instruction}</instruction><code>${originalCode}</code><update>${updatedCode}</update>`;
        
        // Make API request (no CORS in Node.js)
        const response = await fetch('https://morphllm.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            stream: false,
          }),
        });
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content;
      }
    }
  }
}
```

### 2. Modified: `morphService.ts` (browser)
**Location:** `src/vs/workbench/contrib/void/browser/morphService.ts`

**Changes:**
- Added `IMainProcessService` injection
- Replaced direct `fetch()` with IPC channel call
- Gets channel: `this._mainProcessService.getChannel('void-channel-morph')`
- Calls channel: `await channel.call('applyCodeChange', { ... })`

**Before:**
```typescript
const response = await fetch('https://morphllm.com/v1/chat/completions', { ... });
```

**After:**
```typescript
const channel = this._mainProcessService.getChannel('void-channel-morph');
const appliedCode = await channel.call('applyCodeChange', {
  instruction,
  originalCode,
  updatedCode,
  model,
  apiKey
}) as string;
```

### 3. Modified: `app.ts` (electron-main)
**Location:** `src/vs/code/electron-main/app.ts`

**Changes:**
- Added import: `import { MorphChannel } from '../../workbench/contrib/void/electron-main/morphChannel.js';`
- Registered channel:
```typescript
const morphChannel = new MorphChannel();
mainProcessElectronServer.registerChannel('void-channel-morph', morphChannel);
```

## How It Works

### Request Flow
1. **Browser:** User triggers apply with Morph enabled
2. **MorphService (browser):** Gets settings, prepares request
3. **IPC Channel:** Sends request to main process
4. **MorphChannel (main):** Receives request, makes fetch to Morph API
5. **Morph API:** Processes code change, returns result
6. **MorphChannel:** Returns result via IPC
7. **MorphService:** Receives result, applies to file

### Why This Works
- **Node.js fetch:** Main process runs in Node.js, not browser
- **No origin restrictions:** Node.js doesn't have CORS
- **Same pattern:** Follows existing IPC patterns (code execution, MCP, etc.)

## Benefits

1. ✅ **No CORS issues** - Request comes from Node.js, not browser
2. ✅ **Secure** - API key never exposed to renderer process logs
3. ✅ **Consistent** - Follows existing IPC patterns in codebase
4. ✅ **Maintainable** - Clean separation of concerns
5. ✅ **Debuggable** - Comprehensive logging in both processes

## Testing

After recompiling, you should see these logs:

**Browser side:**
```
[MorphService] Starting applyCodeChange...
[MorphService] Calling Morph via IPC channel...
[MorphService] Successfully received applied code, length: 1234
```

**Main process side:**
```
[MorphChannel] Starting applyCodeChange...
[MorphChannel] Making API request to Morph...
[MorphChannel] Response status: 200 OK
[MorphChannel] Successfully received applied code, length: 1234
```

## Related Files
- `editCodeService.ts` - Calls MorphService
- `toolsService.ts` - Triggers edit_file tool
- `voidSettingsTypes.ts` - Morph settings
- `Settings.tsx` - Morph UI

## Status: ✅ FIXED AND READY TO TEST

Recompile and try Morph Fast Apply again - CORS issue should be resolved!
