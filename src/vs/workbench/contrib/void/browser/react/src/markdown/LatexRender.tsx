/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';
import katex from 'katex';

// Import KaTeX CSS
import 'katex/dist/katex.min.css';

export interface LatexRenderProps {
	latex: string;
	displayMode?: boolean;
	className?: string;
	throwOnError?: boolean;
}

/**
 * Renders LaTeX math expressions using KaTeX
 */
export const LatexRender: React.FC<LatexRenderProps> = ({
	latex,
	displayMode = false,
	className = '',
	throwOnError = false,
}) => {
	// Render LaTeX to HTML
	const html = useMemo(() => {
		try {
			// Clean up the latex string - remove $ or $$ delimiters if present
			let cleanLatex = latex.trim();

			// Remove display math delimiters $$...$$
			if (cleanLatex.startsWith('$$') && cleanLatex.endsWith('$$')) {
				cleanLatex = cleanLatex.slice(2, -2).trim();
			}
			// Remove inline math delimiters $...$
			else if (cleanLatex.startsWith('$') && cleanLatex.endsWith('$')) {
				cleanLatex = cleanLatex.slice(1, -1).trim();
			}
			// Remove \[...\] display math delimiters
			else if (cleanLatex.startsWith('\\[') && cleanLatex.endsWith('\\]')) {
				cleanLatex = cleanLatex.slice(2, -2).trim();
			}
			// Remove \(...\) inline math delimiters
			else if (cleanLatex.startsWith('\\(') && cleanLatex.endsWith('\\)')) {
				cleanLatex = cleanLatex.slice(2, -2).trim();
			}

			return katex.renderToString(cleanLatex, {
				displayMode,
				throwOnError,
				// Keep htmlAndMathml for copy-paste / accessibility (affects display math DOM)
				output: 'htmlAndMathml',
				// Restrict `trust` to inline mode only; display math already added a safe
				// overflowX wrapper, so disable arbitrary command trust there.
				trust: displayMode ? false : true,
			});
		} catch (error) {
			console.error('KaTeX rendering error:', error);
			if (throwOnError) {
				throw error;
			}
			// Return error message as fallback
			return `<span class="katex-error text-red-400" style="color: #f87171;">${latex}</span>`;
		}
	}, [latex, displayMode, throwOnError]);

	return (
		<span
			className={`katex-container ${displayMode ? 'block my-2 text-center' : 'inline'} ${className}`}
			style={displayMode ? { display: 'block', overflowX: 'auto', padding: '0.5em 0' } : {}}
		>
			<span dangerouslySetInnerHTML={{ __html: html }} />
		</span>
	);
};

/**
 * Parses text containing LaTeX expressions and renders them
 * Supports inline ($...$) and display ($$...$$) math modes
 */
export const LatexTextRender: React.FC<{
	text: string;
	className?: string;
}> = ({ text, className = '' }) => {
	// Parse text for LaTeX expressions
	const segments = useMemo(() => {
		const result: Array<{ type: 'text' | 'inline-math' | 'display-math'; content: string }> = [];

		// Regex patterns
		const displayMathRegex = /\$\$([\s\S]*?)\$\$/g; // $$...$$ display math
		const inlineMathRegex = /\$((?!\$)[\s\S]*?)\$/g; // $...$ inline math (not $$)
		const bracketDisplayRegex = /\\\[([\s\S]*?)\\\]/g; // \[...\] display math
		const bracketInlineRegex = /\\\(([\s\S]*?)\\\)/g; // \(...\) inline math

		// Collect all matches with positions
		interface Match {
			type: 'inline-math' | 'display-math';
			content: string;
			start: number;
			end: number;
		}

		const matches: Match[] = [];

		// Find display math $$...$$
		let match;
		while ((match = displayMathRegex.exec(text)) !== null) {
			matches.push({ type: 'display-math', content: match[1], start: match.index, end: match.index + match[0].length });
		}

		// Find display math \[...\]
		while ((match = bracketDisplayRegex.exec(text)) !== null) {
			matches.push({ type: 'display-math', content: match[1], start: match.index, end: match.index + match[0].length });
		}

		// Find inline math $...$
		while ((match = inlineMathRegex.exec(text)) !== null) {
			// Skip if this is inside a display math match
			const isInsideDisplay = matches.some(m => m.type === 'display-math' && match.index >= m.start && match.index < m.end);
			if (!isInsideDisplay) {
				matches.push({ type: 'inline-math', content: match[1], start: match.index, end: match.index + match[0].length });
			}
		}

		// Find inline math \(...\)
		while ((match = bracketInlineRegex.exec(text)) !== null) {
			const isInsideDisplay = matches.some(m => m.type === 'display-math' && match.index >= m.start && match.index < m.end);
			if (!isInsideDisplay) {
				matches.push({ type: 'inline-math', content: match[1], start: match.index, end: match.index + match[0].length });
			}
		}

		// Sort matches by position
		matches.sort((a, b) => a.start - b.start);

		// Build result array
		let lastIndex = 0;
		for (const m of matches) {
			// Add text before this match
			if (m.start > lastIndex) {
				result.push({ type: 'text', content: text.slice(lastIndex, m.start) });
			}
			// Add the match
			result.push({ type: m.type, content: m.content });
			lastIndex = m.end;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			result.push({ type: 'text', content: text.slice(lastIndex) });
		}

		return result;
	}, [text]);

	return (
		<span className={`latex-text ${className}`}>
			{segments.map((segment, index) => {
				if (segment.type === 'text') {
					return <span key={index}>{segment.content}</span>;
				} else if (segment.type === 'display-math') {
					return (
						<LatexRender
							key={index}
							latex={segment.content}
							displayMode={true}
						/>
					);
				} else {
					return (
						<LatexRender
							key={index}
							latex={segment.content}
							displayMode={false}
						/>
					);
				}
			})}
		</span>
	);
};

export default LatexRender;