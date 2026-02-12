# TOON Implementation for Tool Result Compression

## Overview

Implemented TOON (Token-Oriented Object Notation) compression for LLM tool outputs to reduce token usage. This feature is **user-toggleable** via the A-Coder settings panel.

## What is TOON?

TOON is a compact JSON-like format that reduces token usage by:
- Removing unnecessary whitespace
- Using minimal punctuation
- Omitting quotes where safe
- Preserving structure and readability

**Example:**
```
JSON:  {"files": ["a.ts", "b.ts"], "count": 2}  (45 chars)
TOON:  {files:[a.ts,b.ts],count:2}              (27 chars, 40% savings)
```

## Implementation Details

### 1. Settings Toggle

**Location:** A-Coder Settings → Feature Options → Tools

**Setting:** `enableToolResultTOON` (default: `false`)

**Files Modified:**
- `voidSettingsTypes.ts` - Added global setting
- `Settings.tsx` - Added UI toggle with description

### 2. TOON Service

**File:** `src/vs/workbench/contrib/void/common/toonService.ts`

**Features:**
- `encode(value)` - Converts JS objects to TOON format
- `decode(toonStr)` - Parses TOON back to JS (currently JSON-compatible)
- `shouldUseToon(value)` - Heuristic to determine if TOON would help

**Encoding Rules:**
- Objects: `{key:value,key2:value2}`
- Arrays: `[item1,item2,item3]`
- Strings: Unquoted when safe, quoted when containing special chars
- Numbers/booleans: Direct representation
- Null: `null`

### 3. Integration Points

#### Built-in Tools (`toolsService.ts`)

**Tools with TOON encoding:**
- `ls_dir` - Directory listings (structured data)
- `read_lint_errors` - Lint error arrays

**Logic:**
```typescript
private _maybeEncodeToon(data: any, fallbackStr: string): string {
    const enableToon = this.voidSettingsService.state.globalSettings.enableToolResultTOON;

    if (!enableToon) return fallbackStr;

    if (this.toonService.shouldUseToon(data)) {
        const toonEncoded = this.toonService.encode(data);
        // Only use if it saves at least 10%
        if (toonEncoded.length < fallbackStr.length * 0.9) {
            return `[TOON]\n${toonEncoded}`;
        }
    }

    return fallbackStr;
}
```

#### MCP Tools (`mcpService.ts`)

**All MCP tool results** are checked for TOON encoding when the setting is enabled.

**Format:**
```
[TOON]
{event:text,text:result content here}
```

### 4. Smart Compression

**Only applies TOON when:**
1. Setting is enabled (`enableToolResultTOON = true`)
2. Data is structured (objects/arrays with >3 keys or >100 chars)
3. TOON saves at least 10% space vs regular format

**Fallback behavior:**
- If TOON encoding fails → uses regular format
- If TOON doesn't save space → uses regular format
- Logs warnings to console for debugging

## Usage

### Enable TOON Compression

1. Open A-Coder Settings (⚙️ icon in sidebar)
2. Navigate to "Feature Options" tab
3. Scroll to "Tools" section
4. Toggle "Use TOON format for tool results"

### Expected Behavior

**When enabled:**
- Directory listings compressed: `ls_dir` results use compact format
- Lint errors compressed: `read_lint_errors` uses compact arrays
- MCP tool results compressed: Structured MCP outputs use TOON
- LLM receives `[TOON]` prefix to indicate format

**When disabled:**
- All tool results use standard JSON/text formatting
- No compression applied

## Token Savings

**Estimated savings:**
- Directory listings: 30-50% reduction
- Lint errors: 40-60% reduction
- Large structured MCP results: 30-70% reduction

**Example:**
```
Before (JSON):
{
  "files": [
    {"name": "file1.ts", "size": 1024},
    {"name": "file2.ts", "size": 2048}
  ],
  "total": 2
}

After (TOON):
[TOON]
{files:[{name:file1.ts,size:1024},{name:file2.ts,size:2048}],total:2}

Savings: ~40% fewer tokens
```

## Files Modified

1. **Settings:**
   - `voidSettingsTypes.ts` - Added `enableToolResultTOON` setting
   - `Settings.tsx` - Added UI toggle

2. **Core Service:**
   - `toonService.ts` - New TOON encoder/decoder

3. **Integration:**
   - `toolsService.ts` - Added TOON encoding for built-in tools
   - `mcpService.ts` - Added TOON encoding for MCP tools

## Future Enhancements

1. **Full TOON Library:** Replace simple implementation with `@toon-format/toon` package
2. **More Tools:** Apply to `search_for_files`, `search_pathnames_only` results
3. **Adaptive Compression:** Auto-enable when context window is tight
4. **Metrics:** Track actual token savings in telemetry

## Testing

**Manual Testing:**
1. Enable TOON in settings
2. Run `ls_dir` on a large directory
3. Check console for `[TOON]` prefix in tool results
4. Verify LLM can still parse and use the results
5. Disable TOON and verify regular format returns

**Expected Console Output:**
```
[ToolsService] TOON encoding applied: 450 chars → 280 chars (38% savings)
```

## Notes

- TOON is **opt-in** to avoid breaking existing workflows
- Compression is **intelligent** - only applies when beneficial
- **Backward compatible** - LLMs can parse TOON as JSON-like format
- **Safe** - Falls back to regular format on any encoding errors
