/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Pure edit-resolution logic for the string-based edit tools (edit_file, edit_files).
 *
 * Modeled on a-coder-cli's edit tool:
 * - Every edit is matched against the ORIGINAL content, not incrementally.
 * - Exact match first; if that fails, retry against fuzzy-normalized lines
 *   (trailing whitespace, smart quotes, unicode dashes/spaces).
 * - Uniqueness is enforced in the same domain as the match (an exact match is
 *   counted exactly; a fuzzy match is counted in fuzzy space) so normalization
 *   cannot falsely collapse a unique match into a duplicate.
 * - Overlapping edits are rejected: exact-vs-exact overlaps are detected at
 *   character precision (disjoint same-line edits are allowed); whenever a
 *   fuzzy match is involved the comparison widens to whole lines.
 *
 * This module is pure (zero VS Code imports) so it can be unit-tested under
 * `npm run test-node`. All content handed to these functions must already be
 * LF-normalized; all line indexes are 0-based and all columns 1-based (Monaco
 * column convention).
 *
 * Accepted trade-offs (by design):
 * - Indentation is NOT tolerated: only trailing whitespace is stripped. Leading
 *   whitespace must match exactly, keeping the guardrail against sloppy matches.
 * - NFKC folding is scoped per line; exotic unicode in prose could in theory
 *   fold two visually distinct lines together, but the blast radius is one
 *   replacement and every fuzzy match is reported via onProgress.
 */

