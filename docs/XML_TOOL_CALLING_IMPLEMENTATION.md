# XML Tool Calling Implementation

## Overview

Added XML-based tool calling support for models that don't support native tool calling (e.g., Ollama Cloud models with API bugs).

## Problem

Ollama Cloud API returns `500 unmarshal: invalid character 'I'` error when native tools are sent in the request. These models need an alternative way to call tools.

## Solution

Implemented XML tool calling based on Anthropic's format:
- Models without `specialToolFormat` receive XML tool descriptions in system message
- Models output tool calls in XML format: `<function_calls><invoke name="tool_name"><parameter name="param">value</parameter></invoke></function_calls>`
- We parse the XML and execute the tools

## Files Created

### 1. `/src/vs/workbench/contrib/void/common/helpers/extractXMLTools.ts`
- `extractXMLToolCalls(text)` - Parses XML tool calls from model response
- `formatXMLToolResults(results)` - Formats tool results as XML for sending back to model

## Files Modified

### 1. `/src/vs/workbench/contrib/void/common/prompt/prompts.ts`
- Added `generateXMLToolDescriptions(tools)` - Converts tool definitions to XML format
- Added `XML_TOOL_CALLING_INSTRUCTIONS` - System prompt explaining XML format
- Modified `chat_systemMessage()` to include XML tool descriptions when `!specialToolFormat`

### 2. `/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`
- Added XML tool call extraction after stream completes
- Only extracts XML if `!specialToolFormat` and no native tool call detected
- Logs extracted XML tool calls for debugging

### 3. `/src/vs/workbench/contrib/void/common/modelCapabilities.ts`
- Kept `specialToolFormat` commented out for all Ollama Cloud models
- Models will use XML tool calling instead

## How It Works

### For Models WITH `specialToolFormat` (e.g., OpenAI, Anthropic, Gemini):
1. Tools sent via native API format
2. Model returns tool calls in native format
3. We parse and execute them

### For Models WITHOUT `specialToolFormat` (e.g., Ollama Cloud):
1. XML tool descriptions added to system message
2. Model outputs XML: `<function_calls><invoke name="read_file"><parameter name="uri">/path/to/file</parameter></invoke></function_calls>`
3. We extract XML tool calls with regex
4. Parse parameters and execute tools
5. Format results as XML and send back to model

## XML Format Example

**System Message Includes:**
```
You can invoke functions by writing a "<function_calls>" block:
<function_calls>
<invoke name="$FUNCTION_NAME">
<parameter name="$PARAMETER_NAME">$PARAMETER_VALUE</parameter>
</invoke>
</function_calls>

<tools>
<tool_description>
<tool_name>read_file</tool_name>
<description>Reads the contents of a file...</description>
<parameters>
<parameter>
<name>uri</name>
<type>string</type>
<description>The FULL path to the file.</description>
</parameter>
</parameters>
</tool_description>
</tools>
```

**Model Response:**
```
I'll read that file for you.

<function_calls>
<invoke name="read_file">
<parameter name="uri">/Users/user/project/file.ts</parameter>
</invoke>
</function_calls>
```

**Tool Result Sent Back:**
```
<function_results>
<result>
<tool_name>read_file</tool_name>
<stdout>
[file contents here]
</stdout>
</result>
</function_results>
```

## Testing

1. **Wait for watch to recompile**
2. **Restart the app**: `./scripts/code.sh`
3. **Test with Ollama Cloud model** (e.g., `deepseek-v3.1:671b-cloud`)
4. **Ask it to use a tool**: "what's in the codebase?"

**Expected Logs:**
```
[sendLLMMessage] ⚠️ NOT sending tools - specialToolFormat is 'undefined', will use XML tool calling instead
[sendLLMMessage] ✅ Extracted XML tool call: read_file {uri: "/path/to/file"}
```

## Benefits

✅ Works around Ollama Cloud API bug  
✅ No more 500 errors  
✅ Tool calling works for ALL models  
✅ Fallback for any model without native support  
✅ Based on proven Anthropic format  

## Recent Changes (Session 2025-01-08)

### Removed Model-Specific Auto-Continue Logic
**What was removed:** In `chatThreadService.ts`, we removed the check for `isUsingXMLToolCalling` in the auto-continue logic.

**Before:**
```typescript
// Only auto-continue for XML tool calling models
else if (justCompletedToolCall && isUsingXMLToolCalling && info.fullText.trim().length < 150) {
    // Auto-continue logic
}
```

**After:**
```typescript
// Auto-continue for ALL models (both XML and native)
else if (justCompletedToolCall && info.fullText.trim().length < 200) {
    // Auto-continue logic
}
```

**Why:** Both XML and native tool calling models exhibit the same behavior - returning short responses like "Now let me fix..." (86-160 chars) after tool calls instead of actually making the next tool call. The auto-continue now works universally.

**Also removed:**
- `const isUsingXMLToolCalling = modelCapabilities && !modelCapabilities.specialToolFormat` (line 835)
- `const modelCapabilities = ...` (line 834)
- `import { getModelCapabilities } from '../common/modelCapabilities.js'` (line 15)

**To restore:** If we need model-specific auto-continue behavior again, add back:
1. Import `getModelCapabilities`
2. Detect model capabilities in the loop
3. Add conditional logic based on `specialToolFormat`

### Added Raw Text Tracking for XML Detection
**What was added:** `_rawTextBeforeStripping` field to `llmInfo` type and stream state.

**Purpose:** Allows UI to detect when we're inside a `<function_calls>` block before XML parsing completes, so we can show "Generating tool call..." indicator instead of just three dots.

**Files modified:**
- `chatThreadService.ts`: Added `_rawTextBeforeStripping?: string` to `ThreadStreamState` type (line 220)
- `chatThreadService.ts`: Pass `_rawTextBeforeStripping` to stream state (line 917)
- `SidebarChat.tsx`: Use `_rawTextBeforeStripping` to detect XML tool calls (line 3246)

## Future

When Ollama fixes their Cloud API bug, uncomment `specialToolFormat: 'openai-style'` in cloud model configs to switch back to faster native tool calling.
