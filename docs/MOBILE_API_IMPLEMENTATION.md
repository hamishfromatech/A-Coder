# Mobile API Implementation

## Overview

The Mobile API is a REST/WebSocket API that exposes A-Coder's coding agent and workspace features, enabling mobile companion apps to interact with A-Coder remotely. The API provides secure, token-based access to chat threads, workspace files, planning features, and real-time updates.

## Architecture

### Components

The Mobile API consists of several key components:

1. **API Server** (`apiServer.ts`) - HTTP/WebSocket server running in the main process
2. **API Router** (`apiRouter.ts`) - Request routing and pattern matching
3. **API Routes** (`apiRoutes.ts`) - REST endpoint implementations
4. **API Channel** (`apiChannel.ts`) - IPC bridge between main and renderer processes
5. **API Service Manager** (`apiServiceManager.ts`) - Lifecycle management
6. **API Service Bridge** (`apiServiceBridge.ts`) - Service integration in renderer process
7. **API Auth Service** (`apiAuthService.ts`) - Token generation and validation

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile App / Client                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/WebSocket
                        │ (localhost:3737)
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Main Process (Electron)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              API Service Manager                       │ │
│  │  - Lifecycle management                                │ │
│  │  - Controlled via IPC from Renderer                    │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────────┐ │
│  │              API Server                                │ │
│  │  - HTTP server (port 3737)                             │ │
│  │  - WebSocket server                                    │ │
│  │  - Authentication (via IPC validation)                 │ │
│  │  - CORS handling                                       │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────────┐ │
│  │              API Router                                │ │
│  │  - Route registration                                  │ │
│  │  - Pattern matching                                    │ │
│  │  - JSON parsing                                        │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────────┐ │
│  │              API Routes                                │ │
│  │  - Endpoint handlers                                   │ │
│  │  - Request validation                                  │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────────┐ │
│  │              API Channel (IPC)                         │ │
│  │  - Main ↔ Renderer communication                       │ │
│  │  - Server Control (Start/Stop)                         │ │
│  └────────────┬───────────────────────────────────────────┘ │
└───────────────┼──────────────────────────────────────────────┘
                │ IPC (Requests & Control)
┌───────────────▼──────────────────────────────────────────────┐
│                  Renderer Process (Browser)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              API Service Bridge                        │ │
│  │  - IPC handler                                         │ │
│  │  - Service integration                                 │ │
│  │  - Settings monitoring                                 │ │
│  │  - Server lifecycle control                            │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────────┐ │
│  │         A-Coder Services                               │ │
│  │  - ChatThreadService                                   │ │
│  │  - ToolsService                                        │ │
│  │  - VoidSettingsService                                 │ │
│  │  - FileService                                         │ │
│  │  - WorkspaceContextService                             │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## Security

### Authentication

The API uses token-based authentication:

- **Token Format**: `acoder_<random-string>`
- **Token Storage**: Stored in global settings (`apiTokens` array)
- **Token Validation**: Performed by `ApiAuthService`
- **Token Transmission**:
  - HTTP: `Authorization: Bearer <token>` header
  - WebSocket: `?token=<token>` query parameter

### Security Features

1. **Disabled by Default**: API must be explicitly enabled in settings
2. **Localhost Only**: Server binds to `127.0.0.1` (no direct internet exposure)
3. **Token-Based Auth**: All endpoints require valid API token
4. **CORS Support**: Configurable CORS headers for web clients
5. **Cloudflare Tunnel**: Optional secure remote access via user-configured tunnels

### Security Best Practices

- Generate unique tokens for each client/device
- Revoke tokens when no longer needed
- Use Cloudflare Tunnel for remote access (never expose port directly)
- Monitor API usage in logs
- Keep tokens secure (treat like passwords)

## API Endpoints

### Base URL
- **Local**: `http://localhost:3737`
- **Remote**: `https://your-tunnel-url.com` (via Cloudflare Tunnel)

### Authentication
All endpoints (except `/health`) require:
```
Authorization: Bearer acoder_<token>
```

### Response Format
All responses follow this structure:
```json
{
  "data": { ... }, // Response data
  "error": null,   // Error if any
  "timestamp": "2025-11-25T14:30:00.000Z"
}
```

### Health Check

