/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { WorkspaceConnection, WorkspaceThreadSummary, WorkspaceRemoteCommand } from '../../../../common/workspaceRegistryTypes.js';
import { useAllWorkspaces, useWorkspaceRemoteControl } from '../util/services.js';
import { Send, Sparkles, Bug, Wrench, BookOpen, Folder, ExternalLink, CornerDownLeft, Circle, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Friendly, plain-language summary of what a project is doing right now.
 */
const projectStatus = (workspace: WorkspaceConnection): { label: string, tone: 'running' | 'waiting' | 'ready' | 'empty' } => {
	const threads = workspace.threads;
	if (threads.some(t => t.status === 'streaming')) {
		return { label: 'A-Coder IDE is working on something…', tone: 'running' };
	}
	if (threads.some(t => t.status === 'awaiting_user')) {
		return { label: 'A-Coder IDE is waiting for you', tone: 'waiting' };
	}
	if (threads.length > 0) {
		return { label: 'Ready — nothing running', tone: 'ready' };
	}
	return { label: 'No conversations yet', tone: 'empty' };
};

const toneStyles: Record<string, string> = {
	running: 'text-void-accent',
	waiting: 'text-void-warning',
	ready: 'text-void-fg-3',
	empty: 'text-void-fg-4'
};

interface QuickAction {
	id: string;
	label: string;
	icon: React.ElementType;
	prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
	{ id: 'fix', label: 'Fix a bug', icon: Bug, prompt: 'There is a bug I need you to fix. I\'ll describe it: ' },
	{ id: 'build', label: 'Build a feature', icon: Wrench, prompt: 'I want you to build a new feature for me. Here is what I need: ' },
	{ id: 'explain', label: 'Explain my code', icon: BookOpen, prompt: 'Please explain what my code does, in simple terms. ' },
];

/**
 * The non-coder landing: a plain-language "What do you want A-Coder to do?"
 * composer that routes the request to the selected project window, plus a
 * friendly overview of every connected project.
 */
export const SimpleHome = ({ onGoAdvanced }: { onGoAdvanced: () => void }) => {
	const { workspaces, loadError, retry } = useAllWorkspaces();
	const remoteControl = useWorkspaceRemoteControl();

	const connected = useMemo(() => workspaces.filter(w => w.status === 'connected'), [workspaces]);

	const [targetId, setTargetId] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [sent, setSent] = useState<{ to: string, text: string } | null>(null);
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	// Default target: the first connected project.
	const target = useMemo(() => {
		if (targetId) return connected.find(w => w.id === targetId) ?? null;
		return connected[0] ?? null;
	}, [connected, targetId]);

	// Wrapper that awaits the (promise-returning) sendCommand and surfaces a
	// user-facing error instead of silently assuming success.
	const runCommand = async (cmd: WorkspaceRemoteCommand, errorMsg: string): Promise<boolean> => {
		setSendError(null)
		try {
			await remoteControl.sendCommand(cmd)
			return true
		} catch (e) {
			setSendError(`${errorMsg} (${e instanceof Error ? e.message : String(e)})`)
			return false
		}
	}

	const send = async () => {
		const text = draft.trim()
		if (!text || !target || sending) return
		setSending(true)
		const ok = await runCommand({ type: 'sendMessage', targetWorkspaceId: target.id, userMessage: text }, `Couldn't send to ${target.name}`)
		if (ok) {
			setSent({ to: target.name, text })
			setDraft('')
		}
		setSending(false)
	}

	if (connected.length === 0) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-8 text-center">
				<div className="w-14 h-14 rounded-2xl bg-void-bg-2 border border-void-border-2 flex items-center justify-center mb-4">
					{loadError ? <AlertTriangle className="w-7 h-7 text-amber-500" /> : <Folder className="w-7 h-7 text-void-fg-4" />}
				</div>
				{loadError ? (
					<>
						<h2 className="text-lg font-semibold text-void-fg-1">Couldn't load your projects</h2>
						<p className="text-xs text-void-fg-4 mt-2 max-w-sm">{loadError}</p>
						<button
							onClick={retry}
							className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-void-bg-2 border border-void-border-2 hover:bg-void-bg-3 text-xs font-medium text-void-fg-2 transition-colors"
						>
							<RefreshCw className="w-3.5 h-3.5" /> Try again
						</button>
					</>
				) : (
					<>
						<h2 className="text-lg font-semibold text-void-fg-1">Open a project to get started</h2>
						<p className="text-xs text-void-fg-4 mt-2 max-w-sm">
							A-Coder IDE works on your projects. Open a folder in an A-Coder IDE window, and it will show up here so you can tell A-Coder IDE what to do.
						</p>
						<button
							onClick={onGoAdvanced}
							className="mt-5 px-4 py-2 rounded-lg bg-void-bg-2 border border-void-border-2 hover:bg-void-bg-3 text-xs font-medium text-void-fg-2 transition-colors"
						>
							Open the full control panel
						</button>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="max-w-2xl mx-auto px-8 py-10">
				{/* Heading */}
				<div className="flex items-center gap-2 mb-1">
					<Sparkles className="w-4 h-4 text-void-accent" />
					<span className="text-[11px] font-bold uppercase tracking-wider text-void-accent">A-Coder IDE</span>
				</div>
				<h1 className="text-2xl font-bold text-void-fg-1 tracking-tight">What do you want A-Coder IDE to do?</h1>
				<p className="text-sm text-void-fg-4 mt-2">Describe it in your own words. A-Coder IDE will do it in the project you pick.</p>

				{/* Project picker */}
				<div className="mt-6">
					<label className="block text-[11px] font-semibold text-void-fg-4 uppercase tracking-wider mb-2">Send to</label>
					<div className="flex flex-wrap gap-2">
						{connected.map(w => (
							<button
								key={w.id}
								onClick={() => { setTargetId(w.id); setSent(null); }}
								className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${target?.id === w.id
									? 'bg-void-accent/10 border-void-accent/40 text-void-fg-1'
									: 'bg-void-bg-2 border-void-border-2 text-void-fg-3 hover:bg-void-bg-3'}`}
							>
								<span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
								{w.name}
							</button>
						))}
					</div>
				</div>

				{/* Composer */}
				<div className="mt-4">
					<textarea
						value={draft}
						onChange={e => { setDraft(e.target.value); setSent(null); }}
						onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
						placeholder="e.g. Fix the typo on the login page and make the button blue"
						rows={4}
						className="w-full bg-void-bg-2 border border-void-border-2 rounded-xl px-4 py-3 text-sm text-void-fg-1 placeholder:text-void-fg-4 focus:outline-none focus:border-void-accent/50 transition-colors resize-none"
					/>
					<div className="flex items-center justify-between mt-2">
						<span className="text-[10px] text-void-fg-4">Press ⌘↵ to send</span>
						<button
							onClick={send}
							disabled={!draft.trim() || !target || sending}
							className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--vscode-button-background)] text-white hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
						>
							<Send className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Send to A-Coder IDE'}
						</button>
					</div>
				</div>

				{/* Send error */}
				{sendError && (
					<div className='mt-3 flex items-start gap-2 rounded-xl border border-void-warning/30 bg-void-warning/5 p-3'>
						<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-void-warning' />
						<p className="text-[11px] text-void-fg-2 flex-1">{sendError}</p>
						<button
							onClick={() => setSendError(null)}
							className="text-[11px] text-void-fg-4 hover:text-void-fg-2 flex-shrink-0"
						>Dismiss</button>
					</div>
				)}

				{/* Quick actions */}
				<div className="mt-6">
					<label className="block text-[11px] font-semibold text-void-fg-4 uppercase tracking-wider mb-2">Quick actions</label>
					<div className="grid grid-cols-3 gap-2">
						{QUICK_ACTIONS.map(a => {
							const Icon = a.icon;
							return (
								<button
									key={a.id}
									onClick={() => { setDraft(a.prompt); setSent(null); }}
									className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-void-border-2 bg-void-bg-2 hover:bg-void-bg-3 hover:border-void-accent/40 transition-all"
								>
									<Icon className="w-4 h-4 text-void-fg-3" />
									<span className="text-[11px] font-medium text-void-fg-2">{a.label}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Sent confirmation */}
				{sent && target && (
					<div className='mt-4 flex items-center gap-3 rounded-xl border border-void-success/20 bg-void-success/5 p-3'>
						<div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-void-success/15'>
							<CornerDownLeft className='h-3.5 w-3.5 text-void-success/85' />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-xs font-medium text-void-fg-1">Sent to {sent.to}</p>
							<p className="text-[11px] text-void-fg-4 truncate">"{sent.text}"</p>
						</div>
						<button
							onClick={() => runCommand({ type: 'focus', targetWorkspaceId: target.id }, 'Couldn\'t focus the project window')}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 text-[11px] font-medium text-void-fg-2 transition-colors flex-shrink-0"
						>
							<ExternalLink className="w-3 h-3" /> Go to window
						</button>
					</div>
				)}

				{/* Projects overview */}
				<div className="mt-8">
					<h2 className="text-sm font-semibold text-void-fg-1 mb-3">Your projects</h2>
					<div className="space-y-2">
						{connected.map(w => <ProjectCard key={w.id} workspace={w} />)}
					</div>
				</div>
			</div>
		</div>
	);
};

const ProjectCard = ({ workspace }: { workspace: WorkspaceConnection }) => {
	const remoteControl = useWorkspaceRemoteControl();
	const status = useMemo(() => projectStatus(workspace), [workspace]);
	const latestThread = useMemo<WorkspaceThreadSummary | undefined>(
		() => [...workspace.threads].sort((a, b) => b.timestamp - a.timestamp)[0],
		[workspace.threads]
	);

	const focus = async () => {
		// sendCommand is promise-returning at runtime; await so a failure is
		// caught here rather than surfacing as an unhandled rejection.
		try { await remoteControl.sendCommand({ type: 'focus', targetWorkspaceId: workspace.id }) } catch { /* focus is best-effort */ }
	};
	const openLatest = async () => {
		try {
			if (latestThread) {
				await remoteControl.sendCommand({ type: 'openThread', targetWorkspaceId: workspace.id, threadId: latestThread.id });
			} else {
				await focus();
			}
		} catch { /* best-effort */ }
	};

	return (
		<div className='rounded-xl border border-void-hairline bg-void-bg-2 p-3 transition-colors hover:border-void-border-2'>
			<div className="flex items-center gap-3">
				<div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: workspace.color + '20' }}>
					<Folder className="w-4 h-4" style={{ color: workspace.color }} />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-void-fg-1 truncate">{workspace.name}</span>
						{status.tone === 'running' && <Circle className="w-2.5 h-2.5 text-void-accent fill-current animate-pulse flex-shrink-0" />}
					</div>
					<span className={`text-[11px] ${toneStyles[status.tone]}`}>{status.label}</span>
				</div>
				<div className="flex items-center gap-1.5 flex-shrink-0">
					<button
						onClick={openLatest}
						disabled={!latestThread}
						className="px-2.5 py-1 rounded-lg bg-void-bg-1 hover:bg-void-bg-3 border border-void-border-2 text-[11px] font-medium text-void-fg-2 disabled:opacity-40 transition-colors"
						title={latestThread ? 'Open the latest conversation' : 'No conversations yet'}
					>
						Open
					</button>
					<button
						onClick={focus}
						className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-void-bg-1 hover:bg-void-bg-3 border border-void-border-2 text-[11px] font-medium text-void-fg-2 transition-colors"
						title="Bring this window to the front"
					>
						<ExternalLink className="w-3 h-3" /> Focus
					</button>
				</div>
			</div>
			{latestThread && (
				<p className="text-[11px] text-void-fg-4 truncate mt-2 pl-12">{latestThread.title}</p>
			)}
		</div>
	);
};