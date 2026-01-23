import { URI } from '../../../../base/common/uri.js'
import { RawMCPToolCall } from './mcpServiceTypes.js';
import type { builtinTools } from './prompt/prompts.js';
import { RawToolParamsObj } from './sendLLMMessageTypes.js';



export type TerminalResolveReason = { type: 'timeout' } | { type: 'done', exitCode: number }

export type LintErrorItem = { code: string, message: string, startLineNumber: number, endLineNumber: number }

// Partial of IFileStat
export type ShallowDirectoryItem = {
	uri: URI;
	name: string;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}


export const approvalTypeOfBuiltinToolName: Partial<{ [T in BuiltinToolName]?: 'edits' | 'terminal' | 'MCP tools' | 'forms' }> = {
	'create_file_or_folder': 'edits',
	'delete_file_or_folder': 'edits',
	'rewrite_file': 'edits',
	'edit_file': 'edits',
	'update_walkthrough': 'edits',
	'run_command': 'terminal',
	'open_persistent_terminal': 'terminal',
	'kill_persistent_terminal': 'terminal',
	'render_form': 'forms',
}


export type ToolApprovalType = NonNullable<(typeof approvalTypeOfBuiltinToolName)[keyof typeof approvalTypeOfBuiltinToolName]>;


export const toolApprovalTypes = new Set<ToolApprovalType>([
	...Object.values(approvalTypeOfBuiltinToolName),
	'MCP tools',
])




