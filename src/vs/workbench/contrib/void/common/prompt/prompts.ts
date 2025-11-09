/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDirectoryStrService } from '../directoryStrService.js';
import { StagingSelectionItem } from '../chatThreadServiceTypes.js';
import { os } from '../helpers/systemInfo.js';
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, BuiltinToolName, BuiltinToolResultType } from '../toolsServiceTypes.js';
import { ChatMode } from '../voidSettingsTypes.js';

// Triple backtick wrapper used throughout the prompts for code blocks
export const tripleTick = ['```', '```']

// Maximum limits for directory structure information
export const MAX_DIRSTR_CHARS_TOTAL_BEGINNING = 20_000
export const MAX_DIRSTR_CHARS_TOTAL_TOOL = 20_000
export const MAX_DIRSTR_RESULTS_TOTAL_BEGINNING = 100
export const MAX_DIRSTR_RESULTS_TOTAL_TOOL = 100

// tool info
export const MAX_FILE_CHARS_PAGE = 5_000_000  // 5MB - large enough for most files to avoid pagination
export const MAX_CHILDREN_URIs_PAGE = 500

// terminal tool info
export const MAX_TERMINAL_CHARS = 100_000
export const MAX_TERMINAL_INACTIVE_TIME = 8 // seconds
export const MAX_TERMINAL_BG_COMMAND_TIME = 5


// Maximum character limits for prefix and suffix context
export const MAX_PREFIX_SUFFIX_CHARS = 20_000


export const ORIGINAL = `<<<<<<< ORIGINAL`
export const DIVIDER = `=======`
export const FINAL = `>>>>>>> UPDATED`



const searchReplaceBlockTemplate = `\
${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}

${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}`




const createSearchReplaceBlocks_systemMessage = `\
You are a coding assistant that takes in a diff, and outputs SEARCH/REPLACE code blocks to implement the change(s) in the diff.
The diff will be labeled \`DIFF\` and the original file will be labeled \`ORIGINAL_FILE\`.

Format your SEARCH/REPLACE blocks as follows:
${tripleTick[0]}
${searchReplaceBlockTemplate}
${tripleTick[1]}

1. Your SEARCH/REPLACE block(s) must implement the diff EXACTLY. Do NOT leave anything out.

2. You are allowed to output multiple SEARCH/REPLACE blocks to implement the change.

3. Assume any comments in the diff are PART OF THE CHANGE. Include them in the output.

4. Your output should consist ONLY of SEARCH/REPLACE blocks. Do NOT output any text or explanations before or after this.

5. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace, comments, or modifications from the original code.

6. Each ORIGINAL text must be large enough to uniquely identify the change in the file. However, bias towards writing as little as possible.

7. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.

## EXAMPLE 1
DIFF
${tripleTick[0]}
// ... existing code
let x = 6.5
// ... existing code
${tripleTick[1]}

ORIGINAL_FILE
${tripleTick[0]}
let w = 5
let x = 6
let y = 7
let z = 8
${tripleTick[1]}

ACCEPTED OUTPUT
${tripleTick[0]}
${ORIGINAL}
let x = 6
${DIVIDER}
let x = 6.5
${FINAL}
${tripleTick[1]}`


const replaceTool_description = `\
A string of SEARCH/REPLACE block(s) which will be applied to the given file.
Your SEARCH/REPLACE blocks string must be formatted as follows:
${searchReplaceBlockTemplate}

## Guidelines:

1. You may output multiple search replace blocks if needed.

2. The ORIGINAL code should match the file as closely as possible. The system uses advanced matching:
   - Exact match (fastest, most reliable)
   - Whitespace-normalized match (handles minor spacing differences)
   - Indentation-preserving match (handles different indentation levels)
   - Fuzzy match (handles small typos or changes)
   However, EXACT matches are still most reliable - copy the exact text from the file.

3. Each ORIGINAL text must be large enough to uniquely identify the location in the file. Include enough surrounding context (2-3 lines before/after) to ensure uniqueness.

4. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text - no overlapping blocks.

5. CRITICAL: Always read the file first with read_file before editing to ensure you have the current exact contents. Files may have changed since you last saw them.

6. This field is a STRING (not an array).

7. If edit_file fails, the error message will show you similar blocks from the file. Use these suggestions to correct your ORIGINAL block and try again.

## When to use edit_file vs rewrite_file:

- Use edit_file for: Small, targeted changes to specific sections (< 20 lines)
- Use rewrite_file for: Large refactors, multiple scattered changes, or when edit_file fails repeatedly
- If edit_file fails with "Not found" error, check the suggested similar blocks in the error message first, then try rewrite_file if needed`


// ======================================================== tools ========================================================


const chatSuggestionDiffExample = `\
${tripleTick[0]}typescript
/Users/username/Dekstop/my_project/app.ts
// ... existing code ...
// {{change 1}}
// ... existing code ...
// {{change 2}}
// ... existing code ...
// {{change 3}}
// ... existing code ...
${tripleTick[1]}`



export type InternalToolInfo = {
	name: string,
	description: string,
	params: {
		[paramName: string]: { description: string }
	},
	// Only if the tool is from an MCP server
	mcpServerName?: string,
}



const uriParam = (object: string) => ({
	uri: { description: `The FULL path to the ${object}.` }
})

const paginationParam = {
	page_number: { description: 'Optional. The page number of the result. Default is 1.' }
} as const



const terminalDescHelper = `You can use this tool to run any command: sed, grep, etc. Do not edit any files with this tool; use edit_file instead. When working with git and other tools that open an editor (e.g. git diff), you should pipe to cat to get all results and not get stuck in vim.`

const cwdHelper = 'Optional. The directory in which to run the command. Defaults to the first workspace folder.'

