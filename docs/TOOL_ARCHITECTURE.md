# Tool Architecture Documentation

## Overview
This document explains how the built-in tools (`read_file`, `edit_file`, `rewrite_file`, etc.) work in the system.

## Tool Flow

### 1. Tool Definitions (`prompts.ts`)
Tools are defined with:
- `name`: Tool identifier
- `description`: What the tool does
- `params`: Parameter descriptions for the LLM

Example:
```typescript
read_file: {
    name: 'read_file',
    description: `Returns contents of a file. For files under 2MB, returns the full file...`,
    params: {
        uri: { description: `The FULL path to the file.` },
        start_line: { description: 'Optional. Do NOT fill this field in unless...' },
        end_line: { description: 'Optional. Do NOT fill this field in unless...' },
        page_number: { description: 'Optional. Page number for large files (default: 1)...' },
    },
}
```

### 2. Tool Conversion (`sendLLMMessage.impl.ts`)
Tools are converted to provider-specific formats:
- **OpenAI-compatible**: `openAITools()` → OpenAI tool schema
- **Anthropic**: `anthropicTools()` → Anthropic tool schema  
- **Gemini**: `geminiTools()` → Gemini tool schema

These are sent in the API request's `tools` parameter.

### 3. Tool Call Detection
When LLM responds with a tool call:
- **Native JSON**: Parsed from API response (`chunk.choices[0]?.delta?.tool_calls`)
- Tool call object contains: `{ name, rawParams, id }`

### 4. Tool Validation (`toolsService.ts`)
`validateParams` object validates and transforms raw parameters:

```typescript
read_file: (params: RawToolParamsObj) => {
    const { uri: uriStr, start_line, end_line, page_number } = params
    const uri = validateURI(uriStr)  // Converts string to URI object
    const pageNumber = validatePageNum(page_number)  // Validates/defaults to 1
    // ... more validation
    return { uri, startLine, endLine, pageNumber }
}
```

### 5. Tool Execution (`toolsService.ts`)
`callTool` object contains the actual tool implementations:

#### `read_file`
```typescript
read_file: async ({ uri, startLine, endLine, pageNumber }) => {
    // 1. Initialize model (loads file into memory)
    await voidModelService.initializeModel(uri)
    const { model } = await voidModelService.getModelSafe(uri)
    
    // 2. Get contents (full file or line range)
    let contents: string
    if (startLine === null && endLine === null) {
        contents = model.getValue(EndOfLinePreference.LF)  // Full file
    } else {
        // Get specific line range
        contents = model.getValueInRange({ 
            startLineNumber, startColumn: 1, 
            endLineNumber, endColumn: Number.MAX_SAFE_INTEGER 
        })
    }
    
    // 3. Paginate (2MB chunks)
    const fromIdx = MAX_FILE_CHARS_PAGE * (pageNumber - 1)
    const toIdx = MAX_FILE_CHARS_PAGE * pageNumber - 1
    const fileContents = contents.slice(fromIdx, toIdx + 1)
    const hasNextPage = (contents.length - 1) - toIdx >= 1
    
    return { result: { fileContents, totalFileLen, hasNextPage, totalNumLines } }
}
```

#### `edit_file`
```typescript
edit_file: async ({ uri, searchReplaceBlocks }) => {
    // 1. Initialize and check if file is being edited
    await voidModelService.initializeModel(uri)
    if (commandBarService.getStreamState(uri) === 'streaming') {
        throw new Error(`Another LLM is currently making changes...`)
    }
    
    // 2. Prepare for edit
    await editCodeService.callBeforeApplyOrEdit(uri)
    
    // 3. Apply search/replace blocks
    editCodeService.instantlyApplySearchReplaceBlocks({ uri, searchReplaceBlocks })
    
    // 4. Get lint errors after 2s delay
    const lintErrorsPromise = Promise.resolve().then(async () => {
        await timeout(2000)
        const { lintErrors } = this._getLintErrors(uri)
        return { lintErrors }
    })
    
    return { result: lintErrorsPromise }
}
```

#### `rewrite_file`
```typescript
rewrite_file: async ({ uri, newContent }) => {
    // Similar to edit_file but replaces entire file content
    await voidModelService.initializeModel(uri)
    // ... check streaming state
    await editCodeService.callBeforeApplyOrEdit(uri)
    editCodeService.instantlyRewriteFile({ uri, newContent })
    // ... return lint errors
}
```

### 6. Search/Replace Block Processing (`editCodeService.ts`)

The `_instantlyApplySRBlocks()` method:

