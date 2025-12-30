/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { AlertTriangle, File, Ban, Check, ChevronRight, CircleEllipsis, Pencil, Database, Loader2, SkipForward, X, Copy as CopyIcon, Play, Folder, Text } from 'lucide-react';
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
	const agentManagerService = accessor.get('IAgentManagerService') as any

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
		<Loader2 className='w-3 h-3 ml-1 animate-spin text-void-fg-3' />
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
	'wait': { done: 'Wait finished', proposed: 'Wait', running: loadingTitleWrapper('Waiting') },
	'create_file_or_folder': { done: `Created`, proposed: `Create`, running: loadingTitleWrapper(`Creating`) },
	'delete_file_or_folder': { done: `Deleted`, proposed: `Delete`, running: loadingTitleWrapper(`Deleting`) },
	'edit_file': { done: `Edited file`, proposed: 'Edit file', running: loadingTitleWrapper('Editing file') },
	'rewrite_file': { done: `Wrote file`, proposed: 'Write file', running: loadingTitleWrapper('Writing file') },
	'run_command': { done: `Ran terminal`, proposed: 'Run terminal', running: loadingTitleWrapper('Running terminal') },
	'run_persistent_command': { done: `Ran terminal`, proposed: 'Run terminal', running: loadingTitleWrapper('Running terminal') },
	'open_persistent_terminal': { done: `Opened terminal`, proposed: 'Open terminal', running: loadingTitleWrapper('Opening terminal') },
	'kill_persistent_terminal': { done: `Killed terminal`, proposed: 'Kill terminal', running: loadingTitleWrapper('Killing terminal') },
	'run_code': { done: 'Executed code', proposed: 'Execute code', running: loadingTitleWrapper('Executing code') },
	'create_plan': { done: 'Plan created', proposed: 'Create plan', running: loadingTitleWrapper('Creating plan') },
	'update_task_status': { done: 'Updated task', proposed: 'Update task', running: loadingTitleWrapper('Updating task') },
	'get_plan_status': { done: 'Got plan status', proposed: 'Get plan status', running: loadingTitleWrapper('Getting plan status') },
	'add_tasks_to_plan': { done: 'Added tasks', proposed: 'Add tasks', running: loadingTitleWrapper('Adding tasks') },
	'create_implementation_plan': { done: 'Created implementation plan', proposed: 'Create implementation plan', running: loadingTitleWrapper('Creating implementation plan') },
	'preview_implementation_plan': { done: 'Previewed implementation plan', proposed: 'Preview implementation plan', running: loadingTitleWrapper('Previewing implementation plan') },
	'execute_implementation_plan': { done: 'Executed implementation plan', proposed: 'Execute implementation plan', running: loadingTitleWrapper('Executing implementation plan') },
	'update_implementation_step': { done: 'Updated implementation step', proposed: 'Update implementation step', running: loadingTitleWrapper('Updating implementation step') },
	'get_implementation_status': { done: 'Got implementation status', proposed: 'Get implementation status', running: loadingTitleWrapper('Getting implementation status') },
	'update_walkthrough': { done: 'Updated walkthrough', proposed: 'Update walkthrough', running: loadingTitleWrapper('Updating walkthrough') },
	'open_walkthrough_preview': { done: 'Opened walkthrough preview', proposed: 'Open walkthrough preview', running: loadingTitleWrapper('Opening walkthrough preview') },
	'explain_code': { done: 'Explained code', proposed: 'Explain code', running: loadingTitleWrapper('Explaining code') },
	'teach_concept': { done: 'Taught concept', proposed: 'Teach concept', running: loadingTitleWrapper('Teaching concept') },
	'create_exercise': { done: 'Created exercise', proposed: 'Create exercise', running: loadingTitleWrapper('Creating exercise') },
	'check_answer': { done: 'Checked answer', proposed: 'Check answer', running: loadingTitleWrapper('Checking answer') },
	'give_hint': { done: 'Gave hint', proposed: 'Give hint', running: loadingTitleWrapper('Giving hint') },
	'create_lesson_plan': { done: 'Created lesson plan', proposed: 'Create lesson plan', running: loadingTitleWrapper('Creating lesson plan') },
} as const satisfies Record<BuiltinToolName, { done: any, proposed: any, running: any }>

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
		if (t.type === 'running_now' || t.type === 'tool_request')
			return loadingTitleWrapper(title)
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
		'create_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_plan']
			return { desc1: `"${toolParams.goal}"` }
		},
		'update_task_status': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['update_task_status']
			return { desc1: `Task: ${toolParams.taskId} → ${toolParams.status}` }
		},
		'get_plan_status': () => { return { desc1: '' } },
		'add_tasks_to_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['add_tasks_to_plan']
			return { desc1: `${toolParams.tasks.length} task(s)` }
		},
		'create_implementation_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_implementation_plan']
			return { desc1: `"${toolParams.goal}"` }
		},
		'preview_implementation_plan': () => { return { desc1: 'Preview implementation plan' } },
		'execute_implementation_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['execute_implementation_plan']
			return { desc1: toolParams.step_id ? `Step: ${toolParams.step_id}` : 'Execute all steps' }
		},
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
			return { desc1: `${toolParams.topic} (${toolParams.difficulty})` }
		},
		'check_answer': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['check_answer']
			return { desc1: toolParams.exercise_id }
		},
		'give_hint': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['give_hint']
			return { desc1: toolParams.exercise_id }
		},
		'create_lesson_plan': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_lesson_plan']
			return { desc1: toolParams.goal }
		},
	}
	try { return x[toolName]?.() || { desc1: '' } }
	catch { return { desc1: '' } }
}

