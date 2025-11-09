# Context Window Tracking & Compression Implementation Plan

## Overview
Implement automatic context window tracking and intelligent message compression to improve performance for local LLMs and prevent context overflow.

## Phase 1: Token Counting Infrastructure ✅

### 1.1 Install Dependencies
```bash
npm install js-tiktoken
```

### 1.2 Create Token Counting Service
- **File**: `/src/vs/workbench/contrib/void/common/tokenCountingService.ts`
- **Features**:
  - Count tokens in text, messages, and message arrays
  - Support multiple model encodings (GPT-4, GPT-3.5, Claude, Gemini)
  - Cache encoders for performance
  - Track context window sizes per model
  - Calculate remaining tokens

## Phase 2: Context Window Monitoring

### 2.1 Integrate with Message Service
- **File**: `/src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
- **Changes**:
  - Add token counting before sending messages
  - Log context window usage
  - Warn when approaching limits (>80% full)
  - Error when exceeding limits

### 2.2 Add UI Indicators
- **File**: `/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- **Features**:
  - Show token count in chat UI
  - Display context window usage bar
  - Warning indicator when near limit

## Phase 3: Intelligent Message Compression

### 3.1 Message Prioritization Strategy
When context window is tight, compress messages based on priority:

**Priority Levels** (low weight = keep, high weight = compress first):
1. **System message** (0.01) - Never compress
2. **Tool results** (0.02) - Rarely compress (already implemented)
3. **User messages** (1.0) - Compress if needed
4. **Assistant messages** (10.0) - Most aggressive compression

### 3.2 Compression Techniques

#### A. Summarization
- Summarize old assistant messages (>5 messages ago)
- Keep first/last user messages intact
- Summarize middle conversation turns

#### B. Tool Result Truncation
- Keep only relevant parts of large tool results
- Truncate file contents to relevant sections
- Summarize directory listings

#### C. Message Removal
- Remove oldest assistant messages first
- Keep system message always
- Keep last N user/assistant pairs

### 3.3 Implementation
- **File**: `/src/vs/workbench/contrib/void/common/contextCompressionService.ts`
- **Features**:
  - `compressMessages()` - Main compression function
  - `summarizeMessage()` - Summarize long messages
  - `truncateToolResult()` - Smart tool result truncation
  - `removeOldMessages()` - Remove least important messages

## Phase 4: Adaptive Compression

### 4.1 Model-Specific Strategies
- **Large models** (128k+ tokens): Minimal compression
- **Medium models** (32k-128k): Moderate compression
- **Small models** (<32k): Aggressive compression
- **Local models**: Extra aggressive (assume 4k-8k windows)

### 4.2 Dynamic Adjustment
- Monitor actual context usage
- Adjust compression threshold based on model performance
- Learn optimal compression ratios per model

## Phase 5: User Controls

### 5.1 Settings
Add to void settings:
```typescript
{
  contextWindow: {
    autoCompress: boolean;          // Enable/disable auto-compression
    compressionThreshold: number;   // % of window before compression (default: 80%)
    keepLastNMessages: number;      // Always keep last N messages (default: 10)
    summarizeOldMessages: boolean;  // Summarize vs remove old messages
  }
}
```

### 5.2 Manual Controls
- Button to manually compress context
- Show compression stats
- Option to clear context (keep system message only)

## Implementation Order

1. ✅ Create `tokenCountingService.ts`
2. Install `js-tiktoken` dependency
3. Fix type errors in token counting service
4. Integrate token counting into message preparation
5. Add context window monitoring logs
6. Create `contextCompressionService.ts`
7. Implement compression strategies
8. Add UI indicators
9. Add user settings
10. Test with local LLMs

## Benefits

### For Local LLMs
- **Prevent crashes**: Never exceed context window
- **Better performance**: Smaller context = faster inference
- **More turns**: Compress old messages to fit more conversation

### For All Models
- **Cost savings**: Fewer tokens = lower API costs
- **Faster responses**: Less context to process
- **Better focus**: Keep only relevant information

## Testing Strategy

1. **Unit tests**: Token counting accuracy
2. **Integration tests**: Compression preserves important info
3. **Manual tests**: 
   - Long conversations with local LLMs
   - Large file operations
   - Multiple tool calls
   - Different model sizes

## Metrics to Track

- Average tokens per message
- Context window usage %
- Compression ratio
- Messages removed/summarized
- Performance impact (latency)