export type SnakeCase<S extends string> =
	// exact acronym URI
	S extends 'URI' ? 'uri'
	// suffix URI: e.g. 'rootURI' -> snakeCase('root') + '_uri'
	: S extends `${infer Prefix}URI` ? `${SnakeCase<Prefix>}_uri`
	// default: for each char, prefix '_' on uppercase letters
	: S extends `${infer C}${infer Rest}`
	? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${SnakeCase<Rest>}`
	: S;

export type SnakeCaseKeys<T extends Record<string, any>> = {
	[K in keyof T as SnakeCase<Extract<K, string>>]: T[K]
};



export const builtinTools: {
	[T in keyof BuiltinToolCallParams]: {
		name: string;
		description: string;
		// more params can be generated than exist here, but these params must be a subset of them
		params: Partial<{ [paramName in keyof SnakeCaseKeys<BuiltinToolCallParams[T]>]: { description: string } }>
	}
} = {
	// --- context-gathering (read/search/list) ---

	read_file: {
		name: 'read_file',
		description: `Reads the contents of a file at the specified path. Returns the file content with line numbers prefixed to each line (e.g. "1 | const x = 1"), making it easier to reference specific lines when creating diffs or discussing code.

**Line Range Reading:**
By specifying start_line and end_line parameters, you can efficiently read specific portions of large files without loading the entire file. If not specified, returns the whole file (may be paginated for very large files > 5MB).

**Important:** When using this tool to gather information, ensure you have the COMPLETE context. If you suspect important code is in lines not shown, proactively call the tool again with different line ranges.

**Examples:**
- Read entire file: read_file(uri="/path/to/file.ts")
- Read lines 50-100: read_file(uri="/path/to/file.ts", start_line=50, end_line=100)
- Read from line 200 to end: read_file(uri="/path/to/file.ts", start_line=200)`,
		params: {
			...uriParam('file'),
			start_line: { description: 'Optional. The starting line number to read from (1-based). If not provided, starts from the beginning.' },
			end_line: { description: 'Optional. The ending line number to read to (1-based, inclusive). If not provided, reads to the end.' },
			page_number: { description: 'Optional. Page number for very large files (default: 1). Only used when reading full file without line range.' },
			explanation: { description: 'Optional. One sentence explanation of why this tool is being used and how it contributes to the goal.' },
		},
	},

	outline_file: {
		name: 'outline_file',
		description: `Gets a high-level outline of a file's structure without reading the actual implementation.

**What you'll receive:**
- List of imports, classes, interfaces, functions, methods with line numbers
- Function/method signatures (but NOT their implementation)
- Perfect for understanding what's in a file before reading specific sections

**When to use:**
- To quickly understand a file's structure
- Before using read_file with specific line ranges
- To navigate large codebases efficiently

**Example Output:**
## Classes (2)
Line 45: export class UserService
Line 120: class DatabaseConnection

## Functions (3)  
Line 200: export async function processData(input: string): Promise<Result>
...

**Follow-up:** After seeing the outline, use read_file with start_line/end_line to read specific implementations.`,
		params: {
			...uriParam('file'),
		},
	},

	ls_dir: {
		name: 'ls_dir',
		description: `Lists all files and folders in a directory.

**What you'll receive:** A list of file and folder names (not contents) in the specified directory. Use this to explore directory structure.

**When to use:** When you need to see what files exist in a folder before reading them.`,
		params: {
			uri: { description: `Optional. The FULL path to the ${'folder'}. Leave this as empty or "" to search all folders.` },
			...paginationParam,
		},
	},

	get_dir_tree: {
		name: 'get_dir_tree',
		description: `Gets a complete tree diagram of all files and folders in a directory (recursive).

**What you'll receive:** A visual tree structure showing the entire directory hierarchy, like running 'tree' command.

