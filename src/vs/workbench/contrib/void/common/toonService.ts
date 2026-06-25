/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * TOON (Token-Oriented Object Notation) Service
 *
 * Provides efficient JSON compression for LLM tool outputs.
 * TOON uses a compact format that reduces token usage while preserving structure.
 *
 * Format examples:
 * - Objects: {key:value,key2:value2}
 * - Arrays: [item1,item2,item3]
 * - Strings: Unquoted when safe, quoted when needed
 * - Numbers/booleans: Direct representation
 * - Null: null
 */

export interface IToonService {
	/**
	 * Encode a JavaScript value to TOON format
	 * @param value Any JSON-serializable value
	 * @returns TOON-formatted string
	 */
	encode(value: any): string;

	/**
	 * Decode a TOON-formatted string back to JavaScript value
	 * @param toonStr TOON-formatted string
	 * @returns Decoded JavaScript value
	 */
	decode(toonStr: string): any;

	/**
	 * Check if TOON encoding would save tokens
	 * @param value Value to potentially encode
	 * @returns true if TOON would be more efficient
	 */
	shouldUseToon(value: any): boolean;
}

/**
 * Simple TOON implementation
 * This is a minimal implementation that provides basic compression.
 * For production use, consider using the @toon-format/toon package.
 */
export class ToonService implements IToonService {

	encode(value: any): string {
		return this._encodeValue(value);
	}

	decode(toonStr: string): any {
		if (typeof toonStr !== 'string') return toonStr;
		// Fast path: if it happens to be valid JSON (e.g. an encoded value whose
		// strings all needed quotes), parse it directly.
		try {
			return JSON.parse(toonStr);
		} catch {
			// Fall through to the TOON parser.
		}
		try {
			const parser = new ToonParser(toonStr);
			const result = parser.parseValue();
			parser.skipWhitespace();
			if (!parser.atEnd()) {
				// Trailing characters → not clean TOON; return the raw string.
				return toonStr;
			}
			return result;
		} catch {
			// Last resort: return as-is if parsing fails.
			return toonStr;
		}
	}

	shouldUseToon(value: any): boolean {
		// Use TOON for objects and arrays that would benefit from compression
		if (typeof value === 'object' && value !== null) {
			const jsonStr = JSON.stringify(value);
			// Only use TOON if the JSON is reasonably large (>100 chars)
			// and contains structure that can be compressed
			return jsonStr.length > 100 && (Array.isArray(value) || Object.keys(value).length > 3);
		}
		return false;
	}

	private _encodeValue(value: any): string {
		if (value === null) return 'null';
		if (value === undefined) return 'null';

		const type = typeof value;

		if (type === 'boolean' || type === 'number') {
			return String(value);
		}

		if (type === 'string') {
			return this._encodeString(value);
		}

		if (Array.isArray(value)) {
			return this._encodeArray(value);
		}

		if (type === 'object') {
			return this._encodeObject(value);
		}

		return JSON.stringify(value);
	}

	private _encodeString(str: string): string {
		// Simple heuristic: use quotes if string contains special chars
		const needsQuotes = /[,:\[\]{}"\s]/.test(str)
			|| str.length === 0
			// Also quote strings that would otherwise be indistinguishable from a
			// number/boolean/null literal when decoded (keeps round-trips faithful).
			|| /^(true|false|null)$/.test(str)
			|| /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str);
		if (needsQuotes) {
			return JSON.stringify(str);
		}
		return str;
	}

	private _encodeArray(arr: any[]): string {
		const items = arr.map(item => this._encodeValue(item));
		return `[${items.join(',')}]`;
	}

	private _encodeObject(obj: Record<string, any>): string {
		const entries = Object.entries(obj).map(([key, value]) => {
			const encodedKey = this._encodeString(key);
			const encodedValue = this._encodeValue(value);
			return `${encodedKey}:${encodedValue}`;
		});
		return `{${entries.join(',')}}`;
	}
}

