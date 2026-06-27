/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * A registered marketplace. Persisted in GlobalSettings.marketplaces.
 * `name` is derived from the marketplace.json `name` field (or the URL host as a fallback).
 */
export interface MarketplaceEntry {
	name: string
	url: string
}

/**
 * One plugin entry inside a marketplace.json `plugins` array — mirrors the Claude Code
 * marketplace schema. `source` is either a path relative to the marketplace root, or a
 * git URL the marketplace owner points at.
 */
export interface MarketplacePlugin {
	name: string
	description?: string
	version?: string
	author?: { name: string; email?: string; url?: string }
	source: string
	category?: string
}

/**
 * The marketplace.json document shape (Claude Code schema).
 */
export interface MarketplaceJSON {
	$schema?: string
	name: string
	version?: string
	description?: string
	plugins: MarketplacePlugin[]
}

export interface MarketplaceServiceState {
	marketplaces: MarketplaceEntry[]
	/** Per-marketplace fetched plugin listings + errors, keyed by marketplace name. */
	listings: { [marketplaceName: string]: { plugins?: MarketplacePlugin[]; error?: string; loading?: boolean } }
}