/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Glass Devtools, Inc. All rights reserved.
 *  Void Editor additions licensed under the AGPL 3.0 License.
 *--------------------------------------------------------------------------------------------*/

// Extract XML tool calls from model response
// Based on Anthropic's XML tool calling format

export type XMLToolCall = {
	toolName: string;
	parameters: Record<string, any>;
};

/**
 * Extracts XML tool calls from text in the format:
 * <function_calls>
 *   <invoke name="tool_name">
 *     <parameter name="param1">value1</parameter>
 *     <parameter name="param2">value2</parameter>
 *   </invoke>
 * </function_calls>
 *
 * Also returns the cleaned text with XML blocks removed
 */
export function extractXMLToolCalls(text: string): XMLToolCall[] {
	const toolCalls: XMLToolCall[] = [];

	// 1. Standard format: <function_calls><invoke name="...">...</invoke></function_calls>
	const functionCallsMatch = text.match(/<function_calls>([\s\S]*?)<\/function_calls>/);
	if (functionCallsMatch) {
		const functionCallsContent = functionCallsMatch[1];
		const invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
		let invokeMatch;

		while ((invokeMatch = invokeRegex.exec(functionCallsContent)) !== null) {
			const toolName = invokeMatch[1];
			const invokeContent = invokeMatch[2];
			const parameters: Record<string, any> = {};
			const paramRegex = /<parameter\s+name="([^"]+)">([^<]*)<\/parameter>/g;
			let paramMatch;

			while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
				const paramName = paramMatch[1];
				let paramValue: any = paramMatch[2];
				if (paramValue.trim().startsWith('{') || paramValue.trim().startsWith('[')) {
					try { paramValue = JSON.parse(paramValue); } catch (e) {}
				}
				parameters[paramName] = paramValue;
			}
			toolCalls.push({ toolName, parameters });
		}
	}

	// 2. Nemotron format: <tool_call><function=tool_name><parameter=param_name>value</parameter>...</tool_call>
	const toolCallMatch = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
	if (toolCallMatch) {
		const toolCallContent = toolCallMatch[1];
		
		// Extract function name
		const functionMatch = toolCallContent.match(/<function=([^>]+)>/);
		if (functionMatch) {
			const toolName = functionMatch[1].trim();
			const parameters: Record<string, any> = {};
			
			// Extract parameters
			const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g;
			let paramMatch;
			while ((paramMatch = paramRegex.exec(toolCallContent)) !== null) {
				const paramName = paramMatch[1].trim();
				let paramValue: any = paramMatch[2].trim();
				
				if (paramValue.startsWith('{') || paramValue.startsWith('[')) {
					try { paramValue = JSON.parse(paramValue); } catch (e) {}
				}
				parameters[paramName] = paramValue;
			}
			toolCalls.push({ toolName, parameters });
		}
	}

	// 3. Special Marker format: <|tool_call_start|>{"name": "tool_name", "arguments": {...}}<|tool_call_end|>
	const markerRegex = /<\|tool_call_start\|>([\s\S]*?)<\|tool_call_end\|>/g;
	let markerMatch;
	while ((markerMatch = markerRegex.exec(text)) !== null) {
		try {
			const callObj = JSON.parse(markerMatch[1]);
			if (callObj.name && callObj.arguments) {
				toolCalls.push({ toolName: callObj.name, parameters: callObj.arguments });
			}
		} catch (e) {
			console.log(`[extractXMLTools] Failed to parse marker tool call:`, e);
		}
	}

	return toolCalls;
}

/**
 * Removes XML tool calling blocks from text to clean up the model's response
 * When a tool call is detected, only keep the text BEFORE the first <function_calls> block
 */
export function stripXMLBlocks(text: string): string {
	// Find the first <function_calls>, <tool_call>, or <|tool_call_start|> block
	const firstToolCallMatch = text.match(/<function_calls>|<tool_call>|<\|tool_call_start\|>/);

	if (firstToolCallMatch && firstToolCallMatch.index !== undefined) {
		// Only keep text before the first tool call
		return text.substring(0, firstToolCallMatch.index).trim();
	}

	// If no tool calls, just remove any stray <function_results> or <|tool_response_start|> blocks
	let cleaned = text.replace(/<function_results>[\s\S]*?<\/function_results>/g, '');
	cleaned = cleaned.replace(/<\|tool_response_start\|>[\s\S]*?<\|tool_response_end\|>/g, '');
	cleaned = cleaned.replace(/<\|tool_list_start\|>[\s\S]*?<\|tool_list_end\|>/g, '');
	cleaned = cleaned.trim();

	return cleaned;
}

/**
 * Formats tool results as XML for sending back to the model:
 * <function_results>
 *   <result>
 *     <tool_name>tool_name</tool_name>
 *     <stdout>result content</stdout>
 *   </result>
 * </function_results>
 */
export function formatXMLToolResults(results: Array<{ toolName: string; result: string }>): string {
	const resultBlocks = results.map(({ toolName, result }) =>
		`<result>\n<tool_name>${toolName}</tool_name>\n<stdout>\n${result}\n</stdout>\n</result>`
	).join('\n');

	return `<function_results>\n${resultBlocks}\n</function_results>`;
}

/**
 * Formats tool results using special markers:
 * <|tool_response_start|>{"name": "tool_name", "content": "result content"}<|tool_response_end|>
 */
export function formatMarkerToolResults(results: Array<{ toolName: string; result: string }>): string {
	return results.map(({ toolName, result }) => 
		`<|tool_response_start|>${JSON.stringify({ name: toolName, content: result })}<|tool_response_end|>`
	).join('\n');
}