#### GET `/api/v1/health`
Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-11-25T11:30:00.000Z"
}
```

**Frontend Handling:**
- Use this to check if API is running
- Call before attempting authenticated requests
- Retry with exponential backoff if failed

---

### Chat/Threads

#### GET `/api/v1/threads`
List all chat threads.

**Response:**
```json
{
  "threads": [
    {
      "id": "thread-123",
      "title": "Help me understand this codebase",
      "createdAt": "2025-11-25T10:00:00.000Z",
      "lastModified": "2025-11-25T11:00:00.000Z",
      "messageCount": 5
    }
  ]
}
```

**Note:** The `title` field contains the first user message's content, matching the desktop UI's history section behavior.

**Frontend Handling:**
- Display `title` in thread list UI (truncate if too long)
- Sort by `lastModified` descending
- Show `messageCount` badge
- Format `createdAt` and `lastModified` in local timezone

#### GET `/api/v1/threads/:id`
Get specific thread with messages.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "thread": {
    "id": "thread-123",
    "createdAt": "2025-11-25T10:00:00.000Z",
    "lastModified": "2025-11-25T11:00:00.000Z",
    "messages": [
      {
        "role": "user",
        "content": "Hello",
        "displayContent": "Hello",
        "timestamp": "2025-11-25T10:00:00.000Z",
        "selections": [],
        "images": []
      },
      {
        "role": "assistant",
        "content": "Hi! How can I help?",
        "displayContent": "Hi! How can I help?",
        "timestamp": "2025-11-25T10:00:05.000Z",
        "reasoning": null,
        "anthropicReasoning": null
      },
      {
        "role": "tool",
        "name": "read_file",
        "content": "File contents...",
        "type": "success",
        "timestamp": "2025-11-25T10:00:10.000Z",
        "params": { "uri": "file:///path/to/file.ts" },
        "result": { ... }
      },
      {
        "role": "checkpoint",
        "type": "auto",
        "timestamp": "2025-11-25T10:00:15.000Z"
      }
    ]
  }
}
```

**Message Types:**
- `user` - User messages with optional `selections` (file/code references) and `images`
- `assistant` - AI responses with optional `reasoning` for models with thinking enabled
- `tool` - Tool execution results with `name`, `type` (success/error), `params`, and `result`
- `checkpoint` - Automatic checkpoints for undo/redo functionality (can be filtered out in UI)

**Frontend Handling:**
- Load messages on thread selection
- Render messages with `role` styling
- Display timestamps in relative format (e.g., "2 hours ago")
- Handle `tool` messages for special UI rendering (planning/walkthrough results)
- Filter out `checkpoint` messages or show them as dividers
- Implement infinite scroll or pagination for long threads

#### Tool Message Rendering

Messages with `role: "tool"` contain tool execution results:

```json
{
  "role": "tool",
  "name": "create_plan",
  "type": "success",
  "content": "Plan created successfully",
  "result": {
    // Planning result data
  },
  "params": { ... },
  "timestamp": "2025-11-25T10:00:05.000Z"
}
```

**Special Tool Types:**
- **Planning Results** (`name: "create_plan"`, `"update_task_status"`, etc.):
  - Show collapsible planning UI
  - Display plan summary with markdown rendering
  - Include success/error indicators

- **Walkthrough Results** (`name: "update_walkthrough"`):
  - Show collapsible walkthrough UI
  - Display file preview with markdown rendering
  - Include "Open" button for file access
  - Support markdown preview for `.md` files

**Mobile UI Recommendations:**
- Implement collapsible sections for tool results
- Use markdown rendering for rich text display
- Add file opening functionality for walkthrough results
- Show appropriate icons and status indicators

#### POST `/api/v1/threads`
Create a new thread.

**Request Body:**
```json
{
  "name": "My Thread" // optional
}
```

**Response:**
```json
{
  "thread": {
    "id": "thread-456",
    "createdAt": "2025-11-25T11:30:00.000Z",
    "name": "My Thread"
  }
}
```

**Frontend Handling:**
- Create new thread on user action
- Auto-navigate to new thread
- Show loading state during creation
- Handle errors gracefully

#### POST `/api/v1/threads/:id/messages`
Send a message to a thread.

**Parameters:**
- `id` (path): Thread ID

**Request Body:**
```json
{
  "message": "Write a hello world function"
}
```

**Response:**
```json
{
  "result": {
    "success": true,
    "threadId": "thread-123",
    "messageId": "msg-3"
  }
}
```

**Frontend Handling:**
- Show message immediately in UI (optimistic update)
- Disable input during send
- Handle streaming responses via WebSocket
- Show typing indicator while waiting
- Scroll to bottom on new message

#### DELETE `/api/v1/threads/:id`
Delete a thread.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "success": true
}
```

**Frontend Handling:**
- Show confirmation dialog before deletion
- Remove from UI immediately (optimistic)
- Handle errors with rollback
- Navigate away if currently viewing deleted thread

#### GET `/api/v1/threads/:id/status`
Get agent execution status for a thread.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "status": {
    "threadId": "thread-123",
    "isRunning": true,
    "lastActivity": "2025-11-25T11:30:00.000Z",
    "currentTool": "read_file"
  }
}
```

