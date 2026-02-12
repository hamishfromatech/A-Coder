/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { WebviewId, WebviewMetadata } from '../common/toolsServiceTypes.js';

export interface IWebviewToolService {
	readonly _serviceBrand: undefined;
	listWebviewIds(): WebviewId[];
	getWebviewMetadata(webviewId: WebviewId): WebviewMetadata | undefined;
	webviewExists(webviewId: WebviewId): boolean;
	createWebview(params: { url: string, title?: string }): Promise<WebviewId>;
	createHtmlWebview(html: string, title?: string): Promise<WebviewId>;
	closeWebview(webviewId: WebviewId): Promise<void>;
	getWebviewInput(webviewId: WebviewId): WebviewInput | undefined;
	focusWebview(webviewId: WebviewId): Promise<void>;
	executeJavaScript(webviewId: WebviewId, javascript: string): Promise<any>;
}

export const IWebviewToolService = createDecorator<IWebviewToolService>('WebviewToolService');

export class WebviewToolService extends Disposable implements IWebviewToolService {
	readonly _serviceBrand: undefined;

	private webviewMetadata: Map<WebviewId, WebviewMetadata> = new Map();
	private nextWebviewId: number = 1;

	constructor(
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		// Listen to editor changes to clean up disposed webviews
		this._register(this._editorService.onDidCloseEditor((e) => {
			if (e.editor instanceof WebviewInput) {
				// Find and remove the webview by comparing webview inputs
				for (const [id, metadata] of this.webviewMetadata.entries()) {
					if (metadata.webviewInput === e.editor) {
						this.webviewMetadata.delete(id);
						break;
					}
				}
			}
		}));
	}

	listWebviewIds(): WebviewId[] {
		return Array.from(this.webviewMetadata.keys());
	}

	getWebviewMetadata(webviewId: WebviewId): WebviewMetadata | undefined {
		return this.webviewMetadata.get(webviewId);
	}

	webviewExists(webviewId: WebviewId): boolean {
		return this.webviewMetadata.has(webviewId);
	}

	async createWebview(params: { url: string, title?: string }): Promise<WebviewId> {
		const { url, title } = params;

		// Validate URL - now supports http, https, and file://
		if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('/')) {
			throw new Error('URL must start with http://, https://, file://, or /');
		}

		// Generate new webview ID
		const webviewId: WebviewId = `wv${this.nextWebviewId++}`;

		// Determine if this is a local file
		const isLocalFile = url.startsWith('file://') || url.startsWith('/') || !!url.match(/^[a-zA-Z]:\\/);

		// Create webview with appropriate content options
		const webviewInput = this._webviewWorkbenchService.openWebview(
			{
				providedViewType: webviewId,
				title: title || url,
				options: {
					enableFindWidget: true,
				},
				contentOptions: isLocalFile ? {
					allowScripts: true,
					allowForms: true,
					enableCommandUris: true,
					localResourceRoots: [], // Allow all local resources
				} : {
					allowScripts: true,
					allowForms: true,
				},
				extension: undefined,
			},
			webviewId,
			title || url,
			{ group: undefined, preserveFocus: false }
		);

		// Set HTML to load the URL
		webviewInput.webview.setHtml(this.getWebviewHtml(url));

		// Store metadata
		const metadata: WebviewMetadata = {
			id: webviewId,
			url,
			title: title || url,
			createdAt: Date.now(),
			webviewInput,
			isLocalFile,
		};
		this.webviewMetadata.set(webviewId, metadata);

