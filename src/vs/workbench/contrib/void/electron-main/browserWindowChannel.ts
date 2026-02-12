/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { BrowserWindow } from 'electron';

interface OpenBrowserWindowRequest {
	url: string;
	title?: string;
}

interface ExecuteJavaScriptRequest {
	windowId: string;
	javascript: string;
}

interface CloseBrowserWindowRequest {
	windowId: string;
}

interface FocusBrowserWindowRequest {
	windowId: string;
}

interface BrowserWindowChannelResponse {
	success: boolean;
	data?: any;
	error?: string;
}

export class BrowserWindowChannel implements IServerChannel {
	private browserWindows: Map<string, BrowserWindow> = new Map();
	private nextWindowId: number = 1;

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'openBrowserWindow': return this.handleOpenBrowserWindow(arg);
			case 'executeJavaScript': return this.handleExecuteJavaScript(arg);
			case 'closeBrowserWindow': return this.handleCloseBrowserWindow(arg);
			case 'focusBrowserWindow': return this.handleFocusBrowserWindow(arg);
			case 'listBrowserWindows': return this.handleListBrowserWindows();
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
		// Close all browser windows
		for (const [_id, win] of this.browserWindows.entries()) {
			if (!win.isDestroyed()) {
				win.destroy();
			}
		}
		this.browserWindows.clear();
	}

	private handleOpenBrowserWindow(request: OpenBrowserWindowRequest): BrowserWindowChannelResponse {
		const { url, title } = request;

		// Validate URL
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return {
				success: false,
				error: 'URL must start with http:// or https://'
			};
		}

		try {
			// Generate window ID
			const windowId = `bw${this.nextWindowId++}`;

			// Create BrowserWindow
			const browserWindow = new BrowserWindow({
				width: 1400,
				height: 900,
				title: title || url,
				show: true,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					webSecurity: true,
					allowRunningInsecureContent: false,
				}
			});

			// Clean up when window is closed
			browserWindow.on('closed', () => {
				this.browserWindows.delete(windowId);
			});

			// Load the URL
			browserWindow.loadURL(url);

			// Store reference
			this.browserWindows.set(windowId, browserWindow);

			return {
				success: true,
				data: { windowId, title: title || url }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	private handleExecuteJavaScript(request: ExecuteJavaScriptRequest): BrowserWindowChannelResponse {
		const { windowId, javascript } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (browserWindow.isDestroyed()) {
			this.browserWindows.delete(windowId);
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} has been destroyed`
			};
		}

		try {
			const result = browserWindow.webContents.executeJavaScript(javascript);
			return {
				success: true,
				data: { result }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	private handleCloseBrowserWindow(request: CloseBrowserWindowRequest): BrowserWindowChannelResponse {
		const { windowId } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (!browserWindow.isDestroyed()) {
			browserWindow.destroy();
		}

		this.browserWindows.delete(windowId);

		return {
			success: true,
			data: { message: `BrowserWindow ${windowId} closed` }
		};
	}

	private handleFocusBrowserWindow(request: FocusBrowserWindowRequest): BrowserWindowChannelResponse {
		const { windowId } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (browserWindow.isDestroyed()) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} has been destroyed`
			};
		}

		browserWindow.focus();

		return {
			success: true,
			data: { message: `BrowserWindow ${windowId} focused` }
		};
	}

	private handleListBrowserWindows(): BrowserWindowChannelResponse {
		const windows = Array.from(this.browserWindows.entries()).map(([id, win]) => ({
			id,
			title: win.getTitle(),
			url: win.webContents.getURL(),
			isDestroyed: win.isDestroyed(),
			isFocused: win.isFocused()
		}));

		return {
			success: true,
			data: { windows }
		};
	}

	private async handleClickElement(request: any): Promise<BrowserWindowChannelResponse> {
		const { windowId, selector } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (browserWindow.isDestroyed()) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} has been destroyed`
			};
		}

		try {
			// Wait for page to be fully loaded
			await new Promise<void>((resolve) => {
				if (browserWindow.webContents.isLoading()) {
					browserWindow.webContents.once('did-stop-loading', resolve);
				} else {
					resolve();
				}
			});

			// Wait a bit for JavaScript to execute
			await new Promise(resolve => setTimeout(resolve, 500));

			const result = await browserWindow.webContents.executeJavaScript(`
				(() => {
					try {
						const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
						if (!element) {
							return { success: false, error: 'Element not found with selector: ${selector}' };
						}

						// Scroll element into view first
						element.scrollIntoView({ behavior: 'smooth', block: 'center' });

						// Wait for scroll to complete
						return new Promise((resolve) => {
							setTimeout(() => {
								try {
									// Try multiple click approaches for better compatibility
									// 1. Mouse events
									const eventOptions = { bubbles: true, cancelable: true, view: window };

									element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
									element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
									element.dispatchEvent(new MouseEvent('click', eventOptions));

									// 2. Also try regular click() for older browsers/frameworks
									element.click();

									// 3. For input elements
									if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
										element.focus();
									}

									resolve({ success: true });
								} catch (e) {
									resolve({ success: false, error: 'Click failed: ' + e.toString() });
								}
							}, 200);
						});
					} catch (e) {
						return { success: false, error: e.toString() };
					}
				})()
			`);

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
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	private async handleTypeIntoElement(request: any): Promise<BrowserWindowChannelResponse> {
		const { windowId, selector, text } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (browserWindow.isDestroyed()) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} has been destroyed`
			};
		}

		try {
			// Wait for page to be fully loaded
			await new Promise<void>((resolve) => {
				if (browserWindow.webContents.isLoading()) {
					browserWindow.webContents.once('did-stop-loading', resolve);
				} else {
					resolve();
				}
			});

			// Wait a bit for JavaScript to execute
			await new Promise(resolve => setTimeout(resolve, 500));

			const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');

			const result = await browserWindow.webContents.executeJavaScript(`
				(() => {
					try {
						const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
						if (!element) {
							return { success: false, error: 'Element not found' };
						}
						if (!(element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)) {
							return { success: false, error: 'Element is not editable' };
						}
						element.focus();
						if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
							element.value = '${escapedText}';
							element.dispatchEvent(new Event('input', { bubbles: true }));
							element.dispatchEvent(new Event('change', { bubbles: true }));
						} else if (element.isContentEditable) {
							element.textContent = '${escapedText}';
							element.dispatchEvent(new Event('input', { bubbles: true }));
						}
						return { success: true };
					} catch (e) {
						return { success: false, error: e.toString() };
					}
				})()
			`);

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
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	private async handleGetPageText(request: any): Promise<BrowserWindowChannelResponse> {
		const { windowId, selector } = request;

		const browserWindow = this.browserWindows.get(windowId);
		if (!browserWindow) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} does not exist`
			};
		}

		if (browserWindow.isDestroyed()) {
			return {
				success: false,
				error: `BrowserWindow with ID ${windowId} has been destroyed`
			};
		}

		try {
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

					return element.innerText || element.textContent;
				})()
			`);

			if (text === null) {
				return {
					success: false,
					error: selector ? `Element not found: ${selector}` : 'No content found'
				};
			}

			// Limit text size
			const MAX_TEXT_SIZE = 100 * 1024;
			const trimmedText = typeof text === 'string' && text.length > MAX_TEXT_SIZE
				? text.substring(0, MAX_TEXT_SIZE) + '\n\n... (truncated)'
				: text;

			return {
				success: true,
				data: { text: trimmedText }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}