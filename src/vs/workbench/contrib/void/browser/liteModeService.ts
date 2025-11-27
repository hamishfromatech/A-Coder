/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IMetricsService } from '../common/metricsService.js';
import { ILiteModeService } from './liteMode.contribution.js';
import { IWebviewWorkbenchService } from '../../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IChatThreadService } from './chatThreadService.js';

export class LiteModeService extends Disposable implements ILiteModeService {
    private _webviewPanel: any = null;
    private _isOpen: boolean = false;

    constructor(
        @IMetricsService private readonly _metricsService: IMetricsService,
        @IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
        @IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
        @IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
        @IInstantiationService private readonly _instantiationService: IInstantiationService,
    ) {
        super();
    }

    async openLiteMode(): Promise<void> {
        if (this._isOpen) {
            return; // Already open
        }

        this._metricsService.capture('Lite Mode', { action: 'open_attempt' });

        try {
            // Get the Lite Mode HTML content
            const liteModeHtml = this._getLiteModeHtml();

            // Create the webview panel
            const webviewInitInfo = {
                providedViewType: 'void-lite-mode',
                title: 'A-Coder Lite Mode',
                options: {
                    retainContextWhenHidden: true,
                    enableScripts: true
                },
                contentOptions: {
                    allowScripts: true,
                    localResourceRoots: []
                },
                extension: undefined
            };

            // Show in the active group (will replace current editor)
            const showOptions = {
                group: ACTIVE_GROUP,
                preserveFocus: false
            };

            const webviewInput = this._webviewWorkbenchService.openWebview(
                webviewInitInfo,
                'void-lite-mode',
                'A-Coder Lite Mode',
                showOptions
            );

            // Access the webview through the webviewInput
            const webview = webviewInput.webview;

            // Set the webview content
            webview.setHtml(liteModeHtml);

            // Maximize the editor to make it feel like a separate window
            // Hide side bar and activity bar for a clean experience
            this._layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
            this._layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
            this._layoutService.setPartHidden(true, Parts.PANEL_PART); // Hide bottom panel
            // Note: Status bar doesn't have a setPartHidden method, keep it visible

            // Maximize the editor group
            const activeGroup = this._editorGroupsService.activeGroup;
            if (activeGroup) {
                // Focus on the active group to make it feel like the main content
                activeGroup.focus();
            }

            // Handle messages from the webview
            webview.onMessage(
                (event: any) => {
                    const message = event.message;
                    switch (message.type) {
                        case 'chatMessage':
                            console.log('Lite Mode received chat message:', message.message);
                            // For now, just echo back a simple response
                            webview.postMessage({
                                type: 'chatResponse',
                                content: `I understand you said: "${message.message}". I'm currently in Lite Mode with basic functionality. Your message has been received!`
                            });
                            break;
                        case 'closeLiteMode':
                            // Restore the original layout when closing
                            this._layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
                            this._layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
                            this._layoutService.setPartHidden(false, Parts.PANEL_PART);
                            webviewInput.dispose();
                            break;
                    }
                },
                undefined,
                this._store
            );

            // Handle panel disposal to restore layout
            this._store.add({
                dispose: () => {
                    if (webviewInput.isDisposed()) {
                        this._isOpen = false;
                        this._webviewPanel = null;
                        this._metricsService.capture('Lite Mode', { action: 'closed' });
                        // Restore the original layout
                        this._layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
                        this._layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
                        this._layoutService.setPartHidden(false, Parts.PANEL_PART);
                    }
                }
            });

            this._webviewPanel = webviewInput;
            this._isOpen = true;

            this._metricsService.capture('Lite Mode', { action: 'open_success' });

        } catch (error) {
            console.error('Failed to open Lite Mode webview:', error);
            // Fallback to alert if webview creation fails
            this._showFallbackAlert();
        }
    }

