# LM Studio Tool Calling Comparison & Improvements

## LM Studio Tool Calling Implementation

### How LM Studio Handles Tool Calling

**1. Native vs Default Tool Support**
- **Native Support**: Models with chat templates that support tool calling (Qwen2.5, Llama-3.1/3.2, Mistral)
- **Default Support**: Fallback for models without native support using custom system prompts

**2. Native Tool Support Models**
- Qwen2.5-Instruct (GGUF/MLX)
- Llama-3.1/3.2-Instruct (GGUF/MLX)
- Mistral models (GGUF/MLX)

**3. Default Tool Support Process**
For models without native support:
```javascript
// Custom system prompt with XML-like format
[TOOL_REQUEST]{"name": "tool_name", "arguments": {"param": "value"}}[END_TOOL_REQUEST]
```

**4. Timeout Configuration**
- **300-second hard timeout** (5 minutes) - GitHub Issue #944
- Timeout occurs at server level, not client
- Error message: "client disconnected"

**5. Known Issues**
- Tool calling broken in v0.3.21 for many models - GitHub Issue #810
- Affects Qwen3-coder, DeepSeek, Mistral models
- Tool calls printed but not executed

## Our Current LM Studio Implementation

### Current Setup
```typescript
// Basic OpenAI-compatible client
else if (providerName === 'lmStudio') {
    const thisConfig = settingsOfProvider[providerName]
    return new OpenAI({
        baseURL: `${thisConfig.endpoint}/v1`,
        apiKey: 'noop',
        ...commonPayloadOpts
    })
}
```

### Provider Settings
```typescript
const lmStudioSettings: VoidStaticProviderInfo = {
    modelOptionsFallback: (modelName) => extensiveModelOptionsFallback(modelName, {
        downloadable: { sizeGb: 'not-known' },
        contextWindow: 4_096  // Very conservative!
    }),
    modelOptions: {},
    providerReasoningIOSettings: {
        input: { includeInPayload: openAICompatIncludeInPayloadReasoning },
        output: { needsManualParse: true },
    },
}
```

## Key Differences & Issues

### 1. **No Tool Format Detection**
**LM Studio**: Automatically detects native vs default tool support
**Our Implementation**: Uses generic OpenAI format, no special handling

### 2. **Timeout Issues**
**LM Studio**: 300-second timeout (5 minutes)
**Our Implementation**: No timeout configuration, uses OpenAI defaults

### 3. **Context Window**
**LM Studio**: Dynamic based on model
**Our Implementation**: Fixed 4,096 tokens (very conservative)

### 4. **Error Handling**
**LM Studio**: Specific timeout detection
**Our Implementation**: Generic error handling

## Recommended Improvements

### 1. **Add LM Studio-Specific Timeout Handling**

```typescript
else if (providerName === 'lmStudio') {
    const thisConfig = settingsOfProvider[providerName]
    return new OpenAI({
        baseURL: `${thisConfig.endpoint}/v1`,
        apiKey: 'noop',
        // LM Studio has 5-minute timeout, set slightly under
        timeout: 280000, // 4m 40s - stay under 5m limit
        defaultHeaders: {
            'HTTP-User-Agent': 'Void/1.0.0',
            'Accept': 'application/json',
        },
        // Add connection pooling
        httpAgent: new https.Agent({
            keepAlive: true,
            maxSockets: 3,
            timeout: 280000
        }),
        ...commonPayloadOpts
    })
}
```

### 2. **Implement Native Tool Detection**

```typescript
const getLMStudioToolFormat = (modelName: string) => {
    const nativeModels = [
        'qwen2.5', 'llama-3.1', 'llama-3.2', 'mistral'
    ];

    const hasNativeSupport = nativeModels.some(pattern =>
        modelName.toLowerCase().includes(pattern)
    );

    return hasNativeSupport ? 'openai-style' : undefined;
};
```

### 3. **Improve Context Window Detection**

