/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, File, Ban, Check, ChevronRight, CircleEllipsis, Pencil, Database, Loader2, SkipForward, X, Copy as CopyIcon, Play, Folder, Text } from 'lucide-react';
import { GlyphSpinner } from '../util/status.js';
import { useAccessor, useChatThreadsStreamState, useIsDark, useFullChatThreadsStreamState, useActiveURI } from '../util/services.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';
import { ChatMarkdownRender, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { ChatMessage, StagingSelectionItem, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { BuiltinToolCallParams, BuiltinToolName, ToolName, approvalTypeOfBuiltinToolName, ToolApprovalType } from '../../../../common/toolsServiceTypes.js';
import { builtinToolNames, MAX_FILE_CHARS_PAGE } from '../../../../common/prompt/prompts.js';
import { ToolApprovalTypeSwitch } from '../void-settings-tsx/Settings.js';

// --- Shared Types ---

export type ToolHeaderParams = {
	icon?: React.ReactNode;
	title: React.ReactNode;
	desc1: React.ReactNode;
	desc1OnClick?: () => void;
	desc2?: React.ReactNode;
	isError?: boolean;
	/** Tool is executing right now — shows the glyph spinner, hides the tool icon. */
	isRunning?: boolean;
	info?: string;
	desc1Info?: string;
	isRejected?: boolean;
	numResults?: number;
	hasNextPage?: boolean;
	children?: React.ReactNode;
	bottomChildren?: React.ReactNode;
	onClick?: () => void;
	desc2OnClick?: () => void;
	isOpen?: boolean;
	className?: string;
}

export type WrapperProps<T extends ToolName> = { 
	toolMessage: Exclude<ToolMessage<T>, { type: 'invalid_params' }>,
	messageIdx: number, 
	threadId: string 
}

export type ResultWrapper<T extends ToolName> = (props: WrapperProps<T>) => React.ReactNode

// --- Helper Functions ---

export const getRelative = (uri: URI, accessor: ReturnType<typeof useAccessor>) => {
	const workspaceContextService = accessor.get('IWorkspaceContextService')
	let path: string
	const isInside = workspaceContextService.isInsideWorkspace(uri)
	if (isInside) {
		const f = workspaceContextService.getWorkspace().folders.find(f => uri.fsPath?.startsWith(f.uri.fsPath))
		if (f) { path = uri.fsPath.replace(f.uri.fsPath, '') }
		else { path = uri.fsPath }
	}
	else {
		path = uri.fsPath
	}
	return path || undefined
}

export const getFolderName = (pathStr: string) => {
	pathStr = pathStr.replace(/[\\\/]+/g, '/')
	const parts = pathStr.split('/')
	const nonEmptyParts = parts.filter(part => part.length > 0)
	if (nonEmptyParts.length === 0) return '/'
	if (nonEmptyParts.length === 1) return nonEmptyParts[0] + '/'
	const lastTwo = nonEmptyParts.slice(-2)
	return lastTwo.join('/') + '/'
}

export const getBasename = (pathStr: string, parts: number = 1) => {
	pathStr = pathStr.replace(/[\\\/]+/g, '/')
	const allParts = pathStr.split('/')
	if (allParts.length === 0) return pathStr
	return allParts.slice(-parts).join('/')
}

export const voidOpenFileFn = (
	uri: URI,
	accessor: ReturnType<typeof useAccessor>,
	range?: [number, number]
) => {
	const commandService = accessor.get('ICommandService')
	const editorService = accessor.get('ICodeEditorService')
	const agentManagerService = accessor.get('IAgentManagerService')

	agentManagerService.openFile(uri)

	let editorSelection = undefined;
	if (range) {
		editorSelection = {
			startLineNumber: range[0],
			startColumn: 1,
			endLineNumber: range[1],
			endColumn: Number.MAX_SAFE_INTEGER,
		};
	}

	commandService.executeCommand('vscode.open', uri).then(() => {
		setTimeout(() => {
			if (!editorSelection) return;
			const editor = editorService.getActiveCodeEditor()
			if (!editor) return;
			editor.setSelection(editorSelection)
			editor.revealRange(editorSelection, ScrollType.Immediate)
		}, 50)
	})
};

export const loadingTitleWrapper = (item: React.ReactNode): React.ReactNode => {
	return <span className='flex items-center flex-nowrap'>
		{item}
		<GlyphSpinner className='ml-1.5 text-[0.8rem] text-void-scaffold-meta' />
	</span>
}

export const titleOfBuiltinToolName = {
	'read_file': { done: 'Read file', proposed: 'Read file', running: 'Reading file' },
	'outline_file': { done: 'File outline', proposed: 'File outline', running: 'Getting file outline' },
	'ls_dir': { done: 'List directory', proposed: 'List directory', running: 'Listing directory' },
	'get_dir_tree': { done: 'Directory tree', proposed: 'Directory tree', running: 'Building directory tree' },
	'search_pathnames_only': { done: 'Search pathnames', proposed: 'Search pathnames', running: 'Searching pathnames' },
	'search_for_files': { done: 'Search files', proposed: 'Search files', running: 'Searching files' },
	'search_in_file': { done: 'Search in file', proposed: 'Search in file', running: 'Searching file' },
	'read_lint_errors': { done: 'Read lint errors', proposed: 'Read lint errors', running: 'Reading lint errors' },
	'fast_context': { done: 'Fast context', proposed: 'Fast context', running: 'Gathering fast context' },
	'codebase_search': { done: 'Searched codebase', proposed: 'Search codebase', running: 'Searching codebase' },
	'repo_init': { done: 'Repo initialized', proposed: 'Init repo', running: 'Initializing repo' },
	'repo_clone': { done: 'Repo cloned', proposed: 'Clone repo', running: 'Cloning repo' },
	'repo_add': { done: 'Staged changes', proposed: 'Stage changes', running: 'Staging changes' },
	'repo_commit': { done: 'Committed', proposed: 'Commit changes', running: 'Committing changes' },
	'repo_push': { done: 'Pushed', proposed: 'Push changes', running: 'Pushing changes' },
	'repo_pull': { done: 'Pulled', proposed: 'Pull changes', running: 'Pulling changes' },
	'repo_status': { done: 'Checked status', proposed: 'Get status', running: 'Checking status' },
	'repo_status_matrix': { done: 'Checked status matrix', proposed: 'Get status matrix', running: 'Checking status matrix' },
	'repo_log': { done: 'Read log', proposed: 'Get log', running: 'Reading log' },
	'repo_checkout': { done: 'Checked out', proposed: 'Checkout', running: 'Checking out' },
	'repo_branch': { done: 'Created branch', proposed: 'Create branch', running: 'Creating branch' },
	'repo_list_branches': { done: 'Listed branches', proposed: 'List branches', running: 'Listing branches' },
	'repo_current_branch': { done: 'Got current branch', proposed: 'Get current branch', running: 'Getting current branch' },
	'repo_resolve_ref': { done: 'Resolved reference', proposed: 'Resolve reference', running: 'Resolving reference' },
	'repo_get_commit_metadata': { done: 'Got commit metadata', proposed: 'Get commit metadata', running: 'Getting commit metadata' },
	'repo_wait_for_embeddings': { done: 'Embeddings ready', proposed: 'Wait for embeddings', running: 'Waiting for embeddings' },
	'wait': { done: 'Wait finished', proposed: 'Wait', running: 'Waiting' },
	'check_terminal_status': { done: 'Terminal status checked', proposed: 'Check terminal status', running: 'Checking terminal status' },
	'run_persistent_command': { done: `Ran terminal`, proposed: 'Run terminal', running: 'Running terminal' },
	'create_file_or_folder': { done: `Created`, proposed: `Create`, running: `Creating` },
	'delete_file_or_folder': { done: `Deleted`, proposed: `Delete`, running: `Deleting` },
	'edit_file': { done: `Edited file`, proposed: 'Edit file', running: 'Editing file' },
	'edit_files': { done: `Edited files`, proposed: 'Edit files', running: 'Editing files' },
	'rewrite_file': { done: `Wrote file`, proposed: 'Write file', running: 'Writing file' },
	'run_command': { done: `Ran terminal`, proposed: 'Run terminal', running: 'Running terminal' },
	'open_persistent_terminal': { done: `Opened terminal`, proposed: 'Open terminal', running: 'Opening terminal' },
	'kill_persistent_terminal': { done: `Killed terminal`, proposed: 'Kill terminal', running: 'Killing terminal' },
	'run_code': { done: 'Executed code', proposed: 'Execute code', running: 'Executing code' },
	'create_todo': { done: 'Todo created', proposed: 'Create todo', running: 'Creating todo' },
	'update_todo': { done: 'Updated todo', proposed: 'Update todo', running: 'Updating todo' },
	'get_todos': { done: 'Got todos', proposed: 'Get todos', running: 'Getting todos' },
	'add_todos': { done: 'Added todos', proposed: 'Add todos', running: 'Adding todos' },
	'create_implementation_plan': { done: 'Created implementation plan', proposed: 'Create implementation plan', running: 'Creating implementation plan' },
	'preview_implementation_plan': { done: 'Previewed implementation plan', proposed: 'Preview implementation plan', running: 'Previewing implementation plan' },
	'update_implementation_step': { done: 'Updated implementation step', proposed: 'Update implementation step', running: 'Updating implementation step' },
	'get_implementation_status': { done: 'Got implementation status', proposed: 'Get implementation status', running: 'Getting implementation status' },
	'update_walkthrough': { done: 'Updated walkthrough', proposed: 'Update walkthrough', running: 'Updating walkthrough' },
	'open_walkthrough_preview': { done: 'Opened walkthrough preview', proposed: 'Open walkthrough preview', running: 'Opening walkthrough preview' },
	'explain_code': { done: 'Explained code', proposed: 'Explain code', running: 'Explaining code' },
	'teach_concept': { done: 'Taught concept', proposed: 'Teach concept', running: 'Teaching concept' },
	'create_exercise': { done: 'Exercise ready', proposed: 'Create exercise', running: 'Creating exercise' },
	'create_lesson_plan': { done: 'Created lesson plan', proposed: 'Create lesson plan', running: 'Creating lesson plan' },
	'load_skill': { done: 'Skill loaded', proposed: 'Load skill', running: 'Loading skill' },
	'list_skills': { done: 'Skills listed', proposed: 'List skills', running: 'Listing skills' },
	'display_lesson': { done: 'Displayed lesson', proposed: 'Display lesson', running: 'Displaying lesson' },
	'execute_skill_script': { done: 'Executed skill script', proposed: 'Execute skill script', running: 'Executing skill script' },
	'load_skill_reference': { done: 'Loaded skill reference', proposed: 'Load skill reference', running: 'Loading skill reference' },
	'get_skill_asset': { done: 'Got skill asset', proposed: 'Get skill asset', running: 'Getting skill asset' },
	'install_skill': { done: 'Installed skill', proposed: 'Install skill', running: 'Installing skill' },
	'uninstall_skill': { done: 'Uninstalled skill', proposed: 'Uninstall skill', running: 'Uninstalling skill' },
	'run_skill_benchmark': { done: 'Ran skill benchmark', proposed: 'Run skill benchmark', running: 'Running skill benchmark' },
	'get_skill_metrics': { done: 'Got skill metrics', proposed: 'Get skill metrics', running: 'Getting skill metrics' },
	'list_skill_benchmarks': { done: 'Listed skill benchmarks', proposed: 'List skill benchmarks', running: 'Listing skill benchmarks' },
	'generate_image': { done: 'Image generated', proposed: 'Generate image', running: 'Generating image' },
	'generate_video': { done: 'Video generated', proposed: 'Generate video', running: 'Generating video' },
	'render_form': { done: 'Form rendered', proposed: 'Render form', running: 'Rendering form' },
	'create_quiz': { done: 'Quiz completed', proposed: 'Create quiz', running: 'Creating quiz' },
	'run_subagent': { done: 'Subagent completed', proposed: 'Run subagent', running: 'Running subagent' },
	// Browser / Webview tools
	'open_url': { done: 'URL opened', proposed: 'Open URL', running: 'Opening URL' },
	'fetch_url': { done: 'URL fetched', proposed: 'Fetch URL', running: 'Fetching URL' },
	'open_devtools': { done: 'DevTools opened', proposed: 'Open DevTools', running: 'Opening DevTools' },
	'click_element': { done: 'Element clicked', proposed: 'Click element', running: 'Clicking element' },
	'get_page_text': { done: 'Page text extracted', proposed: 'Extract page text', running: 'Extracting page text' },
	'webview_screenshot': { done: 'Screenshot captured', proposed: 'Take screenshot', running: 'Capturing screenshot' },
	'search_web': { done: 'Web search complete', proposed: 'Search web', running: 'Searching web' },
	'browse_resources': { done: 'Resources browsed', proposed: 'Browse resources', running: 'Browsing resources' },
	'type_into_element': { done: 'Typed into element', proposed: 'Type into element', running: 'Typing into element' },
} as const satisfies Record<BuiltinToolName, { done: React.ReactNode, proposed: React.ReactNode, running: React.ReactNode }>

export const getTitle = (toolMessage: Pick<ChatMessage & { role: 'tool' }, 'name' | 'type' | 'mcpServerName'>): React.ReactNode => {
	const t = toolMessage
	if (!builtinToolNames.includes(t.name as BuiltinToolName)) {
		const descriptor =
				t.type === 'success' ? 'Called'
					: t.type === 'running_now' ? 'Calling'
						: t.type === 'tool_request' ? 'Call'
							: t.type === 'rejected' ? 'Call'
								: t.type === 'invalid_params' ? 'Call'
								: t.type === 'tool_error' ? 'Call'
									: 'Call'
		const title = `${descriptor} ${toolMessage.mcpServerName || 'MCP'}`
		return title
	}
	else {
		const toolName = t.name as BuiltinToolName
		if (t.type === 'success') return titleOfBuiltinToolName[toolName].done
		if (t.type === 'running_now') return titleOfBuiltinToolName[toolName].running
		return titleOfBuiltinToolName[toolName].proposed
	}
}

export const toolNameToDesc = (toolName: BuiltinToolName, _toolParams: BuiltinToolCallParams[BuiltinToolName] | undefined, accessor: ReturnType<typeof useAccessor>): {
	desc1: React.ReactNode,
	desc1Info?: string,
} => {
	if (!_toolParams) return { desc1: '', };
	const x = {
		'read_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_file']
			const basename = getBasename(toolParams.uri.fsPath)
			let readingInfo = ''
			if (toolParams.startLine !== null || toolParams.endLine !== null) {
				const start = toolParams.startLine ?? 1
				const end = toolParams.endLine ?? '∞'
				readingInfo = ` (lines ${start}-${end})`
			} else if (toolParams.pageNumber > 1) {
				readingInfo = ` (page ${toolParams.pageNumber})`
			}
			return {
				desc1: basename + readingInfo,
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'fast_context': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['fast_context']
			return { desc1: toolParams.query, desc1Info: 'Morph fast context' }
		},
		'codebase_search': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['codebase_search']
			return { desc1: toolParams.query }
		},
		'repo_init': () => ({ desc1: 'Repo init' }),
		'repo_clone': () => ({ desc1: 'Repo clone' }),
		'repo_add': () => ({ desc1: 'Repo add' }),
		'repo_commit': () => ({ desc1: 'Repo commit' }),
		'repo_push': () => ({ desc1: 'Repo push' }),
		'repo_pull': () => ({ desc1: 'Repo pull' }),
		'repo_status': () => ({ desc1: 'Repo status' }),
		'repo_status_matrix': () => ({ desc1: 'Repo status matrix' }),
		'repo_log': () => ({ desc1: 'Repo log' }),
		'repo_checkout': () => ({ desc1: 'Repo checkout' }),
		'repo_branch': () => ({ desc1: 'Repo branch' }),
		'repo_list_branches': () => ({ desc1: 'Repo list branches' }),
		'repo_current_branch': () => ({ desc1: 'Repo current branch' }),
		'repo_resolve_ref': () => ({ desc1: 'Repo resolve ref' }),
		'repo_get_commit_metadata': () => ({ desc1: 'Repo get commit metadata' }),
		'repo_wait_for_embeddings': () => ({ desc1: 'Repo wait for embeddings' }),
		'wait': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['wait']
			return { desc1: `Wait for ${toolParams.timeoutMs}ms` }
		},
		'outline_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['outline_file']
			const basename = getBasename(toolParams.uri.fsPath)
			return { desc1: basename, desc1Info: getRelative(toolParams.uri, accessor) };
		},
		'ls_dir': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['ls_dir']
			return { desc1: getFolderName(toolParams.uri.fsPath), desc1Info: getRelative(toolParams.uri, accessor) };
		},
		'search_pathnames_only': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_pathnames_only']
			return { desc1: `"${toolParams.query}"` }
		},
		'search_for_files': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_for_files']
			return { desc1: `"${toolParams.query}"` }
		},
		'search_in_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_in_file'];
			return { desc1: `"${toolParams.query}"`, desc1Info: getRelative(toolParams.uri, accessor) };
		},
		'create_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'delete_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['delete_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'rewrite_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['rewrite_file']
			return { desc1: getBasename(toolParams.uri.fsPath), desc1Info: getRelative(toolParams.uri, accessor) }
		},
		'edit_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['edit_file']
			return { desc1: getBasename(toolParams.uri.fsPath), desc1Info: getRelative(toolParams.uri, accessor) }
		},
		'edit_files': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['edit_files']
			const n = toolParams.edits?.length ?? 0
			const first = toolParams.edits?.[0]
			const names = toolParams.edits?.map((e) => getBasename(e.uri.fsPath))?.join(', ') ?? ''
			return {
				desc1: n === 1 ? first ? getBasename(first.uri.fsPath) : '' : `${n} files: ${names}`,
				desc1Info: first ? getRelative(first.uri, accessor) : undefined,
			}
		},
		'run_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_command']
			return { desc1: `"${toolParams.command}"` }
		},
		'run_persistent_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_persistent_command']
			return { desc1: `"${toolParams.command}"` }
		},
		'open_persistent_terminal': () => { return { desc1: '' } },
		'kill_persistent_terminal': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['kill_persistent_terminal']
			return { desc1: toolParams.persistentTerminalId }
		},
		'get_dir_tree': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['get_dir_tree']
			return { desc1: getFolderName(toolParams.uri.fsPath) ?? '/', desc1Info: getRelative(toolParams.uri, accessor) }
		},
		'read_lint_errors': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_lint_errors']
			return { desc1: getBasename(toolParams.uri.fsPath), desc1Info: getRelative(toolParams.uri, accessor) }
		},
		'run_code': () => { return { desc1: 'Executing code in sandbox' } },
		'create_todo': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_todo']
			return { desc1: `"${toolParams.goal}"` }
		},
		'update_todo': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['update_todo']
			return { desc1: `Todo: ${toolParams.taskId} → ${toolParams.status}` }
		},
		'get_todos': () => { return { desc1: '' } },
		'add_todos': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['add_todos']
			return { desc1: `${toolParams.tasks.length} todo(s)` }
		},
		'create_implementation_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_implementation_plan']
			return { desc1: `"${toolParams.goal}"` }
		},
		'preview_implementation_plan': () => { return { desc1: 'Preview implementation plan' } },
		'update_implementation_step': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['update_implementation_step']
			return { desc1: `Step: ${toolParams.step_id} → ${toolParams.status}` }
		},
		'get_implementation_status': () => { return { desc1: 'Get implementation status' } },
		'update_walkthrough': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['update_walkthrough']
			return { desc1: toolParams.content }
		},
		'open_walkthrough_preview': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['open_walkthrough_preview']
			return { desc1: toolParams.file_path }
		},
		'explain_code': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['explain_code']
			return { desc1: `${toolParams.language} (${toolParams.level})` }
		},
		'teach_concept': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['teach_concept']
			return { desc1: toolParams.concept }
		},
		'create_exercise': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_exercise']
			return { desc1: toolParams.title || toolParams.type }
		},
		'create_lesson_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_lesson_plan']
			return { desc1: toolParams.goal }
		},
		'load_skill': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['load_skill']
			return { desc1: toolParams.skill_name }
		},
		'list_skills': () => {
			return { desc1: 'All available skills' }
		},
		'generate_image': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['generate_image']
			return { desc1: toolParams.prompt }
		},
		'render_form': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['render_form']
			return { desc1: toolParams.title || `${toolParams.questions.length} question(s)` }
		},
		'create_quiz': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_quiz']
			return { desc1: toolParams.title || `${toolParams.questions.length} question(s)` }
		},
		// Browser / Webview tools
		'open_url': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['open_url']
			return { desc1: toolParams.url }
		},
		'fetch_url': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['fetch_url']
			return { desc1: toolParams.url }
		},
		'open_devtools': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['open_devtools']
			return { desc1: toolParams.webview_id }
		},
		'click_element': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['click_element']
			return { desc1: toolParams.selector, desc1Info: toolParams.webview_id }
		},
		'get_page_text': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['get_page_text']
			return { desc1: toolParams.webview_id }
		},
		'webview_screenshot': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['webview_screenshot']
			return { desc1: toolParams.webview_id }
		},
		'search_web': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_web']
			return { desc1: `"${toolParams.query}"` }
		},
		'browse_resources': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['browse_resources']
			return { desc1: toolParams.url }
		},
		'type_into_element': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['type_into_element']
			return { desc1: toolParams.selector, desc1Info: `"${toolParams.text}"` }
		},
	}
	try { return x[toolName]?.() || { desc1: '' } }
	catch { return { desc1: '' } }
}

