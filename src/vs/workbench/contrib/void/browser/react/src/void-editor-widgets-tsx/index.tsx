/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { VoidCommandBarMain } from './VoidCommandBar.js'
import { VoidSelectionHelperMain } from './VoidSelectionHelper.js'
import { CoachBubbleWrapper } from './CoachBubbleWrapper.js'

export const mountVoidCommandBar = mountFnGenerator(VoidCommandBarMain)

export const mountVoidSelectionHelper = mountFnGenerator(VoidSelectionHelperMain)

export const mountProactiveCoachBubble = mountFnGenerator(CoachBubbleWrapper)

