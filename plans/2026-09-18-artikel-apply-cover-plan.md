# Apply Draft Cover ke Artikel Publish — Plan Detail (siap eksekusi)

Created: 2026-09-18 14:10:00

## Objective

Sediakan cara mengganti cover artikel yang **sudah publish** dengan cover hasil generate terbaru, lewat banner di halaman review draf (`/konten/review/[draftId]`, sesuai pilihan user). Draf belum publish tidak butuh kode baru (alur existing lengkap) — hanya diverifikasi.

Fakta terverifikasi 2026-09-18 (dua agen riset + cek baris):

- Cover draf = baris `content_draft_images WHERE post_index=0 AND status='selected'`; satu-satunya penulis `articles.cover_image_url` adalah `publish.ts:154` saat (re-)publish. `selectDraftImage()` (`src/lib/image/actions.ts:560-597`) tak pernah menyentuh tabel `articles` → cover baru pasca-publish tidak ngefek ke live.
- Re-publish menimpa SEMUA kolom (judul/isi/cover/afiliasi, `publish.ts:134-167`) + bisa me-wipe cover jadi `null` bila selected hilang → dilarang sebagai cara ganti cover.
- RLS tulis admin sudah ada (`articles_admin_write ... USING(is_admin())`, `supabase/migrations/20260913000001_artikel_platform.sql:53-61`); semua tulis pakai `createSupabaseService()` (bypass).
- Pola revalidasi existing: `actions.ts:37-40` (publish) dan `:55-56` (archive) pakai path non-locale (`/artikel`, `/artikel/[slug]`).

## Scope

Masuk:

- Server action baru `applyDraftCoverToArticle(draftId, draftImageId)` di `src/lib/articles/actions.ts`.
- Banner sinkronisasi cover di halaman review draf (server fetch + komponen klien kecil untuk tombol).
- Test action + test banner; gate penuh.

Keluar (jangan kerjakan):

- Perubahan alur draf belum publish (Regenerate/Pilih/Upload/Ulangi di `DraftImageCard.tsx` — verifikasi manual saja).
- Perubahan worker (`src/lib/image/worker.ts`), `selectDraftImage`, publish core, Studio, stage image.
- Upload langsung ke artikel publish (satu pintu: via draf → terapkan).
- Edit judul/isi artikel publish; halaman `/admin/artikel`; migrasi DB (tidak diperlukan); `routing.ts`, middleware, CSP, RLS.

## Milestones

1. Action + validasi + revalidasi: unit test hijau.
2. Banner review: tampil/sembunyi tepat, tombol memanggil action, pesan sukses + link live.
3. Gate hijau + verifikasi manual live <60 detik.

Urutan wajib: A1 → A2 → B1 → B2 → C (satu file per langkah bila memungkinkan, gate kecil tiap langkah).

## Tasks

### A1 — Server action `applyDraftCoverToArticle` (`src/lib/articles/actions.ts`, setelah `archiveArticle` `:58`)

- [ ] Tempel pola dari `approveArticleAndPublish` (`:24-43`): `'use server'` sudah di baris 1; gate `if (!(await isAdmin())) return { success:false, error:'forbidden' }`; `createSupabaseService()` + guard null (`'Supabase not configured'`).
- [ ] Bentuk return (ikuti `archiveArticle`, BUKAN `ArticlePublishResult`):
  ```ts
  export interface ApplyCoverResult { success: boolean; error?: string; updatedLocales?: string[] }
  export async function applyDraftCoverToArticle(draftId: string, draftImageId: string): Promise<ApplyCoverResult>
  ```
- [ ] Validasi berurutan, gagal → return `{ success:false, error:'<pesan>' }`, JANGAN lempar throw (konsisten dengan file ini):
  1. `draftId`/`draftImageId` non-empty, else `'draftId dan draftImageId wajib diisi'`.
  2. Ambil baris image: `select('id, draft_id, post_index, status, public_url').eq('id', draftImageId).maybeSingle()`. Syarat: ada; `draft_id === draftId` (TOLAK bila milik draf lain — pesan `'gambar bukan milik draf ini'`); `post_index === 0` (`'hanya cover (post 0) yang bisa diterapkan'`); `status IN ('ready','selected')` (`'gambar belum jadi — generate dulu sampai ready'`; sengaja TOLAK `pending`/`prompt_ready`/`failed` karena belum ada piksel); `public_url` non-empty (`'gambar belum punya URL publik'`).
  3. Ambil artikel: `select('id, locale, slug').eq('draft_id', draftId).eq('status','published')`. Kosong → `'draf ini belum punya artikel terbit'`.
