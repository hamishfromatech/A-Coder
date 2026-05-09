/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { JSX, useEffect, useMemo, useState } from 'react'
import { marked, MarkedToken, Token } from 'marked'

import { convertToVscodeLang, detectLanguage } from '../../../../common/helpers/languageHelpers.js'
import { BlockCodeApplyWrapper } from './ApplyBlockHoverButtons.js'
import { useAccessor } from '../util/services.js'
import { URI } from '../../../../../../../base/common/uri.js'
import { isAbsolute } from '../../../../../../../base/common/path.js'
import { separateOutFirstLine } from '../../../../common/helpers/util.js'
import { BlockCode } from '../util/inputs.js'
import { CodespanLocationLink } from '../../../../common/chatThreadServiceTypes.js'
import { getBasename, getRelative, voidOpenFileFn } from '../sidebar-tsx/ToolResultHelpers.js'
import { ChartRender, parseChartDefinition } from './ChartRender.js'
import { LatexRender, LatexTextRender } from './LatexRender.js'
import { FillInTheBlank } from '../learning-tsx/FillInTheBlank.js'


export type ChatMessageLocation = {
	threadId: string;
	messageIdx: number;
}

type ApplyBoxLocation = ChatMessageLocation & { tokenIdx: string }

export const getApplyBoxId = ({ threadId, messageIdx, tokenIdx }: ApplyBoxLocation) => {
	return `${threadId}-${messageIdx}-${tokenIdx}`
}

function isValidUri(s: string): boolean {
	return s.length > 5 && isAbsolute(s) && !s.includes('//') && !s.includes('/*') // common case that is a false positive is comments like //
}

const Codespan = ({ text, className, onClick, tooltip }: { text: string, className?: string, onClick?: () => void, tooltip?: string }) => {

	// Check if this is a blank: [___] or ___ (at least 2 underscores)
	const isBlank = /^(?:\[__{1,}\]|__{2,})$/.test(text.trim());

	if (isBlank) {
		return <FillInTheBlank
			placeholder={text.trim()}
			className={className}
		/>;
	}

	return <code
		className={`font-mono font-medium rounded-sm bg-void-bg-1 px-1 ${className}`}
		onClick={onClick}
		{...tooltip ? {
			'data-tooltip-id': 'void-tooltip',
			'data-tooltip-content': tooltip,
			'data-tooltip-place': 'top',
		} : {}}
	>
		{text}
	</code>

}

const CodespanWithLink = ({ text, rawText, chatMessageLocation }: { text: string, rawText: string, chatMessageLocation: ChatMessageLocation }) => {

	const accessor = useAccessor()

	const chatThreadService = accessor.get('IChatThreadService')
	const commandService = accessor.get('ICommandService')
	const editorService = accessor.get('ICodeEditorService')

	const { messageIdx, threadId } = chatMessageLocation

	const [link, setLink] = useState<CodespanLocationLink | undefined>(undefined)

	// Fetch link asynchronously via useEffect to avoid side effects during render
	useEffect(() => {
		if (!rawText.endsWith('`')) return
		const existing = chatThreadService.getCodespanLink({ codespanStr: text, messageIdx, threadId })
		if (existing !== undefined) {
			setLink(existing)
			return
		}
		let cancelled = false
		chatThreadService.generateCodespanLink({ codespanStr: text, threadId })
			.then(newLink => {
				if (cancelled) return
				chatThreadService.addCodespanLink({ newLinkText: text, newLinkLocation: newLink, messageIdx, threadId })
				setLink(newLink)
			})
			.catch(() => {
				// Silently fail — link is optional UX enhancement
			})
		return () => { cancelled = true }
	}, [text, rawText, messageIdx, threadId, chatThreadService])

	let tooltip: string | undefined = undefined
	let displayText = text

	if (link?.displayText) {
		displayText = link.displayText
	}

	if (isValidUri(displayText)) {
		tooltip = getRelative(URI.file(displayText), accessor)  // Full path as tooltip
		displayText = getBasename(displayText)
	}

	const onClick = () => {
		if (!link) return;
		// Use the updated voidOpenFileFn to open the file and handle selection
		if (link.selection)
			voidOpenFileFn(link.uri, accessor, [link.selection.startLineNumber, link.selection.endLineNumber]);
		else
			voidOpenFileFn(link.uri, accessor);
	}

	return <Codespan
		text={displayText}
		onClick={onClick}
		className={link ? 'underline hover:brightness-90 transition-all duration-200 cursor-pointer' : ''}
		tooltip={tooltip || undefined}
	/>
}


