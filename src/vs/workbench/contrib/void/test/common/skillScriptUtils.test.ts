/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { sanitizeEnvVarName, shellQuote, validateSkillArgKeys } from '../../common/skillScriptUtils.js';

suite('skillScriptUtils', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('shellQuote', function () {
		test('wraps plain values in single quotes', function () {
			assert.strictEqual(shellQuote('hello'), "'hello'");
		});

		test('escapes embedded single quotes', function () {
			assert.strictEqual(shellQuote("it's"), "'it'\"'\"'s'");
		});

		test('handles empty strings', function () {
			assert.strictEqual(shellQuote(''), "''");
		});

		test('escapes multiple single quotes', function () {
			assert.strictEqual(shellQuote("a'b'c"), "'a'\"'\"'b'\"'\"'c'");
		});
	});

	suite('sanitizeEnvVarName', function () {
		test('leaves valid identifiers unchanged', function () {
			assert.strictEqual(sanitizeEnvVarName('FOO'), 'FOO');
			assert.strictEqual(sanitizeEnvVarName('foo_bar_1'), 'foo_bar_1');
		});

		test('replaces invalid characters with underscores', function () {
			assert.strictEqual(sanitizeEnvVarName('foo-bar'), 'foo_bar');
			assert.strictEqual(sanitizeEnvVarName('foo.bar'), 'foo_bar');
			assert.strictEqual(sanitizeEnvVarName('foo bar'), 'foo_bar');
		});

		test('prefixes a leading digit with an underscore', function () {
			assert.strictEqual(sanitizeEnvVarName('1foo'), '_1foo');
			assert.strictEqual(sanitizeEnvVarName('123'), '_123');
		});
	});

	suite('validateSkillArgKeys', function () {
		test('accepts valid argument keys', function () {
			assert.doesNotThrow(() => validateSkillArgKeys({ foo: 1, bar_baz: 'x' }));
		});

		test('rejects keys with invalid characters', function () {
			assert.throws(() => validateSkillArgKeys({ 'foo-bar': 1 }), /Invalid script argument key/);
		});

		test('rejects keys starting with a digit', function () {
			assert.throws(() => validateSkillArgKeys({ '1foo': 1 }), /Invalid script argument key/);
		});

		test('allows empty argument objects', function () {
			assert.doesNotThrow(() => validateSkillArgKeys({}));
		});
	});
});
