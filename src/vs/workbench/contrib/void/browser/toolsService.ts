import { CancellationToken } from '../../../../base/common/cancellation.js'
import * as path from '../../../../base/common/path.js'
import { URI } from '../../../../base/common/uri.js'
import { VSBuffer } from '../../../../base/common/buffer.js'
import { IFileService } from '../../../../platform/files/common/files.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js'
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js'
import { ISearchService } from '../../../services/search/common/search.js'
import { IEditCodeService } from './editCodeServiceInterface.js'
import { ITerminalToolService } from './terminalToolService.js'
import { LintErrorItem, BuiltinToolCallParams, BuiltinToolResultType, BuiltinToolName } from '../common/toolsServiceTypes.js'
import { IVoidModelService } from '../common/voidModelService.js'
import { EndOfLinePreference } from '../../../../editor/common/model.js'
import { computeDirectoryTree1Deep, IDirectoryStrService, stringifyDirectoryTree1Deep } from '../common/directoryStrService.js'
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js'
import { timeout } from '../../../../base/common/async.js'
import { RawToolParamsObj } from '../common/sendLLMMessageTypes.js'
import { MAX_CHILDREN_URIs_PAGE, MAX_FILE_CHARS_PAGE, MAX_TERMINAL_BG_COMMAND_TIME, MAX_TERMINAL_INACTIVE_TIME } from '../common/prompt/prompts.js'
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js'
import { generateUuid } from '../../../../base/common/uuid.js'
import { IMorphService } from './morphService.js'
import { ToonService } from '../common/toonService.js'
import { PlanningService, TaskStatus as PlanTaskStatus } from '../common/planningService.js'
import { ImplementationPlanningService, ImplementationPlan, ImplementationStep, StepStatus as ImplStepStatus } from '../common/implementationPlanningService.js'
import { IAgentManagerService } from './agentManager.contribution.js'
import { IPathService } from '../../../services/path/common/pathService.js'


// tool use for AI
type ValidateBuiltinParams = { [T in BuiltinToolName]: (p: RawToolParamsObj) => BuiltinToolCallParams[T] }
type CallBuiltinTool = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T], opts?: { onData?: (data: string) => void }) => Promise<{ result: BuiltinToolResultType[T] | Promise<BuiltinToolResultType[T]>, interruptTool?: () => void }> }
type BuiltinToolResultToString = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T], result: Awaited<BuiltinToolResultType[T]>) => string }


const isFalsy = (u: unknown) => {
	return !u || u === 'null' || u === 'undefined'
}

// Helper to parse JSON that might be in JavaScript object notation (unquoted keys)
// Some LLMs output { id: "value" } instead of { "id": "value" }
const parseJSONOrJSObject = (str: string): any => {
	// First try standard JSON parse
	try {
		return JSON.parse(str)
	} catch (e) {
		// Try to convert JS object notation to JSON by quoting unquoted keys
		// This handles: { id: "value" } -> { "id": "value" }
		try {
			// Quote unquoted keys: matches word characters followed by colon
			const jsonified = str.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
			return JSON.parse(jsonified)
		} catch (e2) {
			// If that fails too, throw the original error
			throw e
		}
	}
}

const validateStr = (argName: string, value: unknown) => {
	if (value === null) throw new Error(`Invalid LLM output: ${argName} was null.`)
	if (typeof value !== 'string') throw new Error(`Invalid LLM output format: ${argName} must be a string, but its type is "${typeof value}". Full value: ${JSON.stringify(value)}.`)
	return value
}


// We are NOT checking to make sure in workspace
const validateURI = (uriStr: unknown) => {
	if (uriStr === null) throw new Error(`Invalid LLM output: uri was null. You must provide the file path as the 'uri' parameter.`)
	if (uriStr === undefined) throw new Error(`Invalid LLM output: uri was not provided. You MUST include the 'uri' parameter with the full file path (e.g., "/Users/username/project/src/file.ts").`)
	if (typeof uriStr !== 'string') throw new Error(`Invalid LLM output format: Provided uri must be a string, but it's a(n) ${typeof uriStr}. Full value: ${JSON.stringify(uriStr)}.`)

	// Check if it's already a full URI with scheme (e.g., vscode-remote://, file://, etc.)
	// Look for :// pattern which indicates a scheme is present
	// Examples of supported URIs:
	// - vscode-remote://wsl+Ubuntu/home/user/file.txt (WSL)
	// - vscode-remote://ssh-remote+myserver/home/user/file.txt (SSH)
	// - file:///home/user/file.txt (local file with scheme)
	// - /home/user/file.txt (local file path, will be converted to file://)
	// - C:\Users\file.txt (Windows local path, will be converted to file://)
	if (uriStr.includes('://')) {
		try {
			const uri = URI.parse(uriStr)
			return uri
		} catch (e) {
			// If parsing fails, it's a malformed URI
			throw new Error(`Invalid URI format: ${uriStr}. Error: ${e}`)
		}
	} else {
		// No scheme present, treat as file path
		// This handles regular file paths like /home/user/file.txt or C:\Users\file.txt
		const uri = URI.file(uriStr)
		return uri
	}
}

const validateOptionalURI = (uriStr: unknown) => {
	if (isFalsy(uriStr)) return null
	return validateURI(uriStr)
}

const validateOptionalStr = (argName: string, str: unknown) => {
	if (isFalsy(str)) return null
	return validateStr(argName, str)
}


const validatePageNum = (pageNumberUnknown: unknown) => {
	if (!pageNumberUnknown) return 1
	const parsedInt = Number.parseInt(pageNumberUnknown + '')
	if (!Number.isInteger(parsedInt)) throw new Error(`Page number was not an integer: "${pageNumberUnknown}".`)
	if (parsedInt < 1) throw new Error(`Invalid LLM output format: Specified page number must be 1 or greater: "${pageNumberUnknown}".`)
	return parsedInt
}

const validateNumber = (numStr: unknown, opts: { default: number | null }) => {
	if (typeof numStr === 'number')
		return numStr
	if (isFalsy(numStr)) return opts.default

	if (typeof numStr === 'string') {
		const parsedInt = Number.parseInt(numStr + '')
		if (!Number.isInteger(parsedInt)) return opts.default
		return parsedInt
	}

	return opts.default
}

const validateProposedTerminalId = (terminalIdUnknown: unknown) => {
	if (!terminalIdUnknown) throw new Error(`A value for terminalID must be specified, but the value was "${terminalIdUnknown}"`)
	const terminalId = terminalIdUnknown + ''
	return terminalId
}

const validateBoolean = (b: unknown, opts: { default: boolean }) => {
	if (typeof b === 'string') {
		if (b === 'true') return true
		if (b === 'false') return false
	}
	if (typeof b === 'boolean') {
		return b
	}
	return opts.default
}


const checkIfIsFolder = (uriStr: string) => {
	uriStr = uriStr.trim()
	if (uriStr.endsWith('/') || uriStr.endsWith('\\')) return true
	return false
}

// Helper functions for stringOfResult
const nextPageStr = (hasNextPage: boolean) => hasNextPage ? '\n\n(more on next page...)' : ''

const stringifyLintErrors = (lintErrors: LintErrorItem[]) => {
	return lintErrors
		.map((e, i) => `Error ${i + 1}:\nLines Affected: ${e.startLineNumber}-${e.endLineNumber}\nError message:${e.message}`)
		.join('\n\n')
		.substring(0, MAX_FILE_CHARS_PAGE)
}


export interface IToolsService {
        readonly _serviceBrand: undefined;
        validateParams: ValidateBuiltinParams;
        callTool: CallBuiltinTool;
        stringOfResult: BuiltinToolResultToString;
        getPlanningService(): PlanningService;
        getImplementationPlanningService(): ImplementationPlanningService;
}
export const IToolsService = createDecorator<IToolsService>('ToolsService');

export class ToolsService implements IToolsService {

	readonly _serviceBrand: undefined;

	public validateParams: ValidateBuiltinParams;
	public callTool: CallBuiltinTool;
	public stringOfResult: BuiltinToolResultToString;

