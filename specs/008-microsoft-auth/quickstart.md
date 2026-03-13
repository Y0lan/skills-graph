# Quickstart: Authentification Microsoft 365

**Feature**: 008-microsoft-auth | **Date**: 2026-03-12

## Prerequisites

### 1. Azure App Registration

Before writing any code, set up the app registration in [Entra admin center](https://entra.microsoft.com):

1. **App Registrations** > New registration
   - Name: `Radar des Competences`
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
   - Redirect URI: **Single-page application (SPA)** > `http://localhost:5173`

2. **API Permissions** > Add delegated permissions:
   - `openid`, `profile`, `email` (Microsoft Graph > OpenId permissions)
   - `User.Read` (Microsoft Graph > User)
   - Click "Grant admin consent for [tenant]"

3. **Expose an API**:
   - Set Application ID URI: `api://{client-id}`
   - Add scope: `access_as_user` (Admins and users can consent)

4. **Note these values**:
   - Application (client) ID → `VITE_AZURE_CLIENT_ID`
   - Directory (tenant) ID → `VITE_AZURE_TENANT_ID`

### 2. Environment Setup

Create `.env` at project root:
```bash
VITE_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_AZURE_TENANT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
PORT=3001
```

### 3. Install Dependencies

```bash
# Frontend
npm install @azure/msal-browser@^5.4.0 @azure/msal-react@^5.0.6

# Backend
npm install jose@^6.2.1
```

## Development Workflow

```bash
npm run dev
# Vite: http://localhost:5173
# Express: http://localhost:3001
```

### Testing Auth Locally

1. Open `http://localhost:5173`
2. Dashboard loads without login (GUEST mode)
3. Click "Se connecter" in header
4. Redirects to Microsoft login page
5. Authenticate with `@sinapse.nc` account
6. Redirects back → header shows avatar + name
7. Navigate to `/form/{your-slug}` → form loads
8. Try `/form/{other-slug}` → redirected (not your form)

### Verifying Token Flow

1. After login, open DevTools > Application > Session/Local Storage
2. MSAL keys should be present (`msal.{client-id}.*`)
3. Network tab: API calls to `/api/ratings/:slug` should have `Authorization: Bearer ...` header
4. Backend logs should show "Token validated for {email}"

## File Structure (New/Modified)

```
src/
├── auth/
│   ├── msal-config.ts          # NEW: MSAL configuration
│   ├── auth-provider.tsx        # NEW: AuthContext + event handler
│   └── protected-route.tsx      # NEW: Route guard component
├── env.d.ts                     # NEW: ImportMetaEnv types
├── main.tsx                     # MODIFIED: MSAL init + MsalProvider
├── App.tsx                      # MODIFIED: route protection
└── components/
    ├── header.tsx               # MODIFIED: login/logout button, avatar
    └── ui/
        └── avatar.tsx           # NEW or MODIFIED: initials fallback

server/
├── env.d.ts                     # NEW: ProcessEnv types
├── index.ts                     # MODIFIED: env-file loading, auth routes
├── middleware/
│   └── auth.ts                  # NEW: requireAuth, requireOwnership
├── routes/
│   ├── auth.ts                  # NEW: POST /api/auth/me
│   ├── users.ts                 # NEW: GET /api/users/:slug/avatar
│   └── ratings.ts               # MODIFIED: add auth middleware to PUT/DELETE
└── lib/
    ├── db.ts                    # MODIFIED: users table migration
    └── known-mappings.ts        # NEW: email → slug mapping

.env                             # NEW: Azure AD config (git-ignored)
.env.example                     # NEW: template (committed)
```

## Smoke Test Checklist

- [ ] App loads without `.env` (GUEST mode, no crash)
- [ ] Login redirects to Microsoft and back
- [ ] User avatar + name shown in header after login
- [ ] `POST /api/auth/me` returns user with correct slug
- [ ] `GET /api/users/{slug}/avatar` returns JPEG or 404
- [ ] `PUT /api/ratings/{own-slug}` works when authenticated
- [ ] `PUT /api/ratings/{other-slug}` returns 403
- [ ] `PUT /api/ratings/{slug}` without token returns 401
- [ ] Dashboard remains accessible without login
- [ ] Dark mode: login button and avatar render correctly
