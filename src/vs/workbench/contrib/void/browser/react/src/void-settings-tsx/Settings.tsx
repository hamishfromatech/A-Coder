/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ProviderName, SettingName, displayInfoOfSettingName, providerNames, VoidStatefulModelInfo, customSettingNamesOfProvider, RefreshableProviderName, refreshableProviderNames, displayInfoOfProviderName, nonlocalProviderNames, localProviderNames, GlobalSettingName, featureNames, displayInfoOfFeatureName, isProviderNameDisabled, FeatureName, hasDownloadButtonsOnModelsProviderNames, subTextMdOfProviderName } from '../../../../common/voidSettingsTypes.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'
import { VoidButtonBgDarken, VoidCustomDropdownBox, VoidInputBox2, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js'
import { useAccessor, useIsDark, useIsOptedOut, useRefreshModelListener, useRefreshModelState, useSettingsState } from '../util/services.js'
import { X, RefreshCw, Loader2, Check, Asterisk, Plus, Cpu, Cloud, Settings2, Info, LayoutGrid, Smartphone, Database, Zap, Sparkles, Box, Globe, ShieldCheck, ArrowRightLeft } from 'lucide-react'
import { URI } from '../../../../../../../base/common/uri.js'
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
	| 'models' | 'localProviders' | 'providers' | 'featureOptions' | 'general' | 'mcp' | 'mobileApi' | 'about' | 'all';

// --- Shared Components ---

export const SettingRow = ({ label, description, children, className = '' }: { label: React.ReactNode, description?: React.ReactNode, children: React.ReactNode, className?: string }) => (
	<div className={`flex items-center justify-between gap-4 ${className}`}>
		<div className="flex flex-col gap-0.5">
			<span className="text-sm font-medium text-void-fg-1">{label}</span>
			{description && <div className="text-xs text-void-fg-3">{description}</div>}
		</div>
		<div className="flex-shrink-0">{children}</div>
	</div>
)

export const SettingBox = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
	<div className={`p-3 bg-void-bg-2/50 rounded-lg border border-void-border-2 ${className}`}>
		{children}
	</div>
)

