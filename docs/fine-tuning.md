# A-Coder Tool Calling Fine-tuning Guide

This document provides the detailed specifications for A-Coder's toolset, intended for fine-tuning Large Language Models to interact with the A-Coder IDE environment.

## General Principles

1.  **Proactivity**: Use tools automatically to gather information (search, read, list) before making changes or answering complex questions.
2.  **Verification**: Always verify changes by reading the file again or checking for lint errors (`read_lint_errors`).
3.  **Context First**: Read a file (`read_file`) before attempting to edit it (`edit_file`) to ensure the `ORIGINAL` blocks match exactly.
4.  **Planning**: For multi-step tasks, use the planning tools (`create_plan` or `create_implementation_plan`) to structure the workflow.
5.  **Schema Adherence**: All tool calls must strictly follow the JSON schema provided.

---

## 1. Context Gathering Tools

### read_file
Reads the contents of a file. Supports line range reading and pagination for large files.

**JSON Schema:**
```json
{
  "name": "read_file",
  "description": "Reads the contents of a file at the specified path. Returns the file content with line numbers prefixed.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL path to the file." },
      "start_line": { "type": "number", "description": "Optional. The starting line number to read from (1-based)." },
      "end_line": { "type": "number", "description": "Optional. The ending line number to read to (1-based, inclusive)." },
      "page_number": { "type": "number", "description": "Optional. Page number for very large files (default: 1)." },
      "explanation": { "type": "string", "description": "Optional. One sentence explanation of why this tool is being used." }
    },
    "required": ["uri"]
  }
}
```

### outline_file
Gets a high-level outline of a file's structure (classes, functions, imports) without reading the implementation.

**JSON Schema:**
```json
{
  "name": "outline_file",
  "description": "Gets a high-level outline of a file's structure (imports, classes, functions) with line numbers.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL path to the file." }
    },
    "required": ["uri"]
  }
}
```

### ls_dir
Lists all files and folders in a directory.

**JSON Schema:**
```json
{
  "name": "ls_dir",
  "description": "Lists all files and folders in a directory.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "Optional. The FULL path to the folder. Empty for root." },
      "page_number": { "type": "number", "description": "Optional. The page number of the result." }
    }
  }
}
```

### get_dir_tree
Gets a recursive tree diagram of all files and folders in a directory.

**JSON Schema:**
```json
{
  "name": "get_dir_tree",
  "description": "Gets a complete tree diagram of all files and folders in a directory (recursive).",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL path to the folder." }
    },
    "required": ["uri"]
  }
}
```

### search_pathnames_only
Searches for files by their filename/pathname.

**JSON Schema:**
```json
{
  "name": "search_pathnames_only",
  "description": "Searches for files by their pathname/filename (does NOT search file contents).",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Your query for the search." },
      "include_pattern": { "type": "string", "description": "Optional glob pattern to limit search." },
      "page_number": { "type": "number", "description": "Optional page number." }
    },
    "required": ["query"]
  }
}
```

### search_for_files
Searches for files by their content (full-text search).

**JSON Schema:**
```json
{
  "name": "search_for_files",
  "description": "Searches for files by their CONTENT (searches inside files, not filenames).",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Your query for the search." },
      "search_in_folder": { "type": "string", "description": "Optional. Searches descendants of this folder only." },
      "is_regex": { "type": "boolean", "description": "Optional. Whether the query is a regex." },
      "page_number": { "type": "number", "description": "Optional page number." }
    },
    "required": ["query"]
  }
}
```

### search_in_file
Searches within a specific file and returns line numbers.

**JSON Schema:**
```json
{
  "name": "search_in_file",
  "description": "Searches within a specific file and returns line numbers where matches are found.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL path to the file." },
      "query": { "type": "string", "description": "The string or regex to search for." },
      "is_regex": { "type": "boolean", "description": "Optional. Whether the query is a regex." }
    },
    "required": ["uri", "query"]
  }
}
```