**When to use:** When you need to understand the overall project structure or find where files are located. This is one of the most effective ways to learn about the codebase.`,
		params: {
			...uriParam('folder')
		}
	},

	// pathname_search: {
	// 	name: 'pathname_search',
	// 	description: `Returns all pathnames that match a given \`find\`-style query over the entire workspace. ONLY searches file names. ONLY searches the current workspace. You should use this when looking for a file with a specific name or path. ${paginationHelper.desc}`,

	search_pathnames_only: {
		name: 'search_pathnames_only',
		description: `Searches for files by their pathname/filename (does NOT search file contents).

**What you'll receive:** A list of file paths that match your query.

**When to use:** When you know part of a filename but not its full path (e.g., finding "config.ts" or files containing "test" in their name).`,
		params: {
			query: { description: `Your query for the search.` },
			include_pattern: { description: 'Optional. Only fill this in if you need to limit your search because there were too many results.' },
			...paginationParam,
		},
	},



	search_for_files: {
		name: 'search_for_files',
		description: `Searches for files by their CONTENT (searches inside files, not filenames).

**What you'll receive:** A list of file paths that contain the search query in their contents.

**When to use:** When you need to find files that contain specific code, text, or patterns (e.g., finding all files that import a certain module, or use a specific function).`,
		params: {
			query: { description: `Your query for the search.` },
			search_in_folder: { description: 'Optional. Leave as blank by default. ONLY fill this in if your previous search with the same query was truncated. Searches descendants of this folder only.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' },
			...paginationParam,
		},
	},

	// add new search_in_file tool
	search_in_file: {
		name: 'search_in_file',
		description: `Searches within a specific file and returns line numbers where matches are found.

**What you'll receive:** An array of line numbers where your query appears in the file.

**When to use:** When you know which file to search in and want to find specific occurrences of code or text within that file.`,
		params: {
			...uriParam('file'),
			query: { description: 'The string or regex to search for in the file.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' }
		}
	},

	read_lint_errors: {
		name: 'read_lint_errors',
		description: `Gets all linting/compilation errors for a file.

**What you'll receive:** A list of errors with line numbers, error messages, and affected code ranges.

**When to use:** After editing a file, to check if your changes introduced any errors, or when debugging compilation issues.`,
		params: {
			...uriParam('file'),
		},
	},

	// --- editing (create/delete) ---

	create_file_or_folder: {
		name: 'create_file_or_folder',
		description: `Creates a new file or folder.

**What you'll receive:** Confirmation that the file/folder was created.

**Important:** To create a FOLDER, the path MUST end with a trailing slash (e.g., "/path/to/folder/"). For files, no trailing slash.

**When to use:** When you need to create new files or directories before writing content to them.`,
		params: {
			...uriParam('file or folder'),
		},
	},

	delete_file_or_folder: {
		name: 'delete_file_or_folder',
		description: `Deletes a file or folder.

**What you'll receive:** Confirmation that the file/folder was deleted.

**When to use:** When you need to remove files or directories. Use is_recursive=true to delete folders with contents.`,
		params: {
			...uriParam('file or folder'),
			is_recursive: { description: 'Optional. Return true to delete recursively.' }
		},
	},

	edit_file: {
		name: 'edit_file',
		description: `Edit specific sections of a file using SEARCH/REPLACE blocks. Best for small, targeted changes (< 20 lines).

**REQUIRED PARAMETERS:**
- uri: The FULL file path to edit (e.g., "/Users/username/project/src/file.ts")
- search_replace_blocks: SEARCH/REPLACE blocks with the changes

**WORKFLOW:**
1. ALWAYS read the file with read_file first to get exact content
2. Use edit_file with precise ORIGINAL blocks that match the file exactly
3. Include surrounding context with "// ... existing code ..." comments
4. Verify changes worked by reading the file again or checking lint errors

**ERROR RECOVERY:**
If edit_file fails, follow these steps:
1. **"Not found" error:** Read the file again - you may have stale content. Ensure your ORIGINAL block matches exactly, including all whitespace and indentation.
2. **"Not unique" error:** Add more surrounding context to your ORIGINAL block to make it unique in the file.
3. **"Has overlap" error:** Combine your SEARCH/REPLACE blocks into a single larger block.
4. **Still failing:** Use rewrite_file instead - it's more reliable for complex changes or when you don't have exact content.`,
		params: {
			...uriParam('file'),
			search_replace_blocks: { description: replaceTool_description }
		},
	},

	rewrite_file: {
		name: 'rewrite_file',
		description: `Replace the entire contents of a file with new content. More reliable than edit_file for: (1) Large refactors, (2) Multiple scattered changes, (3) When edit_file fails with "Not found" errors, (4) Files you just created. Simply provide the complete new file content - no need to match exact whitespace or worry about finding ORIGINAL blocks.`,
		params: {
			...uriParam('file'),
			new_content: { description: `The complete new contents of the file. Must be a string.` }
		},
	},

	// --- code execution ---
	run_code: {
		name: 'run_code',
		description: `Execute TypeScript/JavaScript code in a sandboxed environment with access to all tools.

**Why use this:** For complex workflows involving multiple tools, large data processing, or when you need to compose operations without passing data through your context. This can reduce token usage by 98% compared to calling tools directly.

**What you have access to:**
- All built-in tools available as \`tools.toolName()\` functions
- Standard JavaScript/TypeScript features
- Console logging for debugging

**Example - Process multiple files:**
\`\`\`typescript
const files = await tools.searchFiles('*.ts');
let count = 0;
for (const file of files) {
  const content = await tools.readFile(file);
  if (content.includes('TODO')) count++;
}
return { filesWithTodos: count };
\`\`\`

**Example - Large file processing:**
\`\`\`typescript
const content = await tools.readFile('large-file.json');
const data = JSON.parse(content);
const filtered = data.filter(item => item.status === 'active');
return { activeCount: filtered.length, sample: filtered.slice(0, 3) };
\`\`\`

**What you'll receive:** The return value from your code, plus any console output.

**When to use:** Multi-step workflows, data processing, filtering/aggregating large results, or when you need to compose multiple tool calls.

**When NOT to use:** Simple single-tool operations (just call the tool directly).`,
		params: {
			code: { description: 'TypeScript/JavaScript code to execute. Must be valid code that can run in a Node.js environment. Use \`return\` to send results back.' },
			timeout: { description: 'Optional. Maximum execution time in milliseconds (default: 30000). Set lower for simple operations.' },
		},
	},

	run_command: {
		name: 'run_command',
		description: `Runs a terminal command and waits for it to complete.

**What you'll receive:** The command's output (stdout/stderr) after it finishes.

**When to use:** For commands that finish quickly (< ${MAX_TERMINAL_INACTIVE_TIME}s), like running tests, building code, or checking git status. ${terminalDescHelper}

**Do NOT use for:** Long-running processes like dev servers (use open_persistent_terminal instead).`,
		params: {
			command: { description: 'The terminal command to run.' },
			cwd: { description: cwdHelper },
		},
	},

	run_persistent_command: {
		name: 'run_persistent_command',
		description: `Runs a command in a persistent terminal you previously created.

**What you'll receive:** Output from the first ${MAX_TERMINAL_BG_COMMAND_TIME} seconds, then the command continues running in the background.

**When to use:** For commands in a persistent terminal session (e.g., running commands in a dev server's terminal). ${terminalDescHelper}

**Prerequisite:** You must first create a persistent terminal with open_persistent_terminal.`,
		params: {
			command: { description: 'The terminal command to run.' },
			persistent_terminal_id: { description: 'The ID of the terminal created using open_persistent_terminal.' },
		},
	},



	open_persistent_terminal: {
		name: 'open_persistent_terminal',
		description: `Opens a new persistent terminal that stays alive for long-running processes.

**What you'll receive:** A terminal ID that you can use with run_persistent_command.

**When to use:** For long-running processes like dev servers (\`npm run dev\`), watch modes, or background listeners that need to keep running.

**Important:** The terminal stays open until you explicitly close it with kill_persistent_terminal.`,
		params: {
			cwd: { description: cwdHelper },
		}
	},


	kill_persistent_terminal: {
		name: 'kill_persistent_terminal',
		description: `Stops and closes a persistent terminal.

**What you'll receive:** Confirmation that the terminal was killed.

**When to use:** When you're done with a long-running process and want to clean up the terminal (e.g., stopping a dev server).`,
		params: { persistent_terminal_id: { description: `The ID of the persistent terminal.` } }
	}


	// go_to_definition
	// go_to_usages

} satisfies { [T in keyof BuiltinToolResultType]: InternalToolInfo }