// PARAMS OF TOOL CALL
export type BuiltinToolCallParams = {
	'read_file': { uri: URI, startLine: number | null, endLine: number | null, pageNumber: number, explanation: string | null },
	'outline_file': { uri: URI },
	'ls_dir': { uri: URI, pageNumber: number },
	'get_dir_tree': { uri: URI },
	'search_pathnames_only': { query: string, includePattern: string | null, pageNumber: number },
	'search_for_files': { query: string, isRegex: boolean, searchInFolder: URI | null, pageNumber: number },
	'search_in_file': { uri: URI, query: string, isRegex: boolean },
	'read_lint_errors': { uri: URI },
	'fast_context': { query: string },
	'codebase_search': {
		query: string,
		repoId?: string,
		branch?: string,
		commitHash?: string,
		target_directories?: string[],
		limit?: number
	},
	'repo_init': { repoId?: string, dir?: string },
	'repo_clone': { repoId: string, dir: string },
	'repo_add': { dir?: string, filepath?: string },
	'repo_commit': { dir?: string, message: string, metadata?: Record<string, any> },
	'repo_push': { dir?: string, branch?: string, index?: boolean, waitForEmbeddings?: boolean },
	'repo_pull': { dir?: string },
	'repo_status': { dir?: string, filepath: string },
	'repo_status_matrix': { dir?: string },
	'repo_log': { dir?: string, depth?: number },
	'repo_checkout': { dir?: string, ref: string },
	'repo_branch': { dir?: string, name: string },
	'repo_list_branches': { dir?: string },
	'repo_current_branch': { dir?: string },
	'repo_resolve_ref': { dir?: string, ref: string },
	'repo_get_commit_metadata': { repoId?: string, commitHash: string },
	'repo_wait_for_embeddings': { repoId?: string, timeoutMs?: number },
	'wait': { timeoutMs: number, persistentTerminalId: string },
	'check_terminal_status': { timeoutMs: number, persistentTerminalId: string },
	// ---
	'rewrite_file': { uri: URI, newContent: string },
	'edit_file': { uri: URI, originalUpdatedBlocks: string, tryFuzzyMatching?: boolean },
	'create_file_or_folder': { uri: URI, isFolder: boolean },
	'delete_file_or_folder': { uri: URI, isRecursive: boolean, isFolder: boolean },
	// ---
	'run_code': { code: string, timeout: number | null },
	// ---
	'run_command': { command: string; cwd: string | null, isBackground: boolean, terminalId?: string },
	'open_persistent_terminal': { cwd: string | null },
	'kill_persistent_terminal': { persistentTerminalId: string },
	// ---
	'create_plan': { goal: string, tasks: Array<{ id: string; description: string; dependencies: string[] }> },
	'update_task_status': { taskId: string, status: string, notes: string | null },
	'get_plan_status': {},
	'add_tasks_to_plan': { tasks: Array<{ id: string; description: string; dependencies: string[] }> },
	// ---
	'create_implementation_plan': {
		goal: string,
		steps: Array<{
			id: string;
			title: string;
			description: string;
			complexity: 'simple' | 'medium' | 'complex';
			files: string[];
			dependencies: string[];
			estimated_time?: number
		}>
	},
	'preview_implementation_plan': {},
	'execute_implementation_plan': { step_id?: string },
	'update_implementation_step': { step_id: string, status: string, notes: string | null },
	'get_implementation_status': {},
	// ---
	'update_walkthrough': { content: string, mode: 'create' | 'append' | 'replace', title?: string, includePlanStatus?: boolean },
	'open_walkthrough_preview': { file_path: string },
	// --- Teaching tools (Student Mode)
	'explain_code': { code: string, language: string, level: 'beginner' | 'intermediate' | 'advanced', focus?: string },
	'teach_concept': { concept: string, level: 'beginner' | 'intermediate' | 'advanced', language?: string, context?: string },
	'create_exercise': { topic: string, difficulty: 'easy' | 'medium' | 'hard', language: string, type: 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code' },
	'check_answer': { exercise_id: string, student_code: string },
	'give_hint': { exercise_id: string },
	'create_lesson_plan': { goal: string, level: 'beginner' | 'intermediate' | 'advanced', time_available?: number },
	'display_lesson': { title: string, content: string },
	'load_skill': { skill_name: string },
	'list_skills': {},
	'generate_image': {
		prompt: string;
		model?: string;
		width?: number;
		height?: number;
		seed?: number;
		enhance?: boolean;
		negative_prompt?: string;
		safe?: boolean;
		quality?: 'low' | 'medium' | 'high' | 'hd';
		transparent?: boolean;
	},
	'generate_video': {
		prompt: string;
		model?: string;
		duration?: number;
		aspectRatio?: '16:9' | '9:16';
		audio?: boolean;
		image?: string;
	},
	// --- Generative UI (Forms & Questions) ---
	'render_form': {
		title?: string;
		description?: string;
		questions: Array<{
			id: string;
			text: string;
			type: 'multiple_choice' | 'single_choice' | 'text' | 'checkbox';
			options?: string[];
			required?: boolean;
		}>;
	},
}

// RESULT OF TOOL CALL
export type BuiltinToolResultType = {
	'read_file': { fileContents: string, totalFileLen: number, totalNumLines: number, hasNextPage: boolean },
	'outline_file': { outline: string, totalNumLines: number },
	'ls_dir': { children: ShallowDirectoryItem[] | null, hasNextPage: boolean, hasPrevPage: boolean, itemsRemaining: number },
	'get_dir_tree': { str: string, },
	'search_pathnames_only': { uris: URI[], hasNextPage: boolean },
	'search_for_files': { uris: URI[], hasNextPage: boolean },
	'search_in_file': { lines: number[]; },
	'read_lint_errors': { lintErrors: LintErrorItem[] | null },
	'fast_context': { contexts: Array<{ file: string, content: string }> },
	'codebase_search': {
		success: boolean,
		results: Array<{
			filepath: string,
			content: string,
			rerankScore: number,
			language: string,
			startLine: number,
			endLine: number
		}>,
		stats: { searchTimeMs: number }
	},
	'repo_init': { success: boolean },
	'repo_clone': { success: boolean },
	'repo_add': { success: boolean },
	'repo_commit': { success: boolean, commitSha?: string },
	'repo_push': { success: boolean },
	'repo_pull': { success: boolean },
	'repo_status': any,
	'repo_status_matrix': any[],
	'repo_log': any[],
	'repo_checkout': { success: boolean },
	'repo_branch': { success: boolean },
	'repo_list_branches': string[],
	'repo_current_branch': string,
	'repo_resolve_ref': string,
	'repo_get_commit_metadata': any,
	'repo_wait_for_embeddings': { success: boolean },
	'wait': { result: string; resolveReason: TerminalResolveReason; },
	'check_terminal_status': { result: string; resolveReason: TerminalResolveReason; },
	// ---
	'rewrite_file': Promise<{ lintErrors: LintErrorItem[] | null }>,
	'edit_file': Promise<{ lintErrors: LintErrorItem[] | null }>,
	'create_file_or_folder': {},
	'delete_file_or_folder': {},
	// ---
	'run_code': { success: boolean, result: any, error: string | null, logs: string[] },
	// ---
	'run_command': { result: string; resolveReason: TerminalResolveReason; terminalId?: string; },
	'open_persistent_terminal': { persistentTerminalId: string },
	'kill_persistent_terminal': {},
	// ---
	'create_plan': { planId: string, summary: string },
	'update_task_status': { taskId: string, newStatus: string, summary: string },
	'get_plan_status': { planExists: boolean, summary: string | null },
	'add_tasks_to_plan': { summary: string },
	// ---
	'create_implementation_plan': { planId: string, summary: string },
	'preview_implementation_plan': { planId: string, goal: string, steps: any[], summary: string },
	'execute_implementation_plan': { stepId: string, status: string, summary: string },
	'update_implementation_step': { stepId: string, newStatus: string, summary: string },
	'get_implementation_status': { planExists: boolean, summary: string | null },
	// ---
	'update_walkthrough': { success: boolean, filePath: string, action: 'created' | 'updated' | 'appended', preview: string },
	'open_walkthrough_preview': { success: boolean, message: string },
	// --- Teaching tools (Student Mode)
	'explain_code': { template: string },
	'teach_concept': { template: string },
	'create_exercise': { exerciseId: string, template: string },
	'check_answer': { template: string },
	'give_hint': { hintLevel: number, template: string },
	'create_lesson_plan': { planId: string, template: string },
	'display_lesson': { success: boolean },
	'load_skill': { skill_name: string, instructions: string, success: boolean },
	'list_skills': { skills: Array<{ name: string, description: string }> },
	'generate_image': { url: string, markdown: string },
	'generate_video': { url: string, markdown: string },
	// --- Generative UI (Forms & Questions)
	'render_form': { template: string },
}


export type ToolCallParams<T extends BuiltinToolName | (string & {})> = T extends BuiltinToolName ? BuiltinToolCallParams[T] : RawToolParamsObj
export type ToolResult<T extends BuiltinToolName | (string & {})> = T extends BuiltinToolName ? BuiltinToolResultType[T] : RawMCPToolCall

export type BuiltinToolName = keyof BuiltinToolResultType

type BuiltinToolParamNameOfTool<T extends BuiltinToolName> = keyof (typeof builtinTools)[T]['params']
export type BuiltinToolParamName = { [T in BuiltinToolName]: BuiltinToolParamNameOfTool<T> }[BuiltinToolName]


export type ToolName = BuiltinToolName | (string & {})
export type ToolParamName<T extends ToolName> = T extends BuiltinToolName ? BuiltinToolParamNameOfTool<T> : string
