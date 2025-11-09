# Tool Calling Fix Plan

## Problem
LLM is not making tool calls. Log shows: `"hasToolCall":false`

## Root Causes (Possible)

### 1. **Chat Mode Not Set to 'agent' or 'gather'**
Tools are only available in `agent` and `gather` modes:

```typescript
// prompts.ts - availableTools()
export const availableTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {
    if (chatMode !== 'agent' && chatMode !== 'gather') return null
    // ... returns tools
}
```

**Fix**: Ensure you're in agent or gather mode when expecting tool calls.

### 2. **Tools Not Being Sent to API**
Even if tools are defined, they might not be included in the API request.

**Check**: Look for these logs after rebuild:
```
[sendLLMMessage] OpenAI-compatible - chatMode: agent, tools count: 15, model: ..., provider: ...
[sendLLMMessage] Tool names: read_file, edit_file, rewrite_file, ...
```

If you see:
```
[sendLLMMessage] ⚠️ NO TOOLS - chatMode: normal, mcpTools: 0
```
Then chatMode is wrong.

### 3. **Model Doesn't Support Tool Calling**
Some models don't have `specialToolFormat` defined and rely on XML (which we removed).

**Check**: Look in `modelCapabilities.ts` for your model:
```typescript
'your-model-name': {
    specialToolFormat: 'openai-style',  // ✅ Supports native tool calling
    // OR
    // specialToolFormat: undefined      // ❌ Would need XML (removed)
}
```

### 4. **Provider-Specific Tool Format Mismatch**

For Anthropic models, tools are only sent if `specialToolFormat === 'anthropic-style'`:
```typescript
const nativeToolsObj = potentialTools && specialToolFormat === 'anthropic-style' ?
    { tools: potentialTools, tool_choice: { type: 'auto' } } as const
    : {}
```

**Check**: Look for this log:
```
[sendLLMMessage] ⚠️ TOOLS NOT SENT - specialToolFormat is undefined, expected 'anthropic-style'
```

## Diagnostic Steps

### Step 1: Check Chat Mode
1. Rebuild: `npm run buildreact`
2. Start a new chat
3. Look for log: `[sendLLMMessage] OpenAI-compatible - chatMode: ???`
4. If chatMode is `normal`, switch to `agent` mode in UI

### Step 2: Check Tools Are Sent
Look for these logs:
```
[sendLLMMessage] Request options: {"model":"...","messageCount":2,"hasTools":true,"toolCount":15,"stream":true}
```

If `hasTools: false` or `toolCount: 0`, tools aren't being sent.

### Step 3: Check Model Capabilities
1. Find your model in `modelCapabilities.ts`
2. Check if it has `specialToolFormat` defined
3. If undefined, the model doesn't support native JSON tool calling

## Fixes

### Fix 1: Ensure Agent Mode
Make sure you're using the chat in `agent` or `gather` mode, not `normal` mode.

### Fix 2: Add Missing specialToolFormat
If your model doesn't have `specialToolFormat`, add it to `modelCapabilities.ts`:

```typescript
'your-model-name': {
    contextWindow: 128_000,
    cost: { input: 0.00, output: 0.00 },
    downloadable: false,
    supportsFIM: false,
    specialToolFormat: 'openai-style',  // ADD THIS
    supportsSystemMessage: 'system-role',
    reasoningCapabilities: false,
}
```

### Fix 3: Force Tool Calling (if model supports it)
Some models support tool calling but don't use it reliably. You can force it by adding `tool_choice`:

```typescript
// In sendLLMMessage.impl.ts for OpenAI-compatible
const options = {
    model: modelName,
    messages: messages as any,
    stream: true,
    ...nativeToolsObj,
    tool_choice: 'auto',  // Force tool calling
    ...additionalOpenAIPayload
}
```

### Fix 4: Check System Message
The system message should NOT tell the LLM to avoid tool calling. Check that this instruction is present:

```typescript
// In prompts.ts - chat_systemMessage()
if (mode === 'agent' || mode === 'gather') {
    details.push(`Only call tools if they help you accomplish the user's goal...`)
    details.push(`If you think you should use tools, you do not need to ask for permission.`)
    // ... more tool instructions
}
```

## Testing

After applying fixes:

1. Rebuild: `npm run buildreact`
2. Restart the app
3. Start a new chat in **agent mode**
4. Ask: "Read the file at /path/to/file.txt"
5. Check logs for:
   ```
   [sendLLMMessage] OpenAI-compatible - chatMode: agent, tools count: 15
   [chatThreadService] LLM response: {"hasToolCall":true,"toolName":"read_file",...}
   ```

## Common Issues

### Issue: "hasToolCall: false" but tools were sent
**Cause**: LLM chose not to use tools (maybe the prompt didn't require them)
**Fix**: Try a more explicit request like "Use the read_file tool to read X"

### Issue: Tools sent but LLM outputs text instead
**Cause**: Model doesn't reliably use tool calling
**Fix**: Try a different model with better tool calling support (GPT-4, Claude, etc.)

### Issue: "chatMode: normal" in logs
**Cause**: Not in agent/gather mode
**Fix**: Switch to agent mode in the UI

## Next Steps

1. **Add the logging** (already done in this commit)
2. **Rebuild and test**: `npm run buildreact`
3. **Check the logs** to see which issue you're hitting
4. **Apply the appropriate fix** based on the diagnostic results
5. **Report back** with the log output so we can determine the exact issue
