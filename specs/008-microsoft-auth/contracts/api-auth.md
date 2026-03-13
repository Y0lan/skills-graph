# API Contract: Authentication Endpoints

**Feature**: 008-microsoft-auth | **Date**: 2026-03-12

## Overview

New REST endpoints for authentication and user management. All existing endpoints remain unchanged but some gain auth middleware.

---

## New Endpoints

### POST /api/auth/me

Validate token and return/create the current user. Called by the frontend after MSAL login to link the Microsoft account.

**Auth**: Required (Bearer token)

**Request**: No body. Token carries all identity info.

**Response 200** (user exists and is linked to roster):
```json
{
  "oid": "5d3fb924-7aca-49f2-9593-045957369950",
  "slug": "bethlehem-mengistu",
  "email": "bethlehem.mengistu@sinapse.nc",
  "displayName": "Bethlehem MENGISTU",
  "role": "member",
  "avatarUrl": "/api/users/bethlehem-mengistu/avatar",
  "lastLoginAt": "2026-03-12T10:30:00.000Z"
}
```

**Response 200** (user authenticated but not linked to roster):
```json
{
  "oid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "slug": null,
  "email": "manager@sinapse.nc",
  "displayName": "Some Manager",
  "role": "member",
  "avatarUrl": null,
  "lastLoginAt": "2026-03-12T10:30:00.000Z"
}
```

**Response 401**: Invalid or missing token
```json
{ "error": "Invalid token" }
```

**Behavior**:
1. Validate JWT (signature, aud, iss, tid, exp)
2. Extract `oid`, `preferred_username`, `name` from claims
3. Upsert user row by `microsoft_oid`
4. On first login: match email to `KNOWN_MAPPINGS`, set `slug` if found
5. Update `display_name`, `email`, `last_login_at`
6. Return user object

---

### GET /api/users/:slug/avatar

Serve the cached avatar image for a team member.

**Auth**: None (public — avatars shown on dashboard for guests)

**Response 200**: Binary JPEG
```
Content-Type: image/jpeg
Cache-Control: public, max-age=86400
```

**Response 404**: No avatar available (user has no photo in Microsoft 365)

---

## Modified Endpoints (Auth Added)

### PUT /api/ratings/:slug

**Change**: Add `requireAuth()` middleware. Verify that `req.user.slug === req.params.slug` (members can only edit their own ratings).

**Response 403** (slug mismatch):
```json
{ "error": "You can only edit your own ratings" }
```

### DELETE /api/ratings/:slug

**Change**: Add `requireAuth()` middleware. Same slug ownership check.

---

## Unchanged Endpoints (Public)

These remain accessible without authentication (GUEST access):

- `GET /api/ratings` — list all ratings
- `GET /api/ratings/:slug` — get one member's ratings
- `GET /api/categories` — skill categories
- `GET /api/members` — team roster
- `GET /api/aggregates` — team aggregates
- `GET /api/aggregates/:slug` — member aggregate
- `GET /api/catalog` — full skill catalog

---

## Auth Middleware

### `requireAuth()`

Express middleware that validates the Bearer token from the `Authorization` header.

**Header**: `Authorization: Bearer <access_token>`

**Token source**: MSAL `acquireTokenSilent({ scopes: ["api://{client-id}/access_as_user"] })`

**Validation**:
1. Extract Bearer token from header
2. Verify JWT signature against Microsoft JWKS
3. Validate claims: `aud`, `iss`, `tid`, `exp`, `nbf`
4. Attach decoded payload to `req.user`

**Error responses**:
- Missing/malformed header → 401
- Invalid/expired token → 401
- Wrong tenant → 403

### `requireOwnership()`

Express middleware (after `requireAuth`) that checks `req.user.slug === req.params.slug`.

**Error response**: Slug mismatch → 403

---

## Frontend Token Scopes

| Action | Scope | Token Audience |
|--------|-------|----------------|
| Login (OIDC) | `openid profile email` | Microsoft |
| Graph API (profile/photo) | `User.Read` | `https://graph.microsoft.com` |
| Backend API (ratings CRUD) | `api://{client-id}/access_as_user` | Our Express API |
