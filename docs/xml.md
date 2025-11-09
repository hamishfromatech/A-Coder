Real-World Examples
​
How Cursor Uses XML Tool Calls
Cursor’s system prompts show extensive use of XML for tool calls:

Copy

Ask AI
<edit_file>
<target_file>src/components/SearchBar.tsx</target_file>
<instruction>Implement debounced search with loading state</instruction>
<code_edit>
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

// ... existing code ...

export function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      setIsLoading(true);
      onSearch(debouncedQuery).finally(() => setIsLoading(false));
    }
  }, [debouncedQuery, onSearch]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border rounded-lg"
      />
      {isLoading && (
        <div className="absolute right-3 top-2.5">
          <LoadingSpinner size="sm" />
        </div>
      )}
    </div>
  );
}

// ... existing code ...
</code_edit>
</edit_file>
​
How Cline Structures Tool Calls
Cline uses XML for all tool interactions, enabling more natural model reasoning:

Copy

Ask AI
<write_to_file>
<path>tests/api.test.ts</path>
<file_text>
import { describe, it, expect, vi } from 'vitest';
import { apiCall } from '../src/utils/api';

describe('API utilities', () => {
  it('should retry failed requests', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      });

    global.fetch = mockFetch;

    const result = await apiCall('/api/test');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: 'success' });
  });
});
</file_text>
</write_to_file>
​
Best Practices
​
1. Clear Tag Naming
Use descriptive, consistent tag names:

Copy

Ask AI
<edit_file>           <!-- Good: Clear intent -->
<modify_code>         <!-- Good: Descriptive -->
<tool_call>           <!-- Avoid: Too generic -->
​
2. Logical Parameter Structure
Organize parameters logically:

Copy

Ask AI
<edit_file>
<target_file>path/to/file.ts</target_file>
<instruction>Human-readable explanation</instruction>
<code_changes>
<!-- Actual code here -->
</code_changes>
</edit_file>
​
3. Content Separation
Keep different content types in separate tags:

Copy

Ask AI
<create_file>
<file_path>src/hooks/useDebounce.ts</file_path>
<file_content>
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
</file_content>
</create_file>
​
4. Error Recovery
Build resilient parsers that can handle minor XML issues:

Copy

Ask AI
function extractCodeFromXML(xmlContent: string): string {
  // Try multiple extraction strategies
  const strategies = [
    () => xmlContent.match(/<code>(.*?)<\/code>/s)?.[1],
    () => xmlContent.match(/<code_changes>(.*?)<\/code_changes>/s)?.[1],
    () => xmlContent.match(/<file_content>(.*?)<\/file_content>/s)?.[1],
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result) return result.trim();
  }

  throw new Error('Could not extract code from XML');
}
​
Migration Guide
​
From JSON to XML
Before (JSON):

Copy

Ask AI
{
  "function": "edit_file",
  "arguments": {
    "file": "app.py",
    "changes": "add error handling"
  }
}
After (XML):

Copy

Ask AI
<edit_file>
<file>app.py</file>
<changes>add comprehensive error handling with logging</changes>
</edit_file>
​
Update System Prompts
Replace JSON-focused instructions:

Copy

Ask AI
Respond with valid JSON tool calls using this schema...
With XML-focused guidance:

Copy

Ask AI
Use XML tool calls for all actions. Focus on clear, descriptive content within tags rather than perfect formatting.
​
Parser Migration
Gradually replace JSON parsers with XML equivalents, maintaining backward compatibility during transition.
​
Performance Comparison
In our testing with Morph Apply, XML tool calls consistently outperform JSON:
30% fewer malformed tool calls
25% better code quality scores
40% faster generation (less constraint overhead)
60% better error recovery rates
The performance gains compound with complexity—the more sophisticated your coding tasks, the greater the XML advantage becomes.
​
Conclusion
XML tool calls represent a paradigm shift from constrained generation to natural language reasoning. By removing JSON’s structural overhead, models can focus entirely on producing high-quality code.
For production coding assistants, XML tool calls aren’t just an optimization—they’re essential for achieving state-of-the-art performance.
Ready to implement XML tool calls? Start by updating your system prompts and parsers, then measure the improvement in your coding assistant’s output quality.


---

# Agent Tools (edit_file)

> Build precise AI agents that edit code fast without full file rewrites using Morph's edit_file tool

## Essential Supporting Tools

