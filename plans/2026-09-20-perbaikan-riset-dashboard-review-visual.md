# Plan Detail Implementasi — 7 Temuan Riset, Dashboard, Review, Visual

Created: 2026-09-20 12:00:00

## Objective

Perbaiki 7 temuan user pada layar `admin/riset` (list + detail), `dashboard` (Draf Terbaru), `konten/review` (visualisasi + template subjek), dan `admin/visual` (Template Subjek reset priority + error tambah baru), plus investigasi sesi riset `b8766d73-3c18-4bb1-ac99-87aa77fee3b0` yang berhenti di `awaiting_selection`.

Dokumen ini ditulis untuk model **less capable**: ikuti langkah per tugas secara berurutan, jangan lompat, jangan refactor di luar scope. Setiap tugas mencantumkan file persis, kode saat ini, perubahan persis, dan cara verifikasi.

Contoh pola yang dipakai di repo (wajib ditiru):
- Collapsible native: `src/components/content/DraftImageCard.tsx:358` (`<details open={!defaultCollapsed}>` + `<summary className="... list-none [&::-webkit-details-marker]:hidden">`).
- Opsi kosong select: `src/components/content/DraftImageCard.tsx:461` (`<option value="">(tanpa angle khusus)</option>`).
- Notice error inline: `src/components/admin/llm/ActionFeedback.tsx` (`ActionNoticeView` dengan `detail` collapsible).
- Responsif kartu: `src/components/admin/DashboardCards.tsx:236-248` (`flex flex-wrap`, `min-w-0 flex-1`, `truncate`).

## Scope

In-scope:
- `src/components/admin/ResearchListClient.tsx` (responsif list).
- `src/app/[locale]/(admin)/admin/riset/[sessionId]/page.tsx` (collapsed Topik/Performa/Log).
- Investigasi sesi `b8766d73` (read-only) + fix/UI hint bila terbukti bug.
- `src/app/[locale]/(admin)/admin/page.tsx` + `src/components/admin/DashboardCards.tsx` (Draf Terbaru informatif).
- `src/components/content/ContentDraftCard.tsx`, `src/components/content/DraftImageCard.tsx`, `src/components/content/PostImageControl.tsx` (default collapsed + opsi tanpa subjek).
- `src/lib/admin/visual-actions.ts` (guard `sort_order`), investigasi error tambah template.
- Test + typecheck + lint yang menyentuh file di atas.

Out-of-scope:
- Ubah state-machine riset (`src/lib/research/state-machine.ts`) — `awaiting_selection -> developing` tetap manual by design, kecuali investigasi membuktikan automation gagal diam-diam.
- Migrasi data `sort_order=0` massal — hanya setelah user setuju (non-destructive, butuh backup).
- Ubah backend `suggestImagePrompt`/`enhanceImagePrompt` — sudah mendukung `null` subject.

## Milestones