### fast_context
Gather intelligent context from across the repository using semantic search.

**JSON Schema:**
```json
{
  "name": "fast_context",
  "description": "Gather intelligent context using semantic meaning (warpGrep).",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Semantic query or concept." }
    },
    "required": ["query"]
  }
}
```

---

## 2. File Manipulation & Execution Tools

### run_code
Execute TypeScript/JavaScript code in a sandboxed environment with access to all tools.

**JSON Schema:**
```json
{
  "name": "run_code",
  "description": "Execute TypeScript/JavaScript code in a sandboxed environment with access to all tools.",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "TS/JS code to execute. Use `return` for results." },
      "timeout": { "type": "number", "description": "Optional timeout in ms." }
    },
    "required": ["code"]
  }
}
```

### edit_file
Applies targeted changes using ORIGINAL/UPDATED blocks.

**Format for `original_updated_blocks`:**
```
<<<<<<< ORIGINAL
[exact code from file]
=======
[updated code]
>>>>>>> UPDATED
```

**JSON Schema:**
```json
{
  "name": "edit_file",
  "description": "Edit specific sections of a file using ORIGINAL/UPDATED blocks.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL file path to edit." },
      "original_updated_blocks": { "type": "string", "description": "String of ORIGINAL/UPDATED block(s)." },
      "try_fuzzy_matching": { "type": "boolean", "description": "Optional. Use fuzzy matching if exact match fails." }
    },
    "required": ["uri", "original_updated_blocks"]
  }
}
```

### rewrite_file
Replaces the entire contents of a file.

**JSON Schema:**
```json
{
  "name": "rewrite_file",
  "description": "Replace the entire contents of a file with new content.",
  "parameters": {
    "type": "object",
    "properties": {
      "uri": { "type": "string", "description": "The FULL file path to edit." },
      "new_content": { "type": "string", "description": "The complete new contents of the file." }
    },
    "required": ["uri", "new_content"]
  }
}
```

---

## 3. Terminal & Command Tools

### run_command
Runs a terminal command.

**JSON Schema:**
```json
{
  "name": "run_command",
  "description": "Runs a terminal command in a temporary or persistent terminal.",
  "parameters": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The terminal command to run." },
      "cwd": { "type": "string", "description": "Optional. Directory to run command in." },
      "is_background": { "type": "boolean", "description": "Optional. If true, runs in a new persistent terminal." },
      "terminal_id": { "type": "string", "description": "Optional. ID of an existing persistent terminal." }
    },
    "required": ["command"]
  }
}
```

---

## 4. Planning & Task Management

### create_plan
Creates a structured task plan.

**JSON Schema:**
```json
{
  "name": "create_plan",
  "description": "Creates a structured plan for complex, multi-step tasks.",
  "parameters": {
    "type": "object",
    "properties": {
      "goal": { "type": "string", "description": "Overall goal (e.g., 'Redesign authentication')." },
      "tasks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "description": { "type": "string" },
            "dependencies": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["id", "description", "dependencies"]
        }
      }
    },
    "required": ["goal", "tasks"]
  }
}
```

### create_implementation_plan
Creates a high-level implementation plan for user approval.

**JSON Schema:**
```json
{
  "name": "create_implementation_plan",
  "description": "Creates a detailed implementation plan for review and approval.",
  "parameters": {
    "type": "object",
    "properties": {
      "goal": { "type": "string" },
      "steps": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "title": { "type": "string" },
            "description": { "type": "string" },
            "complexity": { "enum": ["simple", "medium", "complex"] },
            "files": { "type": "array", "items": { "type": "string" } },
            "dependencies": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    },
    "required": ["goal", "steps"]
  }
}
```

---

## 5. Teaching & Learning (Student Mode)

### teach_concept
Introduces a programming concept.

