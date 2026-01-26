/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Learning Components
export { InlineExerciseBlock } from './InlineExerciseBlock.js';
export type {
	InlineExerciseBlockProps,
	ExerciseType,
} from './InlineExerciseBlock.js';

export { CollapsibleLessonSection, ProgressSection, TableOfContents } from './CollapsibleLessonSection.js';
export type {
	CollapsibleLessonSectionProps,
	ProgressSectionProps,
	TableOfContentsProps,
} from './CollapsibleLessonSection.js';

export { ProgressTracker, MiniProgressBar, SectionCompletionTracker, ScoreCard } from './ProgressTracker.js';
export type {
	ProgressTrackerProps,
	LessonStats,
	QuizStats,
	StreakInfo,
	Badge,
	MiniProgressBarProps,
	SectionCompletionTrackerProps,
	ScoreCardProps,
} from './ProgressTracker.js';

export { HintSystem, InlineHintButton, HintPopup } from './HintSystem.js';
export type {
	HintSystemProps,
	Hint,
} from './HintSystem.js';

export { CelebrationEffect, useCelebration } from './CelebrationEffect.js';
export type {
	CelebrationType,
	CelebrationEffectProps,
} from './CelebrationEffect.js';

// Theme and Utilities
export { LessonThemeProvider, ThemePattern, useLessonTheme, withLessonTheme } from '../util/LessonThemeProvider.js';
export type {
	LessonThemeProviderProps,
	LessonThemeContextValue,
	ThemePatternProps,
} from '../util/LessonThemeProvider.js';

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
} from '../util/proceduralUtils.js';
export type {
	HSLColor,
	ThemeColors,
	LessonTheme,
	BackgroundPattern,
	AnimationConfig,
} from '../util/proceduralUtils.js';

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
} from '../util/microInteractions.js';
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
} from '../util/microInteractions.js';

// Services
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

// Types
export type {
	ExerciseType as LearningExerciseType,
	StudentLevel,
} from '../../common/voidSettingsTypes.js';

// Re-export Enhanced VoidPreview
export { EnhancedVoidPreview } from '../void-preview-tsx/EnhancedVoidPreview.js';
export type { EnhancedVoidPreviewProps } from '../void-preview-tsx/EnhancedVoidPreview.js';

// Default exports for convenience
export default {
	// Components
	InlineExerciseBlock,
	CollapsibleLessonSection,
	ProgressTracker,
	MiniProgressBar,
	SectionCompletionTracker,
	ScoreCard,
	HintSystem,
	InlineHintButton,
	HintPopup,
	CelebrationEffect,
	LessonThemeProvider,
	ThemePattern,
	EnhancedVoidPreview,

	// Hooks
	useLessonTheme,
	useCelebration,
	useHoverEffect,
	useRippleEffect,

	// Utilities
	SeededRNG,
	generateLessonTheme,
	generateHSLFromSeed,
	generateComplementaryColors,
	getHoverEffectStyles,
	smoothScrollTo,
	createRipple,
};