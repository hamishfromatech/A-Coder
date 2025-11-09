## Branding

Name: A-Coder
Tagline: Code with ease

---

## AI Tools & Capabilities

### Built-in Tools (14 total)

#### File Reading & Exploration (6 tools)
- `read_file` - Read file contents with optional line range and pagination
- `ls_dir` - List files and folders in a directory with pagination
- `get_dir_tree` - Get a tree diagram of directory structure
- `search_pathnames_only` - Search for files by name/path (no content search)
- `search_for_files` - Search file contents by substring or regex
- `search_in_file` - Find all line numbers where a pattern appears in a file

#### Code Analysis (1 tool)
- `read_lint_errors` - Get all linting errors for a file

#### File Editing (3 tools)
- `edit_file` - Edit file using SEARCH/REPLACE blocks (fast, targeted edits)
- `rewrite_file` - Replace entire file contents (used for new files)
- `create_file_or_folder` - Create new files or directories

#### File Management (1 tool)
- `delete_file_or_folder` - Delete files or folders (recursive option available)

#### Terminal Execution (3 tools)
- `run_command` - Run a terminal command and wait for result (8s timeout)
- `open_persistent_terminal` - Open a terminal for long-running processes
- `run_persistent_command` - Run commands in persistent terminal
- `kill_persistent_terminal` - Kill a persistent terminal

### MCP Tools (Dynamic)
- Model Context Protocol support for external tools
- User configures in `mcp.json` config file
- Supports text, image, audio, and resource results
- Fully extensible for custom integrations

### Tool Availability by Chat Mode
- **Normal**: No tools (chat-only)
- **Gather**: Read/Search tools only
- **Agent**: All tools + MCP tools

### Key Tool Files
- `src/vs/workbench/contrib/void/common/toolsServiceTypes.ts` - Type definitions
- `src/vs/workbench/contrib/void/common/prompt/prompts.ts` - Tool descriptions
- `src/vs/workbench/contrib/void/browser/toolsService.ts` - Execution logic

---

## macOS MCP Server Fix

### Issue
MCP server support on macOS was failing because commands weren't being resolved through the shell, causing PATH resolution failures.

### Solution
Added `getShellCommand()` helper function in `electron-main/mcpChannel.ts` that:
- **macOS/Linux**: Wraps commands in `/bin/sh -c` to resolve PATH
- **Windows**: Wraps commands in `cmd.exe /c`
- Properly handles command arguments and environment variables

### Changes Made
- File: `src/vs/workbench/contrib/void/electron-main/mcpChannel.ts`
- Added import: `import { platform } from 'os'`
- Added `getShellCommand()` function for cross-platform command resolution
- Updated `_createClientUnsafe()` to use shell-wrapped commands for stdio transport

### Result
MCP servers now properly spawn on macOS with correct PATH resolution.

---

## MCP Tool Execution Fix

### Issue
MCP tools were not being called by the LLM because the `mcpServerName` property wasn't being set on the tools when they were discovered.

### Solution
Updated mcpChannel.ts to add `mcpServerName` property to all MCP tools when they're discovered from the server:
- Line 208: HTTP transport tools
- Line 219: SSE transport tools  
- Line 244: Stdio transport tools (command-based)

### Changes Made
- File: `src/vs/workbench/contrib/void/electron-main/mcpChannel.ts`
- Added `mcpServerName: serverName` to tool mapping in all three transport types
- File: `src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- Added validation that mcpServerName exists before calling MCP tool (line 688)

### Result
MCP tools now properly route to their servers when called by the LLM in agent mode.

---

## MCP Tool Prefix Consistency Fix

### Issue
MCP tool names were being assigned random prefixes each time servers were loaded, causing:
- Duplicate tools appearing in the system message
- Tool name mismatches between system message and tool execution
- LLM unable to reliably call MCP tools

### Solution
Changed `_addUniquePrefix()` function to use deterministic hashing instead of random generation:
- Same tool name always gets the same prefix
- Prevents duplicates on server refresh
- Ensures consistent tool names across the system

### Changes Made
- File: `src/vs/workbench/contrib/void/electron-main/mcpChannel.ts`
- Replaced `Math.random()` with deterministic hash function
- Hash is based on tool name for consistency

### Result
- MCP tools now appear with consistent, deterministic prefixes
- No more duplicate tools
- LLM can reliably identify and call MCP tools

---

## MCP Tool Naming Improvement

### Issue
Tool names were using random hash prefixes like `8uegz6_puppeteer_navigate`, making them:
- Unreadable for users
- Confusing for the LLM
- Hard to understand at a glance

### Solution
Changed from hash-based prefixes to server-namespaced naming:
- **Before**: `8uegz6_puppeteer_navigate`
- **After**: `puppeteer::navigate`

This uses the `::` separator to clearly show which server provides each tool.

### Changes Made
- File: `src/vs/workbench/contrib/void/electron-main/mcpChannel.ts`
- Updated `_addUniquePrefix()` to use `${serverName}::${toolName}` format
- Passed `serverName` parameter to all `_addUniquePrefix()` calls

### Result
- Tool names are now human-readable and self-documenting
- Clear namespace separation prevents conflicts
- LLM can better understand tool purposes from their names