- [ ] Update per baris artikel (loop, agar ID+EN konsisten): `update({ cover_image_url: public_url, updated_at: now }).eq('id', row.id)`. HANYA 2 kolom — judul/isi/slug tak tersentuh. Kumpulkan `updatedLocales`.
- [ ] Audit: `insert content_research_logs { session_id: <id sesi draf bila ada, else null — kolom nullable? cek: log lain selalu isi session_id; bila draf tak punya sesi, SKIP audit daripada insert gagal>, stage:'cover_apply', level:'info', message:'cover artikel diterapkan dari image <id8> ke locale <...>' }`. Hati-hati: bila `session_id` NOT NULL di tabel, ambil dari `content_drafts.research_topic_id → content_research_topics.session_id` seperti pola developing; bila gagal resolve, skip audit (jangan gagalkan aksi).
- [ ] Revalidasi (dua varian sekaligus — pola existing hanya non-locale yang dicurigai tak mempan di next-intl):
  ```ts
  for (const loc of updatedLocales) {
    const art = articles.find(a => a.locale === loc)!;
    const internal = `/artikel/${loc === 'en' ? 'articles' : 'artikel'}`; // JANGAN hardcode manual — pakai localizedPathname('/artikel', loc) & localizedPathname('/artikel/[slug]', loc, {slug})
    revalidatePath(localizedPathname('/artikel', loc as Locale));
    revalidatePath(localizedPathname('/artikel/[slug]', loc as Locale, { slug: art.slug }));
  }
  revalidatePath('/konten/review/[draftId]', 'page');
  ```
  Import: `localizedPathname` dari `@/lib/seo/paths`, tipe `Locale` sudah diimpor (`:12`). Catatan: `revalidatePath` dengan path konkret hasil `localizedPathname` (mis. `/id/artikel/x`) adalah string biasa — valid.
- [ ] Test `src/lib/articles/actions-apply-cover.test.ts` (baru; mock Supabase ala `src/lib/automation/runner.test.ts` — tiru pola mock `from().select/eq/update/maybeSingle` di file itu, JANGAN mock `isAdmin` secara global merusak test lain; pakai `vi.mock('@/lib/auth/is-admin')` per-file seperti pola existing bila ada, else factored helper):
  1. Bukan admin → `{success:false, error:'forbidden'}` dan TIDAK ada update.
  2. Image milik draf lain → ditolak, TIDAK ada update `articles`.
  3. Status `pending`/`prompt_ready`/`failed` → ditolak masing-masing (3 kasus).
  4. `public_url` null/empty → ditolak.
  5. Tanpa artikel published → ditolak.
  6. Sukses 2 locale (id+en): update dipanggil 2x dengan `cover_image_url` = URL image + `updated_at` string; `updatedLocales` = `['id','en']` (urutan tak penting — assert sebagai set).
- [ ] Acceptance: 8+ test baru hijau.

### A2 — Verifikasi draf-belum-publish (tanpa kode, checklist manual)

- [ ] Di review draf TANPA artikel publish: Regenerate/Generate, Pilih riwayat, Upload manual, Ulangi tetap berfungsi; banner (B1) TIDAK tampil; publish mengambil cover selected (`publish.ts:99-109`).
- [ ] Bila menemukan rusak → STOP, laporkan sebagai bug terpisah, jangan campur ke commit plan ini.

### B1 — Banner di halaman review (`src/app/[locale]/(admin)/konten/review/[draftId]/page.tsx`, sekitar `:144-153` dan `:263-266`)

- [ ] Perluas fetch existing (`:144-153`): `select('locale, slug, cover_image_url')` (tambah 1 kolom) → teruskan ke komponen kartu/banner sebagai `publishedArticles: { locale, slug, cover_image_url }[]`.
- [ ] Cover draf terpilih sudah dibaca (`:266` `coverSelectedId` + `draftImages` `:164-174` berisi `public_url`/`status`) — teruskan `draftCoverUrl` (public_url baris selected post 0, atau null) ke banner. JANGAN fetch ulang yang sudah ada.
- [ ] Render banner HANYA bila `publishedArticles.length > 0` DAN `d.platform_slug === 'artikel'`. Isi: thumbnail live (pertama, atau per-locale bila >1 — cukup tampilkan locale pertama + teks "+1 locale lain") vs thumbnail draf + badge status: `Sinkron` (URL sama persis) / `Berbeda` / `Live tanpa cover` (live null) / `Draf tanpa cover` (draf null → tombol disabled + hint "generate/pilih cover draf dulu").
- [ ] Tombol = komponen klien BARU `src/components/content/ApplyCoverBanner.tsx` (`'use client'`, kecil): props serializable SAJA (`draftId, draftImageId|null, liveUrl|null, draftUrl|null, labels...` — JANGAN oper fungsi/format dari server; pelajaran digest `2863325395`: template string + `.replace()` di klien). `useTransition` + `confirm()` ringan HANYA bila menimpa live yang sudah ada (`liveUrl` non-null dan beda). Sukses → tampilkan pesan + link `<a href={liveHref}>Lihat artikel live</a>` (href dari server via `localizedPathname`, bukan hardcode `/id/`).
- [ ] i18n: semua string via namespace existing yang dipakai halaman review (cek file page untuk namespace yang dipakai; JANGAN bikin namespace baru bila ada yang cocok). Kunci seimbang id/en — `messages.test.ts` menuntut parity penuh.