const paragraphToLatexSegments = (paragraphText: string) => {

	const segments: React.ReactNode[] = [];

	if (paragraphText
		&& !(paragraphText.includes('#') || paragraphText.includes('`')) // don't process latex if a codespan or header tag
		&& !/^[\w\s.()[\]{}]+$/.test(paragraphText) // don't process latex if string only contains alphanumeric chars, whitespace, periods, and brackets
	) {
		const rawText = paragraphText;
		// Regular expressions to match LaTeX delimiters
		const displayMathRegex = /\$\$(.*?)\$\$/g;  // Display math: $$...$$
		const inlineMathRegex = /\$((?!\$).*?)\$/g; // Inline math: $...$ (but not $$)

		// Check if the paragraph contains any LaTeX expressions
		if (displayMathRegex.test(rawText) || inlineMathRegex.test(rawText)) {
			// Reset the regex state (since we used .test earlier)
			displayMathRegex.lastIndex = 0;
			inlineMathRegex.lastIndex = 0;

			// Parse the text into segments of regular text and LaTeX
			let lastIndex = 0;
			let segmentId = 0;

			// First replace display math ($$...$$)
			let match;
			while ((match = displayMathRegex.exec(rawText)) !== null) {
				const [fullMatch, formula] = match;
				const matchIndex = match.index;

				// Add text before the LaTeX expression
				if (matchIndex > lastIndex) {
					const textBefore = rawText.substring(lastIndex, matchIndex);
					segments.push(
						<span key={`text-${segmentId++}`}>
							{textBefore}
						</span>
					);
				}

				// Add the LaTeX expression
				segments.push(
					<LatexRender key={`latex-${segmentId++}`} latex={fullMatch} />
				);

				lastIndex = matchIndex + fullMatch.length;
			}

			// Add any remaining text (which might contain inline math)
			if (lastIndex < rawText.length) {
				const remainingText = rawText.substring(lastIndex);

				// Process inline math in the remaining text
				lastIndex = 0;
				inlineMathRegex.lastIndex = 0;
				const inlineSegments: React.ReactNode[] = [];

				while ((match = inlineMathRegex.exec(remainingText)) !== null) {
					const [fullMatch] = match;
					const matchIndex = match.index;

					// Add text before the inline LaTeX
					if (matchIndex > lastIndex) {
						const textBefore = remainingText.substring(lastIndex, matchIndex);
						inlineSegments.push(
							<span key={`inline-text-${segmentId++}`}>
								{textBefore}
							</span>
						);
					}

					// Add the inline LaTeX
					inlineSegments.push(
						<LatexRender key={`inline-latex-${segmentId++}`} latex={fullMatch} />
					);

					lastIndex = matchIndex + fullMatch.length;
				}

				// Add any remaining text after all inline math
				if (lastIndex < remainingText.length) {
					inlineSegments.push(
						<span key={`inline-final-${segmentId++}`}>
							{remainingText.substring(lastIndex)}
						</span>
					);
				}

				segments.push(...inlineSegments);
			}


		}
	}


	return segments
}


