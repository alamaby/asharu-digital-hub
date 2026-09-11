# Public Routes Whitelist + Login Guard (Middleware)

Created: 2026-09-11 13:40

## Objective
Rework `src/middleware.ts` so that **every** localized route requires login
**except** the explicit public whitelist:

- `/` (home, public)
- `/products` → `/id/produk` & `/en/products` (+ children `/properties/[slug]`)
- `/properties` → `/id/properti` & `/en/properties` (+ child `/properties/[slug]`)
- `/about` → `/id/tentang` & `/en/about`
- `/privacy-policy` → `/id/kebijakan-privasi` & `/en/privacy-policy`
- `/affiliate-disclosure` → `/id/disclosure-afiliasi` & `/en/affiliate-disclosure`
- `/masuk` → `/id/masuk` & `/en/sign-in` (login form itself)
- `/auth/exchange` → `/id/autentikasi/pertukaran` & `/en/auth/exchange` (magic-link callback — forced public)

Consequence: `/konten/baru` and `/studio` now require login (previously anon/public).

User confirmed: home `/` stays public, `/auth/exchange` stays public, `/konten/baru` + `/studio` must login.

## Scope
- `src/middleware.ts` — replace blacklist guard with whitelist guard
- Add `src/middleware.test.ts` — vitest unit tests for the guard logic
- Keep admin-only guards (`/admin/*`, `/konten/(review|riset)/*`) intact (admin-only on top of login)

## Milestones
1. Refactor middleware into testable pure helper `+ exported `handler`
2. Preserve intl routing middleware composition + Supabase session refresh
3. Preserve admin-only guard layer (admin check on top of login check)
4. Tests cover: public routes pass, private routes anon → redirect, login user private → pass, admin-only routes non-admin → redirect, `/masuk` never loops
5. Gate: `npm run typecheck && npm run lint && npm test`

## Tasks
- [ ] Extract `isPublicRoute(pathname)` helper + `handleAuthGuard` logic
- [ ] Rewrite `src/middleware.ts` with whitelist + login redirect + admin guard
- [ ] Ensure `/masuk` does not loop when unauthenticated (always public)
- [ ] Add `src/middleware.test.ts` with mocked NextRequest/NextResponse + Supabase
- [ ] Run typecheck + lint + test; fix
- [ ] Commit + push (Conventional Commits)

## Risks
- **Redirect loop on `/masuk`**: must exclude `/masuk` and `/auth/exchange` from the login guard so anonymous can reach them.
- **Admin-only vs login-only ordering**: admin paths (`/admin/*`, `/konten/(review|riset)/*`) must be checked AFTER login requirement but with stricter admin check; a logged-in non-admin must redirect away from `/admin`.
- **Static generation**: middleware runs only on-server (SSR); adding a blanket login guard will mark many pages dynamic. Public pages remain SSG. The `(public)` group stays SSG; the `(admin)` group was already dynamic.
- **Test mocking**: `next/server` `NextResponse.next`/`redirect` and `@supabase/ssr` `createServerClient` need careful mock boundaries so tests assert `response.headers.get('location')` instead of relying on thrown errors.
- **Edge case**: trailing slashes and root redirect `/→/id` from next-intl must not be blocked.

## Progress Log
- 2026-09-11 13:40 — plan created

## Notes
- `next-intl` middleware (`intlMiddleware`) handles `/→/id` redirect and must run first; auth guard applies to the resolved pathname.
- Public routes matched by **internal pathname** (locale prefix stripped) using `startsWith` + exact, so `/properties/[slug]` (dynamic) is covered by prefix `/properties`.
- `/auth/exchange` kept public via explicit entry in `PUBLIC_ROUTES` (magic-link callback).
