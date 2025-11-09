# Code Execution Implementation Status

## Overview
Implementing Anthropic's "Code Execution with MCP" pattern for 98% token reduction in A-Coder.

## What's Been Built ✅

### 1. Core Infrastructure
- ✅ **CodeExecutionService** (`electron-main/codeExecutionService.ts`)
  - Uses `isolated-vm` for secure sandboxed execution
  - Memory limits (128MB default)
  - Timeout protection (30s default)
  - Console logging capture
  - Tool wrapper system ready

- ✅ **CodeExecutionChannel** (`electron-main/codeExecutionChannel.ts`)
  - IPC channel for browser → electron-main communication
  - Accepts code and options
  - Returns execution results

- ✅ **Tool Definition** (`prompts.ts`)
  - `run_code` tool added with comprehensive description
  - Examples showing multi-tool workflows
  - Clear guidance on when to use vs direct tool calls

- ✅ **Type Definitions** (`toolsServiceTypes.ts`)
  - `run_code` params and result types
  - Proper TypeScript support

- ✅ **Tool Validation** (`toolsService.ts`)
  - Parameter validation for `run_code`
  - Placeholder implementation (throws "not yet implemented")
  - Result stringification

## What's Left to Implement 🚧

### 2. IPC Tool Callback Loop (CRITICAL)
**Status:** Architecture in place, needs implementation

**Current State:**
- Sandbox can call `tools.readFile()` etc.
- Calls trigger `toolCallback` function
- Callback currently throws "not yet implemented"

**What's Needed:**
```typescript
// In CodeExecutionChannel
const toolCallback = async (toolName: string, params: any) => {
  // 1. Send IPC message to browser process
  // 2. Browser's toolsService executes the real tool
  // 3. Wait for result via IPC
  // 4. Return result to sandbox
  // 5. Sandbox continues execution
};
```

**Implementation Steps:**
1. Create event emitter in CodeExecutionChannel
2. Browser listens for `toolCall` events
3. Browser executes tool and sends result back
4. Channel resolves promise with result
5. Sandbox receives result and continues

### 3. Browser-Side Integration
**File:** `browser/toolsService.ts`

**Current:** Placeholder that throws error

**Needed:**
```typescript
run_code: async ({ code, timeout }) => {
  // 1. Get IPC channel to electron-main
  // 2. Send executeCode command with code + toolCallbackId
  // 3. Listen for toolCall events from electron-main
  // 4. When toolCall received, execute actual tool
  // 5. Send result back to electron-main
  // 6. Wait for final execution result
  // 7. Return to LLM
}
```

### 4. Channel Registration
**File:** `electron-main/app.ts`

**Needed:**
```typescript
// Around line 1240 (after other Void channels)
const codeExecutionChannel = new CodeExecutionChannel();
mainProcessElectronServer.registerChannel('void-channel-code-execution', codeExecutionChannel);
```

### 5. System Prompts (Optional Enhancement)
**File:** `prompts.ts`

**Consider Adding:**
- Examples of code-first patterns in system message
- Guidance on when to use `run_code` vs direct tools
- Best practices for composing operations

## Architecture Diagram

```
┌─────────────┐
│   Browser   │
│  (Renderer) │
└──────┬──────┘
       │ IPC: executeCode(code, toolCallbackId)
       ▼
┌─────────────────┐
│  Electron-Main  │
│ CodeExecution   │
│    Channel      │
└────────┬────────┘
         │ toolCallback provided
         ▼
┌──────────────────┐
│  isolated-vm     │
│    Sandbox       │
│                  │
│  tools.readFile()│◄─┐
│  tools.editFile()│  │ IPC callback
│  etc.            │  │ (to be implemented)
└──────────────────┘  │
         │            │
         └────────────┘
```

## Benefits Once Complete

### Token Reduction
- **Before:** 150,000 tokens (data passes through model)
- **After:** 2,000 tokens (98.7% reduction)

### Use Cases
1. **Multi-file processing**
   ```typescript
   const files = await tools.searchFiles('*.ts');
   let count = 0;
   for (const file of files) {
     const content = await tools.readFile(file);
     if (content.includes('TODO')) count++;
   }
   return { filesWithTodos: count };
   ```

2. **Large data filtering**
   ```typescript
   const content = await tools.readFile('large.json');
   const data = JSON.parse(content);
   const active = data.filter(item => item.status === 'active');
   return { count: active.length, sample: active.slice(0, 3) };
   ```

3. **Complex workflows**
   ```typescript
   const errors = await tools.readLintErrors('app.ts');
   const critical = errors.filter(e => e.severity === 'error');
   for (const error of critical) {
     // Fix each error programmatically
   }
   ```

## Security

### ✅ Implemented
- Memory limits (128MB)
- Execution timeouts (30s)
- Isolated V8 context
- No direct file system access
- No network access
- No process spawning

### ✅ Safe
- Tools only accessible via IPC callbacks
- All tool calls go through browser's toolsService
- Same security model as direct tool calling
- User approval still required for edits/terminal

## Next Steps

1. **Implement IPC callback loop** (highest priority)
2. **Register channel in app.ts**
3. **Wire up browser-side integration**
4. **Test with simple code execution**
5. **Test with tool calling**
6. **Add to system prompts**
7. **Document for users**

## Testing Plan

### Phase 1: Basic Execution
```typescript
// No tools, just code
const code = `
  const sum = [1, 2, 3].reduce((a, b) => a + b, 0);
  return { sum };
`;
```

### Phase 2: Single Tool
```typescript
const code = `
  const content = await tools.readFile('/path/to/file.ts');
  return { length: content.length };
`;
```

### Phase 3: Multiple Tools
```typescript
const code = `
  const files = await tools.searchFiles('*.ts');
  const results = [];
  for (const file of files) {
    const content = await tools.readFile(file);
    results.push({ file, lines: content.split('\\n').length });
  }
  return results;
`;
```

### Phase 4: Complex Workflow
```typescript
const code = `
  // Read, process, and edit multiple files
  const files = await tools.searchFiles('*.ts');
  for (const file of files) {
    const content = await tools.readFile(file);
    if (content.includes('deprecated')) {
      await tools.editFile(file, replacementBlocks);
    }
  }
  return { filesUpdated: count };
`;
```

## Dependencies

- ✅ `isolated-vm` - Installed
- ✅ `ivm` types - Built-in with package

## Estimated Completion Time

- IPC callback loop: 2-3 hours
- Browser integration: 1-2 hours
- Testing: 1-2 hours
- **Total: 4-7 hours**

## References

- [Anthropic's Code Execution with MCP](https://www.marktechpost.com/2025/11/08/anthropic-turns-mcp-agents-into-code-first-systems-with-code-execution-with-mcp-approach/)
- [Cloudflare Workers Code Mode](https://blog.cloudflare.com/workers-ai-code-mode/)
- [isolated-vm Documentation](https://github.com/laverdet/isolated-vm)