```typescript
const getLMStudioContextWindow = (modelName: string) => {
    const contexts: Record<string, number> = {
        'qwen2.5': 32768,
        'llama-3.1': 128000,
        'llama-3.2': 128000,
        'mistral': 32768,
        // Default for unknown models
        'default': 8192
    };

    for (const [model, context] of Object.entries(contexts)) {
        if (modelName.toLowerCase().includes(model)) {
            return context;
        }
    }
    return contexts.default;
};
```

### 4. **Add LM Studio-Specific Error Handling**

```typescript
const handleLMStudioError = (error: any, modelName: string) => {
    if (error?.message?.includes('client disconnected')) {
        return "LM Studio timeout exceeded (5 minutes). Try using a smaller model or reducing context size.";
    }

    if (error?.message?.includes('tool calling')) {
        return "Tool calling may not be supported for this LM Studio model. Try a model with native tool support like Qwen2.5 or Llama-3.1.";
    }

    return `Model produced a result A-Coder couldn't apply`;
};
```

### 5. **Update Provider Settings**

```typescript
const lmStudioSettings: VoidStaticProviderInfo = {
    modelOptionsFallback: (modelName) => extensiveModelOptionsFallback(modelName, {
        downloadable: { sizeGb: 'not-known' },
        contextWindow: getLMStudioContextWindow(modelName),
        specialToolFormat: getLMStudioToolFormat(modelName)
    }),
    modelOptions: {},
    providerReasoningIOSettings: {
        input: { includeInPayload: openAICompatIncludeInPayloadReasoning },
        output: { needsManualParse: true },
    },
}
```

### 6. **Add Model-Specific Recommendations**

```typescript
const getLMStudioModelRecommendations = (modelName: string) => {
    const recommendations = {
        'qwen2.5': {
            description: "Excellent tool support, native OpenAI-compatible format",
            contextWindow: 32768,
            toolSupport: 'native'
        },
        'llama-3.1': {
            description: "Good tool support, large context window",
            contextWindow: 128000,
            toolSupport: 'native'
        },
        'default': {
            description: "May have limited tool support, consider Qwen2.5 or Llama-3.1",
            contextWindow: 8192,
            toolSupport: 'default'
        }
    };

    for (const [model, rec] of Object.entries(recommendations)) {
        if (modelName.toLowerCase().includes(model)) {
            return rec;
        }
    }
    return recommendations.default;
};
```

### 7. **Add Circuit Breaker for LM Studio**

```typescript
class LMStudioCircuitBreaker {
    private failures = new Map<string, number>();
    private readonly maxFailures = 3;
    private readonly resetTimeout = 300000; // 5 minutes

    canRequest(modelName: string): boolean {
        const failures = this.failures.get(modelName) || 0;
        return failures < this.maxFailures;
    }

    recordFailure(modelName: string): void {
        const failures = (this.failures.get(modelName) || 0) + 1;
        this.failures.set(modelName, failures);

        // Auto-reset after timeout
        setTimeout(() => {
            this.failures.delete(modelName);
        }, this.resetTimeout);
    }
}
```

## Implementation Priority

### Immediate (Critical)
1. **Add 4m 40s timeout** - Prevent LM Studio 5-minute timeout issues
2. **Improve context window detection** - From 4K to dynamic (8K-128K)
3. **Add LM Studio-specific error messages** - Better user feedback

### Short Term (Important)
4. **Native tool format detection** - Better tool calling support
5. **Model recommendations** - Guide users to better models
6. **Circuit breaker** - Handle repeated failures

### Medium Term (Enhancement)
7. **Connection pooling** - Better resource management
8. **Metrics collection** - Monitor LM Studio performance

## Expected Impact

- **Eliminate timeout errors** by staying under LM Studio's 5-minute limit
- **Improve tool calling success** through native format detection
- **Better user experience** with appropriate context windows
- **Reduce support issues** with clear error messages and recommendations

## Key Insights

1. **LM Studio has stricter timeouts** than Ollama (5 minutes vs 2 minutes)
2. **Native tool support matters** - not all models support it equally
3. **Context window is model-dependent** - 4K is too conservative
4. **Error messages need to be specific** to LM Studio's limitations
5. **Model selection matters** - some models work better than others

LM Studio's approach is more sophisticated than our current implementation, with automatic detection of native tool support and model-specific optimizations.
