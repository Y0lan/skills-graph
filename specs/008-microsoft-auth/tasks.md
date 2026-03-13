# Tasks: Authentification Microsoft 365

**Input**: Design documents from `/specs/008-microsoft-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-auth.md, quickstart.md

**Tests**: Not requested in feature spec. Manual smoke testing per quickstart.md.

**Organization**: Tasks grouped by user story. Stories map to spec requirements:
- **US1**: Login Microsoft 365 + Liaison des comptes (R2, R3, R4)
- **US2**: Protection des routes GUEST/MEMBRE (R1, R5)
- **US3**: Avatars dans le dashboard (R6)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, configure environment, type declarations

- [ ] T001 Install frontend auth dependencies: `npm install @azure/msal-browser@^5.4.0 @azure/msal-react@^5.0.6`
- [ ] T002 Install backend auth dependency: `npm install jose@^6.2.1`
- [ ] T003 [P] Create `.env.example` at project root with `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `PORT=3001` (empty values, committed to git)
- [ ] T004 [P] Create `.env` at project root with actual Azure AD values (add `.env` to `.gitignore`)
- [ ] T005 [P] Create frontend type declarations in `src/env.d.ts` — declare `ImportMetaEnv` with `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID` as readonly strings
- [ ] T006 [P] Create backend type declarations in `server/env.d.ts` — augment `NodeJS.ProcessEnv` with `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `PORT`
- [ ] T007 Update `package.json` dev script to use `tsx watch --env-file-if-exists=.env server/index.ts` and start script to use `node --env-file-if-exists=.env --import tsx server/index.ts`
- [ ] T008 Update `server/index.ts` to read PORT from `process.env.PORT` instead of hardcoded `3001`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migration, MSAL configuration, auth middleware — MUST complete before any user story

- [ ] T009 Add `users` table migration in `server/lib/db.ts` — add `PRAGMA foreign_keys = ON`, use `PRAGMA user_version` pattern to create `users` table with schema from data-model.md (microsoft_oid PK, slug UNIQUE FK, email, display_name, avatar BLOB, avatar_etag, role CHECK, last_login_at, created_at), plus indexes on email and slug
- [ ] T010 [P] Create `server/lib/known-mappings.ts` — export `KNOWN_MAPPINGS: Record<string, string>` mapping the 10 `@sinapse.nc` emails to roster slugs (from data-model.md)
- [ ] T011 [P] Create MSAL configuration in `src/auth/msal-config.ts` — export `msalConfig` (clientId from `import.meta.env.VITE_AZURE_CLIENT_ID`, authority with tenant ID, redirectUri `window.location.origin`, cache in `localStorage`), export `loginRequest` (scopes: openid, profile, email, User.Read), export `apiRequest` (scopes: `api://{clientId}/access_as_user`)
- [ ] T012 [P] Create auth middleware in `server/middleware/auth.ts` — implement `requireAuth()` using jose `createRemoteJWKSet` + `jwtVerify` (validate aud, iss, tid per research.md R3), implement `requireOwnership()` that checks `req.user.slug === req.params.slug`. Augment Express `Request` type with `user?: EntraTokenPayload`
- [ ] T013 Modify `src/main.tsx` — create `PublicClientApplication` instance from `msalConfig`, await `msalInstance.initialize()` before `createRoot().render()`, set active account on `LOGIN_SUCCESS` event, wrap app with `MsalProvider`. Provider order: `BrowserRouter > ThemeProvider > MsalProvider > App`

**Checkpoint**: Foundation ready — MSAL initializes, middleware compiles, DB migration runs. User story implementation can now begin.

---

## Phase 3: User Story 1 — Login Microsoft 365 + Liaison des comptes (Priority: P1)

**Goal**: A user can click "Se connecter", authenticate via Microsoft 365, and their account is linked to their roster member. Header shows avatar + name after login. "Se deconnecter" button works.

