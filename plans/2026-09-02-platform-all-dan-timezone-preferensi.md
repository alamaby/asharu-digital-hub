# Platform Semua + Timezone Preferensi

Created: 2026-09-02 13:30:00

## Objective
1. Form Buat Konten Afiliasi mendukung opsi "Semua Platform" → `platform_slug=NULL`, 1 draf agnostik.
2. Tampilan waktu mengikuti preferensi user (`profiles.timezone`), fallback device, default `Asia/Jakarta` — bukan UTC.

Pilihan user: 1 draf agnostik, default Jakarta.

## Scope
- Platform: `ContentRequestForm`, `konten/baru/page`, `actions.ts`, `orchestrator/discovery/prompts/development`, `riset` UI, i18n
- Timezone: migrasi `profiles`, `lib/utils/format.ts`, `TimezoneSync`, `layout.tsx`, 5 ganti `toISOString`, `ResearchStepper`, `api/profiles/timezone`, settings select

## Milestones
1. Platform "Semua"
2. Timezone preferensi + fallback
3. Build verify

## Tasks
- [x] 1. i18n `content.form.platformAll` (id/en)
- [x] 2. `konten/baru/page.tsx` + `ContentRequestForm.tsx` synthetic `all`
- [x] 3. `actions.ts` `researchSchema` izinkan `all`, skip FK, insert null
- [x] 4. `orchestrator/discovery/prompts/development` branch `platform==='all'` agnostik + min max_chars
- [x] 5. `riset/[sessionId]/page.tsx` & list render `null|all` → `t('platformAll')`
- [x] 6. Migrasi `supabase/migrations/20260903000001_add_profiles_timezone.sql`
- [x] 7. `lib/utils/format.ts` + `TimezoneSync.tsx` + `layout.tsx` + ganti 5 `toISOString` → `formatDateTime`
- [x] 8. `ResearchStepper` tambah `timeZone`, `api/profiles/timezone`
- [x] 9. `next build` + cek `124a...`

## Risks
- `all` tanpa fix prompt → query nonsense & draft overrun 280 → mitigasi #4
- Hydration mismatch server UTC vs client WIB → `suppressHydrationWarning` / client-only
- `timezone` CHECK regex fragile → validasi app

## Progress Log
- 2026-09-02 13:30 — plan created, build mode aktif
- 2026-09-02 13:35 — platform `all`: i18n `content.form.platformAll` + `admin.research.platformAll` (id/en)
- 2026-09-02 13:37 — `konten/baru/page.tsx` synthetic `{slug:'all'}` prepended
- 2026-09-02 13:38 — `actions.ts` skip FK check when `platform==='all'`, insert `platform_slug=null`
- 2026-09-02 13:40 — `discovery.ts` guard platform-agnostic query, `prompts.ts` render "Semua Platform", `orchestrator.ts` fallback `?? 'all'`, `development.ts` min max_chars across active platforms
- 2026-09-02 13:42 — `riset/page.tsx` + `riset/[sessionId]/page.tsx` render `null|'all' → t('platformAll')`
- 2026-09-02 13:45 — migrasi `supabase/migrations/20260903000001_add_profiles_timezone.sql` `profiles.timezone` + `locale_pref` + RLS self-update (applied via supabase-asharu-be-production)
- 2026-09-02 13:48 — `lib/utils/format.ts` + `resolveTimezone` + `formatDateTime` + `formatDateTimeSeconds`
- 2026-09-02 13:50 — `lib/auth/timezone.ts` `getDisplayTimezone()` cache()
- 2026-09-02 13:52 — `TimezoneSync.tsx` client component + `layout.tsx` `NextIntlClientProvider timeZone={...}`
- 2026-09-02 13:55 — `riset/[sessionId]/page.tsx` + `riset/page.tsx` pakai `formatDateTime` + `formatDateTimeSeconds`
- 2026-09-02 13:58 — `ResearchStepper.tsx` tambah prop `timeZone`, pakai `formatDateTime`
- 2026-09-02 14:00 — `KontenList.tsx` pakai `useFormatter()` next-intl (respect provider timeZone)
- 2026-09-02 14:05 — `npm run build` ✓ 44 pages (fix `development.ts:69` `.not('max_chars','is',null)`)

## Notes
- Representasi `all` = `NULL` (FK nullable di research_pipeline.sql:25), bukan DB row palsu.
- Default `Asia/Jakarta` (WIB), fallback device `Intl.resolvedOptions().timeZone`.