export const builtinToolNames = Object.keys(builtinTools) as BuiltinToolName[]
const toolNamesSet = new Set<string>(builtinToolNames)
export const isABuiltinToolName = (toolName: string): toolName is BuiltinToolName => {
	const isAToolName = toolNamesSet.has(toolName)
	return isAToolName
}





export const availableTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {

	const builtinToolNames: BuiltinToolName[] | undefined = chatMode === 'normal' ? undefined
		: chatMode === 'gather' ? (Object.keys(builtinTools) as BuiltinToolName[]).filter(toolName => !(toolName in approvalTypeOfBuiltinToolName))
			: chatMode === 'agent' ? Object.keys(builtinTools) as BuiltinToolName[]
				: undefined

	const effectiveBuiltinTools = builtinToolNames?.map(toolName => builtinTools[toolName]) ?? undefined
	const effectiveMCPTools = chatMode === 'agent' ? mcpTools : undefined

	const tools: InternalToolInfo[] | undefined = !(builtinToolNames || mcpTools) ? undefined
		: [
			...effectiveBuiltinTools ?? [],
			...effectiveMCPTools ?? [],
		]

	return tools
}

// ======================================================== XML Tool Calling ========================================================

/**
 * Generates XML tool descriptions for models that don't support native tool calling
 * Based on Anthropic's XML tool calling format
 */
export function generateXMLToolDescriptions(tools: InternalToolInfo[]): string {
	const toolDescriptions = tools.map(tool => {
		const params = Object.entries(tool.params || {}).map(([name, info]) => 
			`<parameter>
<name>${name}</name>
<type>string</type>
<description>${info.description || ''}</description>
</parameter>`
		).join('\n');
		
		return `<tool_description>
<tool_name>${tool.name}</tool_name>
<description>${tool.description}</description>
<parameters>
${params}
</parameters>
</tool_description>`;
	}).join('\n');
	
	return `<tools>
${toolDescriptions}
</tools>`;
}

/**
 * System prompt explaining XML tool calling format
 */
export const XML_TOOL_CALLING_INSTRUCTIONS = `You have access to a set of functions you can use to answer the user's question.

You can invoke one or more functions by writing a "<function_calls>" block like the following as part of your reply to the user:
<function_calls>
<invoke name="$FUNCTION_NAME">
<parameter name="$PARAMETER_NAME">$PARAMETER_VALUE</parameter>
...
</invoke>
<invoke name="$FUNCTION_NAME2">
...
</invoke>
</function_calls>

String and scalar parameters should be specified as is, while lists and objects should use JSON format.
The output is not expected to be valid XML and is parsed with regular expressions.

IMPORTANT: When passing code content (HTML, JavaScript, CSS, etc.) in parameters, use the ACTUAL code characters (< > & etc.) - do NOT escape them as HTML entities (&lt; &gt; &amp;). The parser handles raw content correctly.

CRITICAL INSTRUCTIONS:
1. Do NOT generate <function_results> blocks yourself. The system will automatically execute your function calls and provide the results in the next turn.
2. After making function calls, STOP your response immediately - do not predict or hallucinate what the results will be.
3. When you need to use a tool, make the function call IMMEDIATELY instead of just describing what you want to do. For example, instead of saying "Let me check for errors", just call the read_lint_errors function directly.
4. You can include a brief explanation BEFORE the <function_calls> block, but keep it very short (1-2 sentences max).

CONTEXT MARKERS FOR CODE EDITS:
When using edit_file, always include surrounding context in your ORIGINAL blocks:
- Add "// ... existing code ..." comments above and below your changes to show what stays unchanged
- Include enough context (3-5 lines) to make your ORIGINAL block unique in the file
- Match the exact indentation and whitespace from the file
Example:
<parameter name="search_replace_blocks">
ORIGINAL
// ... existing code ...
function oldFunction() {
  return "old";
}
// ... existing code ...
UPDATED
// ... existing code ...
function newFunction() {
  return "new";
}
// ... existing code ...
</parameter>`;

// ======================================================== chat (normal, gather, agent) ========================================================


