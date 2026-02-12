/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { BrowserWindow } from 'electron';

interface FetchUrlRequest {
	url: string;
	extractText: boolean;
}

interface SearchWebRequest {
	query: string;
	numResults?: number;
}

interface CapturePageRequest {
	url: string;
}

interface BrowseResourcesRequest {
	url: string;
	resourceType?: 'css' | 'js' | 'images' | 'all';
}

interface ClickElementRequest {
	url: string;
	selector: string;
}

interface TypeIntoElementRequest {
	url: string;
	selector: string;
	text: string;
}

interface GetPageTextRequest {
	url: string;
	selector?: string;
}

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface BrowserChannelResponse {
	success: boolean;
	data?: any;
	error?: string;
}

const FETCH_TIMEOUT = 30000; // 30 seconds
const WEBVIEW_TIMEOUT = 60000; // 60 seconds for webview operations

/**
 * IPC Channel for Browser Operations
 * Handles fetch, search, screenshot, and resource browsing from main process
 */
export class BrowserChannel implements IServerChannel {

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'fetchUrl': return this.handleFetchUrl(arg);
			case 'searchWeb': return this.handleSearchWeb(arg);
			case 'capturePage': return this.handleCapturePage(arg);
			case 'browseResources': return this.handleBrowseResources(arg);
			case 'clickElement': return this.handleClickElement(arg);
			case 'typeIntoElement': return this.handleTypeIntoElement(arg);
			case 'getPageText': return this.handleGetPageText(arg);
			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not supported: ${event}`);
	}

	dispose(): void {
		// Nothing to dispose
	}

	/**
	 * Fetch webpage content from main process (bypasses CORS)
	 */
	private async handleFetchUrl(request: FetchUrlRequest): Promise<BrowserChannelResponse> {
		const { url, extractText } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

			const response = await fetch(url, {
				method: 'GET',
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			if (!response.ok) {
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`
				};
			}

			const html = await response.text();

			// Limit response size
			const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5MB
			if (html.length > MAX_HTML_SIZE) {
				return {
					success: false,
					error: `Response too large (${(html.length / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`
				};
			}

			let text: string | undefined;
			if (extractText) {
				text = this.extractTextFromHtml(html);
				// Limit text size
				const MAX_TEXT_SIZE = 500 * 1024; // 500KB
				if (text.length > MAX_TEXT_SIZE) {
					text = text.substring(0, MAX_TEXT_SIZE) + '\n\n... (truncated)';
				}
			}

			return {
				success: true,
				data: { html, text }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Perform web search using DuckDuckGo HTML (no API key required)
	 */
	private async handleSearchWeb(request: SearchWebRequest): Promise<BrowserChannelResponse> {
		const { query, numResults = 10 } = request;

		if (!query || query.trim() === '') {
			return {
				success: false,
				error: 'Query cannot be empty'
			};
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

			const encodedQuery = encodeURIComponent(query);
			const url = `https://duckduckgo.com/html/?q=${encodedQuery}`;

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				},
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			if (!response.ok) {
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`
				};
			}

			const html = await response.text();
			const results = this.parseDuckDuckGoResults(html);

			// Limit number of results
			const limitedResults = results.slice(0, Math.min(numResults, 20));

			return {
				success: true,
				data: { results: limitedResults }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Capture a screenshot of a webpage using offscreen BrowserWindow
	 */
	private async handleCapturePage(request: CapturePageRequest): Promise<BrowserChannelResponse> {
		const { url } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		let browserWindow: BrowserWindow | null = null;

		try {
			// Create offscreen window for screenshot
			browserWindow = new BrowserWindow({
				width: 1280,
				height: 720,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					offscreen: true
				}
			});

			// Load the page with timeout
			const loadPromise = browserWindow.loadURL(url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Page load timeout')), WEBVIEW_TIMEOUT);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// Wait a bit for any JavaScript to execute
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Capture screenshot
			const image = await browserWindow.webContents.capturePage();

			// Convert to PNG base64
			const imageData = image.toDataURL();

			// Clean up
			if (browserWindow) {
				browserWindow.destroy();
			}

			return {
				success: true,
				data: { imageData }
			};
		} catch (error) {
			if (browserWindow) {
				browserWindow.destroy();
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Browse resources loaded by a webpage
	 */
	private async handleBrowseResources(request: BrowseResourcesRequest): Promise<BrowserChannelResponse> {
		const { url, resourceType = 'all' } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		let browserWindow: BrowserWindow | null = null;

		try {
			// Create offscreen window for resource analysis
			browserWindow = new BrowserWindow({
				width: 1280,
				height: 720,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					offscreen: true
				}
			});

			// Load the page with timeout
			const loadPromise = browserWindow.loadURL(url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Page load timeout')), WEBVIEW_TIMEOUT);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// Wait a bit for resources to load
			await new Promise(resolve => setTimeout(resolve, 3000));

			// Get resource URLs using executeJavaScript
			const resources = await browserWindow.webContents.executeJavaScript(`
				(() => {
					const resources = [];

					// CSS files
					if ('${resourceType}' === 'all' || '${resourceType}' === 'css') {
						document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
							resources.push({
								type: 'css',
								url: el.href,
								size: 0 // Can't get size without fetching
							});
						});
					}

					// JavaScript files
					if ('${resourceType}' === 'all' || '${resourceType}' === 'js') {
						document.querySelectorAll('script[src]').forEach(el => {
							resources.push({
								type: 'js',
								url: el.src,
								size: 0
							});
						});
					}

					// Images
					if ('${resourceType}' === 'all' || '${resourceType}' === 'images') {
						document.querySelectorAll('img[src]').forEach(el => {
							resources.push({
								type: 'image',
								url: el.src,
								size: 0
							});
						});
					}

					return resources;
				})();
			`);

			// Clean up
			if (browserWindow) {
				browserWindow.destroy();
			}

			return {
				success: true,
				data: { resources }
			};
		} catch (error) {
			if (browserWindow) {
				browserWindow.destroy();
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Click an element on a webpage using BrowserWindow (bypasses CORS)
	 */
	private async handleClickElement(request: ClickElementRequest): Promise<BrowserChannelResponse> {
		const { url, selector } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		if (!selector || selector.trim() === '') {
			return {
				success: false,
				error: 'Selector cannot be empty'
			};
		}

		let browserWindow: BrowserWindow | null = null;

		try {
			// Create offscreen window for element interaction
			browserWindow = new BrowserWindow({
				width: 1280,
				height: 720,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					offscreen: true
				}
			});

			// Load the page with timeout
			const loadPromise = browserWindow.loadURL(url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Page load timeout')), WEBVIEW_TIMEOUT);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// Wait for DOM to be ready
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Click the element using executeJavaScript
			const result = await browserWindow.webContents.executeJavaScript(`
				(() => {
					try {
						const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
						if (!element) {
							return { success: false, error: 'Element not found' };
						}

						// Click the element
						element.click();

						// Wait a moment for any resulting navigation
						return new Promise((resolve) => {
							setTimeout(() => {
								resolve({ success: true });
							}, 500);
						});
					} catch (e) {
						return { success: false, error: e.toString() };
					}
				})();
			`);

			// Clean up
			if (browserWindow) {
				browserWindow.destroy();
			}

			if (!result.success) {
				return {
					success: false,
					error: result.error || 'Failed to click element'
				};
			}

			return {
				success: true,
				data: { message: `Successfully clicked element: ${selector}` }
			};
		} catch (error) {
			if (browserWindow) {
				browserWindow.destroy();
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Type text into an element on a webpage using BrowserWindow (bypasses CORS)
	 */
	private async handleTypeIntoElement(request: TypeIntoElementRequest): Promise<BrowserChannelResponse> {
		const { url, selector, text } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		if (!selector || selector.trim() === '') {
			return {
				success: false,
				error: 'Selector cannot be empty'
			};
		}

		if (text === undefined || text === null) {
			return {
				success: false,
				error: 'Text cannot be null or undefined'
			};
		}

		let browserWindow: BrowserWindow | null = null;

		try {
			// Create offscreen window for element interaction
			browserWindow = new BrowserWindow({
				width: 1280,
				height: 720,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					offscreen: true
				}
			});

			// Load the page with timeout
			const loadPromise = browserWindow.loadURL(url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Page load timeout')), WEBVIEW_TIMEOUT);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// Wait for DOM to be ready
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Escape text for JavaScript string
			const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');

			// Type into the element using executeJavaScript
			const result = await browserWindow.webContents.executeJavaScript(`
				(() => {
					try {
						const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
						if (!element) {
							return { success: false, error: 'Element not found' };
						}

						// Focus the element
						element.focus();

						// Clear existing content if it's an input or textarea
						if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
							element.value = '';
						} else if (element.isContentEditable) {
							element.textContent = '';
						}

						// Type the text
						if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
							element.value = '${escapedText}';
							// Trigger input event for React/forms
							element.dispatchEvent(new Event('input', { bubbles: true }));
							element.dispatchEvent(new Event('change', { bubbles: true }));
						} else if (element.isContentEditable) {
							element.textContent = '${escapedText}';
							// Trigger input event
							element.dispatchEvent(new Event('input', { bubbles: true }));
						} else {
							return { success: false, error: 'Element is not an input, textarea, or contentEditable element' };
						}

						return { success: true };
					} catch (e) {
						return { success: false, error: e.toString() };
					}
				})();
			`);

			// Clean up
			if (browserWindow) {
				browserWindow.destroy();
			}

			if (!result.success) {
				return {
					success: false,
					error: result.error || 'Failed to type into element'
				};
			}

			return {
				success: true,
				data: { message: `Successfully typed into element: ${selector}` }
			};
		} catch (error) {
			if (browserWindow) {
				browserWindow.destroy();
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get page text from a webpage using BrowserWindow (bypasses CORS)
	 */
	private async handleGetPageText(request: GetPageTextRequest): Promise<BrowserChannelResponse> {
		const { url, selector } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		let browserWindow: BrowserWindow | null = null;

		try {
			// Create offscreen window for text extraction
			browserWindow = new BrowserWindow({
				width: 1280,
				height: 720,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					offscreen: true
				}
			});

			// Load the page with timeout
			const loadPromise = browserWindow.loadURL(url);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Page load timeout')), WEBVIEW_TIMEOUT);
			});

			await Promise.race([loadPromise, timeoutPromise]);

			// Wait for DOM to be ready
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Get text using executeJavaScript
			const text = await browserWindow.webContents.executeJavaScript(`
				(() => {
					let element;
					if (${JSON.stringify(selector)}) {
						element = document.querySelector(${JSON.stringify(selector)});
					} else {
						element = document.body;
					}

					if (!element) {
						return null;
					}

					// Get text content with some basic formatting
					return element.innerText || element.textContent;
				})();
			`);

			// Clean up
			if (browserWindow) {
				browserWindow.destroy();
			}

			if (text === null) {
				return {
					success: false,
					error: selector ? `Element not found: ${selector}` : 'No content found'
				};
			}

			// Limit text size
			const MAX_TEXT_SIZE = 100 * 1024; // 100KB
			const trimmedText = text.length > MAX_TEXT_SIZE
				? text.substring(0, MAX_TEXT_SIZE) + '\n\n... (truncated)'
				: text;

			return {
				success: true,
				data: { text: trimmedText }
			};
		} catch (error) {
			if (browserWindow) {
				browserWindow.destroy();
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Decode HTML entities without using DOM
	 */
	private decodeHtmlEntities(text: string): string {
		const entities: Record<string, string> = {
			'&amp;': '&',
			'&lt;': '<',
			'&gt;': '>',
			'&quot;': '"',
			'&#39;': "'",
			'&#x27;': "'",
			'&#x2F;': '/',
			'&nbsp;': ' ',
			'&copy;': '©',
			'&reg;': '®',
			'&trade;': '™',
		};

		// Replace named entities
		for (const [entity, char] of Object.entries(entities)) {
			text = text.split(entity).join(char);
		}

		// Replace numeric entities (decimal)
		text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

		// Replace numeric entities (hexadecimal)
		text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

		return text;
	}

	/**
	 * Extract visible text from HTML
	 */
	private extractTextFromHtml(html: string): string {
		// Simple text extraction - removes script tags, style tags, and HTML entities
		let text = html;

		// Remove script and style tags and their content
		text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '');
		text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '');

		// Remove HTML comments
		text = text.replace(/<!--[\s\S]*?-->/g, '');

		// Replace block elements with newlines
		text = text.replace(/<\/(p|div|br|li|tr|td|th|h[1-6]|article|section|header|footer|nav|aside|main)[^>]*>/gi, '\n');
		text = text.replace(/<(br|hr)[^>]*\/?>/gi, '\n');

		// Remove remaining HTML tags
		text = text.replace(/<[^>]+>/g, ' ');

		// Decode HTML entities
		text = this.decodeHtmlEntities(text);

		// Collapse whitespace
		text = text.replace(/\s+/g, ' ').trim();

		return text;
	}

	/**
	 * Parse DuckDuckGo search results from HTML
	 */
	private parseDuckDuckGoResults(html: string): SearchResult[] {
		const results: SearchResult[] = [];

		// DuckDuckGo HTML result parsing using regex
		// Looking for result entries with title, url, and snippet
		const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__url"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

		let match;
		while ((match = resultPattern.exec(html)) !== null) {
			const [, redirectUrl, title, _domain, snippet] = match;

			// DuckDuckGo uses redirect URLs, try to extract the actual URL
			const actualUrl = this.extractUrlFromRedirect(redirectUrl);

			// Clean up snippet (remove HTML tags)
			const cleanSnippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

			if (title && actualUrl) {
				results.push({
					title: title.trim(),
					url: actualUrl,
					snippet: cleanSnippet.substring(0, 300)
				});
			}
		}

		// If regex parsing fails, try alternative patterns
		if (results.length === 0) {
			const altPattern = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?result__a[^>]*>([^<]*)<\/a>/g;
			let altMatch;
			while ((altMatch = altPattern.exec(html)) !== null) {
				const [, url, domain, title] = altMatch;
				const actualUrl = this.extractUrlFromRedirect(url);
				if (title && actualUrl) {
					results.push({
						title: title.trim(),
						url: actualUrl,
						snippet: `${domain}`
					});
				}
			}
		}

		return results;
	}

	/**
	 * Extract actual URL from DuckDuckGo redirect URL
	 */
	private extractUrlFromRedirect(redirectUrl: string): string {
		// DuckDuckGo redirect format: https://duckduckgo.com/l/?uddg=...
		const uddgMatch = redirectUrl.match(/uddg=([^&]+)/);
		if (uddgMatch) {
			try {
				return decodeURIComponent(uddgMatch[1]);
			} catch {
				// Ignore decode errors
			}
		}
		return redirectUrl;
	}
}