	private readonly _toonService: ToonService;
	private readonly _planningService: PlanningService;
	private readonly _implementationPlanningService: ImplementationPlanningService;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly _searchService: ISearchService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IVoidModelService private readonly _voidModelService: IVoidModelService,
		@IEditCodeService private readonly _editCodeService: IEditCodeService,
		@ITerminalToolService private readonly _terminalToolService: ITerminalToolService,
		@IDirectoryStrService private readonly _directoryStrService: IDirectoryStrService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IVoidSettingsService private readonly _voidSettingsService: IVoidSettingsService,
		@IMainProcessService private readonly _mainProcessService: IMainProcessService,
		@IMorphService private readonly _morphService: IMorphService,
		@IAgentManagerService private readonly _agentManagerService: IAgentManagerService,
		@IPathService private readonly _pathService: IPathService,
	) {
		const queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		this._toonService = new ToonService();
		this._planningService = new PlanningService();
		this._implementationPlanningService = new ImplementationPlanningService();
		this.validateParams = {
			read_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, start_line: startLineUnknown, end_line: endLineUnknown, page_number: pageNumberUnknown, explanation: explanationUnknown } = params
				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const explanation = typeof explanationUnknown === 'string' ? explanationUnknown : null

				let startLine: number | null = validateNumber(startLineUnknown, { default: null })
				let endLine: number | null = validateNumber(endLineUnknown, { default: null })

				if (startLine !== null && startLine < 1) startLine = null
				if (endLine !== null && endLine < 1) endLine = null

				return { uri, startLine, endLine, pageNumber, explanation }
			},
			outline_file: (params: RawToolParamsObj) => {
				const { uri: uriStr } = params
				const uri = validateURI(uriStr)
				return { uri }
			},
			ls_dir: (params: RawToolParamsObj) => {
				const { uri: uriStr, page_number: pageNumberUnknown } = params

				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)
				return { uri, pageNumber }
			},
			get_dir_tree: (params: RawToolParamsObj) => {
				const { uri: uriStr, } = params
				const uri = validateURI(uriStr)
				return { uri }
			},
			search_pathnames_only: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: includeUnknown,
					page_number: pageNumberUnknown
				} = params

				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const includePattern = validateOptionalStr('include_pattern', includeUnknown)

				return { query: queryStr, includePattern, pageNumber }

			},
			search_for_files: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: searchInFolderUnknown,
					is_regex: isRegexUnknown,
					page_number: pageNumberUnknown
				} = params
				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const searchInFolder = validateOptionalURI(searchInFolderUnknown)
				const isRegex = validateBoolean(isRegexUnknown, { default: false })
				return {
					query: queryStr,
					isRegex,
					searchInFolder,
					pageNumber
				}
			},
			search_in_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, query: queryUnknown, is_regex: isRegexUnknown } = params;
				const uri = validateURI(uriStr);
				const query = validateStr('query', queryUnknown);
				const isRegex = validateBoolean(isRegexUnknown, { default: false });
				return { uri, query, isRegex };
			},

			read_lint_errors: (params: RawToolParamsObj) => {
				const {
					uri: uriUnknown,
				} = params
				const uri = validateURI(uriUnknown)
				return { uri }
			},

			fast_context: (params: RawToolParamsObj) => {
				const { query: queryUnknown } = params;
				const query = validateStr('query', queryUnknown);
				return { query };
			},

			codebase_search: (params: RawToolParamsObj) => {
				const { query: queryUnknown, repo_id: repoIdUnknown, branch: branchUnknown, commit_hash: commitHashUnknown, target_directories: targetDirsUnknown, limit: limitUnknown } = params;
				const query = validateStr('query', queryUnknown);
				const repoId = validateOptionalStr('repo_id', repoIdUnknown) ?? undefined;
				const branch = validateOptionalStr('branch', branchUnknown) ?? undefined;
				const commitHash = validateOptionalStr('commit_hash', commitHashUnknown) ?? undefined;

				let target_directories: string[] | undefined = undefined;
				if (targetDirsUnknown !== undefined) {
					if (typeof targetDirsUnknown === 'string') {
						try { target_directories = JSON.parse(targetDirsUnknown) as string[]; }
						catch (e) { throw new Error('target_directories must be valid JSON array of strings'); }
					} else if (Array.isArray(targetDirsUnknown)) {
																	target_directories = (targetDirsUnknown as any[]).map((d: any) => validateStr('target_directory', d)) as string[];					} else {
						throw new Error('target_directories must be an array or JSON string');
					}
				}

				const limit = limitUnknown !== undefined ? validateNumber(limitUnknown, { default: 10 }) ?? 10 : undefined;

				return { query, repoId, branch, commitHash, target_directories, limit };
			},

			repo_init: (params: RawToolParamsObj) => {
				const { repo_id: repoIdUnknown, dir: dirUnknown } = params;
				const repoId = validateOptionalStr('repo_id', repoIdUnknown) ?? undefined;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				return { repoId, dir };
			},

			repo_clone: (params: RawToolParamsObj) => {
				const { repo_id: repoIdUnknown, dir: dirUnknown } = params;
				const repoId = validateStr('repo_id', repoIdUnknown);
				const dir = validateStr('dir', dirUnknown);
				return { repoId, dir };
			},

			repo_add: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, filepath: filepathUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const filepath = validateOptionalStr('filepath', filepathUnknown) ?? undefined;
				return { dir, filepath };
			},

			repo_commit: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, message: messageUnknown, metadata: metadataUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const message = validateStr('message', messageUnknown);
				let metadata: Record<string, any> | undefined = undefined;
				if (metadataUnknown !== undefined) {
					if (typeof metadataUnknown === 'string') {
						try { metadata = JSON.parse(metadataUnknown); }
						catch (e) { throw new Error('metadata must be valid JSON'); }
					} else if (typeof metadataUnknown === 'object') {
						metadata = metadataUnknown as Record<string, any>;
					} else {
						throw new Error('metadata must be an object or JSON string');
					}
				}
				return { dir, message, metadata };
			},

			repo_push: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, branch: branchUnknown, index: indexUnknown, wait_for_embeddings: waitUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const branch = validateOptionalStr('branch', branchUnknown) ?? undefined;
				let index: boolean | undefined = undefined;
				if (indexUnknown !== undefined) {
					index = validateBoolean(indexUnknown, { default: false });
				}
				let waitForEmbeddings: boolean | undefined = undefined;
				if (waitUnknown !== undefined) {
					waitForEmbeddings = validateBoolean(waitUnknown, { default: false });
				}
				return { dir, branch, index, waitForEmbeddings };
			},

			repo_pull: (params: RawToolParamsObj) => {
				const { dir: dirUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				return { dir };
			},

			repo_status: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, filepath: filepathUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const filepath = validateStr('filepath', filepathUnknown);
				return { dir, filepath };
			},

			repo_status_matrix: (params: RawToolParamsObj) => {
				const { dir: dirUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				return { dir };
			},

			repo_log: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, depth: depthUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const depth = depthUnknown === undefined ? undefined : validateNumber(depthUnknown, { default: null }) ?? undefined;
				return { dir, depth };
			},

			repo_checkout: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, ref: refUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const ref = validateStr('ref', refUnknown);
				return { dir, ref };
			},

			repo_branch: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, name: nameUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const name = validateStr('name', nameUnknown);
				return { dir, name };
			},

			repo_list_branches: (params: RawToolParamsObj) => {
				const { dir: dirUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				return { dir };
			},

			repo_current_branch: (params: RawToolParamsObj) => {
				const { dir: dirUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				return { dir };
			},

			repo_resolve_ref: (params: RawToolParamsObj) => {
				const { dir: dirUnknown, ref: refUnknown } = params;
				const dir = validateOptionalStr('dir', dirUnknown) ?? undefined;
				const ref = validateStr('ref', refUnknown);
				return { dir, ref };
			},

			repo_get_commit_metadata: (params: RawToolParamsObj) => {
				const { repo_id: repoIdUnknown, commit_hash: commitHashUnknown } = params;
				const repoId = validateOptionalStr('repo_id', repoIdUnknown) ?? undefined;
				const commitHash = validateStr('commit_hash', commitHashUnknown);
				return { repoId, commitHash };
			},

			repo_wait_for_embeddings: (params: RawToolParamsObj) => {
				const { repo_id: repoIdUnknown, timeout_ms: timeoutUnknown } = params;
				const repoId = validateOptionalStr('repo_id', repoIdUnknown) ?? undefined;
				const timeoutMs = timeoutUnknown === undefined ? undefined : validateNumber(timeoutUnknown, { default: 120000 }) ?? undefined;
				return { repoId, timeoutMs };
			},
			wait: (params: RawToolParamsObj) => {
				const { timeout_ms: timeoutMsUnknown, persistent_terminal_id: terminalIdUnknown } = params;
				const timeoutMs = validateNumber(timeoutMsUnknown, { default: 10000 }) ?? 10000;
				const persistentTerminalId = validateProposedTerminalId(terminalIdUnknown);
				return { timeoutMs, persistentTerminalId };
			},

			check_terminal_status: (params: RawToolParamsObj) => {
				const { timeout_ms: timeoutMsUnknown, persistent_terminal_id: terminalIdUnknown } = params;
				const timeoutMs = validateNumber(timeoutMsUnknown, { default: 200 }) ?? 200;
				const persistentTerminalId = validateProposedTerminalId(terminalIdUnknown);
				return { timeoutMs, persistentTerminalId };
			},

			// ---

			create_file_or_folder: (params: RawToolParamsObj) => {
				const { uri: uriUnknown } = params
				const uri = validateURI(uriUnknown)
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isFolder }
			},

			delete_file_or_folder: (params: RawToolParamsObj) => {
				const { uri: uriUnknown, is_recursive: isRecursiveUnknown } = params
				const uri = validateURI(uriUnknown)
				const isRecursive = validateBoolean(isRecursiveUnknown, { default: false })
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isRecursive, isFolder }
			},

			rewrite_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, new_content: newContentUnknown } = params
				const uri = validateURI(uriStr)
				const newContent = validateStr('newContent', newContentUnknown)
				return { uri, newContent }
			},

			edit_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, original_updated_blocks: originalUpdatedBlocksUnknown, try_fuzzy_matching: tryFuzzyMatchingUnknown } = params
				const uri = validateURI(uriStr)
				const originalUpdatedBlocks = validateStr('originalUpdatedBlocks', originalUpdatedBlocksUnknown)
				const tryFuzzyMatching = validateBoolean(tryFuzzyMatchingUnknown, { default: false })
				return { uri, originalUpdatedBlocks, tryFuzzyMatching }
			},

			// ---

			run_code: (params: RawToolParamsObj) => {
				const { code: codeUnknown, timeout: timeoutUnknown } = params
				const code = validateStr('code', codeUnknown)
				const timeout = validateNumber(timeoutUnknown, { default: null })
				return { code, timeout }
			},

			// ---

			run_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, cwd: cwdUnknown, is_background: isBackgroundUnknown, terminal_id: terminalIdUnknown } = params
				const command = validateStr('command', commandUnknown)
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				const isBackground = validateBoolean(isBackgroundUnknown, { default: false })
				const terminalId = terminalIdUnknown ? validateProposedTerminalId(terminalIdUnknown) : undefined
				return { command, cwd, isBackground, terminalId }
			},
			open_persistent_terminal: (params: RawToolParamsObj) => {
				const { cwd: cwdUnknown } = params;
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				// No parameters needed; will open a new background terminal
				return { cwd };
			},
			kill_persistent_terminal: (params: RawToolParamsObj) => {
				const { persistent_terminal_id: terminalIdUnknown } = params;
				const persistentTerminalId = validateProposedTerminalId(terminalIdUnknown);
				return { persistentTerminalId };
			},

			// --- Planning tools ---

			create_plan: (params: RawToolParamsObj) => {
				const { goal: goalUnknown, tasks: tasksUnknown } = params;
				const goal = validateStr('goal', goalUnknown);

				// Validate tasks array - handle both array and JSON string
				// Also handles JS object notation (unquoted keys) that some LLMs output
				let tasksParsed: any;
				if (typeof tasksUnknown === 'string') {
					try {
						tasksParsed = parseJSONOrJSObject(tasksUnknown);
					} catch (e) {
						throw new Error(`Invalid LLM output: tasks parameter is a string but not valid JSON: ${tasksUnknown}`);
					}
				} else {
					tasksParsed = tasksUnknown;
				}

				if (!Array.isArray(tasksParsed)) {
					throw new Error(`Invalid LLM output: tasks must be an array of task objects. Received: ${typeof tasksParsed}`);
				}

				const tasks = tasksParsed.map((task: any, idx: number) => {
					if (typeof task !== 'object' || task === null) {
						throw new Error(`Invalid LLM output: task at index ${idx} must be an object`);
					}
					const id = validateStr('task.id', task.id);
					const description = validateStr('task.description', task.description);
					const dependencies = Array.isArray(task.dependencies) ? task.dependencies.map((dep: any) => validateStr('dependency', dep)) : [];
					return { id, description, dependencies };
				});

				return { goal, tasks };
			},

			update_task_status: (params: RawToolParamsObj) => {
				const { task_id: taskIdUnknown, status: statusUnknown, notes: notesUnknown } = params;
				const taskId = validateStr('task_id', taskIdUnknown);
				const status = validateStr('status', statusUnknown);
				const notes = validateOptionalStr('notes', notesUnknown);

				// Validate status is one of the allowed values
				const validStatuses: PlanTaskStatus[] = ['pending', 'in_progress', 'complete', 'failed', 'skipped'];
				if (!validStatuses.includes(status as PlanTaskStatus)) {
					throw new Error(`Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`);
				}

				return { taskId, status, notes };
			},

			get_plan_status: (params: RawToolParamsObj) => {
				// No parameters needed
				return {};
			},

			add_tasks_to_plan: (params: RawToolParamsObj) => {
				const { tasks: tasksUnknown } = params;

				// Validate tasks array - handle both array and JSON string
				// Also handles JS object notation (unquoted keys) that some LLMs output
				let tasksParsed: any;
				if (typeof tasksUnknown === 'string') {
					try {
						tasksParsed = parseJSONOrJSObject(tasksUnknown);
					} catch (e) {
						throw new Error(`Invalid LLM output: tasks parameter is a string but not valid JSON: ${tasksUnknown}`);
					}
				} else {
					tasksParsed = tasksUnknown;
				}

				if (!Array.isArray(tasksParsed)) {
					throw new Error(`Invalid LLM output: tasks must be an array of task objects. Received: ${typeof tasksParsed}`);
				}

				const tasks = tasksParsed.map((task: any, idx: number) => {
					if (typeof task !== 'object' || task === null) {
						throw new Error(`Invalid LLM output: task at index ${idx} must be an object`);
					}
					const id = validateStr('task.id', task.id);
					const description = validateStr('task.description', task.description);
					const dependencies = Array.isArray(task.dependencies) ? task.dependencies.map((dep: any) => validateStr('dependency', dep)) : [];
					return { id, description, dependencies };
				});

				return { tasks };
			},

			update_walkthrough: (params: RawToolParamsObj) => {
				const { content: contentUnknown, mode: modeUnknown, title: titleUnknown, include_plan_status: includePlanStatusUnknown } = params;
				const content = validateStr('content', contentUnknown);
				const mode = validateStr('mode', modeUnknown) as 'create' | 'append' | 'replace';
				const title = titleUnknown !== undefined && titleUnknown !== null ? validateStr('title', titleUnknown) : undefined;
				const includePlanStatus = validateBoolean(includePlanStatusUnknown, { default: false });

				// Validate mode
				const validModes = ['create', 'append', 'replace'];
				if (!validModes.includes(mode)) {
					throw new Error(`Invalid mode: "${mode}". Must be one of: ${validModes.join(', ')}`);
				}

				return { content, mode, title, includePlanStatus };
			},

			open_walkthrough_preview: (params: RawToolParamsObj) => {
				const { file_path: filePathUnknown } = params;
				const filePath = validateStr('file_path', filePathUnknown);
				return { file_path: filePath };
			},

			// --- Implementation Planning tools ---

			create_implementation_plan: (params: RawToolParamsObj) => {
				const { goal: goalUnknown, steps: stepsUnknown } = params;
				const goal = validateStr('goal', goalUnknown);

				// Validate steps array - handle both array and JSON string
				// Also handles JS object notation (unquoted keys) that some LLMs output
				let stepsParsed: any;
				if (typeof stepsUnknown === 'string') {
					try {
						stepsParsed = parseJSONOrJSObject(stepsUnknown);
					} catch (e) {
						throw new Error(`Invalid LLM output: steps parameter is a string but not valid JSON: ${stepsUnknown}`);
					}
				} else {
					stepsParsed = stepsUnknown;
				}

				if (!Array.isArray(stepsParsed)) {
					throw new Error(`Invalid LLM output: steps must be an array of step objects. Received: ${typeof stepsParsed}`);
				}

				const steps = stepsParsed.map((step: any, idx: number) => {
					if (typeof step !== 'object' || step === null) {
						throw new Error(`Invalid LLM output: step at index ${idx} must be an object`);
					}
					const id = validateStr('step.id', step.id);
					const title = validateStr('step.title', step.title);
					const description = validateStr('step.description', step.description);

					// Validate complexity
					const validComplexities = ['simple', 'medium', 'complex'];
					const complexity = validateStr('step.complexity', step.complexity);
					if (!validComplexities.includes(complexity)) {
						throw new Error(`Invalid complexity at step ${idx}: "${complexity}". Must be one of: ${validComplexities.join(', ')}`);
					}

					// Validate files array
					const files = Array.isArray(step.files) ? step.files.map((file: any) => validateStr('step.file', file)) : [];

					// Validate dependencies
					const dependencies = Array.isArray(step.dependencies) ? step.dependencies.map((dep: any) => validateStr('step.dependency', dep)) : [];

					// Optional estimated_time - convert null to undefined for optional parameter
					const estimated_time: number | undefined = step.estimated_time !== undefined && step.estimated_time !== null
						? (typeof step.estimated_time === 'number' ? step.estimated_time : Number.parseInt(step.estimated_time + ''))
						: undefined;

					return { id, title, description, complexity: complexity as 'simple' | 'medium' | 'complex', files, dependencies, estimated_time };
				});

				return { goal, steps };
			},

			preview_implementation_plan: (params: RawToolParamsObj) => {
				return {};
			},

			execute_implementation_plan: (params: RawToolParamsObj) => {
				const { step_id: stepIdUnknown } = params;
				const step_id = stepIdUnknown !== undefined && stepIdUnknown !== null ? validateStr('step_id', stepIdUnknown) : undefined;
				return { step_id };
			},

			update_implementation_step: (params: RawToolParamsObj) => {
				const { step_id: stepIdUnknown, status: statusUnknown, notes: notesUnknown } = params;
				const step_id = validateStr('step_id', stepIdUnknown);
				const status = validateStr('status', statusUnknown);
				const notes = validateOptionalStr('notes', notesUnknown);

				// Validate status is one of the allowed values
				const validStatuses: ImplStepStatus[] = ['pending', 'in_progress', 'complete', 'failed', 'skipped'];
				if (!validStatuses.includes(status as ImplStepStatus)) {
					throw new Error(`Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`);
				}

				return { step_id, status, notes };
			},

			get_implementation_status: (params: RawToolParamsObj) => {
				return {};
			},

			// --- Teaching tools (Student Mode) ---
			explain_code: (params: RawToolParamsObj) => {
				const { code, language, level, focus } = params;
				return {
					code: validateStr('code', code),
					language: validateStr('language', language),
					level: validateStr('level', level) as 'beginner' | 'intermediate' | 'advanced',
					focus: typeof focus === 'string' ? focus : undefined
				};
			},

			teach_concept: (params: RawToolParamsObj) => {
				const { concept, level, language, context } = params;
				return {
					concept: validateStr('concept', concept),
					level: validateStr('level', level) as 'beginner' | 'intermediate' | 'advanced',
					language: typeof language === 'string' ? language : undefined,
					context: typeof context === 'string' ? context : undefined
				};
			},

			create_exercise: (params: RawToolParamsObj) => {
				const { topic, difficulty, language, type } = params;
				return {
					topic: validateStr('topic', topic),
					difficulty: validateStr('difficulty', difficulty) as 'easy' | 'medium' | 'hard',
					language: validateStr('language', language),
					type: validateStr('type', type) as 'fill_blank' | 'fix_bug' | 'write_function' | 'extend_code'
				};
			},

			check_answer: (params: RawToolParamsObj) => {
				const { exercise_id, student_code } = params;
				return {
					exercise_id: validateStr('exercise_id', exercise_id),
					student_code: validateStr('student_code', student_code)
				};
			},

			give_hint: (params: RawToolParamsObj) => {
				const { exercise_id } = params;
				return {
					exercise_id: validateStr('exercise_id', exercise_id)
				};
			},

			create_lesson_plan: (params: RawToolParamsObj) => {
				const { goal, level, time_available } = params;
				return {
					goal: validateStr('goal', goal),
					level: validateStr('level', level) as 'beginner' | 'intermediate' | 'advanced',
					time_available: typeof time_available === 'number' ? time_available : undefined
				};
			},

			display_lesson: (params: RawToolParamsObj) => {
				const { title, content } = params;
				return {
					title: validateStr('title', title),
					content: validateStr('content', content)
				};
			},

			load_skill: (params: RawToolParamsObj) => {
				const { skill_name: skillNameUnknown } = params;
				const skill_name = validateStr('skill_name', skillNameUnknown);
				return { skill_name };
			},

			list_skills: (params: RawToolParamsObj) => {
				return {};
			},

			generate_image: (params: RawToolParamsObj) => {
				const { prompt, filename, width, height, quality } = params;
				return {
					prompt: validateStr('prompt', prompt),
					filename: typeof filename === 'string' ? filename : undefined,
					width: validateNumber(width, { default: null }) ?? undefined,
					height: validateNumber(height, { default: null }) ?? undefined,
					quality: (typeof quality === 'string' && ['low', 'medium', 'high', 'hd'].includes(quality)) ? quality as any : undefined,
				};
			},

			render_form: (params: RawToolParamsObj) => {
				const { title, description, questions } = params;
				const validatedQuestions: any[] = [];

				// Handle both array and JSON string formats for questions
				let parsedQuestions: any[] | undefined;
				if (Array.isArray(questions)) {
					parsedQuestions = questions;
				} else if (typeof questions === 'string') {
					try {
						parsedQuestions = JSON.parse(questions);
						if (!Array.isArray(parsedQuestions)) {
							parsedQuestions = undefined;
						}
					} catch (e) {
						// Invalid JSON, use undefined
					}
				}

				if (parsedQuestions && Array.isArray(parsedQuestions)) {
					for (const q of parsedQuestions) {
						if (!q || typeof q !== 'object') continue;
						const id = q.id ?? `q${validatedQuestions.length}`;
						const text = typeof q.text === 'string' ? q.text : '';
						const type = (typeof q.type === 'string' && ['single_choice', 'multiple_choice', 'text', 'checkbox'].includes(q.type)) ? q.type : 'text';
						const options = Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === 'string') : undefined;
						const required = validateBoolean(q.required, { default: false });
						validatedQuestions.push({ id, text, type, options, required });
					}
				}
				return {
					title: typeof title === 'string' ? title : undefined,
					description: typeof description === 'string' ? description : undefined,
					questions: validatedQuestions.length > 0 ? validatedQuestions : [{ id: 'q1', text: 'Please provide your input', type: 'text' as const, required: false }],
				};
			},
			create_quiz: (params: RawToolParamsObj) => {
				const { title, description, questions, total_points, time_limit_seconds } = params;
				const validatedQuestions: any[] = [];

				// Handle both array and JSON string formats for questions
				let parsedQuestions: any[] | undefined;
				if (Array.isArray(questions)) {
					parsedQuestions = questions;
				} else if (typeof questions === 'string') {
					try {
						parsedQuestions = JSON.parse(questions);
						if (!Array.isArray(parsedQuestions)) {
							parsedQuestions = undefined;
						}
					} catch (e) {
						// Invalid JSON, use undefined
					}
				}

				if (parsedQuestions && Array.isArray(parsedQuestions)) {
					for (const q of parsedQuestions) {
						if (!q || typeof q !== 'object') continue;
						const id = q.id ?? `q${validatedQuestions.length}`;
						const questionText = typeof q.question === 'string' ? q.question : typeof q.text === 'string' ? q.text : '';
						const type = (typeof q.type === 'string' && ['single_choice', 'multiple_choice', 'text', 'true_false'].includes(q.type)) ? q.type : 'single_choice';
						const options = Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === 'string') : undefined;
						const correctAnswer = q.correct_answer !== undefined ? q.correct_answer : (type === 'true_false' ? 'True' : '');
						const explanation = typeof q.explanation === 'string' ? q.explanation : undefined;
						const points = typeof q.points === 'number' ? q.points : 10;
						validatedQuestions.push({ id, question: questionText, type, options, correct_answer: correctAnswer, explanation, points });
					}
				}
				return {
					title: typeof title === 'string' ? title : 'Quiz',
					description: typeof description === 'string' ? description : undefined,
					questions: validatedQuestions.length > 0 ? validatedQuestions : [{ id: 'q1', question: 'What is 2 + 2?', type: 'single_choice' as const, options: ['3', '4', '5', '6'], correct_answer: '4', points: 10 }],
					total_points: typeof total_points === 'number' ? total_points : validatedQuestions.reduce((sum, q) => sum + (q.points || 10), 0),
					time_limit_seconds: typeof time_limit_seconds === 'number' ? time_limit_seconds : undefined,
				};
			},

		}


		this.callTool = {
			read_file: async ({ uri, startLine, endLine, pageNumber, explanation }, opts) => {
				opts?.onData?.(`Reading file: ${path.basename(uri.fsPath)}...`);
				// Optimization: Check file size first
				const stat = await this._fileService.resolve(uri, { resolveMetadata: true });
				const isLargeFile = stat.size > 1024 * 1024; // > 1MB is considered large for a Monaco model

				// Helper to add line numbers to content
				const addLineNumbers = (content: string, startLineNum: number): string => {
					const lines = content.split('\n')
					return lines.map((line, idx) =>
						`${startLineNum + idx} | ${line}`
					).join('\n')
				}

				if (isLargeFile && startLine === null && endLine === null) {
					console.log(`[ToolsService] Reading large file (${stat.size} bytes) via IFileService: ${uri.fsPath}`);
					const fromIdx = MAX_FILE_CHARS_PAGE * (pageNumber - 1);
					const toIdx = Math.min(MAX_FILE_CHARS_PAGE * pageNumber, stat.size);
					const length = toIdx - fromIdx;

					const content = await this._fileService.readFile(uri, { length, position: fromIdx });
					const rawContents = content.value.toString();

					// For large files, estimating line numbers since we don't have the full model
					// This is a tradeoff for performance. We assume roughly 80 chars per line.
					const estimatedStartLine = Math.floor(fromIdx / 80) + 1;
					const fileContents = addLineNumbers(rawContents, estimatedStartLine);
					const hasNextPage = toIdx < stat.size;

					return { result: { fileContents, totalFileLen: stat.size, hasNextPage, totalNumLines: Math.floor(stat.size / 80) } };
				}

				// Fallback to model for smaller files or specific line ranges
				await this._voidModelService.initializeModel(uri)
				const { model } = await this._voidModelService.getModelSafe(uri)
				if (model === null) { throw new Error(`No contents; File does not exist.`) }

				const totalNumLines = model.getLineCount()
				const totalFileLen = model.getValueLength(EndOfLinePreference.LF)

				// If specific line range is requested, return that range
				if (startLine !== null || endLine !== null) {
					const startLineNumber = startLine === null ? 1 : startLine
					const endLineNumber = endLine === null ? totalNumLines : endLine
					const rawContents = model.getValueInRange({
						startLineNumber,
						startColumn: 1,
						endLineNumber,
						endColumn: Number.MAX_SAFE_INTEGER
					}, EndOfLinePreference.LF)
					const fileContents = addLineNumbers(rawContents, startLineNumber)
					return { result: { fileContents, totalFileLen, hasNextPage: false, totalNumLines } }
				}

				// Full file - apply pagination
				const fromIdx = MAX_FILE_CHARS_PAGE * (pageNumber - 1)
				const toIdx = Math.min(MAX_FILE_CHARS_PAGE * pageNumber, totalFileLen)

				const startPos = model.getPositionAt(fromIdx)
				const endPos = model.getPositionAt(toIdx)

				const rawContents = model.getValueInRange({
					startLineNumber: startPos.lineNumber,
					startColumn: startPos.column,
					endLineNumber: endPos.lineNumber,
					endColumn: endPos.column
				}, EndOfLinePreference.LF)

				// Calculate line number for the start of this page
				const linesBeforePage = startPos.lineNumber
				const fileContents = addLineNumbers(rawContents, linesBeforePage)

				const hasNextPage = toIdx < totalFileLen

				return { result: { fileContents, totalFileLen, hasNextPage, totalNumLines } }
			},

			outline_file: async ({ uri }, opts) => {
				opts?.onData?.(`Getting outline for ${path.basename(uri.fsPath)}...`);
				await this._voidModelService.initializeModel(uri)
				const { model } = await this._voidModelService.getModelSafe(uri)
				if (model === null) { throw new Error(`No contents; File does not exist.`) }

				const totalNumLines = model.getLineCount()
				const fullContents = model.getValue(EndOfLinePreference.LF)

				const { extractFileOutline, formatOutline } = await import('../common/helpers/fileOutline.js');
				const fileExtension = uri.path.substring(uri.path.lastIndexOf('.'));
				const outlineItems = extractFileOutline(fullContents, fileExtension);
				const outline = formatOutline(outlineItems, uri.fsPath);

				return { result: { outline, totalNumLines } }
			},

			ls_dir: async ({ uri, pageNumber }) => {
				const dirResult = await computeDirectoryTree1Deep(this._fileService, uri, pageNumber)
				return { result: dirResult }
			},

			get_dir_tree: async ({ uri }) => {
				const str = await this._directoryStrService.getDirectoryStrTool(uri)
				return { result: { str } }
			},

			search_pathnames_only: async ({ query: queryStr, includePattern, pageNumber }) => {

				const query = queryBuilder.file(this._workspaceContextService.getWorkspace().folders.map((f: any) => f.uri), {
					filePattern: queryStr,
					includePattern: includePattern ?? undefined,
					sortByScore: true, // makes results 10x better
				})
				const data = await this._searchService.fileSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { uris, hasNextPage } }
			},

			search_for_files: async ({ query: queryStr, isRegex, searchInFolder, pageNumber }) => {
				const searchFolders = searchInFolder === null ?
					this._workspaceContextService.getWorkspace().folders.map((f: any) => f.uri)
					: [searchInFolder]

				const query = queryBuilder.text({
					pattern: queryStr,
					isRegExp: isRegex,
				}, searchFolders)

				const data = await this._searchService.textSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { queryStr, uris, hasNextPage } }
			},
			search_in_file: async ({ uri, query, isRegex }) => {
				await this._voidModelService.initializeModel(uri);
				const { model } = await this._voidModelService.getModelSafe(uri);
				if (model === null) { throw new Error(`No contents; File does not exist.`); }

				const matches = model.findMatches(
					query,
					false, // searchOnlyEditableRange
					isRegex,
					false, // matchCase (default to false for broader search)
					null,  // wordSeparators
					false  // captureMatches
				);

				// Get unique line numbers
				const lines = [...new Set(matches.map(m => m.range.startLineNumber))].sort((a, b) => a - b);

				return { result: { lines } };
			},

			read_lint_errors: async ({ uri }) => {
				await timeout(1000)
				const { lintErrors } = this._getLintErrors(uri)
				return { result: { lintErrors } }
			},

			fast_context: async ({ query }, opts) => {
				const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
				const repoRoot = workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '.';

				opts?.onData?.('Morph: Starting semantic search...');
				await timeout(500);
				opts?.onData?.('Morph: Analyzing query concepts...');
				await timeout(800);
				opts?.onData?.('Morph: Searching codebase embeddings...');

				const contexts = await this._morphService.fastContext({
					query,
					repoRoot
				});

				opts?.onData?.(`Morph: Found ${contexts.length} relevant results.`);
				await timeout(300);

				return { result: { contexts } };
			},

			codebase_search: async ({ query, repoId, branch, commitHash, target_directories, limit }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');

				opts?.onData?.('Morph: Searching indexed codebase...');
				const results = await this._morphService.codebaseSearch({
					query,
					repoId,
					branch,
					commitHash,
					target_directories,
					limit,
				});
				opts?.onData?.(`Morph: Found ${results.results.length} semantic matches.`);
				return { result: results };
			},

			repo_init: async ({ repoId, dir }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.('Morph: Initializing repository...');
				const res = await this._morphService.repoInit({ repoId, dir });
				opts?.onData?.(res.success ? 'Morph: Repository initialized.' : 'Morph: Initialization failed.');
				return { result: res };
			},

			repo_clone: async ({ repoId, dir }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.(`Morph: Cloning repository ${repoId}...`);
				const res = await this._morphService.repoClone({ repoId, dir });
				opts?.onData?.(res.success ? 'Morph: Clone complete.' : 'Morph: Clone failed.');
				return { result: res };
			},

			repo_add: async ({ dir, filepath }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.(`Morph: Staging ${filepath || 'all changes'}...`);
				const res = await this._morphService.repoAdd({ dir, filepath });
				return { result: res };
			},

			repo_commit: async ({ dir, message, metadata }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.('Morph: Committing changes...');
				const res = await this._morphService.repoCommit({ dir, message, metadata });
				opts?.onData?.(res.success ? `Morph: Committed ${res.commitSha?.slice(0, 7) || ''}` : 'Morph: Commit failed.');
				return { result: res };
			},

			repo_push: async ({ dir, branch, index, waitForEmbeddings }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.(`Morph: Pushing to ${branch || 'remote'}...`);
				const res = await this._morphService.repoPush({ dir, branch, index, waitForEmbeddings });
				if (res.success && index) {
					opts?.onData?.('Morph: Push successful. Indexing embeddings...');
				}
				return { result: res };
			},

			repo_pull: async ({ dir }, opts) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				opts?.onData?.('Morph: Pulling latest changes...');
				const res = await this._morphService.repoPull({ dir });
				return { result: res };
			},

			repo_status: async ({ dir, filepath }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoStatus({ dir, filepath }) };
			},

			repo_status_matrix: async ({ dir }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoStatusMatrix({ dir }) };
			},

			repo_log: async ({ dir, depth }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoLog({ dir, depth }) };
			},

			repo_checkout: async ({ dir, ref }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoCheckout({ dir, ref }) };
			},

			repo_branch: async ({ dir, name }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoBranch({ dir, name }) };
			},

			repo_list_branches: async ({ dir }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoListBranches({ dir }) };
			},

			repo_current_branch: async ({ dir }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoCurrentBranch({ dir }) };
			},

			repo_resolve_ref: async ({ dir, ref }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoResolveRef({ dir, ref }) };
			},

			repo_get_commit_metadata: async ({ repoId, commitHash }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoGetCommitMetadata({ repoId, commitHash }) };
			},

			repo_wait_for_embeddings: async ({ repoId, timeoutMs }) => {
				const { enableMorphRepoStorage } = this._voidSettingsService.state.globalSettings;
				if (!enableMorphRepoStorage) throw new Error('Morph Repo Storage is disabled in settings.');
				return { result: await this._morphService.repoWaitForEmbeddings({ repoId, timeoutMs }) };
			},
			wait: async ({ timeoutMs, persistentTerminalId }, opts) => {
				const result = await this._terminalToolService.wait({ timeoutMs, persistentTerminalId, onData: opts?.onData });
				return { result };
			},
			check_terminal_status: async ({ timeoutMs, persistentTerminalId }, opts) => {
				const result = await this._terminalToolService.wait({ timeoutMs, persistentTerminalId, onData: opts?.onData });
				return { result };
			},

			// ---

			create_file_or_folder: async ({ uri, isFolder }, opts) => {
				opts?.onData?.(`Creating ${isFolder ? 'folder' : 'file'}: ${path.basename(uri.fsPath)}...`);
				if (isFolder)
					await this._fileService.createFolder(uri)
				else {
					await this._fileService.createFile(uri)
				}
				// Morph Repo Storage: sync to cloud if enabled
				this._syncToMorphRepoStorage(uri, 'Create ' + (isFolder ? 'folder: ' : 'file: ') + path.basename(uri.fsPath));
				return { result: {} }
			},

			delete_file_or_folder: async ({ uri, isRecursive }, opts) => {
				const isFolder = checkIfIsFolder(uri.fsPath);
				opts?.onData?.(`Deleting ${isFolder ? 'folder' : 'file'}: ${path.basename(uri.fsPath)}...`);
				await this._fileService.del(uri, { recursive: isRecursive })
				// Morph Repo Storage: sync to cloud if enabled
				this._syncToMorphRepoStorage(uri, 'Delete file or folder: ' + path.basename(uri.fsPath));
				return { result: {} }
			},

			rewrite_file: async ({ uri, newContent }, opts) => {
				await this._voidModelService.initializeModel(uri)

				// Check if file exists, if not create it (if within workspace)
				const { model } = await this._voidModelService.getModelSafe(uri)
				const isNewFile = model === null

				if (isNewFile) {
					// File doesn't exist - check if it's within the workspace
					const workspaceFolders = this._workspaceContextService.getWorkspace().folders
					const isInWorkspace = workspaceFolders.some((folder: any) =>
						uri.fsPath.startsWith(folder.uri.fsPath)
					)

					if (!isInWorkspace) {
						throw new Error(`File does not exist and path is outside workspace. Use create_file_or_folder first, or ensure the path is within the workspace: ${uri.fsPath}`)
					}

					// Create the file (empty first, then we'll rewrite it)
					await this._fileService.createFile(uri, VSBuffer.fromString(''))
					// Re-initialize the model after creating
					await this._voidModelService.initializeModel(uri)
				}

				await this._editCodeService.callBeforeApplyOrEdit(uri)

				// Check if Morph Fast Apply is enabled
				const useMorph = this._voidSettingsService.state.globalSettings.enableMorphFastApply;

				if (useMorph) {
					// Use Morph Fast Apply
					opts?.onData?.(`Morph: Applying rewrite to ${path.basename(uri.fsPath)}...`);
					const fileContent = await this._fileService.readFile(uri);
					const originalContent = fileContent.value.toString();
					const appliedCode = await this._morphService.applyCodeChange({
						instruction: 'Rewriting entire file with new content',
						originalCode: originalContent,
						updatedCode: newContent
					});
					this._editCodeService.instantlyRewriteFile({ uri, newContent: appliedCode, onProgress: opts?.onData });
				} else {
					// Use standard rewrite
					opts?.onData?.(`Writing ${path.basename(uri.fsPath)}...`);
					this._editCodeService.instantlyRewriteFile({ uri, newContent, onProgress: opts?.onData });
				}

				// Morph Repo Storage: sync to cloud if enabled
				this._syncToMorphRepoStorage(uri, 'Rewrite file: ' + path.basename(uri.fsPath));

				// at end, get lint errors
				const lintErrorsPromise = Promise.resolve().then(async () => {
					await timeout(2000)
					const { lintErrors } = this._getLintErrors(uri)
					return { lintErrors }
				})
				return { result: lintErrorsPromise }
			},

			edit_file: async ({ uri, originalUpdatedBlocks: originalUpdatedBlocks, tryFuzzyMatching }, opts) => {
				await this._voidModelService.initializeModel(uri)
				await this._editCodeService.callBeforeApplyOrEdit(uri)

				// Check if Morph Fast Apply is enabled
				const useMorph = this._voidSettingsService.state.globalSettings.enableMorphFastApply;

				if (useMorph) {
					// Use Morph Fast Apply - convert original/updated blocks to Morph format
					opts?.onData?.(`Morph: Applying ORIGINAL/UPDATED edits to ${path.basename(uri.fsPath)}...`);
					const fileContent = await this._fileService.readFile(uri);
					const originalContent = fileContent.value.toString();
					const appliedCode = await this._morphService.applyCodeChange({
						instruction: 'Applying code edits',
						originalCode: originalContent,
						updatedCode: originalUpdatedBlocks // Morph expects code with // ... existing code ... format
					});
					this._editCodeService.instantlyRewriteFile({ uri, newContent: appliedCode, onProgress: opts?.onData });
				} else {
					// Use standard original/updated
					opts?.onData?.(`Applying edits to ${path.basename(uri.fsPath)}...`);
					await this._editCodeService.instantlyApplyOriginalUpdatedBlocks({ uri, originalUpdatedBlocks: originalUpdatedBlocks, tryFuzzyMatching, onProgress: opts?.onData });
				}

				// Morph Repo Storage: sync to cloud if enabled
				this._syncToMorphRepoStorage(uri, 'Edit file: ' + path.basename(uri.fsPath));

				// at end, get lint errors
				const lintErrorsPromise = Promise.resolve().then(async () => {
					await timeout(2000)
					const { lintErrors } = this._getLintErrors(uri)
					return { lintErrors }
				})

				return { result: lintErrorsPromise }
			},
			// ---
			run_code: async ({ code, timeout }) => {
				// Get IPC channel to electron-main
				const channel = this.getCodeExecutionChannel();

				// Listen for tool call requests from sandbox
				const toolCallListener = channel.listen('onToolCall');
				const disposable = toolCallListener((request: { requestId: string; toolName: string; params: any }) => {
					// Sandbox is calling a tool - execute it and send response back
					this.handleToolCallFromSandbox(channel, request).catch(err => {
						console.error('[run_code] Failed to handle tool call:', err);
					});
				});

				try {
					// Execute code in sandbox
					const result = await channel.call('executeCode', { code, options: { timeout } });
					return { result };
				} finally {
					disposable.dispose();
				}
			},
			run_command: async ({ command, cwd, isBackground, terminalId }, opts) => {
				// 1. Determine Target Mode (Persistent vs Temporary)
				// If terminalId is provided OR isBackground is true -> Persistent Mode
				if (terminalId || isBackground) {
					let targetTerminalId = terminalId;
					// If no ID provided, create a new persistent terminal
					if (!targetTerminalId) {
						targetTerminalId = await this._terminalToolService.createPersistentTerminal({ cwd });
					}
					// Run as persistent command
					const { resPromise, interrupt } = await this._terminalToolService.runCommand(command, { type: 'persistent', persistentTerminalId: targetTerminalId, onData: opts?.onData });
					const result = await resPromise;
					// Return the terminal ID so LLM knows where it ran
					return { result: { ...result, terminalId: targetTerminalId }, interruptTool: interrupt };
				} else {
					// 2. Default Mode (Temporary / Foreground)
					const tempId = generateUuid();
					const { resPromise, interrupt } = await this._terminalToolService.runCommand(command, { type: 'temporary', cwd, terminalId: tempId, onData: opts?.onData });
					const result = await resPromise;
					return { result, interruptTool: interrupt };
				}
			},
			open_persistent_terminal: async ({ cwd }) => {
				const persistentTerminalId = await this._terminalToolService.createPersistentTerminal({ cwd })
				return { result: { persistentTerminalId } }
			},
			kill_persistent_terminal: async ({ persistentTerminalId }) => {
				// Close the background terminal by sending exit
				await this._terminalToolService.killPersistentTerminal(persistentTerminalId)
				return { result: {} }
			},

			// --- Planning tools ---

			create_plan: async ({ goal, tasks }) => {
				const plan = this._planningService.createPlan(goal, tasks);
				const summary = this._planningService.formatPlanStatus(plan);
				return { result: { planId: plan.id, summary } };
			},

			update_task_status: async ({ taskId, status, notes }) => {
				const task = this._planningService.updateTaskStatus(taskId, status as PlanTaskStatus, notes ?? undefined);
				const plan = this._planningService.getPlanStatus();
				const summary = plan ? this._planningService.formatPlanStatus(plan) : 'No active plan';
				return { result: { taskId: task.id, newStatus: task.status, summary } };
			},

			get_plan_status: async () => {
				const plan = this._planningService.getPlanStatus();
				if (!plan) {
					return { result: { planExists: false, summary: null } };
				}
				const summary = this._planningService.formatPlanStatus(plan);
				return { result: { planExists: true, summary } };
			},

			add_tasks_to_plan: async ({ tasks }) => {
				const plan = this._planningService.addTasksToPlan(tasks);
				const summary = this._planningService.formatPlanStatus(plan);
				return { result: { summary } };
			},

			update_walkthrough: async ({ content, mode, title, includePlanStatus }) => {
				// Get workspace root
				const workspaceRoot = this._workspaceContextService.getWorkspace().folders[0]?.uri
				if (!workspaceRoot) {
					// Return a user-friendly error instead of throwing
					return {
						result: {
							success: false,
							error: 'No workspace folder found. Please open a folder in VS Code to use the walkthrough feature.',
							filePath: '',
							action: 'created' as const,
							preview: ''
						}
					}
				}

				// Construct file URI
				const walkthroughUri = workspaceRoot.with({ path: `${workspaceRoot.path}/walkthrough.md` })

				// Handle different modes
				let finalContent = content
				let action: 'created' | 'updated' | 'appended'

				// Check if file exists
				let existingContent = ''
				try {
					const existingFile = await this._fileService.readFile(walkthroughUri)
					existingContent = existingFile.value.toString()
				} catch (error) {
					// File doesn't exist, that's ok for create mode
				}

				if (mode === 'append') {
					if (existingContent.length > 0) {
						finalContent = existingContent + '\n\n' + content
					} else {
						finalContent = content
					}
					action = existingContent.length > 0 ? 'appended' : 'created'
				} else if (mode === 'replace') {
					finalContent = content
					action = existingContent.length > 0 ? 'updated' : 'created'
				} else { // create
					if (existingContent.length > 0) {
						return {
							result: {
								success: false,
								error: 'walkthrough.md already exists. Use mode="append" to add content or mode="replace" to overwrite.',
								filePath: walkthroughUri.fsPath,
								action: 'created' as const,
								preview: existingContent.substring(0, 1000) + (existingContent.length > 1000 ? '...' : '')
							}
						}
					}
					// Only add title heading if content doesn't already start with a heading
					if (title && !content.trimStart().startsWith('#')) {
						finalContent = `# ${title}\n\n${content}`
					}
					action = 'created'
				}

				// Include plan status if requested
				if (includePlanStatus) {
					const plan = this._planningService.getPlanStatus()
					if (plan) {
						const planSection = this._planningService.formatPlanStatus(plan)
						finalContent = finalContent + '\n\n## Current Plan Status\n' + planSection
					}
				}

				// Write file
				await this._fileService.writeFile(walkthroughUri, VSBuffer.fromString(finalContent))

				// Return preview (first 1000 chars - increased from 500 for better context)
				const PREVIEW_TRUNCATION_LENGTH = 1000
				const preview = finalContent.substring(0, PREVIEW_TRUNCATION_LENGTH) + (finalContent.length > PREVIEW_TRUNCATION_LENGTH ? '...' : '')

				return {
					result: {
						success: true,
						filePath: walkthroughUri.fsPath,
						action,
						preview
					}
				}
			},

			open_walkthrough_preview: async ({ file_path: filePath }) => {
				// Validate the file path
				if (!filePath || typeof filePath !== 'string') {
					throw new Error('Invalid file path provided for walkthrough preview');
				}

				try {
					// Read the file content to provide as preview
					const fileContent = await this._fileService.readFile(URI.file(filePath));
					const preview = fileContent.value.toString();

					// Open the walkthrough preview
					await this._agentManagerService.openWalkthroughPreview(filePath, preview);

					return {
						result: {
							success: true,
							message: `Walkthrough preview opened successfully for: ${filePath}`
						}
					};
				} catch (error) {
					throw new Error(`Failed to open walkthrough preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			},

			// --- Implementation Planning tools ---

			create_implementation_plan: async ({ goal, steps }) => {
				const plan = this._implementationPlanningService.createImplementationPlan(goal, steps);
				const summary = this.formatImplementationPlanSummary(plan);

				// Open in React tab
				await this._agentManagerService.openContentPreview(
					`Implementation Plan: ${plan.id}`,
					summary
				);

				return { result: { planId: plan.id, summary } };
			},

			preview_implementation_plan: async () => {
				const plan = this._implementationPlanningService.getCurrentPlan();
				if (!plan) {
					return { result: { planId: '', goal: '', steps: [], summary: 'No active implementation plan. Create one using create_implementation_plan.' } };
				}
				const summary = this.formatImplementationPlanSummary(plan);

				// Open in React tab
				await this._agentManagerService.openContentPreview(
					`Implementation Plan: ${plan.id}`,
					summary
				);

				return { result: { planId: plan.id, goal: plan.goal, steps: plan.steps, summary } };
			},

			execute_implementation_plan: async ({ step_id }) => {
				const plan = this._implementationPlanningService.getCurrentPlan();
				if (!plan) {
					throw new Error('No active implementation plan. Create one using create_implementation_plan.');
				}

				if (!plan.approved) {
					throw new Error('Implementation plan must be approved before execution. Use preview_implementation_plan to review and approve the plan.');
				}

				// If step_id is provided, execute that specific step
				if (step_id) {
					const step = plan.steps.find(s => s.id === step_id);
					if (!step) {
						throw new Error(`Step with ID '${step_id}' not found in current plan.`);
					}

					// Mark step as in progress
					this._implementationPlanningService.updateStepStatus(step_id, 'in_progress');
					const updatedPlan = this._implementationPlanningService.getCurrentPlan()!;
					const summary = this.formatImplementationPlanSummary(updatedPlan);

					return { result: { stepId: step_id, status: 'in_progress', summary } };
				} else {
					// Execute next available step
					const nextStep = this._implementationPlanningService.getNextExecutableStep();
					if (!nextStep) {
						throw new Error('No executable steps found. All steps are either complete, in progress, or have unmet dependencies.');
					}

					// Mark step as in progress
					this._implementationPlanningService.updateStepStatus(nextStep.id, 'in_progress');
					const updatedPlan = this._implementationPlanningService.getCurrentPlan()!;
					const summary = this.formatImplementationPlanSummary(updatedPlan);

					return { result: { stepId: nextStep.id, status: 'in_progress', summary } };
				}
			},

			update_implementation_step: async ({ step_id, status, notes }) => {
				const step = this._implementationPlanningService.updateStepStatus(step_id, status as ImplStepStatus, notes ?? undefined);
				if (!step) {
					throw new Error(`Failed to update step with ID "${step_id}"`);
				}
				const plan = this._implementationPlanningService.getCurrentPlan();
				const summary = plan ? this.formatImplementationPlanSummary(plan) : 'No active plan';
				return { result: { stepId: step.id, newStatus: step.status, summary } };
			},

			get_implementation_status: async () => {
				const plan = this._implementationPlanningService.getCurrentPlan();
				if (!plan) {
					return { result: { planExists: false, summary: null } };
				}
				const summary = this.formatImplementationPlanSummary(plan);
				return { result: { planExists: true, summary } };
			},

			// --- Teaching tools (Student Mode) ---
			explain_code: async ({ code, language, level, focus }) => {
				const levelInstructions = {
					beginner: 'Use simple language, no jargon. Explain like teaching a complete beginner. Use real-world analogies.',
					intermediate: 'Use some technical terms but define them briefly. Assume basic programming knowledge.',
					advanced: 'Use technical terminology freely. Discuss trade-offs, edge cases, and best practices.'
				};

				const template = `## Code Explanation Task

**Code to explain:**
\`\`\`${language}
${code}
\`\`\`

**Student level:** ${level}
**Instructions:** ${levelInstructions[level]}
${focus ? `**Focus on:** ${focus}` : ''}

**IMPORTANT:** Do NOT output the explanation in the chat. Instead, write your response in markdown format and use the \`display_lesson\` tool to show it in a dedicated tab.

**Content Structure:**

### 📋 Summary
(One sentence: what does this code do?)

### 📖 Line-by-Line Breakdown
(Explain each significant part)

### 💡 Key Concepts
(List 2-3 concepts this code demonstrates)

### ⚠️ Common Mistakes
(What do students often get wrong with this pattern?)

### 🎯 Try It Yourself
(Suggest a small modification the student could try)`;

				return { result: { template } };
			},

			teach_concept: async ({ concept, level, language, context }) => {
				const levelInstructions = {
					beginner: 'Use simple language, no jargon. Use everyday analogies. Be very patient and encouraging.',
					intermediate: 'Use some technical terms but explain them. Assume basic programming knowledge.',
					advanced: 'Use technical terminology. Discuss nuances, trade-offs, and advanced patterns.'
				};

				const template = `## Teach Concept Task

**Concept:** ${concept}
**Level:** ${level}
**Instructions:** ${levelInstructions[level]}
${language ? `**Language:** Show examples in ${language}` : ''}
${context ? `**Context:** Relate to: ${context}` : ''}

**IMPORTANT:** Do NOT output the lesson in the chat. Instead, write your response in markdown format and use the \`display_lesson\` tool to show it in a dedicated tab.

**Content Structure:**

### 📚 What is ${concept}?
(Clear definition appropriate for ${level} level)

### 🌍 Real-World Analogy
(Relatable comparison to everyday life)

### 💻 Code Example
\`\`\`${language || 'javascript'}
// Well-commented example demonstrating ${concept}
\`\`\`

### ⚠️ Common Pitfalls
(2-3 mistakes students make with ${concept})

### 🔗 Related Concepts
(What to learn next)

### 🎯 Quick Exercise
(Simple practice problem to reinforce understanding)`;

				return { result: { template } };
			},

			create_exercise: async ({ topic, difficulty, language, type }) => {
				const exerciseId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				// Store exercise in thread state (we'll track this via the exercise ID in responses)
				const typeDescriptions = {
					fill_blank: 'Code with blanks (___) for student to fill in',
					fix_bug: 'Code with intentional bugs for student to find and fix',
					write_function: 'Function signature with description, student writes implementation',
					extend_code: 'Working code that student needs to extend with new features'
				};

				const template = `## Create Exercise Task

**Exercise ID:** ${exerciseId}
**Topic:** ${topic}
**Difficulty:** ${difficulty}
**Language:** ${language}
**Type:** ${type} - ${typeDescriptions[type]}

**Generate an exercise with this structure:**

### 🎯 Challenge: [Creative Title Related to ${topic}]

**Problem:**
(Clear description of what the student needs to do)

**Starter Code:**
\`\`\`${language}
// Provide ${type} starter code for practicing ${topic}
\`\`\`

**Expected Output/Behavior:**
(What the correct solution should produce)

**Hints Available:** 3 (use give_hint tool if stuck)

---
*Exercise ID: ${exerciseId} - Student can use this with check_answer or give_hint*`;

				return { result: { exerciseId, template } };
			},

			check_answer: async ({ exercise_id, student_code }) => {
				const template = `## Validate Student Solution

**Exercise ID:** ${exercise_id}

**Student's Code:**
\`\`\`
${student_code}
\`\`\`

**Your task:**
1. Analyze if this solution is correct
2. Do NOT give the answer if wrong - guide them instead
3. Be encouraging regardless of result

**Response format:**

### Result: ✅ Correct! / ❌ Not quite...

### What Works Well
(Positive feedback on their approach - find something good even if wrong)

### Feedback
(If correct: explain why it works and suggest optimizations. If wrong: give ONE specific hint without revealing the answer)

### Next Step
(If correct: suggest an extension challenge. If wrong: encourage retry or offer to use give_hint)`;

				return { result: { template } };
			},

			give_hint: async ({ exercise_id }) => {
				// For now, we'll track hint level in the response and let the LLM manage it
				// In a full implementation, we'd track this in thread state
				const hintLevel = 1; // Default to level 1, LLM should track progression

				const hintInstructions: { [key: number]: string } = {
					1: 'VAGUE hint - just point in the right direction, no specifics. Example: "Think about what data structure would help here..."',
					2: 'MODERATE hint - mention the specific concept/method needed. Example: "You\'ll need to use a loop that checks each element..."',
					3: 'STRONG hint - show the structure/pseudocode without exact syntax. Example: "The pattern is: for each item, if condition, then action..."',
					4: 'SOLUTION - show the complete answer with full explanation of why it works.'
				};

				const template = `## Hint for Exercise: ${exercise_id}

**Hint Level:** Check previous hints given for this exercise and advance to next level (1→2→3→4)

**Hint Instructions by Level:**
- Level 1: ${hintInstructions[1]}
- Level 2: ${hintInstructions[2]}
- Level 3: ${hintInstructions[3]}
- Level 4: ${hintInstructions[4]}

**Provide the appropriate level hint now.** Track which level you're on based on previous hints given in this conversation.`;

				return { result: { hintLevel, template } };
			},

			create_lesson_plan: async ({ goal, level, time_available }) => {
				const planId = `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				const template = `## Create Lesson Plan

**Plan ID:** ${planId}
**Goal:** ${goal}
**Student Level:** ${level}
${time_available ? `**Time Available:** ${time_available} minutes` : ''}

**IMPORTANT:** Do NOT output the lesson plan in the chat. Instead, write your response in markdown format and use the \`display_lesson\` tool to show it in a dedicated tab.

**Content Structure:**

### 🎯 Learning Objectives
(3-5 specific things student will learn by the end)

### 📚 Prerequisites
(What student should already know before starting)

### 📋 Modules

For each module include:
1. **Module Title** (estimated time)
   - Concepts covered
   - Hands-on exercise (describe briefly)
   - Checkpoint question to verify understanding

### 🏆 Final Project
(Capstone exercise that combines all learned concepts)

### 📈 Success Criteria
(How student knows they've mastered this topic)

---
*Lesson Plan ID: ${planId}*`;

				return { result: { planId, template } };
			},

			display_lesson: async ({ title, content }) => {
				await this._agentManagerService.openContentPreview(title, content);
				return { result: { success: true } };
			},

			load_skill: async ({ skill_name }, opts) => {
				const userHome = await this._pathService.userHome();
				const skillsDir = URI.joinPath(userHome, '.a-coder', 'skills');
				const skillPath = URI.joinPath(skillsDir, skill_name, 'SKILL.md');

				opts?.onData?.(`Loading skill: ${skill_name}...`);

				try {
					const content = await this._fileService.readFile(skillPath);
					const instructions = content.value.toString();
					return { result: { skill_name, instructions, success: true } };
				} catch (error) {
					console.error(`[ToolsService] Failed to load skill ${skill_name}:`, error);
					// Try to list available skills to help the LLM
					let availableSkills: string[] = [];
					try {
						const stat = await this._fileService.resolve(skillsDir);
						if (stat.children) {
							availableSkills = stat.children
								.filter(child => child.isDirectory)
								.map(child => child.name);
						}
					} catch (e) {
						// Skills dir might not exist yet
					}

					const errorMsg = `Skill "${skill_name}" not found. ${availableSkills.length > 0 ? `Available skills: ${availableSkills.join(', ')}` : 'No skills are currently installed.'}`;
					return { result: { skill_name, instructions: errorMsg, success: false } };
				}
			},

			list_skills: async (params, opts) => {
				const userHome = await this._pathService.userHome();
				const skillsDir = URI.joinPath(userHome, '.a-coder', 'skills');
				opts?.onData?.('Listing available skills...');

				const skills: Array<{ name: string, description: string }> = [];

				try {
					const stat = await this._fileService.resolve(skillsDir);
					if (stat.children) {
						for (const child of stat.children) {
							if (child.isDirectory) {
								const skillName = child.name;
								const skillPath = URI.joinPath(skillsDir, skillName, 'SKILL.md');
								try {
									const content = await this._fileService.readFile(skillPath);
									const text = content.value.toString();
									// Extract first paragraph or first 100 chars as description
									const lines = text.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
									const description = lines.length > 0 ? lines[0].substring(0, 150) : 'No description available.';
									skills.push({ name: skillName, description });
								} catch (e) {
									// Skip if SKILL.md is missing
								}
							}
						}
					}
				} catch (error) {
					// Skills dir might not exist
				}

				return { result: { skills } };
			},

			generate_image: async ({ prompt, filename, width, height, quality }, opts) => {
				const settings = this._voidSettingsService.state.globalSettings;
				const baseUrl = settings.imageGenerationBaseUrl;
				const defaultModel = settings.imageGenerationModel.trim();

				// Get workspace root
				const workspaceRoot = this._workspaceContextService.getWorkspace().folders[0]?.uri;
				if (!workspaceRoot) {
					throw new Error('No workspace folder open');
				}

				opts?.onData?.(`Generating image...`);

				// Construct size parameter from width and height
				let size = '1024x1024';
				if (width && height) {
					size = `${width}x${height}`;
				}

				// Get IPC channel to electron-main for image generation
				const channel = this._mainProcessService.getChannel('void-channel-image-generation');

				// Call the main process to make the request (handles HTTPS with self-signed certs)
				const response = await channel.call('generateImage', {
					baseUrl,
					model: defaultModel,
					prompt,
					size,
					quality,
				}) as { success: boolean; data?: string; error?: string };

				if (!response.success || !response.data) {
					throw new Error(response.error || 'Image generation failed');
				}

				const b64Json = response.data;

				// Generate unique filename - use provided filename or create timestamp-based one
				const timestamp = Date.now();
				const safeFilename = filename
					? `${filename.replace(/[^a-zA-Z0-9-_]/g, '_')}-${timestamp}.png`
					: `generated-image-${timestamp}.png`;

				// Create file URI
				const imageUri = workspaceRoot.with({ path: `${workspaceRoot.path}/${safeFilename}` });

				// Convert base64 to VSBuffer and write file
				const binaryString = atob(b64Json);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}
				await this._fileService.writeFile(imageUri, VSBuffer.wrap(bytes));

				// Get relative path for display
				const relativePath = safeFilename;

				// Create markdown with full file URI for proper rendering
				const fileUrl = imageUri.toString();
				const markdown = `![Generated Image](${fileUrl})`;

				return { result: { url: relativePath, markdown } };
			},

			render_form: async ({ title, description, questions }, opts) => {
				opts?.onData?.('Rendering form...');

				// The actual form rendering happens on the UI side
				// We just return a template that indicates the form is ready
				const template = title
					? `### ${title}\n\n${description || ''}\n\nPlease answer the questions in the form below.`
					: 'Please answer the questions in the form below.';

				return { result: { template } };
			},

			create_quiz: async ({ title, description, questions, total_points }, opts) => {
				opts?.onData?.('Creating quiz...');

				// Generate a unique quiz ID
				const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				// The actual quiz rendering happens on the UI side
				// We just return a template that indicates the quiz is ready
				const totalPoints = total_points || questions?.reduce((sum: number, q: any) => sum + (q.points || 10), 0) || 0;
				const questionCount = questions?.length || 0;
				const template = `### ${title}

${description || ''}

**Quiz Details:**
- Questions: ${questionCount}
- Total Points: ${totalPoints}

Please answer the questions in the quiz below. Your answers will be graded and reviewed.`;

				return { result: { quiz_id: quizId, template } };
			},

		}

		// given to the LLM after the call for successful tool calls
		this.stringOfResult = {
			read_file: (params, result) => {
				// Build context header showing what was read
				let contextHeader = `File: ${params.uri.fsPath}\n`

				// Show what was read
				if (params.startLine !== null || params.endLine !== null) {
					const start = params.startLine ?? 1
					const end = params.endLine ?? result.totalNumLines
					contextHeader += `Lines: ${start}-${end} (of ${result.totalNumLines} total)\n`
				} else {
					contextHeader += `Total lines: ${result.totalNumLines}\n`
				}

				// Note: Content already has line numbers prefixed
				contextHeader += `(Line numbers are prefixed to each line as "N | content")\n`

				// Add truncation warning if needed
				const truncationWarning = result.hasNextPage
					? `\n\n⚠️ FILE TRUNCATED - This file has ${result.totalNumLines} total lines (${result.totalFileLen} characters). You are viewing page ${params.pageNumber}. To read more, call read_file again with page_number=${params.pageNumber + 1}.`
					: ''

				return `${contextHeader}\`\`\`\n${result.fileContents}\n\`\`\`${truncationWarning}`
			},
			outline_file: (params, result) => {
				return result.outline; // Already formatted by formatOutline()
			},
			ls_dir: (params, result) => {
				const dirTreeStr = stringifyDirectoryTree1Deep(params, result)
				// Try TOON encoding for structured directory data
				return this._maybeEncodeToon(result, dirTreeStr)
			},
			get_dir_tree: (params, result) => {
				return result.str
			},
			search_pathnames_only: (params, result) => {
				return result.uris.map((uri: any) => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_for_files: (params, result) => {
				return result.uris.map((uri: any) => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_in_file: (params, result) => {
				const { model } = this._voidModelService.getModel(params.uri)
				if (!model) return '<Error getting string of result>'
				const lines = result.lines.map((n: number) => {
					const lineContent = model.getValueInRange({ startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: Number.MAX_SAFE_INTEGER }, EndOfLinePreference.LF)
					return `Line ${n}:\n\`\`\`\n${lineContent}\n\`\`\``
				}).join('\n\n');
				return lines;
			},
			read_lint_errors: (params, result) => {
				if (!result.lintErrors) {
					return 'No lint errors found.';
				}
				const lintErrorsStr = stringifyLintErrors(result.lintErrors);
				// Try TOON encoding for structured lint error data
				return this._maybeEncodeToon(result.lintErrors, lintErrorsStr);
			},
			fast_context: (params, result) => {
				if (result.contexts.length === 0) {
					return `Morph found no relevant contexts for your query: "${params.query}"`;
				}

				let output = `Morph found ${result.contexts.length} relevant code contexts for your query: "${params.query}"\n\n`;

				for (const ctx of result.contexts) {
					output += `File: ${ctx.file}\n\`\`\`\n${ctx.content}\n\`\`\`\n\n`;
				}

				return output;
			},
			// ---
			create_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully created.`
			},
			delete_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully deleted.`
			},
			edit_file: (params, result) => {
				const lintErrsString = (
					this._voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			rewrite_file: (params, result) => {
				const lintErrsString = (
					this._voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			codebase_search: (params, result) => {
				if (!result.success || result.results.length === 0) return `No results found for codebase search: "${params.query}"`
				let output = `Codebase search results for "${params.query}":\n\n`
				for (const res of result.results) {
					const score = (res.rerankScore * 100).toFixed(1);
					output += `File: ${res.filepath} (Relevance: ${score}%)\n\`\`\`\n${res.content}\n\`\`\`\n\n`
				}
				return output
			},
			repo_init: (params, result) => {
				return result.success ? `Repository successfully initialized in ${params.dir || 'root'}.` : `Failed to initialize repository.`
			},
			repo_clone: (params, result) => {
				return result.success ? `Repository ${params.repoId} successfully cloned into ${params.dir}.` : `Failed to clone repository.`
			},
			repo_add: (params, result) => {
				return result.success ? `File ${params.filepath || '.'} successfully staged.` : `Failed to stage file.`
			},
			repo_commit: (params, result) => {
				return result.success ? `Changes successfully committed. ${result.commitSha ? `Commit SHA: ${result.commitSha}` : ''}` : `Failed to commit changes.`
			},
			repo_push: (params, result) => {
				return result.success ? `Changes successfully pushed to ${params.branch || 'remote'}.` : `Failed to push changes.`
			},
			repo_pull: (params, result) => {
				return result.success ? `Changes successfully pulled from remote.` : `Failed to pull changes.`
			},
			repo_status: (params, result) => {
				return `Status for ${params.filepath}: ${JSON.stringify(result, null, 2)}`
			},
			repo_status_matrix: (params, result) => {
				return `Status Matrix: ${JSON.stringify(result, null, 2)}`
			},
			repo_log: (params, result) => {
				return `Commit Log: ${JSON.stringify(result, null, 2)}`
			},
			repo_checkout: (params, result) => {
				return result.success ? `Successfully checked out ${params.ref}.` : `Failed to checkout ${params.ref}.`
			},
			repo_branch: (params, result) => {
				return result.success ? `Successfully created branch ${params.name}.` : `Failed to create branch ${params.name}.`
			},
			repo_list_branches: (params, result) => {
				return `Branches: ${result.join(', ')}`
			},
			repo_current_branch: (params, result) => {
				return `Current branch: ${result}`
			},
			repo_resolve_ref: (params, result) => {
				return `Resolved ${params.ref} to ${result}`
			},
			repo_get_commit_metadata: (params, result) => {
				return `Commit Metadata: ${JSON.stringify(result, null, 2)}`
			},
			repo_wait_for_embeddings: (params, result) => {
				return result.success ? `Embeddings are now ready.` : `Timed out waiting for embeddings.`
			},
			wait: (params, result) => {
				const { resolveReason, result: result_, } = result
				if (resolveReason.type === 'done') {
					return `${result_}\n(Command finished with exit code ${resolveReason.exitCode})`
				}
				if (resolveReason.type === 'timeout') {
					return `${result_}\n(Wait timed out after ${params.timeoutMs}ms. The command may still be running in the background.)`
				}
				return result_
			},
			check_terminal_status: (params, result) => {
				const { resolveReason, result: result_, } = result
				if (resolveReason.type === 'done') {
					return `${result_}\n(Command finished with exit code ${resolveReason.exitCode})`
				}
				if (resolveReason.type === 'timeout') {
					return `${result_}\n(Command is still running. Output above is the latest output.)`
				}
				return result_
			},
			run_command: (params, result) => {
				const { resolveReason, result: result_, terminalId } = result as any // terminalId added in callTool
				
				let prefix = '';
				if (terminalId) {
					prefix = `(Ran in persistent terminal "${terminalId}")\n`;
				}

				// success
				if (resolveReason.type === 'done') {
					return `${prefix}${result_}\n(exit code ${resolveReason.exitCode})`
				}
				// normal command timeout
				if (resolveReason.type === 'timeout') {
					if (terminalId) {
						// Persistent/Background timeout
						return `${prefix}${result_}\n(Terminal command is running in background. The given outputs are the results after ${MAX_TERMINAL_BG_COMMAND_TIME} seconds. Use check_terminal_status to check progress.)`
					} else {
						// Temporary timeout
						return `${result_}\n(Terminal command ran, but was automatically killed by Void after ${MAX_TERMINAL_INACTIVE_TIME}s of inactivity and did not finish successfully. To run longer tasks, use run_command with is_background=true.)`
					}
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			open_persistent_terminal: (_params, result) => {
				const { persistentTerminalId } = result;
				return `Successfully created persistent terminal. persistentTerminalId="${persistentTerminalId}"`;
			},
			kill_persistent_terminal: (params, _result) => {
				return `Successfully closed terminal "${params.persistentTerminalId}".`;
			},
			run_code: (params, result) => {
				if (!result.success) {
					return `Code execution failed:\n${result.error}\n\nLogs:\n${result.logs.join('\n')}`;
				}
				const resultStr = typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result);
				const logsStr = result.logs.length > 0 ? `\n\nConsole output:\n${result.logs.join('\n')}` : '';
				return `Code executed successfully.\n\nResult:\n${resultStr}${logsStr}`;
			},

			// --- Planning tools ---

			create_plan: (params, result) => {
				return `✅ Plan created successfully!\n\n${result.summary}`;
			},

			update_task_status: (params, result) => {
				return `✅ Task "${result.taskId}" updated to status: ${result.newStatus}\n\n${result.summary}`;
			},

			get_plan_status: (params, result) => {
				if (!result.planExists) {
					return 'No active plan. Create one using create_plan.';
				}
				return result.summary!;
			},

			add_tasks_to_plan: (params, result) => {
				return `✅ Tasks added to plan!\n\n${result.summary}`;
			},

			update_walkthrough: (params, result) => {
				const actionEmoji = result.action === 'created' ? '📝' : result.action === 'updated' ? '✏️' : '➕'
				const actionText = result.action === 'created' ? 'created' : result.action === 'updated' ? 'updated' : 'appended to'
				return `${actionEmoji} Walkthrough ${actionText} successfully!\n\n📁 File: ${result.filePath}\n\n📄 Preview:\n${result.preview}`;
			},

			open_walkthrough_preview: (params, result) => {
				if (result.success) {
					return `👀 Walkthrough preview opened!\n\n${result.message}`;
				} else {
					return `❌ Failed to open walkthrough preview: ${result.message}`;
				}
			},

			// --- Implementation Planning tools ---

			create_implementation_plan: (params, result) => {
				return `\u{1F4CB} Implementation plan created!\n\nPlan ID: ${result.planId}\n\n${result.summary}\n\n💡 Next: Use preview_implementation_plan to review the plan before execution.`;
			},

			preview_implementation_plan: (params, result) => {
				if (!result.planId) {
					return `❌ No active implementation plan to preview.\n\n💡 Create a plan first using create_implementation_plan.`;
				}
				return `\u{1F4CB} Implementation Plan Preview\n\n${result.summary}\n\n💡 To approve this plan for execution, use execute_implementation_plan.`;
			},

			execute_implementation_plan: (params, result) => {
				const statusEmoji = result.status === 'in_progress' ? '🔄' : result.status === 'complete' ? '✅' : '⏳';
				return `${statusEmoji} Step execution started!\n\nStep ID: ${result.stepId}\nStatus: ${result.status}\n\n${result.summary}`;
			},

			update_implementation_step: (params, result) => {
				const statusEmoji = result.newStatus === 'complete' ? '✅' : result.newStatus === 'in_progress' ? '🔄' : result.newStatus === 'failed' ? '❌' : '⏭️';
				return `${statusEmoji} Step updated!\n\nStep ID: ${result.stepId}\nNew Status: ${result.newStatus}\n\n${result.summary}`;
			},

			get_implementation_status: (params, result) => {
				if (!result.planExists) {
					return `❌ No active implementation plan.\n\n💡 Create a plan first using create_implementation_plan.`;
				}
				return `📊 Implementation Status\n\n${result.summary}`;
			},

			// --- Teaching tools (Student Mode) ---

			explain_code: (params, result) => {
				return `📚 Code Explanation\n\n${result.template}`;
			},

			teach_concept: (params, result) => {
				return `📖 Teaching: ${params.concept}\n\n${result.template}`;
			},

			create_exercise: (params, result) => {
				return `🎯 Exercise Created!\n\nExercise ID: ${result.exerciseId}\n\n${result.template}`;
			},

			check_answer: (params, result) => {
				return `📝 Answer Check\n\n${result.template}`;
			},

			give_hint: (params, result) => {
				return `💡 Hint (Level ${result.hintLevel})\n\n${result.template}`;
			},

			display_lesson: (params, result) => {
				return result.success ? '✅ Lesson displayed successfully in a new tab.' : '❌ Failed to display lesson.'
			},

			create_lesson_plan: (params, result) => {
				return `📚 Lesson Plan Created!\n\nPlan ID: ${result.planId}\n\n${result.template}`;
			},

			load_skill: (params, result) => {
				if (result.success) {
					return `✅ Skill "${result.skill_name}" loaded successfully!\n\n${result.instructions}`;
				} else {
					return `❌ Failed to load skill "${result.skill_name}":\n${result.instructions}`;
				}
			},

			list_skills: (params, result) => {
				if (result.skills.length === 0) {
					return 'No specialized skills are currently available.';
				}

				let output = 'Available specialized skills:\n\n';
				for (const skill of result.skills) {
					output += `- **${skill.name}**: ${skill.description}\n`;
				}
				output += '\nUse `load_skill(skill_name="name")` to load a skill.';
				                return result.skills.length === 0 ? 'No specialized skills are currently available.' : output;
				            },
				
				            generate_image: (params, result) => {
				                return `Successfully generated image for prompt: "${params.prompt}"\n\n${result.markdown}`;
				            },

				            render_form: (params, result) => {
				                return result.template || 'Form rendered successfully. The user can now provide their responses.';
				            },

				            create_quiz: (params, result) => {
				                return result.template || 'Quiz created successfully. The student can now answer the questions.';
				            },
				        }
				    }
	// Helper method to format implementation plan summary
	private formatImplementationPlanSummary(plan: ImplementationPlan): string {
		const { steps } = plan;
		const completed = steps.filter((s: ImplementationStep) => s.status === 'complete').length;
		const total = steps.length;
		const progress = Math.round((completed / total) * 100);

		let output = `# ${plan.goal}\n\n`;
		
		output += `> **Progress:** ${completed}/${total} steps complete (${progress}%)\n\n`;
		
		// Status summary bar (visual)
		const progressBarWidth = 20;
		const filledWidth = Math.round((completed / total) * progressBarWidth);
		const bar = '█'.repeat(filledWidth) + '░'.repeat(progressBarWidth - filledWidth);
		output += `\`${bar}\`\n\n`;

		// Group steps by status
		const stepsByStatus = this._implementationPlanningService.getStepsByStatus();

		// Show in-progress steps first
		if (stepsByStatus.in_progress.length > 0) {
			output += `## 🔄 In Progress\n\n`;
			for (const step of stepsByStatus.in_progress) {
				const complexity = this.getComplexityEmoji(step.complexity);
				const files = step.files.length > 0 ? `  \n  **Files:** ${step.files.map(f => `\`${f}\``).join(', ')}` : '';
				output += `### ${complexity} Step ${step.id}: ${step.title}\n`;
				output += `${step.description}\n${files}\n`;
				if (step.notes) {
					output += `\n> 💡 **Notes:** ${step.notes}\n`;
				}
				output += '\n---\n\n';
			}
		}

		// Then pending steps
		if (stepsByStatus.pending.length > 0) {
			output += `## ⏳ Pending Steps\n\n`;
			for (const step of stepsByStatus.pending) {
				const complexity = this.getComplexityEmoji(step.complexity);
				const deps = step.dependencies.length > 0 ? `  \n  **Depends on:** ${step.dependencies.map(d => `\`${d}\``).join(', ')}` : '';
				const files = step.files.length > 0 ? `  \n  **Files involved:** ${step.files.map(f => `\`${f}\``).join(', ')}` : '';
				const time = step.estimated_time ? `  \n  **Estimated time:** ${step.estimated_time} minutes` : '';
				
				output += `### ${complexity} Step ${step.id}: ${step.title}\n`;
				output += `${step.description}\n${files}${time}${deps}\n\n`;
			}
		}

		// Then completed steps
		if (stepsByStatus.complete.length > 0) {
			output += `## ✅ Completed\n\n`;
			for (const step of stepsByStatus.complete) {
				const complexity = this.getComplexityEmoji(step.complexity);
				output += `- **[${step.id}] ${step.title}** ${complexity}\n`;
				if (step.notes) {
					output += `  *${step.notes}*\n`;
				}
			}
			output += '\n';
		}

		// Show failed steps
		if (stepsByStatus.failed.length > 0) {
			output += `## ❌ Failed\n\n`;
			for (const step of stepsByStatus.failed) {
				output += `### Step ${step.id}: ${step.title}\n`;
				output += `> ⚠️ **Error:** ${step.notes || 'Unknown error'}\n\n`;
			}
		}

		// Show approval status
		output += `\n\n---\n**Plan Status:** ${plan.approved ? '✅ Approved for execution' : '⏸️ Pending review'}`;

		return output;
	}

	private getComplexityEmoji(complexity: 'simple' | 'medium' | 'complex'): string {
		switch (complexity) {
			case 'simple': return '🟢';
			case 'medium': return '🟡';
			case 'complex': return '🔴';
			default: return '⚪';
		}
	}


	/**
	 * Wrap structured data with TOON encoding if enabled and beneficial
	 */
	private _maybeEncodeToon(data: any, fallbackStr: string): string {
		const enableToon = this._voidSettingsService.state.globalSettings.enableToolResultTOON;

		if (!enableToon) {
			return fallbackStr;
		}

		// Check if TOON would be beneficial
		if (this._toonService.shouldUseToon(data)) {
			try {
				const toonEncoded = this._toonService.encode(data);
				// Only use TOON if it actually saves space
				if (toonEncoded.length < fallbackStr.length * 0.9) {
					return `[TOON]\n${toonEncoded}`;
				}
			} catch (e) {
				// Fall back to regular format if encoding fails
				console.warn('[ToolsService] TOON encoding failed:', e);
			}
		}

		return fallbackStr;
	}

	private _getLintErrors(uri: URI): { lintErrors: LintErrorItem[] | null } {
		const lintErrors = this._markerService
			.read({ resource: uri })
			.filter(l => l.severity === MarkerSeverity.Error || l.severity === MarkerSeverity.Warning)
			.slice(0, 100)
			.map(l => ({
				code: typeof l.code === 'string' ? l.code : l.code?.value || '',
				message: (l.severity === MarkerSeverity.Error ? '(error) ' : '(warning) ') + l.message,
				startLineNumber: l.startLineNumber,
				endLineNumber: l.endLineNumber,
			} satisfies LintErrorItem))

		if (!lintErrors.length) return { lintErrors: null }
		return { lintErrors, }
	}

	/**
	 * Get IPC channel for code execution
	 */
	private getCodeExecutionChannel(): any {
		return this._mainProcessService.getChannel('void-channel-code-execution');
	}

	/**
	 * Handle tool call request from sandbox via IPC
	 */
	private async handleToolCallFromSandbox(
		channel: any,
		request: { requestId: string; toolName: string; params: any }
	): Promise<void> {
		const { requestId, toolName, params } = request;

		try {
			// Execute the actual tool
			const toolResult = await (this.callTool as any)[toolName](params);

			// Send success response back to electron-main
			await channel.call('respondToToolCall', {
				requestId,
				success: true,
				result: toolResult
			});
		} catch (error) {
			// Send error response back to electron-main
			await channel.call('respondToToolCall', {
				requestId,
				success: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Get the planning service for UI access
	 */
	public getPlanningService(): PlanningService {
		return this._planningService;
	}

	public getImplementationPlanningService(): ImplementationPlanningService {
		return this._implementationPlanningService;
	}

	private async _syncToMorphRepoStorage(uri: URI, message: string): Promise<void> {
		const gs = this._voidSettingsService.state.globalSettings;
		if (!gs.enableMorphRepoStorage || !gs.morphApiKey) return;

		try {
			const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(uri);
			if (!workspaceFolder) return;

			const repoDir = workspaceFolder.uri.fsPath;
			const relativePath = path.relative(repoDir, uri.fsPath);

			const repoId = gs.morphRepoId || workspaceFolder.name;

			// Initialize (safe to call multiple times)
			await this._morphService.repoInit({ repoId, dir: repoDir });

			// Add changed file
			await this._morphService.repoAdd({ dir: repoDir, filepath: relativePath });

			// Commit
			await this._morphService.repoCommit({
				dir: repoDir,
				message: message,
				metadata: { source: 'code', tool: 'void-coder' }
			});

			// Push with indexing
			await this._morphService.repoPush({
				dir: repoDir,
				branch: gs.morphRepoBranch,
				index: gs.morphRepoIndexOnPush,
				waitForEmbeddings: gs.morphRepoWaitForEmbeddings
			});

			console.log(`[ToolsService] Successfully synced ${relativePath} to Morph Repo Storage`);
		} catch (error) {
			console.error('[ToolsService] Failed to sync to Morph Repo Storage:', error);
		}
	}
}

registerSingleton(IToolsService, ToolsService, InstantiationType.Delayed);