export type RenderTokenOptions = { isApplyEnabled?: boolean, isLinkDetectionEnabled?: boolean }
// Memoize RenderToken to avoid unnecessary work for tokens that haven't changed.
// Since 'marked' returns new objects, we use a custom comparison if possible, or just memoize for React's optimization.
const RenderToken = React.memo(({ token, inPTag, codeURI, chatMessageLocation, tokenIdx, ...options }: { token: Token | string, inPTag?: boolean, codeURI?: URI, chatMessageLocation?: ChatMessageLocation, tokenIdx: string, } & RenderTokenOptions): React.ReactNode => {
	const accessor = useAccessor()
	const languageService = accessor.get('ILanguageService')

	// deal with built-in tokens first (assume marked token)
	const t = token as MarkedToken

	if (t.raw.trim() === '') {
		return null;
	}

	if (t.type === 'space') {
		return <span>{t.raw}</span>
	}

	if (t.type === 'code') {
		const [firstLine, remainingContents] = separateOutFirstLine(t.text)
		const firstLineIsURI = isValidUri(firstLine) && !codeURI
		const contents = firstLineIsURI ? (remainingContents?.trimStart() || '') : t.text // exclude first-line URI from contents

		if (!contents) return null

		// Check if this is a chart definition (JSON or simple syntax)
		const isChart = t.lang === 'chart' || t.lang === 'recharts' ||
			contents.trim().startsWith('{') && (contents.includes('"type"') && contents.includes('"data"')) ||
			contents.trim().startsWith('type:') && contents.includes('data:')

		if (isChart) {
			const chartConfig = parseChartDefinition(contents)
			if (chartConfig) {
				return <ChartRender config={chartConfig} className="my-4" />
			}
		}

		// Check if this is LaTeX math
		const isLatex = t.lang === 'latex' || t.lang === 'math' || t.lang === 'tex'
		if (isLatex) {
			return (
				<div className="my-4 p-4 bg-void-bg-2 rounded-lg border border-void-border-2 overflow-x-auto">
					<LatexRender latex={contents} displayMode={true} />
				</div>
			)
		}

		// figure out langauge and URI
		let uri: URI | null
		let language: string
		if (codeURI) {
			uri = codeURI
		}
		else if (firstLineIsURI) { // get lang from the uri in the first line of the markdown
			uri = URI.file(firstLine)
		}
		else {
			uri = null
		}

		if (t.lang) { // a language was provided. empty string is common so check truthy, not just undefined
			language = convertToVscodeLang(languageService, t.lang) // convert markdown language to language that vscode recognizes (eg markdown doesn't know bash but it does know shell)
		}
		else { // no language provided - fallback - get lang from the uri and contents
			language = detectLanguage(languageService, { uri, fileContents: contents })
		}

		if (options.isApplyEnabled && chatMessageLocation) {
			const isCodeblockClosed = t.raw.trimEnd().endsWith('```') // user should only be able to Apply when the code has been closed (t.raw ends with '```')

			const applyBoxId = getApplyBoxId({
				threadId: chatMessageLocation.threadId,
				messageIdx: chatMessageLocation.messageIdx,
				tokenIdx: tokenIdx,
			})
			return <BlockCodeApplyWrapper
				canApply={isCodeblockClosed}
				applyBoxId={applyBoxId}
				codeStr={contents}
				language={language}
				uri={uri || 'current'}
			>
				<BlockCode
					initValue={contents.trimEnd()} // \n\n adds a permanent newline which creates a flash
					language={language}
				/>
			</BlockCodeApplyWrapper>
		}

		return <BlockCode
			initValue={contents}
			language={language}
		/>
	}

	if (t.type === 'heading') {

		const HeadingTag = `h${t.depth}` as keyof JSX.IntrinsicElements

		return <HeadingTag>
			<ChatMarkdownRender chatMessageLocation={chatMessageLocation} string={t.text} inPTag={true} codeURI={codeURI} {...options} />
		</HeadingTag>
	}

	if (t.type === 'table') {
		return (
			<div className="overflow-x-auto my-4 rounded-lg border border-void-border-2">
				<table className="min-w-full border-collapse">
					<thead>
						<tr className="bg-void-bg-2">
							{t.header.map((h, hIdx: number) => (
								<th
									key={hIdx}
									className="px-4 py-3 text-left text-sm font-semibold text-void-fg-1 border-b border-void-border-2"
									style={{ textAlign: (t.align?.[hIdx] as any) || 'left' }}
								>
									<ChatMarkdownRender
										chatMessageLocation={chatMessageLocation}
										string={h.text}
										inPTag={true}
										{...options}
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{t.rows.map((row, rowIdx: number) => (
							<tr
								key={rowIdx}
								className={rowIdx % 2 === 0 ? 'bg-void-bg-1' : 'bg-void-bg-2/50'}
							>
								{row.map((r, rIdx: number) => (
									<td
										key={rIdx}
										className="px-4 py-3 text-sm text-void-fg-2 border-b border-void-border-2"
										style={{ textAlign: (t.align?.[rIdx] as any) || 'left' }}
									>
										<ChatMarkdownRender
											chatMessageLocation={chatMessageLocation}
											string={r.text}
											inPTag={true}
											{...options}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		)
		// return (
		// 	<div>
		// 		<table className={'min-w-full border border-void-bg-2'}>
		// 			<thead>
		// 				<tr className='bg-void-bg-1'>
		// 					{t.header.map((cell: any, index: number) => (
		// 						<th
		// 							key={index}
		// 							className='px-4 py-2 border border-void-bg-2 font-semibold'
		// 							style={{ textAlign: t.align[index] || 'left' }}
		// 						>
		// 							{cell.raw}
		// 						</th>
		// 					))}
		// 				</tr>
		// 			</thead>
		// 			<tbody>
		// 				{t.rows.map((row: any[], rowIndex: number) => (
		// 					<tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-void-bg-1'}>
		// 						{row.map((cell: any, cellIndex: number) => (
		// 							<td
		// 								key={cellIndex}
		// 								className={'px-4 py-2 border border-void-bg-2'}
		// 								style={{ textAlign: t.align[cellIndex] || 'left' }}
		// 							>
		// 								{cell.raw}
		// 							</td>
		// 						))}
		// 					</tr>
		// 				))}
		// 			</tbody>
		// 		</table>
		// 	</div>
		// )
	}

	if (t.type === 'hr') {
		return <hr />
	}

	if (t.type === 'blockquote') {
		return <blockquote>{t.text}</blockquote>
	}

	if (t.type === 'list_item') {
		return <li>
			<input type='checkbox' checked={t.checked} readOnly />
			<span>
				<ChatMarkdownRender chatMessageLocation={chatMessageLocation} string={t.text} inPTag={true} codeURI={codeURI} {...options} />
			</span>
		</li>
	}

	if (t.type === 'list') {
		const ListTag = t.ordered ? 'ol' : 'ul'

		return (
			<ListTag start={t.start ? t.start : undefined}>
				{t.items.map((item, index) => (
					<li key={index}>
						{item.task && (
							<input type='checkbox' checked={item.checked} readOnly />
						)}
						<span>
							<ChatMarkdownRender chatMessageLocation={chatMessageLocation} string={item.text} inPTag={true} {...options} />
						</span>
					</li>
				))}
			</ListTag>
		)
	}

	if (t.type === 'paragraph') {

		// check for latex
		const latexSegments = paragraphToLatexSegments(t.raw)
		if (latexSegments.length !== 0) {
			if (inPTag) {
				return <span className='block'>{latexSegments}</span>;
			}
			return <p>{latexSegments}</p>;
		}

		// if no latex, default behavior
		const contents = <>
			{t.tokens.map((token, index) => (
				<RenderToken key={index}
					token={token}
					tokenIdx={`${tokenIdx ? `${tokenIdx}-` : ''}${index}`} // assign a unique tokenId to inPTag components
					chatMessageLocation={chatMessageLocation}
					inPTag={true}
					{...options}
				/>
			))}
		</>

		if (inPTag) return <span className='block'>{contents}</span>
		return <p>{contents}</p>
	}

	if (t.type === 'text' || t.type === 'escape' || t.type === 'html') {
		return <span>{t.raw}</span>
	}

	if (t.type === 'def') {
		return <></> // Definitions are typically not rendered
	}

	if (t.type === 'link') {
		return (
			<a
				onClick={() => { window.open(t.href) }}
				href={t.href}
				title={t.title ?? undefined}
				className='underline cursor-pointer hover:brightness-90 transition-all duration-200 text-void-fg-2'
			>
				{t.text}
			</a>
		)
	}

	if (t.type === 'image') {
		return <img
			src={t.href}
			alt={t.text}
			title={t.title ?? undefined}

		/>
	}

	if (t.type === 'strong') {
		return <strong>{t.text}</strong>
	}

	if (t.type === 'em') {
		return <em>{t.text}</em>
	}

	// inline code
	if (t.type === 'codespan') {

		if (options.isLinkDetectionEnabled && chatMessageLocation) {
			return <CodespanWithLink
				text={t.text}
				rawText={t.raw}
				chatMessageLocation={chatMessageLocation}
			/>

		}

		return <Codespan text={t.text} />
	}

	if (t.type === 'br') {
		return <br />
	}

	// strikethrough
	if (t.type === 'del') {
		return <del>{t.text}</del>
	}
	// default
	return (
		<div className='bg-orange-50 rounded-sm overflow-hidden p-2'>
			<span className='text-sm text-orange-500'>Unknown token rendered...</span>
		</div>
	)
}, (prevProps, nextProps) => {
	// Custom comparison function for better React reconciliation during streaming
	// Compare tokens by their content instead of by reference
	const prevToken = prevProps.token as MarkedToken
	const nextToken = nextProps.token as MarkedToken

	// Compare by raw content (the original markdown text)
	if (prevToken.raw !== nextToken.raw) return false

	// Compare type
	if (prevToken.type !== nextToken.type) return false

	// Compare tokenIdx
	if (prevProps.tokenIdx !== nextProps.tokenIdx) return false

	// Compare options
	if (prevProps.isApplyEnabled !== nextProps.isApplyEnabled) return false
	if (prevProps.isLinkDetectionEnabled !== nextProps.isLinkDetectionEnabled) return false

	// Compare chatMessageLocation (if both exist, they should match)
	if (prevProps.chatMessageLocation && nextProps.chatMessageLocation) {
		if (prevProps.chatMessageLocation.threadId !== nextProps.chatMessageLocation.threadId) return false
		if (prevProps.chatMessageLocation.messageIdx !== nextProps.chatMessageLocation.messageIdx) return false
	}

	return true
})


// Helper to detect and fix incomplete markdown during streaming
// This handles various incomplete markdown structures that would cause parsing issues
const preprocessStreamingMarkdown = (text: string): { processedText: string; isIncomplete: boolean } => {
	let processedText = text;
	let isIncomplete = false;

	// 1. Handle incomplete fenced code blocks
	const codeBlockMatches = processedText.match(/```/g);
	const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0;
	if (codeBlockCount % 2 !== 0) {
		processedText = processedText + '\n```';
		isIncomplete = true;
	}

	// 2. Handle incomplete inline code (single backtick)
	const inlineCodeMatches = processedText.match(/`/g);
	const inlineCodeCount = inlineCodeMatches ? inlineCodeMatches.length : 0;
	if (inlineCodeCount % 2 !== 0) {
		// Find the last backtick and add a closing one
		const lastBacktick = processedText.lastIndexOf('`');
		if (lastBacktick !== -1) {
			processedText = processedText.slice(0, lastBacktick + 1) + '`' + processedText.slice(lastBacktick + 1);
		}
	}

	// 3. Handle incomplete bold/italic (must check pairs)
	// Count unmatched ** and * and __ and _
	const processInlineFormatting = (text: string, delimiter: string): string => {
		// Find all occurrences and their positions
		const regex = new RegExp(`\\${delimiter}{1,2}`, 'g');
		const matches = [...text.matchAll(regex)];

		// Check if we have an odd number
		if (matches.length % 2 !== 0) {
			// Add a closing delimiter at the end
			return text + delimiter.repeat(matches[0][0].length);
		}
		return text;
	};

	// Process bold/italic markers
	processedText = processInlineFormatting(processedText, '*');
	processedText = processInlineFormatting(processedText, '_');

	// 4. Handle incomplete strikethrough
	const strikeMatches = processedText.match(/~~/g);
	const strikeCount = strikeMatches ? strikeMatches.length : 0;
	if (strikeCount % 2 !== 0) {
		processedText = processedText + '~~';
	}

	// 5. Handle incomplete links [text](url
	const linkStartMatches = processedText.match(/\[/g);
	const linkEndMatches = processedText.match(/\]/g);
	const linkStartCount = linkStartMatches ? linkStartMatches.length : 0;
	const linkEndCount = linkEndMatches ? linkEndMatches.length : 0;

	if (linkStartCount > linkEndCount) {
		// Unclosed link brackets
		processedText = processedText + ']';
		isIncomplete = true;
	} else if (linkStartCount < linkEndCount) {
		// More closing than opening - escape the extra ones
		// This is less common, just add opening bracket
		processedText = '[' + processedText;
	}

	// Handle incomplete link URLs [text](url without closing paren
	const parenStartMatches = processedText.match(/\]\(/g);
	if (parenStartMatches) {
		// Check for unclosed parentheses after ](
		const afterLinkText = processedText.split(/\]\(/);
		for (let i = 1; i < afterLinkText.length; i++) {
			const part = afterLinkText[i];
			const parenOpen = (part.match(/\(/g) || []).length;
			const parenClose = (part.match(/\)/g) || []).length;
			// If more opening than closing in URL part, we might have incomplete link
		}
	}

	// 6. Handle incomplete images ![alt](url
	const imgMatches = processedText.match(/!\[/g);
	if (imgMatches && linkEndMatches) {
		const imgCount = imgMatches.length;
		// Images need ](url) to close
		const imgCloseMatches = processedText.match(/\)\)/g);
		const imgCloseCount = imgCloseMatches ? imgCloseMatches.length : 0;
		if (imgCount > imgCloseCount) {
			processedText = processedText + ')'; // Close the parenthesis
			isIncomplete = true;
		}
	}

	// 7. Handle incomplete HTML tags (basic detection)
	const htmlOpenMatches = processedText.match(/<[a-zA-Z][^>]*>/g);
	const htmlCloseMatches = processedText.match(/<\/[a-zA-Z]+>/g);
	if (htmlOpenMatches && htmlCloseMatches) {
		if (htmlOpenMatches.length > htmlCloseMatches.length) {
			isIncomplete = true;
		}
	}

	return { processedText, isIncomplete };
}

// Alternative approach: Render streaming content more safely
// This renders the content with minimal formatting during streaming,
// then switches to full markdown when complete
const StreamingMarkdownFallback = ({ string }: { string: string }) => {
	// During streaming, use a simpler rendering that's less prone to artifacts
	// We still do basic processing for code blocks and paragraphs
	const lines = string.split('\n');
	const elements: React.ReactNode[] = [];
	let inCodeBlock = false;
	let codeBlockContent: string[] = [];
	let codeBlockLang = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.startsWith('```')) {
			if (!inCodeBlock) {
				// Start code block
				if (codeBlockContent.length > 0 || i > 0) {
					elements.push(<p key={`text-${elements.length}`} className="whitespace-pre-wrap mb-2">{codeBlockContent.join('\n') || ''}</p>);
					codeBlockContent = [];
				}
				inCodeBlock = true;
				codeBlockLang = line.slice(3).trim();
			} else {
				// End code block
				inCodeBlock = false;
				elements.push(
					<BlockCode
						key={`code-${elements.length}`}
						initValue={codeBlockContent.join('\n')}
						language={codeBlockLang || 'plaintext'}
					/>
				);
				codeBlockContent = [];
				codeBlockLang = '';
			}
		} else if (inCodeBlock) {
			codeBlockContent.push(line);
		} else {
			// Regular text - just accumulate
			codeBlockContent.push(line);
		}
	}

	// Handle remaining content
	if (inCodeBlock) {
		// Unclosed code block - still show it
		elements.push(
			<BlockCode
				key={`code-${elements.length}`}
				initValue={codeBlockContent.join('\n')}
				language={codeBlockLang || 'plaintext'}
			/>
		);
	} else if (codeBlockContent.length > 0) {
		// Remaining text
		elements.push(<p key={`text-${elements.length}`} className="whitespace-pre-wrap mb-2">{codeBlockContent.join('\n')}</p>);
	}

	return <>{elements}</>;
}

// Generate a stable content-based key for a token
// This uses a hash of the token's raw content so that tokens that haven't changed
// maintain the same key across re-renders, preventing React from unmounting/remounting
const generateTokenKey = (token: Token, index: number, prefix: string): string => {
	// Use token.raw for content-based identity (raw contains the original markdown text)
	// Fall back to token.text if raw is not available
	const content = token.raw || (token as any).text || '';

	// Simple hash function for content stability
	let hash = 0;
	for (let i = 0; i < content.length && i < 50; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}

	// Combine prefix + content hash + type + index for stable identification
	// The prefix ensures different messages don't have colliding keys
	// The content hash ensures tokens with same content get same keys
	// The index is a fallback for uniqueness within the same content
	return `${prefix}-${token.type}-${Math.abs(hash).toString(36)}-${index}`;
}

// Component to render streaming markdown with proper handling of incomplete structures
// KEY INSIGHT: During streaming, markdown is often incomplete and parsing it can produce
// wildly different token structures that cause visual jumping/flickering.
//
// Strategy: During streaming, we render content more conservatively:
// 1. Code blocks are detected and rendered properly (they're critical for code)
// 2. Everything else is rendered as styled text with proper line breaks
// 3. When streaming completes, full markdown parsing is used
//
// IMPORTANT: We use content-based keys to prevent React from remounting components
// when new content arrives. This prevents flickering and visual jumping.
const StreamingMarkdownRender = ({ string, inPTag, chatMessageLocation, ...options }: { string: string, inPTag?: boolean, chatMessageLocation: ChatMessageLocation | undefined } & RenderTokenOptions) => {
	// Parse the content into segments: code blocks and regular text
	// This is more stable than full markdown parsing during streaming
	const segments = useMemo(() => {
		return parseStreamingContent(string);
	}, [string]);

	return (
		<>
			{segments.map((segment, segIdx) => {
				if (segment.type === 'code') {
					// Code blocks are rendered properly even during streaming
					const language = segment.language || 'plaintext';
					return (
						<BlockCode
							key={`seg-${segIdx}`}
							initValue={segment.content}
							language={language}
						/>
					);
				} else if (segment.type === 'inline-code') {
					// Inline code
					return (
						<code key={`seg-${segIdx}`} className="font-mono font-medium rounded-sm bg-void-bg-1 px-1">
							{segment.content}
						</code>
					);
				} else {
					// Regular text - render with proper line breaks
					// Still allow some inline formatting but don't restructure
					return (
						<span key={`seg-${segIdx}`} className="whitespace-pre-wrap">
							{segment.content.split('\n').map((line, lineIndex, lines) => (
								<React.Fragment key={`line-${segIdx}-${lineIndex}`}>
									{renderInlineFormatting(line, chatMessageLocation, options)}
									{lineIndex < lines.length - 1 && <br />}
								</React.Fragment>
							))}
						</span>
					);
				}
			})}
		</>
	);
}

// Generate a stable hash for content-based keys
const hashContent = (content: string): string => {
	let hash = 0;
	for (let i = 0; i < content.length && i < 100; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
};

// Parse streaming content into stable segments
// This is more tolerant than full markdown parsing
function parseStreamingContent(text: string): Array<{ type: 'text' | 'code' | 'inline-code', content: string, language?: string, key: string }> {
	const segments: Array<{ type: 'text' | 'code' | 'inline-code', content: string, language?: string, key: string }> = [];

	// Find code blocks (fenced with ```)
	const codeBlockRegex = /```(\w*)\n([\s\S]*?)(```|$)/g;
	let lastIndex = 0;
	let match;
	let segmentIndex = 0;

	while ((match = codeBlockRegex.exec(text)) !== null) {
		// Add text before code block
		if (match.index > lastIndex) {
			const textContent = text.slice(lastIndex, match.index);
			segments.push({
				type: 'text',
				content: textContent,
				key: `text-${segmentIndex}-${hashContent(textContent)}`
			});
			segmentIndex++;
		}

		// Add code block
		const language = match[1] || 'plaintext';
		const code = match[2];
		const isComplete = match[3] === '```';

		segments.push({
			type: 'code',
			content: code,
			language,
			key: `code-${segmentIndex}-${language}-${hashContent(code)}`
		});
		segmentIndex++;

		lastIndex = match.index + match[0].length;

		// If incomplete, the regex won't match the closing ```
		if (!isComplete) {
			// Add remaining as code (incomplete)
			segments[segments.length - 1].content = code;
			lastIndex = text.length;
		}
	}

	// Add remaining text
	if (lastIndex < text.length) {
		const textContent = text.slice(lastIndex);
		segments.push({
			type: 'text',
			content: textContent,
			key: `text-${segmentIndex}-${hashContent(textContent)}`
		});
	}

	// If no segments, return whole text
	if (segments.length === 0) {
		segments.push({ type: 'text', content: text, key: `text-0-${hashContent(text)}` });
	}

	return segments;
}

// Render inline formatting (bold, italic, inline code, links) without restructuring
function renderInlineFormatting(text: string, chatMessageLocation: ChatMessageLocation | undefined, options: RenderTokenOptions): React.ReactNode {
	// Handle inline code first (to avoid processing markdown inside code)
	const parts: React.ReactNode[] = [];
	const inlineCodeRegex = /`([^`]+)`/g;
	let lastIndex = 0;
	let match;

	while ((match = inlineCodeRegex.exec(text)) !== null) {
		// Add text before inline code
		if (match.index > lastIndex) {
			parts.push(renderTextWithFormatting(text.slice(lastIndex, match.index), `txt-${lastIndex}-${match.index}`));
		}

		// Add inline code with stable key based on content
		const codeContent = match[1];

		// Check if this is a blank: [___] or ___ (at least 2 underscores)
		const isBlank = /^(?:\[__{1,}\]|__{2,})$/.test(codeContent.trim());

		if (isBlank) {
			parts.push(
				<FillInTheBlank
					key={`blank-${hashContent(codeContent)}`}
					placeholder={codeContent.trim()}
				/>
			);
		} else {
			parts.push(
				<code key={`ic-${hashContent(codeContent)}`} className="font-mono font-medium rounded-sm bg-void-bg-1 px-1 text-void-fg-1">
					{codeContent}
				</code>
			);
		}

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push(renderTextWithFormatting(text.slice(lastIndex), `txt-${lastIndex}-end`));
	}

	// If no inline code, just render with basic formatting
	if (parts.length === 0) {
		return renderTextWithFormatting(text, 'txt-only');
	}

	return parts;
}

// Render text with basic inline formatting (bold, italic)
function renderTextWithFormatting(text: string, keyBase: string): React.ReactNode {
	// Simple regex-based formatting for streaming
	// Bold: **text** or __text__
	// Italic: *text* or _text_

	// For streaming, we'll render these as-is if incomplete
	// This prevents flickering when ** is being typed

	// Check if there are unclosed formatting markers
	const boldCount = (text.match(/\*\*/g) || []).length;
	const italicStarCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
	const italicUnderscoreCount = (text.match(/(?<!_)_(?!_)/g) || []).length;

	// If odd number of markers, content is incomplete - render as-is
	if (boldCount % 2 !== 0 || italicStarCount % 2 !== 0 || italicUnderscoreCount % 2 !== 0) {
		// Try to format complete portions
		return <span key={keyBase}>{text}</span>;
	}

	// All markers are paired - we can safely format
	// For simplicity during streaming, just return the text
	// The full markdown parser will handle formatting when complete
	return <span key={keyBase}>{text}</span>;
}

export const ChatMarkdownRender = ({ string, inPTag = false, chatMessageLocation, isStreaming = false, ...options }: { string: string, inPTag?: boolean, codeURI?: URI, chatMessageLocation: ChatMessageLocation | undefined, isStreaming?: boolean } & RenderTokenOptions) => {
	// Safety check: ensure string is defined
	const safeString = string?.replaceAll('\n•', '\n\n•') || '';

	// During streaming, use streaming-aware markdown rendering
	if (isStreaming) {
		return <StreamingMarkdownRender
			string={safeString}
			inPTag={inPTag}
			chatMessageLocation={chatMessageLocation}
			{...options}
		/>;
	}

	const tokens = useMemo(() => marked.lexer(safeString), [safeString]); // https://marked.js.org/using_pro#renderer
	return (
		<>
			{tokens.map((token, index) => (
				<RenderToken key={index} token={token} inPTag={inPTag} chatMessageLocation={chatMessageLocation} tokenIdx={index + ''} {...options} />
			))}
		</>
	)
}