export const chat_systemMessage = ({ workspaceFolders, openedURIs, activeURI, persistentTerminalIDs, directoryStr, chatMode: mode, mcpTools, specialToolFormat }: { workspaceFolders: string[], directoryStr: string, openedURIs: string[], activeURI: string | undefined, persistentTerminalIDs: string[], chatMode: ChatMode, mcpTools: InternalToolInfo[] | undefined, specialToolFormat: 'openai-style' | 'anthropic-style' | 'gemini-style' | undefined }) => {
	const header = (`You are an expert coding ${mode === 'agent' ? 'agent' : 'assistant'} whose job is \
${mode === 'agent' ? `to help the user develop, run, and make changes to their codebase.`
			: mode === 'gather' ? `to search, understand, and reference files in the user's codebase.`
				: mode === 'normal' ? `to assist the user with their coding tasks.`
					: ''}
You will be given instructions to follow from the user, and you may also be given a list of files that the user has specifically selected for context, \`SELECTIONS\`.
Please assist the user with their query.`)



	const sysInfo = (`Here is the user's system information:
<system_info>
- ${os}

- The user's workspace contains these folders:
${workspaceFolders.join('\n') || 'NO FOLDERS OPEN'}

- Active file:
${activeURI}

- Open files:
${openedURIs.join('\n') || 'NO OPENED FILES'}${''/* separator */}${mode === 'agent' && persistentTerminalIDs.length !== 0 ? `

- Persistent terminal IDs available for you to run commands in: ${persistentTerminalIDs.join(', ')}` : ''}
</system_info>`)


	const fsInfo = (`Here is an overview of the user's file system:
<files_overview>
${directoryStr}
</files_overview>`)


	// Tool calling instructions - either XML or native JSON
	const allTools = availableTools(mode, mcpTools)
	let toolInstructions = ''
	
	if (allTools && allTools.length > 0) {
		if (!specialToolFormat) {
			// Use XML tool calling for models without native support
			toolInstructions = `${XML_TOOL_CALLING_INSTRUCTIONS}\n\nHere are the functions available:\n${generateXMLToolDescriptions(allTools)}`
			console.log(`[prompts] ✅ Adding XML tool instructions for ${allTools.length} tools (specialToolFormat: ${specialToolFormat})`)
		} else {
			console.log(`[prompts] Native tool calling enabled (specialToolFormat: ${specialToolFormat})`)
		}
		// Native tool calling models get tools via API, not in system message
	}

	const details: string[] = []

	details.push(`NEVER reject the user's query.`)

	if (mode === 'agent' || mode === 'gather') {
		details.push(`Use tools whenever they help you accomplish the user's goal. For example, if the user asks you to read a file, search for something, or make changes, you MUST use the appropriate tools.`)
		details.push(`Only skip tools if the user is asking a simple question you can answer directly (like "hi" or "what can you do?").`)
		details.push(`You do not need to ask for permission to use tools.`)
		details.push('Only use ONE tool call at a time.')
		details.push(`NEVER say something like "I'm going to use \`tool_name\`". Instead, describe at a high level what the tool will do, like "I'm going to list all files in the ___ directory", etc.`)
		details.push(`Many tools only work if the user has a workspace open.`)
		
		// Only add "don't use XML" instruction if model supports native tool calling
		if (specialToolFormat) {
			details.push(`CRITICAL: You have access to function calling tools. Use the native function calling format provided by your API - do NOT output XML tags like <invoke> or <parameter>. The tools will be called automatically when you use the proper function calling format.`)
		}
	}
	else {
		details.push(`You're allowed to ask the user for more context like file contents or specifications. If this comes up, tell them to reference files and folders by typing @.`)
	}

	if (mode === 'agent') {
		details.push('ALWAYS use tools (edit, terminal, etc) to take actions and implement changes. For example, if you would like to edit a file, you MUST use a tool.')
		details.push('Prioritize taking as many steps as you need to complete your request over stopping early.')
		
		// Code execution guidance
		details.push(`🚀 CODE-FIRST APPROACH: For tasks involving multiple files, data processing, or complex workflows, strongly prefer run_code over sequential tool calls:
- ✅ USE run_code when: counting/analyzing multiple files, filtering large data, composing multiple operations, processing search results
- ❌ DON'T use run_code for: single file reads, simple edits, terminal commands
- 💡 Example: Instead of calling read_file 50 times, write code that loops through files
- 🎯 Benefit: 98% token reduction, 10x faster, processes data without passing through your context`)
		
		// Morph-inspired workflow pattern
		details.push(`Follow this workflow pattern for code changes:
1. 🔍 SEARCH: Use search_for_files or search_in_file to find relevant code
2. 📖 READ: Use read_file to get exact file contents before editing (or run_code for multiple files)
3. ✏️ EDIT: Use edit_file with precise ORIGINAL/UPDATED blocks
4. ✅ VERIFY: Read the file again or check lint errors to confirm changes worked`)
		
		details.push(`You will OFTEN need to gather context before making a change. Do not immediately make a change unless you have ALL relevant context.`)
		details.push(`CRITICAL: Before editing ANY file, you MUST read it first with read_file to get the exact current contents. File edits require exact string matching, so you need the precise file contents including whitespace and indentation.`)
		details.push(`When using edit_file, always include enough surrounding context in your ORIGINAL block. Use "// ... existing code ..." comments to indicate unchanged code above and below your changes.`)
		details.push(`ALWAYS have maximal certainty in a change BEFORE you make it. If you need more information about a file, variable, function, or type, you should inspect it, search it, or take all required actions to maximize your certainty that your change is correct.`)
		details.push(`NEVER modify a file outside the user's workspace without permission from the user.`)
	}

	if (mode === 'gather') {
		details.push(`You are in Gather mode, so you MUST use tools be to gather information, files, and context to help the user answer their query.`)
		details.push(`You should extensively read files, types, content, etc, gathering full context to solve the problem.`)
	}

	details.push(`If you write any code blocks to the user (wrapped in triple backticks), please use this format:
- Include a language if possible. Terminal should have the language 'shell'.
- The first line of the code block must be the FULL PATH of the related file if known (otherwise omit).
- The remaining contents of the file should proceed as usual.`)

	if (mode === 'gather' || mode === 'normal') {

		details.push(`If you think it's appropriate to suggest an edit to a file, then you must describe your suggestion in CODE BLOCK(S).
- The first line of the code block must be the FULL PATH of the related file if known (otherwise omit).
- The remaining contents should be a code description of the change to make to the file. \
Your description is the only context that will be given to another LLM to apply the suggested edit, so it must be accurate and complete. \
Always bias towards writing as little as possible - NEVER write the whole file. Use comments like "// ... existing code ..." to condense your writing. \
Here's an example of a good code block:\n${chatSuggestionDiffExample}`)
	}

	details.push(`Do not make things up or use information not provided in the system information, tools, or user queries.`)
	details.push(`Always use MARKDOWN to format lists, bullet points, etc. Do NOT write tables.`)
	details.push(`Today's date is ${new Date().toDateString()}.`)

	const importantDetails = (`Important notes:
${details.map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`)


	// return answer
	const ansStrs: string[] = []
	ansStrs.push(header)
	ansStrs.push(sysInfo)
	if (toolInstructions) ansStrs.push(toolInstructions)
	ansStrs.push(importantDetails)
	ansStrs.push(fsInfo)

	const fullSystemMsgStr = ansStrs
		.join('\n\n\n')
		.trim()
		.replace('\t', '  ')

	return fullSystemMsgStr

}