export const SettingCard = ({ title, description, children, className = '', isDark }: { title: string, description?: string, children: React.ReactNode, className?: string, isDark: boolean }) => (
	<div className={`p-6 rounded-xl border border-void-border-2 ${isDark ? 'bg-[#181818]' : 'bg-void-bg-1'} ${className}`}>
		<div className="mb-4">
			<h3 className="text-base font-medium text-void-fg-1">{title}</h3>
			{description && <p className="text-sm text-void-fg-3 mt-1">{description}</p>}
		</div>
		<div className="space-y-4">
			{children}
		</div>
	</div>
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
	const baseClasses = "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]";

	const variants = {
		primary: "bg-void-accent hover:bg-void-accent/90 text-white shadow-md shadow-void-accent/10 disabled:opacity-50 disabled:active:scale-100",
		secondary: "bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-2 hover:border-void-border-1 text-void-fg-1 shadow-sm hover:shadow-md disabled:opacity-50 disabled:active:scale-100",
		danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/30 disabled:opacity-50 disabled:active:scale-100"
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
		className={`bg-void-accent px-4 py-1.5 text-white rounded-md text-sm font-medium shadow-sm transition-all duration-200 flex items-center gap-2 active:scale-[0.98] ${!disabled ? 'hover:bg-void-accent/90 hover:shadow' : 'opacity-50 cursor-not-allowed disabled:active:scale-100'}`}
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
		<div className="flex items-center justify-between p-3 bg-void-bg-2 rounded-lg border border-void-border-2">
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
			<div className="ml-8 mr-3 mb-2 p-3 bg-void-bg-2 border border-void-border-2 rounded-md text-sm">
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
					{currentOverrides ? '⚠️ Has custom overrides' : 'Showing defaults (edit to customize)'}
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
						className="px-3 py-1 text-xs bg-[#0e70c0] text-white rounded hover:bg-[#0c5fa0]"
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
		{modelDump.map((m, i) => {
			const { isHidden, type, modelName, providerName, providerEnabled } = m

			const isNewProviderName = (i > 0 ? modelDump[i - 1] : undefined)?.providerName !== providerName

			const providerTitle = displayInfoOfProviderName(providerName).title

			const disabled = !providerEnabled
			const value = disabled ? false : !isHidden

			const tooltipName = (
				disabled ? `Add ${providerTitle} to enable`
					: value === true ? 'Show in Dropdown'
						: 'Hide from Dropdown'
			)


			const detailAboutModel = type === 'autodetected' ?
				<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[#0e70c0]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content='Detected locally' />
				: type === 'custom' ?
					<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[#0e70c0]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content='Custom model' />
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
				<AnimatedCheckmarkButton text='Added' className="bg-[#0e70c0] text-white px-3 py-1 rounded-sm" />
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
		getOptionDropdownDetail={(val) => val ? 'Output Search/Replace blocks' : 'Rewrite whole files'}
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
		<div className="border border-void-border-2 bg-void-bg-1 py-3 px-4 rounded-sm my-2">
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

export const Settings = ({ initialTab }: { initialTab?: Tab }) => {
	const isDark = useIsDark()
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
		{ tab: 'general', label: 'General', icon: Settings2 },
		{ tab: 'mcp', label: 'MCP', icon: Database },
		{ tab: 'mobileApi', label: 'Mobile API', icon: Smartphone },
		{ tab: 'about', label: 'About', icon: Info },
		{ tab: 'all', label: 'All Settings', icon: LayoutGrid },
	];
	const shouldShowTab = (tab: Tab) => selectedSection === 'all' || selectedSection === tab;
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const environmentService = accessor.get('IEnvironmentService')
	const nativeHostService = accessor.get('INativeHostService')
	const settingsState = useSettingsState()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const chatThreadsService = accessor.get('IChatThreadService')
	const notificationService = accessor.get('INotificationService')
	const mcpService = accessor.get('IMCPService')
	const storageService = accessor.get('IStorageService')
	const metricsService = accessor.get('IMetricsService')
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
			<div className={`flex h-full w-full bg-void-bg-2`} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
				{/* ──────────────  SIDEBAR  ────────────── */}
				<aside
					className={`w-64 h-full flex-shrink-0 flex flex-col border-r border-void-border-2
						${isDark ? 'bg-[#181818]' : 'bg-void-bg-1'}
					`}
				>
				{/* Logo */}
				<div className="flex items-center gap-3 px-6 py-6 select-none">
					<div className="void-void-icon w-8 h-8 rounded-full opacity-90" />
					<div className="text-sm font-semibold text-void-fg-1 tracking-tight">A-Coder</div>
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
									w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200
									${isActive
										? 'bg-void-accent/10 text-void-accent'
										: 'text-void-fg-3 hover:bg-void-bg-2 hover:text-void-fg-1'
									}
								`}
							>
								<Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
								{label}
							</button>
						);
					})}
				</nav>

				{/* Footer/Version if needed */}
				<div className="p-4 border-t border-void-border-2 text-xs text-void-fg-4">
					v0.0.1
				</div>
			</aside>

			{/* ───────────── MAIN PANE ───────────── */}
			<main className={`flex-1 h-full overflow-y-auto ${isDark ? 'bg-[#121212]' : 'bg-void-bg-2'}`}>
				<div className="max-w-5xl mx-auto px-8 py-8 pb-32">

					<div className="flex items-center justify-between mb-8">
						<h1 className='text-3xl font-semibold text-void-fg-1 tracking-tight'>Settings</h1>
						<ErrorBoundary>
							<RedoOnboardingButton className="text-xs px-3 py-1.5 rounded-full border border-void-border-2 hover:bg-void-bg-2 transition-colors" />
						</ErrorBoundary>
					</div>

					{/* Models section */}
					<div className={shouldShowTab('models') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-4">
									<h2 className="text-xl font-medium text-void-fg-1">Models</h2>
									<p className="text-sm text-void-fg-3 mt-1">Manage your AI models and providers.</p>
								</div>

								<SettingCard
									isDark={isDark}
									title="Model Management"
									description="Configure which models are available in the editor."
								>
									<SettingBox className="p-0 overflow-hidden">
										<ModelDump />
									</SettingBox>

									<SettingBox className="space-y-4">
										<AutoDetectLocalModelsToggle />
										<div className="pt-4 border-t border-void-border-2">
											<h4 className="text-xs font-medium text-void-fg-3 mb-3 uppercase tracking-wide">Available Provider Models</h4>
											<RefreshableModels />
										</div>
									</SettingBox>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* Local Providers section */}
					<div className={shouldShowTab('localProviders') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6">
									<h2 className="text-xl font-medium text-void-fg-1">Local Providers</h2>
									<p className="text-sm text-void-fg-3 mt-1">Connect to models running on your own machine.</p>
								</div>

								<SettingCard
									isDark={isDark}
									title="Local Configuration"
									description="Configure local LLM providers like Ollama, vLLM, and LM Studio."
								>
									<SettingBox className="mb-6">
										<h3 className="text-sm font-medium mb-3">Setup Instructions</h3>
										<OllamaSetupInstructions sayWeAutoDetect={true} />
									</SettingBox>

									<SettingBox className="space-y-6">
										<VoidProviderSettings providerNames={localProviderNames} />
									</SettingBox>
								</SettingCard>
							</section>
						</ErrorBoundary>
					</div>

					{/* Main Providers section */}
					<div className={shouldShowTab('providers') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6">
									<h2 className="text-xl font-medium text-void-fg-1">Main Providers</h2>
									<p className="text-sm text-void-fg-3 mt-1">Configure cloud-based AI providers.</p>
								</div>

								<SettingCard
									isDark={isDark}
									title="Cloud Configuration"
									description="Manage API keys and endpoints for Anthropic, OpenAI, and other cloud services."
								>
									<SettingBox className="space-y-6">
										<VoidProviderSettings providerNames={nonlocalProviderNames} />
									</SettingBox>
								</SettingCard>
							</section>
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
																		options={['normal', 'gather', 'agent', 'student']}
																		selectedOption={settingsState.globalSettings.chatMode}
																		onChangeOption={(newVal) => voidSettingsService.setGlobalSetting('chatMode', newVal as any)}
																		getOptionDisplayName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																		getOptionDropdownName={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
																		getOptionsEqual={(a, b) => a === b}
																		className="w-full max-w-xs bg-void-bg-1 border border-void-border-2 rounded-lg px-2 py-1.5 text-sm"
																		arrowTouchesText={false}
																	/>
																</div>

																{settingsState.globalSettings.chatMode === 'student' && (
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

														{/* Morph Fast Apply Card */}
														<SettingCard
															isDark={isDark}
															title="Morph Fast Apply"
															description="Use Morph API for intelligent and faster code application."
														>
															<SettingBox>
																<SettingRow label="Enabled">
																	<VoidSwitch
																		size='sm'
																		value={settingsState.globalSettings.enableMorphFastApply}
																		onChange={(newVal) => voidSettingsService.setGlobalSetting('enableMorphFastApply', newVal)}
																	/>
																</SettingRow>

																{settingsState.globalSettings.enableMorphFastApply && (
																	<div className="mt-4 pt-4 border-t border-void-border-2 space-y-4">
																		<div>
																			<label className="text-xs font-medium text-void-fg-3 uppercase tracking-wide mb-2 block">Morph API Key</label>
																			<VoidSimpleInputBox
																				value={settingsState.globalSettings.morphApiKey}
																				onChangeValue={(newVal) => voidSettingsService.setGlobalSetting('morphApiKey', newVal)}
																				placeholder='Morph API Key'
																				passwordBlur={true}
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
										{/* General section */}
					<div className={shouldShowTab('general') ? 'space-y-8' : 'hidden'}>
						<ErrorBoundary>
							<section className="space-y-6">
								<div className="mb-6">
									<h2 className="text-xl font-medium text-void-fg-1">General</h2>
									<p className="text-sm text-void-fg-3 mt-1">System preferences and maintenance.</p>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* One-Click Switch */}
									<SettingCard
										isDark={isDark}
										title="Migrate Settings"
										description="Quickly import your preferences from other editors."
									>
										<SettingBox className="flex flex-col gap-3">
											<OneClickSwitchButton fromEditor="VS Code" />
											<OneClickSwitchButton fromEditor="Cursor" />
											<OneClickSwitchButton fromEditor="Windsurf" />
										</SettingBox>
									</SettingCard>

									{/* Data Management */}
									<SettingCard
										isDark={isDark}
										title="Data Management"
										description="Import, export, or reset your local application data."
									>
										<div className="space-y-4">
											<SettingBox>
												<h4 className="text-xs font-medium text-void-fg-3 mb-3 uppercase tracking-wide">Settings</h4>
												<div className="grid grid-cols-2 gap-2">
													<input key={2 * s} ref={fileInputSettingsRef} type='file' accept='.json' className='hidden' onChange={handleUpload('Settings')} />
													<SettingsButton className='w-full' onClick={() => fileInputSettingsRef.current?.click()}>Import</SettingsButton>
													<SettingsButton className='w-full' onClick={() => onDownload('Settings')}>Export</SettingsButton>
												</div>
											</SettingBox>
											<SettingBox>
												<h4 className="text-xs font-medium text-void-fg-3 mb-3 uppercase tracking-wide">Chats</h4>
												<div className="grid grid-cols-2 gap-2">
													<input key={2 * s + 1} ref={fileInputChatsRef} type='file' accept='.json' className='hidden' onChange={handleUpload('Chats')} />
													<SettingsButton className='w-full' onClick={() => fileInputChatsRef.current?.click()}>Import</SettingsButton>
													<SettingsButton className='w-full' onClick={() => onDownload('Chats')}>Export</SettingsButton>
												</div>
											</SettingBox>
											<div className="pt-2">
												<ConfirmButton className='w-full' onConfirm={() => voidSettingsService.resetState()}>
													Reset All Settings
												</ConfirmButton>
											</div>
										</div>
									</SettingCard>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* AI Instructions */}
									<SettingCard
										isDark={isDark}
										title="Global System Instructions"
										description="These instructions are included with every AI request to customize behavior."
									>
										<SettingBox>
											<AIInstructionsBox />
											<div className="mt-4 pt-4 border-t border-void-border-2">
												<SettingRow label="Disable System Message" description="Stop sending the default system prompt.">
													<VoidSwitch
														size='sm'
														value={!!settingsState.globalSettings.disableSystemMessage}
														onChange={(newValue) => voidSettingsService.setGlobalSetting('disableSystemMessage', newValue)}
													/>
												</SettingRow>
											</div>
										</SettingBox>
									</SettingCard>

									{/* Privacy Card */}
									<SettingCard
										isDark={isDark}
										title="Privacy & Analytics"
										description="Control how A-Coder handles your data and telemetry."
									>
										<div className="space-y-4">
											<SettingBox>
												<SettingRow
													label="Anonymous Usage Reporting"
													description="Share anonymous usage data to help us improve A-Coder. We never collect code or personal information."
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
													label="Reset Onboarding"
													description="Reset the onboarding process to see the welcome screen again."
												>
													<ErrorBoundary>
														<div
															className="text-xs px-3 py-1.5 rounded-md border border-void-border-2 hover:bg-void-bg-2 transition-colors bg-void-bg-1 text-void-fg-1 cursor-pointer font-medium"
															onClick={() => { voidSettingsService.setGlobalSetting('isOnboardingComplete', false) }}
														>
															Reset
														</div>
													</ErrorBoundary>
												</SettingRow>
											</SettingBox>
										</div>
									</SettingCard>
								</div>
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
									<SettingsButton className='px-4 py-2' onClick={async () => { await mcpService.revealMCPConfigFile() }}>
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
													className='w-full bg-void-bg-2 text-void-fg-1 px-3 py-2 rounded-md border border-void-border-2 focus:border-void-accent outline-none transition-colors'
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
													className='w-full bg-void-bg-2 text-void-fg-1 px-3 py-2 rounded-md border border-void-border-2 focus:border-void-accent outline-none transition-colors'
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
																<code className="flex-1 text-xs font-mono text-void-fg-2 truncate">{token}</code>
																<button
																	onClick={() => voidSettingsService.setGlobalSetting('apiTokens', settingsState.globalSettings.apiTokens.filter((_, i) => i !== idx))}
																	className="text-red-400 hover:text-red-300 transition-colors"
																>
																	<X size={14} />
																</button>
															</div>
														))
													)}
												</div>
												<button
													className="mt-3 w-full py-2 bg-[#0e70c0] text-white rounded-md hover:bg-[#1177cb] transition-all font-medium text-sm shadow-sm"
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
									<div className="void-void-icon w-24 h-24 rounded-full mx-auto mb-6 opacity-90 shadow-lg" />
									<h2 className="text-2xl font-bold text-void-fg-1 mb-2">A-Coder</h2>
									<p className="text-sm text-void-fg-3 mb-8 max-w-lg mx-auto leading-relaxed">
										The open-source, AI-powered code editor built for the next generation of software development.
									</p>

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
