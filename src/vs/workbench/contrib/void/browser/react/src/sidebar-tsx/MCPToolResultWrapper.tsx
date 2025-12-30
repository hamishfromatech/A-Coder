/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved. 
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { useAccessor } from '../util/services.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { CopyButton } from '../markdown/ApplyBlockHoverButtons.js';
import { removeMCPToolNamePrefix } from '../../../../common/mcpServiceTypes.js';
import {
	ToolHeaderWrapper,
	ToolChildrenWrapper,
	SmallProseWrapper,
	BottomChildren,
	CodeChildren,
	getTitle,
	ResultWrapper,
	ToolHeaderParams,
	WrapperProps
} from './ToolResultHelpers.js';

export const MCPToolResultWrapper: ResultWrapper<string> = ({ toolMessage }) => {
	const accessor = useAccessor()
	const mcpService = accessor.get('IMCPService')

	const title = getTitle(toolMessage)
	const desc1 = removeMCPToolNamePrefix(toolMessage.name)
	const isRejected = toolMessage.type === 'rejected'
	const { params } = toolMessage
	const componentParams: ToolHeaderParams = { title, desc1, isError: false, icon: null, isRejected, }

	const paramsStr = JSON.stringify(params, null, 2)
	componentParams.desc2 = <CopyButton codeStr={paramsStr} toolTipName={`Copy inputs: ${paramsStr}`} />
	componentParams.info = !toolMessage.mcpServerName ? 'MCP tool not found' : undefined

	if (toolMessage.type === 'success') {
		const { result } = toolMessage
		const resultStr = result ? mcpService.stringifyResult(result) : 'null'
		componentParams.children = <ToolChildrenWrapper>
			<SmallProseWrapper>
				<ChatMarkdownRender
					string={resultStr}
					chatMessageLocation={undefined}
					isApplyEnabled={false}
					isLinkDetectionEnabled={true}
				/>
			</SmallProseWrapper>
		</ToolChildrenWrapper>
	} else if (toolMessage.type === 'tool_request' || toolMessage.type === 'running_now') {
		const paramsToSend = JSON.stringify(params, null, 2)
		componentParams.children = <ToolChildrenWrapper>
			<SmallProseWrapper>
				<ChatMarkdownRender
					string={`\`\`\`json\n${paramsToSend}\n\`\`\``}
					chatMessageLocation={undefined}
					isApplyEnabled={false}
					isLinkDetectionEnabled={true}
				/>
			</SmallProseWrapper>
		</ToolChildrenWrapper>
	} else if (toolMessage.type === 'tool_error') {
		componentParams.bottomChildren = <BottomChildren title='Error'><CodeChildren>{String(toolMessage.result)}</CodeChildren></BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />
}