**Frontend Handling:**
- Show running indicator in thread list
- Display current tool being executed
- Update UI in real-time via WebSocket
- Show stop button when running

#### POST `/api/v1/threads/:id/cancel`
Cancel running agent for a thread.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "success": true
}
```

**Frontend Handling:**
- Show cancel confirmation
- Disable cancel button during request
- Update UI status immediately
- Handle errors gracefully

#### POST `/api/v1/threads/:id/approve`
Approve a pending tool call for a thread. Called when the agent is in `awaiting_user` state.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "success": true
}
```

**Frontend Handling:**
- Show approve button in tool approval UI
- Disable button during request
- Resume typing/processing indicator after approval
- Handle errors gracefully

#### POST `/api/v1/threads/:id/reject`
Reject a pending tool call for a thread. Called when the agent is in `awaiting_user` state.

**Parameters:**
- `id` (path): Thread ID

**Response:**
```json
{
  "success": true
}
```

**Frontend Handling:**
- Show reject button in tool approval UI
- Disable button during request
- Reload thread to get updated state
- Handle errors gracefully

---

### Workspace

#### GET `/api/v1/workspace`
Get workspace information including open files.

**Response:**
```json
{
  "workspace": {
    "folders": [
      {
        "uri": "file:///Users/user/project",
        "name": "project",
        "path": "/Users/user/project"
      }
    ],
    "openFiles": [
      {
        "uri": "file:///Users/user/project/src/index.ts",
        "path": "/Users/user/project/src/index.ts",
        "name": "index.ts"
      },
      {
        "uri": "file:///Users/user/project/src/utils.ts",
        "path": "/Users/user/project/src/utils.ts",
        "name": "utils.ts"
      }
    ],
    "activeFile": {
      "uri": "file:///Users/user/project/src/index.ts",
      "path": "/Users/user/project/src/index.ts",
      "name": "index.ts"
    }
  }
}
```

**Note:** `openFiles` contains all files currently open in the editor tabs, and `activeFile` is the currently focused file (matches desktop UI state).

**Frontend Handling:**
- Display workspace name in header
- Show folder structure in sidebar
- Display open files list (like desktop tabs)
- Highlight active file
- Handle multiple workspace folders
- Parse URI for display

#### GET `/api/v1/workspace/files`
List workspace files (paginated).

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)
- `filter` (optional) - glob pattern