// --- Shared Components ---

export const ToolChildrenWrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	// Chrome-free: the expanded tool shell owns the border — this is just the
	// padded, scrollable body so the shell never boxes content twice.
	return <div className={`${className ? className : ''} cursor-default select-none`}>
		<div className='px-1 py-0.5 min-w-full overflow-y-auto max-h-[600px]'>
			{children}
		</div>
	</div>
}

export const CodeChildren = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	const isDark = useIsDark()
	return <div className={`${className ?? ''} px-2 py-1.5 rounded-[5px] overflow-auto text-[11px] font-mono border border-void-hairline ${isDark ? 'bg-void-bg-4' : 'bg-void-bg-1'} tracking-tight`}>
		<div className='!select-text cursor-auto leading-relaxed'>
			{children}
		</div>
	</div>
}

export const SmallProseWrapper = ({ children }: { children: React.ReactNode }) => {
	return <div className='text-void-fg-3 prose prose-sm break-words max-w-none leading-relaxed text-[13px] [&>:first-child]:!mt-0 [&>:last-child]:!mb-0 prose-h1:text-[14px] prose-h1:my-3 prose-h1:font-semibold prose-h2:text-[13px] prose-h2:my-3 prose-h2:font-medium prose-h3:text-[13px] prose-h3:my-2 prose-h3:font-medium prose-h4:text-[13px] prose-h4:my-2 prose-p:my-2 prose-p:leading-relaxed prose-hr:my-2 prose-ul:my-2 prose-ul:pl-4 prose-ul:list-outside prose-ul:list-disc prose-ul:leading-snug prose-ol:my-2 prose-ol:pl-4 prose-ol:list-outside prose-ol:list-decimal prose-ol:leading-snug marker:text-inherit prose-blockquote:pl-2 prose-blockquote:my-2 prose-code:text-void-fg-3 prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none prose-pre:text-[12px] prose-pre:p-2 prose-pre:my-2 prose-table:text-[13px]'>
		{children}
	</div>
}

