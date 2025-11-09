# XML Tool Call Loading Animation - Best Practices

## Research Summary
Based on industry best practices from AWS Cloudscape Design System, LogRocket UX research, and Agentic Design patterns.

---

## Key Principles

### 1. **Progressive Disclosure**
- Start simple, expand on-demand
- Show summary → detailed → technical information
- Use clear visual hierarchy
- Prevent cognitive overload

### 2. **Stages of Loading**
For AI/LLM tool execution, there are typically two stages:

**Processing Stage:**
- AI is processing the request but has no output yet
- Show loading indicator + descriptive text
- Example: "Reading file..." or "Searching codebase..."

**Generation Stage:**
- AI is generating/returning results
- Stream results incrementally if possible
- Keep loading indicator visible for context

### 3. **Loading Indicators**
- **Visual elements:** Use animations to capture attention
- **Paired with text:** Always combine visual indicators with descriptive text for accessibility
- **Context-specific:** Different indicators for different content types

---

## Recommended Patterns for XML Tool Calls

### Pattern 1: Skeleton Screens (Best for structured content)
**When to use:**
- Loading file contents
- Loading directory structures
- Loading search results
- Any container-based components

**Implementation:**
```tsx
<div className="skeleton-container">
  {/* Pulsating placeholder that matches final layout */}
  <div className="skeleton-line animate-pulse" />
  <div className="skeleton-line animate-pulse" />
  <div className="skeleton-line short animate-pulse" />
</div>
```

**Best practices:**
- Keep layout consistent with final content
- Use subtle pulsating animation (not too fast)
- Match the structure of what will load
- Use distinguishable colors for light/dark themes

### Pattern 2: Loading Bar + Text (Best for non-text content)
**When to use:**
- Loading lists of resources
- Loading tables or structured data
- Loading code blocks
- Any UI element that isn't plain text

**Implementation:**
```tsx
<div className="tool-loading-container">
  <div className="loading-bar animate-shimmer" />
  <span className="loading-text">Loading search results...</span>
</div>
```

### Pattern 3: Streaming with Avatar (Best for text responses)
**When to use:**
- Tool is returning text output
- Incremental results available
- Conversational context

**Implementation:**
```tsx
<div className="chat-bubble">
  <Avatar loading={true} />
  <div className="streaming-text">
    {partialResult || "Processing..."}
  </div>
</div>
```

**Key factors:**
- Keep avatar visible even during streaming
- Helps when streaming slows intermittently
- Provides affordance about overall state

---

## Current Void Implementation Analysis

### What We Have Now
Looking at `SidebarChat.tsx` line 3446-3449:
```tsx
isGeneratingXMLToolCall ? (
  <ProseWrapper>
    <div className="flex items-center gap-2 py-2 text-void-fg-3">
      <Loader2 className="animate-spin" size={16} />
      <span>Generating tool call...</span>
    </div>
  </ProseWrapper>
)
```

### Recommendations for Improvement

#### 1. **Add Tool-Specific Loading States**
Instead of generic "Generating tool call...", show what's happening:

```tsx
const getToolLoadingMessage = (toolName?: string) => {
  const messages = {
    'read_file': 'Reading file...',
    'search_in_file': 'Searching file...',
    'search_for_files': 'Searching codebase...',
    'edit_file': 'Preparing edit...',
    'run_command': 'Executing command...',
    'get_dir_tree': 'Loading directory structure...',
  };
  return messages[toolName] || 'Processing...';
};
```

#### 2. **Use Progressive Disclosure**
For XML tool calls, show stages:

```tsx
{isGeneratingXMLToolCall && (
  <ProseWrapper>
    <div className="flex flex-col gap-2 py-2">
      {/* Stage 1: Parsing XML */}
      <div className="flex items-center gap-2 text-void-fg-3">
        <Loader2 className="animate-spin" size={16} />
        <span>Parsing tool call...</span>
      </div>
      
      {/* Stage 2: Show partial tool info if available */}
      {partialToolName && (
        <div className="flex items-center gap-2 text-void-fg-2 ml-6">
          <ChevronRight size={14} />
          <span className="text-sm">{getToolLoadingMessage(partialToolName)}</span>
        </div>
      )}
    </div>
  </ProseWrapper>
)}
```

