# A-Coder Provider API Specification

## Overview

The A-Coder Provider API is a backend service that proxies LLM requests to chutes.ai using a master API key. The desktop app authenticates users via OAuth (Google/GitHub) and receives a session token, which is used to authenticate requests to this API.

**Key Security Principles:**
- The master chutes.ai API key is stored server-side and never exposed to clients
- OAuth 2.0 with PKCE is required for all authentication flows
- Session tokens are short-lived and can be refreshed
- Rate limiting is enforced per authenticated user

## Base URL

```
https://api.a-coder.dev/v1
```

## Authentication

All API requests (except OAuth endpoints) require a Bearer token in the Authorization header:

```
Authorization: Bearer <session_token>
```

## Endpoints

### 1. OAuth - Google Authentication

**Endpoint:** `GET /auth/google`

Initiates OAuth flow with Google. The API handles the OAuth flow and returns an authorization code to the client.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `redirect_uri` | string | Yes | Loopback callback URL (e.g., `http://127.0.0.1:54321/callback`) |
| `code_challenge` | string | Yes | PKCE code challenge (SHA-256) |
| `code_challenge_method` | string | Yes | Must be `S256` |
| `state` | string | Yes | Random string for CSRF protection |

**Response:** Redirects to Google OAuth consent page

---

### 2. OAuth - GitHub Authentication

**Endpoint:** `GET /auth/github`

Initiates OAuth flow with GitHub. The API handles the OAuth flow and returns an authorization code to the client.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `redirect_uri` | string | Yes | Loopback callback URL |
| `code_challenge` | string | Yes | PKCE code challenge (SHA-256) |
| `code_challenge_method` | string | Yes | Must be `S256` |
| `state` | string | Yes | Random string for CSRF protection |

**Response:** Redirects to GitHub OAuth consent page

---

### 3. OAuth - Token Exchange

**Endpoint:** `POST /auth/exchange`

Exchanges the OAuth authorization code for session and refresh tokens.

**Request Body:**

```json
{
  "code": "authorization_code_from_provider",
  "codeVerifier": "pkce_code_verifier",
  "state": "csrf_state_string"
}
```

**Response (200 OK):**

```json
{
  "sessionToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "userEmail": "user@example.com",
  "userId": "usr_abc123xyz"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sessionToken` | string | JWT token for API requests |
| `refreshToken` | string | Token for refreshing session |
| `expiresIn` | number | Session token expiry time in seconds |
| `userEmail` | string | User's email from OAuth |
| `userId` | string | Unique user ID |

**Error Response (400 Bad Request):**

```json
{
  "error": "invalid_code",
  "message": "The authorization code is invalid or expired"
}
```

---

### 4. OAuth - Token Refresh

**Endpoint:** `POST /auth/refresh`

Refreshes an expired session token using a refresh token.

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200 OK):**

```json
{
  "sessionToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

**Error Response (401 Unauthorized):**

```json
{
  "error": "invalid_refresh_token",
  "message": "Refresh token is invalid or expired"
}
```

---

### 5. OAuth - Revoke Token

**Endpoint:** `POST /auth/revoke`

Revokes the current session token (called on sign out).

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Token revoked successfully"
}
```

---

### 6. Models - List Available Models

**Endpoint:** `GET /models`

Returns the list of available models for the authenticated user.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response (200 OK):**

```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "name": "Claude Sonnet 4",
      "contextLength": 200000,
      "supportsTools": true,
      "isHidden": false
    },
    {
      "id": "claude-opus-4-20250514",
      "name": "Claude Opus 4",
      "contextLength": 200000,
      "supportsTools": true,
      "isHidden": false
    },
    {
      "id": "claude-haiku-4-20250514",
      "name": "Claude Haiku 4",
      "contextLength": 200000,
      "supportsTools": true,
      "isHidden": false
    }
  ]
}
```

**Model Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique model identifier |
| `name` | string | Display name |
| `contextLength` | number | Maximum context window in tokens |
| `supportsTools` | boolean | Whether model supports function calling |
| `isHidden` | boolean | Whether to hide from UI (beta/deprecated models) |

---

### 7. Chat Completions

**Endpoint:** `POST /chat/completions`

