# Research: Authentification Microsoft 365

**Feature**: 008-microsoft-auth | **Date**: 2026-03-12

## R1 — MSAL Library Choice

**Decision**: `@azure/msal-browser@^5.4.0` + `@azure/msal-react@^5.0.6`

**Rationale**: Official Microsoft libraries. v5.x supports React 19 (peer dep updated May 2025, PR #7735). MSAL-React provides hooks (`useMsal`, `useIsAuthenticated`, `useAccount`) and guard components (`AuthenticatedTemplate`, `UnauthenticatedTemplate`).

**Alternatives considered**:
- `next-auth` / `auth.js`: Designed for Next.js SSR — wrong architecture for Vite SPA
- Manual OAuth2 with `fetch`: MSAL handles PKCE, token caching, silent refresh, key rotation
- `oidc-client-ts`: Generic OIDC, less Microsoft-specific; MSAL handles Entra ID quirks

## R2 — Auth Flow: Redirect (not Popup)

**Decision**: OAuth 2.0 Authorization Code with PKCE, using `loginRedirect()` (not popup)

**Rationale**: PKCE is the only flow supported by MSAL Browser v3+. Redirect flow chosen over popup because:
- Corporate browsers commonly block popups via Group Policy
- Edge InPrivate loses popup handle; MFA second popup gets blocked
- Microsoft docs: "If users have browser constraints where pop-up windows are disabled, use the redirect method"
- Do NOT mix popup and redirect in the same app (Microsoft warning)

**Flow**:
1. SPA calls `loginRedirect()` → MSAL generates code_verifier + code_challenge
2. Full-page redirect to Microsoft login page
3. Microsoft redirects back with authorization code
4. `MsalProvider` handles `handleRedirectPromise` automatically
5. Tokens cached in `localStorage` (persists across tabs)

## R3 — Backend Token Validation

**Decision**: `jose@^6.2.1` with `createRemoteJWKSet` + `jwtVerify`

**Rationale**: Zero dependencies, ESM-native, Web Crypto API, built-in JWKS caching + key rotation. `passport-azure-ad` is deprecated/archived. `jsonwebtoken` + `jwks-rsa` is callback-based legacy.

**Alternatives considered**:
- `jsonwebtoken` + `jwks-rsa`: Callback-based, two deps, no native ESM
- `passport-azure-ad`: Deprecated, archived by Microsoft
- `@azure/msal-node`: For acquiring tokens, NOT validating incoming Bearer tokens

**Claims to validate**: `aud` (client ID or `api://{client-id}`), `iss` (tenant issuer URL v2.0), `tid` (tenant ID), `exp`/`nbf` (automatic by jose), `scp` (scopes)

**JWKS endpoint**: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`
- jose `createRemoteJWKSet` caches keys with `cooldownDuration: 30s`, `cacheMaxAge: 10min`
- Microsoft rotates keys ~every 24h; jose auto-fetches on unknown `kid`

## R4 — Tenant Restriction

**Decision**: Single-tenant app registration + tenant-specific authority URL

**Rationale**: Authority set to `https://login.microsoftonline.com/{tenant-id}` (not `common`). Only `@sinapse.nc` tenant users can authenticate — rejected at Microsoft login page level. Backend adds defense-in-depth `tid` claim check.

## R5 — Microsoft Graph API

**Decision**: `GET /v1.0/me` for profile + `GET /v1.0/me/photo/$value` for avatar

**Profile**: Returns `displayName`, `mail`, `userPrincipalName`, `givenName`, `surname`, `jobTitle`
**Photo**: Returns raw binary blob (`image/jpeg`). 404 if no photo → fallback to initials avatar.
**Scope**: `User.Read` (delegated) covers own profile + photo. No `User.ReadBasic.All` needed.

## R6 — Account Linking Strategy

**Decision**: Use `microsoft_oid` (Azure AD object ID) as primary key in `users` table. Match by email on first login to auto-link to roster slug.

**Rationale**: Microsoft docs confirm `oid` is the only stable, non-reassignable identifier. Emails/UPNs can change (name changes, turnover). The `oid` is a GUID that never gets reassigned.

**Flow**:
1. User logs in → JWT contains `oid`, `preferred_username` (email)
2. Backend upserts user row by `oid`
3. On first login, match email against known `KNOWN_MAPPINGS` → set `slug`
4. Subsequent logins update `display_name`, `last_login_at`

**Known mappings** (10 members):
```
pierre.rossato@sinapse.nc     → pierre-rossato
andy.malo@sinapse.nc          → andy-malo
martin.vallet@sinapse.nc      → martin-vallet
pierre-mathieu.barras@sinapse.nc → pierre-mathieu-barras
nicole.nguon@sinapse.nc       → nicole-nguon
alan.huitel@sinapse.nc        → alan-huitel
bethlehem.mengistu@sinapse.nc → bethlehem-mengistu
alexandre.thomas@sinapse.nc   → alexandre-thomas
matthieu.alcime@sinapse.nc    → matthieu-alcime
steven.nguyen@sinapse.nc      → steven-nguyen
```

## R7 — Session & Token Strategy

**Decision**: Stateless — frontend holds tokens in MSAL cache (`localStorage`), backend validates JWT on each request

**Rationale**: No server-side session store needed. MSAL handles token refresh silently (hidden iframe or refresh token). Access tokens ~60-90 min, auto-refreshed by `acquireTokenSilent`.

**Token separation**: Use a custom API scope (`api://{client-id}/access_as_user`) for backend calls. Do NOT send the Graph token to our API — different audience.

## R8 — MSAL Initialization & Provider Placement

**Decision**: Await `msalInstance.initialize()` before `createRoot().render()` in `main.tsx`

**Provider order** (outermost → innermost):
```
BrowserRouter > ThemeProvider > MsalProvider > App
```

**Key rules**:
- Create `PublicClientApplication` outside component tree (prevent re-instantiation on HMR)
- MSAL config in separate `src/auth/msal-config.ts` file (avoid Vite HMR circular imports)
- Set active account in `LOGIN_SUCCESS` event callback
- `MsalProvider` handles `handleRedirectPromise` automatically

## R9 — Route Protection

**Decision**: Custom `<ProtectedRoute>` wrapper using react-router-dom v7 layout routes + `Outlet`

**Rationale**: `MsalAuthenticationTemplate` couples auth to component rendering. Custom wrapper integrates with react-router-dom v7 patterns, gives full UX control. Route `loader` functions can't use MSAL hooks (outside React tree).

**Route structure**:
```
/dashboard         → public (GUEST + MEMBER)
/dashboard/:slug   → public
/form/:slug        → ProtectedRoute → must be authenticated + slug must match user's slug
```

## R10 — Avatar Caching

**Decision**: Server-side BLOB storage in SQLite `users.avatar` column + client-side `sessionStorage` with 24h TTL

**Rationale**: SQLite BLOBs under 100KB are read faster than filesystem (SQLite benchmark "35% Faster Than Filesystem"). Avatars are 5-20KB, ~200KB total for 10 users. Server caches avatars so dashboard shows photos for all members without requiring each to be logged in. Client caches in sessionStorage to avoid re-fetching on every render.

**Endpoint**: `GET /api/users/:slug/avatar` → serves BLOB with `Content-Type: image/jpeg`, `Cache-Control: public, max-age=86400`

## R11 — Environment Variables

**Decision**: Single `.env` at project root, loaded by Vite (auto) + Node 24 `--env-file` flag (tsx)

**Rationale**: No `dotenv` dependency needed. Node 24+ has stable built-in `--env-file` support. tsx passes through all Node CLI flags.

**Variables**:
```
VITE_AZURE_CLIENT_ID=xxx    # Public, exposed to frontend via import.meta.env
VITE_AZURE_TENANT_ID=yyy    # Public, exposed to frontend
PORT=3001                   # Backend only
```

**Security**: Client ID and Tenant ID are public values (embedded in SPA JS bundle, visible in network requests). No secrets needed for SPA PKCE flow. `.env` in `.gitignore`, `.env.example` committed.

**TypeScript**: `src/env.d.ts` for `ImportMetaEnv`, `server/env.d.ts` for `ProcessEnv`

**package.json update**:
```json
"dev": "concurrently \"vite\" \"tsx watch --env-file-if-exists=.env server/index.ts\""
```

## R12 — "Not Linked" User Handling

**Decision**: Show a clear "account not linked" page with sign-out option

**Rationale**: Valid `@sinapse.nc` users who don't match the roster (managers, new hires) should get an explanatory message, not a blank page or cryptic error. They can still view the dashboard as GUEST.

**Future**: Add an `admin` role via Entra ID App Roles for users who need access without being in the roster.

## R13 — Error Handling

**Decision**: Global `AuthEventHandler` headless component inside `MsalProvider` that listens to MSAL events

**Key errors to handle**:
- `popup_window_error` → N/A (using redirect flow)
- `user_cancelled` → toast "Connexion annulée"
- `interaction_in_progress` → toast "Connexion en cours, veuillez patienter"
- `InteractionRequiredAuthError` → trigger `loginRedirect` fallback
- Network errors → toast "Erreur réseau"

## R14 — Constitution Violation: SSO

**Violation**: Tech Constraints states "Auth: Interne uniquement (SSO hors scope)"

**Justification**: User explicitly requests Microsoft 365 authentication. Deliberate scope expansion. Constitution should be amended (v4.0.0 MAJOR).

**Proposed amendment**: Replace "Auth: Interne uniquement (SSO hors scope)" with "Auth: Microsoft Entra ID (Azure AD) — single-tenant, PKCE SPA flow, @sinapse.nc domain"

## R15 — Azure App Registration Prerequisites

Must be done manually in Entra admin center before development:

1. **Create App Registration**: "Radar des Competences", single-tenant
2. **Platform**: SPA with redirect URIs: `http://localhost:5173` (dev), production URL
3. **API Permissions** (Delegated): `openid`, `profile`, `email`, `User.Read`
4. **Expose an API**: URI `api://{client-id}`, scope `access_as_user`
5. **Values for `.env`**: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`

## R16 — New Dependencies Summary

| Package | Version | Purpose | Side |
|---------|---------|---------|------|
| `@azure/msal-browser` | ^5.4.0 | Core MSAL auth library | Frontend |
| `@azure/msal-react` | ^5.0.6 | React hooks + providers | Frontend |
| `jose` | ^6.2.1 | JWT validation, JWKS | Backend |

No `dotenv`, no `passport`, no `jsonwebtoken`, no `jwks-rsa`.

## R17 — Database Migration Strategy

**Decision**: Use `PRAGMA user_version` for incremental migrations in `initDatabase()`

**Rationale**: Built into SQLite, no external library. Existing `CREATE TABLE IF NOT EXISTS` pattern unchanged. New migrations guarded by version check.

**Also**: Add `PRAGMA foreign_keys = ON` (currently missing — existing FK constraints are not enforced).