**Response:**
```json
{
  "files": {
    "files": [
      {
        "uri": "file:///Users/user/project/src/index.ts",
        "name": "index.ts",
        "type": "file",
        "size": 1024
      }
    ],
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

**Frontend Handling:**
- Implement pagination controls
- Show file type icons
- Display file sizes
- Support search/filter
- Lazy load more pages

#### GET `/api/v1/workspace/files/tree`
Get workspace directory tree.

**Response:**
```json
{
  "tree": {
    "roots": [
      {
        "uri": "file:///Users/user/project",
        "name": "project",
        "children": [
          {
            "uri": "file:///Users/user/project/src",
            "name": "src",
            "type": "directory",
            "children": [...]
          }
        ]
      }
    ]
  }
}
```

**Frontend Handling:**
- Render as expandable tree view
- Lazy load subdirectories
- Show file type icons
- Support search/filter
- Persist expanded state

#### GET `/api/v1/workspace/files/:path(*)`
Read file contents.

**Parameters:**
- `path` (path): File path (URL encoded)

**Query Parameters:**
- `start_line` (optional): Start line number (1-based)
- `end_line` (optional): End line number (inclusive)
- `page_number` (optional): For paginated large files

**Response:**
```json
{
  "content": {
    "path": "file:///Users/user/project/src/index.ts",
    "content": "console.log('Hello');",
    "size": 21,
    "lineCount": 1,
    "hasNextPage": false
  }
}
```

**Frontend Handling:**
- Syntax highlight based on file extension
- Show line numbers
- Handle large files with pagination
- Implement "Load more" for truncated files
- Support read-only editor view

#### GET `/api/v1/workspace/files/:path(*)/outline`
Get file outline/structure.

**Parameters:**
- `path` (path): File path (URL encoded)

**Response:**
```json
{
  "outline": {
    "path": "file:///Users/user/project/src/index.ts",
    "outline": [
      {
        "type": "function",
        "name": "main",
        "line": 1,
        "signature": "function main(): void"
      }
    ]
  }
}
```

**Frontend Handling:**
- Show in file sidebar
- Click to jump to location
- Display with appropriate icons
- Support nested structures

#### POST `/api/v1/workspace/search`
Search workspace files.

**Request Body:**
```json
{
  "query": "function",
  "type": "content", // or "filename"
  "includePattern": "**/*.ts",
  "excludePattern": "**/node_modules/**"
}
```

**Response:**
```json
{
  "results": {
    "query": "function",
    "type": "content",
    "results": [
      {
        "uri": "file:///Users/user/project/src/index.ts",
        "line": 1,
        "column": 1,
        "match": "function",
        "context": "function main() {"
      }
    ]
  }
}
```

**Frontend Handling:**
- Show search results with highlighting
- Group by file
- Display line numbers
- Click to open file at location
- Support advanced search options

#### GET `/api/v1/workspace/diagnostics`
Get workspace diagnostics (errors, warnings).

**Response:**
```json
{
  "diagnostics": {
    "diagnostics": [
      {
        "uri": "file:///Users/user/project/src/index.ts",
        "severity": "error",
        "message": "Cannot find name 'foo'",
        "line": 5,
        "column": 10
      }
    ]
  }
}
```

**Frontend Handling:**
- Show error/warning badges in file tree
- Display diagnostics panel
- Click to jump to location
- Filter by severity
- Real-time updates via WebSocket

---

### Planning

#### GET `/api/v1/planning/current`
Get current plan.

**Response:**
```json
{
  "plan": {
    "id": "plan-123",
    "goal": "Implement user authentication",
    "createdAt": "2025-11-25T10:00:00.000Z",
    "tasks": [
      {
        "id": "task-1",
        "description": "Create login form",
        "status": "pending",
        "dependencies": []
      }
    ]
  }
}
```

**Frontend Handling:**
- Display in planning view
- Show task status with colors
- Allow status updates
- Visualize dependencies

#### POST `/api/v1/planning/create`
Create a new plan.

**Request Body:**
```json
{
  "goal": "Implement user authentication",
  "tasks": [
    {
      "description": "Create login form",
      "dependencies": []
    }
  ]
}
```

**Response:**
```json
{
  "plan": {
    "id": "plan-456",
    "goal": "Implement user authentication",
    "createdAt": "2025-11-25T11:30:00.000Z"
  }
}
```

**Frontend Handling:**
- Show creation form
- Validate input
- Handle errors
- Navigate to new plan

#### PATCH `/api/v1/planning/tasks/:id`
Update task status.

**Parameters:**
- `id` (path): Task ID

**Request Body:**
```json
{
  "status": "completed",
  "notes": "Task finished successfully"
}
```

**Response:**
```json
{
  "task": {
    "id": "task-1",
    "status": "completed",
    "notes": "Task finished successfully"
  }
}
```

**Frontend Handling:**
- Allow inline status updates
- Show status dropdown
- Add notes field
- Update UI optimistically

---

### Settings

#### GET `/api/v1/settings`
Get A-Coder settings (read-only).

**Response:**
```json
{
  "settings": {
    "globalSettings": {
      "apiEnabled": true,
      "apiPort": 3737,
      "theme": "dark"
    },
    "modelSelectionOfFeature": {
      "chat": {
        "providerName": "openrouter",
        "modelName": "anthropic/claude-3.5-sonnet"
      }
    }
  }
}
```

**Frontend Handling:**
- Display in settings view
- Show read-only indicator
- Format for display
- Group by category

#### GET `/api/v1/settings/models`
Get available models (read-only).

**Response:**
```json
{
  "models": {
    "models": [
      {
        "name": "anthropic/claude-3.5-sonnet (openRouter)",
        "selection": {
          "providerName": "openRouter",
          "modelName": "anthropic/claude-3.5-sonnet"
        }
      }
    ]
  }
}
```

**Frontend Handling:**
- Show in model selector
- Group by provider
- Display model capabilities
- Filter by availability

#### GET `/api/v1/settings/model`
Get current model selection.

**Response:**
```json
{
  "model": {
    "providerName": "openRouter",
    "modelName": "anthropic/claude-3.5-sonnet",
    "available": true
  }
}
```

**Frontend Handling:**
- Display current model in header/status bar
- Show provider and model name
- Indicate if model is available

#### PUT `/api/v1/settings/model`
Set current model selection.

**Request Body:**
```json
{
  "providerName": "openRouter",
  "modelName": "anthropic/claude-3.5-sonnet"
}
```

**Response:**
```json
{
  "success": true,
  "model": {
    "providerName": "openRouter",
    "modelName": "anthropic/claude-3.5-sonnet",
    "success": true
  }
}
```

**Frontend Handling:**
- Show model picker dropdown
- Update UI immediately on selection
- Handle errors (invalid model, provider not configured)
- Sync with desktop app via WebSocket

#### GET `/api/v1/settings/mode`
Get current chat mode.

**Response:**
```json
{
  "mode": {
    "mode": "agent",
    "displayName": "Code",
    "description": "Edit files & run commands",
    "availableModes": [
      { "mode": "normal", "displayName": "Chat", "description": "Conversation only, no tools" },
      { "mode": "gather", "displayName": "Plan", "description": "Research, plan & document" },
      { "mode": "agent", "displayName": "Code", "description": "Edit files & run commands" }
    ]
  }
}
```

**Mode Descriptions:**
- **Chat** (`normal`): Pure conversation mode, no tool access
- **Plan** (`gather`): Research, create implementation plans, document findings (read-only tools)
- **Code** (`agent`): Full execution mode - edit files, run commands, execute tasks

**Frontend Handling:**
- Display current mode in header/toolbar
- Show mode selector with descriptions
- Update UI based on mode capabilities

#### PUT `/api/v1/settings/mode`
Set chat mode.

**Request Body:**
```json
{
  "mode": "agent"
}
```

**Valid modes:** `normal`, `gather`, `agent`

**Response:**
```json
{
  "success": true,
  "mode": {
    "mode": "agent",
    "displayName": "Code",
    "description": "Edit files & run commands",
    "success": true
  }
}
```

**Frontend Handling:**
- Show mode picker (Chat/Plan/Code)
- Update UI immediately on selection
- Show confirmation for mode changes during active tasks
- Sync with desktop app via WebSocket

---

## Frontend Implementation Guide

### Error Handling

All API errors follow this format:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing token",
    "details": {...}
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

**Frontend Error Handling:**
```typescript
class ACoderAPI {
  private async handleResponse(response: Response) {
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Redirect to login or show token input
        throw new AuthError(data.error?.message || 'Unauthorized');
      }
      if (response.status === 404) {
        throw new NotFoundError(data.error?.message || 'Not found');
      }
      throw new APIError(data.error?.message || 'API error');
    }

    return data;
  }
}
```

### Rate Limiting

- **No explicit rate limiting** currently implemented
- **Recommended**: Implement client-side rate limiting
- **Suggested limits**:
  - 60 requests/minute per token
  - 1 request/second for streaming endpoints

### Retry Strategy

Implement exponential backoff for failed requests:

```typescript
async requestWithRetry(
  method: string,
  path: string,
  body?: any,
  retries = 3
) {
  for (let i = 0; i < retries; i++) {
    try {
      return await this.request(method, path, body);
    } catch (error) {
      if (i === retries - 1) throw error;

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
}
```

### WebSocket Implementation

#### Connection
```typescript
class ACoderWebSocket {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(baseUrl: string, token: string) {
    const wsUrl = `${baseUrl.replace('http', 'ws')}?token=${token}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;

      // Subscribe to events
      this.send({
        type: 'subscribe',
        channels: ['threads', 'workspace', 'planning']
      });
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleEvent(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnecting... (${this.reconnectAttempts})`);
        this.connect(this.baseUrl, this.token);
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    }
  }
}
```

#### Event Handling
```typescript
private handleEvent(event: any) {
  switch (event.channel) {
    case 'threads':
      this.handleThreadEvent(event);
      break;
    case 'workspace':
      this.handleWorkspaceEvent(event);
      break;
    case 'planning':
      this.handlePlanningEvent(event);
      break;
  }
}

