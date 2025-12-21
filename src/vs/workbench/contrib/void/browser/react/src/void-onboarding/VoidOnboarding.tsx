/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { Brain, Check, ChevronLeft, ChevronRight, DollarSign, ExternalLink, Lock, X } from 'lucide-react';
import { displayInfoOfProviderName, ProviderName, providerNames, localProviderNames, featureNames, FeatureName, isFeatureNameDisabled } from '../../../../common/voidSettingsTypes.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { OllamaSetupInstructions, OneClickSwitchButton, SettingsForProvider, ModelDump, SettingBox, SettingRow, SettingCard } from '../void-settings-tsx/Settings.js';
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { isLinux } from '../../../../../../../base/common/platform.js';

const OVERRIDE_VALUE = false

export const VoidOnboarding = () => {

	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete || OVERRIDE_VALUE

	const isDark = useIsDark()

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div
				className={`
					fixed inset-0 z-[99999]
					bg-void-bg-1/40 backdrop-blur-[32px]
					overflow-y-auto
					transition-all duration-1000 ${isOnboardingComplete ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
				`}
				style={{ 
					minHeight: '100vh', 
					display: 'flex', 
					alignItems: 'center', 
					justifyContent: 'center',
					background: isDark 
						? 'radial-gradient(circle at center, rgba(30, 30, 30, 0.7) 0%, rgba(15, 15, 15, 0.9) 100%)' 
						: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.7) 0%, rgba(240, 240, 240, 0.9) 100%)'
				}}
			>
				{/* Sophisticated Vignette */}
				<div className="fixed inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.3)] z-[-1]" />
				
				<ErrorBoundary>
					<VoidOnboardingContent />
				</ErrorBoundary>
			</div>
		</div>
	)
}

const VoidIcon = () => {
	const accessor = useAccessor()
	const themeService = accessor.get('IThemeService')

	const divRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		// void icon style
		const updateTheme = () => {
			const theme = themeService.getColorTheme().type
			const isDark = theme === ColorScheme.DARK || theme === ColorScheme.HIGH_CONTRAST_DARK
			if (divRef.current) {
				divRef.current.style.maxWidth = '220px'
				divRef.current.style.opacity = '50%'
				divRef.current.style.filter = isDark ? '' : 'invert(1)' //brightness(.5)
			}
		}
		updateTheme()
		const d = themeService.onDidColorThemeChange(updateTheme)
		return () => d.dispose()
	}, [])

	return <div ref={divRef} className='@@void-void-icon' />
}

const FADE_DURATION_MS = 2000

const FadeIn = ({ children, className, delayMs = 0, durationMs, ...props }: { children: React.ReactNode, delayMs?: number, durationMs?: number, className?: string } & React.HTMLAttributes<HTMLDivElement>) => {

	const [opacity, setOpacity] = useState(0)

	const effectiveDurationMs = durationMs ?? FADE_DURATION_MS

	useEffect(() => {

		const timeout = setTimeout(() => {
			setOpacity(1)
		}, delayMs)

		return () => clearTimeout(timeout)
	}, [setOpacity, delayMs])


	return (
		<div className={className} style={{ opacity, transition: `opacity ${effectiveDurationMs}ms ease-in-out` }} {...props}>
			{children}
		</div>
	)
}

// Onboarding

// =============================================
//  New AddProvidersPage Component and helpers
// =============================================

const tabNames = ['Free', 'Paid', 'Local'] as const;

type TabName = typeof tabNames[number] | 'Cloud/Other';

// Data for cloud providers tab
const cloudProviders: ProviderName[] = ['googleVertex', 'liteLLM', 'microsoftAzure', 'awsBedrock', 'openAICompatible'];

// Data structures for provider tabs
const providerNamesOfTab: Record<TabName, ProviderName[]> = {
	Free: ['gemini', 'openRouter'],
	Local: localProviderNames,
	Paid: providerNames.filter(pn => !(['gemini', 'openRouter', ...localProviderNames, ...cloudProviders] as string[]).includes(pn)) as ProviderName[],
	'Cloud/Other': cloudProviders,
};

