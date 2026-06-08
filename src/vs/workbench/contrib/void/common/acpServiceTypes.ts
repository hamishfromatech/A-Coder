/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * ACP (Agent Communication Protocol) type definitions.
 * Based on the i-am-bee/acp open standard.
 */

// ACP Agent Info
export interface ACPAgent {
	name: string;
	description?: string;
	input_content_types?: string[];
	output_content_types?: string[];
	capabilities?: Record<string, unknown>;
}

// ACP Message
export interface ACPMessage {
	role?: string;
	parts: ACPMessagePart[];
}

export interface ACPMessagePart {
	content: string;
	content_type: string;
}

// ACP Run Request
export interface ACPRunRequest {
	agent: string;
	input: ACPMessage[];
	session_id?: string;
}

// ACP Run Response
export interface ACPRunResponse {
	run_id: string;
	agent: string;
	input: ACPMessage[];
	output: ACPMessage[];
	status: 'completed' | 'failed' | 'awaiting' | 'in_progress';
	created_at: string;
	updated_at: string;
}

// ACP Streaming Event
export interface ACPRunEvent {
	type: 'run.created' | 'run.in_progress' | 'run.awaiting' | 'run.completed' | 'run.failed' | 'message' | 'thought' | 'tool_call';
	run?: ACPRunResponse;
	message?: ACPMessage;
	content?: string;
}

// ACP Config File
export interface ACPConfigFileEntryJSON {
	url: string;
	headers?: Record<string, string>;
}

export interface ACPConfigFileJSON {
	acpServers: Record<string, ACPConfigFileEntryJSON>;
}

// ACP Server State
export type ACPAgentState = {
	agents: ACPAgent[];
	status: 'loading' | 'success' | 'offline';
	url?: string;
	error?: string;
} | {
	agents?: undefined;
	status: 'error';
	url?: string;
	error: string;
};

export interface ACPAgentOfServerName {
	[serverName: string]: ACPAgentState;
}

// Event types
export type ACPServerEvent = {
	name: string;
	prevServer?: ACPAgentState;
	newServer?: ACPAgentState;
};

export type ACPServerEventResponse = { response: ACPServerEvent };

export type ACPConfigFileParseErrorResponse = {
	response: {
		type: 'config-file-error';
		error: string | null;
	}
};

// Tool call types
export interface ACPRunAgentParams {
	serverName: string;
	agentName: string;
	input: string;
	contentType?: string;
}

export interface ACPRunAgentResponse {
	text: string;
	status: ACPRunResponse['status'];
	event: 'text' | 'error';
	agentName: string;
	serverName: string;
}
