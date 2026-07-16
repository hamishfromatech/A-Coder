/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Quote a value for safe use inside a POSIX shell single-quoted string. */
export const shellQuote = (value: string): string => {
	// Wrap in single quotes and replace any embedded single quote with '"'"'.
	return `'${value.replace(/'/g, `'"'"'`)}'`
}

/** Convert an argument key into a valid POSIX environment-variable identifier. */
export const sanitizeEnvVarName = (key: string): string => {
	// Drop any character that is not alphanumeric or underscore.
	let sanitized = key.replace(/[^A-Za-z0-9_]/g, '_')
	// Must not start with a digit.
	if (/^[0-9]/.test(sanitized)) sanitized = `_${sanitized}`
	return sanitized
}

/** Validate that all argument keys are safe env-var identifiers. */
export const validateSkillArgKeys = (args: Record<string, unknown>): void => {
	for (const key of Object.keys(args)) {
		const sanitized = sanitizeEnvVarName(key)
		if (sanitized !== key) {
			throw new Error(`Invalid script argument key "${key}". Argument keys must be valid environment-variable identifiers (letters, digits, underscore; must not start with a digit).`)
		}
	}
}
