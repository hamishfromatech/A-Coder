# Latest Models Tool Calling Analysis

## Overview
Analysis of MiniMax M2, Kimi K2, and Kimi K2 Thinking models for optimal tool calling implementation.

---

## 1. MiniMax M2

### Tool Calling Format
**Uses custom XML format with special namespace:**
```xml
<minimax:tool_call>
  <invoke name="function_name">
    <parameter name="param_name">value</parameter>
  </invoke>
</minimax:tool_call>
```

### Key Characteristics
- **Special namespace:** `minimax:tool_call` (not standard `function_calls`)
- **Thinking process:** Wraps reasoning in `<think>...</think>` tags
- **Internal format:** Uses special markers like `]~!b[]~b]system`, `[e~[`, `]~b]user`, `]~b]ai`, `]~b]tool`
- **Tool definitions:** Passed as JSON Schema wrapped in `<tools><tool>{...}</tool></tools>`

### System Prompt Format
```
# Tools
You may call one or more tools to assist with the user query.
Here are the tools available in JSONSchema format:
<tools>
<tool>{"name": "...", "description": "...", "parameters": {...}}</tool>
</tools>

When making tool calls, use XML format to invoke tools and pass parameters:
<minimax:tool_call>
<invoke name="tool-name-1">
<parameter name="param-key-1">param-value-1</parameter>
...
</invoke>
</minimax:tool_call>
```

### Parsing Requirements
- Must handle `<minimax:tool_call>` namespace (not `<function_calls>`)
- Must preserve `<think>...</think>` blocks (critical for performance)
- Parameters can be JSON arrays/objects as strings
- Need type conversion based on JSON Schema

### Performance Notes
- **Do NOT remove `<think>...</think>` blocks** - negatively affects performance
- Recommended inference: `temperature=1.0, top_p=0.95, top_k=20`

---

## 2. Kimi K2 Instruct

### Tool Calling Format
**Uses OpenAI-compatible native tool calling:**
```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "...",
        "parameters": {
            "type": "object",
            "required": ["city"],
            "properties": {
                "city": {"type": "string", "description": "..."}
            }
        }
    }
}]
```

### Key Characteristics
- **Native OpenAI format:** Supports standard `tools` parameter in API
- **Automatic tool parsing:** Inference engine handles tool call extraction
- **Standard response:** Returns `finish_reason="tool_calls"` with structured tool calls
- **Temperature:** Recommended `temperature=0.6`

### API Usage
```python
completion = client.chat.completions.create(
    model="kimi-k2-instruct",
    messages=messages,
    temperature=0.6,
    tools=tools,
    tool_choice="auto"
)
```

### Tool Call Loop
```python
while finish_reason is None or finish_reason == "tool_calls":
    # Make request
    # If tool_calls, execute and append results
    # Continue loop
```

