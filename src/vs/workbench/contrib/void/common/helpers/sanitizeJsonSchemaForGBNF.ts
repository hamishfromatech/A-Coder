/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Glass Devtools, Inc. All rights reserved.
 *  Void Editor additions licensed under the AGPL 3.0 License.
 *--------------------------------------------------------------------------------------------*/

// GBNF-safe JSON-Schema sanitizer for llama.cpp-derived servers.
//
// Local llama.cpp / LM Studio / Ollama / Ollama Cloud compile the `tools` schemas
// server-side into a GBNF grammar via `json_schema_to_grammar`. That compiler is
// strict and rejects common MCP/Composio schema constructs — nullable
// `type: ["string","null"]` unions, `$ref`, `oneOf`/`anyOf`, nested `items.properties`,
// `format`/`pattern`, empty/mixed `enum`, `not`, `if/then/else`, etc. — with
// `Failed to initialize samplers: failed to parse grammar` (HTTP 400), which
// hard-breaks every request that carries tools.
//
// This module normalizes a JSON-Schema object into a deep copy that those servers
// can always compile, while preserving as much type information as possible
// (enums, arrays, nested objects, numeric constraints). It is pure: no I/O, no
// side effects, no mutation of the input. The output is always a fresh object.
//
// Recursion is bounded by two caps: a total `depth` cap (deeply nested schemas
// fall back to `{type:"string"}` instead of overflowing the stack) and a
// `refDepth` cap (self-referencing `$ref` chains stop expanding and fall back).
// JSON-Schema cycles only occur via `$ref`, so the refDepth cap is the cycle guard;
// an ancestor WeakSet is also kept as belt-and-suspenders for any structurally
// repeated object on the current recursion path.

// A plain string-keyed JSON object (the shape every JSON-Schema node takes).
type SchemaObject = Record<string, unknown>

// Hard caps. 32 matches a reasonable depth for real-world tool schemas; ref-inlining
// beyond a few levels almost always means a recursive schema (e.g. a tree node
// that references itself), which GBNF can't express without a bound anyway.
const MAX_DEPTH = 32
const MAX_REF_DEPTH = 8

const isPlainObject = (v: unknown): v is SchemaObject =>
	typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Sanitize a tool `parameters` (or property sub-) JSON-Schema for a GBNF-based
 * server. Returns a fresh, GBNF-safe schema object. Falls back to `{type:"string"}`
 * for any construct it can't normalize, so the output always compiles.
 *
 * For top-level tool `parameters`, ensures `type:"object"` is present when the
 * schema doesn't declare a type (GBNF requires the root to be an object).
 */
export const sanitizeJsonSchemaForGBNF = (schema: unknown): SchemaObject => {
	const root = isPlainObject(schema) ? schema : {}
	const ancestors = new WeakSet<object>()
	const sanitized = sanitizeNode(schema, root, 0, 0, ancestors)
	// Top-level tool parameters must be an object schema. If sanitization left no
	// type (e.g. the input was a bare `true` schema), force `object`. We don't
	// override an explicit non-object type since that would misrepresent the schema.
	if (!('type' in sanitized)) sanitized['type'] = 'object'
	return sanitized
}

/**
 * Resolve a `$ref` pointer (`#/$defs/Foo`, `#/definitions/Foo`, or a nested path)
 * against the root schema. Returns `undefined` if the pointer can't be followed.
 * Only same-document JSON pointers are supported (the form MCP/Composio produce).
 */
const schemaOfRef = (ref: string, root: SchemaObject): unknown => {
	if (!ref.startsWith('#/') && ref !== '#') return undefined
	if (ref === '#') return root
	const parts = ref.slice(2).split('/')
	let cur: unknown = root
	for (const part of parts) {
		if (!isPlainObject(cur)) return undefined
		cur = cur[part]
	}
	return cur
}

/**
 * Normalize a single schema node into a GBNF-safe deep copy. `depth` bounds total
 * nesting; `refDepth` bounds `$ref` inlining (the only cycle vector in
 * JSON-Schema). `ancestors` tracks the current recursion path's object identities
 * as a defensive cycle guard.
 */
