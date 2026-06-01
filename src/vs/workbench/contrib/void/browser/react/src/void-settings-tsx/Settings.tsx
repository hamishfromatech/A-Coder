/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ProviderName, SettingName, displayInfoOfSettingName, providerNames, VoidStatefulModelInfo, customSettingNamesOfProvider, RefreshableProviderName, refreshableProviderNames, displayInfoOfProviderName, nonlocalProviderNames, localProviderNames, GlobalSettingName, featureNames, displayInfoOfFeatureName, isProviderNameDisabled, FeatureName, hasDownloadButtonsOnModelsProviderNames, subTextMdOfProviderName } from '../../../../common/voidSettingsTypes.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'
import { VoidButtonBgDarken, VoidCustomDropdownBox, VoidInputBox2, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js'
import { useAccessor, useClipboardService, useIsDark, useIsOptedOut, useRefreshModelListener, useRefreshModelState, useSettingsState, /* useACoderOAuthState, useACoderModels */ } from '../util/services.js'
// import { IACoderOAuthService, type ACoderModelInfo } from '../../../../common/aCoderOAuthService.js'
import { X, RefreshCw, Loader2, Check, Asterisk, Plus, Cpu, Cloud, Settings2, Info, LayoutGrid, List, Smartphone, Database, Zap, Sparkles, Box, Globe, ShieldCheck, ArrowRightLeft, Search, Copy, LogIn, LogOut, User, Download, Star, MessageCircle, Store, Plug, ExternalLink, AlertTriangle, Eye, EyeOff, ChevronRight, Wind, Brain, Terminal, Code, BookOpen, Target, Trophy, Palette, Image as ImageIcon, Volume2, Play, Mic } from 'lucide-react'
import { URI } from '../../../../../../../base/common/uri.js'
import { VSBuffer } from '../../../../../../../base/common/buffer.js'
import { ModelDropdown } from './ModelDropdown.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { WarningBox } from './WarningBox.js'
import { os } from '../../../../common/helpers/systemInfo.js'
import { IconLoading } from '../sidebar-tsx/SidebarChat.js'
import { ToolApprovalType, toolApprovalTypes } from '../../../../common/toolsServiceTypes.js'
import Severity from '../../../../../../../base/common/severity.js'
import { getModelCapabilities, modelOverrideKeys, ModelOverrides } from '../../../../common/modelCapabilities.js';
import { TransferEditorType, TransferFilesInfo } from '../../../extensionTransferTypes.js';
import { MCPServer } from '../../../../common/mcpServiceTypes.js';
import { useMCPServiceState, useComposioServiceState } from '../util/services.js';
import { OPT_OUT_KEY } from '../../../../common/storageKeys.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import '../styles.css'

type Tab =
	| 'models' | 'localProviders' | 'providers' | 'featureOptions' | 'mediaGeneration' | 'general' | 'mcp' | 'composio' | 'skills' | 'mobileApi' | 'about' | 'all';

// --- Shared Components ---

export const SettingRow = ({
	label,
	description,
	children,
	className = ''
}: {
	label: React.ReactNode
	description?: React.ReactNode
	children: React.ReactNode
	className?: string
}) => (
	<div className={`flex items-start justify-between gap-8 py-4 group ${className}`}>
		<div className="flex flex-col gap-1.5 flex-1 min-w-0">
			<span className="text-[13px] font-medium text-void-fg-1 tracking-tight">{label}</span>
			{description && (
				<div className="text-[12px] text-void-fg-3/70 leading-relaxed max-w-md">{description}</div>
			)}
		</div>
		<div className="flex-shrink-0 pt-0.5 transition-transform duration-200 group-hover:scale-[1.02]">
			{children}
		</div>
	</div>
)

// Premium setting components with double-bezel architecture
export const SettingBox = ({ children, className = '', variant = 'default' }: { children: React.ReactNode, className?: string, variant?: 'default' | 'nested' }) => {
	if (variant === 'nested') {
		return (
			<div className={`p-1.5 rounded-[1.25rem] bg-void-bg-2/30 ring-1 ring-void-border-2/40 setting-card-enter ${className}`}>
				<div className="p-5 rounded-[calc(1.25rem-6px)] bg-void-depth-elevated shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
					{children}
				</div>
			</div>
		)
	}
	return (
		<div className={`p-5 rounded-xl bg-void-depth-elevated border border-void-border-2/60 shadow-sm setting-card-enter ${className}`}>
			{children}
		</div>
	)
}

export const SettingCard = ({
	title,
	description,
	children,
	className = '',
	eyebrow,
	icon: Icon,
	isDark
}: {
	title: string
	description?: string
	children: React.ReactNode
	className?: string
	eyebrow?: string
	icon?: React.ComponentType<{ size?: number; className?: string }>
	isDark?: boolean
}) => (
	<div className={`py-12 first:pt-0 ${className}`}>
		<div className="mb-10">
			{eyebrow && (
				<div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-void-accent/8 border border-void-accent/20">
					{Icon && <Icon size={12} className="text-void-accent" />}
					<span className="text-[10px] uppercase tracking-[0.2em] font-medium text-void-accent">{eyebrow}</span>
				</div>
			)}
			<h3 className="text-[20px] font-semibold text-void-fg-1 tracking-tight">{title}</h3>
			{description && (
				<p className="text-[13px] text-void-fg-3/70 mt-2 leading-relaxed max-w-lg">{description}</p>
			)}
		</div>
		<div className="space-y-6 settings-box-stagger">
			{children}
		</div>
	</div>
)

// Divider for separating sections
export const SettingDivider = () => (
	<div className="h-px bg-void-border-2/50 my-8" />
)

export const AnimatedCheckmarkButton = ({ text, className }: { text?: string, className?: string }) => {
	const [dashOffset, setDashOffset] = useState(40);

	useEffect(() => {
		const startTime = performance.now();
		const duration = 500; // 500ms animation

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const newOffset = 40 - (progress * 40);

			setDashOffset(newOffset);

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		const animationId = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationId);
	}, []);

	return <div
		className={`flex items-center gap-1.5 w-fit
			${className ? className : `px-2 py-0.5 text-xs text-zinc-900 bg-zinc-100 rounded-sm`}
		`}
	>
		<svg className="size-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M5 13l4 4L19 7"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{
					strokeDasharray: 40,
					strokeDashoffset: dashOffset
				}}
			/>
		</svg>
		{text}
	</div>
}