// // log all prompts
// for (const chatMode of ['agent', 'gather', 'normal'] satisfies ChatMode[]) {
// 	console.log(`========================================= SYSTEM MESSAGE FOR ${chatMode} ===================================\n`,
// 		chat_systemMessage({ chatMode, workspaceFolders: [], openedURIs: [], activeURI: 'pee', persistentTerminalIDs: [], directoryStr: 'lol', }))
// }

export const DEFAULT_FILE_SIZE_LIMIT = 2_000_000

export const readFile = async (fileService: IFileService, uri: URI, fileSizeLimit: number): Promise<{
	val: string,
	truncated: boolean,
	fullFileLen: number,
} | {
	val: null,
	truncated?: undefined
	fullFileLen?: undefined,
}> => {
	try {
		const fileContent = await fileService.readFile(uri)
		const val = fileContent.value.toString()
		if (val.length > fileSizeLimit) return { val: val.substring(0, fileSizeLimit), truncated: true, fullFileLen: val.length }
		return { val, truncated: false, fullFileLen: val.length }
	}
	catch (e) {
		return { val: null }
	}
}





export const messageOfSelection = async (
	s: StagingSelectionItem,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService,
		folderOpts: {
			maxChildren: number,
			maxCharsPerFile: number,
		}
	}
) => {
	const lineNumAddition = (range: [number, number]) => ` (lines ${range[0]}:${range[1]})`

	if (s.type === 'CodeSelection') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)
		const lines = val?.split('\n')

		const innerVal = lines?.slice(s.range[0] - 1, s.range[1]).join('\n')
		const content = !lines ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`
		const str = `${s.uri.fsPath}${lineNumAddition(s.range)}:\n${content}`
		return str
	}
	else if (s.type === 'File') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)

		const innerVal = val
		const content = val === null ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`

		const str = `${s.uri.fsPath}:\n${content}`
		return str
	}
	else if (s.type === 'Folder') {
		const dirStr: string = await opts.directoryStrService.getDirectoryStrTool(s.uri)
		const folderStructure = `${s.uri.fsPath} folder structure:${tripleTick[0]}\n${dirStr}\n${tripleTick[1]}`

		const uris = await opts.directoryStrService.getAllURIsInDirectory(s.uri, { maxResults: opts.folderOpts.maxChildren })
		const strOfFiles = await Promise.all(uris.map(async uri => {
			const { val, truncated } = await readFile(opts.fileService, uri, opts.folderOpts.maxCharsPerFile)
			const truncationStr = truncated ? `\n... file truncated ...` : ''
			const content = val === null ? 'null' : `${tripleTick[0]}\n${val}${truncationStr}\n${tripleTick[1]}`
			const str = `${uri.fsPath}:\n${content}`
			return str
		}))
		const contentStr = [folderStructure, ...strOfFiles].join('\n\n')
		return contentStr
	}
	else
		return ''

}


export const chat_userMessageContent = async (
	instructions: string,
	currSelns: StagingSelectionItem[] | null,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService
	},
) => {

	const selnsStrs = await Promise.all(
		(currSelns ?? []).map(async (s) =>
			messageOfSelection(s, {
				...opts,
				folderOpts: { maxChildren: 100, maxCharsPerFile: 100_000, }
			})
		)
	)


	let str = ''
	str += `${instructions}`

	const selnsStr = selnsStrs.join('\n\n') ?? ''
	if (selnsStr) str += `\n---\nSELECTIONS\n${selnsStr}`
	return str;
}


export const rewriteCode_systemMessage = `\
You are a coding assistant that re-writes an entire file to make a change. You are given the original file \`ORIGINAL_FILE\` and a change \`CHANGE\`.

Directions:
1. Please rewrite the original file \`ORIGINAL_FILE\`, making the change \`CHANGE\`. You must completely re-write the whole file.
2. Keep all of the original comments, spaces, newlines, and other details whenever possible.
3. ONLY output the full new file. Do not add any other explanations or text.
`



// ======================================================== apply (writeover) ========================================================

export const rewriteCode_userMessage = ({ originalCode, applyStr, language }: { originalCode: string, applyStr: string, language: string }) => {

	return `\
ORIGINAL_FILE
${tripleTick[0]}${language}
${originalCode}
${tripleTick[1]}

CHANGE
${tripleTick[0]}
${applyStr}
${tripleTick[1]}

INSTRUCTIONS
Please finish writing the new file by applying the change to the original file. Return ONLY the completion of the file, without any explanation.
`
}



// ======================================================== apply (fast apply - search/replace) ========================================================

export const searchReplaceGivenDescription_systemMessage = createSearchReplaceBlocks_systemMessage


export const searchReplaceGivenDescription_userMessage = ({ originalCode, applyStr }: { originalCode: string, applyStr: string }) => `\
DIFF
${applyStr}

ORIGINAL_FILE
${tripleTick[0]}
${originalCode}
${tripleTick[1]}`