export function ProseWrapper({ children }: { children: React.ReactNode }) {
	return <div className='text-void-fg-1 prose prose-sm break-words prose-p:block prose-hr:my-4 prose-pre:my-2 marker:text-inherit prose-ol:list-outside prose-ol:list-decimal prose-ul:list-outside prose-ul:list-disc prose-li:my-0 prose-code:before:content-none prose-code:after:content-none prose-headings:prose-sm prose-headings:font-semibold prose-p:leading-relaxed prose-ol:leading-relaxed prose-ul:leading-relaxed max-w-none'>
		{children}
	</div>
}


export const BottomChildren = ({ children, title }: { children: React.ReactNode, title: string }) => {
	const [isOpen, setIsOpen] = useState(false);
	if (!children) return null;
	return (
		<div className='w-full min-w-0'>
			<div
				className='group/bottom flex w-full min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-void-row-hover'
				onClick={() => setIsOpen(o => !o)}
			>
				<ChevronRight
					size={12}
					className={`shrink-0 text-void-scaffold-meta transition-all duration-150 ease-out ${isOpen ? 'rotate-90 opacity-80' : 'opacity-0 group-hover/bottom:opacity-80'}`}
				/>
				<span className='text-[10px] font-medium uppercase tracking-[0.08em] text-void-scaffold-meta transition-colors group-hover/bottom:text-void-fg-2'>{title}</span>
			</div>
			<div className={`overflow-hidden transition-all duration-200 ease-out ${isOpen ? 'opacity-100 max-h-[1000px] my-1' : 'max-h-0 opacity-0'} text-xs px-1.5`}>
				{children}
			</div>
		</div>
	);
}