**JSON Schema:**
```json
{
  "name": "teach_concept",
  "description": "Teaches a programming concept from scratch with examples.",
  "parameters": {
    "type": "object",
    "properties": {
      "concept": { "type": "string" },
      "level": { "enum": ["beginner", "intermediate", "advanced"] },
      "language": { "type": "string" },
      "context": { "type": "string" }
    },
    "required": ["concept", "level"]
  }
}
```

### explain_code
Explains code snippets line-by-line.

**JSON Schema:**
```json
{
  "name": "explain_code",
  "description": "Explains code line-by-line at the student's learning level.",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string" },
      "language": { "type": "string" },
      "level": { "enum": ["beginner", "intermediate", "advanced"] },
      "focus": { "type": "string" }
    },
    "required": ["code", "language", "level"]
  }
}
```

---

## 6. Morph Repo Storage (Semantic & Git-like Tools)

### codebase_search
Semantic search over indexed code using natural language.

**JSON Schema:**
```json
{
  "name": "codebase_search",
  "description": "Semantic search over Morph Repo Storage (indexed code).",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Semantic query (e.g., 'How does JWT work?')." },
      "target_directories": { "type": "array", "items": { "type": "string" } },
      "limit": { "type": "number", "default": 10 }
    },
    "required": ["query"]
  }
}
```

### repo_status
Gets the status of a specific file in the Morph repository.

**JSON Schema:**
```json
{
  "name": "repo_status",
  "description": "Get status of a specific file in the repository.",
  "parameters": {
    "type": "object",
    "properties": {
      "dir": { "type": "string", "description": "Repository directory." },
      "filepath": { "type": "string" }
    },
    "required": ["filepath"]
  }
}
```

---

## 7. Skills & Walkthroughs

### load_skill
Loads a specialized skill (e.g., 'pdf-processing') to enhance capabilities.

**JSON Schema:**
```json
{
  "name": "load_skill",
  "description": "Loads a specialized skill to enhance your capabilities.",
  "parameters": {
    "type": "object",
    "properties": {
      "skill_name": { "type": "string" }
    },
    "required": ["skill_name"]
  }
}
```

### update_walkthrough
Updates the `walkthrough.md` file to document progress.

**JSON Schema:**
```json
{
  "name": "update_walkthrough",
  "description": "Creates or updates a walkthrough.md file to document progress.",
  "parameters": {
    "type": "object",
    "properties": {
      "content": { "type": "string", "description": "Markdown content." },
      "mode": { "enum": ["create", "append", "replace"] },
      "title": { "type": "string" },
      "include_plan_status": { "type": "boolean" }
    },
    "required": ["content", "mode"]
  }
}
```

---

## 8. Summary of All Tools

| Category | Tools |
| :--- | :--- |
| **Context** | `read_file`, `outline_file`, `ls_dir`, `get_dir_tree`, `search_pathnames_only`, `search_for_files`, `search_in_file`, `read_lint_errors`, `fast_context`, `codebase_search` |
| **Editing & Exec** | `create_file_or_folder`, `delete_file_or_folder`, `edit_file`, `rewrite_file`, `run_code` |
| **Terminal** | `run_command`, `open_persistent_terminal`, `kill_persistent_terminal`, `wait`, `check_terminal_status` |
| **Planning** | `create_plan`, `update_task_status`, `get_plan_status`, `add_tasks_to_plan`, `create_implementation_plan`, `preview_implementation_plan`, `execute_implementation_plan`, `update_implementation_step`, `get_implementation_status` |
| **Teaching** | `explain_code`, `teach_concept`, `create_exercise`, `check_answer`, `give_hint`, `create_lesson_plan` |
| **Morph Repo** | `repo_init`, `repo_clone`, `repo_add`, `repo_commit`, `repo_push`, `repo_pull`, `repo_status`, `repo_status_matrix`, `repo_log`, `repo_checkout`, `repo_branch`, `repo_list_branches`, `repo_current_branch`, `repo_resolve_ref` |
| **Utilities** | `load_skill`, `list_skills`, `update_walkthrough`, `open_walkthrough_preview` |
