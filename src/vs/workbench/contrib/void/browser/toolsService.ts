import { CancellationToken } from '../../../../base/common/cancellation.js'
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
import { IVoidCommandBarService } from './voidCommandBarService.js'
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
import { ImplementationPlanningService, ImplementationPlan, StepStatus as ImplStepStatus } from '../common/implementationPlanningService.js'
import { LiteModeService } from './liteModeService.js'


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
}

export const IToolsService = createDecorator<IToolsService>('ToolsService');

export class ToolsService implements IToolsService {

	readonly _serviceBrand: undefined;

	public validateParams: ValidateBuiltinParams;
	public callTool: CallBuiltinTool;
	public stringOfResult: BuiltinToolResultToString;

	private readonly toonService: ToonService;
	private readonly planningService: PlanningService;
	private readonly implementationPlanningService: ImplementationPlanningService;
	private readonly _fileService: IFileService;
	private readonly _instantiationService: IInstantiationService;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ISearchService searchService: ISearchService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IVoidModelService voidModelService: IVoidModelService,
		@IEditCodeService editCodeService: IEditCodeService,
		@ITerminalToolService private readonly terminalToolService: ITerminalToolService,
		@IVoidCommandBarService private readonly commandBarService: IVoidCommandBarService,
		@IDirectoryStrService private readonly directoryStrService: IDirectoryStrService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IMorphService private readonly morphService: IMorphService,
	) {
		const queryBuilder = instantiationService.createInstance(QueryBuilder);
		this.toonService = new ToonService();
		this.planningService = new PlanningService();
		this.implementationPlanningService = new ImplementationPlanningService();
		this._fileService = fileService;
		this._instantiationService = instantiationService;

		this.validateParams = {
			read_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, start_line: startLineUnknown, end_line: endLineUnknown, page_number: pageNumberUnknown, explanation: explanationUnknown } = params
				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const explanation = typeof explanationUnknown === 'string' ? explanationUnknown : null

				let startLine = validateNumber(startLineUnknown, { default: null })
				let endLine = validateNumber(endLineUnknown, { default: null })

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
				const { uri: uriStr, search_replace_blocks: searchReplaceBlocksUnknown, try_fuzzy_matching: tryFuzzyMatchingUnknown } = params
				const uri = validateURI(uriStr)
				const searchReplaceBlocks = validateStr('searchReplaceBlocks', searchReplaceBlocksUnknown)
				const tryFuzzyMatching = validateBoolean(tryFuzzyMatchingUnknown, { default: false })
				return { uri, searchReplaceBlocks, tryFuzzyMatching }
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
				const { command: commandUnknown, cwd: cwdUnknown } = params
				const command = validateStr('command', commandUnknown)
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				const terminalId = generateUuid()
				return { command, cwd, terminalId }
			},
			run_persistent_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, persistent_terminal_id: persistentTerminalIdUnknown } = params;
				const command = validateStr('command', commandUnknown);
				const persistentTerminalId = validateProposedTerminalId(persistentTerminalIdUnknown)
				return { command, persistentTerminalId };
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

		}


		this.callTool = {
			read_file: async ({ uri, startLine, endLine, pageNumber, explanation }) => {
				await voidModelService.initializeModel(uri)
				const { model } = await voidModelService.getModelSafe(uri)
				if (model === null) { throw new Error(`No contents; File does not exist.`) }

				const totalNumLines = model.getLineCount()
				const totalFileLen = model.getValueLength(EndOfLinePreference.LF)

				// Helper to add line numbers to content
				const addLineNumbers = (content: string, startLineNum: number): string => {
					const lines = content.split('\n')
					return lines.map((line, idx) =>
						`${startLineNum + idx} | ${line}`
					).join('\n')
				}

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
				
				// Optimization: If we need a page, we still need to find which lines it corresponds to
				// for the line numbers. This is still slightly inefficient but better than loading the whole string.
				// However, model.getValueInRange uses line numbers.
				// To use characters, we'd need to convert character offsets to line numbers.
				
				// For now, let's at least avoid the full model.getValue() call.
				// We can get the full contents only for the paginated part if we really have to, 
				// but let's try to be smarter.
				
				// If we use pagination by characters, we can use model.getValueInRange with offsets if supported,
				// but standard ITextModel doesn't have offset-based getValue.
				// It has getOffsetAtPos and getPositionAt(offset).
				
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

			outline_file: async ({ uri }) => {
				await voidModelService.initializeModel(uri)
				const { model } = await voidModelService.getModelSafe(uri)
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
				const dirResult = await computeDirectoryTree1Deep(fileService, uri, pageNumber)
				return { result: dirResult }
			},

			get_dir_tree: async ({ uri }) => {
				const str = await this.directoryStrService.getDirectoryStrTool(uri)
				return { result: { str } }
			},

			search_pathnames_only: async ({ query: queryStr, includePattern, pageNumber }) => {

				const query = queryBuilder.file(workspaceContextService.getWorkspace().folders.map(f => f.uri), {
					filePattern: queryStr,
					includePattern: includePattern ?? undefined,
					sortByScore: true, // makes results 10x better
				})
				const data = await searchService.fileSearch(query, CancellationToken.None)

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
					workspaceContextService.getWorkspace().folders.map(f => f.uri)
					: [searchInFolder]

				const query = queryBuilder.text({
					pattern: queryStr,
					isRegExp: isRegex,
				}, searchFolders)

				const data = await searchService.textSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { queryStr, uris, hasNextPage } }
			},
			search_in_file: async ({ uri, query, isRegex }) => {
				await voidModelService.initializeModel(uri);
				const { model } = await voidModelService.getModelSafe(uri);
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

			// ---

			create_file_or_folder: async ({ uri, isFolder }) => {
				if (isFolder)
					await fileService.createFolder(uri)
				else {
					await fileService.createFile(uri)
				}
				return { result: {} }
			},

			delete_file_or_folder: async ({ uri, isRecursive }) => {
				await fileService.del(uri, { recursive: isRecursive })
				return { result: {} }
			},

			rewrite_file: async ({ uri, newContent }, opts) => {
				await voidModelService.initializeModel(uri)

				// Check if file exists, if not create it (if within workspace)
				const { model } = await voidModelService.getModelSafe(uri)
				const isNewFile = model === null

				if (isNewFile) {
					// File doesn't exist - check if it's within the workspace
					const workspaceFolders = workspaceContextService.getWorkspace().folders
					const isInWorkspace = workspaceFolders.some(folder =>
						uri.fsPath.startsWith(folder.uri.fsPath)
					)

					if (!isInWorkspace) {
						throw new Error(`File does not exist and path is outside workspace. Use create_file_or_folder first, or ensure the path is within the workspace: ${uri.fsPath}`)
					}

					// Create the file (empty first, then we'll rewrite it)
					await fileService.createFile(uri, VSBuffer.fromString(''))
					// Re-initialize the model after creating
					await voidModelService.initializeModel(uri)
				}

				if (this.commandBarService.getStreamState(uri) === 'streaming') {
					throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
				}
				await editCodeService.callBeforeApplyOrEdit(uri)

				// Check if Morph Fast Apply is enabled for Chat feature (skip for new files)
				const chatModelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
				const useMorph = !isNewFile && chatModelSelection
					? this.voidSettingsService.state.optionsOfModelSelection['Chat'][chatModelSelection.providerName]?.[chatModelSelection.modelName]?.morphFastApply
					: false;

				if (useMorph) {
					// Use Morph Fast Apply
					const fileContent = await fileService.readFile(uri);
					const originalContent = fileContent.value.toString();
					const appliedCode = await this.morphService.applyCodeChange({
						instruction: 'Rewriting entire file with new content',
						originalCode: originalContent,
						updatedCode: newContent
					});
					editCodeService.instantlyRewriteFile({ uri, newContent: appliedCode, onProgress: opts?.onData });
				} else {
					// Use standard rewrite
					editCodeService.instantlyRewriteFile({ uri, newContent, onProgress: opts?.onData });
				}

				// at end, get lint errors
				const lintErrorsPromise = Promise.resolve().then(async () => {
					await timeout(2000)
					const { lintErrors } = this._getLintErrors(uri)
					return { lintErrors }
				})
				return { result: lintErrorsPromise }
			},

			edit_file: async ({ uri, searchReplaceBlocks, tryFuzzyMatching }, opts) => {
				await voidModelService.initializeModel(uri)
				if (this.commandBarService.getStreamState(uri) === 'streaming') {
					throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
				}
				await editCodeService.callBeforeApplyOrEdit(uri)

				// Check if Morph Fast Apply is enabled for Chat feature
				const chatModelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
				const useMorph = chatModelSelection
					? this.voidSettingsService.state.optionsOfModelSelection['Chat'][chatModelSelection.providerName]?.[chatModelSelection.modelName]?.morphFastApply
					: false;

				if (useMorph) {
					// Use Morph Fast Apply - convert search/replace blocks to Morph format
					const fileContent = await fileService.readFile(uri);
					const originalContent = fileContent.value.toString();
					const appliedCode = await this.morphService.applyCodeChange({
						instruction: 'Applying code edits',
						originalCode: originalContent,
						updatedCode: searchReplaceBlocks // Morph expects code with // ... existing code ... format
					});
					editCodeService.instantlyRewriteFile({ uri, newContent: appliedCode, onProgress: opts?.onData });
				} else {
					// Use standard search/replace
					await editCodeService.instantlyApplySearchReplaceBlocks({ uri, searchReplaceBlocks, tryFuzzyMatching, onProgress: opts?.onData });
				}

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
			run_command: async ({ command, cwd, terminalId }, opts) => {
				const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'temporary', cwd, terminalId, onData: opts?.onData })
				return { result: resPromise, interruptTool: interrupt }
			},
			run_persistent_command: async ({ command, persistentTerminalId }, opts) => {
				const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'persistent', persistentTerminalId, onData: opts?.onData })
				return { result: resPromise, interruptTool: interrupt }
			},
			open_persistent_terminal: async ({ cwd }) => {
				const persistentTerminalId = await this.terminalToolService.createPersistentTerminal({ cwd })
				return { result: { persistentTerminalId } }
			},
			kill_persistent_terminal: async ({ persistentTerminalId }) => {
				// Close the background terminal by sending exit
				await this.terminalToolService.killPersistentTerminal(persistentTerminalId)
				return { result: {} }
			},

			// --- Planning tools ---

			create_plan: async ({ goal, tasks }) => {
				const plan = this.planningService.createPlan(goal, tasks);
				const summary = this.planningService.formatPlanStatus(plan);
				return { result: { planId: plan.id, summary } };
			},

			update_task_status: async ({ taskId, status, notes }) => {
				const task = this.planningService.updateTaskStatus(taskId, status as PlanTaskStatus, notes ?? undefined);
				const plan = this.planningService.getPlanStatus();
				const summary = plan ? this.planningService.formatPlanStatus(plan) : 'No active plan';
				return { result: { taskId: task.id, newStatus: task.status, summary } };
			},

			get_plan_status: async () => {
				const plan = this.planningService.getPlanStatus();
				if (!plan) {
					return { result: { planExists: false, summary: null } };
				}
				const summary = this.planningService.formatPlanStatus(plan);
				return { result: { planExists: true, summary } };
			},

			add_tasks_to_plan: async ({ tasks }) => {
				const plan = this.planningService.addTasksToPlan(tasks);
				const summary = this.planningService.formatPlanStatus(plan);
				return { result: { summary } };
			},

			update_walkthrough: async ({ content, mode, title, includePlanStatus }) => {
				// Get workspace root
				const workspaceRoot = workspaceContextService.getWorkspace().folders[0]?.uri
				if (!workspaceRoot) {
					throw new Error('No workspace folder found. Please open a folder in VS Code to use the walkthrough feature.')
				}

				// Construct file URI
				const walkthroughUri = workspaceRoot.with({ path: `${workspaceRoot.path}/walkthrough.md` })

				// Handle different modes
				let finalContent = content
				let action: 'created' | 'updated' | 'appended'

				// Check if file exists
				let existingContent = ''
				try {
					const existingFile = await fileService.readFile(walkthroughUri)
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
						throw new Error('walkthrough.md already exists. Use mode="append" to add content or mode="replace" to overwrite.')
					}
					// Only add title heading if content doesn't already start with a heading
					if (title && !content.trimStart().startsWith('#')) {
						finalContent = `# ${title}\n\n${content}`
					}
					action = 'created'
				}

				// Include plan status if requested
				if (includePlanStatus) {
					const plan = this.planningService.getPlanStatus()
					if (plan) {
						const planSection = this.planningService.formatPlanStatus(plan)
						finalContent = finalContent + '\n\n## Current Plan Status\n' + planSection
					}
				}

				// Write file
				await fileService.writeFile(walkthroughUri, VSBuffer.fromString(finalContent))

				// Return preview (first 500 chars)
				const preview = finalContent.substring(0, 500) + (finalContent.length > 500 ? '...' : '')

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
					// Get the Lite Mode service
					const liteModeService = this._instantiationService.createInstance(LiteModeService);

					// Read the file content to provide as preview
					const fileContent = await this._fileService.readFile(URI.file(filePath));
					const preview = fileContent.value.toString();

					// Open the walkthrough preview
					await liteModeService.openWalkthroughPreview(filePath, preview);

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
				const plan = this.implementationPlanningService.createImplementationPlan(goal, steps);
				const summary = this.formatImplementationPlanSummary(plan);
				return { result: { planId: plan.id, summary } };
			},

			preview_implementation_plan: async () => {
				const plan = this.implementationPlanningService.getCurrentPlan();
				if (!plan) {
					return { result: { planId: '', goal: '', steps: [], summary: 'No active implementation plan. Create one using create_implementation_plan.' } };
				}
				const summary = this.formatImplementationPlanSummary(plan);
				return { result: { planId: plan.id, goal: plan.goal, steps: plan.steps, summary } };
			},

			execute_implementation_plan: async ({ step_id }) => {
				const plan = this.implementationPlanningService.getCurrentPlan();
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
					this.implementationPlanningService.updateStepStatus(step_id, 'in_progress');
					const updatedPlan = this.implementationPlanningService.getCurrentPlan()!;
					const summary = this.formatImplementationPlanSummary(updatedPlan);

					return { result: { stepId: step_id, status: 'in_progress', summary } };
				} else {
					// Execute next available step
					const nextStep = this.implementationPlanningService.getNextExecutableStep();
					if (!nextStep) {
						throw new Error('No executable steps found. All steps are either complete, in progress, or have unmet dependencies.');
					}

					// Mark step as in progress
					this.implementationPlanningService.updateStepStatus(nextStep.id, 'in_progress');
					const updatedPlan = this.implementationPlanningService.getCurrentPlan()!;
					const summary = this.formatImplementationPlanSummary(updatedPlan);

					return { result: { stepId: nextStep.id, status: 'in_progress', summary } };
				}
			},

			update_implementation_step: async ({ step_id, status, notes }) => {
				const step = this.implementationPlanningService.updateStepStatus(step_id, status as ImplStepStatus, notes ?? undefined);
				if (!step) {
					throw new Error(`Failed to update step with ID "${step_id}"`);
				}
				const plan = this.implementationPlanningService.getCurrentPlan();
				const summary = plan ? this.formatImplementationPlanSummary(plan) : 'No active plan';
				return { result: { stepId: step.id, newStatus: step.status, summary } };
			},

			get_implementation_status: async () => {
				const plan = this.implementationPlanningService.getCurrentPlan();
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

**Your response must include:**

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

**Your response must include:**

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

**Create a structured lesson plan with this format:**

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
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_for_files: (params, result) => {
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_in_file: (params, result) => {
				const { model } = voidModelService.getModel(params.uri)
				if (!model) return '<Error getting string of result>'
				const lines = result.lines.map(n => {
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
			// ---
			create_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully created.`
			},
			delete_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully deleted.`
			},
			edit_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			rewrite_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			run_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				// success
				if (resolveReason.type === 'done') {
					return `${result_}\n(exit code ${resolveReason.exitCode})`
				}
				// normal command
				if (resolveReason.type === 'timeout') {
					return `${result_}\nTerminal command ran, but was automatically killed by Void after ${MAX_TERMINAL_INACTIVE_TIME}s of inactivity and did not finish successfully. To try with more time, open a persistent terminal and run the command there.`
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			run_persistent_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				const { persistentTerminalId } = params
				// success
				if (resolveReason.type === 'done') {
					return `${result_}\n(exit code ${resolveReason.exitCode})`
				}
				// bg command
				if (resolveReason.type === 'timeout') {
					return `${result_}\nTerminal command is running in terminal ${persistentTerminalId}. The given outputs are the results after ${MAX_TERMINAL_BG_COMMAND_TIME} seconds.`
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

			create_lesson_plan: (params, result) => {
				return `📚 Lesson Plan Created!\n\nPlan ID: ${result.planId}\n\n${result.template}`;
			},
		}
	}

	// Helper method to format implementation plan summary
	private formatImplementationPlanSummary(plan: ImplementationPlan): string {
		const { steps } = plan;
		const completed = steps.filter(s => s.status === 'complete').length;
		const total = steps.length;
		const progress = Math.round((completed / total) * 100);

		let output = `\u{1F4CB} Implementation Plan: \"${plan.goal}\"\n`;
		output += `Progress: ${completed}/${total} steps (${progress}%)\n\n`;

		// Group steps by status
		const stepsByStatus = this.implementationPlanningService.getStepsByStatus();

		// Show in-progress steps first
		if (stepsByStatus.in_progress.length > 0) {
			output += `### 🔄 In Progress\n`;
			for (const step of stepsByStatus.in_progress) {
				const complexity = this.getComplexityEmoji(step.complexity);
				const files = step.files.length > 0 ? ` (${step.files.length} files)` : '';
				output += `- [${step.id}] ${step.title} ${complexity}${files}\n`;
				if (step.notes) {
					output += `  Notes: ${step.notes}\n`;
				}
			}
			output += '\n';
		}

		// Then pending steps
		if (stepsByStatus.pending.length > 0) {
			output += `### ⏳ Pending\n`;
			for (const step of stepsByStatus.pending) {
				const complexity = this.getComplexityEmoji(step.complexity);
				const deps = step.dependencies.length > 0 ? ` (depends on: ${step.dependencies.join(', ')})` : '';
				const files = step.files.length > 0 ? ` (${step.files.length} files)` : '';
				const time = step.estimated_time ? ` (~${step.estimated_time}min)` : '';
				output += `- [${step.id}] ${step.title} ${complexity}${files}${time}${deps}\n`;
				output += `  ${step.description}\n`;
			}
			output += '\n';
		}

		// Then completed steps (collapsed)
		if (stepsByStatus.complete.length > 0) {
			output += `### ✅ Complete (${stepsByStatus.complete.length})\n`;
			for (const step of stepsByStatus.complete) {
				const complexity = this.getComplexityEmoji(step.complexity);
				output += `- [${step.id}] ${step.title} ${complexity}\n`;
				if (step.notes) {
					output += `  Notes: ${step.notes}\n`;
				}
			}
			output += '\n';
		}

		// Show failed steps
		if (stepsByStatus.failed.length > 0) {
			output += `### ❌ Failed\n`;
			for (const step of stepsByStatus.failed) {
				const complexity = this.getComplexityEmoji(step.complexity);
				output += `- [${step.id}] ${step.title} ${complexity}\n`;
				if (step.notes) {
					output += `  Error: ${step.notes}\n`;
				}
			}
			output += '\n';
		}

		// Show skipped steps
		if (stepsByStatus.skipped.length > 0) {
			output += `### ⏭️ Skipped\n`;
			for (const step of stepsByStatus.skipped) {
				const complexity = this.getComplexityEmoji(step.complexity);
				output += `- [${step.id}] ${step.title} ${complexity}\n`;
				if (step.notes) {
					output += `  Reason: ${step.notes}\n`;
				}
			}
		}

		// Show approval status
		output += `\n${plan.approved ? '✅ Plan approved for execution' : '⏸️ Plan pending approval'}`;

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
		const enableToon = this.voidSettingsService.state.globalSettings.enableToolResultTOON;

		if (!enableToon) {
			return fallbackStr;
		}

		// Check if TOON would be beneficial
		if (this.toonService.shouldUseToon(data)) {
			try {
				const toonEncoded = this.toonService.encode(data);
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
		const lintErrors = this.markerService
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
		return this.mainProcessService.getChannel('void-channel-code-execution');
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
		return this.planningService;
	}

	public getImplementationPlanningService(): ImplementationPlanningService {
		return this.implementationPlanningService;
	}
}

registerSingleton(IToolsService, ToolsService, InstantiationType.Eager);
