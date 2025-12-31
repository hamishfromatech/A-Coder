/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState } from 'react';
import { Settings, X, Database, Settings2, ChevronDown, ChevronRight, Box } from 'lucide-react';
import { useAccessor, useIsDark, useMCPServiceState, useSettingsState } from '../util/services.js';
import { VOID_TOGGLE_SETTINGS_ACTION_ID } from '../../../actionIDs.js';
import ErrorBoundary from './ErrorBoundary.js';
import { VoidSwitch } from '../util/inputs.js';

export const MCPServerModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
	const isDark = useIsDark();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	const mcpService = accessor.get('IMCPService');
	const modalRef = useRef<HTMLDivElement>(null);

	const mcpServiceState = useMCPServiceState();
	const settingsState = useSettingsState();

	// State for tracking expanded servers
	const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

	const toggleServerExpansion = (name: string) => {
		const newExpanded = new Set(expandedServers);
		if (newExpanded.has(name)) {
			newExpanded.delete(name);
		} else {
			newExpanded.add(name);
		}
		setExpandedServers(newExpanded);
	};

	// Get MCP servers from state
	const mcpServerEntries = Object.entries(mcpServiceState.mcpServerOfName);
	const serverCount = mcpServerEntries.length;

	// Close on escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
		}
		return () => document.removeEventListener('keydown', handleEscape);
	}, [isOpen, onClose]);

	// Handle clicks outside the modal
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);

	const handleOpenSettings = () => {
		commandService.executeCommand(VOID_TOGGLE_SETTINGS_ACTION_ID, { tab: 'mcp' });
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''} fixed inset-0 z-[100] flex items-start justify-end p-4 pt-16 pointer-events-none`}>
			<div
				ref={modalRef}
				className={`
					w-80 pointer-events-auto
					bg-void-bg-1/95 backdrop-blur-xl
					border border-void-border-2 rounded-2xl
					shadow-2xl shadow-black/40
					flex flex-col overflow-hidden
					animate-in fade-in slide-in-from-top-4 duration-200
				`}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-void-border-2">
					<div className="flex items-center gap-2.5">
						<div className="bg-void-accent/10 p-1.5 rounded-lg">
							<Database size={16} className="text-void-accent" />
						</div>
						<div>
							<h3 className="text-sm font-bold text-void-fg-1 tracking-tight">MCP Servers</h3>
							<p className="text-[10px] text-void-fg-3 uppercase tracking-wider font-semibold">
								{serverCount} Active {serverCount === 1 ? 'Server' : 'Servers'}
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-1.5 hover:bg-void-bg-2 rounded-full text-void-fg-3 hover:text-void-fg-1 transition-all"
					>
						<X size={16} />
					</button>
				</div>

				{/* Server List */}
				<div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
					<ErrorBoundary>
						{serverCount === 0 ? (
							<div className="py-12 flex flex-col items-center justify-center text-center px-6">
								<div className="bg-void-bg-2 p-3 rounded-full mb-3 opacity-50">
									<Database size={24} className="text-void-fg-3" />
								</div>
								<p className="text-sm text-void-fg-2 font-medium">No Servers Found</p>
								<p className="text-xs text-void-fg-4 mt-1">Configure MCP servers in settings to extend A-Coder's capabilities.</p>
							</div>
						) : (
							mcpServerEntries.map(([name, server]) => {
								const tools = server.tools ?? [];
								const toolCount = tools.length;
								const isOn = !!settingsState.mcpUserStateOfName[name]?.isOn;
								const status = server.status;
								const isExpanded = expandedServers.has(name);

								return (
									<div
										key={name}
										className="group relative flex flex-col rounded-xl bg-void-bg-2/30 border border-void-border-2 hover:border-void-border-1 transition-all mb-1 shadow-sm overflow-hidden"
									>
										<div 
											className="flex items-center gap-3 p-3 cursor-pointer hover:bg-void-bg-2/50 transition-colors"
											onClick={() => toggleServerExpansion(name)}
										>
											{/* Status indicator */}
											<div className="flex items-center justify-center p-2 rounded-lg bg-void-bg-3 shadow-inner">
												<div className={`relative flex h-2.5 w-2.5`}>
													{status === 'success' && isOn && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
													<span className={`relative inline-flex rounded-full h-2.5 w-2.5 
														${!isOn ? 'bg-void-fg-4'
														: status === 'success' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' 
														: status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
														: status === 'loading' ? 'bg-yellow-500 animate-pulse' 
														: 'bg-void-fg-4'}
													`}></span>
												</div>
											</div>

											<div className="flex-1 min-w-0">
												<div className="flex items-center justify-between gap-2">
													<div className="flex items-center gap-1.5 min-w-0">
														<span className="text-xs font-bold text-void-fg-1 truncate tracking-tight">{name}</span>
														{isExpanded ? <ChevronDown size={12} className="text-void-fg-3 flex-shrink-0" /> : <ChevronRight size={12} className="text-void-fg-3 flex-shrink-0" />}
													</div>
													<div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
														<VoidSwitch
															size="xxs"
															value={isOn}
															onChange={(newVal) => mcpService.toggleServerIsOn(name, newVal)}
														/>
													</div>
												</div>
												<div className="text-[10px] text-void-fg-3 font-semibold uppercase tracking-wider mt-0.5 opacity-70">
													{toolCount} {toolCount === 1 ? 'tool' : 'tools'} {isOn ? 'available' : 'hidden'}
												</div>
											</div>
										</div>

										{/* Expandable Tools List */}
										{isExpanded && (
											<div className="px-3 pb-3 pt-1 border-t border-void-border-2 bg-void-bg-1/30">
												<div className="space-y-1.5 mt-2">
													{toolCount === 0 ? (
														<p className="text-[10px] text-void-fg-4 italic px-2">No tools available</p>
													) : (
														tools.map((tool) => (
															<div key={tool.name} className="flex items-start gap-2 px-2 py-1 rounded-md hover:bg-void-bg-3/50 group/tool transition-colors">
																<Box size={10} className="text-void-fg-4 mt-0.5 group-hover/tool:text-void-accent transition-colors" />
																<div className="min-w-0">
																	<div className="text-[11px] font-bold text-void-fg-2 truncate">{tool.name}</div>
																	{tool.description && (
																		<div className="text-[9px] text-void-fg-4 line-clamp-2 leading-relaxed mt-0.5" title={tool.description}>
																			{tool.description}
																		</div>
																	)}
																</div>
															</div>
														))
													)}
												</div>
											</div>
										)}
									</div>
								);
							})
						)}
					</ErrorBoundary>
				</div>

				{/* Footer */}
				<div className="p-3 bg-void-bg-2/30 border-t border-void-border-2 flex flex-col gap-2">
					<button
						onClick={handleOpenSettings}
						className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 rounded-xl text-void-fg-1 transition-all text-sm font-semibold shadow-sm group"
					>
						<Settings2 size={16} className="text-void-fg-3 group-hover:rotate-45 transition-transform duration-300" />
						Configure MCP
					</button>
				</div>
			</div>
		</div>
	);
};
