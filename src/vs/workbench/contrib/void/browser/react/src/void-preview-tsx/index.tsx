/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { EnhancedVoidPreview } from './EnhancedVoidPreview.js'
import { LearningPreviewWithTheme } from './LearningPreview.js'

// Export components
export { EnhancedVoidPreview } from './EnhancedVoidPreview.js'
export { LearningPreview, LearningPreviewWithTheme } from './LearningPreview.js'

// Default mount function uses EnhancedVoidPreview for walkthroughs and implementation plans
// Uses VS Code design tokens (void-*) for theme compatibility
export const mountVoidPreview = mountFnGenerator(EnhancedVoidPreview)

// Mount function for lessons with procedural theming
export const mountLearningPreview = mountFnGenerator(LearningPreviewWithTheme)