const sanitizeNode = (
	node: unknown,
	root: SchemaObject,
	depth: number,
	refDepth: number,
	ancestors: WeakSet<object>,
): SchemaObject => {
	if (depth > MAX_DEPTH) return { type: 'string' }
	// JSON-Schema allows boolean schemas: `true` = accept anything, `false` =
	// reject everything. GBNF can't express "reject"; fall back to string.
	if (typeof node === 'boolean') return node ? {} : { type: 'string' }
	if (!isPlainObject(node)) return { type: 'string' }
	if (ancestors.has(node)) return { type: 'string' }
	ancestors.add(node)
	try {
		return sanitizeObjectBody(node, root, depth, refDepth, ancestors)
	} finally {
		ancestors.delete(node)
	}
}

const sanitizeObjectBody = (
	node: SchemaObject,
	root: SchemaObject,
	depth: number,
	refDepth: number,
	ancestors: WeakSet<object>,
): SchemaObject => {
	const result: SchemaObject = {}

	// --- $ref: resolve and inline, then re-sanitize the merged node. Sibling
	// keywords (2019+ draft) override the resolved target. Unresolvable refs, or
	// refs past the depth cap, fall back to string so we never emit a dangling $ref.
	const refVal = node['$ref']
	if (typeof refVal === 'string') {
		if (refDepth >= MAX_REF_DEPTH) return { type: 'string' }
		const resolved = schemaOfRef(refVal, root)
		if (resolved === undefined) return { type: 'string' }
		// Merge resolved first, then siblings (siblings win), then recurse on the
		// merged object with refDepth bumped. Drop the $ref key itself.
		const { $ref: _omit, ...siblings } = node
		const merged = { ...(isPlainObject(resolved) ? resolved : {}), ...siblings }
		return sanitizeNode(merged, root, depth + 1, refDepth + 1, ancestors)
	}

	// --- type: keep single type; for `["string","null"]`-style nullable unions
	// drop `null` and keep the non-null type. Multiple non-null types become
	// `anyOf` (llama.cpp supports anyOf). Only-null collapses to string.
	const typeVal = node['type']
	let typeStr: string | undefined
	let anyOfFromType: SchemaObject[] | undefined
	if (typeof typeVal === 'string') {
		typeStr = typeVal
	} else if (Array.isArray(typeVal)) {
		const nonNull = typeVal.filter((t): t is string => typeof t === 'string' && t !== 'null')
		if (nonNull.length === 0) {
			typeStr = 'string'
		} else if (nonNull.length === 1) {
			typeStr = nonNull[0]
		} else {
			anyOfFromType = nonNull.map(t => ({ type: t }))
		}
	}
	if (typeStr !== undefined) result['type'] = typeStr

	// --- enum: drop object/array members (GBNF can't union them). If the
	// remaining primitives mix types (e.g. string + number), keep only the string
	// members; if none, drop the keyword. Empty enum is dropped too.
	const enumVal = node['enum']
	if (Array.isArray(enumVal)) {
		const primitives = enumVal.filter(v => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
		if (primitives.length > 0) {
			const strings = primitives.filter((v): v is string => typeof v === 'string')
			const allSameKind = primitives.every(v => typeof v === typeof primitives[0])
			result['enum'] = allSameKind ? primitives : (strings.length > 0 ? strings : primitives)
		}
	}

	// --- const: emit as enum-of-one. Only primitives; object/array consts drop.
	if ('const' in node) {
		const c = node['const']
		if (c === null || typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
			result['enum'] = [c]
		}
	}

	// --- items: array items can be a single schema or a tuple (array of schemas).
	// Sanitize each recursively. If a single schema can't be normalized it falls
	// back to string internally; we keep `items` set. Unrecognized shapes drop.
	const itemsVal = node['items']
	if (isPlainObject(itemsVal)) {
		result['items'] = sanitizeNode(itemsVal, root, depth + 1, refDepth, ancestors)
	} else if (Array.isArray(itemsVal)) {
		result['items'] = itemsVal.map(it => sanitizeNode(it, root, depth + 1, refDepth, ancestors))
	}

	// --- properties: sanitize each property value recursively.
	const propsVal = node['properties']
	if (isPlainObject(propsVal)) {
		const sanitizedProps: SchemaObject = {}
		for (const [k, v] of Object.entries(propsVal)) {
			sanitizedProps[k] = sanitizeNode(v, root, depth + 1, refDepth, ancestors)
		}
		result['properties'] = sanitizedProps
	}

	// --- required: keep as-is (array of strings). Drop non-string entries.
	const requiredVal = node['required']
	if (Array.isArray(requiredVal)) {
		const reqStrings = requiredVal.filter((r): r is string => typeof r === 'string')
		if (reqStrings.length > 0) result['required'] = reqStrings
	}

	// --- additionalProperties: keep `false` (GBNF supports it as "no extra
	// fields"); drop `true` and schema-form (GBNF's partial support is unreliable).
	if (node['additionalProperties'] === false) result['additionalProperties'] = false

	// --- anyOf / oneOf: both become `anyOf`. Sanitize each branch; keep all
	// (our sanitizer always produces a valid object, even if just a fallback).
	const branchesVal = node['anyOf'] ?? node['oneOf']
	if (Array.isArray(branchesVal)) {
		const sanitizedBranches = branchesVal.map(b => sanitizeNode(b, root, depth + 1, refDepth, ancestors))
		if (sanitizedBranches.length > 0) result['anyOf'] = sanitizedBranches
	}

	// --- allOf: shallow-merge branches. Union `properties` keys (last write wins
	// per key), union `required`, keep a single agreed `type`. If types conflict
	// across branches, fall back to the first sanitized branch.
	const allOfVal = node['allOf']
	if (Array.isArray(allOfVal) && allOfVal.length > 0) {
		const sanitizedBranches = allOfVal.map(b => sanitizeNode(b, root, depth + 1, refDepth, ancestors))
		const merged = mergeAllOfBranches(sanitizedBranches)
		// Shallow-apply the merge over what we've already built. Properties/required
		// from the merge extend ours; type from the merge wins only if unset here.
		for (const [k, v] of Object.entries(merged)) {
			if (k === 'properties' && isPlainObject(result['properties']) && isPlainObject(v)) {
				Object.assign(result['properties'] as SchemaObject, v)
			} else if (k === 'required' && Array.isArray(result['required']) && Array.isArray(v)) {
				result['required'] = Array.from(new Set([...(result['required'] as string[]), ...(v as string[])]))
			} else if (!(k in result)) {
				result[k] = v
			}
		}
	}

	// --- anyOf derived from a multi-type `type` array, when no explicit anyOf was
	// emitted above. Compose them together so both constraints apply.
	if (anyOfFromType && !('anyOf' in result)) result['anyOf'] = anyOfFromType

	// --- Numeric / length constraints: llama.cpp supports these, keep verbatim.
	for (const k of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf']) {
		if (typeof node[k] === 'number') result[k] = node[k]
	}

	// --- description: keep (useful for the model and harmless to GBNF).
	if (typeof node['description'] === 'string') result['description'] = node['description']

	// --- Explicitly dropped keywords (GBNF can't express them or they're noisy):
	//   not, if/then/else, format, pattern, title, default, examples, $schema, $id,
	//   $defs, definitions (refs are inlined, so defs aren't needed downstream).
	// Unknown keywords are dropped too — only the GBNF-supported subset above
	// passes through. This is intentionally conservative: passing an unknown
	// keyword to `json_schema_to_grammar` risks a parse failure.

	return result
}

/**
 * Merge `allOf` branches by intersecting `properties` (shallow union of keys,
 * last-write-wins per key — a true intersection of per-key schemas is hard to
 * compute and GBNF doesn't need it), unioning `required`, and keeping a single
 * `type` only if every branch agrees. On any `type` disagreement we fall back to
 * the first branch (the spec's escape hatch), since a conflicting type union
 * would need anyOf which allOf semantics don't imply.
 */
const mergeAllOfBranches = (branches: SchemaObject[]): SchemaObject => {
	if (branches.length === 0) return {}
	const merged: SchemaObject = {}
	const mergedProps: SchemaObject = {}
	let hasProperties = false
	const mergedRequired = new Set<string>()
	let agreedType: string | undefined
	let typeConflict = false
	for (const b of branches) {
		if (isPlainObject(b['properties'])) {
			hasProperties = true
			Object.assign(mergedProps, b['properties'])
		}
		if (Array.isArray(b['required'])) {
			for (const r of b['required']) if (typeof r === 'string') mergedRequired.add(r)
		}
		if (typeof b['type'] === 'string') {
			if (agreedType === undefined) agreedType = b['type']
			else if (agreedType !== b['type']) typeConflict = true
		}
	}
	if (typeConflict) return branches[0] ?? {}
	if (agreedType !== undefined) merged['type'] = agreedType
	if (hasProperties) merged['properties'] = mergedProps
	if (mergedRequired.size > 0) merged['required'] = Array.from(mergedRequired)
	return merged
}