#### 3. **Add Skeleton for Known Tool Types**
For file-related tools, show skeleton of expected output:

```tsx
{isGeneratingXMLToolCall && partialToolName === 'read_file' && (
  <div className="skeleton-file-content">
    <div className="skeleton-line animate-pulse h-4 bg-void-bg-3 rounded mb-2" />
    <div className="skeleton-line animate-pulse h-4 bg-void-bg-3 rounded mb-2 w-5/6" />
    <div className="skeleton-line animate-pulse h-4 bg-void-bg-3 rounded mb-2 w-4/6" />
  </div>
)}
```

#### 4. **Improve Animation**
Use shimmer effect instead of just pulse:

```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    var(--void-bg-2) 0%,
    var(--void-bg-3) 50%,
    var(--void-bg-2) 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

---

## Accessibility Considerations

1. **ARIA attributes:**
```tsx
<div 
  role="status" 
  aria-live="polite"
  aria-label="Loading tool execution"
>
  <Loader2 className="animate-spin" />
  <span>Processing...</span>
</div>
```

2. **Screen reader support:**
- Always pair visual indicators with text
- Use semantic HTML
- Announce state changes

3. **Color contrast:**
- Ensure loading indicators are visible in both light/dark themes
- Use distinguishable colors
- Don't rely on color alone

---

## Implementation Priority

### High Priority (Immediate Impact)
1. ✅ Add tool-specific loading messages
2. ✅ Show progressive stages (parsing → executing)
3. ✅ Keep loading indicator visible throughout

### Medium Priority (Enhanced UX)
1. Add skeleton screens for file/directory tools
2. Implement shimmer animation
3. Show partial tool parameters as they're parsed

### Low Priority (Polish)
1. Add micro-interactions
2. Custom animations per tool type
3. Loading time estimates

---

## Code Examples

### Simple Implementation (Quick Win)
```tsx
// In SidebarChat.tsx around line 3446
{isGeneratingXMLToolCall ? (
  <ProseWrapper>
    <div className="flex items-center gap-2 py-2 text-void-fg-3">
      <Loader2 className="animate-spin" size={16} />
      <span>
        {currThreadStreamState?.toolInfo?.toolName 
          ? getToolLoadingMessage(currThreadStreamState.toolInfo.toolName)
          : 'Parsing tool call...'}
      </span>
    </div>
  </ProseWrapper>
) : null}
```

### Advanced Implementation (Full Featured)
```tsx
{isGeneratingXMLToolCall ? (
  <ProseWrapper>
    <div className="flex flex-col gap-3 py-3 px-4 bg-void-bg-2 rounded-lg border border-void-border-3">
      {/* Header with spinner */}
      <div className="flex items-center gap-2">
        <Loader2 className="animate-spin text-void-accent" size={18} />
        <span className="text-void-fg-2 font-medium">
          {currThreadStreamState?.toolInfo?.toolName 
            ? `Executing ${currThreadStreamState.toolInfo.toolName}`
            : 'Parsing tool call...'}
        </span>
      </div>
      
      {/* Progressive details */}
      {currThreadStreamState?.toolInfo?.toolParams && (
        <div className="ml-7 text-sm text-void-fg-3">
          <div className="flex items-start gap-2">
            <ChevronRight size={14} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">
              {JSON.stringify(currThreadStreamState.toolInfo.toolParams, null, 2)
                .split('\n')
                .slice(0, 3)
                .join('\n')}
            </span>
          </div>
        </div>
      )}
      
      {/* Skeleton for expected output */}
      {shouldShowSkeleton(currThreadStreamState?.toolInfo?.toolName) && (
        <div className="ml-7 space-y-2">
          <div className="h-3 bg-void-bg-3 rounded animate-pulse w-full" />
          <div className="h-3 bg-void-bg-3 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-void-bg-3 rounded animate-pulse w-4/6" />
        </div>
      )}
    </div>
  </ProseWrapper>
) : null}
```

---

## References
- [AWS Cloudscape - GenAI Loading States](https://cloudscape.design/patterns/genai/genai-loading-states/)
- [LogRocket - Skeleton Loading Screens](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)
- [Agentic Design - Progressive Disclosure](https://agentic-design.ai/patterns/ui-ux-patterns/progressive-disclosure-patterns)