1. Investigasi read-only selesai (#3 sesi b8766d73, #7b error tambah).
2. Fix aman selesai (#7a guard sort_order, #6 opsi kosong, #5 collapsed).
3. Fix menengah selesai (#4 dashboard, #2 details, #1 responsif).
4. Gate hijau + review diff + commit/push sesuai AGENTS repo.

## Tasks

- [ ] T0. Setup & baseline gate
- [ ] T1. List admin/riset responsif
- [ ] T2. Detail admin/riset default collapsed (Topik, Performa, Log)
- [ ] T3. Investigasi sesi b8766d73 berhenti di awaiting_selection
- [ ] T4. Dashboard Draf Terbaru informatif
- [ ] T5. Review konten visualisasi default collapsed
- [ ] T6. Template subjek opsi tanpa subjek khusus
- [ ] T7a. Fix edit Template Subjek reset priority ke 0
- [ ] T7b. Investigasi + fix tambah template selalu error / tombol coba lagi
- [ ] T8. Gate akhir + commit/push

---

### T0. Setup & baseline gate

1. `git status --short`, `git log --oneline -10`. Pastikan working tree bersih atau catat file kotor.
2. Jalankan baseline (catat hasil, jangan lanjut bila merah tanpa alasan):
   ```
   npm run typecheck
   npm run lint
   npm test
   ```
3. Aturan gate final (insiden 2026-09-10): SETIAP edit setelah gate hijau MEMBATALKAN gate. Re-run `typecheck + lint` sebelum commit; tambah `npm run build` bila menyentuh konstanta/import server.

### T1. List admin/riset responsif (issue #1)

File: `src/components/admin/ResearchListClient.tsx:114-130`.

Kode saat ini:
```tsx
<Link ... className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary">
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-medium text-ink">{...}</p>
    <p className="text-xs text-ink-muted">{...platform...} · {formatDateTime(...)} · {...}</p>
    {s.error_message ? <p className="truncate text-xs text-red-600">...</p> : null}
  </div>
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ...`}>{s.status}</span>
</Link>
```

Langkah:
1. Ubah `Link` jadi stack vertikal di mobile:
   `flex flex-col gap-2 ... sm:flex-row sm:items-center sm:justify-between sm:gap-3`.
2. Judul: ganti `truncate` menjadi `break-words line-clamp-2 sm:truncate` agar di HP 2 baris, di desktop 1 baris.
3. Meta: tambah `break-words` + `flex flex-wrap gap-x-2`. Contoh:
   ```tsx
   <p className="flex flex-wrap gap-x-2 break-words text-xs text-ink-muted">
     <span>{platform}</span><span aria-hidden>·</span><span>{tanggal}</span><span aria-hidden>·</span><span>{lokasi}</span>
   </p>
   ```
4. Error: `truncate` → `break-words line-clamp-2`.
5. Badge: tambah `self-start shrink-0 sm:self-center`.
6. Pagination `nav` (`134`): tambah `flex-wrap gap-2`.
7. Jangan ubah query/filter/pagination logic. Jangan ubah `max-w-5xl` di page.

Verifikasi:
- `npm run typecheck && npm run lint`.
- Manual 360px: tidak ada scroll horizontal, judul max 2 baris, badge di bawah judul rata kiri. 768px/1280px: tampilan 1 baris seperti semula.

Risiko: rendah. Jangan pakai `overflow-x-auto` sebagai solusi.

### T2. Detail admin/riset default collapsed (issue #2)

File: `src/app/[locale]/(admin)/admin/riset/[sessionId]/page.tsx`.

Bagian target:
- Topik: `501-540` (`<section className="mt-8 space-y-3">` + `<h2>{t('topicsHeading')}</h2>` + `ol`).
- Performa: `542-599` (`perfHeading` + `ResearchPerfCharts` + `details` LLM/Search + link log).
- Log: `601-671` (`id="logs"`, form filter, `ol`, pagination).

Langkah (ikuti pola `DraftImageCard.tsx:358`):
1. Topik:
   ```tsx
   <section className="mt-8 space-y-3">
     <details>
       <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
         <h2 className="inline text-lg font-semibold text-ink">{t('topicsHeading')} <span className="text-sm font-normal text-ink-muted">({list.length})</span></h2>
       </summary>
       <div className="mt-3 space-y-2">...isi ol lama...</div>
     </details>
   </section>
   ```
2. Performa: sama, ringkasan `LLM (n) · Search (m)` di summary. Isi `ResearchPerfCharts` + details + link pindah ke dalam div.
3. Log: paling sensitif karena ada form GET + pagination + anchor `#logs`.
   - Pertahankan `<section id="logs" className="mt-8 scroll-mt-20 space-y-3">` sebagai wrapper.
   - Taruh `<details>` DI DALAM section, setelah h2? Atau h2 masuk summary. Saran: h2 + count masuk summary, form + ol + pagination masuk div.
   - Auto-open bila relevan: bila `logPage > 1` atau ada filter aktif (`logLevel!=='all'` / `logStage!=='all'` / `logSort==='oldest'`) maka render `<details open>`, selain itu `<details>` tertutup. Ini server-side, aman dari re-render client. Jangan pakai JS `useEffect` karena ini Server Component.
4. Yang tetap terbuka: `ResearchParams`, `ResearchStepper`, aksi `awaiting_selection`, draf. Jangan collapse.
5. Jangan tambah key i18n baru bila bisa hindari; pakai count angka saja.

Verifikasi:
- Buka sesi dengan topik + log banyak: ketiga bagian tertutup default.
- Pagination log (`logPage=2`) terbuka otomatis dan anchor `#logs` masih lompat benar.
- Filter log submit tetap berfungsi.

Risiko: sedang. Counter-argument: `<details>` tanpa `open` akan menutup juga saat user klik pagination (full server reload) — mitigasi auto-open di atas wajib.

### T3. Investigasi sesi b8766d73 (issue #3)

Konteks kode (sudah diverifikasi):
- `src/lib/research/orchestrator.ts:210-213` — `awaiting_selection` return `advanced:false` (menunggu admin). `advancePendingSessions:315` tidak memungut status ini.
- `src/lib/automation/runner.ts:592-629` — `advanceRun` memajukan automation: shortlist `limit cfg.maxTopics`, update `status='developing'` dengan `eq('status','awaiting_selection')`, backdate 10 menit. Gagal diam bila `ids.length===0` (run failed) atau `!moved` (`changed:false`).
- Jadi berhentinya sesi automation di `awaiting_selection` >10 menit = anomali, TAPI sesi manual di status itu = normal.

Langkah read-only (MCP database READ ONLY, hanya SELECT/WITH):
```sql
SELECT id, status, mechanism, topic, required_winners, error_message, created_at, updated_at, current_stage_started_at
FROM content_research_sessions WHERE id = 'b8766d73-3c18-4bb1-ac99-87aa77fee3b0';
SELECT run_date, slot_key, status, error_message, attempts, product_id, article_draft_id
FROM automation_runs WHERE session_id = 'b8766d73-3c18-4bb1-ac99-87aa77fee3b0';
SELECT stage, level, message, created_at
FROM content_research_logs WHERE session_id = 'b8766d73-3c18-4bb1-ac99-87aa77fee3b0'
ORDER BY created_at DESC LIMIT 30;
SELECT id, rank, status FROM content_research_topics
WHERE session_id = 'b8766d73-3c18-4bb1-ac99-87aa77fee3b0' ORDER BY rank LIMIT 20;
```

Keputusan:
- A. Tidak ada `automation_runs` untuk sesi ini → sesi manual. BUKAN bug. Fix = UI hint saja: di blok `awaiting_selection` tambah teks "Sesi manual — pilih topik lalu Lanjut ke Development" vs "Sesi automation". Lihat `ResearchSessionActions` untuk penempatan.
- B. Ada run dengan `status failed` + `error discovery tidak menghasilkan topik` → topik 0. Fix = surfaced error di halaman sesi (tampilkan `automation_runs.error_message` bila ada), bukan ubah orchestrator.
- C. Ada run open (`session_created/developing`) tapi sesi tetap `awaiting_selection` lama → cek `attempts`, `updated_at` run (cron jalan?), `topics` kosong atau `!moved` race. Fix = tambah log saat `!moved` di `runner.ts:625` + pastikan cron automation aktif.
- D. Mekanisme `dua` tanpa produk valid → cek `content_research_session_products`. Fix mengikuti validasi `advanceToDevelopment` di `src/lib/content/actions.ts:931-964`.

Dilarang: auto-advance semua `awaiting_selection` di `orchestrator.ts`. Itu menghancurkan alur manual.

Verifikasi: tulis temuan (A/B/C/D + bukti query) di Progress Log. Implementasi fix hanya untuk cabang terbukti.

### T4. Dashboard Draf Terbaru informatif (issue #4)

File:
- `src/app/[locale]/(admin)/admin/page.tsx:57-96`
- `src/components/admin/DashboardCards.tsx:216-253`

Akar (sudah diverifikasi): `recentDrafts` join `content_requests(id, topic)` via `request_id`, tapi draf riset punya `request_id = sessionId` / `research_topic_id`, sehingga `topic=''` dan kartu hanya menyisakan `provider · model`.

Langkah:
1. Di `admin/page.tsx`, perluas select draf:
   `id, request_id, research_topic_id, platform_slug, status, created_at, generated_thread, affiliate_injections, llm_meta`.
2. Batch-fetch (2 query, jangan N+1):
   - `content_requests(id, topic)` untuk `request_id` yang cocok (legacy).
   - `content_research_topics(id, topic)` untuk `research_topic_id`.
3. Bentuk `topic` final: `research_topic ?? request_topic ?? excerpt(generated_thread.main.id, 80) ?? '(tanpa judul)'`.
4. Di `DashboardCards.tsx` `RecentDraftsList`:
   - Baris 1: judul/topik (`shortTopic`, sudah ada).
   - Baris 2 (baru): `{platform_slug ?? 'all'} · {status} · {tanggal}`. Tanggal: `new Date(created_at).toLocaleString(locale)` atau teruskan string jadi. Tambah `platform_slug` + `created_at` ke interface `RecentDraft` bila belum ada.
   - Baris 3: kecilkan `provider · model` (tetap ada, bukan dihapus).
5. Jangan ubah query `pending/failed/needsReview`/trend/funnel.

Verifikasi: draf riset menampilkan topik/platform/tanggal; draf legacy tetap tampil; tidak ada `topic` kosong.

Risiko: rendah. Counter: excerpt thread ID (bahasa Indonesia) bisa panjang — tetap potong 80 char via `shortTopic`.

### T5. Review konten visualisasi default collapsed (issue #5)

File:
- `src/components/content/ContentDraftCard.tsx:110-119` (artikel cover), `342-352` (thread cover).
- `src/components/content/DraftImageCard.tsx:45,358` (sudah mendukung `defaultCollapsed`).
- `src/components/content/PostImageControl.tsx:43` (`collapsed=true` default) tapi dipanggil dengan `collapsed={!perReplyEnabled}` di `ContentDraftCard.tsx:337`.

Langkah:
1. `ContentDraftCard.tsx`: ubah kedua `defaultCollapsed={false}` → `defaultCollapsed` (hapus `={false}` agar default `false`? TIDAK — eksplisit `={true}`). Tepatnya:
   - `118-119`: `<DraftImageCard ... defaultCollapsed />` atau `defaultCollapsed={true}`.
   - `351`: sama.
2. `ContentDraftCard.tsx:337`: ubah `collapsed={!perReplyEnabled}` → `collapsed` (selalu true). Hapus ketergantungan `perReplyEnabled` untuk collapsed; `perReplyEnabled` tetap dipakai untuk enable/disable generate di dalam.
3. Pastikan tombol `Generate/Regenerate` + `Muat ulang` tetap di `summary` (sudah ada di `DraftImageCard.tsx:359-379`), jadi user tidak harus buka dulu untuk aksi utama.
4. Jangan ubah logic `prompt_ready` notice; hanya collapsed.

Verifikasi: buka review artikel + thread (mode per-reply on/off): semua panel Visualisasi tertutup, tombol di header panel tetap klik.

Risiko: rendah. Trade-off: +1 klik untuk generate — sesuai permintaan user.

### T6. Template subjek opsi tanpa subjek khusus (issue #6)

File: `src/components/content/DraftImageCard.tsx:73,441-453`, `src/components/content/PostImageControl.tsx:73` + select subjeknya.

Kode saat ini (`DraftImageCard`):
```tsx
const [subjectSlug, setSubjectSlug] = useState(() => options.subjects[0]?.slug ?? '');
...
<select value={subjectSlug} onChange={...}>
  {options.subjects.map((s) => (<option key={s.slug} value={s.slug}>{s.display_name}</option>))}
</select>
```
Kamera punya opsi kosong (`<option value="">(tanpa angle khusus)</option>`), subjek tidak.

Langkah (kedua file sama):
1. Inisialisasi: `useState(() => '')`. Alasan: jangan auto-pilih template pertama. Rehydrate dari histori? Cover tidak menyimpan `subject_slug` (lihat komentar `DraftImageCard.tsx:135`), jadi default kosong benar. Untuk per-reply, bila histori punya subject valid boleh rehydrate, tapi default tetap `''`.
2. Tambah opsi pertama:
   ```tsx
   <option value="">(tanpa subjek khusus)</option>
   ```
3. Pastikan pengiriman `subjectSlug || null` (sudah benar di `handleSuggest:238`, `handleEnhance:305`, `enqueue`). Backend `lib/image/actions.ts:548,557` sudah handle `null` → jangan ubah backend.
4. `title`/tooltip bila menyebut wajib pilih subjek → sesuaikan.

Verifikasi: pilih kosong → `Siapkan prompt awal`, `Sempurnakan`, `Generate` sukses tanpa error `subject tidak dikenal`.

Risiko: rendah.

### T7a. Fix edit Template Subjek reset priority ke 0 (issue #7 bagian 1)

File: `src/lib/admin/visual-actions.ts:58-73,138-151`.

Akar (pasti):
```ts
const sortOrder = Number(String(formData.get('sort_order') ?? '').trim()); // '' -> 0
if (Number.isFinite(sortOrder)) patch.sort_order = Math.floor(sortOrder); // 0 lolos -> reset ke 0
```
Form edit (`SubjectForms.tsx:74-138`, `CameraAngleForms.tsx:74-138`) tidak mengirim `sort_order` sama sekali.

Langkah:
1. `updateSubject`:
   ```ts
   const rawSort = String(formData.get('sort_order') ?? '').trim();
   if (rawSort !== '') {
     const n = Number(rawSort);
     if (Number.isFinite(n)) patch.sort_order = Math.floor(n);
   }
   ```
2. `updateCameraAngle`: sama persis.
3. Jangan tambah input `sort_order` ke form edit (urutan diatur via drag di board). Jangan ubah `addSubject`/`addCameraAngle`/`reorder*`.
4. Data yang sudah terlanjur `0`: JANGAN update massal di tugas ini. Catat di Notes + tanya user. Bila user setuju, tugas terpisah dengan backup + migrasi non-destruktif.

Verifikasi:
- Buat template dummy, catat `sort_order`, edit nama → `sort_order` tetap.
- `npm run typecheck && npm run lint`; cek `SubjectBoard` tidak lagi tampil `#0` setelah edit.

Risiko: rendah untuk kode; tinggi bila nekat repair data — dipisah.

### T7b. Investigasi + fix tambah template selalu error / tombol coba lagi (issue #7 bagian 2)

File: `src/lib/admin/visual-actions.ts:38-56`, `src/components/admin/visual/SubjectForms.tsx:17-72`, `src/app/[locale]/(admin)/admin/visual/page.tsx:53-66,107-116`.

Fakta: dari kode statis, `addSubject` valid (insert + `revalidatePath('/admin/visual')` + `'/konten/review'`). Jadi JANGAN tebak; investigasi dulu.

Langkah:
1. Reproduksi: tambah template dengan nama unik, catat pesan + `Detail teknis` (klik `Detail teknis` di `ActionNoticeView`). Bedakan 2 jenis error:
   - Notice merah inline `Gagal menambah.` = server action return `{ok:false}` (mis. slug duplikat, validasi `subject_en`, RLS).
   - Halaman error Next.js full + tombol `Coba lagi` = error boundary `Suspense SubjectsSection` throw (query gagal / `Supabase not configured` / throw di server action via `requireAdmin`).
2. Cek kandidat berurutan:
   - Slug duplikat: `slugify(displayName)` tabrakan → `error.message` duplicate key. Fix = tampilkan pesan jelas + sarankan isi slug manual (kode sudah tampilkan `detail`, pastikan tidak ditelan).
   - `SUBJECT_EN_MIN/MAX` di `visual-limits.ts` → pastikan pesan validasi sesuai.
   - RLS `image_subject_templates` insert (service role vs anon) — cek migrasi `20260910000003_image_subject_templates.sql:15-18` + policy user read `20260911000002`.
   - `revalidatePath` — pastikan tidak ada path kurung yang dilempar dari `addSubject` (saat ini aman).
3. Fix hanya yang terbukti. Minimal: pastikan `addSubject` tidak `throw` mentah (return `{ok:false}`), dan form menampilkan `detail` (sudah). Bila error boundary, perbaiki `SubjectsSection` agar return `<p role="alert">` bukan throw (sudah return, pertahankan).
4. Jangan ubah `SubjectBoard` drag logic.

Verifikasi: tambah 2 template unik berurutan tanpa error; duplikat slug menampilkan pesan jelas tanpa crash halaman.

### T8. Gate akhir + commit/push

1. Re-run penuh (wajib setelah edit terakhir, sekecil apa pun):
   ```
   npm run typecheck
   npm run lint
   npm test
   ```
   Tambah `npm run build` bila menyentuh import server/konstanta.
2. `git status --short`, `git diff` (scan secret: `.env*`, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`). Stage hanya file dimaksud.
3. Commit Conventional Commits satu baris tanpa trailer, mis. `fix(admin): riset responsif, collapsed panel, dashboard draf, visual subjek`.
4. Push; bila ditolak: `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate ulang, push lagi. Laporkan hash + file kunci.

## Risks

- T2 anchor/pagination log rusak bila `details` menelan `id="logs"` — mitigasi wrapper section tetap + auto-open saat `logPage>1`/filter aktif.
- T3 salah simpulkan automation vs manual tanpa query — mitigasi query read-only dulu, fix hanya cabang terbukti.
- T4 N+1 query bila fetch topik per draf — mitigasi 2 query batch.
- T7a repair data `sort_order=0` tanpa backup — DILARANG di tugas ini; pisahkan.
- T7b tebak penyebab error tambah — wajib reproduksi + baca `Detail teknis` dulu.
- Gate basi: setiap edit setelah hijau membatalkan gate — re-run sebelum commit.

## Progress Log

- 2026-09-20 12:00:00 — Plan detail dibuat untuk 7 temuan; belum ada implementasi.
- 2026-09-20 12:00:00 — T3 & T7b masih tahap investigasi (butuh query read-only + reproduksi).

## Notes

- Standar domain: ini proyek konten/affiliate umum, bukan rating/billing telekomunikasi — rujukan C2M/TM Forum ODA tidak relevan; cukup jaga pola repo (Server Component + server action + RLS ketat + i18n `next-intl`).
- "Priority" di issue #7 = kolom `sort_order` (tampil `#N` di board). Tidak ada kolom `priority` di `image_subject_templates`.
- Backend image (`suggest/enhance/generate`) sudah mendukung `subjectSlug=null`; hanya UI picker yang memaksa pilih.
- `awaiting_selection` manual = by design menunggu admin (`orchestrator.ts:210`); automation dimajukan `runner.ts:592`.
- File plan ini satu-satunya sumber status; update checklist + Progress Log saat eksekusi.