    async openWalkthroughPreview(filePath: string, preview: string): Promise<void> {
        try {
            // Read the full walkthrough file content instead of using the truncated preview
            const fullContent = await this._readWalkthroughFile(filePath);

            this._metricsService.capture('Lite Mode', { action: 'open_walkthrough_attempt' });

            // Create webview panel with walkthrough content
            const walkthroughHtml = this._getWalkthroughHtml(filePath, fullContent);

            const webviewInitInfo = {
                providedViewType: 'void-walkthrough-preview',
                title: `Walkthrough: ${filePath.split('/').pop()}`,
                options: {
                    retainContextWhenHidden: true,
                    enableScripts: true
                },
                contentOptions: {
                    allowScripts: true,
                    localResourceRoots: []
                },
                extension: undefined
            };

            const showOptions = {
                group: ACTIVE_GROUP,
                preserveFocus: false
            };

            const webviewInput = this._webviewWorkbenchService.openWebview(
                webviewInitInfo,
                'void-walkthrough-preview',
                `Walkthrough: ${filePath.split('/').pop()}`,
                showOptions
            );

            const webview = webviewInput.webview;
            webview.setHtml(walkthroughHtml);

            // Handle messages from the webview
            webview.onMessage(
                async (event: any) => {
                    const message = event.message;
                    switch (message.type) {
                        case 'closeWalkthrough':
                            // Close the webview panel
                            if (this._webviewPanel) {
                                this._webviewPanel.dispose();
                                this._webviewPanel = undefined;
                            }
                            this._isOpen = false;
                            break;
                        case 'requestChanges':
                            // Send walkthrough content to chat for processing
                            const fullContent = await this._readWalkthroughFile(filePath);
                            this._sendWalkthroughToChat(filePath, fullContent, message.requestedChanges);
                            break;
                        case 'approveWalkthrough':
                            // User approved the walkthrough
                            this._metricsService.capture('Walkthrough', { action: 'approved', filePath });
                            break;
                    }
                },
                undefined,
                this._store
            );

            this._webviewPanel = webviewInput;
            this._isOpen = true;

            this._metricsService.capture('Lite Mode', { action: 'open_walkthrough_success' });

        } catch (error) {
            console.error('Failed to open walkthrough preview:', error);
            this._showFallbackAlert();
        }
    }

    async openContentPreview(title: string, content: string): Promise<void> {
        try {
            this._metricsService.capture('Lite Mode', { action: 'open_content_preview_attempt' });

            // Create webview panel with the content
            const contentHtml = this._getContentPreviewHtml(title, content);

            const webviewInitInfo = {
                providedViewType: 'void-content-preview',
                title: title,
                options: {
                    retainContextWhenHidden: true,
                    enableScripts: true
                },
                contentOptions: {
                    allowScripts: true,
                    localResourceRoots: []
                },
                extension: undefined
            };

            const showOptions = {
                group: ACTIVE_GROUP,
                preserveFocus: false
            };

            const webviewInput = this._webviewWorkbenchService.openWebview(
                webviewInitInfo,
                'void-content-preview',
                title,
                showOptions
            );

            const webview = webviewInput.webview;
            webview.setHtml(contentHtml);

            // Handle messages from the webview
            webview.onMessage(
                async (event: any) => {
                    const message = event.message;
                    switch (message.type) {
                        case 'closePreview':
                            if (this._webviewPanel) {
                                this._webviewPanel.dispose();
                                this._webviewPanel = undefined;
                            }
                            this._isOpen = false;
                            break;
                        case 'approveContent':
                            this._metricsService.capture('Content Preview', { action: 'approved', title });
                            break;
                        case 'requestContentChanges':
                            this._sendContentChangesToChat(title, content, message.requestedChanges);
                            break;
                    }
                },
                undefined,
                this._store
            );

            this._webviewPanel = webviewInput;
            this._isOpen = true;

            this._metricsService.capture('Lite Mode', { action: 'open_content_preview_success' });

        } catch (error) {
            console.error('Failed to open content preview:', error);
            this._showFallbackAlert();
        }
    }

    private _getContentPreviewHtml(title: string, content: string): string {
        // Process markdown content for better rendering
        const processedContent = this._processMarkdownContent(content);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
            font-size: 14px;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 24px 24px 16px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            flex-shrink: 0;
        }

        .header-left {
            flex: 1;
            min-width: 0;
        }

        .header h2 {
            margin: 0 0 8px 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header h2::before {
            content: "📋";
            font-size: 16px;
        }

        .actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
            min-height: 32px;
        }

        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .btn:active {
            transform: translateY(0);
        }

        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-success {
            background-color: #28a745;
            color: white;
            border: 1px solid #28a745;
        }

        .btn-success:hover {
            background-color: #218838;
        }

        .content-wrapper {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .content {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            background-color: var(--vscode-editor-background);
        }

        .content::-webkit-scrollbar {
            width: 8px;
        }

        .content::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }

        .content::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        .content::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* Enhanced markdown styles */
        .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
            color: var(--vscode-foreground);
            margin-top: 32px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }

        .content h1:first-child,
        .content h2:first-child,
        .content h3:first-child {
            margin-top: 0;
        }

        .content h1 {
            font-size: 2em;
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }
        .content h2 {
            font-size: 1.5em;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }
        .content h3 { font-size: 1.25em; }
        .content h4 { font-size: 1em; }
        .content h5 { font-size: 0.875em; }
        .content h6 { font-size: 0.85em; color: var(--vscode-descriptionForeground); }

        .content p {
            margin-bottom: 16px;
            color: var(--vscode-editor-foreground);
        }

        .content ul, .content ol {
            margin-bottom: 16px;
            padding-left: 2em;
        }

        .content li {
            margin-bottom: 6px;
            color: var(--vscode-editor-foreground);
        }

        .content blockquote {
            margin: 0 0 16px 0;
            padding: 16px 20px;
            color: var(--vscode-descriptionForeground);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 0 6px 6px 0;
        }

        .content code {
            background-color: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textCodeBlock-foreground);
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 0.85em;
            border: 1px solid var(--vscode-panel-border);
        }

        .content pre {
            background-color: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textCodeBlock-foreground);
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 0.9em;
            line-height: 1.5;
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
        }

        .content pre code {
            background: none;
            padding: 0;
            font-size: inherit;
            border: none;
        }

        .code-block-wrapper {
            position: relative;
            margin-bottom: 20px;
        }

        .code-block-wrapper .code-lang {
            position: absolute;
            top: 0;
            right: 0;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 10px;
            font-size: 11px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            border-radius: 0 8px 0 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 500;
        }

        .code-block-wrapper pre {
            margin: 0;
        }

        .content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-color 0.15s ease;
        }

        .content a:hover {
            border-bottom-color: var(--vscode-textLink-foreground);
        }

        .content hr {
            height: 1px;
            border: none;
            background-color: var(--vscode-panel-border);
            margin: 32px 0;
        }

        .changes-section {
            margin: 24px;
            padding: 20px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-button-background);
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .changes-section h3 {
            margin: 0 0 16px 0;
            color: var(--vscode-foreground);
            font-size: 16px;
            font-weight: 600;
        }

        .changes-section textarea {
            width: 100%;
            min-height: 120px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 2px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
            resize: vertical;
            transition: border-color 0.15s ease;
        }

        .changes-section textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .changes-section .actions {
            margin-top: 16px;
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <h2>${title}</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="requestChanges()">
                    <span>✏️</span> Request Changes
                </button>
                <button class="btn btn-success" onclick="approveContent()">
                    <span>✅</span> Approve
                </button>
                <button class="btn btn-secondary" onclick="closePreview()">
                    <span>✕</span> Close
                </button>
            </div>
        </div>

        <div class="content-wrapper">
            <div class="content">
                ${processedContent}
            </div>
        </div>

        <div class="changes-section" id="changesSection" style="display: none;">
            <h3>What changes would you like?</h3>
            <textarea id="changesTextarea" placeholder="Describe the changes you'd like to make..."></textarea>
            <div class="actions">
                <button class="btn btn-secondary" onclick="cancelChanges()">Cancel</button>
                <button class="btn btn-primary" onclick="submitChanges()">Submit Changes</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function closePreview() {
            vscode.postMessage({ type: 'closePreview' });
        }

        function approveContent() {
            vscode.postMessage({ type: 'approveContent' });
            closePreview();
        }

        function requestChanges() {
            document.getElementById('changesSection').style.display = 'block';
            document.getElementById('changesTextarea').focus();
        }

        function submitChanges() {
            const requestedChanges = document.getElementById('changesTextarea').value;
            if (!requestedChanges.trim()) {
                showNotification('Please describe the changes you would like to make.', 'warning');
                return;
            }

            vscode.postMessage({
                type: 'requestContentChanges',
                requestedChanges: requestedChanges
            });
            closePreview();
        }

        function cancelChanges() {
            document.getElementById('changesSection').style.display = 'none';
            document.getElementById('changesTextarea').value = '';
        }

        function showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            const bgColor = type === 'warning' ? 'var(--vscode-inputValidation-warningBackground)' : 'var(--vscode-notifications-background)';
            const textColor = type === 'warning' ? 'var(--vscode-inputValidation-warningForeground)' : 'var(--vscode-notifications-foreground)';
            const borderColor = type === 'warning' ? 'var(--vscode-inputValidation-warningBorder)' : 'var(--vscode-notifications-border)';

            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.backgroundColor = bgColor;
            notification.style.color = textColor;
            notification.style.border = '1px solid ' + borderColor;
            notification.style.borderRadius = '6px';
            notification.style.padding = '12px 16px';
            notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            notification.style.zIndex = '1000';
            notification.style.maxWidth = '300px';
            notification.style.fontSize = '13px';
            notification.textContent = message;

            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }

        // Handle keyboard shortcuts
        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'Enter':
                        e.preventDefault();
                        approveContent();
                        break;
                    case 'w':
                        e.preventDefault();
                        closePreview();
                        break;
                }
            }

            if (e.key === 'Escape') {
                const changesSection = document.getElementById('changesSection');
                if (changesSection.style.display !== 'none') {
                    cancelChanges();
                } else {
                    closePreview();
                }
            }
        });

        // Auto-resize textarea
        const textarea = document.getElementById('changesTextarea');
        if (textarea) {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.max(120, this.scrollHeight) + 'px';
            });
        }
    </script>
</body>
</html>`;
    }

    private _sendContentChangesToChat(title: string, content: string, requestedChanges?: string): void {
        if (!requestedChanges) {
            console.log('No changes requested');
            return;
        }

        try {
            // Get the chat service lazily to avoid circular dependency
            const chatService = this._instantiationService.invokeFunction((accessor) => {
                return accessor.get(IChatThreadService);
            });

            if (!chatService) {
                console.error('Chat service not available');
                return;
            }

            // Create a user message requesting changes
            const changeRequest = `Please make the following changes to the plan "${title}":

