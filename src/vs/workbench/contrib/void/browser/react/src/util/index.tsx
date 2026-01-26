/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Theme Provider
export { LessonThemeProvider, ThemePattern, useLessonTheme, withLessonTheme } from './LessonThemeProvider.js';
export type {
	LessonThemeProviderProps,
	LessonThemeContextValue,
	ThemePatternProps,
} from './LessonThemeProvider.js';

// Procedural Generation Utilities
export {
	SeededRNG,
	generateHSLFromSeed,
	hslToString,
	hslToHex,
	generateComplementaryColors,
	generateMoodPalette,
	generatePatternFromSeed,
	generateAnimationConfig,
	generateLessonTheme,
	generateBorderRadius,
	generateShadow,
	generateGradient,
	generateHoverEffect,
	generateExerciseLayout,
	generateCodeBlockDecoration,
	generateButtonStyle,
} from './proceduralUtils.js';
export type {
	HSLColor,
	ThemeColors,
	LessonTheme,
	BackgroundPattern,
	AnimationConfig,
} from './proceduralUtils.js';

// Micro-interaction Utilities
export {
	getHoverEffectStyles,
	generateHoverEffectConfig,
	getAnimationStyles,
	getButtonStyles,
	getLoadingSpinnerStyles,
	getLoadingDotsStyles,
	getLoadingDotStyles,
	smoothScrollTo,
	smoothScrollBy,
	createRipple,
	createMagneticEffect,
	getSuccessAnimationStyles,
	getInteractiveCardStyles,
	useHoverEffect,
	useRippleEffect,
	injectAnimationKeyframes,
} from './microInteractions.js';
export type {
	HoverEffectType,
	AnimationType,
	ButtonStyle,
	HoverEffectConfig,
	MicroInteractionAnimationConfig,
	ButtonMicroInteractionConfig,
	InteractiveCardConfig,
	SuccessAnimationConfig,
	UseHoverEffectOptions,
	UseRippleEffectOptions,
	RippleConfig,
	MagneticConfig,
} from './microInteractions.js';

// Services (re-export for convenience)
export type {
	ILearningProgressService,
	ThreadLearningProgress,
	LessonProgress,
	ExerciseAttempt,
	QuizResult,
	HintUsage,
	GlobalLearningProgress,
	LearningSettings,
} from '../../common/learningProgressService.js';

export { LearningProgressService } from '../../common/learningProgressService.js';

export { services, useAccessor, useIsDark, useChatThreadsStreamState } from './services.js';
export type {
	IAccessor,
	IChatThreadsStreamState,
} from './services.js';

export { inputs } from './inputs.js';
export type {
	InputProps,
	SelectProps,
	TextareaProps,
} from './inputs.js';

export * from './services.js';
export * from './inputs.js';