private handleThreadEvent(event: any) {
  switch (event.event) {
    case 'message_added':
      // Update thread with new message
      break;
    case 'thread_status_changed':
      // Update running indicator
      break;
    case 'thread_deleted':
      // Remove from UI
      break;
  }
}
```

### Mobile App Considerations

#### React Native
```typescript
// Use fetch for HTTP requests
import { fetch } from 'react-native';

// Use WebSocket API
import { WebSocket } from 'react-native';

// Handle background tasks
import { BackgroundTask } from 'react-native-background-task';

// Store tokens securely
import { SecureStorage } from 'react-native-secure-storage';
```

#### Flutter
```dart
// HTTP requests with http package
import 'package:http/http.dart' as http;

// WebSocket with web_socket_channel
import 'package:web_socket_channel/web_socket_channel.dart';

// Secure storage with flutter_secure_storage
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
```

#### Offline Support
- Cache thread data locally
- Queue messages when offline
- Sync when connection restored
- Use SQLite or similar for storage

#### Push Notifications
- Use WebSocket for real-time updates
- Implement push notifications for mobile
- Show notifications for new messages
- Handle notification taps to open app

### Mobile UI Implementation

#### Collapsible Tool Results

Mobile apps should implement collapsible UI components for tool results to match desktop functionality:

**Planning Results UI:**
```typescript
// React Native example
const PlanningResult = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Icon name={isExpanded ? "chevron-down" : "chevron-right"} />
        <Text style={styles.title}>{getToolTitle(message.name)}</Text>
        {message.type === 'success' && (
          <View style={styles.successBadge}>
            <Text style={styles.successText}>Success</Text>
          </View>
        )}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <Markdown>{message.result?.summary || ''}</Markdown>
        </View>
      )}
    </View>
  );
};
```

**Walkthrough Results UI:**
```typescript
// React Native example
const WalkthroughResult = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const isMarkdown = message.result?.filePath?.endsWith('.md');

  const handleOpen = () => {
    if (isMarkdown) {
      // Open in markdown preview
      Linking.openURL(`vscode://file/${message.result.filePath}`);
    } else {
      // Open in regular editor
      Linking.openURL(`vscode://file/${message.result.filePath}`);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Icon name={isExpanded ? "chevron-down" : "chevron-right"} />
        <View style={styles.headerContent}>
          <Text style={styles.title}>Walkthrough {message.result?.action}</Text>
          <Text style={styles.filePath} numberOfLines={1}>
            {message.result?.filePath}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.openButton}
          onPress={handleOpen}
        >
          <Icon name="open" />
          <Text>Open</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <Markdown>{message.result?.preview || ''}</Markdown>
        </View>
      )}
    </View>
  );
};
```

#### Markdown Rendering

Use markdown libraries for rich text display:

**React Native:**
```typescript
import { Markdown } from 'react-native-markdown';