**Independent Test**: Click login → redirect to Microsoft → authenticate → redirect back → header shows user name + avatar + "Mon formulaire" link. POST /api/auth/me returns correct slug for the email.

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create auth route in `server/routes/auth.ts` — implement `POST /api/auth/me` per contracts/api-auth.md: validate token via `requireAuth()`, extract oid/preferred_username/name from claims, upsert user row in `users` table by microsoft_oid, match email against KNOWN_MAPPINGS on first login to set slug, return user JSON (oid, slug, email, displayName, role, avatarUrl, lastLoginAt)
- [ ] T015 [P] [US1] Create users route in `server/routes/users.ts` — implement `GET /api/users/:slug/avatar` per contracts/api-auth.md: query `users` table by slug, return avatar BLOB with `Content-Type: image/jpeg` + `Cache-Control: public, max-age=86400`, return 404 if no avatar
- [ ] T016 [US1] Mount auth and users routes in `server/index.ts` — import and register `server/routes/auth.ts` at `/api/auth` and `server/routes/users.ts` at `/api/users`
- [ ] T017 [US1] Create auth context provider in `src/auth/auth-provider.tsx` — implement `AuthProvider` component + `useAuth()` hook that: calls `POST /api/auth/me` after MSAL login to get user data (slug, email, displayName, avatarUrl), exposes `{ user, isAuthenticated, isLoading, login, logout }`, handles MSAL events (LOGIN_SUCCESS → set active account, LOGIN_FAILURE → toast error per research.md R13), wraps children
- [ ] T018 [US1] Add `AuthProvider` to provider tree in `src/main.tsx` — wrap inside `MsalProvider`, so order is: `BrowserRouter > ThemeProvider > MsalProvider > AuthProvider > App`
- [ ] T019 [US1] Update header component in `src/components/header.tsx` — when unauthenticated: show "Se connecter" button (shadcn Button, Microsoft logo icon). When authenticated: show user avatar (shadcn Avatar with initials fallback), display name, "Mon formulaire" link to `/form/{user.slug}` (only if slug is set), "Se deconnecter" button. Use `useAuth()` hook for user state

**Checkpoint**: User Story 1 complete — login, account linking, and header UX work end-to-end. Dashboard accessible to everyone.

---

## Phase 4: User Story 2 — Protection des routes GUEST/MEMBRE (Priority: P2)

**Goal**: Guests can view all dashboard pages but cannot access `/form/:slug`. Authenticated members can only access their own form. Unauthorized access shows an error or redirects.

**Independent Test**: Without login, visit `/form/some-slug` → redirected or shown login prompt. After login, visit `/form/{own-slug}` → form loads. Visit `/form/{other-slug}` → shown 403 message. PUT /api/ratings/{other-slug} with token returns 403.

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create `ProtectedRoute` component in `src/auth/protected-route.tsx` — check `useAuth()` for authentication, check MSAL `inProgress` for loading state, if not authenticated show login prompt or redirect. For `/form/:slug` routes, verify `user.slug === params.slug` (ownership check). Show "not linked" message if authenticated but slug is null (per research.md R12)
- [ ] T021 [P] [US2] Add `requireAuth()` + `requireOwnership()` middleware to `PUT /api/ratings/:slug` and `DELETE /api/ratings/:slug` in `server/routes/ratings.ts` — per contracts/api-auth.md, return 403 with `{ error: "You can only edit your own ratings" }` on slug mismatch
- [ ] T022 [US2] Update routes in `src/App.tsx` — wrap `/form/:slug` route with `ProtectedRoute` layout route. Keep `/dashboard` and `/dashboard/:slug` public (no wrapper). Add the ProtectedRoute as a layout route element with `<Outlet />`

**Checkpoint**: User Story 2 complete — access control enforced on both frontend routes and backend API. Guests see dashboard only, members edit own forms only.

---

## Phase 5: User Story 3 — Avatars dans le dashboard (Priority: P3)

**Goal**: Team member photos from Microsoft 365 appear in the dashboard (team grid, expert finder, member profiles). Missing photos show initials fallback.

**Independent Test**: After at least one member logs in, their avatar appears in the dashboard team grid. Members who haven't logged in show initials. Avatar endpoint returns JPEG for logged-in members, 404 for others.

### Implementation for User Story 3

- [ ] T023 [US3] Add avatar fetching logic to `POST /api/auth/me` handler in `server/routes/auth.ts` — after user upsert, if avatar is null or stale (check avatar_etag), fetch photo from Microsoft Graph API (`GET https://graph.microsoft.com/v1.0/me/photo/$value`) using the user's access token passed in a custom header or body field, store JPEG binary as BLOB in `users.avatar`, store ETag in `users.avatar_etag`. Handle 404 (no photo) gracefully
- [ ] T024 [P] [US3] Add `email` field to `TeamMember` interface in `src/data/team-roster.ts` and populate it for all 10 members using the known email mappings from spec.md R3
- [ ] T025 [P] [US3] Create or update avatar component — create a reusable `MemberAvatar` component (can be in `src/components/member-avatar.tsx`) that takes a slug prop, renders a shadcn `Avatar` with `<AvatarImage src="/api/users/{slug}/avatar" />` and `<AvatarFallback>` showing initials derived from member name
- [ ] T026 [US3] Integrate `MemberAvatar` into dashboard team grid in `src/components/dashboard/team-overview.tsx` (or equivalent team grid component) — replace existing name-only displays with avatar + name
- [ ] T027 [US3] Integrate `MemberAvatar` into expert finder results in `src/components/dashboard/expert-finder.tsx` — add avatar next to member name in the Membre column
- [ ] T028 [US3] Integrate `MemberAvatar` into member profile/radar views in dashboard — wherever individual member info is displayed, add the avatar component