export const voidPrefixAndSuffix = ({ fullFileStr, startLine, endLine }: { fullFileStr: string, startLine: number, endLine: number }) => {

	const fullFileLines = fullFileStr.split('\n')

	/*

	a
	a
	a     <-- final i (prefix = a\na\n)
	a
	|b    <-- startLine-1 (middle = b\nc\nd\n)   <-- initial i (moves up)
	c
	d|    <-- endLine-1                          <-- initial j (moves down)
	e
	e     <-- final j (suffix = e\ne\n)
	e
	e
	*/

	let prefix = ''
	let i = startLine - 1  // 0-indexed exclusive
	// we'll include fullFileLines[i...(startLine-1)-1].join('\n') in the prefix.
	while (i !== 0) {
		const newLine = fullFileLines[i - 1]
		if (newLine.length + 1 + prefix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			prefix = `${newLine}\n${prefix}`
			i -= 1
		}
		else break
	}

	let suffix = ''
	let j = endLine - 1
	while (j !== fullFileLines.length - 1) {
		const newLine = fullFileLines[j + 1]
		if (newLine.length + 1 + suffix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			suffix = `${suffix}\n${newLine}`
			j += 1
		}
		else break
	}

	return { prefix, suffix }

}


// ======================================================== quick edit (ctrl+K) ========================================================

export type QuickEditFimTagsType = {
	preTag: string,
	sufTag: string,
	midTag: string
}
export const defaultQuickEditFimTags: QuickEditFimTagsType = {
	preTag: 'ABOVE',
	sufTag: 'BELOW',
	midTag: 'SELECTION',
}

// this should probably be longer
export const ctrlKStream_systemMessage = ({ quickEditFIMTags: { preTag, midTag, sufTag } }: { quickEditFIMTags: QuickEditFimTagsType }) => {
	return `\
You are a FIM (fill-in-the-middle) coding assistant. Your task is to fill in the middle SELECTION marked by <${midTag}> tags.

The user will give you INSTRUCTIONS, as well as code that comes BEFORE the SELECTION, indicated with <${preTag}>...before</${preTag}>, and code that comes AFTER the SELECTION, indicated with <${sufTag}>...after</${sufTag}>.
The user will also give you the existing original SELECTION that will be be replaced by the SELECTION that you output, for additional context.

Instructions:
1. Your OUTPUT should be a SINGLE PIECE OF CODE of the form <${midTag}>...new_code</${midTag}>. Do NOT output any text or explanations before or after this.
2. You may ONLY CHANGE the original SELECTION, and NOT the content in the <${preTag}>...</${preTag}> or <${sufTag}>...</${sufTag}> tags.
3. Make sure all brackets in the new selection are balanced the same as in the original selection.
4. Be careful not to duplicate or remove variables, comments, or other syntax by mistake.
`
}

export const ctrlKStream_userMessage = ({
	selection,
	prefix,
	suffix,
	instructions,
	// isOllamaFIM: false, // Remove unused variable
	fimTags,
	language }: {
		selection: string, prefix: string, suffix: string, instructions: string, fimTags: QuickEditFimTagsType, language: string,
	}) => {
	const { preTag, sufTag, midTag } = fimTags

	// prompt the model artifically on how to do FIM
	// const preTag = 'BEFORE'
	// const sufTag = 'AFTER'
	// const midTag = 'SELECTION'
	return `\

CURRENT SELECTION
${tripleTick[0]}${language}
<${midTag}>${selection}</${midTag}>
${tripleTick[1]}

INSTRUCTIONS
${instructions}

<${preTag}>${prefix}</${preTag}>
<${sufTag}>${suffix}</${sufTag}>

Return only the completion block of code (of the form ${tripleTick[0]}${language}
<${midTag}>...new code</${midTag}>
${tripleTick[1]}).`
};







