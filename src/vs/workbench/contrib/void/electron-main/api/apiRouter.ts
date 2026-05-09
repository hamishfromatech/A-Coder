/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as url from 'url';

/**
 * Router for handling API requests
 */
export class ApiRouter {
	private routes: Map<string, Map<string, (req: http.IncomingMessage, res: http.ServerResponse, params: any) => Promise<void>>> = new Map();

	constructor() {
		// Initialize route maps for each HTTP method
		this.routes.set('GET', new Map());
		this.routes.set('POST', new Map());
		this.routes.set('PUT', new Map());
		this.routes.set('DELETE', new Map());
		this.routes.set('PATCH', new Map());
	}

	/**
	 * Register a route handler
	 */
	register(method: string, path: string, handler: (req: http.IncomingMessage, res: http.ServerResponse, params: any) => Promise<void>): void {
		const methodRoutes = this.routes.get(method.toUpperCase());
		if (!methodRoutes) {
			throw new Error(`Unsupported HTTP method: ${method}`);
		}
		methodRoutes.set(path, handler);
	}

	/**
	 * Handle an incoming request
	 */
	async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const method = req.method?.toUpperCase() || 'GET';
		const parsedUrl = url.parse(req.url || '', true);
		const pathname = parsedUrl.pathname || '/';

		// Find matching route
		const methodRoutes = this.routes.get(method);
		if (!methodRoutes) {
			this.sendError(res, 405, 'Method Not Allowed');
			return;
		}

		// Try exact match first
		let handler = methodRoutes.get(pathname);
		let params: any = {};

		// If no exact match, try pattern matching
		if (!handler) {
			for (const [pattern, routeHandler] of methodRoutes.entries()) {
				const match = this.matchRoute(pattern, pathname);
				if (match) {
					handler = routeHandler;
					params = match.params;
					break;
				}
			}
		}

		if (!handler) {
			this.sendError(res, 404, 'Not Found');
			return;
		}

		try {
			// Parse body if present
			if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
				params.body = await this.parseBody(req);
			}

			// Add query params
			params.query = parsedUrl.query;

			// Call handler
			await handler(req, res, params);
		} catch (err) {
			console.error('[API Router] Error handling request:', err);
			this.sendError(res, 500, 'Internal Server Error', err instanceof Error ? err.message : String(err));
		}
	}

	/**
	 * Match a route pattern to a pathname
	 */
	private matchRoute(pattern: string, pathname: string): { params: any } | null {
		const patternParts = pattern.split('/').filter(p => p);
		const pathParts = pathname.split('/').filter(p => p);

		if (patternParts.length !== pathParts.length) {
			return null;
		}

		const params: any = {};
		for (let i = 0; i < patternParts.length; i++) {
			const patternPart = patternParts[i];
			const pathPart = pathParts[i];

			if (patternPart.startsWith(':')) {
				// Parameter
				const paramName = patternPart.substring(1);
				params[paramName] = decodeURIComponent(pathPart);
			} else if (patternPart !== pathPart) {
				// Mismatch
				return null;
			}
		}

		return { params };
	}

	/**
	 * Parse request body with size limit
	 */
	private parseBody(req: http.IncomingMessage): Promise<any> {
		return new Promise((resolve, reject) => {
			let body = '';
			let bodyLength = 0;
			const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

			req.on('data', chunk => {
				bodyLength += chunk.length;
				if (bodyLength > MAX_BODY_SIZE) {
					reject(new Error('Request body too large'));
					return;
				}
				body += chunk.toString();
			});
			req.on('end', () => {
				try {
					const parsed = body ? JSON.parse(body) : {};
					resolve(parsed);
				} catch (err) {
					reject(new Error('Invalid JSON in request body'));
				}
			});
			req.on('error', reject);
		});
	}

	/**
	 * Send JSON response
	 */
	sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	}

	/**
	 * Send error response
	 */
	sendError(res: http.ServerResponse, statusCode: number, error: string, details?: string): void {
		this.sendJson(res, statusCode, {
			error,
			...(details ? { details } : {})
		});
	}

	/**
	 * Send binary file response with streaming support
	 */
	sendBinary(res: http.ServerResponse, statusCode: number, data: Buffer, contentType: string, filename?: string): void {
		const headers: Record<string, string> = {
			'Content-Type': contentType,
			'Content-Length': data.length.toString(),
			'Accept-Ranges': 'bytes',
		};
		if (filename) {
			headers['Content-Disposition'] = `inline; filename="${filename}"`;
		}
		res.writeHead(statusCode, headers);
		res.end(data);
	}

	/**
	 * Send binary file response with range support for streaming (audio/video)
	 */
	sendBinaryWithRange(req: http.IncomingMessage, res: http.ServerResponse, data: Buffer, contentType: string, filename?: string): void {
		const range = req.headers.range;
		const total = data.length;

		const sanitizeFilename = (name: string): string => {
			// Remove control chars, backslashes, and quotes to prevent header injection
			return name.replace(/[\x00-\x1f\x7f\\"]/g, '_');
		};

		if (range) {
			// Parse range header: "bytes=start-end"
			const rangeMatch = range.replace(/bytes=/, '').match(/^(\d*)-(\d*)$/);
			if (!rangeMatch) {
				// Invalid range format - send full file
				this.sendBinary(res, 200, data, contentType, filename ? sanitizeFilename(filename) : undefined);
				return;
			}

			const startStr = rangeMatch[1];
			const endStr = rangeMatch[2];

			let start: number;
			let end: number;

			if (startStr === '' && endStr !== '') {
				// Suffix range: bytes=-500 (last N bytes)
				start = Math.max(0, total - parseInt(endStr, 10));
				end = total - 1;
			} else {
				start = parseInt(startStr, 10);
				end = endStr ? parseInt(endStr, 10) : total - 1;
			}

			// Validate range values
			if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= total || start > end) {
				res.writeHead(416, { 'Content-Range': `bytes */${total}` });
				res.end();
				return;
			}

			const chunkSize = (end - start) + 1;

			const headers: Record<string, string> = {
				'Content-Range': `bytes ${start}-${end}/${total}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': chunkSize.toString(),
				'Content-Type': contentType,
			};
			if (filename) {
				headers['Content-Disposition'] = `inline; filename="${sanitizeFilename(filename)}"`;
			}

			res.writeHead(206, headers);
			res.end(data.slice(start, end + 1));
		} else {
			// No range requested, send full file
			this.sendBinary(res, 200, data, contentType, filename ? sanitizeFilename(filename) : undefined);
		}
	}
}