OpenAI-compatible chat completions endpoint. Proxies to chutes.ai with master API key.

**Headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "my_function",
        "description": "My function description",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    }
  ]
}
```

**Response (200 OK, non-streaming):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699012345,
  "model": "claude-sonnet-4-20250514",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I'm doing well, thank you for asking!"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

**Response (200 OK, streaming):**

```
data: {"id":"chatcmpl-abc123","choices":[{"delta":{"content":"I'm"}}...]}
data: {"id":"chatcmpl-abc123","choices":[{"delta":{"content":" doing"}}...]}
data: [DONE]
```

---

### 8. Rate Limiting

**Endpoint:** `GET /rate-limit`

Returns current rate limit status for the authenticated user.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response (200 OK):**

```json
{
  "limit": 10000,
  "remaining": 7500,
  "reset": 1699084800,
  "resetDate": "2023-11-04T00:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `limit` | number | Total requests allowed per day |
| `remaining` | number | Requests remaining today |
| `reset` | number | Unix timestamp when limits reset |
| `resetDate` | string | ISO date when limits reset |

---

## Security Considerations

### PKCE Implementation

The API MUST:
1. Validate `code_challenge_method` is `S256`
2. Verify the `code_verifier` hashes to match the `code_challenge` from the initial request
3. Reject requests without a `code_challenge` (prevents PKCE downgrade attacks)

### CSRF Protection

The API MUST:
1. Validate the `state` parameter matches between `/auth/google`/`/auth/github` and `/auth/exchange`
2. Use cryptographically secure random values for state (at least 128 bits)

### Token Security

| Token Type | Lifetime | Storage | Rotation |
|------------|----------|---------|----------|
| Session Token | 1 hour | Client memory | Auto via refresh |
| Refresh Token | 30 days | Encrypted (safeStorage) | Yes, rotation recommended |

### Rate Limiting

Rate limiting MUST be enforced per:
- User ID (from OAuth)
- IP address (as fallback)
- Time window (daily, hourly, per-minute)

Recommended limits for free tier:
- 10,000 requests/day per user
- 1,000 requests/hour
- 10 requests/minute

---

## Error Codes

| Code | Description |
|------|-------------|
| `invalid_request` | Malformed request |
| `invalid_code` | OAuth authorization code invalid/expired |
| `invalid_refresh_token` | Refresh token invalid/expired |
| `invalid_state` | CSRF state mismatch |
| `unauthorized` | Missing or invalid session token |
| `forbidden` | User lacks permission |
| `rate_limit_exceeded` | Daily rate limit exceeded |
| `model_not_found` | Requested model not available |
| `internal_error` | Server error |

**Error Response Format:**

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {}
}
```

---

## Environment Variables (Backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `CHUTES_API_KEY` | Yes | Master API key for chutes.ai |
| `CHUTES_API_URL` | No | Override default chutes.ai URL |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth client secret |
| `JWT_SECRET` | Yes | Secret for signing session tokens |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string (rate limiting) |

---

## Deployment Checklist

- [ ] Register OAuth apps with Google Cloud Console
  - [ ] Set redirect URIs to your domain (wildcard not allowed)
  - [ ] Enable Google+ API or People API for email access

- [ ] Register OAuth app with GitHub
  - [ ] Set Authorization callback URL
  - [ ] Request `user:email` scope

- [ ] Set up PostgreSQL database
  - [ ] Users table (id, email, auth_provider, auth_provider_id)
  - [ ] Sessions table (session_token, refresh_token, user_id, expires_at)
  - [ ] Rate limits table (user_id, limit, remaining, reset_at)

- [ ] Set up Redis for rate limiting

- [ ] Configure CORS headers for desktop app origin

- [ ] Set up monitoring and logging
  - [ ] Track authentication events
  - [ ] Monitor API usage per user
  - [ ] Alert on error rates

---

## Testing

Use the following curl commands to test the API:

```bash
# Test models endpoint (requires valid session token)
curl -X GET "https://api.a-coder.dev/v1/models" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test chat completions
curl -X POST "https://api.a-coder.dev/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# Test rate limit
curl -X GET "https://api.a-coder.dev/v1/rate-limit" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```