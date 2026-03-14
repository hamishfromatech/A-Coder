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
import { X, RefreshCw, Loader2, Check, Asterisk, Plus, Cpu, Cloud, Settings2, Info, LayoutGrid, Smartphone, Database, Zap, Sparkles, Box, Globe, ShieldCheck, ArrowRightLeft, Search, Copy, LogIn, LogOut, User, Download, Star } from 'lucide-react'
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
import { useMCPServiceState } from '../util/services.js';
import { OPT_OUT_KEY } from '../../../../common/storageKeys.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import '../styles.css'

type Tab =
	| 'models' | 'localProviders' | 'providers' | 'featureOptions' | 'mediaGeneration' | 'general' | 'mcp' | 'skills' | 'mobileApi' | 'about' | 'all';

// --- Shared Components ---

export const SettingRow = ({ label, description, children, className = '' }: { label: React.ReactNode, description?: React.ReactNode, children: React.ReactNode, className?: string }) => (
	<div className={`flex items-start justify-between gap-10 py-3 ${className}`}>
		<div className="flex flex-col gap-1.5 flex-1 min-w-0">
			<span className="text-[13px] font-medium text-void-fg-1">{label}</span>
			{description && <div className="text-[12px] text-void-fg-3 leading-relaxed opacity-80">{description}</div>}
		</div>
		<div className="flex-shrink-0 pt-0.5">{children}</div>
	</div>
)

// Cursor-inspired minimal setting components
export const SettingBox = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
	<div className={`p-5 void-card ${className}`}>
		{children}
	</div>
)