<Markdown style={markdownStyles}>
  {message.result?.summary || message.result?.preview}
</Markdown>
```

**Flutter:**
```dart
import 'package:flutter_markdown/flutter_markdown.dart';

Markdown(
  data: message.result['summary'] ?? message.result['preview'],
  styleSheet: markdownStyles,
)
```

#### File Opening

Implement file opening with platform-specific handlers:

**React Native:**
```typescript
import { Linking } from 'react-native';

const openFile = async (filePath: string) => {
  try {
    // Use VS Code URI scheme for desktop integration
    await Linking.openURL(`vscode://file/${filePath}`);
  } catch (error) {
    console.error('Failed to open file:', error);
  }
};
```

**Flutter:**
```dart
import 'package:url_launcher/url_launcher.dart';

Future<void> openFile(String filePath) async {
  final uri = 'vscode://file/$filePath';
  if (await canLaunch(uri)) {
    await launch(uri);
  } else {
    throw 'Could not launch $uri';
  }
}
```

#### Responsive Design

- Use flexible layouts for different screen sizes
- Implement text truncation for long file paths
- Add touch-friendly interaction areas
- Support both light and dark themes

### Security Best Practices

1. **Token Storage**:
   - iOS: Keychain
   - Android: Keystore
   - Web: HttpOnly cookies or secure localStorage

2. **HTTPS in Production**:
   - Always use HTTPS in production
   - Implement certificate pinning
   - Validate SSL certificates

3. **Token Management**:
   - Rotate tokens periodically
   - Implement token refresh
   - Revoke tokens on logout
   - Store tokens securely

4. **Input Validation**:
   - Sanitize all inputs
   - Validate message length
   - Escape HTML in chat messages
   - Validate file paths

### Testing

#### Unit Tests
```typescript
describe('ACoderAPI', () => {
  it('should create thread', async () => {
    const api = new ACoderAPI('http://localhost:3737', 'test-token');
    const result = await api.createThread('Test Thread');
    expect(result.thread.name).toBe('Test Thread');
  });
});
```

#### Integration Tests
```typescript
describe('API Integration', () => {
  it('should send and receive messages', async () => {
    // Create thread
    const { thread } = await api.createThread();

    // Send message
    await api.sendMessage(thread.id, 'Hello');

    // Wait for response via WebSocket
    const response = await waitForMessage(thread.id);
    expect(response.role).toBe('assistant');
  });
});
```

### Performance Optimization

1. **Request Batching**:
   - Batch multiple file reads
   - Combine related requests
   - Use GraphQL if needed

2. **Caching**:
   - Cache thread lists
   - Cache file contents
   - Implement ETags

3. **Lazy Loading**:
   - Load messages on demand
   - Lazy load file tree
   - Paginate large lists

4. **Compression**:
   - Enable gzip compression
   - Use binary formats if needed
   - Optimize payload size

---

## WebSocket API

### Connection

Connect to WebSocket server with authentication:

```javascript
const ws = new WebSocket('ws://localhost:3737?token=acoder_YOUR_TOKEN');
```

### Events

Subscribe to events:

```javascript
ws.onopen = () => {
  // Subscribe to channels
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['threads', 'workspace', 'planning']
  }));
};
```

### Event Format

Events are broadcast in the following format:

```json
{
  "type": "event",
  "channel": "threads",
  "event": "message_added",
  "data": {
    // Event-specific data
  }
}
```

### Available Channels

- `chat` - Chat streaming and thread updates
- `workspace` - File system changes
- `planning` - Plan and task updates

### Streaming Events

The WebSocket API now broadcasts real-time streaming events for chat interactions:

#### `stream_state_changed` Event

Broadcast when the LLM streaming state changes (tokens being generated, tool execution, etc.):

```json
{
  "type": "stream_update",
  "channel": "chat",
  "event": "stream_state_changed",
  "data": {
    "threadId": "thread-uuid",
    "isRunning": "LLM",
    "content": "Here's how to implement...",
    "reasoning": "Let me think about this...",
    "toolCall": {
      "name": "read_file",
      "arguments": "{\"path\": \"src/app.ts\"}"
    },
    "toolInfo": null,
    "error": null,
    "tokenUsage": {
      "used": 1500,
      "total": 8000,
      "percentage": 18.75
    }
  }
}
```

**`isRunning` values:**
- `"LLM"` - LLM is generating tokens
- `"tool"` - A tool is being executed
- `"awaiting_user"` - Waiting for user approval
- `"idle"` - Between operations
- `undefined` - Not running

**Fields:**
- `content` - Accumulated display content from LLM (null if not streaming)
- `reasoning` - Accumulated reasoning/thinking content (null if not available)
- `toolCall` - Current tool call being streamed (null if none)
- `toolInfo` - Info about tool being executed (null if not executing tool)
- `error` - Error information if an error occurred (null otherwise)
- `tokenUsage` - Current token usage stats (null if not available)

#### `message_added` Event

Broadcast when a new message is added to a thread:

```json
{
  "type": "thread_update",
  "channel": "chat",
  "event": "message_added",
  "data": {
    "threadId": "thread-uuid",
    "messageCount": 5,
    "lastMessage": {
      "role": "assistant",
      "content": "Here's the implementation...",
      "reasoning": "I analyzed the codebase..."
    },
    "lastModified": "2024-01-15T10:30:00Z"
  }
}
```

**`lastMessage.role` values:**
- `"user"` - User message (includes `content`)
- `"assistant"` - LLM response (includes `content`, `reasoning`)
- `"tool"` - Tool result (includes `name`, `type`, `content`)

### Example: Real-time Chat Streaming

```javascript
const ws = new WebSocket('ws://localhost:3737?token=acoder_YOUR_TOKEN');

