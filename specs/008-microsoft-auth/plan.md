# Implementation Plan: Authentification Microsoft 365

**Branch**: `008-microsoft-auth` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-microsoft-auth/spec.md`

## Summary

Add Microsoft Entra ID (Azure AD) authentication to the app with two access levels: GUEST (view dashboard only) and MEMBER (view dashboard + edit own form). Uses MSAL.js v5 for frontend SPA auth (PKCE redirect flow), `jose` for backend JWT validation, and a new `users` SQLite table to link Microsoft accounts to roster members. Retrieves avatars and profile info from Microsoft Graph API.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend + backend)
**Primary Dependencies**: @azure/msal-browser ^5.4.0, @azure/msal-react ^5.0.6 (frontend); jose ^6.2.1 (backend)
**Storage**: SQLite (better-sqlite3) — new `users` table, existing `evaluations` table unchanged
**Testing**: Manual testing (existing pattern) + smoke test checklist in quickstart.md
**Target Platform**: Web (Vite 7 SPA + Express 5 backend), desktop-first
**Project Type**: Web application (SPA + API)
**Performance Goals**: Token validation <10ms (jose JWKS cached in-memory), avatar serving <5ms (SQLite BLOB)
**Constraints**: Single-tenant Entra ID, @sinapse.nc domain only, 10-11 users, PKCE flow (no client secret)
**Scale/Scope**: 10-11 team members, ~3 new API endpoints, ~6 new/modified files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. UX & Modernite | PASS | Login/logout UX is minimal, non-intrusive. Dashboard remains accessible without friction |
| II. Design System | PASS | Login button uses shadcn Button. Avatar uses shadcn Avatar with initials fallback |
| III. Theme Light/Dark | PASS | Auth UI components inherit theme. No new color tokens needed |
| IV. Accessibilite (AA+) | PASS | Login button is keyboard-accessible. Avatar has alt text. Auth errors displayed clearly |
| V. Formulaires | PASS | No new forms added. Existing form access controlled by auth |
| VI. Wizard/Stepper | N/A | No wizard changes |
| VII. Dashboard Radar | PASS | Dashboard remains public. Avatars enhance member cards |
| VIII. Code & Architecture | PASS | Auth isolated in `src/auth/` and `server/middleware/`. No logic dispersal |
| IX. Qualite & Robustesse | PASS | JWT validation is stateless, cached. MSAL handles token lifecycle. Error handling with event listeners |
| **Tech Constraints** | **VIOLATION** | "Auth: Interne uniquement (SSO hors scope)" — SSO is explicitly requested by user |

### Constitution Amendment Required

The Tech Constraints section states "Auth: Interne uniquement (SSO hors scope)". This feature deliberately introduces SSO. The constitution must be amended before implementation:

**Change**: Replace `Auth: Interne uniquement (SSO hors scope)` with `Auth: Microsoft Entra ID (Azure AD) — single-tenant, PKCE SPA flow, @sinapse.nc domain`

**Version bump**: 3.0.0 → 4.0.0 (MAJOR — principle redefinition)

## Project Structure

### Documentation (this feature)

```text
specs/008-microsoft-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/
│   └── api-auth.md      # Phase 1 API contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── auth/
│   ├── msal-config.ts          # MSAL configuration (clientId, authority, scopes)
│   ├── auth-provider.tsx        # AuthContext, useAuth hook, event handler
│   └── protected-route.tsx      # Route guard (checks auth + slug ownership)
├── env.d.ts                     # ImportMetaEnv type declarations
├── main.tsx                     # MODIFIED: MSAL init + MsalProvider wrapping
├── App.tsx                      # MODIFIED: ProtectedRoute on /form/:slug
└── components/
    └── header.tsx               # MODIFIED: login/logout button, user avatar

server/
├── env.d.ts                     # ProcessEnv type declarations
├── index.ts                     # MODIFIED: mount auth routes, env-file
├── middleware/
│   └── auth.ts                  # requireAuth + requireOwnership middleware
├── routes/
│   ├── auth.ts                  # POST /api/auth/me (upsert user)
│   ├── users.ts                 # GET /api/users/:slug/avatar
│   └── ratings.ts               # MODIFIED: auth on PUT/DELETE
└── lib/
    ├── db.ts                    # MODIFIED: users table + PRAGMA user_version migration
    └── known-mappings.ts        # Email → slug lookup table

.env                             # Azure AD config (git-ignored)
.env.example                     # Template with empty values (committed)
```

**Structure Decision**: Follows existing web application structure. Auth code isolated in `src/auth/` (frontend) and `server/middleware/` (backend). No new pages — existing routes gain auth guards.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SSO (constitution violation) | User explicitly requires Microsoft 365 login for account linking, avatars, and access control | No SSO = no way to identify users, enforce ownership, or fetch MS Graph data |