export const normalizeLineEndings = (str: string): string => {
	return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

/**
 * Normalize a single line for fuzzy matching. Applies the same progressive
 * transforms as a-coder-cli's edit tool: NFKC unicode folding, trailing
 * whitespace stripped, smart quotes/dashes/special spaces folded to ASCII.
 * The model frequently emits these variants when re-typing file content.
 */
export const normalizeForFuzzyMatch = (line: string): string => {
	return line
		.normalize('NFKC')
		.trimEnd()
		// Smart single quotes → '
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		// Smart double quotes → "
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		// En/em dashes, hyphens, minus → -
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
		// NBSP and other unicode spaces → ' '
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ');
};

/**
 * Find the contiguous run of lines in `normContentLines` whose fuzzy-normalized
 * forms equal `normOldLines`. Returns all start indices of matching runs
 * (0-based).
 */
export const findFuzzyLineRuns = (normContentLines: string[], normOldLines: string[]): number[] => {
	const runLen = normOldLines.length;
	if (runLen === 0 || runLen > normContentLines.length) return [];
	const starts: number[] = [];
	outer: for (let i = 0; i <= normContentLines.length - runLen; i++) {
		for (let j = 0; j < runLen; j++) {
			if (normContentLines[i + j] !== normOldLines[j]) continue outer;
		}
		starts.push(i);
	}
	return starts;
};

export interface EditSpec {
	oldText: string;
	newText: string;
}

/**
 * A resolved edit, located on the ORIGINAL (LF-normalized) content.
 * - `exact`: character range [startIdx, endIdx).
 * - `fuzzy`: inclusive line range [startLineIdx, endLineIdx], clamped to the
 *   file's real lines (a trailing empty line from a "\n"-terminated oldText is
 *   clamped away at EOF).
 */
export type EditResolution =
	| { editIndex: number; kind: 'exact'; startIdx: number; endIdx: number }
	| { editIndex: number; kind: 'fuzzy'; startLineIdx: number; endLineIdx: number };

export type EditResolutionError =
	| { type: 'empty-old-text'; editIndex: number }
	| { type: 'not-found'; editIndex: number }
	| { type: 'not-unique'; editIndex: number; occurrences: number; domain: 'exact' | 'fuzzy' }
	| { type: 'overlap'; editIndexA: number; editIndexB: number };

export type EditResolutionResult =
	| { ok: true; resolutions: EditResolution[]; usedFuzzy: boolean }
	| { ok: false; error: EditResolutionError };

const countExactOccurrences = (content: string, text: string): number => {
	if (text.length === 0) return 0;
	return content.split(text).length - 1;
};

/** 0-based index of the line containing `offset` (a char position). */
const lineOfOffset = (lineStarts: number[], offset: number): number => {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lineStarts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
};

export const lineStartsOf = (content: string): number[] => {
	const starts: number[] = [0];
	for (let i = 0; i < content.length; i++) {
		if (content.charCodeAt(i) === 10) starts.push(i + 1);
	}
	return starts;
};

/** Number of real lines (a trailing EOL does not create a phantom line). */
export const realLineCount = (content: string): number => {
	if (content.length === 0) return 0;
	const count = content.split('\n').length;
	return content.endsWith('\n') ? count - 1 : count;
};

/**
 * Convert a character range on LF-normalized content into 0-based line indexes
 * with 1-based columns (Monaco convention). The end position is exclusive; a
 * range that consumes a trailing EOL maps to the start of the following line
 * (the caller must clamp to the model's line count at EOF).
 */export const charRangeToLineCols = (
	content: string,
	startIdx: number,
	endIdx: number,
): { start: { lineIdx: number; col: number }; end: { lineIdx: number; col: number } } => {
	const lineStarts = lineStartsOf(content);
	const startLineIdx = lineOfOffset(lineStarts, startIdx);
	const start = { lineIdx: startLineIdx, col: startIdx - lineStarts[startLineIdx] + 1 };

	const lastCharIdx = endIdx - 1;
	if (lastCharIdx >= startIdx && content[lastCharIdx] === '\n') {
		// The match consumes a newline: the end position is the start of the
		// following line (col 1). At EOF this is one past the last real line;
		// the caller clamps against the model's line count.
		const endLineIdx = lineOfOffset(lineStarts, lastCharIdx) + 1;
		return { start, end: { lineIdx: endLineIdx, col: 1 } };
	}
	const endLineIdx = lineOfOffset(lineStarts, lastCharIdx);
	return { start, end: { lineIdx: endLineIdx, col: endIdx - lineStarts[endLineIdx] + 1 } };
};

/**
 * Resolve every edit against the same original content (never incrementally).
 * Exact match first, fuzzy fallback per edit; enforces uniqueness in the
 * match's domain and rejects overlapping edits.
 */
export const resolveEditSpecs = (content: string, edits: EditSpec[]): EditResolutionResult => {
	if (edits.length === 0) {
		return { ok: false, error: { type: 'empty-old-text', editIndex: 0 } };
	}

	const normalizedEdits = edits.map((edit) => ({
		oldText: normalizeLineEndings(edit.oldText),
		newText: normalizeLineEndings(edit.newText),
	}));

	for (let i = 0; i < normalizedEdits.length; i++) {
		if (normalizedEdits[i].oldText.length === 0) {
			return { ok: false, error: { type: 'empty-old-text', editIndex: i } };
		}
	}

	const normContentLines = content.split('\n').map(normalizeForFuzzyMatch);
	const resolutions: EditResolution[] = [];
	let usedFuzzy = false;

	for (let i = 0; i < normalizedEdits.length; i++) {
		const { oldText } = normalizedEdits[i];

		const exactIndex = content.indexOf(oldText);
		if (exactIndex !== -1) {
			// Count occurrences in the exact domain: counting in fuzzy space would
			// normalize both sides and collapse a unique exact match like "abc " in
			// "abc \nabc" into a false duplicate.
			const occurrences = countExactOccurrences(content, oldText);
			if (occurrences > 1) {
				return { ok: false, error: { type: 'not-unique', editIndex: i, occurrences, domain: 'exact' } };
			}
			resolutions.push({ editIndex: i, kind: 'exact', startIdx: exactIndex, endIdx: exactIndex + oldText.length });
			continue;
		}

		// Fuzzy fallback: match normalized lines. Normalize PER LINE (like
		// a-coder-cli) so a trailing newline in oldText yields a trailing empty
		// line rather than being trimmed away with the whole-string trimEnd.
		const normOldLines = oldText.split('\n').map(normalizeForFuzzyMatch);
		if (normOldLines.every((line) => line.length === 0)) {
			// All-whitespace oldText would fuzzy-match blank line runs — useless.
			return { ok: false, error: { type: 'not-found', editIndex: i } };
		}
		const starts = findFuzzyLineRuns(normContentLines, normOldLines);
		if (starts.length === 0) {
			return { ok: false, error: { type: 'not-found', editIndex: i } };
		}
		if (starts.length > 1) {
			return { ok: false, error: { type: 'not-unique', editIndex: i, occurrences: starts.length, domain: 'fuzzy' } };
		}
		const realLines = realLineCount(content);
		const startLineIdx = starts[0];
		// A trailing empty line in oldText can point at the phantom line after a
		// final EOL; clamp to the last real line.
		const endLineIdx = Math.min(startLineIdx + normOldLines.length - 1, realLines - 1);
		if (startLineIdx > endLineIdx) {
			return { ok: false, error: { type: 'not-found', editIndex: i } };
		}
		usedFuzzy = true;
		resolutions.push({ editIndex: i, kind: 'fuzzy', startLineIdx, endLineIdx });
	}

	// Overlap detection. Exact-vs-exact uses character precision (disjoint
	// same-line edits are allowed); anything involving a fuzzy match widens to
	// whole-line spans, which is conservative in the mixed case.
	const exactOverlap = (a: { startIdx: number; endIdx: number }, b: { startIdx: number; endIdx: number }): boolean =>
		a.startIdx < b.endIdx && b.startIdx < a.endIdx;
	const lineSpanOf = (content: string, lineStarts: number[], res: EditResolution): { start: number; end: number } => {
		if (res.kind === 'fuzzy') return { start: res.startLineIdx, end: res.endLineIdx };
		const start = lineOfOffset(lineStarts, res.startIdx);
		const end = lineOfOffset(lineStarts, Math.max(res.endIdx - 1, res.startIdx));
		return { start, end };
	};

	const lineStarts = lineStartsOf(content);
	const lineSpans = resolutions.map((res) => lineSpanOf(content, lineStarts, res));
	for (let a = 0; a < resolutions.length; a++) {
		for (let b = a + 1; b < resolutions.length; b++) {
			const ra = resolutions[a];
			const rb = resolutions[b];
			const overlaps =
				ra.kind === 'exact' && rb.kind === 'exact'
					? exactOverlap(ra, rb)
					: lineSpans[a].start <= lineSpans[b].end && lineSpans[b].start <= lineSpans[a].end;
			if (overlaps) {
				return { ok: false, error: { type: 'overlap', editIndexA: a, editIndexB: b } };
			}
		}
	}

	return { ok: true, resolutions, usedFuzzy };
};
/**
 * A Monaco-shaped edit operation: 1-based line numbers, 1-based columns,
 * replacement text already converted to the target line-ending style.
 */
export interface MonacoEditOp {
	range: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
	text: string;
}

/**
 * Turn resolved edits into Monaco edit operations against the ORIGINAL content
 * (all ranges reference the same snapshot, so the batch can be applied with a
 * single `pushEditOperations` call — all-or-nothing, one undo step).
 *
 * Exact matches keep character precision; fuzzy matches replace whole lines.
 * A match consuming the file's final EOL is clamped to the end of the last
 * real line (Monaco's trailing EOL is implicit and not range-addressable), so
 * a trailing newline at EOF is preserved rather than removed — matching
 * VS Code's own behavior. No-op replacements (identical region content) are
 * dropped; if every edit is a no-op the caller receives an empty array.
 */
export const buildEditOperations = (
	content: string,
	resolutions: EditResolution[],
	edits: EditSpec[],
	opts?: { eol?: '\n' | '\r\n' },
): MonacoEditOp[] => {
	const lines = content.split('\n');
	const realLines = realLineCount(content);
	const eol = opts?.eol ?? '\n';
	const toEol = (text: string): string =>
		eol === '\r\n' ? normalizeLineEndings(text).replace(/\n/g, '\r\n') : normalizeLineEndings(text);

	const ops: MonacoEditOp[] = [];
	for (const res of resolutions) {
		const edit = edits[res.editIndex];
		if (res.kind === 'exact') {
			const newText = normalizeLineEndings(edit.newText);
			if (content.slice(res.startIdx, res.endIdx) === newText) continue; // no-op edit
			const { start, end } = charRangeToLineCols(content, res.startIdx, res.endIdx);
			// Clamp an end position that points past the last real line (a match
			// consuming the file's final EOL) to the end of that line.
			const endLineNumber = Math.min(end.lineIdx + 1, realLines);
			const endColumn = end.lineIdx + 1 > realLines ? lines[realLines - 1].length + 1 : end.col;
			ops.push({
				range: { startLineNumber: start.lineIdx + 1, startColumn: start.col, endLineNumber, endColumn },
				text: toEol(edit.newText),
			});
		} else {
			const startLineNumber = res.startLineIdx + 1;
			const endLineNumber = Math.min(res.endLineIdx + 1, realLines);
			if (startLineNumber > endLineNumber) continue;
			ops.push({
				range: { startLineNumber, startColumn: 1, endLineNumber, endColumn: lines[res.endLineIdx].length + 1 },
				text: toEol(edit.newText),
			});
		}
	}
	return ops;
};