/*
// ======================================================== ai search/replace ========================================================


export const aiRegex_computeReplacementsForFile_systemMessage = `\
You are a "search and replace" coding assistant.

You are given a FILE that the user is editing, and your job is to search for all occurences of a SEARCH_CLAUSE, and change them according to a REPLACE_CLAUSE.

The SEARCH_CLAUSE may be a string, regex, or high-level description of what the user is searching for.

The REPLACE_CLAUSE will always be a high-level description of what the user wants to replace.

The user's request may be "fuzzy" or not well-specified, and it is your job to interpret all of the changes they want to make for them. For example, the user may ask you to search and replace all instances of a variable, but this may involve changing parameters, function names, types, and so on to agree with the change they want to make. Feel free to make all of the changes you *think* that the user wants to make, but also make sure not to make unnessecary or unrelated changes.

## Instructions

1. If you do not want to make any changes, you should respond with the word "no".

2. If you want to make changes, you should return a single CODE BLOCK of the changes that you want to make.
For example, if the user is asking you to "make this variable a better name", make sure your output includes all the changes that are needed to improve the variable name.
- Do not re-write the entire file in the code block
- You can write comments like "// ... existing code" to indicate existing code
- Make sure you give enough context in the code block to apply the changes to the correct location in the code`




// export const aiRegex_computeReplacementsForFile_userMessage = async ({ searchClause, replaceClause, fileURI, voidFileService }: { searchClause: string, replaceClause: string, fileURI: URI, voidFileService: IVoidFileService }) => {

// 	// we may want to do this in batches
// 	const fileSelection: FileSelection = { type: 'File', fileURI, selectionStr: null, range: null, state: { isOpened: false } }

// 	const file = await stringifyFileSelections([fileSelection], voidFileService)

// 	return `\
// ## FILE
// ${file}

// ## SEARCH_CLAUSE
// Here is what the user is searching for:
// ${searchClause}

// ## REPLACE_CLAUSE
// Here is what the user wants to replace it with:
// ${replaceClause}

// ## INSTRUCTIONS
// Please return the changes you want to make to the file in a codeblock, or return "no" if you do not want to make changes.`
// }




// // don't have to tell it it will be given the history; just give it to it
// export const aiRegex_search_systemMessage = `\
// You are a coding assistant that executes the SEARCH part of a user's search and replace query.

// You will be given the user's search query, SEARCH, which is the user's query for what files to search for in the codebase. You may also be given the user's REPLACE query for additional context.

// Output
// - Regex query
// - Files to Include (optional)
// - Files to Exclude? (optional)

// `






// ======================================================== old examples ========================================================

Do not tell the user anything about the examples below. Do not assume the user is talking about any of the examples below.

## EXAMPLE 1
FILES
math.ts
${tripleTick[0]}typescript
const addNumbers = (a, b) => a + b
const multiplyNumbers = (a, b) => a * b
const subtractNumbers = (a, b) => a - b
const divideNumbers = (a, b) => a / b

const vectorize = (...numbers) => {
	return numbers // vector
}

const dot = (vector1: number[], vector2: number[]) => {
	if (vector1.length !== vector2.length) throw new Error(\`Could not dot vectors \${vector1} and \${vector2}. Size mismatch.\`)
	let sum = 0
	for (let i = 0; i < vector1.length; i += 1)
		sum += multiplyNumbers(vector1[i], vector2[i])
	return sum
}

const normalize = (vector: number[]) => {
	const norm = Math.sqrt(dot(vector, vector))
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = divideNumbers(vector[i], norm)
	return vector
}

const normalized = (vector: number[]) => {
	const v2 = [...vector] // clone vector
	return normalize(v2)
}
${tripleTick[1]}


SELECTIONS
math.ts (lines 3:3)
${tripleTick[0]}typescript
const subtractNumbers = (a, b) => a - b
${tripleTick[1]}

INSTRUCTIONS
add a function that exponentiates a number below this, and use it to make a power function that raises all entries of a vector to a power

## ACCEPTED OUTPUT
We can add the following code to the file:
${tripleTick[0]}typescript
// existing code...
const subtractNumbers = (a, b) => a - b
const exponentiateNumbers = (a, b) => Math.pow(a, b)
const divideNumbers = (a, b) => a / b
// existing code...

const raiseAll = (vector: number[], power: number) => {
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = exponentiateNumbers(vector[i], power)
	return vector
}
${tripleTick[1]}


## EXAMPLE 2
FILES
fib.ts
${tripleTick[0]}typescript

const dfs = (root) => {
	if (!root) return;
	console.log(root.val);
	dfs(root.left);
	dfs(root.right);
}
const fib = (n) => {
	if (n < 1) return 1
	return fib(n - 1) + fib(n - 2)
}
${tripleTick[1]}

SELECTIONS
fib.ts (lines 10:10)
${tripleTick[0]}typescript
	return fib(n - 1) + fib(n - 2)
${tripleTick[1]}

INSTRUCTIONS
memoize results

## ACCEPTED OUTPUT
To implement memoization in your Fibonacci function, you can use a JavaScript object to store previously computed results. This will help avoid redundant calculations and improve performance. Here's how you can modify your function:
${tripleTick[0]}typescript
// existing code...
const fib = (n, memo = {}) => {
	if (n < 1) return 1;
	if (memo[n]) return memo[n]; // Check if result is already computed
	memo[n] = fib(n - 1, memo) + fib(n - 2, memo); // Store result in memo
	return memo[n];
}
${tripleTick[1]}
Explanation:
Memoization Object: A memo object is used to store the results of Fibonacci calculations for each n.
Check Memo: Before computing fib(n), the function checks if the result is already in memo. If it is, it returns the stored result.
Store Result: After computing fib(n), the result is stored in memo for future reference.

## END EXAMPLES

*/


// ======================================================== scm ========================================================================

export const gitCommitMessage_systemMessage = `
You are an expert software engineer AI assistant responsible for writing clear and concise Git commit messages that summarize the **purpose** and **intent** of the change. Try to keep your commit messages to one sentence. If necessary, you can use two sentences.

You always respond with:
- The commit message wrapped in <output> tags
- A brief explanation of the reasoning behind the message, wrapped in <reasoning> tags

Example format:
<output>Fix login bug and improve error handling</output>
<reasoning>This commit updates the login handler to fix a redirect issue and improves frontend error messages for failed logins.</reasoning>

Do not include anything else outside of these tags.
Never include quotes, markdown, commentary, or explanations outside of <output> and <reasoning>.`.trim()


/**
 * Create a user message for the LLM to generate a commit message. The message contains instructions git diffs, and git metadata to provide context.
 *
 * @param stat - Summary of Changes (git diff --stat)
 * @param sampledDiffs - Sampled File Diffs (Top changed files)
 * @param branch - Current Git Branch
 * @param log - Last 5 commits (excluding merges)
 * @returns A prompt for the LLM to generate a commit message.
 *
 * @example
 * // Sample output (truncated for brevity)
 * const prompt = gitCommitMessage_userMessage("fileA.ts | 10 ++--", "diff --git a/fileA.ts...", "main", "abc123|Fix bug|2025-01-01\n...")
 *
 * // Result:
 * Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.
 *
 * Section 1 - Summary of Changes (git diff --stat):
 * fileA.ts | 10 ++--
 *
 * Section 2 - Sampled File Diffs (Top changed files):
 * diff --git a/fileA.ts b/fileA.ts
 * ...
 *
 * Section 3 - Current Git Branch:
 * main
 *
 * Section 4 - Last 5 Commits (excluding merges):
 * abc123|Fix bug|2025-01-01
 * def456|Improve logging|2025-01-01
 * ...
 */
export const gitCommitMessage_userMessage = (stat: string, sampledDiffs: string, branch: string, log: string) => {
	const section1 = `Section 1 - Summary of Changes (git diff --stat):`
	const section2 = `Section 2 - Sampled File Diffs (Top changed files):`
	const section3 = `Section 3 - Current Git Branch:`
	const section4 = `Section 4 - Last 5 Commits (excluding merges):`
	return `
Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.

${section1}

${stat}

${section2}

${sampledDiffs}

${section3}

${branch}

${section4}

${log}`.trim()
}