let currentContent = '';

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'stream_update' && data.event === 'stream_state_changed') {
    const { isRunning, content, toolInfo, error } = data.data;

    if (isRunning === 'LLM' && content) {
      // Update UI with streaming content
      currentContent = content;
      updateChatUI(currentContent);
    }

    if (isRunning === 'tool' && toolInfo) {
      // Show tool execution indicator
      showToolIndicator(toolInfo.toolName);
    }

    if (!isRunning) {
      // Streaming complete
      hideLoadingIndicator();
    }

    if (error) {
      // Handle error
      showError(error.message);
    }
  }

  if (data.type === 'thread_update' && data.event === 'message_added') {
    // New message added - refresh thread
    refreshThread(data.data.threadId);
  }
};

// Send a message via REST API
fetch('http://localhost:3737/api/v1/threads/thread-id/messages', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer acoder_YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: 'Create a React component' })
});
// Then receive streaming updates via WebSocket
```

---

## Configuration

### Settings

Mobile API settings are stored in global settings:

```typescript
{
  apiEnabled: boolean;        // Default: false
  apiPort: number;            // Default: 3737
  apiTokens: string[];        // Array of valid tokens
  apiTunnelUrl?: string;      // Optional Cloudflare Tunnel URL
}
```

### Settings UI

Access via: **Settings → Mobile API**

Features:
- Enable/disable toggle
- Port configuration
- Token generation and management
- Cloudflare Tunnel URL input
- Connection information display
- Status indicator

---

## Cloudflare Tunnel Setup

For secure remote access, use Cloudflare Tunnel:

### 1. Install Cloudflare Tunnel

```bash
brew install cloudflared
```

### 2. Login

```bash
cloudflared tunnel login
```

### 3. Create Tunnel

```bash
cloudflared tunnel create acoder-api
```

### 4. Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: acoder-api
credentials-file: /Users/YOU/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: acoder-api.yourdomain.com
    service: http://localhost:3737
  - service: http_status:404
```

### 5. Run Tunnel

```bash
cloudflared tunnel run acoder-api
```

### 6. Configure in A-Coder

1. Go to Settings → Mobile API
2. Enter tunnel URL: `https://acoder-api.yourdomain.com`
3. Use this URL for remote connections