${requestedChanges}`;

            // Get the current thread
            const currentThreadId = chatService.state.currentThreadId;
            const currentThread = chatService.state.allThreads[currentThreadId];

            if (!currentThread) {
                console.error('No current chat thread found');
                return;
            }

            // Add the user message to the current thread and stream response
            chatService.addUserMessageAndStreamResponse({
                userMessage: changeRequest,
                threadId: currentThreadId
            });

            console.log('Content change request sent to chat:', { title, requestedChanges });

            // Track the interaction
            this._metricsService.capture('Content Changes', {
                action: 'changes_requested',
                title,
                hasContent: !!content
            });

        } catch (error) {
            console.error('Failed to send content changes to chat:', error);
            this._metricsService.capture('Content Changes', {
                action: 'changes_request_failed',
                title,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private _sendWalkthroughToChat(filePath: string, preview: string, requestedChanges?: string): void {
        if (!requestedChanges) {
            console.log('No changes requested');
            return;
        }

        try {
            // Get the chat service lazily to avoid circular dependency
            const chatService = this._instantiationService.invokeFunction((accessor) => {
                return accessor.get(IChatThreadService);
            });

            if (!chatService) {
                console.error('Chat service not available');
                return;
            }

            // Create a user message requesting changes to the codebase
            const changeRequest = `Please make the following changes to the codebase:

