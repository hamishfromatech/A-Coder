/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { generateLessonTheme, LessonTheme } from './proceduralUtils.js';

interface LessonThemeContextValue {
	theme: LessonTheme;
	lessonId: string;
	regenerateTheme: () => void;
	getColor: (colorName: keyof LessonTheme['colors']) => string;
	getAnimation: () => React.CSSProperties;
	getShadow: (variant?: 'light' | 'medium' | 'heavy') => string;
	getBorderRadius: (variant?: 'small' | 'medium' | 'large' | 'pill') => string;
}

const LessonThemeContext = createContext<LessonThemeContextValue | null>(null);

export interface LessonThemeProviderProps {
	children: React.ReactNode;
	lessonId: string;
	topic?: string;
	initialTheme?: LessonTheme;
}

export const LessonThemeProvider: React.FC<LessonThemeProviderProps> = ({
	children,
	lessonId,
	topic,
	initialTheme,
}) => {
	const [theme, setTheme] = useState<LessonTheme>(
		initialTheme || generateLessonTheme(lessonId, topic)
	);

	// Regenerate theme function
	const regenerateTheme = () => {
		setTheme(generateLessonTheme(lessonId, topic));
	};

	// Get a specific color from the theme
	const getColor = (colorName: keyof LessonTheme['colors']): string => {
		return theme.colors[colorName];
	};

	// Get animation styles
	const getAnimation = (): React.CSSProperties => {
		return {
			animation: `${theme.animations.type} ${theme.animations.duration}ms ${theme.animations.easing}`,
		};
	};

	// Get shadow styles with variants
	const getShadow = (variant: 'light' | 'medium' | 'heavy' = 'medium'): string => {
		const baseShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
		switch (variant) {
			case 'light':
				return '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
			case 'heavy':
				return '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
			case 'medium':
			default:
				return baseShadow;
		}
	};

	// Get border radius with variants
	const getBorderRadius = (variant: 'small' | 'medium' | 'large' | 'pill' = 'medium'): string => {
		switch (variant) {
			case 'small': return '4px';
			case 'medium': return '8px';
			case 'large': return '12px';
			case 'pill': return '9999px';
			default: return '8px';
		}
	};

	// Apply CSS variables for theme colors
	useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty('--lesson-primary', theme.colors.primary);
		root.style.setProperty('--lesson-secondary', theme.colors.secondary);
		root.style.setProperty('--lesson-accent', theme.colors.accent);
		root.style.setProperty('--lesson-bg', theme.colors.background);
		root.style.setProperty('--lesson-bg-light', theme.colors.backgroundLight);
		root.style.setProperty('--lesson-bg-dark', theme.colors.backgroundDark);
		root.style.setProperty('--lesson-text', theme.colors.text);
		root.style.setProperty('--lesson-text-muted', theme.colors.textMuted);
		root.style.setProperty('--lesson-border', theme.colors.border);
		root.style.setProperty('--lesson-success', theme.colors.success);
		root.style.setProperty('--lesson-warning', theme.colors.warning);
		root.style.setProperty('--lesson-error', theme.colors.error);

		return () => {
			// Clean up CSS variables
			root.style.removeProperty('--lesson-primary');
			root.style.removeProperty('--lesson-secondary');
			root.style.removeProperty('--lesson-accent');
			root.style.removeProperty('--lesson-bg');
			root.style.removeProperty('--lesson-bg-light');
			root.style.removeProperty('--lesson-bg-dark');
			root.style.removeProperty('--lesson-text');
			root.style.removeProperty('--lesson-text-muted');
			root.style.removeProperty('--lesson-border');
			root.style.removeProperty('--lesson-success');
			root.style.removeProperty('--lesson-warning');
			root.style.removeProperty('--lesson-error');
		};
	}, [theme]);

	const contextValue: LessonThemeContextValue = useMemo(
		() => ({
			theme,
			lessonId,
			regenerateTheme,
			getColor,
			getAnimation,
			getShadow,
			getBorderRadius,
		}),
		[theme, lessonId]
	);

	return (
		<LessonThemeContext.Provider value={contextValue}>
			{children}
		</LessonThemeContext.Provider>
	);
};

// Hook to use the lesson theme
export const useLessonTheme = (): LessonThemeContextValue => {
	const context = useContext(LessonThemeContext);
	if (!context) {
		throw new Error('useLessonTheme must be used within a LessonThemeProvider');
	}
	return context;
};

// HOC to wrap components with theme access
export const withLessonTheme = <P extends object>(
	Component: React.ComponentType<P & { theme: LessonTheme }>
) => {
	return (props: P) => {
		const { theme } = useLessonTheme();
		return <Component {...props} theme={theme} />;
	};
};

// Pattern background component
export interface ThemePatternProps {
	className?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}

export const ThemePattern: React.FC<ThemePatternProps> = ({ className = '', style = {}, children }) => {
	const { theme } = useLessonTheme();

	if (theme.pattern === 'none') {
		return <div className={className} style={style}>{children}</div>;
	}

	const patternStyles: Record<BackgroundPattern, React.CSSProperties> = {
		none: {},
		dots: {
			backgroundImage: `radial-gradient(${theme.colors.border} 1px, transparent 1px)`,
			backgroundSize: '20px 20px',
		},
		grid: {
			backgroundImage: `
				linear-gradient(to right, ${theme.colors.border} 1px, transparent 1px),
				linear-gradient(to bottom, ${theme.colors.border} 1px, transparent 1px)
			`,
			backgroundSize: '30px 30px',
		},
		waves: {
			backgroundImage: `
				repeating-linear-gradient(
					45deg,
					transparent,
					transparent 10px,
					${theme.colors.border} 10px,
					${theme.colors.border} 20px
				)
			`,
		},
		gradient: {
			background: generateGradientFromTheme(theme),
		},
		circles: {
			backgroundImage: `
				radial-gradient(circle at 25% 25%, ${theme.colors.accent}20 0%, transparent 50%),
				radial-gradient(circle at 75% 75%, ${theme.colors.secondary}20 0%, transparent 50%)
			`,
		},
		lines: {
			backgroundImage: `linear-gradient(${theme.colors.border} 1px, transparent 1px)`,
			backgroundSize: '100% 20px',
		},
		triangles: {
			backgroundImage: `
				linear-gradient(${theme.colors.border} 1px, transparent 1px),
				linear-gradient(45deg, ${theme.colors.border} 1px, transparent 1px),
				linear-gradient(-45deg, ${theme.colors.border} 1px, transparent 1px)
			`,
			backgroundSize: '20px 20px',
		},
	};

	return (
		<div
			className={`theme-pattern ${theme.pattern} ${className}`}
			style={{
				...patternStyles[theme.pattern],
				...style,
			}}
		>
			{children}
		</div>
	);
};

// Helper function to generate gradient from theme
function generateGradientFromTheme(theme: LessonTheme): string {
	const angle = Math.floor(Math.random() * 360);
	return `linear-gradient(${angle}deg, ${theme.colors.primary}10, ${theme.colors.secondary}10)`;
}

// Pattern type import for reference
type BackgroundPattern = 'none' | 'dots' | 'grid' | 'waves' | 'gradient' | 'circles' | 'lines' | 'triangles';

export default LessonThemeContext;