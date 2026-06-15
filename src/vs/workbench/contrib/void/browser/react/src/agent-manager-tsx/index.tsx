/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react'
import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { AgentManager } from './AgentManager.js'
import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js'

type AgentManagerProps = React.ComponentProps<typeof AgentManager>
type MountAgentManager = (
	rootElement: HTMLElement,
	accessor: ServicesAccessor,
	props?: AgentManagerProps,
	ownerDocument?: Document,
) => { rerender: (props?: AgentManagerProps) => void, dispose: () => void }

export const mountAgentManager: MountAgentManager = mountFnGenerator(AgentManager) as MountAgentManager