// --- Shared Components ---

export const ToolChildrenWrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	return <div className={`${className ? className : ''} cursor-default select-none border-t border-void-border-2/50`}>
		<div className='px-2 min-w-full overflow-hidden'>
			{children}
		</div>
	</div>
}

export const CodeChildren = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	const isDark = useIsDark()
	return <div className={`${className ?? ''} p-4 rounded-xl overflow-auto text-[11px] font-mono border border-void-border-2 ${isDark ? 'bg-void-bg-4 shadow-inner' : 'bg-void-bg-1'} tracking-tight`}>
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
		<div className="w-full px-2 mt-2">
			<div
				className={`flex items-center cursor-pointer select-none transition-all duration-200 px-3 py-2 rounded-xl hover:bg-void-bg-2/50 group bg-void-bg-2/20 border border-void-border-2/50`}
				onClick={() => setIsOpen(o => !o)}
			>
				<ChevronRight
					size={12}
					className={`mr-2 transition-transform duration-200 text-void-fg-4 group-hover:text-void-fg-2 ${isOpen ? 'rotate-90 text-void-accent' : ''}`}
				/>
				<span className="font-bold text-void-fg-3 group-hover:text-void-fg-2 text-[10px] uppercase tracking-wider">{title}</span>
			</div>
			<div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 max-h-[1000px] mt-2 mb-2' : 'max-h-0 opacity-0'} text-xs`}>
				<div className="pl-2">
					{children}
				</div>
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
	onClick,
	desc2OnClick,
	isOpen,
	isRejected,
	className,
}: ToolHeaderParams) => {
	const [isOpen_, setIsOpen] = useState(false);
	const isExpanded = isOpen !== undefined ? isOpen : isOpen_
	const isDropdown = children !== undefined
	const isClickable = !!(isDropdown || onClick)
	const isDesc1Clickable = !!desc1OnClick
	const isReadingTool = (title && typeof title === 'string' && (title.includes('Read') || title.includes('Searched') || title.includes('Listed'))) || false
	const isCodingTool = (title && typeof title === 'string' && (title.includes('Edit') || title.includes('Rewrite') || title.includes('Created'))) || false
	const containerClasses = `w-full rounded-xl overflow-hidden transition-all duration-200 bg-void-bg-2/40 border border-void-border-2 hover:border-void-border-1 hover:bg-void-bg-2/60 ${isCodingTool ? 'shadow-[0_0_15px_-5px_rgba(0,127,212,0.15)] ring-1 ring-void-accent/5' : 'shadow-sm'} ${className}`
	const desc1HTML = <span className={`text-void-fg-4 text-xs italic truncate ml-2 ${isDesc1Clickable ? 'cursor-pointer hover:brightness-125 transition-all duration-150' : ''}`} onClick={desc1OnClick} {...desc1Info ? { 'data-tooltip-id': 'void-tooltip', 'data-tooltip-content': desc1Info, 'data-tooltip-place': 'top', 'data-tooltip-delay-show': 1000 } : {}}>{desc1}</span>

	return (
		<div className='my-3 px-1'>
			<div className={containerClasses}>
				<div className={`select-none flex items-center justify-between ${isReadingTool ? 'min-h-[32px] px-3 py-1.5' : 'min-h-[36px] px-3 py-2'} ${isClickable ? 'cursor-pointer group/header' : ''}`} onClick={() => { if (isDropdown) { setIsOpen(v => !v); } if (onClick) { onClick(); } }}>
					<div className={`flex items-center min-w-0 overflow-hidden ${isRejected ? 'line-through opacity-60' : ''}`}> 
						{isDropdown && <ChevronRight size={14} className={`text-void-fg-4 mr-2 transition-transform duration-200 ease-out group-hover/header:text-void-fg-2 ${isExpanded ? 'rotate-90 text-void-accent' : ''}`} />}
						<div className={`mr-2 p-1 rounded-md ${isCodingTool ? 'bg-void-accent/10 text-void-accent' : 'bg-void-bg-3 text-void-fg-3'}`}>{isReadingTool ? <File size={12} strokeWidth={2.5} /> : isCodingTool ? <Pencil size={12} strokeWidth={2.5} /> : <Database size={12} strokeWidth={2.5} />}</div>
						<span className={`flex-shrink-0 truncate ${isReadingTool ? 'text-void-fg-2 text-xs font-semibold' : 'text-void-fg-1 text-sm font-bold'}`}>{title}</span>
						{desc1HTML}
					</div>
					<div className="flex items-center gap-x-2 flex-shrink-0 ml-3">
						{info && <CircleEllipsis className='text-void-fg-4 opacity-40 flex-shrink-0 hover:opacity-100 transition-opacity' size={14} data-tooltip-id='void-tooltip' data-tooltip-content={info} data-tooltip-place='top-end' />}
						{isError && <AlertTriangle className='text-void-warning opacity-90 flex-shrink-0' size={14} data-tooltip-id='void-tooltip' data-tooltip-content={'Error running tool'} data-tooltip-place='top' />}
						{isRejected && <Ban className='text-void-fg-4 opacity-90 flex-shrink-0' size={14} data-tooltip-id='void-tooltip' data-tooltip-content={'Canceled'} data-tooltip-place='top' />}
						{desc2 && <div className="flex-shrink-0">{desc2}</div>}
						{numResults !== undefined && <span className="text-[10px] font-bold text-void-fg-3 bg-void-bg-3 px-1.5 py-0.5 rounded-full border border-void-border-2">{`${numResults}${hasNextPage ? '+' : ''}`}</span>}
						{hasNextPage && <span className="text-[10px] font-bold text-void-accent bg-void-accent/10 px-1.5 py-0.5 rounded uppercase tracking-wider">More</span>}
					</div>
				</div>
				{children !== undefined && <div className={`overflow-auto transition-all duration-300 ease-in-out border-t border-void-border-2 bg-void-bg-1/20 ${isExpanded ? 'opacity-100 max-h-96 py-3' : 'max-h-0 opacity-0'} px-3 text-void-fg-2`}>{children}</div>}
			</div>
			{bottomChildren && <div className="mt-1 animate-in fade-in duration-200">{bottomChildren}</div>}
		</div>
	)
};

export const ListableToolItem = ({ name, onClick, isSmall, className, showDot }: { name: React.ReactNode, onClick?: () => void, isSmall?: boolean, className?: string, showDot?: boolean }) => {
	return <div className={`${onClick ? 'hover:brightness-125 hover:cursor-pointer transition-all duration-200 ' : ''} flex items-center flex-nowrap whitespace-nowrap ${className ? className : ''}`} onClick={onClick}>
		{showDot === false ? null : <div className="flex-shrink-0"><svg className="w-1 h-1 opacity-60 mr-1.5 fill-current" viewBox="0 0 100 40"><rect x="0" y="15" width="100" height="10" /></svg></div>}
		<div className={`${isSmall ? 'italic text-void-fg-4 flex items-center' : ''}`}>{name}</div>
	</div>
}