---

## Usage Examples

### cURL Examples

#### Health Check
```bash
curl http://localhost:3737/api/v1/health
```

#### List Threads
```bash
curl -H "Authorization: Bearer acoder_YOUR_TOKEN" \
  http://localhost:3737/api/v1/threads
```

#### Create Thread
```bash
curl -X POST \
  -H "Authorization: Bearer acoder_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Thread"}' \
  http://localhost:3737/api/v1/threads
```

#### Send Message
```bash
curl -X POST \
  -H "Authorization: Bearer acoder_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a hello world function"}' \
  http://localhost:3737/api/v1/threads/THREAD_ID/messages
```

### JavaScript/TypeScript Example

```typescript
// API Client
class ACoderAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request(method: string, path: string, body?: any) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getThreads() {
    return this.request('GET', '/api/v1/threads');
  }

  async createThread(name?: string) {
    return this.request('POST', '/api/v1/threads', { name });
  }

  async sendMessage(threadId: string, message: string) {
    return this.request('POST', `/api/v1/threads/${threadId}/messages`, { message });
  }

  connectWebSocket() {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}?token=${this.token}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['threads', 'workspace']
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Event:', data);
    };

    return ws;
  }
}

// Usage
const api = new ACoderAPI('http://localhost:3737', 'acoder_YOUR_TOKEN');

// Create thread and send message
const { thread } = await api.createThread('My Project');
await api.sendMessage(thread.id, 'Create a React component');

// Connect to WebSocket
const ws = api.connectWebSocket();
```

---

## Implementation Details

### File Structure

```
src/vs/workbench/contrib/void/
├── common/
│   ├── apiAuthService.ts          # Token management
│   └── voidSettingsTypes.ts       # Settings types (modified)
├── browser/
│   ├── apiServiceBridge.ts        # Service integration
│   └── void.contribution.ts       # Service registration (modified)
└── electron-main/
    ├── apiServer.ts               # HTTP/WebSocket server
    ├── apiChannel.ts              # IPC bridge
    ├── apiServiceManager.ts       # Lifecycle management
    ├── mainProcessApiIntegration.ts # Main process integration
    ├── ws.d.ts                    # WebSocket type declarations
    └── api/
        ├── apiRouter.ts           # Request routing
        └── apiRoutes.ts           # Route handlers
```

### Service Integration

The API integrates with existing A-Coder services:

- **IChatThreadService**: Thread and message management
- **IToolsService**: Planning service access
- **IVoidSettingsService**: Settings access
- **IFileService**: File operations
- **IWorkspaceContextService**: Workspace information

### IPC Communication

1. **Server Control (Renderer → Main)**:
   - `ApiServiceBridge` monitors settings changes
   - Sends `startApiServer` / `stopApiServer` commands via IPC
   - Main process receives commands and manages `ApiServer` lifecycle

2. **API Requests (Main → Renderer)**:
   - HTTP request arrives at API server (main process)
   - Route handler calls `callRenderer(method, params)`
   - Request forwarded via `ApiChannel` (IPC)
   - `ApiServiceBridge` receives request (renderer process)
   - Bridge calls appropriate service method
   - Result returned via IPC
   - Response sent to HTTP client

---

## Future Enhancements

### Planned Features

- [ ] Rate limiting (100 req/min per token)
- [ ] Request size limits
- [ ] Token expiration
- [ ] Audit logging
- [ ] WebSocket subscription filtering
- [ ] File upload/download endpoints
- [ ] Batch operations
- [ ] GraphQL API option

### Mobile App Ideas

- iOS/Android companion app
- Watch app for notifications
- iPad app with split-view coding
- Voice control integration
- Remote debugging tools

---

## Troubleshooting

### API Not Starting

1. Check if API is enabled in settings
2. Verify port 3737 is not in use
3. Check console logs for errors
4. Restart A-Coder

### Authentication Failures

1. Verify token is correct
2. Check `Authorization` header format
3. Ensure token hasn't been revoked
4. Generate new token if needed

### Connection Issues

1. Verify A-Coder is running
2. Check firewall settings
3. Ensure localhost access is allowed
4. Test with `curl http://localhost:3737/api/v1/health`

### Cloudflare Tunnel Issues

1. Verify tunnel is running
2. Check tunnel configuration
3. Ensure DNS is configured
4. Test tunnel URL directly

---

## Support

For issues, questions, or feature requests:

- GitHub Issues: [A-Coder Repository](https://github.com/yourusername/a-coder)
- Documentation: This file
- Walkthrough: See `walkthrough.md` in artifacts directory

---

## License

Mobile API implementation is part of A-Coder and follows the same license as the main project.