**Checkpoint**: User Story 3 complete — avatars visible across the dashboard for members who have logged in at least once. Initials fallback for others.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, dark mode verification, constitution update, cleanup

- [ ] T029 [P] Amend constitution in `.specify/memory/constitution.md` — replace "Auth: Interne uniquement (SSO hors scope)" with "Auth: Microsoft Entra ID (Azure AD) — single-tenant, PKCE SPA flow, @sinapse.nc domain", bump version 3.0.0 → 4.0.0, update Last Amended date
- [ ] T030 [P] Verify dark mode rendering — ensure login button, avatar, auth error messages, and "not linked" page render correctly in both light and dark themes
- [ ] T031 [P] Handle graceful degradation when `.env` is missing — app should still load in GUEST mode without crashing if Azure AD env vars are undefined. MSAL should not initialize, all routes remain public
- [ ] T032 Run `npx tsc --noEmit` and fix any type errors across all new/modified files
- [ ] T033 Run full smoke test checklist from `specs/008-microsoft-auth/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — core login flow
- **US2 (Phase 4)**: Depends on US1 — needs auth context to protect routes
- **US3 (Phase 5)**: Depends on US1 — needs user accounts to fetch/cache avatars
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Login + Linking)**: Can start after Foundational (Phase 2). No dependencies on other stories. **MVP target.**
- **US2 (Route Protection)**: Depends on US1 (needs `useAuth()` hook and auth context). Cannot run in parallel with US1.
- **US3 (Avatars)**: Depends on US1 (needs linked user accounts and avatar endpoint). Can run in parallel with US2 after US1 completes.

### Within Each User Story

- Backend routes before frontend integration
- Auth provider before components that consume it
- Core implementation before UX polish

### Parallel Opportunities

**Phase 1**: T003, T004, T005, T006 can all run in parallel (different files)
**Phase 2**: T010, T011, T012 can run in parallel (different files). T009 must run first (DB migration). T013 depends on T011 (MSAL config)
**Phase 3**: T014, T015 can run in parallel (different server route files). T017 depends on T014+T015 being mountable
**Phase 4**: T020, T021 can run in parallel (frontend vs backend). T022 depends on T020
**Phase 5**: T024, T025 can run in parallel (different files). T026, T027, T028 can run in parallel (different dashboard components)

---

## Parallel Example: User Story 1

```bash
# Launch backend routes in parallel (different files):
Task: "Create auth route in server/routes/auth.ts"       # T014
Task: "Create users route in server/routes/users.ts"     # T015

# Then mount routes (depends on T014, T015):
Task: "Mount auth and users routes in server/index.ts"   # T016

# Then frontend (depends on backend being available):
Task: "Create auth context provider in src/auth/auth-provider.tsx"  # T017
Task: "Add AuthProvider to provider tree in src/main.tsx"           # T018
Task: "Update header component in src/components/header.tsx"        # T019
```

## Parallel Example: User Story 3

```bash
# Launch independent tasks in parallel:
Task: "Add email field to team-roster.ts"                # T024
Task: "Create MemberAvatar component"                    # T025

# Then integrate across dashboard (parallel, different files):
Task: "Integrate into team-overview.tsx"                  # T026
Task: "Integrate into expert-finder.tsx"                  # T027
Task: "Integrate into member profile views"              # T028
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: Foundational (T009–T013)
3. Complete Phase 3: User Story 1 (T014–T019)
4. **STOP and VALIDATE**: Login works, account linked, header shows user info
5. This is a deployable MVP — auth works, dashboard still public

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 (Login) → Test → Deploy (MVP!)
3. Add US2 (Route Protection) → Test → Deploy (access control active)
4. Add US3 (Avatars) → Test → Deploy (visual polish)
5. Polish → Final validation → Done

### External Prerequisite

**Before any coding begins**: Azure App Registration must be created in Entra admin center (see quickstart.md Prerequisites section). Without `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID`, auth cannot be tested.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No automated tests requested — validation via manual smoke test checklist
- Constitution amendment (T029) is required but non-blocking for implementation
- Avatar fetching from Graph API requires the user's Graph access token — T023 needs design consideration for how to pass it from frontend to backend
- Commit after each task or logical group