// Premium button component with spring physics
const SettingsButton = ({ children, disabled, onClick, className, variant = 'secondary' }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; className?: string, variant?: 'primary' | 'secondary' | 'danger' }) => {
	const baseClasses = "px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

	const variants = {
		primary: "bg-gradient-to-br from-void-accent to-void-accent/90 text-white shadow-lg shadow-void-accent/20 hover:shadow-xl hover:shadow-void-accent/30 hover:-translate-y-0.5",
		secondary: "bg-void-depth-elevated border border-void-border-2 text-void-fg-1 hover:bg-void-bg-2-hover hover:border-void-border-1 hover:shadow-sm",
		danger: "bg-void-error/10 border border-void-error/20 text-void-error hover:bg-void-error hover:text-white hover:border-void-error"
	};

	return (
		<button
			disabled={disabled}
			className={`${baseClasses} ${variants[variant]} ${className || ''}`}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

// Premium Quick toggle card for feature grid with haptic feel
const QuickToggleCard = ({
	title,
	description,
	icon: Icon,
	enabled,
	onToggle
}: {
	title: string
	description: string
	icon: React.ComponentType<{ size?: number; className?: string }>
	enabled: boolean
	onToggle: () => void
}) => {
	return (
		<button
			onClick={onToggle}
			className={`
				group relative overflow-hidden
				p-5 rounded-2xl border transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
				text-left active:scale-[0.98]
				${enabled
					? 'bg-gradient-to-br from-void-accent/8 to-void-accent/2 border-void-accent/30 shadow-lg shadow-void-accent/5'
					: 'bg-void-bg-2/20 border-void-border-2/50 hover:border-void-border-1 hover:bg-void-bg-2/40'
				}
			`}
		>
			{/* Glow effect on enabled */}
			{enabled && (
				<div className="absolute inset-0 bg-gradient-to-br from-void-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
			)}

			<div className="relative flex items-start justify-between mb-4">
				<div className={`
					w-10 h-10 rounded-xl flex items-center justify-center
					transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
					${enabled
						? 'bg-void-accent text-white shadow-lg shadow-void-accent/30'
						: 'bg-void-bg-3 text-void-fg-3 group-hover:bg-void-bg-4'
					}
				`}>
					<Icon size={18} strokeWidth={enabled ? 2.5 : 2} />
				</div>

				{/* Toggle indicator */}
				<div className={`
					w-5 h-5 rounded-full flex items-center justify-center
					transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
					${enabled
						? 'bg-void-accent border-void-accent'
						: 'border-2 border-void-border-2 group-hover:border-void-border-1'
					}
				`}>
					<Check
						size={12}
						strokeWidth={3}
						className={`
							transition-all duration-300
							${enabled ? 'text-white scale-100 opacity-100' : 'scale-50 opacity-0'}
						`}
					/>
				</div>
			</div>

			<h3 className={`
				text-sm font-semibold tracking-tight mb-1
				transition-colors duration-200
				${enabled ? 'text-void-fg-1' : 'text-void-fg-2 group-hover:text-void-fg-1'}
			`}>
				{title}
			</h3>
			<p className="text-[11px] text-void-fg-3/80 leading-relaxed">{description}</p>
		</button>
	)
}

const TestSoundButton = () => {
	const settingsState = useSettingsState()
	const [isPlaying, setIsPlaying] = useState(false)

	const handlePlaySound = useCallback(async () => {
		const soundName = settingsState.globalSettings.notificationSound || 'none'
		if (soundName === 'none') return

		try {
			setIsPlaying(true)
			const accessor = useAccessor()
			const soundService = accessor.get('ISoundService')
			const dataUrl = await soundService.playSound(soundName)
			console.log('[TestSoundButton] Received dataUrl:', dataUrl ? 'yes' : 'no')
			if (dataUrl) {
				const audio = new Audio(dataUrl)
				audio.volume = 0.5
				await audio.play()
				console.log('[TestSoundButton] Audio playing...')
			}
		} catch (e) {
			console.warn('[A-Coder] Failed to preview sound:', e)
		} finally {
			setIsPlaying(false)
		}
	}, [settingsState.globalSettings.notificationSound])

	const disabled = settingsState.globalSettings.notificationSound === 'none' || !settingsState.globalSettings.notificationSound

	return (
		<div className="flex items-center gap-3">
			<button
				onClick={handlePlaySound}
				disabled={disabled || isPlaying}
				className={`
					flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors
					${disabled 
						? 'bg-void-bg-3 text-void-fg-3 cursor-not-allowed' 
						: 'bg-void-accent/10 hover:bg-void-accent/20 text-void-accent cursor-pointer'}
				`}
			>
				{isPlaying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
				<span className="text-sm font-medium">{isPlaying ? 'Playing...' : 'Test Sound'}</span>
			</button>
			{disabled ? (
				<span className="text-xs text-void-fg-3">Select a sound to preview</span>
			) : (
				<span className="text-xs text-void-fg-3">Preview "{settingsState.globalSettings.notificationSound}.wav"</span>
			)}
		</div>
	)
}

const AddButton = ({ disabled, text = 'Add', ...props }: { disabled?: boolean, text?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		disabled={disabled}
		className={`bg-void-vscode-button-bg px-3 py-1 text-void-vscode-button-fg rounded-[2px] text-[13px] font-normal shadow-sm transition-all duration-100 flex items-center gap-2 active:opacity-80 ${!disabled ? 'hover:bg-void-vscode-button-hover-bg hover:shadow' : 'opacity-50 cursor-not-allowed'}`}
		{...props}
	>
		<Plus size={14} strokeWidth={2.5} />
		{text}
	</button>
}

// ConfirmButton prompts for a second click to confirm an action, cancels if clicking outside
const ConfirmButton = ({ children, onConfirm, className }: { children: React.ReactNode, onConfirm: () => void, className?: string }) => {
	const [confirm, setConfirm] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!confirm) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setConfirm(false);
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	}, [confirm]);
	return (
		<div ref={ref} className={`inline-block w-full`}>
			<SettingsButton
				className={`w-full ${className}`}
				variant={confirm ? 'danger' : 'secondary'}
				onClick={() => {
					if (!confirm) {
						setConfirm(true);
					} else {
						onConfirm();
						setConfirm(false);
					}
				}}
			>
				{confirm ? `Confirm Reset` : children}
			</SettingsButton>
		</div>
	);
};

// models
const RefreshModelButton = ({ providerName }: { providerName: RefreshableProviderName }) => {

	const refreshModelState = useRefreshModelState()

	const accessor = useAccessor()
	const refreshModelService = accessor.get('IRefreshModelService')
	const metricsService = accessor.get('IMetricsService')

	const [justFinished, setJustFinished] = useState<null | 'finished' | 'error'>(null)

	useRefreshModelListener(
		useCallback((providerName2, refreshModelState) => {
			if (providerName2 !== providerName) return
			const { state } = refreshModelState[providerName]
			if (!(state === 'finished' || state === 'error')) return
			// now we know we just entered 'finished' state for this providerName
			setJustFinished(state)
			const tid = setTimeout(() => { setJustFinished(null) }, 2000)
			return () => clearTimeout(tid)
		}, [providerName])
	)

	const { state } = refreshModelState[providerName]

	const { title: providerTitle } = displayInfoOfProviderName(providerName)

	return (
		<div className="flex items-center justify-between p-3 void-card">
			<span className="text-sm text-void-fg-2">
				{justFinished === 'finished' ? `${providerTitle} Models are up-to-date!`
				: justFinished === 'error' ? `${providerTitle} not found!`
				: `Refresh ${providerTitle} models`}
			</span>
			<button
				className={`p-2 rounded-md hover:bg-void-bg-3 transition-colors focus:outline-none focus:ring-2 focus:ring-void-accent min-w-[44px] min-h-[44px] flex items-center justify-center ${state === 'refreshing' ? 'opacity-50 cursor-not-allowed' : ''}`}
				disabled={state === 'refreshing' || justFinished !== null}
				onClick={() => {
					refreshModelService.startRefreshingModels(providerName, { enableProviderOnSuccess: false, doNotFire: false })
					metricsService.capture('Click', { providerName, action: 'Refresh Models' })
				}}
				title="Refresh Models"
				aria-label="Refresh Models"
			>
				{justFinished === 'finished' ? <Check className='stroke-green-500 size-4' />
					: justFinished === 'error' ? <X className='stroke-red-500 size-4' />
						: state === 'refreshing' ? <Loader2 className='size-4 animate-spin text-void-accent' />
							: <RefreshCw className='size-4 text-void-fg-3' />}
			</button>
		</div>
	)
}

// ---------------- Simplified Model Settings Dialog ------------------

const RefreshableModels = () => {
	const settingsState = useSettingsState()

	const buttons = refreshableProviderNames.map(providerName => {
		if (!settingsState.settingsOfProvider[providerName]._didFillInProviderSettings) return null
		return <RefreshModelButton key={providerName} providerName={providerName} />
	})

	return <div className="flex flex-col gap-3">
		{buttons}
	</div>
}

// keys of ModelOverrides we allow the user to override



// This new dialog replaces the verbose UI with a single JSON override box.




export const ModelDump = ({ filteredProviders }: { filteredProviders?: ProviderName[] }) => {
	const accessor = useAccessor()
	const settingsStateService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	// State to track which model's config card is expanded (inline, not modal)
	const [expandedModel, setExpandedModel] = useState<{ modelName: string, providerName: ProviderName } | null>(null);

	// View mode: list or grid
	const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

	// States for add model functionality
	const [isAddModelOpen, setIsAddModelOpen] = useState(false);
	const [showCheckmark, setShowCheckmark] = useState(false);
	const [userChosenProviderName, setUserChosenProviderName] = useState<ProviderName | null>(null);
	const [modelName, setModelName] = useState<string>('');
	const [errorString, setErrorString] = useState('');
	const [searchQuery, setSearchQuery] = useState('');

	// a dump of all the enabled providers' models
	const modelDump: (VoidStatefulModelInfo & { providerName: ProviderName, providerEnabled: boolean })[] = []

	// Use either filtered providers or all providers
	const providersToShow = filteredProviders || providerNames;

	for (let providerName of providersToShow) {
		const providerSettings = settingsState.settingsOfProvider[providerName]
		// if (!providerSettings.enabled) continue
		modelDump.push(...providerSettings.models.map(model => ({ ...model, providerName, providerEnabled: !!providerSettings._didFillInProviderSettings })))
	}

	// sort by hidden
	modelDump.sort((a, b) => {
		return Number(b.providerEnabled) - Number(a.providerEnabled)
	})

	const filteredModelDump = modelDump.filter(m =>
		m.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
		displayInfoOfProviderName(m.providerName).title.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Add model handler
	const handleAddModel = () => {
		if (!userChosenProviderName) {
			setErrorString('Please select a provider.');
			return;
		}
		if (!modelName) {
			setErrorString('Please enter a model name.');
			return;
		}

		// Check if model already exists
		if (settingsState.settingsOfProvider[userChosenProviderName].models.find(m => m.modelName === modelName)) {
			setErrorString(`This model already exists.`);
			return;
		}

		settingsStateService.addModel(userChosenProviderName, modelName);
		setShowCheckmark(true);
		setTimeout(() => {
			setShowCheckmark(false);
			setIsAddModelOpen(false);
			setUserChosenProviderName(null);
			setModelName('');
		}, 1500);
		setErrorString('');
	};

	// Track editing state with refs to prevent re-render issues
	const editingTextRef = useRef<{ [key: string]: string }>({});
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// Inline config card - always editable, no view/edit toggle
	const renderConfigCard = (modelName: string, providerName: ProviderName, type: string) => {
		const defaultModelCapabilities = getModelCapabilities(providerName, modelName, undefined);
		const currentOverrides = settingsState.overridesOfModel?.[providerName]?.[modelName] ?? undefined;
		const { recognizedModelName, isUnrecognizedModel } = defaultModelCapabilities;

		const partialDefaults: Partial<ModelOverrides> = {};
		for (const k of modelOverrideKeys) { if (defaultModelCapabilities[k]) partialDefaults[k] = defaultModelCapabilities[k] as any; }

		const key = `${providerName}:${modelName}`;
		// Show current overrides if they exist, otherwise show the defaults so user can see and edit them
		const displayValue = currentOverrides
			? JSON.stringify(currentOverrides, null, 2)
			: JSON.stringify(partialDefaults, null, 2);

		// Initialize ref value if not set, or sync with saved value when card first opens
		if (editingTextRef.current[key] === undefined) {
			editingTextRef.current[key] = displayValue;
		}

		const handleSave = async () => {
			const text = editingTextRef.current[key] || '';
			if (!text.trim()) {
				await settingsStateService.setOverridesOfModel(providerName, modelName, undefined);
				editingTextRef.current[key] = ''; // Sync ref with saved state
				setErrorMsg(null);
				return;
			}

			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(text);
			} catch {
				setErrorMsg('Invalid JSON');
				return;
			}

			const cleaned: Partial<ModelOverrides> = {};
			for (const k of modelOverrideKeys) {
				if (k in parsed && parsed[k] !== null && parsed[k] !== undefined && parsed[k] !== '') {
					cleaned[k] = parsed[k] as any;
				}
			}

			const finalValue = Object.keys(cleaned).length > 0 ? cleaned : undefined;
			await settingsStateService.setOverridesOfModel(providerName, modelName, finalValue);
			// Sync ref with what was actually saved
			editingTextRef.current[key] = finalValue ? JSON.stringify(finalValue, null, 2) : '';
			setErrorMsg(null);
		};

		const handleClear = async () => {
			await settingsStateService.setOverridesOfModel(providerName, modelName, undefined);
			editingTextRef.current[key] = '';
			setErrorMsg(null);
		};

		return (
			<div className="ml-8 mr-3 mb-2 p-3 void-card text-sm">
				<div className="flex justify-between items-start mb-2">
					<div>
						<span className="font-medium">{modelName}</span>
						<span className="text-void-fg-3 ml-2 text-xs">
							{isUnrecognizedModel ? '(unrecognized)' : `→ ${recognizedModelName}`}
						</span>
					</div>
					<button onClick={() => setExpandedModel(null)} className="text-void-fg-3 hover:text-void-fg-1">
						<X size={14} />
					</button>
				</div>

				<div className="text-xs text-void-fg-3 mb-2">
					{currentOverrides ? '\u{26A0}\u{FE0F} Has custom overrides' : 'Showing defaults (edit to customize)'}
				</div>

				<textarea
					defaultValue={editingTextRef.current[key]}
					onChange={(e) => { editingTextRef.current[key] = e.target.value; }}
					className="w-full h-40 p-2 font-mono text-xs bg-void-bg-1 border border-void-border-2 rounded resize-y"
				/>

				{errorMsg && <div className="text-red-500 text-xs mt-1">{errorMsg}</div>}

				<div className="flex gap-2 mt-2">
					<button
						onClick={handleSave}
						className="px-3 py-1 text-xs bg-[var(--vscode-button-background)] text-white rounded hover:bg-[var(--vscode-button-hoverBackground)]"
					>
						Save
					</button>
					{currentOverrides && (
						<button
							onClick={handleClear}
							className="px-3 py-1 text-xs text-red-400 bg-void-bg-1 border border-void-border-2 rounded hover:bg-red-900/20"
						>
							Clear Overrides
						</button>
					)}
					<button
						onClick={() => setExpandedModel(null)}
						className="px-3 py-1 text-xs bg-void-bg-1 border border-void-border-2 rounded hover:bg-void-bg-2"
					>
						Close
					</button>
				</div>
			</div>
		);
	};

	return <div className='divide-y divide-void-border-2'>
		{/* Search Bar */}
		<div className="p-3 px-4 border-b border-void-border-2 bg-void-bg-2/30 flex items-center gap-3">
			<Search size={16} className="text-void-fg-3 flex-shrink-0" />
			<VoidSimpleInputBox
				value={searchQuery}
				onChangeValue={setSearchQuery}
				placeholder="Search models..."
				className="!bg-transparent !border-none !p-0 text-sm flex-1"
				compact={true}
			/>
			{/* View Toggle */}
			<div className="flex items-center gap-1 bg-void-bg-1 rounded-md p-0.5">
				<button
					onClick={() => setViewMode('list')}
					className={`p-1.5 rounded-sm transition-colors ${viewMode === 'list' ? 'bg-void-bg-3 text-void-fg-1' : 'text-void-fg-3 hover:text-void-fg-2'}`}
					data-tooltip-id='void-tooltip'
					data-tooltip-content='List View'
				>
					<List size={14} />
				</button>
				<button
					onClick={() => setViewMode('grid')}
					className={`p-1.5 rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-void-bg-3 text-void-fg-1' : 'text-void-fg-3 hover:text-void-fg-2'}`}
					data-tooltip-id='void-tooltip'
					data-tooltip-content='Grid View'
				>
					<LayoutGrid size={14} />
				</button>
			</div>
		</div>

		{viewMode === 'list' ? (
			// List View
			filteredModelDump.map((m, i) => {
				const { isHidden, type, modelName, providerName, providerEnabled } = m

				const isNewProviderName = (i > 0 ? filteredModelDump[i - 1] : undefined)?.providerName !== providerName

				const providerTitle = displayInfoOfProviderName(providerName).title

				const disabled = !providerEnabled
				const value = disabled ? false : !isHidden

				const tooltipName = (
					disabled ? `Add ${providerTitle} to enable`
						: value === true ? 'Show in Dropdown'
							: 'Hide from Dropdown'
				)


				const detailAboutModel = type === 'autodetected' ?
					<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[var(--vscode-void-accent)]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content='Detected locally' />
					: type === 'custom' ?
						<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[var(--vscode-void-accent)]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content='Custom model' />
						: undefined

				const hasOverrides = !!settingsState.overridesOfModel?.[providerName]?.[modelName]
				const isExpanded = expandedModel?.modelName === modelName && expandedModel?.providerName === providerName;

				return <div key={`${modelName}${providerName}`}>
					<div
						className={`flex items-center justify-between gap-4 py-3 px-4 hover:bg-void-bg-2 transition-colors cursor-default group`}
					>
						{/* left part is width:full */}
						<div className={`flex flex-grow items-center gap-4`}>
							<span className='w-full max-w-32 text-sm font-medium text-void-fg-2'>{isNewProviderName ? providerTitle : ''}</span>
							<span className='w-fit max-w-[400px] truncate text-sm text-void-fg-1'>{modelName}</span>
						</div>

						{/* right part is anything that fits */}
						<div className="flex items-center gap-3 w-fit">

							{/* Config button - toggles inline card */}
							{disabled ? null : (
								<button
									onClick={() => {
										if (isExpanded) {
											setExpandedModel(null);
										} else {
											setExpandedModel({ modelName, providerName });
										}
									}}
									data-tooltip-id='void-tooltip'
									data-tooltip-place='right'
									data-tooltip-content={isExpanded ? 'Hide Config' : 'Show Config'}
									className={`${hasOverrides || isExpanded ? 'text-void-fg-1' : 'opacity-0 group-hover:opacity-100 text-void-fg-3'} hover:text-void-fg-1 transition-all p-1`}
								>
									<Plus size={14} className={`${isExpanded ? 'rotate-45' : ''} transition-transform`} />
								</button>
							)}

						{/* Blue star */}
						{detailAboutModel}


						{/* Switch */}
						<VoidSwitch
							value={value}
							onChange={() => { settingsStateService.toggleModelHidden(providerName, modelName); }}
							disabled={disabled}
							size='sm'

							data-tooltip-id='void-tooltip'
							data-tooltip-place='right'
							data-tooltip-content={tooltipName}
						/>

						{/* X button */}
						<div className={`w-5 flex items-center justify-center`}>
							{type === 'default' || type === 'autodetected' ? null : <button
								onClick={() => { settingsStateService.deleteModel(providerName, modelName); }}
								data-tooltip-id='void-tooltip'
								data-tooltip-place='right'
								data-tooltip-content='Delete'
								className={`${hasOverrides ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity p-1 hover:bg-void-bg-3 rounded`}
							>
								<X size={14} className="text-void-fg-3" />
							</button>}
						</div>
					</div>
				</div>
				{/* Inline config card - shows when expanded */}
				{isExpanded && <div className="px-4 pb-4 bg-void-bg-2/30 border-t border-void-border-2">{renderConfigCard(modelName, providerName, type)}</div>}
			</div>
			})
		) : (
			// Grid View
			<div className="model-grid">
				{filteredModelDump.map((m, i) => {
					const { isHidden, type, modelName, providerName, providerEnabled } = m
					const providerTitle = displayInfoOfProviderName(providerName).title
					const disabled = !providerEnabled
					const value = disabled ? false : !isHidden
					const hasOverrides = !!settingsState.overridesOfModel?.[providerName]?.[modelName]
					const isExpanded = expandedModel?.modelName === modelName && expandedModel?.providerName === providerName;

					const detailAboutModel = type === 'autodetected' ?
						<Asterisk size={12} className="brightness-115 stroke-[2] text-[var(--vscode-void-accent)]" data-tooltip-id='void-tooltip' data-tooltip-content='Detected locally' />
						: type === 'custom' ?
							<Asterisk size={12} className="brightness-115 stroke-[2] text-[var(--vscode-void-accent)]" data-tooltip-id='void-tooltip' data-tooltip-content='Custom model' />
							: undefined

					return (
						<div
							key={`${modelName}${providerName}`}
							className={`model-card group ${disabled ? 'model-card-disabled' : ''} ${isExpanded ? 'model-card-expanded' : ''}`}
							style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
						>
							{/* Provider Badge */}
							<div className="model-card-provider-badge">
								{providerTitle}
							</div>

							{/* Actions - positioned in top right */}
							<div className="model-card-actions">
								{/* Config button */}
								{!disabled && (
									<button
										onClick={() => {
											if (isExpanded) {
												setExpandedModel(null);
											} else {
												setExpandedModel({ modelName, providerName });
											}
										}}
										data-tooltip-id='void-tooltip'
										data-tooltip-content={isExpanded ? 'Hide Config' : 'Show Config'}
										className={`model-card-action-btn ${hasOverrides || isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
									>
										<Plus size={14} className={`${isExpanded ? 'rotate-45' : ''} transition-transform`} />
									</button>
								)}

								{/* Delete button */}
								{type !== 'default' && type !== 'autodetected' && (
									<button
										onClick={() => { settingsStateService.deleteModel(providerName, modelName); }}
										data-tooltip-id='void-tooltip'
										data-tooltip-content='Delete'
										className={`model-card-action-btn ${hasOverrides ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
									>
										<X size={14} />
									</button>
								)}
							</div>

							{/* Model Name */}
							<div className="model-card-name">
								<span className="truncate">{modelName}</span>
								{detailAboutModel}
							</div>

							{/* Status indicator */}
							<div className="model-card-status">
								<div className={`model-card-status-dot ${value ? 'active' : ''}`} />
								<span className="model-card-status-text">
									{disabled ? 'Disabled' : value ? 'Active' : 'Hidden'}
								</span>
							</div>

							{/* Footer with toggle */}
							<div className="model-card-footer">
								<span className="model-card-switch-label">
									{disabled ? 'Enable provider' : 'Toggle visibility'}
								</span>
								<VoidSwitch
									value={value}
									onChange={() => { settingsStateService.toggleModelHidden(providerName, modelName); }}
									disabled={disabled}
									size='sm'
									data-tooltip-id='void-tooltip'
									data-tooltip-content={disabled ? `Add ${providerTitle} to enable` : value ? 'Show in Dropdown' : 'Hide from Dropdown'}
								/>
							</div>

							{/* Expanded Config */}
							{isExpanded && (
								<div className="model-card-expanded-content">
									{renderConfigCard(modelName, providerName, type)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		)}

		{/* Add Model Section */}
		{showCheckmark ? (
			<div className="p-4 bg-void-bg-2/30">
				<AnimatedCheckmarkButton text='Added' className="bg-[var(--vscode-button-background)] text-white px-3 py-1 rounded-sm" />
			</div>
		) : isAddModelOpen ? (
			<div className="p-4 bg-void-bg-2/30 animate-in fade-in slide-in-from-top-2 duration-200">
				<form className="flex items-center gap-3">

					{/* Provider dropdown */}
					<ErrorBoundary>
						<VoidCustomDropdownBox
							options={providersToShow}
							selectedOption={userChosenProviderName}
							onChangeOption={(pn) => setUserChosenProviderName(pn)}
							getOptionDisplayName={(pn) => pn ? displayInfoOfProviderName(pn).title : 'Select Provider'}
							getOptionDropdownName={(pn) => pn ? displayInfoOfProviderName(pn).title : 'Select Provider'}
							getOptionsEqual={(a, b) => a === b}
							className="w-40 bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
							arrowTouchesText={false}
						/>
					</ErrorBoundary>

					{/* Model name input */}
					<ErrorBoundary>
						<VoidSimpleInputBox
							value={modelName}
							compact={true}
							onChangeValue={setModelName}
							placeholder='Model Name (e.g. gpt-4)'
							className='w-64 !bg-void-bg-1 !border-void-border-2 rounded-lg text-sm'
						/>
					</ErrorBoundary>

					{/* Add button */}
					<ErrorBoundary>
						<AddButton
							type='button'
							disabled={!modelName || !userChosenProviderName}
							onClick={handleAddModel}
						/>
					</ErrorBoundary>

					{/* X button to cancel */}
					<button
						type="button"
						onClick={() => {
							setIsAddModelOpen(false);
							setErrorString('');
							setModelName('');
							setUserChosenProviderName(null);
						}}
						className='text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md hover:bg-void-bg-3 transition-colors'
					>
						<X className='size-4' />
					</button>
				</form>

				{errorString && (
					<div className='text-red-500 text-xs mt-2 ml-1'>
						{errorString}
					</div>
				)}
			</div>
		) : (
			<div
				className="p-3 px-4 text-sm text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 cursor-pointer transition-colors flex items-center gap-2"
				onClick={() => setIsAddModelOpen(true)}
			>
				<Plus size={16} />
				<span>Add custom model</span>
			</div>
		)}

	</div>
}

// providers

const ProviderSetting = ({ providerName, settingName, subTextMd }: { providerName: ProviderName, settingName: SettingName, subTextMd: React.ReactNode }) => {

	const { title: settingTitle, placeholder, isPasswordField } = displayInfoOfSettingName(providerName, settingName)

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	const settingValue = settingsState.settingsOfProvider[providerName][settingName] as string // this should always be a string in this component
	if (typeof settingValue !== 'string') {
		console.log('Error: Provider setting had a non-string value.')
		return
	}

	// Create a stable callback reference using useCallback with proper dependencies
	const handleChangeValue = useCallback((newVal: string) => {
		voidSettingsService.setSettingOfProvider(providerName, settingName, newVal)
	}, [voidSettingsService, providerName, settingName]);

	return <ErrorBoundary>
		<div className='my-1'>
			<VoidSimpleInputBox
				value={settingValue}
				onChangeValue={handleChangeValue}
				placeholder={`${settingTitle} (${placeholder})`}
				passwordBlur={isPasswordField}
				compact={true}
			/>
			{!subTextMd ? null : <div className='py-1 px-3 text-void-fg-4/50 text-sm'>
				{subTextMd}
			</div>}
		</div>
	</ErrorBoundary>
}

// const OldSettingsForProvider = ({ providerName, showProviderTitle }: { providerName: ProviderName, showProviderTitle: boolean }) => {
// 	const voidSettingsState = useSettingsState()

// 	const needsModel = isProviderNameDisabled(providerName, voidSettingsState) === 'addModel'

// 	// const accessor = useAccessor()
// 	// const voidSettingsService = accessor.get('IVoidSettingsService')

// 	// const { enabled } = voidSettingsState.settingsOfProvider[providerName]
// 	const settingNames = customSettingNamesOfProvider(providerName)

// 	const { title: providerTitle } = displayInfoOfProviderName(providerName)

// 	return <div className='my-4'>

// 		<div className='flex items-center w-full gap-4'>
// 			{showProviderTitle && <h3 className='text-xl truncate'>{providerTitle}</h3>}

// 			{/* enable provider switch */}
// 			{/* <VoidSwitch
// 				value={!!enabled}
// 				onChange={
// 					useCallback(() => {
// 						const enabledRef = voidSettingsService.state.settingsOfProvider[providerName].enabled
// 						voidSettingsService.setSettingOfProvider(providerName, 'enabled', !enabledRef)
// 					}, [voidSettingsService, providerName])}
// 				size='sm+'
// 			/> */}
// 		</div>

// 		<div className='px-0'>
// 			{/* settings besides models (e.g. api key) */}
// 			{settingNames.map((settingName, i) => {
// 				return <ProviderSetting key={settingName} providerName={providerName} settingName={settingName} />
// 			})}

// 			{needsModel ?
// 				providerName === 'ollama' ?
// 					<WarningBox text={`Please install an Ollama model. We'll auto-detect it.`} />
// 					: <WarningBox text={`Please add a model for ${providerTitle} (Models section).`} />
// 				: null}
// 		</div>
// 	</div >
// }


// ========================================================
// Composio App Marketplace Settings Section
// ========================================================

const ComposioSettingsSection = ({
	settingsState,
	voidSettingsService,
	isDark,
}: {
	settingsState: ReturnType<typeof useSettingsState>,
	voidSettingsService: IVoidSettingsService,
	isDark: boolean,
}) => {
	const composioState = useComposioServiceState()
	const accessor = useAccessor()
	const composioService = accessor.get('IComposioService')

	const [isLoadingToolkits, setIsLoadingToolkits] = useState(false)
	const [apiKey, setApiKey] = useState(settingsState.globalSettings.composioApiKey || '')
	const [isConnecting, setIsConnecting] = useState<string | null>(null) // toolkit slug being connected
	const [connectionError, setConnectionError] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

	// Get all unique categories from toolkits
	const allCategories = React.useMemo(() => {
		const categories = new Set<string>()
		for (const toolkit of composioState.toolkits) {
			if (toolkit.categories) {
				for (const cat of toolkit.categories) {
					categories.add(cat)
				}
			}
		}
		return Array.from(categories).sort()
	}, [composioState.toolkits])

	// Filter toolkits by search and category
	const filteredToolkits = React.useMemo(() => {
		let filtered = composioState.toolkits.filter(t => t.status === 'active')

		// Filter by search query
		if (searchQuery) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(t =>
				t.name.toLowerCase().includes(query) ||
				t.slug.toLowerCase().includes(query) ||
				t.description?.toLowerCase().includes(query)
			)
		}

		// Filter by category
		if (selectedCategory) {
			filtered = filtered.filter(t =>
				t.categories?.includes(selectedCategory)
			)
		}

		return filtered
	}, [composioState.toolkits, searchQuery, selectedCategory])

	// Load toolkits when API key is set
	useEffect(() => {
		if (settingsState.globalSettings.composioApiKey && composioState.toolkits.length === 0) {
			composioService.fetchToolkits()
		}
	}, [settingsState.globalSettings.composioApiKey])

	const handleSaveApiKey = async () => {
		await voidSettingsService.setGlobalSetting('composioApiKey', apiKey)
		// Fetch toolkits after saving API key
		setIsLoadingToolkits(true)
		try {
			await composioService.fetchToolkits()
		} finally {
			setIsLoadingToolkits(false)
		}
	}

	const handleConnect = async (toolkitSlug: string) => {
		setIsConnecting(toolkitSlug)
		setConnectionError(null)
		try {
			console.log('[Settings] Initiating connection for:', toolkitSlug)
			const result = await composioService.initiateConnection(toolkitSlug)
			console.log('[Settings] Connection result:', result)

			if (result.error) {
				setConnectionError(result.error)
				setIsConnecting(null)
				return
			}

			if (result.redirectUrl) {
				// Open the OAuth URL in a browser
				console.log('[Settings] Opening OAuth URL:', result.redirectUrl)
				const uri = URI.parse(result.redirectUrl)
				const commandService = accessor.get('ICommandService')
				await commandService.executeCommand('vscode.open', uri)

				// Poll for connection completion using the connection ID
				// The API returns an ID that can be polled for status
				const connectionId = result.id || result.connectedAccountId

				if (connectionId) {
					console.log('[Settings] Polling for connection completion, ID:', connectionId)
					// Poll for connection completion (up to 60 seconds)
					const connection = await composioService.waitForConnection(connectionId, 60000)
					console.log('[Settings] Poll result:', connection)

					if (connection && connection.status === 'active') {
						// Save the connection
						const connections = { ...settingsState.globalSettings.composioConnections }
						connections[toolkitSlug] = connection.connectedAccountId || connection.id
						await voidSettingsService.setGlobalSetting('composioConnections', connections)
						console.log('[Settings] Connection saved:', toolkitSlug, '->', connection.connectedAccountId || connection.id)
					} else {
						console.log('[Settings] Connection poll timed out or failed')
						setConnectionError('Connection timed out. Please complete the authorization in your browser, then click "Refresh Connections" below.')
					}
				} else {
					// No connection ID - user needs to complete auth in browser and manually refresh
					console.log('[Settings] No connection ID returned, showing manual refresh message')
					setConnectionError('Please complete the authorization in your browser, then click "Refresh Connections" below.')
				}
			} else {
				setConnectionError('No redirect URL received. Please try again.')
			}
		} catch (error) {
			console.error('[Settings] Failed to initiate connection:', error)
			setConnectionError(error instanceof Error ? error.message : 'Failed to connect. Please try again.')
		} finally {
			setIsConnecting(null)
		}
	}

	const handleRefreshConnections = async () => {
		setIsLoadingToolkits(true)
		try {
			// Fetch all connections from Composio
			const connections = await composioService.listConnections()

			// Build a map of toolkit slug -> connected account ID
			const connectionMap: { [toolkitSlug: string]: string } = {}
			for (const conn of connections) {
				if (conn.status === 'active' && conn.connectedAccountId && conn.toolkitSlug) {
					connectionMap[conn.toolkitSlug] = conn.connectedAccountId
				}
			}

			// Save to settings
			await voidSettingsService.setGlobalSetting('composioConnections', connectionMap)
		} catch (error) {
			console.error('Failed to refresh connections:', error)
		} finally {
			setIsLoadingToolkits(false)
		}
	}

	const handleDisconnect = async (toolkitSlug: string) => {
		const connections = { ...settingsState.globalSettings.composioConnections }
		delete connections[toolkitSlug]
		await voidSettingsService.setGlobalSetting('composioConnections', connections)

		// Also remove from enabled toolkits
		const enabled = settingsState.globalSettings.composioEnabledToolkits.filter(s => s !== toolkitSlug)
		await voidSettingsService.setGlobalSetting('composioEnabledToolkits', enabled)
	}

	const handleToggleToolkit = async (toolkitSlug: string, enabled: boolean) => {
		if (enabled) {
			await composioService.enableToolkit(toolkitSlug)
		} else {
			await composioService.disableToolkit(toolkitSlug)
		}
	}

	const isConnected = (toolkitSlug: string) => {
		return !!settingsState.globalSettings.composioConnections[toolkitSlug]
	}

	const isEnabled = (toolkitSlug: string) => {
		return settingsState.globalSettings.composioEnabledToolkits.includes(toolkitSlug)
	}

	return (
		<section className="space-y-6">
			<div className="mb-6">
				<h2 className="text-xl font-medium text-void-fg-1">App Marketplace</h2>
				<p className="text-sm text-void-fg-3 mt-1">Connect to 300+ apps through Composio for enhanced agent capabilities.</p>
			</div>

			{/* API Key Configuration */}
			<SettingCard
				isDark={isDark}
				title="Composio API Key"
				description="Your Composio API key enables access to the app marketplace. Get your key at composio.dev"
			>
				<SettingBox>
					<div className="flex items-center gap-3">
						<VoidSimpleInputBox
							passwordBlur={true}
							placeholder="composio_..."
							value={apiKey}
							onChangeValue={setApiKey}
							className="flex-1"
							compact={true}
						/>
						<SettingsButton
							variant="primary"
							onClick={handleSaveApiKey}
							disabled={apiKey === settingsState.globalSettings.composioApiKey}
						>
							Save
						</SettingsButton>
					</div>
					{!settingsState.globalSettings.composioApiKey && (
						<p className="text-xs text-void-fg-3 mt-2">
							<a href="https://composio.dev" target="_blank" rel="noopener noreferrer" className="text-void-accent hover:underline">
								Get your API key at composio.dev <ExternalLink size={12} className="inline" />
							</a>
						</p>
					)}
				</SettingBox>
			</SettingCard>

			{/* Available Apps */}
			{settingsState.globalSettings.composioApiKey && (
				<SettingCard
					isDark={isDark}
					title="Available Apps"
					description="Browse and connect apps from the Composio marketplace."
				>
					<SettingBox>
						{/* Refresh button row */}
						<div className="flex items-center justify-between mb-4">
							<p className="text-xs text-void-fg-3">
								{Object.keys(settingsState.globalSettings.composioConnections).length} apps connected • {composioState.toolkits.length} available
							</p>
							<SettingsButton
								variant="secondary"
								className="text-xs"
								onClick={handleRefreshConnections}
								disabled={isLoadingToolkits}
							>
								<RefreshCw size={12} className="mr-1" />
								Refresh
							</SettingsButton>
						</div>

						{/* Search and filter */}
						{composioState.toolkits.length > 0 && (
							<div className="space-y-3 mb-4">
								{/* Search input */}
								<div className="relative">
									<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-void-fg-3" />
									<VoidSimpleInputBox
										type="text"
										placeholder="Search apps..."
										value={searchQuery}
										onChangeValue={setSearchQuery}
										className="pl-8 w-full"
										compact={true}
									/>
								</div>

								{/* Category filters */}
								{allCategories.length > 0 && (
									<div className="flex flex-wrap gap-1.5">
										<SettingsButton
											variant={selectedCategory === null ? 'primary' : 'secondary'}
											className="text-xs px-2 py-0.5"
											onClick={() => setSelectedCategory(null)}
										>
											All
										</SettingsButton>
										{allCategories.slice(0, 10).map(category => (
											<SettingsButton
												key={category}
												variant={selectedCategory === category ? 'primary' : 'secondary'}
												className="text-xs px-2 py-0.5"
												onClick={() => setSelectedCategory(category)}
											>
												{category}
											</SettingsButton>
										))}
										{allCategories.length > 10 && (
											<span className="text-xs text-void-fg-3 self-center">
												+{allCategories.length - 10} more
											</span>
										)}
									</div>
								)}
							</div>
						)}

						{isLoadingToolkits || composioState.isLoading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="animate-spin text-void-fg-3" size={24} />
							</div>
						) : composioState.error ? (
							<div className="text-center py-8">
								<p className="text-red-400">{composioState.error}</p>
								<SettingsButton
									variant="secondary"
									className="mt-3"
									onClick={() => composioService.fetchToolkits()}
								>
									Retry
								</SettingsButton>
							</div>
						) : composioState.toolkits.length === 0 ? (
							<div className="text-center py-8">
								<p className="text-void-fg-3">No apps available. Check your API key and try again.</p>
							</div>
						) : filteredToolkits.length === 0 ? (
							<div className="text-center py-8">
								<p className="text-void-fg-3">No apps match your search.</p>
							</div>
						) : (
							<div className="space-y-3 max-h-[400px] overflow-y-auto">
								{filteredToolkits.map(toolkit => (
										<div
											key={toolkit.slug}
											className="flex items-center justify-between gap-4 p-3 bg-void-bg-1 rounded-lg border border-void-border-2 hover:border-void-border-1 transition-colors"
										>
											<div className="flex items-center gap-3 flex-1 min-w-0">
												{toolkit.logo ? (
													<img
														src={toolkit.logo}
														alt={toolkit.name}
														className="w-8 h-8 rounded"
													/>
												) : (
													<div className="w-8 h-8 rounded bg-void-bg-3 flex items-center justify-center">
														<Plug size={16} className="text-void-fg-3" />
													</div>
												)}
												<div className="flex-1 min-w-0">
													<h4 className="text-sm font-medium text-void-fg-1 truncate">{toolkit.name}</h4>
													<p className="text-xs text-void-fg-3 truncate">
														{toolkit.toolsCount} tools {isConnected(toolkit.slug) && (
															<span className="text-green-400 ml-2">Connected</span>
														)}
													</p>
												</div>
											</div>

											<div className="flex items-center gap-2">
												{isConnected(toolkit.slug) ? (
													<>
														<VoidSwitch
															size='sm'
															value={isEnabled(toolkit.slug)}
															onChange={(val) => handleToggleToolkit(toolkit.slug, val)}
															data-tooltip-id='void-tooltip'
															data-tooltip-content={isEnabled(toolkit.slug) ? 'Disable for agent' : 'Enable for agent'}
														/>
														<SettingsButton
															variant="danger"
															onClick={() => handleDisconnect(toolkit.slug)}
															className="px-2 py-1 text-xs"
														>
															Disconnect
														</SettingsButton>
													</>
												) : (
													<SettingsButton
														variant="secondary"
														onClick={() => handleConnect(toolkit.slug)}
														disabled={isConnecting === toolkit.slug}
														className="px-3 py-1 text-xs"
													>
														{isConnecting === toolkit.slug ? (
															<Loader2 className="animate-spin" size={14} />
														) : (
															'Connect'
														)}
													</SettingsButton>
												)}
											</div>
										</div>
									))}
							</div>
						)}

						{connectionError && (
							<div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
								<p className="text-sm text-red-400">{connectionError}</p>
							</div>
						)}
					</SettingBox>
				</SettingCard>
			)}

			{/* Connected Apps */}
			{Object.keys(settingsState.globalSettings.composioConnections).length > 0 && (
				<SettingCard
					isDark={isDark}
					title="Connected Apps"
					description="Apps currently connected and available to your AI assistant."
				>
					<SettingBox>
						<div className="space-y-2">
							{Object.entries(settingsState.globalSettings.composioConnections).map(([slug, accountId]) => {
								const toolkit = composioState.toolkits.find(t => t.slug === slug)
								return (
									<div
										key={slug}
										className="flex items-center justify-between gap-3 p-2 bg-void-bg-1 rounded border border-void-border-2"
									>
										<div className="flex items-center gap-2">
											{toolkit?.logo ? (
												<img src={toolkit.logo} alt={toolkit.name} className="w-5 h-5 rounded" />
											) : (
												<div className="w-5 h-5 rounded bg-void-bg-3" />
											)}
											<span className="text-sm text-void-fg-1">{toolkit?.name || slug}</span>
										</div>
										<div className="flex items-center gap-2">
											<span className={`text-xs px-2 py-0.5 rounded ${isEnabled(slug) ? 'bg-green-500/20 text-green-400' : 'bg-void-bg-3 text-void-fg-3'}`}>
												{isEnabled(slug) ? 'Enabled' : 'Disabled'}
											</span>
											<button
												onClick={() => handleDisconnect(slug)}
												className="text-void-fg-3 hover:text-red-400 p-1"
											>
												<X size={14} />
											</button>
										</div>
									</div>
								)
							})}
						</div>
					</SettingBox>
				</SettingCard>
			)}

			{/* Trigger Webhooks Configuration */}
			{settingsState.globalSettings.composioApiKey && (
				<SettingCard
					isDark={isDark}
					title="Trigger Webhooks"
					description="Configure webhooks to receive real-time events from connected apps (GitHub, Jira, Slack, etc.)."
				>
					<SettingBox className={settingsState.globalSettings.composioTriggersEnabled ? 'bg-green-500/5 border-green-500/20' : ''}>
						<SettingRow label="Enable Trigger Webhooks">
							<VoidSwitch
								size='sm'
								value={!!settingsState.globalSettings.composioTriggersEnabled}
								onChange={(newValue) => voidSettingsService.setGlobalSetting('composioTriggersEnabled', newValue)}
							/>
						</SettingRow>
						<p className="text-xs text-void-fg-3 mt-2">
							When enabled, A-Coder can receive real-time events from connected apps (e.g., GitHub push, Jira ticket update).
						</p>
					</SettingBox>

					{settingsState.globalSettings.composioTriggersEnabled && (
						<div className="mt-4 space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<SettingBox>
									<div className="flex items-center justify-between mb-2">
										<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Webhook Port</label>
										<span className="text-[10px] text-void-fg-4">Defaults to API port</span>
									</div>
									<VoidSimpleInputBox
										placeholder="3000"
										value={settingsState.globalSettings.composioTriggerPort?.toString() || ''}
										onChangeValue={(val) => {
											const port = parseInt(val);
											if (!isNaN(port) && port >= 1 && port <= 65535) {
												voidSettingsService.setGlobalSetting('composioTriggerPort', port);
											} else if (val === '') {
												voidSettingsService.setGlobalSetting('composioTriggerPort', undefined);
											}
										}}
									/>
									<p className="text-[10px] text-void-fg-4 mt-1.5 italic">Uses API server port if not specified</p>
								</SettingBox>

								<SettingBox>
									<div className="flex items-center justify-between mb-2">
										<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Webhook Secret</label>
									</div>
									<VoidSimpleInputBox
										type="password"
										placeholder="Auto-generated if empty"
										value={settingsState.globalSettings.composioTriggerSecret || ''}
										onChangeValue={(val) => voidSettingsService.setGlobalSetting('composioTriggerSecret', val || undefined)}
									/>
									<p className="text-[10px] text-void-fg-4 mt-1.5 italic">Secret for verifying webhook signatures</p>
								</SettingBox>
							</div>

							<SettingBox>
								<div className="flex items-center justify-between mb-2">
									<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Tunnel URL (Optional)</label>
									{settingsState.globalSettings.composioTriggerTunnelUrl && (
										<button
											type="button"
											onClick={() => clipboardService?.writeText(settingsState.globalSettings.composioTriggerTunnelUrl!)}
											className="text-void-fg-3 hover:text-void-fg-1 p-1 rounded transition-colors"
											title="Copy Tunnel URL"
										>
											<Copy size={12} />
										</button>
									)}
								</div>
								<VoidSimpleInputBox
									placeholder="https://your-tunnel.trycloudflare.com"
									value={settingsState.globalSettings.composioTriggerTunnelUrl || ''}
									onChangeValue={(val) => voidSettingsService.setGlobalSetting('composioTriggerTunnelUrl', val || undefined)}
								/>
								<p className="text-[10px] text-void-fg-4 mt-1.5">
									External URL for receiving webhooks. Use a tunnel like{' '}
									<a
										href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/"
										target="_blank"
										rel="noopener noreferrer"
										className="text-void-accent hover:underline"
									>
										Cloudflare Tunnel <ExternalLink size={10} className="inline" />
									</a>
									{' '}for local development.
								</p>
							</SettingBox>

							<div className="bg-void-bg-2/50 rounded-lg p-3 border border-void-border-2">
								<h4 className="text-sm font-medium text-void-fg-2 mb-2">Webhook Endpoint</h4>
								<p className="text-xs text-void-fg-3 mb-2">
									Configure this URL in Composio to receive trigger events:
								</p>
								<code className="text-xs bg-void-bg-1 px-2 py-1 rounded block overflow-x-auto">
									{settingsState.globalSettings.composioTriggerTunnelUrl || `http://localhost:${settingsState.globalSettings.composioTriggerPort || settingsState.globalSettings.apiPort || 3000}`}/api/v1/composio/triggers
								</code>
							</div>
						</div>
					)}
				</SettingCard>
			)}
		</section>
	)
}


export const SettingsForProvider = ({ providerName, showProviderTitle, showProviderSuggestions }: { providerName: ProviderName, showProviderTitle: boolean, showProviderSuggestions: boolean }) => {
	const voidSettingsState = useSettingsState()

	const needsModel = isProviderNameDisabled(providerName, voidSettingsState) === 'addModel'

	const settingNames = customSettingNamesOfProvider(providerName)

	const { title: providerTitle } = displayInfoOfProviderName(providerName)

	return <div className="space-y-3">

		<div className='flex items-center w-full gap-4'>
			{showProviderTitle && <h3 className='text-sm font-semibold text-void-fg-1 uppercase tracking-wider'>{providerTitle}</h3>}
		</div>

		<div className='space-y-2'>
			{/* settings besides models (e.g. api key) */}
			{settingNames.map((settingName, i) => {

				return <ProviderSetting
					key={settingName}
					providerName={providerName}
					settingName={settingName}
					subTextMd={i !== settingNames.length - 1 ? null
						: <ChatMarkdownRender string={subTextMdOfProviderName(providerName)} chatMessageLocation={undefined} />}
				/>
			})}

			{showProviderSuggestions && needsModel ?
				providerName === 'ollama' ?
					<WarningBox className="pl-2" text={`Please install an Ollama model. We'll auto-detect it.`} />
					: <WarningBox className="pl-2" text={`Please add a model for ${providerTitle} (Models section).`} />
				: null}
		</div>
	</div >
}


// A-Coder Provider Card - Special UI for OAuth authentication (disabled for now)
// const ACoderProviderCard = () => {
// 	const accessor = useAccessor()
// 	const metricsService = accessor.get('IMetricsService')
// 	const oauthService = accessor.get('IACoderOAuthService')
// 	const authState = useACoderOAuthState()
// 	const models = useACoderModels()

// 	const [isLoading, setIsLoading] = useState(false)

// 	const handleGoogleAuth = useCallback(async () => {
// 		setIsLoading(true)
// 		metricsService.capture('Click', { action: 'A-Coder Google OAuth' })
// 		try {
// 			await oauthService.initiateGoogleAuth()
// 		} catch (error) {
// 			console.error('Google OAuth failed:', error)
// 		} finally {
// 			setIsLoading(false)
// 		}
// 	}, [oauthService, metricsService])

// 	const handleGitHubAuth = useCallback(async () => {
// 		setIsLoading(true)
// 		metricsService.capture('Click', { action: 'A-Coder GitHub OAuth' })
// 		try {
// 			await oauthService.initiateGitHubAuth()
// 		} catch (error) {
// 			console.error('GitHub OAuth failed:', error)
// 		} finally {
// 			setIsLoading(false)
// 		}
// 	}, [oauthService, metricsService])

// 	const handleSignOut = useCallback(async () => {
// 		metricsService.capture('Click', { action: 'A-Coder Sign Out' })
// 		try {
// 			await oauthService.signOut()
// 		} catch (error) {
// 			console.error('Sign out failed:', error)
// 		}
// 	}, [oauthService, metricsService])

// 	if (!authState.isAuthenticated) {
// 		return (
// 			<div className="space-y-3">
// 				<div className='flex items-center w-full gap-4'>
// 					<h3 className='text-sm font-semibold text-void-fg-1 uppercase tracking-wider'>A-Coder</h3>
// 				</div>
// 				<div className="space-y-2">
// 					<p className="text-sm text-void-fg-3">Sign in to use A-Coder models for free</p>
// 					<div className="flex gap-2 flex-wrap">
// 						<VoidButtonBgDarken
// 							onClick={handleGoogleAuth}
// 							disabled={isLoading}
// 							className="flex items-center gap-2"
// 						>
// 							{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
// 							<span>Sign in with Google</span>
// 						</VoidButtonBgDarken>
// 						<VoidButtonBgDarken
// 							onClick={handleGitHubAuth}
// 							disabled={isLoading}
// 							className="flex items-center gap-2"
// 						>
// 							{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
// 							<span>Sign in with GitHub</span>
// 						</VoidButtonBgDarken>
// 					</div>
// 					<p className="text-xs text-void-fg-4">
// 						By signing in, you agree to use A-Coder models responsibly.
// 					</p>
// 				</div>
// 			</div>
// 		)
// 	}

// 	return (
// 		<div className="space-y-3">
// 			<div className='flex items-center w-full gap-4'>
// 				<h3 className='text-sm font-semibold text-void-fg-1 uppercase tracking-wider'>A-Coder</h3>
// 			</div>
// 			<div className="space-y-2">
// 				<div className="flex items-center justify-between">
// 					<div className="flex items-center gap-2 text-sm text-void-fg-2">
// 						<User className="w-4 h-4" />
// 						<span>Signed in as {authState.userEmail}</span>
// 					</div>
// 					<VoidButtonBgDarken
// 						onClick={handleSignOut}
// 						className="flex items-center gap-1 text-xs"
// 					>
// 						<LogOut className="w-3 h-3" />
// 						<span>Sign out</span>
// 					</VoidButtonBgDarken>
// 				</div>

// 				{/* Show models if available */}
// 				{models.length > 0 && (
// 					<div className="pt-2">
// 						<p className="text-xs text-void-fg-3 mb-1">Available models:</p>
// 						<div className="flex flex-wrap gap-1">
// 							{models.filter(m => !m.isHidden).map(model => (
// 								<span
// 									key={model.id}
// 									className="px-2 py-0.5 bg-void-bg-2 text-void-fg-2 rounded-sm text-xs"
// 								>
// 									{model.name}
// 								</span>
// 							))}
// 						</div>
// 					</div>
// 				)}

// 				{models.length === 0 && (
// 					<p className="text-xs text-void-fg-4">
// 						No models available. Models will be fetched after authentication.
// 					</p>
// 				)}
// 			</div>
// 		</div>
// 	)
// }


// DISABLED: A-Coder OAuth provider - commented out to prevent memory leaks
// export const VoidProviderSettings = ({ providerNames }: { providerNames: ProviderName[] }) => {
// 	return <div className="space-y-4">
// 		{providerNames.map(providerName =>
// 			<SettingBox key={providerName}>
// 				{providerName === 'aCoder' ? (
// 					// <ACoderProviderCard />
// 					<p className="text-sm text-void-fg-3">A-Coder provider coming soon</p>
// 				) : (
// 					<SettingsForProvider providerName={providerName} showProviderTitle={true} showProviderSuggestions={true} />
// 				)}
// 			</SettingBox>
// 		)}
// 	</div>
// }

// Re-enabled without aCoder OAuth
export const VoidProviderSettings = ({ providerNames }: { providerNames: ProviderName[] }) => {
	return <div className="space-y-4">
		{providerNames.map(providerName =>
			<SettingBox key={providerName}>
				<SettingsForProvider providerName={providerName} showProviderTitle={true} showProviderSuggestions={true} />
			</SettingBox>
		)}
	</div>
}


type TabName = 'models' | 'general'
export const AutoDetectLocalModelsToggle = () => {
	const settingName: GlobalSettingName = 'autoRefreshModels'

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const metricsService = accessor.get('IMetricsService')

	const voidSettingsState = useSettingsState()

	// right now this is just `enabled_autoRefreshModels`
	const enabled = voidSettingsState.globalSettings[settingName]

	return (
		<SettingRow
			label="Auto-detect local models"
			description={`Automatically detect local providers and models (${refreshableProviderNames.map(providerName => displayInfoOfProviderName(providerName).title).join(', ')}).`}
		>
			<VoidSwitch
				size='sm'
				value={enabled}
				onChange={(newVal) => {
					voidSettingsService.setGlobalSetting(settingName, newVal)
					metricsService.capture('Click', { action: 'Autorefresh Toggle', settingName, enabled: newVal })
				}}
			/>
		</SettingRow>
	)
}

export const AIInstructionsBox = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	return <VoidInputBox2
		className='min-h-[81px] p-3 rounded-sm'
		initValue={voidSettingsState.globalSettings.aiInstructions}
		placeholder={`Do not change my indentation or delete my comments. When writing TS or JS, do not add ;'s. Write new code using Rust if possible. `}
		multiline
		onChangeText={(newText) => {
			voidSettingsService.setGlobalSetting('aiInstructions', newText)
		}}
	/>
}

const FastApplyMethodDropdown = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')

	const options = useMemo(() => [true, false], [])

	const onChangeOption = useCallback((newVal: boolean) => {
		voidSettingsService.setGlobalSetting('enableFastApply', newVal)
	}, [voidSettingsService])

	return <VoidCustomDropdownBox
		className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-1 rounded p-0.5 px-1'
		options={options}
		selectedOption={voidSettingsService.state.globalSettings.enableFastApply}
		onChangeOption={onChangeOption}
		getOptionDisplayName={(val) => val ? 'Fast Apply' : 'Slow Apply'}
		getOptionDropdownName={(val) => val ? 'Fast Apply' : 'Slow Apply'}
		getOptionDropdownDetail={(val) => val ? 'Output ORIGINAL/UPDATED blocks' : 'Rewrite whole files'}
		getOptionsEqual={(a, b) => a === b}
	/>

}


export const OllamaSetupInstructions = ({ sayWeAutoDetect }: { sayWeAutoDetect?: boolean }) => {
	return <div className='prose-p:my-0 prose-ol:list-decimal prose-p:py-0 prose-ol:my-0 prose-ol:py-0 prose-span:my-0 prose-span:py-0 text-void-fg-3 text-sm list-decimal select-text'>
		<div className=''><ChatMarkdownRender string={`Ollama Setup Instructions`} chatMessageLocation={undefined} /></div>
		<div className=' pl-6'><ChatMarkdownRender string={`1. Download [Ollama](https://ollama.com/download).`} chatMessageLocation={undefined} /></div>
		<div className=' pl-6'><ChatMarkdownRender string={`2. Open your terminal.`} chatMessageLocation={undefined} /></div>
		<div
			className='pl-6 flex items-center w-fit'
			data-tooltip-id='void-tooltip-ollama-settings'
		>
			<ChatMarkdownRender string={`3. Run \`ollama pull your_model\` to install a model.`} chatMessageLocation={undefined} />
		</div>
		{sayWeAutoDetect && <div className=' pl-6'><ChatMarkdownRender string={`A-Coder automatically detects locally running models and enables them.`} chatMessageLocation={undefined} /></div>}
	</div>
}


const RedoOnboardingButton = ({ className }: { className?: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	return <div
		className={`text-void-fg-4 flex flex-nowrap text-nowrap items-center hover:brightness-110 cursor-pointer ${className}`}
		onClick={() => { voidSettingsService.setGlobalSetting('isOnboardingComplete', false) }}
	>
		See onboarding screen?
	</div>

}







export const ToolApprovalTypeSwitch = ({ approvalType, size, desc }: { approvalType: ToolApprovalType, size: "xxs" | "xs" | "sm" | "sm+" | "md", desc: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	const metricsService = accessor.get('IMetricsService')

	const onToggleAutoApprove = useCallback((approvalType: ToolApprovalType, newValue: boolean) => {
		voidSettingsService.setGlobalSetting('autoApprove', {
			...voidSettingsService.state.globalSettings.autoApprove,
			[approvalType]: newValue
		})
		metricsService.capture('Tool Auto-Accept Toggle', { enabled: newValue })
	}, [voidSettingsService, metricsService])

	return <>
		<VoidSwitch
			size={size}
			value={voidSettingsState.globalSettings.autoApprove[approvalType] ?? false}
			onChange={(newVal) => onToggleAutoApprove(approvalType, newVal)}
		/>
		<span className="text-void-fg-3 text-xs">{desc}</span>
	</>
}



export const OneClickSwitchButton = ({ fromEditor = 'VS Code', className = '' }: { fromEditor?: TransferEditorType, className?: string }) => {
	const accessor = useAccessor()
	const extensionTransferService = accessor.get('IExtensionTransferService')

	const [transferState, setTransferState] = useState<{ type: 'done', error?: string } | { type: | 'loading' | 'justfinished' }>({ type: 'done' })



	const onClick = async () => {
		if (transferState.type !== 'done') return

		setTransferState({ type: 'loading' })

		const errAcc = await extensionTransferService.transferExtensions(os, fromEditor)

		// Even if some files were missing, consider it a success if no actual errors occurred
		const hadError = !!errAcc
		if (hadError) {
			setTransferState({ type: 'done', error: errAcc })
		}
		else {
			setTransferState({ type: 'justfinished' })
			setTimeout(() => { setTransferState({ type: 'done' }); }, 3000)
		}
	}

	return <>
		<SettingsButton className={`w-full py-3 px-4 ${className}`} disabled={transferState.type !== 'done'} onClick={onClick} variant="secondary">
			{transferState.type === 'done' ? (
				<>
					<ArrowRightLeft size={16} className="text-void-accent/80" />
					<span>Transfer from {fromEditor}</span>
				</>
			)
				: transferState.type === 'loading' ? <span className='text-nowrap flex flex-nowrap items-center gap-2'>Transferring<IconLoading /></span>
					: transferState.type === 'justfinished' ? <AnimatedCheckmarkButton text='Settings Transferred' className='bg-none' />
						: null
			}
		</SettingsButton>
		{transferState.type === 'done' && transferState.error ? <WarningBox text={transferState.error} /> : null}
	</>
}


// full settings

// MCP Server component
const MCPServerComponent = ({ name, server }: { name: string, server: MCPServer }) => {
	const accessor = useAccessor();
	const mcpService = accessor.get('IMCPService');

	const voidSettings = useSettingsState()
	const isOn = voidSettings.mcpUserStateOfName[name]?.isOn

	// No longer using prefixes, just display the tool name as-is
	const removeUniquePrefix = (name: string) => name

	return (
		<div className="void-card py-3 px-4 my-2">
			<div className="flex items-center justify-between">
				{/* Left side - status and name */}
				<div className="flex items-center gap-2">
					{/* Status indicator */}
					<div className={`w-2 h-2 rounded-full
						${server.status === 'success' ? 'bg-green-500'
							: server.status === 'error' ? 'bg-red-500'
								: server.status === 'loading' ? 'bg-yellow-500'
									: server.status === 'offline' ? 'bg-void-fg-3'
										: ''}
					`}></div>

					{/* Server name */}
					<div className="text-sm font-medium text-void-fg-1">{name}</div>
				</div>

				{/* Right side - power toggle switch */}
				<VoidSwitch
					value={isOn ?? false}
					size='xs'
					disabled={server.status === 'error'}
					onChange={() => mcpService.toggleServerIsOn(name, !isOn)}
				/>
			</div>

			{/* Tools section */}
			{isOn && (
				<div className="mt-3">
					<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
						{(server.tools ?? []).length > 0 ? (
							(server.tools ?? []).map((tool: { name: string; description?: string }) => (
								<span
									key={tool.name}
									className="px-2 py-0.5 bg-void-bg-2 text-void-fg-3 rounded-sm text-xs"

									data-tooltip-id='void-tooltip'
									data-tooltip-content={tool.description || ''}
									data-tooltip-class-name='void-max-w-[300px]'
								>
									{removeUniquePrefix(tool.name)}
								</span>
							))
						) : (
							<span className="text-xs text-void-fg-3">No tools available</span>
						)}
					</div>
				</div>
			)}

			{/* Command badge */}
			{isOn && server.command && (
				<div className="mt-3">
					<div className="text-xs text-void-fg-3 mb-1">Command:</div>
					<div className="px-2 py-1 bg-void-bg-2 text-xs font-mono overflow-x-auto whitespace-nowrap text-void-fg-2 rounded-sm">
						{server.command}
					</div>
				</div>
			)}

			{/* Error message if present */}
			{server.error && (
				<div className="mt-3">
					<WarningBox text={server.error} />
				</div>
			)}
		</div>
	);
};

// Main component that renders the list of servers
const MCPServersList = () => {
	const mcpServiceState = useMCPServiceState()

	let content: React.ReactNode
	if (mcpServiceState.error) {
		content = <div className="text-void-fg-3 text-sm mt-2">
			{mcpServiceState.error}
		</div>
	}
	else {
		const entries = Object.entries(mcpServiceState.mcpServerOfName)
		if (entries.length === 0) {
			content = <div className="text-void-fg-3 text-sm mt-2">
				No servers found
			</div>
		}
		else {
			content = entries.map(([name, server]) => (
				<MCPServerComponent key={name} name={name} server={server} />
			))
		}
	}

	return <div className="my-2">{content}</div>
};

// Skill registry entry interface
interface SkillRegistryEntry {
	id: string;
	name: string;
	description: string;
	author: string;
	version?: string;
	tags: string[];
	source: 'github';
	url: string;
	stars?: number;
	downloads?: number;
}

// Default skill registry URLs
const DEFAULT_SKILL_REGISTRIES = [
	'https://github.com/hamishfromatech/the-architect-skills/tree/main/skills'
];

// Parse YAML frontmatter from skill content
const parseSkillFrontmatter = (content: string): { name: string; description: string; version?: string; author?: string; tags?: string[] } => {
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (!frontmatterMatch) {
		// No frontmatter, extract from content
		const lines = content.split('\n').filter(l => l.trim().length > 0);
		const nameMatch = content.match(/^#\s+(.+)$/m);
		const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
		const description = lines.find(l => !l.trim().startsWith('#') && l.trim().length > 0) || 'No description available.';
		return { name, description: description.substring(0, 150) };
	}

	const yaml = frontmatterMatch[1];
	const markdown = frontmatterMatch[2];
	const metadata: { name: string; description: string; version?: string; author?: string; tags?: string[] } = {
		name: '',
		description: ''
	};

	// Parse YAML
	for (const line of yaml.split('\n')) {
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;
		const key = line.substring(0, colonIndex).trim();
		const value = line.substring(colonIndex + 1).trim();

		switch (key) {
			case 'name':
				metadata.name = value;
				break;
			case 'description':
				metadata.description = value;
				break;
			case 'version':
				metadata.version = value;
				break;
			case 'author':
				metadata.author = value;
				break;
			case 'tags':
				if (value.startsWith('[') && value.endsWith(']')) {
					metadata.tags = value.slice(1, -1).split(',').map(t => t.trim().replace(/['"]/g, ''));
				}
				break;
		}
	}

	// Fallback to markdown content for name/description
	if (!metadata.name) {
		const nameMatch = markdown.match(/^#\s+(.+)$/m);
		metadata.name = nameMatch ? nameMatch[1].trim() : 'Unknown';
	}
	if (!metadata.description) {
		const lines = markdown.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
		metadata.description = lines[0]?.substring(0, 150) || 'No description available.';
	}

	return metadata;
};

// Fetch skills from GitHub registry
const fetchSkillsFromRegistry = async (registryUrl: string): Promise<SkillRegistryEntry[]> => {
	const skills: SkillRegistryEntry[] = [];

	// Parse GitHub URL: https://github.com/owner/repo/tree/branch/path
	const githubMatch = registryUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?(?:\/(.+))?/);
	if (!githubMatch) {
		console.warn(`Invalid GitHub registry URL: ${registryUrl}`);
		return skills;
	}

	const [, owner, repo, branch = 'main', basePath = ''] = githubMatch;

	try {
		// Use GitHub API to list contents
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${basePath ? '/' + basePath : ''}${branch !== 'main' ? `?ref=${branch}` : ''}`;
		const response = await fetch(apiUrl);

		if (!response.ok) {
			console.warn(`Failed to fetch registry from ${apiUrl}: ${response.status}`);
			return skills;
		}

		const contents = await response.json();

		// Filter directories (potential skills)
		const skillDirs = Array.isArray(contents)
			? contents.filter((item: any) => item.type === 'dir')
			: [];

		// Fetch SKILL.md from each directory
		for (const skillDir of skillDirs) {
			const skillName = skillDir.name;
			try {
				// Fetch SKILL.md content
				const skillMdUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${basePath ? basePath + '/' : ''}${skillName}/SKILL.md`;
				const skillMdResponse = await fetch(skillMdUrl);

				if (skillMdResponse.ok) {
					const skillContent = await skillMdResponse.text();
					const metadata = parseSkillFrontmatter(skillContent);

					skills.push({
						id: skillName,
						name: metadata.name || skillName,
						description: metadata.description || 'No description available.',
						author: metadata.author || owner,
						version: metadata.version,
						tags: metadata.tags || [],
						source: 'github',
						url: `https://github.com/${owner}/${repo}/tree/${branch}/${basePath ? basePath + '/' : ''}${skillName}`
					});
				}
			} catch (e) {
				console.warn(`Failed to fetch skill ${skillName}:`, e);
			}
		}
	} catch (error) {
		console.error('Error fetching skills from registry:', error);
	}

	return skills;
};

// Skills component with marketplace
const SkillsList = () => {
	const accessor = useAccessor();
	const fileService = accessor.get('IFileService');
	const pathService = accessor.get('IPathService');
	const notificationService = accessor.get('INotificationService');
	const isDark = useIsDark();

	const [skills, setSkills] = useState<Array<{ name: string, description: string }>>([]);
	const [loading, setLoading] = useState(true);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [newSkillName, setNewSkillName] = useState('');
	const [newSkillContent, setNewSkillContent] = useState('');
	const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
	const [installingSkill, setInstallingSkill] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [installUrl, setInstallUrl] = useState('');
	const [isInstallFromUrl, setIsInstallFromUrl] = useState(false);
	const [marketplaceSkills, setMarketplaceSkills] = useState<SkillRegistryEntry[]>([]);
	const [marketplaceLoading, setMarketplaceLoading] = useState(false);
	const [marketplaceError, setMarketplaceError] = useState<string | null>(null);

	const [userHome, setUserHome] = useState<URI | null>(null);

	useEffect(() => {
		pathService.userHome().then(setUserHome);
	}, [pathService]);

	const skillsDir = useMemo(() => userHome ? URI.joinPath(userHome, '.a-coder', 'skills') : null, [userHome]);

	const refreshSkills = useCallback(async () => {
		if (!skillsDir) return;
		setLoading(true);
		const foundSkills: Array<{ name: string, description: string }> = [];
		try {
			const stat = await fileService.resolve(skillsDir);
			if (stat.children) {
				for (const child of stat.children) {
					if (child.isDirectory) {
						const skillName = child.name;
						const skillPath = URI.joinPath(skillsDir, skillName, 'SKILL.md');
						try {
							const content = await fileService.readFile(skillPath);
							const text = content.value.toString();
							const lines = text.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
							const description = lines.length > 0 ? lines[0].substring(0, 150) : 'No description available.';
							foundSkills.push({ name: skillName, description });
						} catch (e) {
							// Skip if SKILL.md missing
						}
					}
				}
			}
		} catch (e) {
			// Dir might not exist
		}
		setSkills(foundSkills);
		setLoading(false);
	}, [fileService, skillsDir]);

	useEffect(() => {
		refreshSkills();
	}, [refreshSkills]);

	const handleAddSkill = async () => {
		if (!skillsDir) return;
		if (!newSkillName.trim()) {
			notificationService.error('Skill name is required');
			return;
		}

		const skillDir = URI.joinPath(skillsDir, newSkillName.trim());
		const skillPath = URI.joinPath(skillDir, 'SKILL.md');

		try {
			await fileService.createFolder(skillDir);
			await fileService.createFile(skillPath, VSBuffer.fromString(newSkillContent || `# ${newSkillName}\n\nNew skill instructions go here.`));
			notificationService.info(`Skill "${newSkillName}" created successfully!`);
			setIsAddOpen(false);
			setNewSkillName('');
			setNewSkillContent('');
			refreshSkills();
		} catch (e) {
			notificationService.error(`Failed to create skill: ${e}`);
		}
	};

	const handleDeleteSkill = async (name: string) => {
		if (!skillsDir) return;
		const skillDir = URI.joinPath(skillsDir, name);
		try {
			await fileService.del(skillDir, { recursive: true });
			notificationService.info(`Skill "${name}" deleted.`);
			refreshSkills();
		} catch (e) {
			notificationService.error(`Failed to delete skill: ${e}`);
		}
	};

	const handleInstallFromUrl = async () => {
		if (!skillsDir || !installUrl.trim()) {
			notificationService.error('Please enter a GitHub URL');
			return;
		}

		// Parse GitHub URL - supports both repo and subdirectory URLs
		// Format 1: https://github.com/user/repo
		// Format 2: https://github.com/user/repo/tree/branch/path/to/skill
		const githubMatch = installUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?(?:\/(.+))?/);
		if (!githubMatch) {
			notificationService.error('Invalid GitHub URL. Use format: https://github.com/user/repo');
			return;
		}

		const [, owner, repo, branch = 'main', skillPath = ''] = githubMatch;
		const skillName = skillPath
			? skillPath.split('/').pop() || repo.replace(/-skill$/, '')
			: repo.replace(/-skill$/, '');

		setInstallingSkill(skillName);
		setIsInstallFromUrl(false);
		setInstallUrl('');

		try {
			// Ensure skills directory exists
			try {
				await fileService.resolve(skillsDir);
			} catch {
				await fileService.createFolder(skillsDir);
			}

			const skillDir = URI.joinPath(skillsDir, skillName);

			// Check if already installed
			try {
				await fileService.resolve(skillDir);
				notificationService.warn(`Skill "${skillName}" is already installed.`);
				setInstallingSkill(null);
				return;
			} catch {
				// Not installed, proceed
			}

			const terminalToolService = accessor.get('ITerminalToolService');
			const cloneUrl = `https://github.com/${owner}/${repo}.git`;

			// If no subpath, clone directly (skill IS the repo)
			if (!skillPath) {
				const { resPromise } = await terminalToolService.runCommand(
					`git clone --depth 1 "${cloneUrl}" "${skillDir.fsPath}"`,
					{ type: 'temporary', cwd: skillsDir.fsPath }
				);

				const result = await resPromise;
				if (result.resolveReason.type === 'done' && result.resolveReason.exitCode === 0) {
					// Remove .git folder
					try {
						const gitDir = URI.joinPath(skillDir, '.git');
						await fileService.del(gitDir, { recursive: true });
					} catch {
						// Ignore
					}
					notificationService.info(`Skill "${skillName}" installed successfully!`);
					refreshSkills();
				} else {
					throw new Error(result.result || 'Git clone failed');
				}
			} else {
				// Clone to temp dir, then copy the skill subdirectory
				const tempDir = URI.joinPath(skillsDir, `.temp-${skillName}-${Date.now()}`);

				const { resPromise } = await terminalToolService.runCommand(
					`git clone --depth 1 "${cloneUrl}" "${tempDir.fsPath}"`,
					{ type: 'temporary', cwd: skillsDir.fsPath }
				);

				const result = await resPromise;
				if (result.resolveReason.type === 'done' && result.resolveReason.exitCode === 0) {
					const sourceDir = URI.joinPath(tempDir, skillPath);

					try {
						await fileService.resolve(sourceDir);
						await fileService.createFolder(skillDir);

						const sourceStat = await fileService.resolve(sourceDir);
						if (sourceStat.children) {
							for (const child of sourceStat.children) {
								await fileService.copy(child.resource, URI.joinPath(skillDir, child.name), { overwrite: true });
							}
						}

						await fileService.del(tempDir, { recursive: true });
						notificationService.info(`Skill "${skillName}" installed successfully!`);
						refreshSkills();
					} catch {
						await fileService.del(tempDir, { recursive: true });
						throw new Error(`Could not find skill at path: ${skillPath}`);
					}
				} else {
					throw new Error(result.result || 'Git clone failed');
				}
			}
		} catch (e: any) {
			notificationService.error(`Failed to install skill: ${e.message || e}`);
		} finally {
			setInstallingSkill(null);
		}
	};

	const handleInstallFromMarketplace = async (skill: SkillRegistryEntry) => {
		if (!skillsDir) return;

		setInstallingSkill(skill.id);

		try {
			// Ensure skills directory exists
			try {
				await fileService.resolve(skillsDir);
			} catch {
				await fileService.createFolder(skillsDir);
			}

			const skillDir = URI.joinPath(skillsDir, skill.id);

			// Check if already installed
			try {
				await fileService.resolve(skillDir);
				notificationService.warn(`Skill "${skill.name}" is already installed.`);
				setInstallingSkill(null);
				return;
			} catch {
				// Not installed, proceed
			}

			const terminalToolService = accessor.get('ITerminalToolService');

			// Parse GitHub URL to get owner, repo, branch, and path
			// URL format: https://github.com/owner/repo/tree/branch/path/to/skill
			const githubMatch = skill.url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?(?:\/(.+))?/);
			if (!githubMatch) {
				throw new Error('Invalid skill URL');
			}

			const [, owner, repo, branch = 'main', skillPath = ''] = githubMatch;
			const cloneUrl = `https://github.com/${owner}/${repo}.git`;

			// Create a temp directory for cloning
			const tempDir = URI.joinPath(skillsDir, `.temp-${skill.id}-${Date.now()}`);

			const { resPromise } = await terminalToolService.runCommand(
				`git clone --depth 1 "${cloneUrl}" "${tempDir.fsPath}"`,
				{ type: 'temporary', cwd: skillsDir.fsPath }
			);

			const result = await resPromise;
			if (result.resolveReason.type === 'done' && result.resolveReason.exitCode === 0) {
				// Find the skill directory within the cloned repo
				// The skillPath might be like "skills/my-skill" or just "my-skill"
				const sourceDir = skillPath
					? URI.joinPath(tempDir, skillPath)
					: URI.joinPath(tempDir, skill.id);

				try {
					// Check if the source directory exists
					await fileService.resolve(sourceDir);

					// Move the skill directory to its final location
					await fileService.createFolder(URI.joinPath(skillsDir, skill.id));

					// Copy all files from source to destination
					const sourceStat = await fileService.resolve(sourceDir);
					if (sourceStat.children) {
						for (const child of sourceStat.children) {
							await fileService.copy(child.resource, URI.joinPath(skillDir, child.name), { overwrite: true });
						}
					}

					// Clean up temp directory
					await fileService.del(tempDir, { recursive: true });

					notificationService.info(`Skill "${skill.name}" installed successfully!`);
					refreshSkills();
				} catch {
					// If skillPath doesn't exist, try to find the skill directly in repo root
					// This handles repos where the skill is at the root level
					try {
						const rootSkillDir = URI.joinPath(tempDir, skill.id);
						await fileService.resolve(rootSkillDir);

						await fileService.createFolder(URI.joinPath(skillsDir, skill.id));
						const rootStat = await fileService.resolve(rootSkillDir);
						if (rootStat.children) {
							for (const child of rootStat.children) {
								await fileService.copy(child.resource, URI.joinPath(skillDir, child.name), { overwrite: true });
							}
						}

						await fileService.del(tempDir, { recursive: true });
						notificationService.info(`Skill "${skill.name}" installed successfully!`);
						refreshSkills();
					} catch {
						// Clean up temp and throw
						await fileService.del(tempDir, { recursive: true });
						throw new Error(`Could not find skill directory in repository. Expected: ${skillPath || skill.id}`);
					}
				}
			} else {
				throw new Error(result.result || 'Git clone failed');
			}
		} catch (e: any) {
			notificationService.error(`Failed to install "${skill.name}": ${e.message || e}`);
		} finally {
			setInstallingSkill(null);
		}
	};

	// Fetch marketplace skills on mount
	useEffect(() => {
		const fetchMarketplaceSkills = async () => {
			setMarketplaceLoading(true);
			setMarketplaceError(null);

			try {
				const allSkills: SkillRegistryEntry[] = [];

				for (const registryUrl of DEFAULT_SKILL_REGISTRIES) {
					const skills = await fetchSkillsFromRegistry(registryUrl);
					allSkills.push(...skills);
				}

				setMarketplaceSkills(allSkills);
			} catch (error: any) {
				console.error('Failed to fetch marketplace skills:', error);
				setMarketplaceError(error.message || 'Failed to load marketplace');
			} finally {
				setMarketplaceLoading(false);
			}
		};

		fetchMarketplaceSkills();
	}, []);

	// Refresh marketplace when switching to marketplace tab
	useEffect(() => {
		if (activeTab === 'marketplace' && marketplaceSkills.length === 0 && !marketplaceLoading) {
			const fetchAgain = async () => {
				setMarketplaceLoading(true);
				try {
					const allSkills: SkillRegistryEntry[] = [];
					for (const registryUrl of DEFAULT_SKILL_REGISTRIES) {
						const skills = await fetchSkillsFromRegistry(registryUrl);
						allSkills.push(...skills);
					}
					setMarketplaceSkills(allSkills);
				} catch (error: any) {
					setMarketplaceError(error.message || 'Failed to load marketplace');
				} finally {
					setMarketplaceLoading(false);
				}
			};
			fetchAgain();
		}
	}, [activeTab, marketplaceSkills.length, marketplaceLoading]);

	const filteredMarketplaceSkills = marketplaceSkills.filter(skill =>
		skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
		skill.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	if (loading && skills.length === 0) {
		return <div className="flex items-center gap-2 text-void-fg-3 text-sm p-4"><IconLoading /> Loading skills...</div>;
	}

	return (
		<div className="space-y-4">
			{/* Tab switcher */}
			<div className="flex border-b border-void-border-2">
				<button
					onClick={() => setActiveTab('installed')}
					className={`flex-1 py-2 px-4 text-sm font-medium transition-all ${
						activeTab === 'installed'
							? 'text-void-accent border-b-2 border-void-accent'
							: 'text-void-fg-3 hover:text-void-fg-1'
					}`}
				>
					Installed ({skills.length})
				</button>
				<button
					onClick={() => setActiveTab('marketplace')}
					className={`flex-1 py-2 px-4 text-sm font-medium transition-all ${
						activeTab === 'marketplace'
							? 'text-void-accent border-b-2 border-void-accent'
							: 'text-void-fg-3 hover:text-void-fg-1'
					}`}
				>
					Marketplace
				</button>
			</div>

			{activeTab === 'installed' ? (
				<>
					<div className="flex flex-col gap-2">
						{skills.length === 0 ? (
							<div className="text-void-fg-3 text-sm italic p-4 text-center void-card">
								No custom skills found. Add one below or browse the marketplace.
							</div>
						) : (
							skills.map(skill => (
								<div key={skill.name} className="void-card p-4 group">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<div className="p-1.5 bg-void-accent/10 rounded-md">
												<Zap size={14} className="text-void-accent" />
											</div>
											<div>
												<div className="text-sm font-medium text-void-fg-1">{skill.name}</div>
												<div className="text-xs text-void-fg-3 mt-0.5 line-clamp-1">{skill.description}</div>
											</div>
										</div>
										<button
											onClick={() => handleDeleteSkill(skill.name)}
											className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-void-vscode-error-fg/10 text-void-vscode-error-fg rounded-md transition-all"
											title="Delete Skill"
										>
											<X size={14} />
										</button>
									</div>
								</div>
							))
						)}
					</div>

					{isAddOpen ? (
						<div className="p-4 void-card-elevated space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
							<div className="space-y-2">
								<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Skill Name</label>
								<VoidSimpleInputBox
									value={newSkillName}
									onChangeValue={setNewSkillName}
									placeholder="e.g. pdf-processing"
									compact={true}
								/>
							</div>
							<div className="space-y-2">
								<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Instructions (SKILL.md)</label>
								<VoidInputBox2
									initValue={newSkillContent}
									onChangeText={setNewSkillContent}
									placeholder="# My Skill\n\nYou are now an expert at..."
									multiline={true}
									className="min-h-[120px] text-sm"
								/>
							</div>
							<div className="flex gap-2 justify-end">
								<SettingsButton onClick={() => setIsAddOpen(false)}>Cancel</SettingsButton>
								<AddButton onClick={handleAddSkill} text="Create Skill" />
							</div>
						</div>
					) : (
						<>
							<button
								onClick={() => setIsAddOpen(true)}
								className="w-full py-3 border border-dashed border-void-border-2 rounded-lg text-sm text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 transition-all flex items-center justify-center gap-2"
							>
								<Plus size={16} />
								<span>Create new skill</span>
							</button>
							<button
								onClick={() => setIsInstallFromUrl(true)}
								className="w-full py-3 border border-dashed border-void-border-2 rounded-lg text-sm text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 transition-all flex items-center justify-center gap-2"
							>
								<ArrowRightLeft size={16} />
								<span>Install from GitHub URL</span>
							</button>
						</>
					)}

					{isInstallFromUrl && (
						<div className="p-4 void-card-elevated space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
							<div className="space-y-2">
								<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">GitHub Repository URL</label>
								<VoidSimpleInputBox
									value={installUrl}
									onChangeValue={setInstallUrl}
									placeholder="https://github.com/user/skill-name"
									compact={true}
								/>
							</div>
							<div className="flex gap-2 justify-end">
								<SettingsButton onClick={() => setIsInstallFromUrl(false)}>Cancel</SettingsButton>
								<AddButton onClick={handleInstallFromUrl} text="Install" />
							</div>
						</div>
					)}
				</>
			) : (
				<>
					{/* Registry info */}
					<div className="text-xs text-void-fg-4 mb-3 flex items-center gap-2">
						<Globe size={12} />
						<span>Fetching skills from: <code className="text-void-fg-3">github.com/hamishfromatech/the-architect-skills</code></span>
					</div>

					{/* Search */}
					<div className="relative">
						<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-void-fg-4" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search skills..."
							className="w-full pl-9 pr-4 py-2 bg-void-bg-2 border border-void-border-2 rounded-md text-sm text-void-fg-1 placeholder:text-void-fg-4 focus:outline-none focus:border-void-accent"
						/>
					</div>

					{/* Loading state */}
					{marketplaceLoading && (
						<div className="flex items-center justify-center gap-2 py-8 text-void-fg-3">
							<Loader2 size={16} className="animate-spin" />
							<span className="text-sm">Loading skills from registry...</span>
						</div>
					)}

					{/* Error state */}
					{marketplaceError && (
						<div className="text-center py-6">
							<div className="text-red-400 text-sm mb-2">Failed to load skills</div>
							<div className="text-void-fg-4 text-xs">{marketplaceError}</div>
							<button
								onClick={() => {
									setMarketplaceError(null);
									setMarketplaceSkills([]);
								}}
								className="mt-2 text-xs text-void-accent hover:underline"
							>
								Retry
							</button>
						</div>
					)}

					{/* Marketplace skills grid */}
					{!marketplaceLoading && !marketplaceError && (
						<div className="grid gap-3">
							{filteredMarketplaceSkills.map(skill => {
								const isInstalled = skills.some(s => s.name === skill.id || s.name === skill.name);
								const isInstalling = installingSkill === skill.id;

								return (
									<div key={skill.id} className="void-card p-4 hover:border-void-accent/30 transition-all">
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<div className="p-1.5 bg-void-accent/10 rounded-md">
														<Zap size={14} className="text-void-accent" />
													</div>
													<div className="text-sm font-medium text-void-fg-1">{skill.name}</div>
													{skill.version && (
														<span className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-3 text-void-fg-4">
															v{skill.version}
														</span>
													)}
													{isInstalled && (
														<span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
															Installed
														</span>
													)}
												</div>
												<div className="text-xs text-void-fg-3 mt-1 line-clamp-2">{skill.description}</div>
												<div className="flex items-center gap-3 mt-2">
													<span className="text-[10px] text-void-fg-4">by {skill.author}</span>
												</div>
												{skill.tags && skill.tags.length > 0 && (
													<div className="flex flex-wrap gap-1 mt-2">
														{skill.tags.map(tag => (
															<span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-3 text-void-fg-4">
																{tag}
															</span>
														))}
													</div>
												)}
											</div>
											<button
												onClick={() => handleInstallFromMarketplace(skill)}
												disabled={isInstalled || isInstalling}
												className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
													isInstalled
														? 'bg-void-bg-3 text-void-fg-4 cursor-not-allowed'
														: isInstalling
															? 'bg-void-bg-3 text-void-fg-4 cursor-wait'
															: 'bg-void-accent text-white hover:bg-void-accent/80'
												}`}
											>
												{isInstalling ? (
													<>
														<Loader2 size={12} className="animate-spin" />
														Installing...
													</>
												) : isInstalled ? (
													<>
														<Check size={12} />
														Installed
													</>
												) : (
													<>
														<Download size={12} />
														Install
													</>
												)}
											</button>
										</div>
									</div>
								);
							})}
							{filteredMarketplaceSkills.length === 0 && !marketplaceLoading && (
								<div className="text-void-fg-4 text-sm text-center py-8">
									{searchQuery ? `No skills found matching "${searchQuery}"` : 'No skills available in the registry'}
								</div>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
};

export const Settings = ({ initialTab }: { initialTab?: Tab }) => {
	const isDark = useIsDark()
	const clipboardService = useClipboardService()
	// ─── sidebar nav ──────────────────────────
	const [selectedSection, setSelectedSection] =
		useState<Tab>(initialTab || 'models');

	useEffect(() => {
		if (initialTab) {
			setSelectedSection(initialTab);
		}
	}, [initialTab]);

	const navItems: { tab: Tab; label: string; icon: any }[] = [
		{ tab: 'models', label: 'Manage Models', icon: Box },
		{ tab: 'localProviders', label: 'Local Models', icon: Cpu },
		{ tab: 'providers', label: 'Cloud Providers', icon: Globe },
		{ tab: 'featureOptions', label: 'Features', icon: Sparkles },
		{ tab: 'mediaGeneration', label: 'Images & Media', icon: ImageIcon },
		{ tab: 'general', label: 'System', icon: Settings2 },
		{ tab: 'mcp', label: 'MCP Tools', icon: Plug },
		{ tab: 'composio', label: 'App Integrations', icon: Store },
		{ tab: 'skills', label: 'AI Skills', icon: Zap },
		{ tab: 'mobileApi', label: 'API & Mobile', icon: Smartphone },
		{ tab: 'voice', label: 'Voice & Audio', icon: Mic },
		{ tab: 'about', label: 'About A-Coder', icon: Info },
		{ tab: 'all', label: 'View All Settings', icon: LayoutGrid },
	];
	const shouldShowTab = (tab: Tab) => selectedSection === 'all' || selectedSection === tab;
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const environmentService = accessor.get('IEnvironmentService')
	const productService = accessor.get('IProductService')
	const nativeHostService = accessor.get('INativeHostService')
	const settingsState = useSettingsState()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const chatThreadsService = accessor.get('IChatThreadService')
	const notificationService = accessor.get('INotificationService')
	const mcpService = accessor.get('IMCPService')
	const storageService = accessor.get('IStorageService')
	const metricsService = accessor.get('IMetricsService')
	const whatsNewModalService = accessor.get('IWhatsNewModalService')
	const isOptedOut = useIsOptedOut()

	const onDownload = (t: 'Chats' | 'Settings') => {
		let dataStr: string
		let downloadName: string
		if (t === 'Chats') {
			// Export chat threads
			dataStr = JSON.stringify(chatThreadsService.state, null, 2)
			downloadName = 'void-chats.json'
		}
		else if (t === 'Settings') {
			// Export user settings
			dataStr = JSON.stringify(voidSettingsService.state, null, 2)
			downloadName = 'void-settings.json'
		}
		else {
			dataStr = ''
			downloadName = ''
		}

		const blob = new Blob([dataStr], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = downloadName
		a.click()
		URL.revokeObjectURL(url)
	}


	// Add file input refs
	const fileInputSettingsRef = useRef<HTMLInputElement>(null)
	const fileInputChatsRef = useRef<HTMLInputElement>(null)

	const [s, ss] = useState(0)

	const handleUpload = (t: 'Chats' | 'Settings') => (e: React.ChangeEvent<HTMLInputElement>,) => {
		const files = e.target.files
		if (!files) return;
		const file = files[0]
		if (!file) return

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const json = JSON.parse(reader.result as string);

				if (t === 'Chats') {
					chatThreadsService.dangerousSetState(json as any)
				}
				else if (t === 'Settings') {
					voidSettingsService.dangerousSetState(json as any)
				}

				notificationService.info(`${t} imported successfully!`)
			} catch (err) {
				notificationService.notify({ message: `Failed to import ${t}`, source: err + '', severity: Severity.Error, })
			}
		};
		reader.readAsText(file);
		e.target.value = '';

		ss(s => s + 1)
	}


	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div className={`flex h-full w-full bg-void-depth-base`} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
				{/* ──────────────  PREMIUM SIDEBAR  ────────────── */}
				<aside className="w-60 h-full flex-shrink-0 flex flex-col border-r border-void-border-2/30 bg-void-depth-elevated/20">
					{/* Logo with premium treatment */}
					<div className="flex items-center gap-3 px-6 py-6 select-none border-b border-void-border-2/20">
						<div className="@@void-void-icon w-8 h-8 rounded-full ring-2 ring-void-accent/20 opacity-90" />
						<div className="flex flex-col">
							<span className="text-[14px] font-semibold text-void-fg-1 tracking-tight">A-Coder</span>
							<span className="text-[10px] text-void-fg-4/70 uppercase tracking-wider">Settings</span>
						</div>
					</div>

					{/* Navigation with staggered animation */}
					<nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
						{navItems.map(({ tab, label, icon: Icon }, index) => {
							const isActive = selectedSection === tab;
							return (
								<button
									key={tab}
									onClick={() => setSelectedSection(tab)}
									className={`
										group relative w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium rounded-xl
										transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
										${isActive
											? 'bg-void-accent/10 text-void-accent shadow-sm'
											: 'text-void-fg-3 hover:bg-void-depth-floating/60 hover:text-void-fg-1'
										}
									`}
									style={{ animationDelay: `${index * 30}ms` }}
								>
									<Icon
										size={16}
										strokeWidth={isActive ? 2.5 : 2}
										className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
									/>
									<span>{label}</span>
									{isActive && (
										<div className="ml-auto w-1.5 h-1.5 rounded-full bg-void-accent animate-pulse" />
									)}
								</button>
							);
						})}
					</nav>

					{/* Premium footer with version */}
					<div className="px-6 py-5 border-t border-void-border-2/20">
						<div className="flex items-center justify-between">
							<span className="text-[11px] text-void-fg-4/60">Version</span>
							<span className="text-[11px] font-medium text-void-fg-3 tabular-nums">
								v{productService.voidVersion || productService.version}
							</span>
						</div>
					</div>
				</aside>

			{/* ───────────── PREMIUM MAIN PANE ───────────── */}
			<main className="flex-1 h-full overflow-y-auto bg-void-depth-base">
				<div key={selectedSection} className="max-w-3xl mx-auto px-12 py-16 pb-40 settings-animate-in">
					{/* Premium Header */}
					<div className="flex items-center justify-between mb-16">
						<div>
							<h1 className="text-[26px] font-semibold text-void-fg-1 tracking-tight">Settings</h1>
							<p className="text-[14px] text-void-fg-3/70 mt-2 leading-relaxed">Configure your A-Coder experience</p>
						</div>
						<ErrorBoundary>
							<RedoOnboardingButton className="text-[11px] px-4 py-2 rounded-full border border-void-border-2/50 hover:bg-void-depth-elevated/60 hover:border-void-border-1 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-void-fg-3 hover:text-void-fg-1 active:scale-[0.98]" />
						</ErrorBoundary>
					</div>

					{/* Content sections with staggered entry */}
					<div className="space-y-12 settings-stagger">

					{/* Models section */}
					<div className={shouldShowTab('models') ? '' : 'hidden'}>
						<ErrorBoundary>
						<SettingCard title="Manage Models" description="Choose which AI models appear in your workspace.">
							<SettingBox className="p-0 overflow-hidden">
								<ModelDump />
							</SettingBox>

							<SettingBox className="space-y-4">
								<AutoDetectLocalModelsToggle />
								<div className="pt-4 border-t border-void-border-2">
									<h4 className="text-[11px] font-medium text-void-fg-3 mb-3 uppercase tracking-wide">Available Provider Models</h4>
									<RefreshableModels />
								</div>
							</SettingBox>
						</SettingCard>
						</ErrorBoundary>
					</div>

					{/* Local Providers section */}
					<div className={shouldShowTab('localProviders') ? '' : 'hidden'}>
						<ErrorBoundary>
							<SettingCard title="Run Models Locally" description="Connect to AI running on your own hardware for privacy and speed." isDark={isDark}>
								<SettingBox className="mb-6">
									<h3 className="text-[13px] font-medium mb-3 text-void-fg-1">Setup Instructions</h3>
									<OllamaSetupInstructions sayWeAutoDetect={true} />
								</SettingBox>

								<SettingBox className="space-y-6">
									<VoidProviderSettings providerNames={localProviderNames} />
								</SettingBox>
							</SettingCard>
						</ErrorBoundary>
					</div>

					{/* Main Providers section */}
					<div className={shouldShowTab('providers') ? '' : 'hidden'}>
						<SettingDivider />
						<ErrorBoundary>
							<SettingCard title="Connect Cloud Providers" description="Log in to popular AI services like OpenAI, Anthropic, and more." isDark={isDark}>
								<SettingBox className="space-y-6">
									<VoidProviderSettings providerNames={nonlocalProviderNames} />
								</SettingBox>
							</SettingCard>
						</ErrorBoundary>
					</div>

										{/* Feature Options section */}
										<div className={shouldShowTab('featureOptions') ? 'space-y-8' : 'hidden'}>
											<ErrorBoundary>
												<section className="space-y-6">
													<div className="mb-6">
							<h2 className="text-xl font-medium text-void-fg-1">Features</h2>
							<p className="text-sm text-void-fg-3 mt-1">Turn features on or off and tune how they behave.</p>
													</div>

													{/* Quick Settings Grid */}
													<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
														<QuickToggleCard
															title="Autocomplete"
															description="AI-powered code completion"
															icon={Zap}
															enabled={settingsState.globalSettings.enableAutocomplete}
															onToggle={() => voidSettingsService.setGlobalSetting('enableAutocomplete', !settingsState.globalSettings.enableAutocomplete)}
														/>
														<QuickToggleCard
															title="Media Generation"
															description="Generate images with AI"
															icon={Sparkles}
															enabled={settingsState.globalSettings.enableMediaGeneration}
															onToggle={() => voidSettingsService.setGlobalSetting('enableMediaGeneration', !settingsState.globalSettings.enableMediaGeneration)}
														/>
														<QuickToggleCard
															title="Tool Orchestration"
															description="Smart tool selection"
															icon={Brain}
															enabled={settingsState.globalSettings.enableToolOrchestration}
															onToggle={() => voidSettingsService.setGlobalSetting('enableToolOrchestration', !settingsState.globalSettings.enableToolOrchestration)}
														/>
														<QuickToggleCard
															title="Auto-refresh Models"
															description="Detect local models"
															icon={RefreshCw}
															enabled={settingsState.globalSettings.autoRefreshModels}
															onToggle={() => voidSettingsService.setGlobalSetting('autoRefreshModels', !settingsState.globalSettings.autoRefreshModels)}
														/>
													</div>

													<div className="space-y-6">
														{/* Autocomplete Card */}
														<SettingCard
															isDark={isDark}
															title={displayInfoOfFeatureName('Autocomplete')}
															description="Experimental. Only works with FIM models.*"
														>
															<SettingBox>
																<SettingRow label="Enabled">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.enableAutocomplete}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('enableAutocomplete', newVal)}
																	/>
																</SettingRow>
																{settingsState.globalSettings.enableAutocomplete && (
																	<div className="mt-4 pt-4 border-t border-void-border-2">
																		<label className="text-xs text-void-fg-3 mb-2 block uppercase tracking-wide font-medium">Autocomplete Model</label>
																		<ModelDropdown featureName={'Autocomplete'} className='w-full max-w-xs' />
																	</div>
																)}
															</SettingBox>
														</SettingCard>

														{/* Chat Mode Card */}
														<SettingCard
															isDark={isDark}
															title="Chat Mode"
															description="Select the default behavior for AI chat and tutoring."
														>
															<SettingBox className="space-y-4">
																<div>
																	<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Default Mode</label>
																	<VoidCustomDropdownBox
																		options={['chat', 'plan', 'code', 'learn']}
																		selectedOption={settingsState.globalSettings.chatMode}
																		onChangeOption={(newVal) => voidSettingsService.setGlobalSetting('chatMode', newVal as any)}
																		getOptionDisplayName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																		getOptionDropdownName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																		getOptionsEqual={(a, b) => a === b}
																		className="w-full max-w-xs bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
																		arrowTouchesText={false}
																	/>
																</div>

																{settingsState.globalSettings.chatMode === 'learn' && (
																	<div>
																		<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Student Level</label>
																		<VoidCustomDropdownBox
																			options={['beginner', 'intermediate', 'advanced']}
																			selectedOption={settingsState.globalSettings.studentLevel}
																			onChangeOption={(newVal) => voidSettingsService.setGlobalSetting('studentLevel', newVal as any)}
																			getOptionDisplayName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																			getOptionDropdownName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																			getOptionsEqual={(a, b) => a === b}
																			className="w-full max-w-xs bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
																			arrowTouchesText={false}
																		/>
																	</div>
																)}
															</SettingBox>
														</SettingCard>

														{/* Agent Settings Card */}
														<SettingCard
															isDark={isDark}
															title="Agent Mode"
															description="Set how many actions the AI agent can run in one loop."
														>
															<SettingBox>
																<SettingRow
																	label="Max Iterations"
																	description="Maximum number of tool calls the agent can make in a loop."
																>
																	<VoidSimpleInputBox
																		value={String(settingsState.globalSettings.maxAgentIterations)}
																		placeholder="50"
																		onChangeValue={(newVal) => {
																			const val = parseInt(newVal);
																			if (!isNaN(val) && val > 0) {
																				voidSettingsService.setGlobalSetting('maxAgentIterations', val);
																			}
																		}}
																		className="w-20 text-center"
																		compact
																	/>
																</SettingRow>
															</SettingBox>
														</SettingCard>

														{/* Apply Card */}
														<SettingCard
															isDark={isDark}
															title={displayInfoOfFeatureName('Apply')}
															description="Control how code changes are applied to your files."
														>
															<div className="space-y-3">
																<SettingBox>
																	<SettingRow label="Sync with Chat Model" description="Use the same model as the current chat for applying changes.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.syncApplyToChat}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('syncApplyToChat', newVal)}
																		/>
																	</SettingRow>
																</SettingBox>

																{!settingsState.globalSettings.syncApplyToChat && (
																	<SettingBox>
																		<label className="text-xs text-void-fg-3 mb-2 block uppercase tracking-wide font-medium">Apply Model</label>
																		<ModelDropdown featureName={'Apply'} className='w-full max-w-xs' />
																	</SettingBox>
																)}

																<SettingBox>
																	<SettingRow label="Fast Apply Method" description="Toggle between different strategies for applying changes.">
																		<FastApplyMethodDropdown />
																	</SettingRow>
																</SettingBox>
															</div>
														</SettingCard>

														{/* SCM Card */}
														<SettingCard
															isDark={isDark}
															title={displayInfoOfFeatureName('SCM')}
															description="Control how commit messages are generated from your staged changes."
														>
															<div className="space-y-3">
																<SettingBox>
																	<SettingRow label="Sync with Chat Model" description="Use the same model as the current chat for commit messages.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.syncSCMToChat}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('syncSCMToChat', newVal)}
																		/>
																	</SettingRow>
																</SettingBox>

																{!settingsState.globalSettings.syncSCMToChat && (
																	<SettingBox>
																		<label className="text-xs text-void-fg-3 mb-2 block uppercase tracking-wide font-medium">SCM Model</label>
																		<ModelDropdown featureName={'SCM'} className='w-full max-w-xs' />
																	</SettingBox>
																)}
															</div>
														</SettingCard>

														{/* Vision Card */}
														<SettingCard
															isDark={isDark}
															title={displayInfoOfFeatureName('Vision')}
															description="Enable image processing capabilities for models that support it."
														>
															<SettingBox>
																<SettingRow label="Vision Support Enabled">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.enableVisionSupport}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('enableVisionSupport', newVal)}
																	/>
																</SettingRow>

																{settingsState.globalSettings.enableVisionSupport && (
																	<div className="mt-4 pt-4 border-t border-void-border-2">
																		<label className="text-xs text-void-fg-3 mb-2 block uppercase tracking-wide font-medium">Vision Model</label>
																		<ModelDropdown featureName={'Vision'} className='w-full max-w-xs' />
																	</div>
																)}
															</SettingBox>
														</SettingCard>

														{/* Tool Orchestration Card */}
														<SettingCard
															isDark={isDark}
															title={displayInfoOfFeatureName('ToolOrchestration')}
															description="Use a dedicated model to decide which tools to call, reducing context usage for the main LLM."
														>
															<SettingBox>
																<SettingRow label="Tool Orchestration Enabled" description="When enabled, a separate model analyzes requests and suggests appropriate tools.">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.enableToolOrchestration}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('enableToolOrchestration', newVal)}
																	/>
																</SettingRow>

																{settingsState.globalSettings.enableToolOrchestration && (
																	<div className="mt-4 pt-4 border-t border-void-border-2">
																		<label className="text-xs text-void-fg-3 mb-2 block uppercase tracking-wide font-medium">Orchestration Model</label>
																		<ModelDropdown featureName={'ToolOrchestration'} className='w-full max-w-xs' />
																		<p className="text-[10px] text-void-fg-3 mt-2">Use a small, fast model (like Claude Haiku or GPT-4o-mini) for optimal performance.</p>
																	</div>
																)}
															</SettingBox>
														</SettingCard>

														{/* Morph Settings Card */}
														<SettingCard
															isDark={isDark}
															title="Morph Settings"
															description="Use Morph API for intelligent code application and fast context gathering."
														>
															<SettingBox>
																<div className="space-y-4">
																	<SettingRow label="Fast Apply Enabled" description="Use Morph for faster code application.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.enableMorphFastApply}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('enableMorphFastApply', newVal)}
																		/>
																	</SettingRow>
																	<SettingRow label="Fast Context Enabled" description="Use Morph for intelligent context gathering.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.enableMorphFastContext}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('enableMorphFastContext', newVal)}
																		/>
																	</SettingRow>
																	<SettingRow label="Repo Storage Enabled" description="Use Morph Repo Storage for git operations and semantic search.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.enableMorphRepoStorage}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('enableMorphRepoStorage', newVal)}
																		/>
																	</SettingRow>
																</div>

																{(settingsState.globalSettings.enableMorphFastApply || settingsState.globalSettings.enableMorphFastContext || settingsState.globalSettings.enableMorphRepoStorage) && (
																	<div className="mt-4 pt-4 border-t border-void-border-2 space-y-4">
																		<div>
																			<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Morph API Key</label>
																			<VoidSimpleInputBox
																				value={settingsState.globalSettings.morphApiKey}
																				onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('morphApiKey', newVal)}
																				placeholder='Morph API Key'
																				compact={true}
																			/>
																		</div>
																		<div>
																			<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Morph Model</label>
																			<VoidCustomDropdownBox
																				options={['auto', 'morph-v3-fast', 'morph-v3-large']}
																				selectedOption={settingsState.globalSettings.morphModel}
																				onChangeOption={(newVal) => voidSettingsService.setGlobalSetting('morphModel', newVal as any)}
																				getOptionDisplayName={(val) => val}
																				getOptionDropdownName={(val) => val}
																				getOptionsEqual={(a, b) => a === b}
																				className="w-full max-w-xs bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
																				arrowTouchesText={false}
																			/>
																		</div>

																		{settingsState.globalSettings.enableMorphRepoStorage && (
																			<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-void-border-2">
																				<div className="space-y-2">
																					<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide block">Morph Repo ID</label>
																					<VoidSimpleInputBox
																						value={settingsState.globalSettings.morphRepoId ?? ''}
																						onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('morphRepoId', newVal)}
																						placeholder='e.g. org/project'
																						compact={true}
																					/>
																				</div>
																				<div className="space-y-2">
																					<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide block">Default Branch</label>
																					<VoidSimpleInputBox
																						value={settingsState.globalSettings.morphRepoBranch ?? 'main'}
																						onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('morphRepoBranch', newVal)}
																						placeholder='main'
																						compact={true}
																					/>
																				</div>
																				<SettingRow label="Index on Push" description="Automatically generate embeddings after push.">
																					<VoidSwitch
																						size='sm'
																						value={settingsState.globalSettings.morphRepoIndexOnPush ?? true}
																						onChange={(newVal) => voidSettingsService.setGlobalSetting('morphRepoIndexOnPush', newVal)}
																					/>
																				</SettingRow>
																				<SettingRow label="Wait for Embeddings" description="Block pushes until embeddings are finished.">
																					<VoidSwitch
																						size='sm'
																						value={settingsState.globalSettings.morphRepoWaitForEmbeddings ?? false}
																						onChange={(newVal) => voidSettingsService.setGlobalSetting('morphRepoWaitForEmbeddings', newVal)}
																					/>
																				</SettingRow>
																			</div>
																		)}
																	</div>
																)}
															</SettingBox>
														</SettingCard>

														{/* Tools Card */}
														<SettingCard
															isDark={isDark}
															title="Tools & Permissions"
															description="Manage tool auto-approval settings and behavior."
														>
															<div className="space-y-3">
																{[...toolApprovalTypes].map((approvalType) => (
																	<SettingBox key={approvalType}>
																		<SettingRow label={`Auto-approve ${approvalType}`}>
																			<ToolApprovalTypeSwitch size='sm' approvalType={approvalType} desc="" />
																		</SettingRow>
																	</SettingBox>
																))}

																<SettingBox>
																	<SettingRow label="Auto-accept LLM Changes" description="Automatically accept changes suggested by the LLM.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.autoAcceptLLMChanges}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('autoAcceptLLMChanges', newVal)}
																		/>
																	</SettingRow>
																</SettingBox>

																<SettingBox>
																	<SettingRow label="Include Tool Lint Errors" description="Send lint errors back to the tool for self-correction.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.includeToolLintErrors}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('includeToolLintErrors', newVal)}
																		/>
																	</SettingRow>
																</SettingBox>

																<SettingBox>
																	<SettingRow label="Enable TOON" description="Use Tool Output Optimization for faster results.">
																		<VoidSwitch
																			size='sm'
																			value={settingsState.globalSettings.enableToolResultTOON}
																			onChange={(newVal) => voidSettingsService.setGlobalSetting('enableToolResultTOON', newVal)}
																		/>
																	</SettingRow>
																</SettingBox>
															</div>
														</SettingCard>

														{/* UI Options Card */}
														<SettingCard
															isDark={isDark}
															title="UI Options"
															description="Customize the user interface and editor appearance."
														>
															<SettingBox>
																<SettingRow label="Show Inline Suggestions" description="Display ghost text suggestions in the editor.">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.showInlineSuggestions}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('showInlineSuggestions', newVal)}
																	/>
																</SettingRow>
															</SettingBox>
													</SettingCard>

									{/* Notification Sound Card */}
									<SettingCard
										isDark={isDark}
										title="Notification Sound"
										description="Play a sound when the AI finishes responding."
										eyebrow="Feature Options"
										icon={Volume2}
									>
										<SettingBox>
											<div className="space-y-4">
												<SettingRow label="Sound" description="Choose a notification sound to play when responses complete.">
													<VoidCustomDropdownBox
														options={['none', '1', '2', '3', '4']}
														selectedOption={settingsState.globalSettings.notificationSound || 'none'}
														onChangeOption={(newVal) => voidSettingsService.setGlobalSetting('notificationSound', newVal)}
														getOptionDisplayName={(val) => val === 'none' ? 'None' : `Sound ${val}`}
														getOptionDropdownName={(val) => val === 'none' ? 'None' : `Sound ${val}`}
														getOptionsEqual={(a, b) => a === b}
														className="w-40 bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
														arrowTouchesText={false}
													/>
												</SettingRow>

												<div className="pt-4 border-t border-void-border-2">
													<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Preview Sound</label>
													<TestSoundButton />
												</div>
											</div>
										</SettingBox>
									</SettingCard>
										{/* Proactive Coach Card */}
										<SettingCard
											isDark={isDark}
											title="Proactive Coach"
											description="Get real-time guidance from an AI tutor as you code."
											eyebrow="Feature Options"
											icon={BookOpen}
										>
											<SettingBox>
												<div className="space-y-4">
													<SettingRow label="Enabled" description="Show coaching suggestions while you type.">
														<VoidSwitch
															size='sm'
															value={settingsState.globalSettings.enableProactiveCoach}
															onChange={(newVal) => voidSettingsService.setGlobalSetting('enableProactiveCoach', newVal)}
														/>
													</SettingRow>
													<SettingRow
														label="Check Interval (seconds)"
														description="Minimum time between coach checks."
													>
														<VoidSimpleInputBox
															value={String(settingsState.globalSettings.proactiveCoachIntervalSeconds)}
															placeholder="120"
															onChangeValue={(newVal) => {
																const val = parseInt(newVal);
																if (!isNaN(val) && val > 0) {
																	voidSettingsService.setGlobalSetting('proactiveCoachIntervalSeconds', val);
																}
															}}
															className="w-20 text-center"
															compact
														/>
													</SettingRow>
												</div>
											</SettingBox>
										</SettingCard>
													</div>
												</section>
											</ErrorBoundary>
										</div>



										{/* Media Generation section */}
										<div className={shouldShowTab('mediaGeneration') ? 'space-y-8' : 'hidden'}>
											<ErrorBoundary>
												<section className="space-y-6">
													<div className="mb-6">
							<h2 className="text-xl font-medium text-void-fg-1">Images & Media</h2>
							<p className="text-sm text-void-fg-3 mt-1">Configure image generation using an OpenAI-compatible API.</p>
													</div>

													<div className="space-y-6">
														<SettingCard
															isDark={isDark}
															title="Media Generation Enabled"
															description="Allow the LLM to generate images using OpenAI-compatible APIs."
														>
															<SettingBox>
																<SettingRow label="Enable Media Generation">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.enableMediaGeneration}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('enableMediaGeneration', newVal)}
																	/>
																</SettingRow>
															</SettingBox>
														</SettingCard>

														{settingsState.globalSettings.enableMediaGeneration && (
															<SettingCard
																isDark={isDark}
																title="Image Generation Configuration"
																description="Configure the OpenAI-compatible API endpoint and model for image generation."
															>
															<SettingBox>
																<div className="space-y-4">
																	<div>
																		<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Base URL</label>
																		<VoidSimpleInputBox
																			value={settingsState.globalSettings.imageGenerationBaseUrl}
																			onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('imageGenerationBaseUrl', newVal)}
																			placeholder='http://localhost:11434/v1'
																			compact={true}
																		/>
																		<p className="text-[10px] text-void-fg-3/80 mt-1">The base URL of your OpenAI-compatible image generation API (e.g., http://localhost:11434/v1 for Ollama).</p>
																	</div>

																	<div>
																		<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Image Model</label>
																		<VoidSimpleInputBox
																			value={settingsState.globalSettings.imageGenerationModel}
																			onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('imageGenerationModel', newVal)}
																			placeholder='x/flux2-klein:4b'
																			compact={true}
																		/>
																		<p className="text-[10px] text-void-fg-3/80 mt-1">The model to use for image generation (e.g., x/flux2-klein:4b, dall-e-3, stable-diffusion).</p>
																	</div>

																	<div>
																		<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">API Key</label>
																		<VoidSimpleInputBox
																			value={settingsState.globalSettings.imageGenerationApiKey}
																			onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('imageGenerationApiKey', newVal)}
																			placeholder='sk-...'
																			compact={true}
																			passwordBlur={true}
																		/>
																		<p className="text-[10px] text-void-fg-3/80 mt-1">Your API key for the image generation service.</p>
																	</div>
																</div>
															</SettingBox>
														</SettingCard>
														)}
													</div>
												</section>
											</ErrorBoundary>
										</div>

										{/* General section */}
					<div className={shouldShowTab('general') ? 'space-y-4' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-2">
								<div className="mb-8">
									<h2 className="text-2xl font-bold text-void-fg-1 tracking-tight">General</h2>
									<p className="text-[13px] text-void-fg-3/80 mt-1.5">System preferences and application maintenance.</p>
								</div>

								{/* AI Instructions Card */}
								<SettingCard
									isDark={isDark}
									title="Global Instructions"
									description="These instructions are included with every AI request to customize behavior across all features."
								>
									<SettingBox>
										<div className="space-y-5">
											<AIInstructionsBox />
											<div className="pt-4 border-t border-void-border-2/50">
												<SettingRow
													label="Custom System Prompt"
													description="Append these instructions to the base system prompt. If disabled, only the base prompt is sent."
												>
													<VoidSwitch
														size='sm'
														value={!settingsState.globalSettings.disableSystemMessage}
														onChange={(newValue) => voidSettingsService.setGlobalSetting('disableSystemMessage', !newValue)}
													/>
												</SettingRow>
											</div>
										</div>
									</SettingBox>
								</SettingCard>

								<SettingDivider />

								{/* Migration & Data Management Group */}
								<div className="space-y-10">
									<SettingCard
										isDark={isDark}
										title="Migration"
										description="Import your extensions and preferences from other editors."
									>
										<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
											<OneClickSwitchButton fromEditor="VS Code" />
											<OneClickSwitchButton fromEditor="Cursor" />
											<OneClickSwitchButton fromEditor="Windsurf" />
										</div>
									</SettingCard>

									<SettingCard
										isDark={isDark}
										title="Data Management"
										description="Export your data for backup or import it from another installation."
									>
										<div className="space-y-4">
											<SettingBox>
												<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
													<div>
														<h4 className="text-[13px] font-medium text-void-fg-1">Application Settings</h4>
														<p className="text-[12px] text-void-fg-3/80">Export or import your provider configurations and UI preferences.</p>
													</div>
													<div className="flex gap-2">
														<input key={2 * s} ref={fileInputSettingsRef} type='file' accept='.json' className='hidden' onChange={handleUpload('Settings')} />
														<SettingsButton className="min-w-[80px]" onClick={() => fileInputSettingsRef.current?.click()}>Import</SettingsButton>
														<SettingsButton className="min-w-[80px]" onClick={() => onDownload('Settings')}>Export</SettingsButton>
													</div>
												</div>
											</SettingBox>

											<SettingBox>
												<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
													<div>
														<h4 className="text-[13px] font-medium text-void-fg-1">Chat History</h4>
														<p className="text-[12px] text-void-fg-3/80">Backup your conversations and tool usage history.</p>
													</div>
													<div className="flex gap-2">
														<input key={2 * s + 1} ref={fileInputChatsRef} type='file' accept='.json' className='hidden' onChange={handleUpload('Chats')} />
														<SettingsButton className="min-w-[80px]" onClick={() => fileInputChatsRef.current?.click()}>Import</SettingsButton>
														<SettingsButton className="min-w-[80px]" onClick={() => onDownload('Chats')}>Export</SettingsButton>
													</div>
												</div>
											</SettingBox>

											<div className="pt-2">
												<ConfirmButton
													className="w-full !py-3 !rounded-xl"
													onConfirm={() => voidSettingsService.resetState()}
												>
													Reset All Application Data
												</ConfirmButton>
											</div>
										</div>
									</SettingCard>
								</div>

								<SettingDivider />

								{/* Privacy & Maintenance */}
								<SettingCard
									isDark={isDark}
									title="Privacy & Support"
									description="Control your data sharing preferences and application state."
								>
									<div className="space-y-4">
										<SettingBox>
											<SettingRow
												label="Anonymous Usage Reporting"
												description="Help us improve A-Coder by sharing anonymous telemetry. We never collect code, file names, or personal data."
											>
												<VoidSwitch
													size='sm'
													value={!isOptedOut}
													onChange={(newValue) => {
														const storageService = accessor.get('IStorageService')
														storageService.store(OPT_OUT_KEY, !newValue, StorageScope.APPLICATION, StorageTarget.USER)
													}}
												/>
											</SettingRow>
										</SettingBox>

										<SettingBox>
											<SettingRow
												label="Onboarding Experience"
												description="Restart the welcome tour and initial configuration process."
											>
												<SettingsButton
													className="px-6"
													onClick={() => { voidSettingsService.setGlobalSetting('isOnboardingComplete', false) }}
												>
													Reset Tour
												</SettingsButton>
											</SettingRow>
										</SettingBox>
									</div>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* MCP section */}
					<div className={shouldShowTab('mcp') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6 flex items-center justify-between">
									<div>
											<h2 className="text-xl font-medium text-void-fg-1">MCP Tools</h2>
											<p className="text-sm text-void-fg-3 mt-1">Connect to external tools and data sources via the Model Context Protocol.</p>
									</div>
									<SettingsButton className='px-4 py-2' variant="primary" onClick={async () => { await mcpService.revealMCPConfigFile() }}>
										Configure MCP
									</SettingsButton>
								</div>

								<SettingCard
									isDark={isDark}
									title="Active Servers"
									description="Connect your AI to external tools and data sources."
								>
									<SettingBox>
										<MCPServersList />
									</SettingBox>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* Composio App Marketplace section */}
					<div className={shouldShowTab('composio') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<ComposioSettingsSection
								settingsState={settingsState}
								voidSettingsService={voidSettingsService}
								isDark={isDark}
							/>
						</ErrorBoundary>
					</div>

					{/* Skills section */}
					<div className={shouldShowTab('skills') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6 flex items-center justify-between">
									<div>
												<h2 className="text-xl font-medium text-void-fg-1">AI Skills</h2>
												<p className="text-sm text-void-fg-3 mt-1">Teach the AI new tricks with domain-specific instructions.</p>
									</div>
								</div>

								<SettingCard
									isDark={isDark}
									title="Custom Skills"
									description="Skills allow you to inject domain-specific instructions and patterns into your conversations."
								>
									<SettingBox>
										<SkillsList />
									</SettingBox>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* Mobile API section */}
					<div className={shouldShowTab('mobileApi') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6">
									<h2 className="text-xl font-medium text-void-fg-1">Mobile API</h2>
									<p className="text-sm text-void-fg-3 mt-1">Connect your mobile device to A-Coder.</p>
								</div>

								<SettingCard
									isDark={isDark}
									title="API Server Status"
									description="Enable the remote API to use A-Coder from your mobile device."
								>
									<SettingBox className={settingsState.globalSettings.apiEnabled ? 'bg-green-500/5 border-green-500/20' : ''}>
										<SettingRow label="API Server Enabled">
											<VoidSwitch
												size='sm'
												value={!!settingsState.globalSettings.apiEnabled}
												onChange={(newValue) => voidSettingsService.setGlobalSetting('apiEnabled', newValue)}
											/>
										</SettingRow>
									</SettingBox>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
										<div className="space-y-4">
											<SettingBox>
												<div className="flex items-center justify-between mb-2">
													<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Port</label>
													<button
														type="button"
														onClick={() => clipboardService?.writeText(settingsState.globalSettings.apiPort.toString())}
														className="text-void-fg-3 hover:text-void-fg-1 p-1 rounded transition-colors"
														title="Copy Port"
													>
														<Copy size={12} />
													</button>
												</div>
												<VoidSimpleInputBox
													placeholder="3000"
													value={settingsState.globalSettings.apiPort.toString()}
													onChangeValue={(val) => {
														// Allow empty or partial input while typing, but validate only on numeric values
														const port = parseInt(val);
														if (!isNaN(port)) {
															// Only save if it's a valid port number, otherwise just let the user type
															if (port >= 1 && port <= 65535) {
																voidSettingsService.setGlobalSetting('apiPort', port);
															}
														} else if (val === '') {
															voidSettingsService.setGlobalSetting('apiPort', 3000); // Default if cleared
														}
													}}
												/>
												<p className="text-[10px] text-void-fg-4 mt-1.5 italic">Standard: 3000, Range: 1024-65535</p>
											</SettingBox>
											<SettingBox>
												<div className="flex items-center justify-between mb-2">
													<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide">Tunnel URL (Optional)</label>
													{settingsState.globalSettings.apiTunnelUrl && (
														<button
															type="button"
															onClick={() => clipboardService?.writeText(settingsState.globalSettings.apiTunnelUrl!)}
															className="text-void-fg-3 hover:text-void-fg-1 p-1 rounded transition-colors"
															title="Copy Tunnel URL"
														>
															<Copy size={12} />
														</button>
													)}
												</div>
												<VoidSimpleInputBox
													placeholder="https://acoder-api.example.com"
													value={settingsState.globalSettings.apiTunnelUrl || ''}
													onChangeValue={(val) => voidSettingsService.setGlobalSetting('apiTunnelUrl', val || undefined)}
												/>
												<p className="text-[10px] text-void-fg-4 mt-1.5 italic">External URL for remote access</p>
											</SettingBox>
										</div>

										<div className="flex flex-col h-full">
											<SettingBox className="flex flex-col h-full">
												<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-3 block">Access Tokens</label>
												<div className="flex-1 bg-void-bg-1/50 rounded-lg border border-void-border-2 p-3 space-y-2 overflow-y-auto max-h-48 min-h-[100px] shadow-inner">
													{settingsState.globalSettings.apiTokens.length === 0 ? (
														<div className="flex flex-col items-center justify-center h-full py-4 text-void-fg-4">
															<ShieldCheck size={24} className="mb-2 opacity-20" />
															<span className="text-xs italic">No tokens generated</span>
														</div>
													) : (
														settingsState.globalSettings.apiTokens.map((token, idx) => (
															<div key={idx} className="flex items-center gap-2 p-2 bg-void-bg-2 rounded-md border border-void-border-1 hover:border-void-border-2 transition-all group shadow-sm">
																<code className="flex-1 text-[11px] font-mono text-void-fg-2 select-text cursor-text truncate group-hover:text-void-fg-1" style={{ userSelect: 'text' }}>{token}</code>
																<div className="flex items-center gap-1">
																	<button
																		type="button"
																		onClick={() => {
																			try {
																				const textArea = document.createElement('textarea');
																				textArea.value = token;
																				textArea.style.position = 'fixed';
																				textArea.style.left = '-9999px';
																				document.body.appendChild(textArea);
																				textArea.select();
																				const success = document.execCommand('copy');
																				document.body.removeChild(textArea);
																				if (success) return;
																			} catch (e) {}
																			if (clipboardService) {
																				clipboardService.writeText(token).catch(err => console.error('Failed to copy:', err));
																			} else if (navigator.clipboard) {
																				navigator.clipboard.writeText(token).catch(err => console.error('Failed to copy:', err));
																			}
																		}}
																		className="p-1.5 text-void-fg-3 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-all"
																		title="Copy token"
																	>
																		<Copy size={14} />
																	</button>
																	<button
																		type="button"
																		onClick={() => voidSettingsService.setGlobalSetting('apiTokens', settingsState.globalSettings.apiTokens.filter((_, i) => i !== idx))}
																		className="p-1.5 text-void-fg-3 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
																		title="Delete token"
																	>
																		<X size={14} />
																	</button>
																</div>
															</div>
														))
													)}
												</div>
												<SettingsButton
													variant="primary"
													className="mt-4 w-full py-2.5 rounded-xl shadow-void-accent/20"
													onClick={() => {
														const token = `acoder_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
														voidSettingsService.setGlobalSetting('apiTokens', [...settingsState.globalSettings.apiTokens, token]);
													}}
												>
													<Plus size={16} />
													<span>Generate New Token</span>
												</SettingsButton>
											</SettingBox>
										</div>
									</div>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* Voice & Audio section */}
					<div className={shouldShowTab('voice') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6">
									<h2 className="text-xl font-medium text-void-fg-1">Voice & Audio</h2>
									<p className="text-sm text-void-fg-3 mt-1">Configure speech-to-text and text-to-speech for hands-free chat.</p>
								</div>

								<div className="space-y-6">
									<SettingCard
										isDark={isDark}
										title="Speech-to-Text (STT)"
										description="Transcribe your voice into chat messages using an OpenAI-compatible API."
									>
										<SettingBox>
											<SettingRow label="Enable STT">
												<VoidSwitch
													size='sm'
													value={settingsState.globalSettings.sttEnabled}
													onChange={(newVal) => voidSettingsService.setGlobalSetting('sttEnabled', newVal)}
												/>
											</SettingRow>
										</SettingBox>

										{settingsState.globalSettings.sttEnabled && (
											<SettingBox>
												<div className="space-y-4">
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Server URL</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.sttServerUrl}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('sttServerUrl', newVal)}
															placeholder='http://localhost:11434/v1'
															compact={true}
														/>
														<p className="text-[10px] text-void-fg-3/80 mt-1">OpenAI-compatible endpoint for audio transcriptions.</p>
													</div>
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Model</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.sttModel}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('sttModel', newVal)}
															placeholder='whisper-1'
															compact={true}
														/>
													</div>
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">API Key</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.sttApiKey}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('sttApiKey', newVal)}
															placeholder='sk-...'
															compact={true}
															passwordBlur={true}
														/>
													</div>
												</div>
											</SettingBox>
										)}
									</SettingCard>

									<SettingCard
										isDark={isDark}
										title="Text-to-Speech (TTS)"
										description="Have the assistant read responses aloud using an OpenAI-compatible API."
									>
										<SettingBox>
											<SettingRow label="Enable TTS">
												<VoidSwitch
													size='sm'
													value={settingsState.globalSettings.ttsEnabled}
													onChange={(newVal) => voidSettingsService.setGlobalSetting('ttsEnabled', newVal)}
												/>
											</SettingRow>
										</SettingBox>

										{settingsState.globalSettings.ttsEnabled && (
											<SettingBox>
												<div className="space-y-4">
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Server URL</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.ttsServerUrl}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('ttsServerUrl', newVal)}
															placeholder='http://localhost:11434/v1'
															compact={true}
														/>
														<p className="text-[10px] text-void-fg-3/80 mt-1">OpenAI-compatible endpoint for audio speech synthesis.</p>
													</div>
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Model</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.ttsModel}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('ttsModel', newVal)}
															placeholder='tts-1'
															compact={true}
														/>
													</div>
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Voice</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.ttsVoice}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('ttsVoice', newVal)}
															placeholder='alloy'
															compact={true}
														/>
														<p className="text-[10px] text-void-fg-3/80 mt-1">Voice identifier (e.g. alloy, echo, fable, onyx, nova, shimmer).</p>
													</div>
													<div>
														<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">API Key</label>
														<VoidSimpleInputBox
															value={settingsState.globalSettings.ttsApiKey}
															onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('ttsApiKey', newVal)}
															placeholder='sk-...'
															compact={true}
															passwordBlur={true}
														/>
													</div>
												</div>
											</SettingBox>
										)}
									</SettingCard>
								</div>
							</section>
						</ErrorBoundary>
					</div>

					{/* About section */}
					<div className={shouldShowTab('about') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<SettingCard
								isDark={isDark}
								title="About"
							>
								<div className="max-w-lg mx-auto">
									{/* Hero — Brand mark + title + tagline */}
									<div className="flex flex-col items-center text-center space-y-6 py-6">
										<div className="relative">
											<div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" />
											<div className="void-icon w-20 h-20 rounded-2xl relative shadow-lg" />
										</div>

										<div className="space-y-2">
											<p className="text-sm font-semibold uppercase tracking-widest text-void-fg-3">The A-Tech Corporation</p>
											<h2 className="text-3xl font-extrabold tracking-tight text-void-fg-1">
												A-Coder
											</h2>
											<p className="text-sm text-void-fg-3 max-w-sm mx-auto leading-relaxed">
												The open-source, AI-powered code editor built for the next generation of software development.
											</p>
										</div>

										<p className="text-xs font-mono text-void-fg-4">
											v{productService.voidVersion || productService.version}
										</p>
									</div>

									{/* CTA — elevated and more prominent */}
									<div className="mt-6">
										<a
											href="https://github.com/hamishfromatech/a-coder/releases"
											target="_blank"
											rel="noreferrer"
											className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] no-underline"
											style={{
												background: 'var(--void-accent)',
												color: 'var(--void-accent-contrast)',
												boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
											}}
										>
											<Sparkles size={18} />
											<span className="text-sm font-semibold">What&apos;s New</span>
										</a>
									</div>

									{/* Links */}
									<div className="grid grid-cols-2 gap-3 mt-8">
										<a
											href="https://discord.gg/wnh7BVRQGC"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2/60 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] no-underline"
										>
											<MessageCircle size={16} className="text-void-fg-3" />
											<span className="text-sm font-medium text-void-fg-2">Discord</span>
										</a>

										<a
											href="https://theatechcorporation.com"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2/60 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] no-underline"
										>
											<Globe size={16} className="text-void-fg-3" />
											<span className="text-sm font-medium text-void-fg-2">Website</span>
										</a>
									</div>

									{/* Book CTA — Featured, full width, more prominent */}
									<div className="mt-3">
										<a
											href="https://theatechcorporation.com/book"
											target="_blank"
											rel="noreferrer"
											className="group flex items-center justify-between gap-4 px-6 py-4 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] no-underline"
											style={{
												background: 'var(--void-accent)',
												color: 'var(--void-accent-contrast)',
												boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
											}}
										>
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
													<BookOpen size={20} />
												</div>
												<div className="text-left">
													<p className="text-sm font-bold">Own Your AI</p>
													<p className="text-xs opacity-80">Read the book on mastering AI</p>
												</div>
											</div>
											<ChevronRight size={18} className="opacity-70 group-hover:translate-x-1 transition-transform" />
										</a>
									</div>

									{/* Footer */}
									<div className="mt-10 pt-6 border-t border-void-border-2/40 text-center space-y-2">
										<p className="text-xs text-void-fg-3 font-medium">What Void Should&apos;ve Been.</p>
										<p className="text-xs text-void-fg-4">
											© {new Date().getFullYear()} The A-Tech Corporation. All rights reserved.
										</p>
									</div>
								</div>
							</SettingCard>
						</ErrorBoundary>
					</div>

					</div>
				</div>
			</main>
		</div>
	</div>
	);
}
