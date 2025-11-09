# Morph Fast Apply Integration

## Overview
Morph Fast Apply is an intelligent code application API that enhances A-Coder's apply functionality. When enabled, it uses Morph's API to intelligently apply code changes suggested by the LLM.

## Architecture

### Settings
Two new global settings added to `voidSettingsTypes.ts`:
- `enableMorphFastApply: boolean` - Toggle to enable/disable Morph Fast Apply
- `morphApiKey: string` - API key for Morph service

### Service
New `morphService.ts` provides:
- `IMorphService` interface
- `applyCodeChange()` method that:
  1. Takes instruction, original code, and updated code
  2. Formats content according to Morph's required format:
     ```
     <instruction>First-person description</instruction>
     <code>Complete original file content</code>
     <update>Code snippet with changes</update>
     ```
  3. Calls Morph API at `https://morphllm.com/v1/chat/completions`
  4. Returns the intelligently applied code

### UI
Settings panel (`Settings.tsx`) includes:
- **Morph Fast Apply** section with:
  - Enable/disable toggle
  - Password-protected API key input (only shown when enabled)
  - Link to get API key from morphllm.com/dashboard
  - Description explaining the enhancement

## API Details

### Endpoint
```
POST https://morphllm.com/v1/chat/completions
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_API_KEY"
}
```

### Request Body
```json
{
  "model": "morph-v3-large",  // or "morph-v3-fast", "auto"
  "messages": [
    {
      "role": "user",
      "content": "<instruction>...</instruction>\n\n<code>...</code>\n\n<update>...</update>"
    }
  ],
  "stream": false
}
```

### Response
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "// Applied code here"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 32,
    "total_tokens": 57
  }
}
```

## Integration Points

### Where to Integrate
Morph Fast Apply should enhance the existing apply logic in:
1. **editCodeService.ts** - When applying search/replace blocks
2. **Tool execution** - When the LLM uses apply tools

### Integration Strategy
When `enableMorphFastApply` is true and API key is configured:
1. LLM generates code change (instruction + code snippet)
2. Extract:
   - **Instruction**: What the LLM is trying to do
   - **Original Code**: Current file content
   - **Updated Code**: LLM's suggested changes
3. Call `morphService.applyCodeChange()`
4. Use Morph's response as the applied code
5. Fall back to existing logic if Morph fails

### Example Usage
```typescript
// In editCodeService or tool execution
if (settingsService.state.globalSettings.enableMorphFastApply && 
    settingsService.state.globalSettings.morphApiKey) {
  try {
    const appliedCode = await morphService.applyCodeChange({
      instruction: "Add error handling to the divide function",
      originalCode: fileContent,
      updatedCode: llmSuggestedCode,
      model: 'morph-v3-large'
    });
    // Use appliedCode
  } catch (error) {
    // Fall back to existing apply logic
    console.warn('Morph Fast Apply failed, using standard apply:', error);
  }
}
```

## Benefits
- **Intelligent Application**: Morph understands context and applies changes more accurately
- **Handles Ambiguity**: Better at dealing with incomplete or ambiguous code snippets
- **Preserves Style**: Maintains existing code style and formatting
- **Optional Enhancement**: Doesn't replace existing functionality, just enhances it

## User Experience
1. User enables Morph Fast Apply in settings
2. User enters API key from morphllm.com/dashboard
3. When LLM suggests code changes, Morph intelligently applies them
4. If Morph fails or is disabled, falls back to standard apply logic
5. Seamless enhancement with no breaking changes

## Next Steps
1. Register `MorphService` in dependency injection
2. Inject `IMorphService` into `editCodeService`
3. Add Morph logic to apply functions
4. Add error handling and fallback logic
5. Test with various code change scenarios