export const SettingCard = ({ title, description, children, className = '' }: { title: string, description?: string, children: React.ReactNode, className?: string }) => (
	<div className={`py-10 first:pt-0 ${className}`}>
		<div className="mb-8">
			<h3 className="text-[18px] font-semibold text-void-fg-1 tracking-tight">{title}</h3>
			{description && <p className="text-[13px] text-void-fg-3 mt-1.5 leading-relaxed opacity-90">{description}</p>}
		</div>
		<div className="space-y-6">
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


// premium button component
const SettingsButton = ({ children, disabled, onClick, className, variant = 'secondary' }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; className?: string, variant?: 'primary' | 'secondary' | 'danger' }) => {
	const baseClasses = "px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

	const variants = {
		primary: "bg-void-accent hover:bg-void-accent/90 text-white shadow-sm hover:shadow-md",
		secondary: "void-btn-secondary hover:border-void-border-1 text-void-fg-1",
		danger: "bg-void-error/10 border border-void-error/20 text-void-error hover:bg-void-error hover:text-white"
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
				className={`p-2 rounded-md hover:bg-void-bg-3 transition-colors ${state === 'refreshing' ? 'opacity-50 cursor-not-allowed' : ''}`}
				disabled={state === 'refreshing' || justFinished !== null}
				onClick={() => {
					refreshModelService.startRefreshingModels(providerName, { enableProviderOnSuccess: false, doNotFire: false })
					metricsService.capture('Click', { providerName, action: 'Refresh Models' })
				}}
				title="Refresh Models"
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
				className="!bg-transparent !border-none !p-0 text-sm"
				compact={true}
			/>
		</div>

		{filteredModelDump.map((m, i) => {
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
		})}

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
			{!subTextMd ? null : <div className='py-1 px-3 opacity-50 text-sm'>
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
					<ArrowRightLeft size={16} className="text-void-accent opacity-80" />
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

		// Parse GitHub URL
		const githubMatch = installUrl.match(/github\.com\/([^/]+\/[^/]+)/);
		if (!githubMatch) {
			notificationService.error('Invalid GitHub URL. Use format: https://github.com/user/repo');
			return;
		}

		const repoPath = githubMatch[1];
		const skillName = repoPath.split('/')[1].replace(/-skill$/, '');

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

			// Clone from GitHub using terminal service
			const terminalToolService = accessor.get('ITerminalToolService');
			const cloneUrl = `https://github.com/${repoPath}.git`;
			const skillDir = URI.joinPath(skillsDir, skillName);

			const { resPromise } = await terminalToolService.runCommand(
				`git clone --depth 1 "${cloneUrl}" "${skillDir.fsPath}"`,
				{ type: 'temporary', cwd: skillsDir.fsPath }
			);

			const result = await resPromise;
			if (result.resolveReason.type === 'done' && result.resolveReason.exitCode === 0) {
				// Remove .git folder to save space
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

			// Parse GitHub URL to get clone URL
			const githubMatch = skill.url.match(/github\.com\/([^/]+\/[^/]+)/);
			if (!githubMatch) {
				throw new Error('Invalid skill URL');
			}

			const cloneUrl = `https://github.com/${githubMatch[1]}.git`;

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
				notificationService.info(`Skill "${skill.name}" installed successfully!`);
				refreshSkills();
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
		{ tab: 'models', label: 'Models', icon: Box },
		{ tab: 'localProviders', label: 'Local Providers', icon: Cpu },
		{ tab: 'providers', label: 'Main Providers', icon: Globe },
		{ tab: 'featureOptions', label: 'Feature Options', icon: Sparkles },
		{ tab: 'mediaGeneration', label: 'Media Generation', icon: Search },
		{ tab: 'general', label: 'General', icon: Settings2 },
		{ tab: 'mcp', label: 'MCP', icon: Database },
		{ tab: 'skills', label: 'Skills', icon: Zap },
		{ tab: 'mobileApi', label: 'Mobile API', icon: Smartphone },
		{ tab: 'about', label: 'About', icon: Info },
		{ tab: 'all', label: 'All Settings', icon: LayoutGrid },
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
				{/* ──────────────  SIDEBAR  ────────────── */}
				<aside
					className={`w-56 h-full flex-shrink-0 flex flex-col border-r border-void-border-2/50
						${isDark ? 'bg-void-depth-elevated/30' : 'bg-void-depth-elevated/30'}
					`}
				>
				{/* Logo */}
				<div className="flex items-center gap-3 px-5 py-5 select-none">
					<div className="@@void-void-icon w-7 h-7 rounded-full opacity-90" />
					<div className="text-[13px] font-semibold text-void-fg-1 tracking-tight">A-Coder</div>
				</div>

				{/* Navigation */}
				<nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
					{navItems.map(({ tab, label, icon: Icon }) => {
						const isActive = selectedSection === tab;
						return (
							<button
								key={tab}
								onClick={() => {
									if (tab === 'all') {
										setSelectedSection('all');
									} else {
										setSelectedSection(tab);
									}
								}}
								className={`
									w-full flex items-center gap-3 px-3 py-2 text-[13px] rounded-lg transition-all duration-200
									${isActive
										? 'bg-void-accent/10 text-void-accent font-medium'
										: 'text-void-fg-3 hover:bg-void-depth-floating/50 hover:text-void-fg-1'
									}
								`}
							>
								<Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
								{label}
							</button>
						);
					})}
				</nav>

				{/* Footer/Version */}
				<div className="px-5 py-4 border-t border-void-border-2/50 text-[11px] text-void-fg-4">
					v{productService.voidVersion || productService.version}
				</div>
			</aside>

			{/* ───────────── MAIN PANE ───────────── */}
			<main className={`flex-1 h-full overflow-y-auto bg-void-depth-base`}>
				<div className="max-w-3xl mx-auto px-8 py-10 pb-32">

					{/* Header */}
					<div className="flex items-center justify-between mb-10">
						<div>
							<h1 className='text-[22px] font-semibold text-void-fg-1 tracking-tight'>Settings</h1>
							<p className="text-[13px] text-void-fg-3 mt-1">Configure your A-Coder experience</p>
						</div>
						<ErrorBoundary>
							<RedoOnboardingButton className="text-[11px] px-3 py-1.5 rounded-full border border-void-border-2/50 hover:bg-void-depth-elevated/50 transition-colors text-void-fg-3" />
						</ErrorBoundary>
					</div>

					{/* Models section */}
					<div className={shouldShowTab('models') ? '' : 'hidden'}>
						<ErrorBoundary>
							<SettingCard title="Models" description="Manage your AI models and providers." isDark={isDark}>
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
							<SettingCard title="Local Providers" description="Connect to models running on your own machine." isDark={isDark}>
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
							<SettingCard title="Main Providers" description="Configure cloud-based AI providers." isDark={isDark}>
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
														<h2 className="text-xl font-medium text-void-fg-1">Feature Options</h2>
														<p className="text-sm text-void-fg-3 mt-1">Customize A-Coder's behavior and capabilities.</p>
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
															description="Configure behavior for AI Agent mode."
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
													</div>
												</section>
											</ErrorBoundary>
										</div>

										{/* Media Generation section */}
										<div className={shouldShowTab('mediaGeneration') ? 'space-y-8' : 'hidden'}>
											<ErrorBoundary>
												<section className="space-y-6">
													<div className="mb-6">
														<h2 className="text-xl font-medium text-void-fg-1">Media Generation</h2>
														<p className="text-sm text-void-fg-3 mt-1">Configure image generation using an OpenAI-compatible API (e.g., Ollama).</p>
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
																		<p className="text-[10px] text-void-fg-3 mt-1">The base URL of your OpenAI-compatible image generation API (e.g., http://localhost:11434/v1 for Ollama).</p>
																	</div>

																	<div>
																		<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Image Model</label>
																		<div className="text-sm text-void-fg-1">x/flux2-klein:4b</div>
																		<p className="text-[10px] text-void-fg-3 mt-1">The image model is fixed to x/flux2-klein:4b.</p>
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
									<p className="text-[13px] text-void-fg-3 mt-1.5 opacity-80">System preferences and application maintenance.</p>
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
														<p className="text-[12px] text-void-fg-3 opacity-80">Export or import your provider configurations and UI preferences.</p>
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
														<p className="text-[12px] text-void-fg-3 opacity-80">Backup your conversations and tool usage history.</p>
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
										<h2 className="text-xl font-medium text-void-fg-1">MCP Servers</h2>
										<p className="text-sm text-void-fg-3 mt-1">Manage Model Context Protocol servers.</p>
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

					{/* Skills section */}
					<div className={shouldShowTab('skills') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6 flex items-center justify-between">
									<div>
										<h2 className="text-xl font-medium text-void-fg-1">AI Skills</h2>
										<p className="text-sm text-void-fg-3 mt-1">Specialized instructions to enhance your AI's expertise.</p>
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
												<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Port</label>
												<input
													type='number'
													className='w-full void-input text-void-fg-1'
													value={settingsState.globalSettings.apiPort}
													onChange={(e) => {
														const port = parseInt(e.target.value);
														if (port >= 1024 && port <= 65535) voidSettingsService.setGlobalSetting('apiPort', port);
													}}
													min={1024}
													max={65535}
												/>
											</SettingBox>
											<SettingBox>
												<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Tunnel URL (Optional)</label>
												<input
													type='text'
													className='w-full void-input text-void-fg-1'
													value={settingsState.globalSettings.apiTunnelUrl || ''}
													onChange={(e) => voidSettingsService.setGlobalSetting('apiTunnelUrl', e.target.value || undefined)}
													placeholder='https://acoder-api.example.com'
												/>
											</SettingBox>
										</div>

										<div className="flex flex-col h-full">
											<SettingBox className="flex flex-col h-full">
												<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Access Tokens</label>
												<div className="flex-1 bg-void-bg-2 rounded-md border border-void-border-2 p-2 space-y-2 overflow-y-auto max-h-48">
													{settingsState.globalSettings.apiTokens.length === 0 ? (
														<div className="text-center py-4 text-void-fg-4 text-sm">No tokens generated</div>
													) : (
														settingsState.globalSettings.apiTokens.map((token, idx) => (
															<div key={idx} className="flex items-center gap-2 p-2 bg-void-bg-1 rounded border border-void-border-1">
																<code className="flex-1 text-xs font-mono text-void-fg-2 select-text cursor-text" style={{ userSelect: 'text' }}>{token}</code>
																<button
																	type="button"
																	onClick={() => {
																		try {
																			// Try fallback method first (more reliable from click events)
																			const textArea = document.createElement('textarea');
																			textArea.value = token;
																			textArea.style.position = 'fixed';
																			textArea.style.left = '-9999px';
																			document.body.appendChild(textArea);
																			textArea.select();
																			const success = document.execCommand('copy');
																			document.body.removeChild(textArea);

																			if (success) return;
																		} catch (e) {
																			// Fall through to clipboard service
																		}

																		// Fallback to clipboard service
																		if (clipboardService) {
																			clipboardService.writeText(token).catch(err => console.error('Failed to copy:', err));
																		} else if (navigator.clipboard) {
																			navigator.clipboard.writeText(token).catch(err => console.error('Failed to copy:', err));
																		}
																	}}
																	className="text-blue-400 hover:text-blue-300 transition-colors"
																	title="Copy token"
																>
																	<Copy size={14} />
																</button>
																<button
																	type="button"
																	onClick={() => voidSettingsService.setGlobalSetting('apiTokens', settingsState.globalSettings.apiTokens.filter((_, i) => i !== idx))}
																	className="text-red-400 hover:text-red-300 transition-colors"
																	title="Delete token"
																>
																	<X size={14} />
																</button>
															</div>
														))
													)}
												</div>
												<button
													className="mt-3 w-full py-2 bg-[var(--vscode-button-background)] text-white rounded-md hover:bg-[var(--vscode-button-hoverBackground)] transition-all font-medium text-sm shadow-sm"
													onClick={async () => {
														const token = `acoder_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
														voidSettingsService.setGlobalSetting('apiTokens', [...settingsState.globalSettings.apiTokens, token]);
													}}
												>
													Generate New Token
												</button>
											</SettingBox>
										</div>
									</div>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* About section */}
					<div className={shouldShowTab('about') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<SettingCard
								isDark={isDark}
								title="About A-Coder"
								className="text-center"
							>
								<div className="py-4">
									<div className="@@void-void-icon w-24 h-24 rounded-full mx-auto mb-6 opacity-90 shadow-lg" />
									<h2 className="text-2xl font-bold text-void-fg-1 mb-2">A-Coder</h2>
									<p className="text-xs text-void-fg-3 mb-4 font-mono">
										Version: {productService.voidVersion || productService.version} ({productService.voidRelease || '0000'})
									</p>
									<p className="text-sm text-void-fg-3 mb-4 max-w-lg mx-auto leading-relaxed">
										The open-source, AI-powered code editor built for the next generation of software development.
									</p>

									<div className="max-w-2xl mx-auto mb-6">
										<a
											href="https://github.com/hamishfromatech/a-coder/releases"
											target="_blank"
											rel="noreferrer"
											className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-void-accent hover:bg-void-accent/90 text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md no-underline"
										>
											<Sparkles size={18} />
											<span>What's New</span>
										</a>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
										<a href="https://github.com/hamishfromatech/a-coder" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 p-4 rounded-xl bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
											<span className="text-sm font-medium">GitHub</span>
										</a>
										<a href="https://theatechcorporation.com" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 p-4 rounded-xl bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
											<span className="text-sm font-medium">Website</span>
										</a>

										<a href="https://theatechcorporation.com/book" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 p-4 rounded-xl bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
											<span className="text-sm font-medium">Buy Our Book</span>
										</a>
									</div>
								</div>

								<SettingBox className="mt-8 text-center py-6">
									<div className="text-xs text-void-fg-4 space-y-1">
										<p className="font-medium text-void-fg-3">What Void Should've Been.</p>
										<p>© 2026 The A-Tech Corporation. All rights reserved.</p>
									</div>
								</SettingBox>
							</SettingCard>
						</ErrorBoundary>
					</div>

				</div>
			</main>
		</div>
	</div>
	);
}