### Performance Notes
- **Requires native tool support** in inference engine (vLLM, SGLang)
- For manual parsing, see [Tool Calling Guide](https://huggingface.co/moonshotai/Kimi-K2-Instruct/blob/main/docs/tool_call_guidance.md)
- Context window: 128k tokens

---

## 3. Kimi K2 Thinking

### Tool Calling Format
**Same as Kimi K2 Instruct** - OpenAI-compatible native tool calling

### Key Characteristics
- **Long-horizon agency:** Can handle 200-300 consecutive tool calls
- **Step-by-step reasoning:** Built as a thinking agent
- **Stable tool use:** Maintains coherent behavior across many steps
- **Temperature:** Recommended `temperature=1.0` (higher than Instruct)

### Unique Capabilities
- **Extended reasoning:** Dramatically scales multi-step reasoning depth
- **Agentic search:** State-of-the-art on BrowseComp benchmark
- **Complex problem solving:** Reasons coherently across hundreds of steps

### Performance Notes
- **Best for complex tasks** requiring multiple tool invocations
- **Higher temperature** (1.0) for better reasoning diversity
- Same tool calling format as Kimi K2 Instruct

---

## Comparison Table

| Feature | MiniMax M2 | Kimi K2 Instruct | Kimi K2 Thinking |
|---------|------------|------------------|------------------|
| **Tool Format** | Custom XML (`minimax:tool_call`) | OpenAI native | OpenAI native |
| **Thinking Tags** | `<think>...</think>` (required) | No | Yes (implicit) |
| **Temperature** | 1.0 | 0.6 | 1.0 |
| **Max Tool Calls** | Standard | Standard | 200-300 |
| **Best For** | General tasks | Standard tasks | Complex multi-step |
| **Native Support** | No (custom XML) | Yes (OpenAI API) | Yes (OpenAI API) |

---

## Recommendations for Our Codebase

### 1. **Kimi K2 Models - Blocked by Ollama Cloud API Bug**

Kimi K2 models **support native OpenAI-style tool calling**, but we **cannot enable it** due to an Ollama Cloud API bug:

**Error:** `500 unmarshal: invalid character 'I' looking for beginning of value`

**Current Status:**
- ✅ Added `kimi-k2:1t-cloud` and `kimi-k2-thinking:1t-cloud` to model capabilities
- ✅ Set correct context windows (128k for Instruct, 256k for Thinking)
- ✅ Set recommended temperatures (0.6 for Instruct, 1.0 for Thinking)
- ⚠️ Using XML tool calling fallback until Ollama fixes their API
- ⚠️ Same bug affects all Ollama Cloud models with native tools

**When Ollama fixes the bug, uncomment:**
```typescript
'kimi-k2:1t-cloud': {
    specialToolFormat: 'openai-style',  // Uncomment when Ollama fixes API
},
'kimi-k2-thinking:1t-cloud': {
    specialToolFormat: 'openai-style',  // Uncomment when Ollama fixes API
},
```

### 2. **Add MiniMax M2 Custom XML Support**

MiniMax M2 uses a **different XML format** than our current implementation:
- Uses `<minimax:tool_call>` instead of `<function_calls>`
- Requires preserving `<think>...</think>` blocks
- Different parameter parsing

**Options:**
1. **Add custom parser** for MiniMax M2 format in `extractXMLTools.ts`
2. **Keep XML fallback** for models without native support
3. **Document** that MiniMax M2 needs special handling

### 3. **Temperature Settings**

Add model-specific temperature recommendations:
- **MiniMax M2:** 1.0
- **Kimi K2 Instruct:** 0.6
- **Kimi K2 Thinking:** 1.0

### 4. **Long-Horizon Support for Kimi K2 Thinking**

Kimi K2 Thinking can handle 200-300 tool calls. Ensure our system:
- ✅ Doesn't have artificial limits on tool call loops
- ✅ Can handle long conversation contexts
- ✅ Properly manages token usage across many turns

---

## Implementation Priority

### High Priority
1. **Enable native tool calling for Kimi K2 models** - They support OpenAI format natively
2. **Test with proper temperature settings** - Currently may be using wrong temps

### Medium Priority
3. **Add MiniMax M2 custom XML parser** - If we want to support this model
4. **Document model-specific quirks** - Help users understand differences

### Low Priority
5. **Optimize for long-horizon tasks** - Kimi K2 Thinking specific features

---

## Current Issues Explained

### Why Kimi K2 is performing poorly:
1. **Using XML instead of native tool calling** - Model is trained for OpenAI format
2. **Possible wrong temperature** - Should be 0.6 for Instruct, 1.0 for Thinking
3. **XML format confusion** - Model expects native format, gets XML instructions

### Solution:
Enable `specialToolFormat: 'openai-style'` for Kimi K2 models in `modelCapabilities.ts`

---

## Testing Plan

1. **Enable native tool calling** for Kimi K2 models
2. **Test with recommended temperatures**
3. **Compare performance** before/after changes
4. **Document results** in this file

---

## References

- [MiniMax M2 Tool Calling Guide](https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md)
- [Kimi K2 Instruct](https://huggingface.co/moonshotai/Kimi-K2-Instruct)
- [Kimi K2 Thinking](https://huggingface.co/moonshotai/Kimi-K2-Thinking)
- [Kimi K2 Thinking Analysis](https://www.interconnects.ai/p/kimi-k2-thinking-what-it-means)