### B2 — Test banner + gate

- [ ] Test komponen (vitest + testing-library, pola `ArticleCard.test.tsx`): sembunyi bila tanpa artikel publish; badge `Berbeda` vs `Sinkron`; tombol disabled bila draf tanpa cover; klik memanggil action mock dan menampilkan link live saat sukses. Mock `@/i18n/navigation` sudah tersedia di `vitest.setup.tsx`.
- [ ] Gate berurutan: `npm run typecheck` → `npm run lint` → `npm test` (penuh; flaky Studio pre-existing → rerun file spesifik) → `npm run build` (wajib: sentuh RSC + server action).

### C — Verifikasi manual (staging/dev, JANGAN prod dulu)

- [ ] Draf berartikel publish: generate cover baru → Pilih sebagai cover draf → banner status `Berbeda` → Terapkan → banner jadi `Sinkron` → buka URL live <60 detik → cover baru tampil (membuktikan revalidasi locale mempan).
- [ ] Kasus tolak: klik tanpa cover draf (disabled); artikel di-archive dulu → action return error ramah (bukan crash).
- [ ] Draf tanpa artikel publish: banner tak tampil; publish normal mengambil cover selected.

## Risks

- Revalidasi path locale: pola existing (`revalidatePath('/artikel')`) belum terbukti mempan di next-intl `localePrefix:'always'` — A1 merevalidasi DUA varian; C membuktikan <60 detik. Bila gagal, fallback: tunggu ISR 1 jam (beri tahu user di pesan sukses).
- Race generate-vs-apply: URL yang diterapkan = snapshot saat klik (by design, cukup untuk tim kecil; didokumentasikan, bukan bug).
- Multi-locale divergen: sengaja diterapkan ke semua locale sekaligus (cover tak berbahasa). Bila kelak perlu beda per locale → butuh skema baru, di luar plan.
- `session_id` untuk audit: bila NOT NULL dan resolve gagal, SKIP audit (aksi tetap sukses) — jangan gagalkan fitur demi log.
- Setiap edit setelah gate hijau MEMBATALKAN gate — re-run `typecheck + lint` sebelum commit (insiden `prefer-const` 2026-09-10).

## Progress Log

- 2026-09-18 14:10:00 — Plan detail dibuat (riset: 2 agen + cek `actions.ts:1-58`, review page `:125-174`). Kesepakatan user: banner di halaman review. Belum ada implementasi.
- Belum mulai — A1 server action.

## Notes

- Keputusan: (1) entry = banner review, bukan halaman admin baru (minimal, dekat alur generate); (2) update HANYA `cover_image_url+updated_at` (anti pola re-publish yang menimpa semua + risiko wipe null); (3) tolak `prompt_ready` (belum ada piksel) — user harus Generate dulu; (4) `updated_at` di-bump agar `modifiedTime` SEO + `lastmod` sitemap ikut.
- Follow-up opsional (bukan plan ini): upload langsung ke artikel publish; badge provenance `from_developing` di banner; halaman `/admin/artikel`.
- Perintah gate: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- Aturan commit: Conventional Commits satu baris tanpa `Co-authored-by`; `git status --short + git diff + git log --oneline -10` dulu; stage hanya file dimaksud; JANGAN commit `.env*`/key; tanpa migrasi → commit parent saja; push ditolak → `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate hijau, push; laporkan hash + pesan + file kunci.
- Handoff small model: kerjakan A1→C berurutan; JANGAN sentuh `worker.ts`, publish core, `routing.ts`, middleware, CSP, RLS, skema DB; bila ragu soal status image, baca `src/lib/image/types.ts:7` + `worker.ts:349-391` (aturan: hanya `ready`/`selected` yang punya piksel).