```typescript
private _instantlyApplySRBlocks(uri: URI, blocksStr: string) {
    // 1. Extract blocks from string
    const blocks = extractSearchReplaceBlocks(blocksStr)
    
    // 2. Get file model
    const { model } = this._voidModelService.getModel(uri)
    const modelStr = model.getValue(EndOfLinePreference.LF)
    
    // 3. Find each block in file (with fuzzy matching)
    const replacements: { origStart, origEnd, block }[] = []
    for (const b of blocks) {
        const res = findTextInCode(b.orig, modelStr, true, { returnType: 'lines' })
        // ... calculate character positions
        replacements.push({ origStart, origEnd, block: b })
    }
    
    // 4. Sort and verify no overlaps
    replacements.sort((a, b) => a.origStart - b.origStart)
    // ... check overlaps
    
    // 5. Apply replacements from right to left
    let newCode: string = modelStr
    for (let i = replacements.length - 1; i >= 0; i--) {
        const { origStart, origEnd, block } = replacements[i]
        newCode = newCode.slice(0, origStart) + block.final + newCode.slice(origEnd + 1)
    }
    
    // 6. Write new content
    this._writeURIText(uri, newCode, ...)
}
```

### 7. Fuzzy Matching (`editCodeService.ts`)

The `findTextInCode()` function uses 3 strategies:

```typescript
// Strategy 1: Exact match
let idx = fileContents.indexOf(text, startIdx)
if (idx !== -1) return [startLine, endLine]

// Strategy 2: Normalized whitespace (NEW!)
const textNormalized = normalizeWhitespace(text)  // Trim lines, normalize spaces
const fileNormalized = normalizeWhitespace(fileContents)
idx = fileNormalized.indexOf(textNormalized)
// ... map back to original positions

// Strategy 3: Whitespace-agnostic (last resort)
const textNoWhitespace = removeWhitespaceExceptNewlines(text)
const fileNoWhitespace = removeWhitespaceExceptNewlines(fileContents)
idx = fileNoWhitespace.indexOf(textNoWhitespace)
// ... map back to original positions
```

### 8. Result Stringification (`toolsService.ts`)

`stringOfResult` converts tool results to strings for the LLM:

```typescript
read_file: (params, result) => {
    const truncationWarning = result.hasNextPage 
        ? `\n\n⚠️ FILE TRUNCATED - This file has ${result.totalNumLines} total lines...`
        : ''
    return `${params.uri.fsPath}\n\`\`\`\n${result.fileContents}\n\`\`\`${truncationWarning}`
}
```

## Key Constants

```typescript
MAX_FILE_CHARS_PAGE = 2_000_000  // 2MB per page
MAX_CHILDREN_URIs_PAGE = 500     // Max URIs in directory listings
MAX_TERMINAL_CHARS = 100_000     // Max terminal output
MAX_TERMINAL_INACTIVE_TIME = 8   // Seconds before timeout
```

## Tool Categories

### Context Gathering
- `read_file` - Read file contents (with pagination)
- `ls_dir` - List directory contents
- `get_dir_tree` - Get directory tree structure
- `search_pathnames_only` - Search for files by name
- `search_for_files` - Full-text search across files
- `search_in_file` - Search within a specific file
- `read_lint_errors` - Get linting errors for a file

### File Manipulation
- `create_file_or_folder` - Create new file or folder
- `delete_file_or_folder` - Delete file or folder
- `rewrite_file` - Replace entire file contents
- `edit_file` - Apply search/replace blocks

### Terminal
- `run_command` - Run temporary command
- `run_persistent_command` - Run command in persistent terminal
- `open_persistent_terminal` - Create persistent terminal
- `kill_persistent_terminal` - Close persistent terminal

## Error Handling

Tools throw errors that are caught and returned to the LLM:

```typescript
// Validation errors
throw new Error(`Invalid LLM output: uri was null.`)
throw new Error(`Page number was not an integer: "${pageNumber}".`)

// Execution errors  
throw new Error(`No contents; File does not exist.`)
throw new Error(`Another LLM is currently making changes to this file.`)

// Search/replace errors
throw new Error(`The ORIGINAL code block could not be found in the file...`)
throw new Error(`The ORIGINAL code block appears multiple times...`)
throw new Error(`Multiple ORIGINAL blocks overlap with each other...`)
```

## Recent Improvements

### `edit_file` Tool
- **Three-tier fuzzy matching**: Exact → Normalized whitespace → Whitespace-agnostic
- **Better error messages**: Include tips for LLM on how to fix issues
- **Position mapping**: Correctly maps fuzzy matches back to original file positions

### `read_file` Tool  
- **Increased page size**: 500k → 2MB (4x larger)
- **Clear truncation warnings**: Explicit ⚠️ warnings with next steps
- **Honest descriptions**: No longer claims "full contents" when paginating
