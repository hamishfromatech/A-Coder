/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	buildEditOperations,
	lineStartsOf,
	charRangeToLineCols,
	findFuzzyLineRuns,
	normalizeForFuzzyMatch,
	normalizeLineEndings,
	realLineCount,
	resolveEditSpecs,
} from '../../common/editFuzzyMatch.js';

suite('editFuzzyMatch', () => {

	suite('normalizeForFuzzyMatch', () => {
		test('strips trailing whitespace only', () => {
			assert.strictEqual(normalizeForFuzzyMatch('const x = 1;   '), 'const x = 1;');
			assert.strictEqual(normalizeForFuzzyMatch('  const x = 1;'), '  const x = 1;');
		});

		test('folds smart quotes to ASCII', () => {
			assert.strictEqual(normalizeForFuzzyMatch('\u2018a\u2019 \u201Cb\u201D'), "'a' \"b\"");
		});

		test('folds unicode dashes to hyphen', () => {
			assert.strictEqual(normalizeForFuzzyMatch('a\u2013b\u2014c\u2212d\u2010e'), 'a-b-c-d-e');
		});

		test('folds NBSP and unicode spaces to space', () => {
			assert.strictEqual(normalizeForFuzzyMatch('a\u00A0b\u2002c\u3000d'), 'a b c d');
		});

		test('NFKC folds compatibility characters', () => {
			assert.strictEqual(normalizeForFuzzyMatch('\uFB01le'), 'file'); // ﬁ ligature → fi
		});
	});

	suite('findFuzzyLineRuns', () => {
		const norm = (s: string) => s.split('\n').map(normalizeForFuzzyMatch);

		test('finds a single run', () => {
			assert.deepStrictEqual(findFuzzyLineRuns(norm('a\nb\nc'), norm('b')), [1]);
		});

		test('finds multiple runs', () => {
			assert.deepStrictEqual(findFuzzyLineRuns(norm('x\nx'), norm('x')), [0, 1]);
		});

		test('no run when text absent', () => {
			assert.deepStrictEqual(findFuzzyLineRuns(norm('a\nb'), norm('z')), []);
		});

		test('no run when run longer than content', () => {
			assert.deepStrictEqual(findFuzzyLineRuns(norm('a'), norm('a\nb')), []);
		});
	});

	suite('realLineCount', () => {
		test('trailing EOL does not create a phantom line', () => {
			assert.strictEqual(realLineCount('a\nb\n'), 2);
			assert.strictEqual(realLineCount('a\nb'), 2);
			assert.strictEqual(realLineCount(''), 0);
		});
	});

	suite('charRangeToLineCols', () => {
		test('mid-line range', () => {
			const r = charRangeToLineCols('abcdef', 2, 4);
			assert.deepStrictEqual(r.start, { lineIdx: 0, col: 3 });
			assert.deepStrictEqual(r.end, { lineIdx: 0, col: 5 });
		});

		test('interior range ending with newline maps to next line col 1', () => {
			const r = charRangeToLineCols('ab\ncd', 0, 3); // "ab\n"
			assert.deepStrictEqual(r.start, { lineIdx: 0, col: 1 });
			assert.deepStrictEqual(r.end, { lineIdx: 1, col: 1 });
		});

		test('range ending with final newline maps past last real line (caller clamps)', () => {
			const r = charRangeToLineCols('ab\ncd\n', 3, 6); // "cd\n"
			assert.deepStrictEqual(r.start, { lineIdx: 1, col: 1 });
			assert.deepStrictEqual(r.end, { lineIdx: 2, col: 1 });
		});

		test('multi-line range keeps columns within lines', () => {
			const r = charRangeToLineCols('ab\ncdef\ngh', 1, 7); // "b\ncdef"
			assert.deepStrictEqual(r.start, { lineIdx: 0, col: 2 });
			assert.deepStrictEqual(r.end, { lineIdx: 1, col: 5 });
		});
	});

	suite('resolveEditSpecs', () => {

		test('single unique exact match', () => {
			const r = resolveEditSpecs('const a = 1;\nconst b = 2;\n', [{ oldText: 'const b = 2;', newText: 'const b = 3;' }]);
			assert.ok(r.ok);
			if (r.ok) {
				assert.strictEqual(r.usedFuzzy, false);
				assert.deepStrictEqual(r.resolutions[0], { editIndex: 0, kind: 'exact', startIdx: 13, endIdx: 25 });
			}
		});

		test('exact duplicate → not-unique with occurrence count', () => {
			const r = resolveEditSpecs('x();\nx();\n', [{ oldText: 'x();', newText: 'y();' }]);
			assert.ok(!r.ok);
			if (!r.ok && r.error.type === 'not-unique') {
				assert.strictEqual(r.error.occurrences, 2);
			} else {
				assert.fail('expected not-unique');
			}
		});

		test('fuzzy fallback on trailing whitespace + smart quote + dash', () => {
			const content = 'const msg = \u201Chello\u2014world\u201D;   \nconst y = 2;\n';
			const r = resolveEditSpecs(content, [{ oldText: 'const msg = "hello-world";', newText: 'const msg = "hi";' }]);
			assert.ok(r.ok);
			if (r.ok) {
				assert.strictEqual(r.usedFuzzy, true);
				assert.deepStrictEqual(r.resolutions[0], { editIndex: 0, kind: 'fuzzy', startLineIdx: 0, endLineIdx: 0 });
			}
		});

		test('fuzzy fallback on NBSP', () => {
			const r = resolveEditSpecs('const x\u00A0= 1;\n', [{ oldText: 'const x = 1;', newText: 'const x = 2;' }]);
			assert.ok(r.ok);
			if (r.ok) assert.strictEqual(r.usedFuzzy, true);
		});

		test('not found anywhere → not-found', () => {
			const r = resolveEditSpecs('a\nb\nc\n', [{ oldText: 'zzz', newText: 'y' }]);
			assert.ok(!r.ok);
			if (!r.ok) assert.strictEqual(r.error.type, 'not-found');
		});

		test('whitespace-only oldText → not-found', () => {
			const r = resolveEditSpecs('a\n\nb\n', [{ oldText: '   ', newText: 'x' }]);
			assert.ok(!r.ok);
			if (!r.ok) assert.strictEqual(r.error.type, 'not-found');
		});

		test('empty oldText → empty-old-text', () => {
			const r = resolveEditSpecs('a\n', [{ oldText: '', newText: 'x' }]);
			assert.ok(!r.ok);
			if (!r.ok) assert.strictEqual(r.error.type, 'empty-old-text');
		});

		test('empty edits array → empty-old-text', () => {
			const r = resolveEditSpecs('a\n', []);
			assert.ok(!r.ok);
			if (!r.ok) assert.strictEqual(r.error.type, 'empty-old-text');
		});

		test('fuzzy matching multiple locations → not-unique', () => {
			const content = 'foo bar;\nx = 1;\nfoo bar;  \n';
			const r = resolveEditSpecs(content, [{ oldText: 'foo bar;', newText: 'baz;' }]);
			assert.ok(!r.ok);
			if (!r.ok && r.error.type === 'not-unique') {
				assert.strictEqual(r.error.occurrences, 2);
			} else {
				assert.fail('expected not-unique');
			}
		});

		test('uniqueness stays in the exact domain: "abc " is unique in "abc \\nabc"', () => {
			// In fuzzy space both lines are "abc" — but the exact match is unique.
			const r = resolveEditSpecs('abc \nabc\n', [{ oldText: 'abc ', newText: 'xyz' }]);
			assert.ok(r.ok);
			if (r.ok) {
				assert.strictEqual(r.usedFuzzy, false);
				assert.deepStrictEqual(r.resolutions[0], { editIndex: 0, kind: 'exact', startIdx: 0, endIdx: 4 });
			}
		});

		test('two disjoint exact edits both resolve', () => {
			const r = resolveEditSpecs(
				'a = 1;\nb = 2;\nc = 3;\n',
				[
					{ oldText: 'a = 1;', newText: 'a = 10;' },
					{ oldText: 'c = 3;', newText: 'c = 30;' },
				],
			);
			assert.ok(r.ok);
			if (r.ok) assert.strictEqual(r.resolutions.length, 2);
		});

		test('overlapping exact edits → overlap', () => {
			const r = resolveEditSpecs(
				'abcdef;\n',
				[
					{ oldText: 'abc', newText: 'x' },
					{ oldText: 'cdef', newText: 'y' },
				],
			);
			assert.ok(!r.ok);
			if (!r.ok && r.error.type === 'overlap') {
				assert.strictEqual(r.error.editIndexA, 0);
				assert.strictEqual(r.error.editIndexB, 1);
			} else {
				assert.fail('expected overlap');
			}
		});

		test('disjoint same-line exact edits are allowed (char precision)', () => {
			const r = resolveEditSpecs(
				'const a = 1;\n',
				[
					{ oldText: 'const a', newText: 'let a' },
					{ oldText: '= 1;', newText: '= 2;' },
				],
			);
			assert.ok(r.ok);
		});

		test('fuzzy edit overlapping an exact edit on the same lines → overlap', () => {
			const content = 'alpha beta;   \ngamma;\n';
			const r = resolveEditSpecs(
				content,
				[
					{ oldText: 'alpha beta;', newText: 'x;' }, // fuzzy (trailing ws) → lines 0-0
					{ oldText: 'beta;   \ngamma;', newText: 'y;' }, // exact, spans lines 0-1
				],
			);
			assert.ok(!r.ok);
			if (!r.ok) assert.strictEqual(r.error.type, 'overlap');
		});

		test('edits are matched against the original, not incrementally', () => {
			// edit 1's newText creates a second occurrence of edit 2's oldText —
			// still valid because both matched against the original.
			const r = resolveEditSpecs(
				'unique();\nother();\n',
				[
					{ oldText: 'unique();', newText: 'other();' },
					{ oldText: 'other();', newText: 'done();' },
				],
			);
			assert.ok(r.ok);
		});

		test('CRLF oldText is normalized', () => {
			const r = resolveEditSpecs('a = 1;\nb = 2;\n', [{ oldText: 'b = 2;\r\n', newText: 'b = 3;' }]);
			assert.ok(r.ok);
			if (r.ok) assert.strictEqual(r.usedFuzzy, false);
		});

		test('trailing-newline oldText with whitespace drift clamps to last real line at EOF', () => {
			// "b\n" is not present exactly (line has trailing spaces), so the fuzzy
			// run ["b", ""] includes the phantom line after the final EOL — clamped.
			const r = resolveEditSpecs('a\nb  \n', [{ oldText: 'b\n', newText: 'c' }]);
			assert.ok(r.ok);
			if (r.ok) {
				assert.strictEqual(r.usedFuzzy, true);
				assert.deepStrictEqual(r.resolutions[0], { editIndex: 0, kind: 'fuzzy', startLineIdx: 1, endLineIdx: 1 });
			}
		});

		test('CRLF content (pre-normalized by caller) matched by LF oldText', () => {
			// The resolver contract requires the caller to hand it LF-normalized
			// content — same as a-coder-cli's edit tool.
			const raw = 'a = 1;\r\nb = 2;\r\n';
			const r = resolveEditSpecs(normalizeLineEndings(raw), [{ oldText: 'b = 2;', newText: 'b = 3;' }]);
			assert.ok(r.ok);
			if (r.ok) assert.strictEqual(r.usedFuzzy, false);
		});
	});

	/**
	 * Mini Monaco simulator: applies a batch of non-overlapping edit operations
	 * against the original document state (mirrors pushEditOperations semantics:
	 * all ranges reference the initial content, applied atomically).
	 */
	const applyOps = (content: string, ops: ReturnType<typeof buildEditOperations>): string => {
		const lineStarts = lineStartsOf(content);
		const offsetOf = (lineNumber: number, column: number) => lineStarts[lineNumber - 1] + column - 1;
		const sorted = [...ops].sort((a, b) =>
			offsetOf(b.range.startLineNumber, b.range.startColumn) - offsetOf(a.range.startLineNumber, a.range.startColumn));
		let out = content;
		for (const op of sorted) {
			const s = offsetOf(op.range.startLineNumber, op.range.startColumn);
			const e = offsetOf(op.range.endLineNumber, op.range.endColumn);
			assert.ok(s <= e, `op range start ${s} after end ${e}`);
			out = out.slice(0, s) + op.text + out.slice(e);
		}
		return out;
	};

	const runPipeline = (content: string, specs: Array<{ oldText: string; newText: string }>, eol?: '\n' | '\r\n'): string => {
		const normalized = normalizeLineEndings(content);
		const result = resolveEditSpecs(normalized, specs);
		assert.ok(result.ok, `resolution failed: ${JSON.stringify(!result.ok && result.error)}`);
		if (!result.ok) throw new Error('unreachable');
		const ops = buildEditOperations(normalized, result.resolutions, specs, { eol });
		return applyOps(normalized, ops);
	};

	suite('apply simulation (resolve → ops → final content)', () => {

		test('single exact edit', () => {
			const out = runPipeline('const a = 1;\nconst b = 2;\n', [{ oldText: 'const b = 2;', newText: 'const b = 3;' }]);
			assert.strictEqual(out, 'const a = 1;\nconst b = 3;\n');
		});

		test('mid-line exact edit preserves surrounding text', () => {
			const out = runPipeline('foo(bar, baz);\n', [{ oldText: 'baz', newText: 'qux' }]);
			assert.strictEqual(out, 'foo(bar, qux);\n');
		});

		test('exact match consuming the final EOL keeps the trailing newline', () => {
			const out = runPipeline('a\nb\n', [{ oldText: 'b\n', newText: 'c' }]);
			assert.strictEqual(out, 'a\nc\n');
		});

		test('fuzzy multiline replacement (trailing whitespace drift)', () => {
			const out = runPipeline(
				'function foo() {\n  return 1;   \n}\nconst x = 9;\n',
				[{ oldText: 'function foo() {\n  return 1;\n}', newText: 'function foo() {\n  return 2;\n}' }],
			);
			assert.strictEqual(out, 'function foo() {\n  return 2;\n}\nconst x = 9;\n');
		});

		test('batch of disjoint edits lands in one pass', () => {
			const out = runPipeline(
				'a = 1;\nb = 2;\nc = 3;\n',
				[
					{ oldText: 'a = 1;', newText: 'a = 10;' },
					{ oldText: 'c = 3;', newText: 'c = 30;' },
				],
			);
			assert.strictEqual(out, 'a = 10;\nb = 2;\nc = 30;\n');
		});

		test('disjoint same-line edits both apply', () => {
			const out = runPipeline(
				'const a = 1;\n',
				[
					{ oldText: 'const a', newText: 'let a' },
					{ oldText: '= 1;', newText: '= 2;' },
				],
			);
			assert.strictEqual(out, 'let a = 2;\n');
		});

		test('no-op edits produce no operations', () => {
			const out = runPipeline('abc\n', [{ oldText: 'abc', newText: 'abc' }]);
			assert.strictEqual(out, 'abc\n');
		});

		test('newText is converted to the model EOL (CRLF text in the op)', () => {
			// The simulator applies to LF-normalized content, so only the op text
			// carries CRLF — exactly what the service hands to pushEditOperations.
			const out = runPipeline('a = 1;\nb = 2;\n', [{ oldText: 'b = 2;', newText: 'b = 3;\nc = 4;' }], '\r\n');
			assert.strictEqual(out, 'a = 1;\nb = 3;\r\nc = 4;\n');
		});

		test('fuzzy whole-line replacement (trailing-ws drift) with CRLF op text', () => {
			// oldText has trailing whitespace the file lacks → exact fails, fuzzy
			// matches lines 0-1 and replaces them wholesale.
			const out = runPipeline(
				'alpha;  \nbeta;\n',
				[{ oldText: 'alpha;\nbeta;', newText: 'ALPHA;\nBETA;' }],
				'\r\n',
			);
			assert.strictEqual(out, 'ALPHA;\r\nBETA;\n');
		});

		test('fuzzy EOF clamp: trailing-newline oldText with whitespace drift', () => {
			const out = runPipeline('a\nb  \n', [{ oldText: 'b\n', newText: 'c' }]);
			assert.strictEqual(out, 'a\nc\n');
		});
	});
});