export const ToolHeaderWrapper = ({
	icon,
	title,
	desc1,
	desc1OnClick,
	desc1Info,
	desc2,
	numResults,
	hasNextPage,
	children,
	info,
	bottomChildren,
	isError,
	isRunning,
	onClick,
	desc2OnClick,
	isOpen,
	isRejected,
	className,
}: ToolHeaderParams) => {
	const [isOpen_, setIsOpen] = useState(isOpen !== undefined ? isOpen : false);
	const lastIsOpenProp = React.useRef(isOpen);

	useEffect(() => {
		if (isOpen !== lastIsOpenProp.current) {
			if (isOpen !== undefined) {
				setIsOpen(isOpen);
			}
			lastIsOpenProp.current = isOpen;
		}
	}, [isOpen]);

	const isExpanded = isOpen_
	const isDropdown = children !== undefined
	const isClickable = !!(isDropdown || onClick)
	const isDesc1Clickable = !!desc1OnClick

	// Hermes-style scaffold line: a tool call is one quiet grey row around the
	// reply — a borderless line at rest; only an EXPANDED row earns a hairline
	// shell. Status preempts the tool icon in the leading slot (spinner while
	// running, warning when failed, ban when rejected) — success is silent and
	// just shows the tool's icon. No icon chips, no card-in-card.
	const titleStr = typeof title === 'string' ? title.toLowerCase() : ''
	const isReadingTool = titleStr.includes('read') || titleStr.includes('search') || titleStr.includes('list') || titleStr.includes('outline')
	const isCodingTool = titleStr.includes('edit') || titleStr.includes('wrote') || titleStr.includes('created') || titleStr.includes('deleted')

	const leadingGlyph = isRunning
		? <GlyphSpinner className='text-[0.95rem] text-void-scaffold-meta' />
		: isError
			? <AlertTriangle size={14} className='text-void-warning' />
			: isRejected
				? <Ban size={14} className='text-void-fg-4' />
				: icon
					? <span className='text-void-fg-3 [&_svg]:size-3.5'>{icon}</span>
					: isReadingTool
						? <File size={14} className='text-void-fg-3' />
						: isCodingTool
							? <Pencil size={14} className='text-void-fg-3' />
							: <Database size={14} className='text-void-fg-3' />;

	const desc1HTML = <span className={`min-w-0 truncate text-[11px] leading-[1.45] text-void-scaffold-meta ${isDesc1Clickable ? 'cursor-pointer hover:text-void-fg-2 transition-colors duration-150' : ''}`} onClick={desc1OnClick} {...desc1Info ? { 'data-tooltip-id': 'void-tooltip', 'data-tooltip-content': desc1Info, 'data-tooltip-place': 'top', 'data-tooltip-delay-show': 1000 } : {}}>{desc1}</span>

	return (
		<div className='my-2 px-1'>
			<div className={`w-full min-w-0 overflow-hidden transition-all duration-200 ${isExpanded ? 'rounded-[5px] border border-void-hairline' : ''} ${className ?? ''}`}>
				<div
					className={`group/header select-none flex min-w-0 items-center gap-1.5 min-h-[26px] ${isExpanded ? 'border-b border-void-hairline px-2 py-1.5' : 'px-1.5 py-1'} ${isClickable ? 'cursor-pointer' : ''}`} onClick={() => { if (isDropdown) { setIsOpen(v => !v); } if (onClick) { onClick(); } }}>
					<span className={`grid size-3.5 shrink-0 place-items-center ${isRejected ? 'line-through opacity-60' : ''}`}>{leadingGlyph}</span>
					<span className={`flex min-w-0 flex-1 items-center gap-1.5 ${isRejected ? 'line-through opacity-60' : ''}`}>
						<span className='min-w-0 flex-1 truncate text-[13px] font-normal leading-[1.45] text-void-scaffold-text transition-colors group-hover/header:text-void-fg-2'>{title}</span>
						{desc1HTML}
						{isDropdown && (
							// Caret sits right of the text and appears on hover; stays visible when open.
							<ChevronRight
								size={12}
								className={`shrink-0 text-void-scaffold-meta transition-all duration-150 ease-out ${isExpanded ? 'rotate-90 opacity-80' : 'opacity-0 group-hover/header:opacity-80'}`}
							/>
						)}
					</span>
					<div className='flex items-center gap-x-2 flex-shrink-0 ml-auto pl-1.5'>
						{numResults !== undefined && <span className='text-[10px] font-medium tabular-nums text-void-scaffold-meta'>{`${numResults}${hasNextPage ? '+' : ''}`}</span>}
						{hasNextPage && numResults === undefined && <span className='text-[10px] font-medium uppercase tracking-wider text-void-accent'>More</span>}
						{desc2 && <div className='flex-shrink-0 text-[10px] tabular-nums text-void-scaffold-meta' onClick={desc2OnClick}>{desc2}</div>}
						{info && <CircleEllipsis className='text-void-scaffold-meta opacity-70 hover:opacity-100 transition-opacity flex-shrink-0' size={13} data-tooltip-id='void-tooltip' data-tooltip-content={info} data-tooltip-place='top-end' />}
						{isError && <span className='text-[10px] font-medium text-void-warning' data-tooltip-id='void-tooltip' data-tooltip-content={'Error running tool'} data-tooltip-place='top'>Error</span>}
						{isRejected && <span className='text-[10px] font-medium text-void-scaffold-meta' data-tooltip-id='void-tooltip' data-tooltip-content={'Canceled'} data-tooltip-place='top'>Canceled</span>}
					</div>
				</div>
				{children !== undefined && <div className={`overflow-auto transition-all duration-200 ease-out ${isExpanded ? 'opacity-100 max-h-[800px] py-1.5' : 'max-h-0 opacity-0'} px-2 text-void-fg-2`}>{children}</div>}
			</div>
			{bottomChildren && <div className='mt-1 animate-in fade-in duration-200'>{bottomChildren}</div>}
		</div>
	)
};