/**
 * Recursive-descent parser for the TOON format produced by ToonService.encode.
 * Mirrors the encoder: objects {k:v,...}, arrays [v,...], quoted JSON strings,
 * and bare values that are numbers, booleans, null, or safe unquoted strings.
 */
class ToonParser {
	private readonly s: string;
	private i = 0;

	constructor(s: string) {
		this.s = s;
	}

	atEnd(): boolean {
		return this.i >= this.s.length;
	}

	private peek(): string {
		return this.s[this.i];
	}

	skipWhitespace(): void {
		while (this.i < this.s.length && /\s/.test(this.s[this.i])) {
			this.i++;
		}
	}

	parseValue(): any {
		this.skipWhitespace();
		const ch = this.peek();
		if (ch === '{') return this.parseObject();
		if (ch === '[') return this.parseArray();
		if (ch === '"') return this.parseQuotedString();
		return this.parseBare();
	}

	private parseObject(): Record<string, any> {
		this.i++; // consume '{'
		const obj: Record<string, any> = {};
		this.skipWhitespace();
		if (this.peek() === '}') {
			this.i++;
			return obj;
		}
		while (true) {
			this.skipWhitespace();
			const key = this.parseKey();
			this.skipWhitespace();
			if (this.peek() !== ':') throw new Error('Expected ":"');
			this.i++; // consume ':'
			obj[key] = this.parseValue();
			this.skipWhitespace();
			const ch = this.peek();
			if (ch === ',') {
				this.i++;
				this.skipWhitespace();
				if (this.peek() === '}') {
					this.i++;
					break;
				}
				continue;
			}
			if (ch === '}') {
				this.i++;
				break;
			}
			throw new Error('Expected "," or "}"');
		}
		return obj;
	}

	private parseArray(): any[] {
		this.i++; // consume '['
		const arr: any[] = [];
		this.skipWhitespace();
		if (this.peek() === ']') {
			this.i++;
			return arr;
		}
		while (true) {
			arr.push(this.parseValue());
			this.skipWhitespace();
			const ch = this.peek();
			if (ch === ',') {
				this.i++;
				this.skipWhitespace();
				if (this.peek() === ']') {
					this.i++;
					break;
				}
				continue;
			}
			if (ch === ']') {
				this.i++;
				break;
			}
			throw new Error('Expected "," or "]"');
		}
		return arr;
	}

	private parseQuotedString(): string {
		this.i++; // consume opening '"'
		const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t' };
		let result = '';
		while (this.i < this.s.length) {
			const ch = this.s[this.i];
			if (ch === '\\') {
				const next = this.s[this.i + 1];
				if (next === undefined) throw new Error('Dangling escape');
				if (next in escapes) {
					result += escapes[next];
					this.i += 2;
					continue;
				}
				if (next === 'u') {
					const hex = this.s.slice(this.i + 2, this.i + 6);
					if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('Bad \\u escape');
					result += String.fromCharCode(parseInt(hex, 16));
					this.i += 6;
					continue;
				}
				throw new Error('Unknown escape');
			}
			if (ch === '"') {
				this.i++;
				return result;
			}
			result += ch;
			this.i++;
		}
		throw new Error('Unterminated string');
	}

	private parseKey(): string {
		this.skipWhitespace();
		if (this.peek() === '"') return this.parseQuotedString();
		return this.parseBareToken();
	}

	private parseBare(): any {
		const token = this.parseBareToken();
		if (token === 'true') return true;
		if (token === 'false') return false;
		if (token === 'null') return null;
		if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) {
			const num = Number(token);
			if (!Number.isNaN(num)) return num;
		}
		return token;
	}

	private parseBareToken(): string {
		const start = this.i;
		while (this.i < this.s.length) {
			const ch = this.s[this.i];
			// A bare token ends at a structural delimiter. ':' ends object keys;
			// the encoder always quotes value strings that contain ':', so stopping
			// here is safe for values too.
			if (ch === ',' || ch === '}' || ch === ']' || ch === ':' || /\s/.test(ch)) break;
			this.i++;
		}
		if (this.i === start) throw new Error('Empty token');
		return this.s.slice(start, this.i);
	}
}
