/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/** @type {import('tailwindcss').Config} */

// Wrap a CSS-variable color so Tailwind opacity modifiers (e.g. `bg-foo/10`,
// `text-foo/60`, `border-foo/30`) emit a valid alpha-aware value. Tailwind
// substitutes <alpha-value> with a 0–1 float; color-mix() requires a
// percentage, so we route through calc(). At 100% (no modifier) this is
// visually identical to the raw variable. Chromium (Electron) supports both
// color-mix() and calc()-percentages, which the stylesheets already rely on.
const alphaVar = (v) => `color-mix(in srgb, ${v} calc(<alpha-value> * 100%), transparent)`

module.exports = {
	darkMode: 'selector', // '{prefix-}dark' className is used to identify `dark:`
	content: ['./src2/**/*.{jsx,tsx}'], // uses these files to decide how to transform the css file
				theme: {
					extend: {
						keyframes: {
							'text-shimmer': {
								'0%': { backgroundPosition: '100% 50%' },
								'100%': { backgroundPosition: '-100% 50%' },
							},
							'pulse-gentle': {
								'0%, 100%': { opacity: '1' },
								'50%': { opacity: '0.6' },
							},
							'slide-up': {
								'0%': { opacity: '0', transform: 'translateY(10px)' },
								'100%': { opacity: '1', transform: 'translateY(0)' },
							},
							'slide-in-right': {
								'0%': { opacity: '0', transform: 'translateX(-10px)' },
								'100%': { opacity: '1', transform: 'translateX(0)' },
							},
							'fade-in-scale': {
								'0%': { opacity: '0', transform: 'scale(0.97)' },
								'100%': { opacity: '1', transform: 'scale(1)' },
							},
							'float': {
								'0%, 100%': { transform: 'translateY(0)' },
								'50%': { transform: 'translateY(-4px)' },
							},
							'glow-pulse': {
								'0%, 100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)' },
								'50%': { boxShadow: '0 0 30px rgba(99, 102, 241, 0.5)' },
							},
							'shimmer': {
								'0%': { transform: 'translateX(-100%)' },
								'100%': { transform: 'translateX(100%)' },
							},
						},
						animation: {
							'text-shimmer': 'text-shimmer 2.5s ease-out infinite',
							'pulse-gentle': 'pulse-gentle 1.5s ease-in-out infinite',
							'slide-up': 'slide-up 300ms ease-out forwards',
							'slide-in-right': 'slide-in-right 300ms ease-out forwards',
							'fade-in-scale': 'fade-in-scale 200ms ease-out forwards',
							'float': 'float 3s ease-in-out infinite',
							'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
							'shimmer': 'shimmer 2s infinite',
						},
						typography: theme => ({				DEFAULT: {
					css: {
						'--tw-prose-body': 'var(--void-fg-1)',
						'--tw-prose-headings': 'var(--void-fg-1)',
						'--tw-prose-lead': 'var(--void-fg-2)',
						'--tw-prose-links': 'var(--void-link-color)',
						'--tw-prose-bold': 'var(--void-fg-1)',
						'--tw-prose-counters': 'var(--void-fg-3)',
						'--tw-prose-bullets': 'var(--void-fg-3)',
						'--tw-prose-hr': 'var(--void-border-4)',
						'--tw-prose-quotes': 'var(--void-fg-1)',
						'--tw-prose-quote-borders': 'var(--void-border-2)',
						'--tw-prose-captions': 'var(--void-fg-3)',
						'--tw-prose-code': 'var(--void-fg-0)',
						'--tw-prose-pre-code': 'var(--void-fg-0)',
						'--tw-prose-pre-bg': 'var(--void-bg-1)',
						'--tw-prose-th-borders': 'var(--void-border-4)',
						'--tw-prose-td-borders': 'var(--void-border-4)',
					},
				},
			}),
			fontSize: {
				xs: ['10px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
				sm: ['11px', { lineHeight: '1.45', letterSpacing: '0.005em' }],
				root: ['13px', { lineHeight: '1.5', letterSpacing: '0' }],
				lg: ['14px', { lineHeight: '1.5', letterSpacing: '0' }],
				xl: ['16px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
				'2xl': ['18px', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '500' }],
				'3xl': ['20px', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '600' }],
				'4xl': ['24px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' }],
				'5xl': ['30px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
				'6xl': ['36px', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '700' }],
				'7xl': ['48px', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
				'8xl': ['64px', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '800' }],
				'9xl': ['72px', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '800' }],
			},
			boxShadow: {
				'void-sm': 'var(--void-shadow-sm)',
				'void-md': 'var(--void-shadow-md)',
				'void-lg': 'var(--void-shadow-lg)',
				'void-xl': 'var(--void-shadow-xl)',
				'void-inner': 'var(--void-shadow-inner)',
				'void-glow': 'var(--void-accent-glow)',
				'void-glow-strong': 'var(--void-accent-glow-strong)',
				'void-glow-subtle': 'var(--void-accent-glow-subtle)',
			},
			borderRadius: {
				'void-sm': '6px',
				'void-md': '8px',
				'void-lg': '12px',
				'void-xl': '16px',
				'void-2xl': '20px',
			},
			// common colors to use, ordered light to dark

			colors: {
				// Core backgrounds
				'void-bg-1': alphaVar('var(--void-bg-1)'),
				'void-bg-1-alt': alphaVar('var(--void-bg-1-alt)'),
				'void-bg-2': alphaVar('var(--void-bg-2)'),
				'void-bg-2-alt': alphaVar('var(--void-bg-2-alt)'),
				'void-bg-2-hover': alphaVar('var(--void-bg-2-hover)'),
				'void-bg-3': alphaVar('var(--void-bg-3)'),
				'void-bg-4': alphaVar('var(--void-bg-4)'),
				'void-bg-4-hover': alphaVar('var(--void-bg-4-hover)'),

				// Depth system (elevation layers)
				'void-depth-base': alphaVar('var(--void-depth-base)'),
				'void-depth-elevated': alphaVar('var(--void-depth-elevated)'),
				'void-depth-floating': alphaVar('var(--void-depth-floating)'),
				'void-depth-modal': alphaVar('var(--void-depth-modal)'),

				// Foregrounds
				'void-fg-0': alphaVar('var(--void-fg-0)'),
				'void-fg-1': alphaVar('var(--void-fg-1)'),
				'void-fg-2': alphaVar('var(--void-fg-2)'),
				'void-fg-3': alphaVar('var(--void-fg-3)'),
				'void-fg-4': alphaVar('var(--void-fg-4)'),

				// Warning
				'void-warning': alphaVar('var(--void-warning)'),

				// Borders
				'void-border-1': alphaVar('var(--void-border-1)'),
				'void-border-2': alphaVar('var(--void-border-2)'),
				'void-border-3': alphaVar('var(--void-border-3)'),
				'void-border-4': alphaVar('var(--void-border-4)'),

				// Ring and links
				'void-ring-color': alphaVar('var(--void-ring-color)'),
				'void-link-color': alphaVar('var(--void-link-color)'),

				// Accent colors (premium brand colors)
				'void-accent': {
					DEFAULT: alphaVar('var(--void-accent-start)'),
					start: alphaVar('var(--void-accent-start)'),
					end: alphaVar('var(--void-accent-end)'),
					hover: alphaVar('var(--void-accent-hover)'),
					active: alphaVar('var(--void-accent-active)'),
				},

				// Status colors
				'void-success': alphaVar('var(--void-success)'),
				'void-error': alphaVar('var(--void-error)'),
				'void-info': alphaVar('var(--void-info)'),
				'void-orange': alphaVar('var(--void-orange)'),

				vscode: {
					// see: https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content

					// base colors
					'fg': 'var(--vscode-foreground)',
					'focus-border': 'var(--vscode-focusBorder)',
					'disabled-fg': 'var(--vscode-disabledForeground)',
					'widget-border': 'var(--vscode-widget-border)',
					'widget-shadow': 'var(--vscode-widget-shadow)',
					'selection-bg': 'var(--vscode-selection-background)',
					'description-fg': 'var(--vscode-descriptionForeground)',
					'error-fg': 'var(--vscode-errorForeground)',
					'icon-fg': 'var(--vscode-icon-foreground)',
					'sash-hover-border': 'var(--vscode-sash-hoverBorder)',

					// text colors
					'text-blockquote-bg': 'var(--vscode-textBlockQuote-background)',
					'text-blockquote-border': 'var(--vscode-textBlockQuote-border)',
					'text-codeblock-bg': 'var(--vscode-textCodeBlock-background)',
					'text-link-active-fg': 'var(--vscode-textLink-activeForeground)',
					'text-link-fg': 'var(--vscode-textLink-foreground)',
					'text-preformat-fg': 'var(--vscode-textPreformat-foreground)',
					'text-preformat-bg': 'var(--vscode-textPreformat-background)',
					'text-separator-fg': 'var(--vscode-textSeparator-foreground)',

					// input colors
					'input-bg': 'var(--vscode-input-background)',
					'input-border': 'var(--vscode-input-border)',
					'input-fg': 'var(--vscode-input-foreground)',
					'input-placeholder-fg': 'var(--vscode-input-placeholderForeground)',
					'input-active-bg': 'var(--vscode-input-activeBackground)',
					'input-option-active-border': 'var(--vscode-inputOption-activeBorder)',
					'input-option-active-fg': 'var(--vscode-inputOption-activeForeground)',
					'input-option-hover-bg': 'var(--vscode-inputOption-hoverBackground)',
					'input-validation-error-bg': 'var(--vscode-inputValidation-errorBackground)',
					'input-validation-error-fg': 'var(--vscode-inputValidation-errorForeground)',
					'input-validation-error-border': 'var(--vscode-inputValidation-errorBorder)',
					'input-validation-info-bg': 'var(--vscode-inputValidation-infoBackground)',
					'input-validation-info-fg': 'var(--vscode-inputValidation-infoForeground)',
					'input-validation-info-border': 'var(--vscode-inputValidation-infoBorder)',
					'input-validation-warning-bg': 'var(--vscode-inputValidation-warningBackground)',
					'input-validation-warning-fg': 'var(--vscode-inputValidation-warningForeground)',
					'input-validation-warning-border': 'var(--vscode-inputValidation-warningBorder)',

					// command center colors (the top bar)
					'commandcenter-fg': 'var(--vscode-commandCenter-foreground)',
					'commandcenter-active-fg': 'var(--vscode-commandCenter-activeForeground)',
					'commandcenter-bg': 'var(--vscode-commandCenter-background)',
					'commandcenter-active-bg': 'var(--vscode-commandCenter-activeBackground)',
					'commandcenter-border': 'var(--vscode-commandCenter-border)',
					'commandcenter-inactive-fg': 'var(--vscode-commandCenter-inactiveForeground)',
					'commandcenter-inactive-border': 'var(--vscode-commandCenter-inactiveBorder)',
					'commandcenter-active-border': 'var(--vscode-commandCenter-activeBorder)',
					'commandcenter-debugging-bg': 'var(--vscode-commandCenter-debuggingBackground)',

					// badge colors
					'badge-fg': 'var(--vscode-badge-foreground)',
					'badge-bg': 'var(--vscode-badge-background)',

					// button colors
					'button-bg': 'var(--vscode-button-background)',
					'button-fg': 'var(--vscode-button-foreground)',
					'button-border': 'var(--vscode-button-border)',
					'button-separator': 'var(--vscode-button-separator)',
					'button-hover-bg': 'var(--vscode-button-hoverBackground)',
					'button-secondary-fg': 'var(--vscode-button-secondaryForeground)',
					'button-secondary-bg': 'var(--vscode-button-secondaryBackground)',
					'button-secondary-hover-bg': 'var(--vscode-button-secondaryHoverBackground)',

					// checkbox colors
					'checkbox-bg': 'var(--vscode-checkbox-background)',
					'checkbox-fg': 'var(--vscode-checkbox-foreground)',
					'checkbox-border': 'var(--vscode-checkbox-border)',
					'checkbox-select-bg': 'var(--vscode-checkbox-selectBackground)',

					// sidebar colors
					'sidebar-bg': 'var(--vscode-sideBar-background)',
					'sidebar-fg': 'var(--vscode-sideBar-foreground)',
					'sidebar-border': 'var(--vscode-sideBar-border)',
					'sidebar-drop-bg': 'var(--vscode-sideBar-dropBackground)',
					'sidebar-title-fg': 'var(--vscode-sideBarTitle-foreground)',
					'sidebar-header-bg': 'var(--vscode-sideBarSectionHeader-background)',
					'sidebar-header-fg': 'var(--vscode-sideBarSectionHeader-foreground)',
					'sidebar-header-border': 'var(--vscode-sideBarSectionHeader-border)',
					'sidebar-activitybartop-border': 'var(--vscode-sideBarActivityBarTop-border)',
					'sidebar-title-bg': 'var(--vscode-sideBarTitle-background)',
					'sidebar-title-border': 'var(--vscode-sideBarTitle-border)',
					'sidebar-stickyscroll-bg': 'var(--vscode-sideBarStickyScroll-background)',
					'sidebar-stickyscroll-border': 'var(--vscode-sideBarStickyScroll-border)',
					'sidebar-stickyscroll-shadow': 'var(--vscode-sideBarStickyScroll-shadow)',

					// other colors (these are partially complete)

					// text formatting
					'text-preformat-bg': 'var(--vscode-textPreformat-background)',
					'text-preformat-fg': 'var(--vscode-textPreformat-foreground)',

					// editor colors
					'editor-bg': 'var(--vscode-editor-background)',
					'editor-fg': 'var(--vscode-editor-foreground)',



					// other
					'editorwidget-bg': 'var(--vscode-editorWidget-background)',
					'toolbar-hover-bg': 'var(--vscode-toolbar-hoverBackground)',
					'toolbar-foreground': 'var(--vscode-editorActionList-foreground)',

					'editorwidget-fg': 'var(--vscode-editorWidget-foreground)',
					'editorwidget-border': 'var(--vscode-editorWidget-border)',

					'charts-orange': 'var(--vscode-charts-orange)',
					'charts-yellow': 'var(--vscode-charts-yellow)',
				},
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography'),
		// Enables the `animate-in`/`animate-out`, `fade-in`/`fade-out`,
		// `slide-in-from-*`, `zoom-in-*`, `duration-*` (animation) and `delay-*`
		// utilities used across the React UI. Prefixed to `void-*` by scope-tailwind.
		require('tailwindcss-animate'),
		({ addUtilities }) => {
			addUtilities({
				'.text-shimmer': {
					'background-image': 'linear-gradient(90deg, var(--void-fg-3) 0%, var(--void-fg-3) 40%, var(--void-fg-1) 50%, var(--void-fg-3) 60%, var(--void-fg-3) 100%)',
					'background-size': '200% 100%',
					'-webkit-background-clip': 'text',
					'background-clip': 'text',
					'display': 'inline-block',
					'color': 'transparent',
				},
				// Reusable entrance animation for landing-page suggestion chips.
				// References the void-fade-in-up keyframe defined in styles.css.
				'.animate-fade-in-up': {
					'animation': 'void-fade-in-up 0.4s cubic-bezier(0.32, 0.72, 0, 1) both',
				},
				// Pure opacity fade (modal/overlay backdrops).
				'.animate-fade-in': {
					'animation': 'void-fade-in 0.2s ease-out both',
				},
				// Fade + subtle scale-up (modal panels, popovers).
				'.animate-fade-in-scale': {
					'animation': 'void-fade-in-scale 0.2s cubic-bezier(0.32, 0.72, 0, 1) both',
				},
			})
		}
	],
	prefix: 'void-'
}