export const ListableToolItem = ({ name, onClick, isSmall, className, showDot }: { name: React.ReactNode, onClick?: () => void, isSmall?: boolean, className?: string, showDot?: boolean }) => {
	return <div className={`${onClick ? 'hover:brightness-125 hover:cursor-pointer transition-all duration-200 ' : ''} flex items-center flex-nowrap whitespace-nowrap ${className ? className : ''}`} onClick={onClick}>
		{showDot === false ? null : <div className="flex-shrink-0"><svg className="w-1 h-1 opacity-60 mr-1.5 fill-current" viewBox="0 0 100 40"><rect x="0" y="15" width="100" height="10" /></svg></div>}
		<div className={`${isSmall ? 'italic text-void-fg-4 flex items-center' : ''}`}>{name}</div>
	</div>
}

export const InvalidTool = ({ toolName, message, mcpServerName }: { toolName: string, message: string, mcpServerName?: string }) => {
	const title = `Invalid Call: ${toolName}`
	return <ToolHeaderWrapper
		title={title}
		desc1={mcpServerName}
		isError={true}
	>
		<ToolChildrenWrapper>
			<CodeChildren>{message}</CodeChildren>
		</ToolChildrenWrapper>
	</ToolHeaderWrapper>
}

export const CanceledTool = ({ toolName, mcpServerName }: { toolName: string, mcpServerName?: string }) => {
	const title = `Canceled: ${toolName}`
	return <ToolHeaderWrapper
		title={title}
		desc1={mcpServerName}
		isRejected={true}
	/>
}