const descriptionOfTab: Record<TabName, string> = {
	Free: `Providers with a 100% free tier. Add as many as you'd like!`,
	Paid: `Connect directly with any provider (bring your own key).`,
	Local: `Active providers should appear automatically. Add as many as you'd like! `,
	'Cloud/Other': `Add as many as you'd like! Reach out for custom configuration requests.`,
};


const featureNameMap: { display: string, featureName: FeatureName }[] = [
	{ display: 'Chat', featureName: 'Chat' },
	{ display: 'Quick Edit', featureName: 'Ctrl+K' },
	{ display: 'Autocomplete', featureName: 'Autocomplete' },
	{ display: 'Fast Apply', featureName: 'Apply' },
	{ display: 'Source Control', featureName: 'SCM' },
];

const AddProvidersPage = ({ pageIndex, setPageIndex }: { pageIndex: number, setPageIndex: (index: number) => void }) => {
	const [currentTab, setCurrentTab] = useState<TabName>('Free');
	const settingsState = useSettingsState();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const isDark = useIsDark();

	// Clear error message after 5 seconds
	useEffect(() => {
		let timeoutId: NodeJS.Timeout | null = null;

		if (errorMessage) {
			timeoutId = setTimeout(() => {
				setErrorMessage(null);
			}, 5000);
		}

		// Cleanup function to clear the timeout if component unmounts or error changes
		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [errorMessage]);

	return (
		<div className="w-full max-w-5xl mx-auto px-4">
			<div className="flex flex-col gap-8">
				<div className="text-center space-y-2">
					<h1 className="text-4xl font-bold text-void-fg-1 tracking-tight">Add a Provider</h1>
					<p className="text-void-fg-3 text-lg">Choose how you want to power your AI assistant.</p>
				</div>

				<div className="flex flex-col md:flex-row gap-8">
					{/* Left Column - Navigation */}
					<div className="md:w-1/4 flex flex-col gap-6">
						<div className="bg-void-bg-2/50 p-2 rounded-xl border border-void-border-2 space-y-1">
							{[...tabNames, 'Cloud/Other'].map(tab => (
								<button
									key={tab}
									className={`w-full py-2.5 px-4 rounded-lg text-left text-sm font-medium transition-all duration-200
										${currentTab === tab
											? 'bg-void-accent/10 text-void-accent shadow-sm'
											: 'text-void-fg-3 hover:bg-void-bg-2 hover:text-void-fg-1'}
									`}
									onClick={() => {
										setCurrentTab(tab as TabName);
										setErrorMessage(null);
									}}
								>
									{tab}
								</button>
							))}
						</div>

						{/* Feature Checklist Card */}
						<SettingCard title="Features Enabled" isDark={isDark} className="p-4">
							<div className="space-y-3">
								{featureNameMap.map(({ display, featureName }) => {
									const hasModel = settingsState.modelSelectionOfFeature[featureName] !== null;
									return (
										<div key={featureName} className="flex items-center justify-between text-xs">
											<span className="text-void-fg-2">{display}</span>
											{hasModel ? (
												<div className="bg-emerald-500/10 p-0.5 rounded-full">
													<Check className="w-3 h-3 text-emerald-500" />
												</div>
											) : (
												<div className="w-2 h-2 rounded-full bg-void-bg-3 border border-void-border-2"></div>
											)}
										</div>
									);
								})}
							</div>
						</SettingCard>
					</div>

					{/* Right Column - Content */}
					<div className="flex-1 space-y-6">
						<SettingCard 
							isDark={isDark}
							title={currentTab}
							description={descriptionOfTab[currentTab]}
						>
							<div className="space-y-8">
								{providerNamesOfTab[currentTab].map((providerName) => (
									<SettingBox key={providerName} className="space-y-4">
										<div className="flex items-center justify-between">
											<h3 className="text-lg font-semibold text-void-fg-1">
												{displayInfoOfProviderName(providerName).title}
												{providerName === 'gemini' && (
													<span
														data-tooltip-id="void-tooltip-provider-info"
														data-tooltip-content="Gemini 2.5 Pro offers 25 free messages a day, and Gemini 2.5 Flash offers 500. We recommend using models down the line as you run out of free credits."
														data-tooltip-place="right"
														className="ml-1 text-xs align-top text-blue-400 cursor-help"
													>*</span>
												)}
												{providerName === 'openRouter' && (
													<span
														data-tooltip-id="void-tooltip-provider-info"
														data-tooltip-content="OpenRouter offers 50 free messages a day, and 1000 if you deposit $10. Only applies to models labeled ':free'."
														data-tooltip-place="right"
														className="ml-1 text-xs align-top text-blue-400 cursor-help"
													>*</span>
												)}
											</h3>
										</div>
										
										<div className="bg-void-bg-1 p-4 rounded-lg border border-void-border-2">
											<SettingsForProvider providerName={providerName} showProviderTitle={false} showProviderSuggestions={true} />
										</div>
										
										{providerName === 'ollama' && (
											<div className="mt-4 p-4 bg-void-bg-2/30 rounded-lg border border-dashed border-void-border-2">
												<OllamaSetupInstructions />
											</div>
										)}
									</SettingBox>
								))}

								{(currentTab === 'Local' || currentTab === 'Cloud/Other') && (
									<SettingBox>
										<div className="flex items-center gap-2 mb-4">
											<div className="text-lg font-semibold text-void-fg-1">Models</div>
										</div>

										{currentTab === 'Local' && (
											<p className="text-sm text-void-fg-3 mb-4">Local models should be detected automatically. You can add custom models below.</p>
										)}

										<div className="bg-void-bg-1 rounded-lg border border-void-border-2 overflow-hidden">
											<ModelDump filteredProviders={currentTab === 'Local' ? localProviderNames : cloudProviders} />
										</div>
									</SettingBox>
								)}
							</div>
						</SettingCard>

						{/* Navigation */}
						<div className="flex flex-col items-end gap-4 pt-4">
							{errorMessage && (
								<div className="bg-amber-500/10 text-amber-500 px-4 py-2 rounded-lg text-sm border border-amber-500/20 animate-in fade-in slide-in-from-top-1">
									{errorMessage}
								</div>
							)}
							<div className="flex items-center gap-3">
								<PreviousButton onClick={() => setPageIndex(pageIndex - 1)} />
								<NextButton
									onClick={() => {
										const isDisabled = isFeatureNameDisabled('Chat', settingsState)

										if (!isDisabled) {
											setPageIndex(pageIndex + 1);
											setErrorMessage(null);
										} else {
											setErrorMessage("Please set up at least one Chat model before moving on.");
										}
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// =============================================
//  OnboardingPage structure notes
// =============================================

const NextButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {

	const { disabled, ...buttonProps } = props;

	return (
		<button
			onClick={disabled ? undefined : onClick}
			onDoubleClick={onClick}
			className={`px-8 py-2.5 bg-void-fg-1 text-void-bg-1 font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2
				${disabled
					? 'opacity-40 cursor-not-allowed'
					: 'hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg shadow-sm'}
			`}
			{...disabled && {
				'data-tooltip-id': 'void-tooltip',
				"data-tooltip-content": 'Please enter all required fields or choose another provider',
				"data-tooltip-place": 'top',
			}}
			{...buttonProps}
		>
			<span>Next</span>
			<ChevronRight size={18} strokeWidth={2.5} />
		</button>
	)
}

const PreviousButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return (
		<button
			onClick={onClick}
			className="px-6 py-2.5 rounded-lg text-void-fg-3 font-medium border border-void-border-2 hover:bg-void-bg-2 hover:text-void-fg-1 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
			{...props}
		>
			<ChevronLeft size={18} strokeWidth={2.5} />
			<span>Back</span>
		</button>
	)
}



const OnboardingPageShell = ({ top, bottom, content, hasMaxWidth = true, className = '', }: {
	top?: React.ReactNode,
	bottom?: React.ReactNode,
	content?: React.ReactNode,
	hasMaxWidth?: boolean,
	className?: string,
}) => {
	return (
		<div className={`h-[80vh] text-lg flex flex-col gap-4 w-full mx-auto ${hasMaxWidth ? 'max-w-[600px]' : ''} ${className}`}>
			{top && <FadeIn className='w-full mb-auto pt-16'>{top}</FadeIn>}
			{content && <FadeIn className='w-full my-auto'>{content}</FadeIn>}
			{bottom && <div className='w-full pb-8'>{bottom}</div>}
		</div>
	)
}

const OllamaDownloadOrRemoveModelButton = ({ modelName, isModelInstalled, sizeGb }: { modelName: string, isModelInstalled: boolean, sizeGb: number | false | 'not-known' }) => {
	// for now just link to the ollama download page
	return <a
		href={`https://ollama.com/library/${modelName}`}
		target="_blank"
		rel="noopener noreferrer"
		className="flex items-center justify-center text-void-fg-2 hover:text-void-fg-1"
	>
		<ExternalLink className="w-3.5 h-3.5" />
	</a>

}


const YesNoText = ({ val }: { val: boolean | null }) => {

	return <div
		className={
			val === true ? "text text-emerald-500"
				: val === false ? 'text-rose-600'
					: "text text-amber-300"
		}
	>
		{
			val === true ? "Yes"
				: val === false ? 'No'
					: "Yes*"
		}
	</div>

}



const abbreviateNumber = (num: number): string => {
	if (num >= 1000000) {
		// For millions
		return Math.floor(num / 1000000) + 'M';
	} else if (num >= 1000) {
		// For thousands
		return Math.floor(num / 1000) + 'K';
	} else {
		// For numbers less than 1000
		return num.toString();
	}
}





const PrimaryActionButton = ({ children, className, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return (
		<button
			type='button'
			className={`
				flex items-center justify-center gap-2
				px-8 py-3 rounded-xl
				bg-void-accent text-white font-bold
				shadow-lg shadow-void-accent/20
				hover:bg-void-accent/90 hover:scale-[1.02] active:scale-[0.98]
				transition-all duration-200
				group
				${className}
			`}
			{...props}
		>
			{children}
			<ChevronRight
				className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1"
			/>
		</button>
	)
}


type WantToUseOption = 'smart' | 'private' | 'cheap' | 'all'


const MatrixRain = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};
		resize();
		window.addEventListener('resize', resize);

		const styles = getComputedStyle(document.documentElement);
		const fgColor = styles.getPropertyValue('--void-accent') || styles.getPropertyValue('--vscode-editor-foreground') || '#007ACC';
		const bgColor = styles.getPropertyValue('--vscode-editor-background') || '#000000';

		// More professional character set: hex, binary, and a few technical symbols
		const chars = '0123456789ABCDEF<>{}[]();:+-*/%&|^!~';
		
		// Create multiple layers for depth
		const layers = [
			{ fontSize: 10, speed: 0.5, opacity: 0.1, charSet: '01' },       // Distant/Background
			{ fontSize: 14, speed: 1.2, opacity: 0.25, charSet: chars },    // Mid-ground
			{ fontSize: 18, speed: 2.5, opacity: 0.45, charSet: chars },    // Foreground
		];

		const columns = layers.map(layer => {
			const count = Math.ceil(canvas.width / layer.fontSize);
			return {
				...layer,
				drops: Array(count).fill(0).map(() => Math.random() * -100) // Start off-screen
			};
		});

		let animationId: number;

		const draw = () => {
			// Transparent fade for smooth trails
			ctx.globalAlpha = 0.15;
			ctx.fillStyle = bgColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			columns.forEach(layer => {
				ctx.font = `${layer.fontSize}px "JetBrains Mono", "Fira Code", monospace`;
				
				for (let i = 0; i < layer.drops.length; i++) {
					const text = layer.charSet[Math.floor(Math.random() * layer.charSet.length)];
					const x = i * layer.fontSize;
					const y = layer.drops[i] * layer.fontSize;

					if (y > 0) {
						// Head character (brightest)
						ctx.globalAlpha = layer.opacity * 1.5;
						ctx.fillStyle = '#FFFFFF';
						ctx.fillText(text, x, y);

						// Trail characters
						ctx.globalAlpha = layer.opacity;
						ctx.fillStyle = fgColor;
						ctx.fillText(text, x, y - layer.fontSize);
					}

					// Increment drop position
					layer.drops[i] += layer.speed;

					// Reset drop to top randomly
					if (layer.drops[i] * layer.fontSize > canvas.height && Math.random() > 0.985) {
						layer.drops[i] = 0;
					}
				}
			});

			animationId = requestAnimationFrame(draw);
		};

		draw();

		return () => {
			window.removeEventListener('resize', resize);
			cancelAnimationFrame(animationId);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="fixed inset-0 z-[100000] pointer-events-none"
		/>
	);
};

const EnterpriseOverlay = () => {
	const isDark = useIsDark();
	return (
		<>
			<style>
				{`
				@keyframes cinematic-zoom {
					0% { transform: scale(0.8); opacity: 0; filter: blur(20px); }
					30% { opacity: 1; filter: blur(0px); }
					100% { transform: scale(1); opacity: 1; }
				}
				@keyframes tracking-expand {
					0% { letter-spacing: -0.5em; opacity: 0; }
					100% { letter-spacing: 0.4em; opacity: 0.7; }
				}
				@keyframes line-grow {
					0% { width: 0; opacity: 0; }
					100% { width: 120px; opacity: 0.5; }
				}
				.animate-cinematic {
					animation: cinematic-zoom 2500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
				}
				.animate-tracking-expand {
					animation: tracking-expand 3000ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
				}
				.animate-line-grow {
					animation: line-grow 2000ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
				}
				`}
			</style>
			<div className={`fixed inset-0 z-[100001] flex flex-col items-center justify-center pointer-events-none backdrop-blur-[8px]
				${isDark 
					? 'bg-gradient-to-b from-black/40 via-black/20 to-black/60' 
					: 'bg-gradient-to-b from-white/40 via-white/20 to-white/60'}
			`}>
				<div className="flex flex-col items-center gap-10 animate-cinematic">
					{/* Top decorative line */}
					<div className="h-px bg-gradient-to-r from-transparent via-void-accent to-transparent animate-line-grow" />
					
					<div className="flex flex-col items-center text-center">
						<span className="text-[11px] uppercase font-bold text-void-fg-3 mb-4 animate-tracking-expand">
							Neural Interface Initialized
						</span>
						<h2 className="text-3xl font-extralight text-void-fg-1 uppercase flex flex-col gap-3">
							<span className="text-sm tracking-[0.6em] opacity-50">Powered By</span>
							<span className="font-black tracking-[0.25em] text-void-accent shadow-void-accent/20 drop-shadow-2xl">
								The A-Tech Corporation
							</span>
						</h2>
					</div>

					{/* Bottom decorative line */}
					<div className="h-px bg-gradient-to-r from-transparent via-void-accent to-transparent animate-line-grow" />
				</div>
				
				{/* Global scan effect */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
					<div className="w-full h-[10vh] bg-gradient-to-b from-transparent via-void-accent to-transparent absolute -top-[10vh] animate-[scan_4s_linear_infinite]" />
				</div>
			</div>
		</>
	);
}

const VoidOnboardingContent = () => {


	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidMetricsService = accessor.get('IMetricsService')

	const voidSettingsState = useSettingsState()
	const isDark = useIsDark()

	const [pageIndex, setPageIndex] = useState(0)


	// page 1 state
	const [wantToUseOption, setWantToUseOption] = useState<WantToUseOption>('smart')

	// Replace the single selectedProviderName with four separate states
	// page 2 state - each tab gets its own state
	const [selectedIntelligentProvider, setSelectedIntelligentProvider] = useState<ProviderName>('anthropic');
	const [selectedPrivateProvider, setSelectedPrivateProvider] = useState<ProviderName>('ollama');
	const [selectedAffordableProvider, setSelectedAffordableProvider] = useState<ProviderName>('gemini');
	const [selectedAllProvider, setSelectedAllProvider] = useState<ProviderName>('anthropic');

	// Helper function to get the current selected provider based on active tab
	const getSelectedProvider = (): ProviderName => {
		switch (wantToUseOption) {
			case 'smart': return selectedIntelligentProvider;
			case 'private': return selectedPrivateProvider;
			case 'cheap': return selectedAffordableProvider;
			case 'all': return selectedAllProvider;
		}
	}

	// Helper function to set the selected provider for the current tab
	const setSelectedProvider = (provider: ProviderName) => {
		switch (wantToUseOption) {
			case 'smart': setSelectedIntelligentProvider(provider); break;
			case 'private': setSelectedPrivateProvider(provider); break;
			case 'cheap': setSelectedAffordableProvider(provider); break;
			case 'all': setSelectedAllProvider(provider); break;
		}
	}

	const providerNamesOfWantToUseOption: { [wantToUseOption in WantToUseOption]: ProviderName[] } = {
		smart: ['anthropic', 'openAI', 'gemini', 'openRouter'],
		private: ['ollama', 'vLLM', 'openAICompatible', 'lmStudio'],
		cheap: ['gemini', 'deepseek', 'openRouter', 'ollama', 'vLLM'],
		all: providerNames,
	}


	const selectedProviderName = getSelectedProvider();
	const didFillInProviderSettings = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName]._didFillInProviderSettings
	const isApiKeyLongEnoughIfApiKeyExists = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName].apiKey ? voidSettingsState.settingsOfProvider[selectedProviderName].apiKey.length > 15 : true
	const isAtLeastOneModel = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName].models.length >= 1

	const didFillInSelectedProviderSettings = !!(didFillInProviderSettings && isApiKeyLongEnoughIfApiKeyExists && isAtLeastOneModel)

	const [isExiting, setIsExiting] = useState(false)

	useEffect(() => {
		if (isExiting) {
			const timer = setTimeout(() => {
				voidSettingsService.setGlobalSetting('isOnboardingComplete', true);
				voidMetricsService.capture('Completed Onboarding', { selectedProviderName, wantToUseOption })
			}, 2500); // Wait for matrix animation
			return () => clearTimeout(timer);
		}
	}, [isExiting, voidSettingsService, voidMetricsService, selectedProviderName, wantToUseOption]);

	const prevAndNextButtons = <div className="max-w-[600px] w-full mx-auto flex flex-col items-end">
		<div className="flex items-center gap-2">
			<PreviousButton
				onClick={() => { setPageIndex(pageIndex - 1) }}
			/>
			<NextButton
				onClick={() => { setPageIndex(pageIndex + 1) }}
			/>
		</div>
	</div>


	const lastPagePrevAndNextButtons = <div className="max-w-[600px] w-full mx-auto flex flex-col items-end">
		<div className="flex items-center gap-2">
			<PreviousButton
				onClick={() => { setPageIndex(pageIndex - 1) }}
			/>
			<PrimaryActionButton
				onClick={() => setIsExiting(true)}
			// ringSize removed for matrix animation
			>Enter A-Coder</PrimaryActionButton>
		</div>
	</div>




	// cannot be md
	const basicDescOfWantToUseOption: { [wantToUseOption in WantToUseOption]: string } = {
		smart: "Models with the best performance on benchmarks.",
		private: "Host on your computer or local network for full data privacy.",
		cheap: "Free and affordable options.",
		all: "",
	}

	// can be md
	const detailedDescOfWantToUseOption: { [wantToUseOption in WantToUseOption]: string } = {
		smart: "Most intelligent and best for agent mode.",
		private: "Private-hosted so your data never leaves your computer or network. [Email us](mailto:founders@voideditor.com) for help setting up at your company.",
		cheap: "Use great deals like Gemini 2.5 Pro, or self-host a model with Ollama or vLLM for free.",
		all: "",
	}

	// Modified: initialize separate provider states on initial render instead of watching wantToUseOption changes
	useEffect(() => {
		if (selectedIntelligentProvider === undefined) {
			setSelectedIntelligentProvider(providerNamesOfWantToUseOption['smart'][0]);
		}
		if (selectedPrivateProvider === undefined) {
			setSelectedPrivateProvider(providerNamesOfWantToUseOption['private'][0]);
		}
		if (selectedAffordableProvider === undefined) {
			setSelectedAffordableProvider(providerNamesOfWantToUseOption['cheap'][0]);
		}
		if (selectedAllProvider === undefined) {
			setSelectedAllProvider(providerNamesOfWantToUseOption['all'][0]);
		}
	}, []);

	// reset the page to page 0 if the user redos onboarding
	useEffect(() => {
		if (!voidSettingsState.globalSettings.isOnboardingComplete) {
			setPageIndex(0)
		}
	}, [setPageIndex, voidSettingsState.globalSettings.isOnboardingComplete])


	const contentOfIdx: { [pageIndex: number]: React.ReactNode } = {
		0: <OnboardingPageShell
			content={
				<div className='flex flex-col items-center justify-center gap-10 py-12'>
					{/* Logo */}
					<div className="relative group">
						<div className="absolute -inset-4 bg-void-accent/20 rounded-full blur-2xl group-hover:bg-void-accent/30 transition-all duration-1000" />
						{!isLinux && <div className='@@void-void-icon relative z-10' style={{ width: '120px', height: '120px', opacity: 0.9 }} />}
					</div>

					{/* Title & Tagline */}
					<div className="text-center space-y-4 max-w-lg">
						<h1 className="text-5xl font-extrabold text-void-fg-1 tracking-tight">
							Welcome to <span className="text-void-accent">A-Coder</span>
						</h1>
						<p className='text-void-fg-3 text-lg leading-relaxed'>
							Your open-source, AI-powered coding assistant.<br />
							Experience the future of software development today.
						</p>
					</div>

					<FadeIn delayMs={800}>
						<PrimaryActionButton
							onClick={() => { setPageIndex(1) }}
							className="mt-4 px-10 py-4 text-lg shadow-xl hover:shadow-void-accent/20"
						>
							Get Started
						</PrimaryActionButton>
					</FadeIn>

					<div className="mt-12 flex items-center gap-6 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500">
						{/* Optional: Add small partner/tech stack logos here */}
					</div>
				</div>
			}
		/>,

		1: <OnboardingPageShell hasMaxWidth={false}
			content={
				<AddProvidersPage pageIndex={pageIndex} setPageIndex={setPageIndex} />
			}
		/>,
		2: <OnboardingPageShell
			content={
				<div className='flex flex-col items-center justify-center gap-8 py-12'>
					<div className="text-center space-y-2">
						<h1 className="text-4xl font-bold text-void-fg-1 tracking-tight">Settings & Migration</h1>
						<p className="text-void-fg-3 text-lg">Make yourself at home by bringing your existing setup.</p>
					</div>

					<SettingCard
						isDark={isDark}
						title="Transfer from another editor"
						description="We'll automatically migrate your extensions, keybindings, and snippets."
						className="w-full max-w-xl"
					>
						<SettingBox className="flex flex-col gap-3">
							<OneClickSwitchButton fromEditor="VS Code" />
							<OneClickSwitchButton fromEditor="Cursor" />
							<OneClickSwitchButton fromEditor="Windsurf" />
						</SettingBox>
					</SettingCard>

					<div className="flex items-center gap-4 w-full max-w-xl text-void-fg-4 text-sm px-2">
						<div className="h-px flex-1 bg-void-border-2" />
						<span>or skip for now</span>
						<div className="h-px flex-1 bg-void-border-2" />
					</div>
				</div>
			}
			bottom={lastPagePrevAndNextButtons}
		/>,
	}


	if (isExiting) {
		return (
			<>
				<MatrixRain />
				<EnterpriseOverlay />
			</>
		)
	}

	return <div key={pageIndex} className="w-full h-[80vh] text-left mx-auto flex flex-col items-center justify-center">
		<ErrorBoundary>
			{contentOfIdx[pageIndex]}
		</ErrorBoundary>
	</div>

}