		return webviewId;
	}

	async createHtmlWebview(html: string, title?: string): Promise<WebviewId> {
		// Generate new webview ID
		const webviewId: WebviewId = `wv${this.nextWebviewId++}`;

		// Create webview with permissive options for local content
		const webviewInput = this._webviewWorkbenchService.openWebview(
			{
				providedViewType: webviewId,
				title: title || 'HTML Preview',
				options: {
					enableFindWidget: true,
				},
				contentOptions: {
					allowScripts: true,
					allowForms: true,
					enableCommandUris: true,
					localResourceRoots: [], // Allow all local resources
				},
				extension: undefined,
			},
			webviewId,
			title || 'HTML Preview',
			{ group: undefined, preserveFocus: false }
		);

		// Set HTML content directly (full JavaScript access)
		webviewInput.webview.setHtml(html);

		// Store metadata
		const metadata: WebviewMetadata = {
			id: webviewId,
			url: 'data:text/html',
			title: title || 'HTML Preview',
			createdAt: Date.now(),
			webviewInput,
			isLocalFile: true,
			isHtmlContent: true,
		};
		this.webviewMetadata.set(webviewId, metadata);

		return webviewId;
	}

	async closeWebview(webviewId: WebviewId): Promise<void> {
		const metadata = this.webviewMetadata.get(webviewId);
		if (!metadata) {
			throw new Error(`Webview with ID ${webviewId} does not exist`);
		}

		if (metadata.webviewInput) {
			const editors = this._editorService.editors;
			for (const editor of editors) {
				if (editor === metadata.webviewInput) {
					this._editorService.closeEditor({ editor, groupId: 0 });
					break;
				}
			}
		}

		this.webviewMetadata.delete(webviewId);
	}

	getWebviewInput(webviewId: WebviewId): WebviewInput | undefined {
		const metadata = this.webviewMetadata.get(webviewId);
		return metadata?.webviewInput;
	}

	async focusWebview(webviewId: WebviewId): Promise<void> {
		const metadata = this.webviewMetadata.get(webviewId);
		if (!metadata) {
			throw new Error(`Webview with ID ${webviewId} does not exist`);
		}

		if (metadata.webviewInput) {
			// Reveal the webview editor
			this._editorService.openEditor(metadata.webviewInput, { preserveFocus: false });
		}
	}

	async executeJavaScript(webviewId: WebviewId, javascript: string): Promise<any> {
		const metadata = this.webviewMetadata.get(webviewId);
		if (!metadata) {
			throw new Error(`Webview with ID ${webviewId} does not exist`);
		}

		if (!metadata.webviewInput) {
			throw new Error(`Webview input not found for ID ${webviewId}`);
		}

		// Generate a unique message ID for this request
		const messageId = `exec_js_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		// Set up a one-time listener for the response
		return new Promise((resolve, reject) => {
			let listenerDisposable: IDisposable | undefined;
			const timeout = setTimeout(() => {
				// Clean up listener after timeout
				listenerDisposable?.dispose();
				reject(new Error('JavaScript execution timeout'));
			}, 10000);

			const listener = (message: any) => {
				if (message && message.command === 'executeJavaScriptResponse' && message.messageId === messageId) {
					clearTimeout(timeout);
					listenerDisposable?.dispose();
					if (message.error) {
						reject(new Error(message.error));
					} else {
						resolve(message.result);
					}
				}
			};

			// Register the listener and store the disposable
			listenerDisposable = metadata.webviewInput.webview.onDidReceiveMessage(listener);

			// Send the JavaScript to execute
			metadata.webviewInput.webview.postMessage({
				command: 'executeJavaScript',
				messageId,
				javascript
			});
		});
	}

	private getWebviewHtml(url: string): string {
		// Use iframe for display (VS Code webview doesn't support Electron's <webview> tag)
		// Interaction happens via hidden BrowserWindow in main process
		const safeUrl = url.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		return '<!DOCTYPE html>\n<html>\n<head>\n\t<meta http-equiv="Content-type" content="text/html;charset=UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; frame-src * \'self\' http: https: data: blob: ws: wss:; img-src * data: blob:; script-src \'unsafe-inline\';">\n\t<style>\n\t\t* { box-sizing: border-box; }\n\t\thtml, body, iframe { height: 100%; width: 100%; margin: 0; padding: 0; border: none; overflow: hidden; }\n\t\tbody { background-color: #1e1e1e; }\n\t</style>\n</head>\n<body>\n\t<iframe id="browser-frame" src="' + safeUrl + '" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups allow-modals allow-popups-to-escape-sandbox" style="width:100%;height:100%;border:none;"></iframe>\n</body>\n</html>';
	}
}

registerSingleton(IWebviewToolService, WebviewToolService, InstantiationType.Delayed);