<AccordionGroup>
  <Accordion title="read_file: Get Context Before Editing">
    Always read files before editing to understand the structure:

    ```json  theme={null}
    {
      "name": "read_file",
      "description": "Read the contents of a file to understand its structure before making edits",
      "parameters": {
        "properties": {
          "target_file": {
            "type": "string",
            "description": "The path of the file to read"
          },
          "start_line_one_indexed": {
            "type": "integer",
            "description": "Start line number (1-indexed)"
          },
          "end_line_one_indexed_inclusive": {
            "type": "integer",
            "description": "End line number (1-indexed, inclusive)"
          },
          "explanation": {
            "type": "string",
            "description": "Why you're reading this file"
          }
        },
        "required": ["target_file", "explanation"]
      }
    }
    ```

    **Best practice:** Read the relevant sections first, then edit with proper context.
  </Accordion>

  <Accordion title="codebase_search: Find What to Edit">
    Semantic search to locate relevant code:

    ```json  theme={null}
    {
      "name": "codebase_search",
      "description": "Find snippets of code from the codebase most relevant to the search query",
      "parameters": {
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query to find relevant code"
          },
          "target_directories": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional: limit search scope to specific directories"
          },
          "explanation": {
            "type": "string",
            "description": "Why you're searching for this"
          }
        },
        "required": ["query", "explanation"]
      }
    }
    ```

    **Best practice:** Search first to understand the codebase, then read specific files.
  </Accordion>

  <Accordion title="grep_search: Find Exact Matches">
    When you need exact text or pattern matches:

    ```json  theme={null}
    {
      "name": "grep_search",
      "description": "Fast text-based regex search that finds exact pattern matches within files",
      "parameters": {
        "properties": {
          "query": {
            "type": "string",
            "description": "The regex pattern to search for"
          },
          "include_pattern": {
            "type": "string",
            "description": "File types to include (e.g. '*.ts')"
          },
          "explanation": {
            "type": "string",
            "description": "Why you're searching for this pattern"
          }
        },
        "required": ["query", "explanation"]
      }
    }
    ```

    **Best practice:** Use for finding function names, imports, or specific strings.
  </Accordion>

  <Accordion title="list_dir: Explore Directory Structure">
    Navigate and understand the codebase structure:

    ```json  theme={null}
    {
      "name": "list_dir",
      "description": "List the contents of a directory to understand project structure",
      "parameters": {
        "properties": {
          "relative_workspace_path": {
            "type": "string",
            "description": "Path to list contents of, relative to the workspace root"
          },
          "explanation": {
            "type": "string",
            "description": "Why you're listing this directory"
          }
        },
        "required": ["relative_workspace_path", "explanation"]
      }
    }
    ```

    **Best practice:** Use to explore unknown codebases or find related files before editing.
  </Accordion>
</AccordionGroup>

## Agent Workflow

Effective agents follow this pattern:

1. **🔍 Search**: Find relevant code with `codebase_search` or `grep_search`
2. **📖 Read**: Get context with `read_file` before editing
3. **✏️ Edit**: Make precise changes with `edit_file`
4. **✅ Verify**: Read again to confirm changes worked

## Common Patterns

**Delete a section in between:**

```javascript  theme={null}
// ... existing code ...
function keepThis() {
  return "stay";
}

function alsoKeepThis() {
  return "also stay";
}
// ... existing code ...
```

**Add imports:**

```javascript  theme={null}
import { useState, useEffect } from "react";
import { calculateTax } from "./utils"; // New import
// ... existing code ...
```

**Update configuration:**

```json  theme={null}
{
  "name": "my-app",
  "version": "2.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "jest"
  }
}
```

**Add error handling:**

```javascript  theme={null}
// ... existing code ...
function divide(a, b) {
  if (b === 0) {
    throw new Error("Cannot divide by zero");
  }
  return a / b;
}
// ... existing code ...
```

**Update function parameters:**

```javascript  theme={null}
// ... existing code ...
function authenticateUser(email, password) {
  const result = await verifyUser(email, password);
  if (result) {
    return "Authenticated";
  } else {
    return "Unauthenticated";
  }
}
// ... existing code ...
```

**Add new methods to a class:**

```javascript  theme={null}
// ... existing code ...
class UserService {
  async getUser(id) {
    return await this.db.findUser(id);
  }

  async updateUser(id, data) {
    return await this.db.updateUser(id, data);
  }
}
// ... existing code ...
```

## Error Handling

Morph is trained to be robust to poor quality update snippets, but you should still follow these steps to ensure the best quality.
When tools fail, follow these steps:

1. **Check file permissions**: Ensure the target file is writable
2. **Verify file path**: Confirm the file exists and path is correct
3. **Review syntax**: Check that your edit snippet follows the `// ... existing code ...` pattern
4. **Retry with context**: Read the file again and provide more context around your changes
5. **Simplify changes**: Break complex edits into smaller, focused changes

**Common Error Patterns:**

```javascript  theme={null}
// ❌ Wrong - missing context
function newFunction() {
  return "hello";
}

// ✅ Correct - with context
// ... existing code ...
function newFunction() {
  return "hello";
}
// ... existing code ...
```