${requestedChanges}`;

            // Get the current thread
            const currentThreadId = chatService.state.currentThreadId;
            const currentThread = chatService.state.allThreads[currentThreadId];

            if (!currentThread) {
                console.error('No current chat thread found');
                return;
            }

            // Add the user message to the current thread and stream response
            chatService.addUserMessageAndStreamResponse({
                userMessage: changeRequest,
                threadId: currentThreadId
            });

            console.log('Codebase change request sent to chat:', { filePath, requestedChanges });

            // Track the interaction
            this._metricsService.capture('Codebase Changes', {
                action: 'changes_requested',
                filePath,
                hasContent: !!preview
            });

        } catch (error) {
            console.error('Failed to send codebase changes to chat:', error);
            this._metricsService.capture('Codebase Changes', {
                action: 'changes_request_failed',
                filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async _readWalkthroughFile(filePath: string): Promise<string> {
        try {
            // Use the file service to read the full walkthrough file
            const fileService = this._instantiationService.invokeFunction((accessor) =>
                accessor.get(IFileService)
            );

            const uri = URI.file(filePath);
            const fileContent = await fileService.readFile(uri);
            return fileContent.value.toString();
        } catch (error) {
            console.error('Failed to read walkthrough file:', error);
            // Fallback to empty string if file can't be read
            return '';
        }
    }

    private _getWalkthroughHtml(filePath: string, preview: string): string {
        // Process markdown content for better rendering
        const processedPreview = this._processMarkdownContent(preview);

        return `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Walkthrough Preview</title>
                    <style>
                        * {
                            box-sizing: border-box;
                        }

                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            margin: 0;
                            padding: 0;
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-editor-foreground);
                            line-height: 1.6;
                            font-size: 14px;
                        }

                        .container {
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                        }

                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            padding: 24px 24px 16px 24px;
                            border-bottom: 1px solid var(--vscode-panel-border);
                            background-color: var(--vscode-editor-background);
                            flex-shrink: 0;
                        }

                        .header-left {
                            flex: 1;
                            min-width: 0;
                        }

                        .header h2 {
                            margin: 0 0 8px 0;
                            font-size: 18px;
                            font-weight: 600;
                            color: var(--vscode-foreground);
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }

                        .header h2::before {
                            content: "📋";
                            font-size: 16px;
                        }

                        .file-path {
                            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                            color: var(--vscode-descriptionForeground);
                            font-size: 12px;
                            background-color: var(--vscode-editor-lineHighlightBackground);
                            padding: 4px 8px;
                            border-radius: 4px;
                            border: 1px solid var(--vscode-panel-border);
                            display: inline-block;
                            word-break: break-all;
                        }

                        .actions {
                            display: flex;
                            gap: 8px;
                            flex-shrink: 0;
                        }

                        .btn {
                            padding: 8px 16px;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 13px;
                            font-weight: 500;
                            transition: all 0.15s ease;
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                            white-space: nowrap;
                            min-height: 32px;
                        }

                        .btn:hover {
                            transform: translateY(-1px);
                            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                        }

                        .btn:active {
                            transform: translateY(0);
                        }

                        .btn-primary {
                            background-color: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: 1px solid var(--vscode-button-background);
                        }

                        .btn-primary:hover {
                            background-color: var(--vscode-button-hoverBackground);
                        }

                        .btn-secondary {
                            background-color: var(--vscode-button-secondaryBackground);
                            color: var(--vscode-button-secondaryForeground);
                            border: 1px solid var(--vscode-panel-border);
                        }

                        .btn-secondary:hover {
                            background-color: var(--vscode-button-secondaryHoverBackground);
                        }

                        .btn-success {
                            background-color: #28a745;
                            color: white;
                            border: 1px solid #28a745;
                        }

                        .btn-success:hover {
                            background-color: #218838;
                        }

                        .content-wrapper {
                            flex: 1;
                            overflow: hidden;
                            display: flex;
                            flex-direction: column;
                        }

                        .content {
                            flex: 1;
                            padding: 24px;
                            overflow-y: auto;
                            background-color: var(--vscode-editor-background);
                        }

                        .content::-webkit-scrollbar {
                            width: 8px;
                        }

                        .content::-webkit-scrollbar-track {
                            background: var(--vscode-editor-background);
                        }

                        .content::-webkit-scrollbar-thumb {
                            background: var(--vscode-scrollbarSlider-background);
                            border-radius: 4px;
                        }

                        .content::-webkit-scrollbar-thumb:hover {
                            background: var(--vscode-scrollbarSlider-hoverBackground);
                        }

                        /* Enhanced markdown styles */
                        .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
                            color: var(--vscode-foreground);
                            margin-top: 32px;
                            margin-bottom: 16px;
                            font-weight: 600;
                            line-height: 1.25;
                        }

                        .content h1:first-child,
                        .content h2:first-child,
                        .content h3:first-child {
                            margin-top: 0;
                        }

                        .content h1 {
                            font-size: 2em;
                            border-bottom: 2px solid var(--vscode-panel-border);
                            padding-bottom: 0.3em;
                        }
                        .content h2 {
                            font-size: 1.5em;
                            border-bottom: 1px solid var(--vscode-panel-border);
                            padding-bottom: 0.3em;
                        }
                        .content h3 { font-size: 1.25em; }
                        .content h4 { font-size: 1em; }
                        .content h5 { font-size: 0.875em; }
                        .content h6 { font-size: 0.85em; color: var(--vscode-descriptionForeground); }

                        .content p {
                            margin-bottom: 16px;
                            color: var(--vscode-editor-foreground);
                        }

                        .content ul, .content ol {
                            margin-bottom: 16px;
                            padding-left: 2em;
                        }

                        .content li {
                            margin-bottom: 6px;
                            color: var(--vscode-editor-foreground);
                        }

                        .content blockquote {
                            margin: 0 0 16px 0;
                            padding: 16px 20px;
                            color: var(--vscode-descriptionForeground);
                            border-left: 4px solid var(--vscode-textBlockQuote-border);
                            background-color: var(--vscode-textBlockQuote-background);
                            border-radius: 0 6px 6px 0;
                        }

                        .content code {
                            background-color: var(--vscode-textCodeBlock-background);
                            color: var(--vscode-textCodeBlock-foreground);
                            padding: 0.2em 0.4em;
                            border-radius: 4px;
                            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                            font-size: 0.85em;
                            border: 1px solid var(--vscode-panel-border);
                        }

                        .content pre {
                            background-color: var(--vscode-textCodeBlock-background);
                            color: var(--vscode-textCodeBlock-foreground);
                            padding: 20px;
                            border-radius: 8px;
                            overflow-x: auto;
                            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                            font-size: 0.9em;
                            line-height: 1.5;
                            margin-bottom: 20px;
                            border: 1px solid var(--vscode-panel-border);
                        }

                        .content pre code {
                            background: none;
                            padding: 0;
                            font-size: inherit;
                            border: none;
                        }

                        /* Code block wrapper with language label */
                        .code-block-wrapper {
                            position: relative;
                            margin-bottom: 20px;
                        }

                        .code-block-wrapper .code-lang {
                            position: absolute;
                            top: 0;
                            right: 0;
                            background-color: var(--vscode-badge-background);
                            color: var(--vscode-badge-foreground);
                            padding: 4px 10px;
                            font-size: 11px;
                            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                            border-radius: 0 8px 0 6px;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            font-weight: 500;
                        }

                        .code-block-wrapper pre {
                            margin: 0;
                        }

                        /* Table wrapper for horizontal scroll on small screens */
                        .table-wrapper {
                            overflow-x: auto;
                            margin-bottom: 20px;
                            border-radius: 8px;
                            border: 1px solid var(--vscode-panel-border);
                        }

                        .table-wrapper table {
                            margin-bottom: 0;
                            border: none;
                            border-radius: 0;
                        }

                        .content table {
                            border-spacing: 0;
                            border-collapse: collapse;
                            margin-bottom: 20px;
                            width: 100%;
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 6px;
                            overflow: hidden;
                        }

                        .content table th, .content table td {
                            border: 1px solid var(--vscode-panel-border);
                            padding: 12px 16px;
                            text-align: left;
                        }

                        .content table th {
                            background-color: var(--vscode-editor-lineHighlightBackground);
                            font-weight: 600;
                            color: var(--vscode-foreground);
                        }

                        .content table tr:nth-child(even) {
                            background-color: var(--vscode-editor-lineHighlightBackground);
                        }

                        .content a {
                            color: var(--vscode-textLink-foreground);
                            text-decoration: none;
                            border-bottom: 1px solid transparent;
                            transition: border-color 0.15s ease;
                        }

                        .content a:hover {
                            border-bottom-color: var(--vscode-textLink-foreground);
                        }

                        .content img {
                            max-width: 100%;
                            height: auto;
                            border-radius: 6px;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        }

                        .content hr {
                            height: 1px;
                            border: none;
                            background-color: var(--vscode-panel-border);
                            margin: 32px 0;
                        }

                        .changes-section {
                            margin: 24px;
                            padding: 20px;
                            background-color: var(--vscode-textBlockQuote-background);
                            border-left: 4px solid var(--vscode-button-background);
                            border-radius: 0 8px 8px 0;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        }

                        .changes-section h3 {
                            margin: 0 0 16px 0;
                            color: var(--vscode-foreground);
                            font-size: 16px;
                            font-weight: 600;
                        }

                        .changes-section textarea {
                            width: 100%;
                            min-height: 120px;
                            background-color: var(--vscode-input-background);
                            color: var(--vscode-input-foreground);
                            border: 2px solid var(--vscode-input-border);
                            border-radius: 6px;
                            padding: 12px;
                            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                            font-size: 13px;
                            resize: vertical;
                            transition: border-color 0.15s ease;
                        }

                        .changes-section textarea:focus {
                            outline: none;
                            border-color: var(--vscode-focusBorder);
                        }

                        .changes-section .actions {
                            margin-top: 16px;
                            display: flex;
                            gap: 8px;
                            justify-content: flex-end;
                        }

                        /* Loading state */
                        .loading {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 40px;
                            color: var(--vscode-descriptionForeground);
                        }

                        .loading::after {
                            content: "";
                            width: 16px;
                            height: 16px;
                            border: 2px solid var(--vscode-descriptionForeground);
                            border-top-color: transparent;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin-left: 8px;
                        }

                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="header-left">
                                <h2>Walkthrough Preview</h2>
                                <div class="file-path">${filePath}</div>
                            </div>
                            <div class="actions">
                                <button class="btn btn-secondary" onclick="requestChanges()">
                                    <span>✏️</span> Request Changes
                                </button>
                                <button class="btn btn-success" onclick="approveWalkthrough()">
                                    <span>✅</span> Approve
                                </button>
                                <button class="btn btn-secondary" onclick="closeWalkthrough()">
                                    <span>✕</span> Close
                                </button>
                            </div>
                        </div>

                        <div class="content-wrapper">
                            <div class="content">
                                ${processedPreview}
                            </div>
                        </div>

                        <div class="changes-section" id="changesSection" style="display: none;">
                            <h3>What changes would you like?</h3>
                            <textarea id="changesTextarea" placeholder="Describe the changes you'd like to make to this walkthrough..."></textarea>
                            <div class="actions">
                                <button class="btn btn-secondary" onclick="cancelChanges()">Cancel</button>
                                <button class="btn btn-primary" onclick="submitChanges()">Submit Changes</button>
                            </div>
                        </div>
                    </div>

                    <script>
            const vscode = acquireVsCodeApi();

            function closeWalkthrough() {
                vscode.postMessage({
                    type: 'closeWalkthrough'
                });
            }

            function approveWalkthrough() {
                vscode.postMessage({
                    type: 'approveWalkthrough'
                });
                closeWalkthrough();
            }

            function requestChanges() {
                document.getElementById('changesSection').style.display = 'block';
                document.getElementById('changesTextarea').focus();
            }

            function submitChanges() {
                const requestedChanges = document.getElementById('changesTextarea').value;
                if (!requestedChanges.trim()) {
                    showNotification('Please describe the changes you would like to make.', 'warning');
                    return;
                }

                vscode.postMessage({
                    type: 'requestChanges',
                    requestedChanges: requestedChanges
                });
                closeWalkthrough();
            }

            function cancelChanges() {
                document.getElementById('changesSection').style.display = 'none';
                document.getElementById('changesTextarea').value = '';
            }

            function showNotification(message, type = 'info') {
                // Create a modern notification instead of alert
                const notification = document.createElement('div');
                const bgColor = type === 'warning' ? 'var(--vscode-inputValidation-warningBackground)' : 'var(--vscode-notifications-background)';
                const textColor = type === 'warning' ? 'var(--vscode-inputValidation-warningForeground)' : 'var(--vscode-notifications-foreground)';
                const borderColor = type === 'warning' ? 'var(--vscode-inputValidation-warningBorder)' : 'var(--vscode-notifications-border)';

                notification.style.position = 'fixed';
                notification.style.top = '20px';
                notification.style.right = '20px';
                notification.style.backgroundColor = bgColor;
                notification.style.color = textColor;
                notification.style.border = '1px solid ' + borderColor;
                notification.style.borderRadius = '6px';
                notification.style.padding = '12px 16px';
                notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                notification.style.zIndex = '1000';
                notification.style.maxWidth = '300px';
                notification.style.fontSize = '13px';
                notification.textContent = message;

                document.body.appendChild(notification);

                // Auto remove after 3 seconds
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 3000);
            }

            // Handle keyboard shortcuts
            document.addEventListener('keydown', function (e) {
                if (e.ctrlKey || e.metaKey) {
                    switch (e.key) {
                        case 'Enter':
                            e.preventDefault();
                            approveWalkthrough();
                            break;
                        case 'w':
                            e.preventDefault();
                            closeWalkthrough();
                            break;
                    }
                }

                // Escape key closes changes section
                if (e.key === 'Escape') {
                    const changesSection = document.getElementById('changesSection');
                    if (changesSection.style.display !== 'none') {
                        cancelChanges();
                    } else {
                        closeWalkthrough();
                    }
                }
            });

            // Auto-resize textarea
            const textarea = document.getElementById('changesTextarea');
            if (textarea) {
                textarea.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.max(120, this.scrollHeight) + 'px';
                });
            }
            </script>
                </body>
                </html>`;
    }

    private _processMarkdownContent(content: string): string {
        if (!content) return '';

        let processed = content;

        // Escape HTML to prevent XSS
        const escapeHtml = (text: string) => text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Process code blocks FIRST (before other processing) to protect their content
        const codeBlocks: string[] = [];
        processed = processed.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const index = codeBlocks.length;
            const escapedCode = escapeHtml(code.trim());
            const langClass = lang ? ` class="language-${lang}"` : '';
            const langLabel = lang ? `<div class="code-lang">${lang}</div>` : '';
            codeBlocks.push(`<div class="code-block-wrapper">${langLabel}<pre><code${langClass}>${escapedCode}</code></pre></div>`);
            return `%%CODEBLOCK_${index}%%`;
        });

        // Process tables
        processed = processed.replace(/^\|(.+)\|\s*\n\|[-:\s|]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm, (match, headerRow, bodyRows) => {
            const headers = headerRow.split('|').map((h: string) => h.trim()).filter((h: string) => h);
            const rows = bodyRows.trim().split('\n').map((row: string) => {
                return row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell !== '');
            });

            let tableHtml = '<div class="table-wrapper"><table>';
            tableHtml += '<thead><tr>';
            headers.forEach((h: string) => {
                tableHtml += `<th>${this._processInlineMarkdown(h)}</th>`;
            });
            tableHtml += '</tr></thead>';
            tableHtml += '<tbody>';
            rows.forEach((row: string[]) => {
                tableHtml += '<tr>';
                row.forEach((cell: string) => {
                    tableHtml += `<td>${this._processInlineMarkdown(cell)}</td>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            return tableHtml;
        });

        // Headers (process from h6 to h1 to avoid conflicts)
        processed = processed.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
        processed = processed.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
        processed = processed.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
        processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Blockquotes
        processed = processed.replace(/^> (.*)$/gim, '<blockquote>$1</blockquote>');
        // Merge consecutive blockquotes
        processed = processed.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

        // Horizontal rules
        processed = processed.replace(/^---+$/gim, '<hr>');
        processed = processed.replace(/^\*\*\*+$/gim, '<hr>');

        // Unordered lists
        processed = processed.replace(/^[\*\-] (.*)$/gim, '<li>$1</li>');

        // Ordered lists
        processed = processed.replace(/^\d+\. (.*)$/gim, '<li class="ordered">$1</li>');

        // Wrap consecutive list items
        processed = processed.replace(/(<li>[\s\S]*?<\/li>)(?=\s*(?:<li>|$))/g, (match) => {
            return match;
        });
        // Wrap unordered lists
        processed = processed.replace(/(<li>(?:(?!<li class="ordered">)[\s\S])*?<\/li>(?:\s*<li>(?:(?!<li class="ordered">)[\s\S])*?<\/li>)*)/g, '<ul>$1</ul>');
        // Wrap ordered lists
        processed = processed.replace(/(<li class="ordered">[\s\S]*?<\/li>(?:\s*<li class="ordered">[\s\S]*?<\/li>)*)/g, '<ol>$1</ol>');
        processed = processed.replace(/<li class="ordered">/g, '<li>');

        // Process inline markdown
        processed = this._processInlineMarkdown(processed);

        // Line breaks - convert double newlines to paragraph breaks
        processed = processed.replace(/\n\n+/g, '</p><p>');
        processed = '<p>' + processed + '</p>';

        // Clean up empty paragraphs and fix nesting
        processed = processed.replace(/<p><\/p>/g, '');
        processed = processed.replace(/<p>\s*(<(?:h[1-6]|ul|ol|table|pre|blockquote|hr|div))/g, '$1');
        processed = processed.replace(/(<\/(?:h[1-6]|ul|ol|table|pre|blockquote|hr|div)>)\s*<\/p>/g, '$1');
        processed = processed.replace(/<p>(<div class="table-wrapper">)/g, '$1');
        processed = processed.replace(/(<\/div>)<\/p>/g, '$1');

        // Restore code blocks
        codeBlocks.forEach((block, index) => {
            processed = processed.replace(`%%CODEBLOCK_${index}%%`, block);
        });

        // Clean up any remaining paragraph issues around code blocks
        processed = processed.replace(/<p>(<div class="code-block-wrapper">)/g, '$1');
        processed = processed.replace(/(<\/div>)<\/p>/g, '$1');

        return processed;
    }

    private _processInlineMarkdown(text: string): string {
        let processed = text;

        // Bold (must come before italic)
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic
        processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');

        // Strikethrough
        processed = processed.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // Inline code
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Links
        processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Images
        processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

        return processed;
    }

    private _showFallbackAlert(): void {
        const message = `
A-Coder Lite Mode

This is a simplified interface for non-technical users.

Features:
• Clean, distraction-free chat interface
• Easy access to A-Coder's core functionality
• Simplified controls and options

In a full implementation, this would open as a dedicated panel
with a custom webview interface. For now, this demonstrates that
the Lite Mode button is working correctly.

Click OK to close this message.
            `;

        // Use a simple alert for now
        alert(message.trim());

        this._isOpen = true;
        this._metricsService.capture('Lite Mode', { action: 'open_fallback' });

        // Auto-close after a moment to simulate the temporary nature of the alert
        setTimeout(() => {
            this._isOpen = false;
            this._metricsService.capture('Lite Mode', { action: 'closed' });
        }, 100);
    }

    closeLiteMode(): void {
        if (this._webviewPanel) {
            this._webviewPanel.dispose();
            this._webviewPanel = null;
        }
        this._isOpen = false;
        this._metricsService.capture('Lite Mode', { action: 'closed' });
    }

    isLiteModeOpen(): boolean {
        return this._isOpen;
    }

    private _getLiteModeHtml(): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A-Coder Lite Mode</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f8f9fa;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 {
            margin: 0;
            font-size: 18px;
            color: #333;
        }
        .header p {
            margin: 5px 0 0 0;
            color: #666;
            font-size: 14px;
        }
        .messages {
            flex: 1;
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow-y: auto;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px 12px;
            border-radius: 6px;
        }
        .message.user {
            background: #e3f2fd;
            margin-left: 20px;
        }
        .message.assistant {
            background: #f3e5f5;
            margin-right: 20px;
        }
        .input-area {
            background: white;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .input-group {
            display: flex;
            gap: 10px;
        }
        textarea {
            flex: 1;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px;
            font-family: inherit;
            resize: vertical;
            min-height: 40px;
        }
        button {
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            cursor: pointer;
        }
        button:hover {
            background: #1565c0;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .close-btn {
            background: #dc3545;
            padding: 4px 8px;
            font-size: 12px;
            float: right;
        }
    </style>
</head>
<body>
    <div class="header">
        <button class="close-btn" onclick="closeLiteMode()">✕ Close</button>
        <h1>A-Coder Lite Mode</h1>
        <p>Simplified interface for non-technical users</p>
    </div>

    <div class="messages" id="messages">
        <div class="message assistant">
            Welcome to A-Coder Lite Mode! This is a simplified interface designed to make AI assistance more accessible. How can I help you today?
        </div>
    </div>

    <div class="input-area">
        <div class="input-group">
            <textarea id="messageInput" placeholder="Type your message here..."></textarea>
            <button id="sendButton" onclick="sendMessage()">Send</button>
        </div>
    </div>

    <script>
        // Try to get VS Code API, fallback to mock for testing
        const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : {
            postMessage: (message) => {
                console.log('Mock VS Code API message:', message);
                // Simulate response for testing
                if (message.type === 'chatMessage') {
                    setTimeout(() => {
                        addMessage('assistant', 'This is a mock response. In a real implementation, this would connect to the A-Coder chat service.');
                    }, 500);
                }
            }
        };

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();

            if (message) {
                // Add user message to chat
                addMessage('user', message);

                // Clear input
                input.value = '';

                // Send message to extension
                vscode.postMessage({
                    type: 'chatMessage',
                    message: message
                });

                // Disable send button temporarily
                const sendButton = document.getElementById('sendButton');
                sendButton.disabled = true;
                sendButton.textContent = 'Sending...';

                // Re-enable after a delay
                setTimeout(() => {
                    sendButton.disabled = false;
                    sendButton.textContent = 'Send';
                }, 1000);
            }
        }

        function addMessage(role, content) {
            const messagesContainer = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;
            messageDiv.textContent = content;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function closeLiteMode() {
            vscode.postMessage({
                type: 'closeLiteMode'
            });
        }

        // Handle Enter key in textarea
        document.getElementById('messageInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'chatResponse':
                    addMessage('assistant', message.content);
                    // Re-enable send button
                    const sendButton = document.getElementById('sendButton');
                    sendButton.disabled = false;
                    sendButton.textContent = 'Send';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
