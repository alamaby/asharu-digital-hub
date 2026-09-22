# Implementation Plan — Admin Automation History, Anti-Repeat Produk, Visual Crash, Featured Verification

Created: 2026-09-22 (Asia/Jakarta)

## Objective

Menangani 4 finding terkonfirmasi tanpa desain ulang: (1) Riwayat run `admin/automation` tanpa pagination + tanpa card produk + tanpa jam mulai/selesai + tanpa nama topik; (2) pemilihan produk automation dapat mengulang produk yang sama di sesi beruntun (kasus HUAWEI Band 11 Series 2x); (3) crash deterministik `TypeError: Cannot read properties of undefined (reading 'sort_order')` setiap tambah template di `admin/visual` (stack trace produksi sudah mengonfirmasi lokasi `renderItem`); (4) verifikasi cara sistem menentukan produk featured (tanpa perubahan kode).

## Scope

- IN: `admin/automation` history pagination(10/halaman)+filter+search+q resolver, card produk, jam HH:mm, topik utama; knob blackout produk 14 hari global + fallback + logging; fix crash visual + hardening + test; verifikasi featured.
- OUT: perubahan logika scraper `is_featured`, workflow CI scrape, kolom generated `featured_rank`, copy `error.tsx`/i18n, RLS, UI slot-level blackout (kolom DB disiapkan, UI ditunda), date-range filter run history (ditunda, lihat OQ-2).

## Milestones

1. M1 — Baseline hijau + crash visual sembuh + test visual hijau (S0–S5).
2. M2 — Riwayat run baru live dengan pagination/filter/card/jam/topik (S6–S8).
3. M3 — Blackout produk live + knob admin (S9–S13).
4. M4 — Featured terverifikasi + gate final + handoff (S14–S15).

## Tasks

- [ ] S0 baseline gate hijau
- [ ] S1 SortableList sync via useEffect
- [ ] S2 SubjectBoard null-safe renderItem
- [ ] S3 CameraAngleBoard null-safe renderItem
- [ ] S4 hardening counts provider visual
- [ ] S5 test visual (3 file)
- [ ] S6 helper murni automation-runs-query + test
- [ ] S7 automation page: query+pagination+filter+search
- [ ] S8 automation page: render card/topik/jam
- [ ] S9 migrasi 20260922000003 blackout columns
- [ ] S10 config+schedule blackoutDays + test
- [ ] S11 blackoutCutoff scheduler + test
- [ ] S12 runner createRun exclusion+fallback+log + test
- [ ] S13 knob admin blackout 0–90 + test
- [ ] S14 verifikasi featured (tanpa kode)
- [ ] S15 gate final + handoff

## Risks

- Riwayat run: query `q` lintas-tabel menambah 2 query hanya saat mencari; cap 50 ID menjaga panjang URL PostgREST (lihat OQ-1).
- Blackout 14 hari × pool 50 × multi-slot dapat sering jatuh ke fallback L2/L1 — by-design agar run tidak pernah gagal total; fallback selalu di-log.
- Interleaving Flight exact penyebab crash tidak dapat diturunkan statis; fix menghilangkan seluruh kelas crash di lokasi yang terbukti oleh stack trace (lihat OQ-4).
- Submodule `supabase/`: migrasi harus di-commit di submodule DULU baru parent (aturan repo).

## Progress Log

- 2026-09-22 — Plan dibuat dari temuan terverifikasi + stack trace produksi + jawaban user (page 10, selesai=published_at fallback updated_at, topik utama, blackout custom default 14 global, filter/search disetujui). Belum ada implementasi.

## Notes

- Keputusan user yang dikunci: halaman 10; Selesai = `published_at ?? updated_at`; topik utama saja; blackout default 14 hari global; filter/search run disetujui.
- Bahasa label UI baru: hard-code Indonesia mengikuti gaya halaman (tanpa key i18n baru, tanpa menyentuh `messages/*.json`).
- Konvensi file plan repo (`plans/YYYY-MM-DD-<nama>.md`, satu file satu plan) dipenuhi oleh file ini.

---

## Implementation Steps

### S0 — Baseline gate hijau (tanpa ubah kode)

- **Tujuan:** pastikan titik awal hijau sebelum menyentuh apa pun.
- **Finding:** prasyarat semua langkah; aturan repo mewajibkan gate hijau sebelum commit.
- **Dependency:** tidak ada.
- **Baca:** `package.json` (skrip: `typecheck=tsc --noEmit`, `lint=eslint .`, `test=vitest run`).
- **Ubah:** tidak ada file.
- **Simbol:** —
- **Kondisi kini:** tidak diketahui, harus diukur.
- **Perubahan:** tidak ada.
- **Urutan:** tidak ada.
- **Behavior dipertahankan:** —
- **Error/edge:** bila salah satu gate merah → STOP, catat output sebagai blocker di Progress Log, jangan lanjut ke S1.
- **Test:** tidak ada (langkah ini sendiri adalah verifikasi).
- **Command verifikasi:** `npm run typecheck`, `npm run lint`, `npm test` (workdir repo).
- **Hasil diharapkan:** ketiga command exit 0.
- **Completion criteria:** ketiga gate hijau, hasilnya dicatat di Progress Log.
- **Dilarang ubah:** seluruh repo.

### S1 — SortableList: sync props→state via useEffect (hapus setState saat render)

- **Tujuan:** hilangkan pola `setTimeout(setIds)` di badan render yang berlomba dengan Flight update.
- **Finding:** F3-crash-visual (faktor pendukung; lokasi crash ada di S2/S3, race window ada di sini). File `src/components/admin/llm/SortableList.tsx:61-70`.
- **Dependency:** S0.
- **Baca:** `src/components/admin/llm/SortableList.tsx` (seluruh file, 126 baris).
- **Ubah:** `src/components/admin/llm/SortableList.tsx` saja.
- **Simbol:** `SortableList`, `ids`, `setIds`, `items`, `handleDragEnd`, `onReorder`, `onSettled`.
- **Kondisi kini:** `const [ids, setIds] = useState(() => items.map((i) => i.id));` + blok render `if (ids.length !== items.length || ids.some(...)) { setTimeout(() => setIds(...), 0); }`.
- **Perubahan konkret:**
  1. Baris 3: `import { useState } from 'react';` → `import { useEffect, useState } from 'react';`
  2. Hapus blok `if (...) { setTimeout(...) }` (3 baris) → ganti dengan:
     ```tsx
     useEffect(() => {
       setIds((prev) => {
         if (prev.length === items.length && prev.every((id, i) => id === items[i]!.id)) return prev;
         return items.map((i) => i.id);
       });
     }, [items]);
     ```
- **Urutan:** edit import dulu, lalu ganti blok sync. Jangan sentuh `handleDragStart/Cancel/End`, `SortableContext`, `DragOverlay`.
- **Behavior dipertahankan:** reorder optimistik saat drag tetap langsung (`setIds(next)` di `handleDragEnd` tidak diubah); rollback saat `onReorder` gagal tetap (`setIds(prev)`); sync konten (bukan identitas array) sehingga render ulang parent tanpa perubahan isi tidak me-reset.
- **Error/edge:** `items[i]!` aman karena indeks < length; effect jalan setelah paint (setara timing `setTimeout 0` sebelumnya);drag yang sedang berjalan + props baru bersamaan → effect menang (urutan server), `activeId` tetap konsisten karena `SortableContext items={ids}`.
- **Test:** S5 (T-SortableList).
- **Command verifikasi:** `npx vitest run src/components/admin/llm/SortableList.test.tsx` (setelah S5) + `npm run typecheck`.
- **Hasil diharapkan:** test hijau, typecheck hijau.
- **Completion criteria:** tidak ada lagi `setTimeout`/`setIds` di badan render; drag-reorder manual tetap menyimpan urutan.
- **Dilarang ubah:** `SubjectBoard.tsx`, `CameraAngleBoard.tsx` (itu S2/S3), API `onReorder/onSettled`.

### S2 — SubjectBoard: renderItem null-safe (lokasi crash stack trace)

- **Tujuan:** hilangkan `TypeError reading 'sort_order'` di `renderItem` yang terbukti oleh stack produksi.
- **Finding:** F3-crash-visual (akar langsung). File `src/components/admin/visual/SubjectBoard.tsx:52-53`: `const s = subjects.find((x) => x.slug === id)!;` lalu `s.sort_order`.
- **Dependency:** S1 (urutan risiko; secara teknis independen, kerjakan setelah S1 agar window race sudah menyempit).
- **Baca:** `src/components/admin/visual/SubjectBoard.tsx` (85 baris).
- **Ubah:** `src/components/admin/visual/SubjectBoard.tsx` saja.
- **Simbol:** `SubjectBoard`, `renderItem`, `SubjectRow`.
- **Kondisi kini:** non-null assertion `!` → throw bila `id` tidak ada di `subjects` (state `ids` basi vs props baru saat Flight update pasca-`addSubject`).
- **Perubahan konkret** (dalam callback `renderItem`, sebelum `const rowBusy`):
  ```tsx
  const s = subjects.find((x) => x.slug === id);
  if (!s) return <p className="text-xs text-ink-muted">Memuat template…</p>;
  ```
  Hapus `!`. Sisa JSX tidak diubah.
- **Urutan:** 1 edit itu saja.
- **Behavior dipertahankan:** semua baris yang ketemu render identik (sort_order, display_name, slug, subject_en, checkbox, link Detail); fallback hanya muncul transien dan hilang setelah sync S1.
- **Error/edge:** fallback tanpa tombol/link sehingga tidak ada handler yang menyentuh data hilang; tidak mengubah logika toggle/reorder.
- **Test:** S5 (T-SubjectBoard growth + shrink).
- **Command verifikasi:** `npx vitest run src/components/admin/visual/SubjectBoard.test.tsx` + `npm run typecheck`.
- **Hasil diharapkan:** hijau.
- **Completion criteria:** tidak ada `!` pada hasil `find` di file ini; tambah template 3x manual tanpa error page.
- **Dilarang ubah:** `SubjectForms.tsx`, `visual-actions.ts`, query `SubjectsSection`, copy i18n.

### S3 — CameraAngleBoard: renderItem null-safe (kode kembar, crash class sama)

- **Tujuan:** tutup crash class yang sama di board kedua (satu halaman, satu error boundary).
- **Finding:** F3-crash-visual (varian). File `src/components/admin/visual/CameraAngleBoard.tsx:52-53`: `const a = angles.find((x) => x.slug === id)!;` lalu `a.sort_order`.
- **Dependency:** S2 (pola identik, kerjakan berurutan).
- **Baca:** `src/components/admin/visual/CameraAngleBoard.tsx` (85 baris).
- **Ubah:** `src/components/admin/visual/CameraAngleBoard.tsx` saja.
- **Simbol:** `CameraAngleBoard`, `renderItem`, `CameraAngleRow`.
- **Kondisi kini:** sama dengan S2.
- **Perubahan konkret:**
  ```tsx
  const a = angles.find((x) => x.slug === id);
  if (!a) return <p className="text-xs text-ink-muted">Memuat angle…</p>;
  ```
- **Urutan, behavior, error/edge, verifikasi:** sama dengan S2 (test `CameraAngleBoard.test.tsx`).
- **Completion criteria:** tidak ada `!` pada hasil `find`; tambah angle 3x manual tanpa error page.
- **Dilarang ubah:** `CameraAngleForms.tsx`, `visual-actions.ts`, query `CameraAnglesSection`.

### S4 — Hardening: counts provider visual tahan throw (satu boundary, tiga section)

- **Tujuan:** satu section gagal tidak boleh menjatuhkan seluruh halaman `admin/visual`.
- **Finding:** F3-laten (ditemukan saat analisa): `src/app/[locale]/(admin)/admin/visual/page.tsx:34-41` loop count tanpa try/catch; throw jaringan = error boundary yang sama dengan laporan user.
- **Dependency:** S3.
- **Baca:** `src/app/[locale]/(admin)/admin/visual/page.tsx` lines 21-51.
- **Ubah:** file itu saja, blok loop `for (const p of provRows)`.
- **Simbol:** `ImageProvidersSection`, `counts`.
- **Kondisi kini:** `const [{ count: mc }, { count: kc }] = await Promise.all([...]); counts.set(p.id, {...})` tanpa guard.
- **Perubahan konkret:** bungkus isi loop:
  ```tsx
  for (const p of provRows) {
    try {
      const [{ count: mc }, { count: kc }] = await Promise.all([... existing ...]);
      counts.set(p.id, { models: mc ?? 0, keys: kc ?? 0 });
    } catch {
      counts.set(p.id, { models: 0, keys: 0 });
    }
  }
  ```
  Query pertama + early-return error (`:26-33`) tidak diubah.
- **Behavior dipertahankan:** saat sukses output identik; saat gagal tampil 0, bukan error page.
- **Error/edge:** catch tanpa log (hindari noise); tidak menelan error query provider utama.
- **Test:** tidak ada unit test baru (jalur hanya throw saat Supabase throw); verifikasi manual + typecheck.
- **Command verifikasi:** `npm run typecheck`.
- **Completion criteria:** loop terbungkus try/catch; halaman tetap render saat counts gagal (simulasi: matikan jaringan sesaat / tinjau kode).
- **Dilarang ubah:** `SubjectsSection`, `CameraAnglesSection`, `ImageBoards.tsx`.

### S5 — Test visual: sync growth + kedua board growth/shrink

- **Tujuan:** kunci fix S1–S3 agar tidak regresi.
- **Finding:** F3 (setiap finding wajib punya test/metode verifikasi).
- **Dependency:** S1–S4 selesai.
- **Baca:** `vitest.config.ts`, `vitest.setup.tsx`, `src/components/admin/FeaturedProductBoard.test.tsx` (pola mock navigasi/i18n), `src/components/admin/automation/SlotForms.test.tsx` (pola render/rerender bila ada).
- **Ubah (file BARU saja):** `src/components/admin/llm/SortableList.test.tsx`, `src/components/admin/visual/SubjectBoard.test.tsx`, `src/components/admin/visual/CameraAngleBoard.test.tsx`.
- **Simbol:** `SortableList`, `SubjectBoard`, `CameraAngleBoard`.
- **Perubahan konkret:**
  - T-SortableList: render `items=[{id:'a'},{id:'b'}]`, `renderItem=(id)=><span>{id}</span>`, `onReorder=async()=>{}`; `rerender` dengan `[a,b,c]`; `expect(await screen.findByText('c')).toBeInTheDocument()`.
  - T-SubjectBoard growth: rows `[{slug:'a',display_name:'A',subject_en:' Substansi cukup panjang untuk valid ',is_active:true,sort_order:10}, {...'b'...}]`; rerender + row c; `findByText(/C/)`; assert tidak throw.
  - T-SubjectBoard shrink (simulasi state basi): render rows `[a,b,c]`; rerender rows `[a,b]`; `await waitFor(()=>expect(screen.queryByText(/C/)).not.toBeInTheDocument())`; assert tidak throw (inilah yang meledak bila `!` dikembalikan).
  - T-CameraAngleBoard: mirror dengan field `angle_en`, fallback `Memuat angle…`.
- **Behavior dipertahankan:** —
- **Error/edge:** gunakan `findBy`/`waitFor` (effect async); bila `Link` next-intl butuh mock, tiru pola `FeaturedProductBoard.test.tsx`, jangan mock `@dnd-kit/*` kecuali jsdom gagal total (dokumentasikan bila terpaksa).
- **Command verifikasi:** `npx vitest run src/components/admin/llm/SortableList.test.tsx src/components/admin/visual/SubjectBoard.test.tsx src/components/admin/visual/CameraAngleBoard.test.tsx`.
- **Hasil diharapkan:** 3 file hijau.
- **Completion criteria:** semua asersi di atas lolos; kembalikan sementara `!` di S2 dan pastikan T-shrink merah (validasi mutasi, lakukan sekali lalu kembalikan).
- **Dilarang ubah:** file sumber S1–S4 selain verifikasi mutasi sementara yang dikembalikan.

### S6 — Helper murni riwayat run + unit test (fondasi S7/S8)

- **Tujuan:** logika pagination/filter/topik/durasi yang murni, teruji, dipakai page.
- **Finding:** F1-riwayat-run (kontrak data + format).
- **Dependency:** S5 (urutan milestone; teknis independen).
- **Baca:** `src/lib/admin/produk-query.ts` (pola `clampPage`, `escapeIlike`), `src/lib/automation/runner.ts:14-22` (union status run valid).
- **Ubah (BARU):** `src/lib/admin/automation-runs-query.ts`; (BARU) `src/lib/admin/automation-runs-query.test.ts`.
- **Simbol BARU:** `RUN_PAGE_SIZE=10`, `RunStatusFilter='all'|'active'|'completed'|'failed'`, `parseRunStatusFilter(v:unknown)`, `ACTIVE_RUN_STATUSES=['session_created','developing','awaiting_cover','publishing','published','notifying']`, `RunTopicRow{session_id,topic,rank,status}`, `pickPrimaryTopic(rows,sessionId):string|null`, `formatRunDuration(startIso,endIso):string`.
- **Kondisi kini:** tidak ada file; pola acuan `parseProdukFilter`/`clampPage`/`pageRange(page,pageSize)` sudah ada (pageRange menerima pageSize → pakai ulang, jangan duplikat).
- **Perubahan konkret:**
  - `parseRunStatusFilter`: whitelist 4 nilai, default `'all'` (mirror `parseProdukFilter`).
  - `pickPrimaryTopic`: kandidat `session_id` cocok; bila ada `status==='shortlisted'` pilih rank terkecil (`rank null→999`); bila tidak ada shortlisted pilih rank terkecil dari semua; kosong → `null`.
  - `formatRunDuration`: diff ms; invalid/negatif → `'—'`; `<60 mnt` → `'N mnt'`; selain itu `'H j MM mnt'` (menit 2-digit).
- **Behavior dipertahankan:** pakai `clampPage`/`pageRange` existing dari `produk-query.ts` (jangan buat versi baru).
- **Error/edge:** ISO invalid → `'—'`; rank null; session tanpa topik → `null` (page tampilkan fallback).
- **Test:** `automation-runs-query.test.ts` — input/expected eksplisit: parse('active')→'active', parse('x')→'all', parse(undefined)→'all'; pickPrimaryTopic shortlist rank 2 vs 1 → rank 1; tanpa shortlist → rank terkecil; kosong → null; duration 45mnt→'45 mnt', 125mnt→'2 j 05 mnt', end<start→'—', ISO rusak→'—'.
- **Command verifikasi:** `npx vitest run src/lib/admin/automation-runs-query.test.ts` + `npm run typecheck`.
- **Completion criteria:** semua asersi hijau; tidak ada duplikat `clampPage/pageRange`.
- **Dilarang ubah:** `produk-query.ts`, `runner.ts`, file page.

### S7 — Page automation: query pagination + filter + search (lapis data)

- **Tujuan:** riwayat run terpaginasi 10/halaman dengan filter status/slot dan search produk/topik, tanpa mengubah section config/slot/digest.
- **Finding:** F1 (data tampil semua tanpa pagination).
- **Dependency:** S6 (pakai helper + tipe).
- **Baca:** `src/app/[locale]/(admin)/admin/automation/page.tsx` (penuh, 385 baris), `src/lib/auth/timezone.ts` (konfirmasi signature `getDisplayTimezone`), `src/components/admin/FeaturedProductBoard.tsx:85-91` (pola `baseQuery` pagination).
- **Ubah:** `page.tsx` saja (S8 menyentuh region render di file yang sama setelah S7 merge).
- **Simbol:** `AutomationAdminPage`, `RunRow`, `runRows`, `slotRows`, `ACTIVE_RUN_STATUSES`, `parseRunStatusFilter`, `RUN_PAGE_SIZE`, `escapeIlike`, `clampPage`.
- **Kondisi kini:** `Promise.all` 7 query (`:249-283`); runs `.order('run_date',DESC).limit(20)` (`:252-258`); select tanpa `created_at/slot_key`; tanpa searchParams.
- **Perubahan konkret (berurutan):**
  1. Signature terima `searchParams: Promise<{ runPage?: string; runStatus?: string; runSlot?: string; q?: string }>`; `const sp = await searchParams;` `const runStatus=parseRunStatusFilter(sp.runStatus);` `const q=(sp.q??'').trim().slice(0,80);` `const runSlot=(sp.runSlot&&slotRows.some(s=>s.slot_key===sp.runSlot))?sp.runSlot:'all';` (slotRows tersedia dari Promise.all yang dipertahankan).
  2. Bangun filter pada query runs: `active`→`.in('status',[...ACTIVE_RUN_STATUSES])`; `completed`/`failed`→`.eq('status',...)`; slot≠all→`.eq('slot_key',runSlot)`. Terapkan IDENTIK pada count query (`select('id',{count:'exact',head:true})`) dan main query.
  3. Tambah `'created_at, slot_key'` ke kolom select runs (slot_key sudah ada; tambahkan created_at).
  4. `q` non-kosong: `esc=escapeIlike(q)`; `pIds=(await supabase.from('affiliate_products').select('id').or(\`name_id.ilike.%${esc}%,friendly_code.ilike.%${esc}%,merchant.ilike.%${esc}%\`).limit(50)).data→id[]`; `sIds=(await supabase.from('content_research_topics').select('session_id').ilike('topic',\`%${esc}%\`).limit(50)).data→session_id[]`; keduanya kosong → `totalCount=0, runRows=[]` (skip main query); selain itu tambah `.or(...)` hanya dari sisi non-kosong (`product_id.in.(...)`, `session_id.in.(...)`).
  5. `totalCount` dari count query; `totalPages=max(1,ceil(totalCount/10))`; `page=clampPage(sp.runPage,totalPages)`; `.range((page-1)*10,(page-1)*10+9)`; order tambah `.order('created_at',{ascending:false})` setelah `run_date DESC`.
  6. Batch produk: `pIds=unique(runRows.map(product_id).filter(Boolean))`; bila non-kosong select `id,friendly_code,name_id,image,merchant,category,url` `.in('id',pIds)` → `Map<string,ProductCard>`.
  7. Batch topik: `sIds2=unique(session_id...)`; select `session_id,topic,rank,status` `.in('session_id',sIds2).order('rank')` → `pickPrimaryTopic` per sesi; sesi tanpa hasil → query `content_research_sessions(id,topic).in(...)` sebagai fallback.
- **Behavior dipertahankan:** 7 query existing + section config/slot/digest/error-badge/retry/“Lihat sesi” tidak berubah; limit lama 20 diganti pagination 10 (keputusan user).
- **Error/edge:** `q` dengan `%/,` di-escape via `escapeIlike`; list `in()` dibatasi 50 agar URL PostgREST pendek; `product_id/session_id` null → lewati join, UI fallback di S8; slot tak dikenal → 'all'.
- **Test:** tak ada test baru di langkah ini (tercakup S6 + S8-manual); verifikasi via S8.
- **Command verifikasi:** `npm run typecheck` + `npm run lint -- src/app/[locale]/\(admin\)/admin/automation/page.tsx`? (perintah lint repo `eslint .`; untuk file: `npx eslint <path>`).
- **Completion criteria:** typecheck+lint hijau; variabel `runRows,page,totalPages,totalCount,productMap,topicMap,runStatus,runSlot,q` tersedia untuk S8.
- **Dilarang ubah:** `AutomationForms.tsx`, `SlotForms.tsx`, `ErrorDigestForms.tsx`, `runner.ts`, `messages/*.json`.

### S8 — Page automation: render card produk + jam + topik + pagination UI

- **Tujuan:** setiap record menampilkan card produk, Mulai–Selesai HH:mm + durasi, topik utama, kontrol halaman/filter.
- **Finding:** F1 (tampilan).
- **Dependency:** S7 (variabel data).
- **Baca:** `page.tsx` region `:337-384`, `src/components/admin/FixedProductCard.tsx` (props `title,products[]`), `src/lib/utils/format.ts:41-53` (`formatDateTime`), pola riset detail untuk `getDisplayTimezone`.
- **Ubah:** `page.tsx` region riwayat saja.
- **Simbol:** `FixedProductCard`, `formatDateTime`, `formatRunDuration`, `getDisplayTimezone`, `renderEmailBadge`, `RetryRunForm`.
- **Kondisi kini:** header “Riwayat run (20 terbaru)”; baris ID 8-char; `published_at.toLocaleString()`.
- **Perubahan konkret (berurutan):**
  1. Header → `<h2>Riwayat run</h2>` + `<p>{totalCount} run · halaman {page} dari {totalPages}</p>`; form GET filter (`runStatus` select all/active/completed/failed, `runSlot` select all+slot_key, `q` input) validezuihkan nilai kini.
  2. Per record, setelah baris status/email: `<FixedProductCard title="Produk" products={p?[p]:[]} />`; bila null → `<p className="...">Produk telah dihapus / tanpa produk.</p>`.
  3. Baris waktu: `Mulai {formatDateTime(created_at,locale,tz)} · Selesai {formatDateTime(published_at ?? updated_at,...)} (durasi {formatRunDuration(created_at, published_at ?? updated_at)})`.
  4. Baris topik: `Topik: {topic ?? 'Topik belum tersedia'}` (dari `topicMap`/fallback sesi).
  5. Pertahankan: badge email, retry, “Lihat sesi”, cover attempts, error_message, published count. Hapus baris ID 8-char lama (diganti card + link sesi).
  6. Navigasi bawah: Sebelumnya/Berikutnya + nomor, query string mempertahankan `runStatus/runSlot/q` (pola `baseQuery` FeaturedProductBoard); clamp Prev≥1 Next≤totalPages.
- **Behavior dipertahankan:** semua aksi/info lama tetap ada kecuali ID terpotong yang diganti card.
- **Error/edge:** `created_at` null (data pra-migrasi hipotetis) → '—'; image null → FixedProductCard tanpa img (komponen sudah handle); locale `en` didukung `formatDateTime`.
- **Test:** manual: halaman 1/2, filter tiap status, slot, `q` nama produk + kata topik, `q` tanpa hasil → empty state; record tanpa produk.
- **Command verifikasi:** `npm run typecheck`, `npm run lint`, `npm test`.
- **Completion criteria:** 10 baris/halaman; tiap record ada card+jam+topik; filter/search/pagination bekerja; gate hijau.
- **Dilarang ubah:** section config/slot/digest, `FixedProductCard.tsx`, `format.ts`, messages.

### S9 — Migrasi blackout columns (submodule dulu, parent kemudian)

- **Tujuan:** wadah konfigurasi `product_repeat_blackout_days` global + override slot.
- **Finding:** F2 (knob custom default 14).
- **Dependency:** S8 (urutan milestone).
- **Baca:** listing `supabase/migrations/` (konfirmasi file terakhir `20260922000002_error_digest_cron.sql`), `20260920000002_automation_schedules.sql:23-34` (pola kolom override NULL), `20260915000003_automation_config.sql:34-37` (pola CHECK knob).
- **Ubah (BARU, di submodule):** `supabase/migrations/20260922000003_automation_product_blackout.sql`.
- **Simbol/SQL:**
  ```sql
  ALTER TABLE public.automation_configs ADD COLUMN IF NOT EXISTS product_repeat_blackout_days int NOT NULL DEFAULT 14 CHECK (product_repeat_blackout_days BETWEEN 0 AND 90);
  ALTER TABLE public.automation_schedules ADD COLUMN IF NOT EXISTS product_repeat_blackout_days int NULL CHECK (product_repeat_blackout_days IS NULL OR (product_repeat_blackout_days BETWEEN 0 AND 90));
  ```
  Komentar: 0=nonaktif, NULL di slot=warisi global. Tanpa RLS baru (policy FOR ALL existing mencakup semua kolom), tanpa index baru.
- **Behavior dipertahankan:** non-destruktif, idempotent (`IF NOT EXISTS`), default 14 menjaga perilaku baru yang diinginkan user.
- **Error/edge:** rerun aman; database pra-migrasi → kode S10–S12 memakai `?? 14`.
- **Test:** tidak ada unit test; verifikasi = kolom ada pasca-apply (`SELECT product_repeat_blackout_days FROM automation_configs WHERE id=1;` → 14) oleh operator; pre-apply code path dicakup S10.
- **Command verifikasi:** `git -C supabase status --short`, review SQL; `npm run typecheck` (repo parent tak terpengaruh).
- **Completion criteria:** file ada di submodule; commit submodule DULU lalu parent pointer (aturan repo); pre/post-migrasi keduanya didukung kode.
- **Dilarang ubah:** migrasi lain, RLS, `unique` constraints, scraper, workflow.

### S10 — config + merge blackoutDays (toleran pra-migrasi)

- **Tujuan:** `AutomationConfig.productBlackoutDays` + pewarisan slot.
- **Finding:** F2.
- **Dependency:** S9 (kolom boleh belum ter-apply; kode toleran).
- **Baca:** `src/lib/automation/config.ts` (penuh; acuan `:63-64,:108-109` product_pool_size/category), `src/lib/automation/schedules.ts` (`:48-49,:152-153` pola `pick`), `config.test.ts`, `schedules.test.ts` (pola mock row).
- **Ubah:** `config.ts`, `schedules.ts`, `config.test.ts`, `schedules.test.ts`.
- **Simbol:** `AutomationConfig.productBlackoutDays: number`, `loadAutomationConfig`, `mergeSlotParams`, `pick`.
- **Kondisi kini:** belum ada field blackout.
- **Perubahan konkret:**
  1. `config.ts` type + mapping `productBlackoutDays: row.product_repeat_blackout_days ?? 14` (tiru `product_pool_size`).
  2. `schedules.ts` type slot `product_repeat_blackout_days: number | null` + merge `productBlackoutDays: pick(slot.product_repeat_blackout_days, global.productBlackoutDays)` (tiru baris 152-153).
  3. Test config: row tanpa kolom → 14; row 30 → 30. Test schedules: slot null → global; slot 7 → 7.
- **Behavior dipertahankan:** default 14 bila kolom/absen/null; slot null mewarisi.
- **Error/edge:** nilai DB di luar 0–90 (data liar) → clamp `Math.min(90,Math.max(0,n))` di mapping config (deterministik).
- **Command verifikasi:** `npx vitest run src/lib/automation/config.test.ts src/lib/automation/schedules.test.ts` + typecheck.
- **Completion criteria:** test baru hijau; test lama hijau.
- **Dilarang ubah:** field/knob lain, SQL, UI form (itu S13).

### S11 — blackoutCutoff di scheduler + test batas bulan

- **Tujuan:** fungsi tanggal murni untuk jendela blackout.
- **Finding:** F2.
- **Dependency:** S10.
- **Baca:** `src/lib/automation/scheduler.ts` (117 baris), `scheduler.test.ts` (pola).
- **Ubah:** `scheduler.ts` (+ export), `scheduler.test.ts` (+ kasus).
- **Simbol BARU:** `blackoutCutoff(runDate: string, days: number): string`.
- **Perubahan konkret** (akhir file, setelah `pickRandomProduct`):
  ```ts
  export function blackoutCutoff(runDate: string, days: number): string {
    const [y, m, d] = runDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
    dt.setUTCDate(dt.getUTCDate() - Math.max(0, Math.floor(days)));
    return dt.toISOString().slice(0, 10);
  }
  ```
- **Test input/expected:** ('2026-09-22',14)→'2026-09-08'; ('2026-09-01',14)→'2026-08-18'; ('2026-01-05',10)→'2025-12-26'; ('2026-09-22',0)→'2026-09-22'.
- **Error/edge:** days negatif/float → normalisasi; aritmetika UTC murni (konsisten dengan grain `run_date` bertipe date).
- **Command verifikasi:** `npx vitest run src/lib/automation/scheduler.test.ts`.
- **Completion criteria:** 4 kasus hijau.
- **Dilarang ubah:** `pickRandomIndex/pickRandomProduct`, `isRunDue`, apa pun selain append + test.

### S12 — runner createRun: eksklusi blackout global + fallback berlapis + log

- **Tujuan:** produk 14 hari terakhir (semua slot) tidak dipilih ulang; run tidak pernah gagal karena starvation.
- **Finding:** F2 (inti; menjelaskan repeat HUAWEI: pool newest-N + tanpa memori lintas-hari).
- **Dependency:** S10, S11.
- **Baca:** `src/lib/automation/runner.ts:257-295` (createRun pool/occupied/chosen), `runner.test.ts` (pola mock supabase insert/select).
- **Ubah:** `runner.ts` (blok createRun saja), `runner.test.ts` (+ kasus).
- **Simbol:** `createRun`, `pickRandomProduct`, `blackoutCutoff`, `AutomationConfig.productBlackoutDays`.
- **Kondisi kini:** `occupied` = same-day beda-slot; `available=pool−occupied` else pool penuh; log `produk ${chosen.id}`.
- **Perubahan konkret (berurutan, setelah query occupied `:279-286`):**
  1. `const blackoutDays = cfg.productBlackoutDays ?? 14;` `let blackoutIds: string[] = [];` bila `>0`: `const { data: recent } = await supabase.from('automation_runs').select('product_id').gte('run_date', blackoutCutoff(runDate, blackoutDays));` → map id non-null (TANPA filter slot = global, termasuk slot ini; aman karena createRun hanya dipanggil saat slot ini belum punya run hari itu).
  2. Ganti `:287-290` dengan:
     ```ts
     const occupiedSet = new Set(occupiedIds);
     const blackoutSet = new Set(blackoutIds);
     const l1 = poolRows.filter((p) => !occupiedSet.has(p.id) && !blackoutSet.has(p.id));
     const l2 = poolRows.filter((p) => !occupiedSet.has(p.id));
     const fallbackLevel = l1.length > 0 ? 0 : l2.length > 0 ? 1 : 2;
     const effective = l1.length > 0 ? l1 : l2.length > 0 ? l2 : poolRows;
     const chosen = pickRandomProduct(effective.length > 0 ? effective : poolRows);
     ```
     (poolRows kosong → error existing `:276` tidak tersentuh).
  3. Log `:393` → `` `run ${runDate} slot=${slotKey} dibuat untuk produk ${chosen.id} (pool=${poolRows.length} occupied=${occupiedIds.length} blackout=${blackoutIds.length} fallback=${fallbackLevel})` ``.
- **Behavior dipertahankan:** dedup same-day, ultimate fallback pool penuh, semua error path insert (`poolError`, sesi, produk, run, race winner) byte-identik.
- **Error/edge:** query blackout gagal (`recent` null) → `blackoutIds=[]` (=fallback implisit L1 tanpa eksklusi, run tetap jalan); `blackoutDays=0` → skip query; pool kecil → L1/L2 otomatis.
- **Test (`runner.test.ts`):** mock pool `[p1,p2,p3]`, runs 14 hari berisi p1,p2 → chosen p3 + log memuat `fallback=0`; semua pool di-blackout → chosen tetap ada + `fallback=1/2`; blackoutDays=0 → tanpa query gte (assert via mock calls).
- **Command verifikasi:** `npx vitest run src/lib/automation/runner.test.ts` + typecheck.
- **Completion criteria:** kasus baru hijau, kasus lama hijau.
- **Dilarang ubah:** `advanceRun`, `ensureCover`, email, retry, `scheduler.ts` (S11), SQL.

### S13 — Knob admin blackout 0–90 (global) + validasi + test

- **Tujuan:** operator dapat mengubah blackout tanpa deploy (requested: custom default 14).
- **Finding:** F2 (kontrol).
- **Dependency:** S10, S12.
- **Baca:** `src/lib/automation/actions.ts` (acuan `product_pool_size`: `:110-111` create, `:397-399,447-448` update+validasi), `src/components/admin/automation/AutomationForms.tsx` (acuan input pool + `ConfigFormData`), `actions.test.ts` (`:212-278` pola fd+assert).
- **Ubah:** `actions.ts`, `AutomationForms.tsx`, `actions.test.ts` (+ `AutomationForms.test.tsx` bila pola input diuji di sana — baca dulu, ikuti file yang ada).
- **Simbol:** `product_repeat_blackout_days`, `ConfigFormData`.
- **Perubahan konkret:**
  1. `actions.ts`: parse `num(...)` → integer; validasi `0–90` (`automationFail('product_repeat_blackout_days 0–90')` meniru `'product_pool_size 1–500'`); tulis pada create + update.
  2. `AutomationForms.tsx`: tambah `product_repeat_blackout_days` ke `ConfigFormData` + input number min 0 max 90 default 14 meniru blok `product_pool_size`.
  3. Test: fd `product_repeat_blackout_days='30'` → tersimpan 30; `'200'` → fail validasi; kosong → default 14.
- **Behavior dipertahankan:** semua knob lain identik; pesan error Indonesia mengikuti gaya existing.
- **Error/edge:** non-integer/negatif/>90 ditolak dengan pesan jelas; tidak ada migrasi data (kolom default 14).
- **Command verifikasi:** `npx vitest run src/lib/automation/actions.test.ts src/components/admin/automation/AutomationForms.test.tsx` + typecheck + lint.
- **Completion criteria:** 3 kasus hijau; knob tampil dan tersimpan via UI.
- **Dilarang ubah:** `SlotForms.tsx` (override slot UI ditunda — kolom DB null=warisi), knob lain, SQL.

### S14 — Verifikasi featured (tanpa perubahan kode)

- **Tujuan:** jawab F4 dengan bukti runtime: featured = 6 teratas `ORDER BY featured_rank, created_at DESC` dengan lapis override admin.
- **Finding:** F4 (bagaimana sistem menentukan featured).
- **Dependency:** tidak ada (bisa paralel kapan saja).
- **Baca:** `src/lib/affiliate/public.ts:88-111`, `src/lib/admin/featured-plan.ts`, `supabase/migrations/20260916000001_affiliate_featured_override.sql`.
- **Ubah:** tidak ada file.
- **Verifikasi manual (checklist):** (1) `/admin/produk` filter pinned/auto/excluded sesuai label; (2) pin produk ke-7 → swap pin tertua + notice `noticeSwapped`; (3) homepage carousel = 6 teratas ranking; (4) `scripts/scrape-affiliate.mjs:157` + CI tetap `index<6` (tak disentuh).
- **Completion criteria:** 4 checklist tercentang + jawaban F4 didokumentasikan di handoff. Bila ada yang gagal → BUKAN bagian plan ini; buka finding baru, jangan melebar.
- **Dilarang ubah:** scraper, workflow, `public.ts`, `featured-plan.ts`, `affiliate-actions.ts`, SQL.

### S15 — Gate final + handoff

- **Tujuan:** semua hijau, riwayat kerja tercatat, serah terima ke operator.
- **Dependency:** S0–S14.
- **Ubah:** Progress Log + Tasks di file plan ini (centang `[x]`), `.memory/` HANYA bila ada pengetahuan tahan lama non-rahasia (instruksi memori repo; jangan simpan secret/data produksi).
- **Command verifikasi:** `npm run typecheck`, `npm run lint`, `npm test`, dan bila pola build-sensitive tersentuh `npm run build`.
- **Hasil diharapkan:** semua exit 0.
- **Completion criteria:** gate hijau pasca-SEMUA edit (setiap edit setelah hijau membatalkan gate — re-run); commit submodule DULU lalu parent (aturan repo); push; lapor hash+pesan+file kunci.
- **Dilarang ubah:** kode di langkah ini (hanya plan/memory + commit).

---

## Open Questions (jangan pilih diam-diam)

- **OQ-1 — Cap resolver `q` = 50 ID.** Rekomendasi: ya (URL PostgREST pendek, produk+topik relevan hampir selalu <50). Risiko:instalasi dengan >50 produk cocok → hasil terpotong. Opsi: naikkan ke 100 (URL masih aman) — eksekutor boleh naikkan ke 100 tanpa mengubah desain, catat di Notes.
- **OQ-2 — Filter tanggal run.** Rekomendasi: TUNDA (status+slot+q menutup kebutuhan operasional; run_date sudah terurut). Risiko: audit insiden tanggal lama tetap harus scroll. Opsi: tambah `from/to` date memakai kolom `run_date` bila operator meminta.
- **OQ-3 — Cutoff blackout = aritmetika tanggal kalender atas `run_date`.** Rekomendasi: ya (deterministik, selaras grain kolom date). Alternatif rolling 24j×N ditolak (pecah di tengah hari lokal + tak cocok dengan `run_date`).
- **OQ-4 — Interleaving Flight exact crash visual.** Stack trace membuktikan LOKASI (`renderItem→sort_order`) dan KELAS (state `ids` basi vs props baru); interleave exact tak dapat diturunkan statis. Fix S1–S3 menghilangkan kelasnya; bila error boundary visual muncul lagi, ambil `digest` + console dan buka finding baru.

## Handoff Checklist (operator)

- [ ] S0 gate baseline tercatat hijau.
- [ ] Tambah subject + angle masing-masing 3x: tanpa error page, data muncul setelah refresh/inline.
- [ ] Riwayat run: 10/halaman, card produk tiap record, jam Mulai–Selesai + durasi, topik utama, filter status/slot + search `q` (termasuk `q` tanpa hasil).
- [ ] Blackout: 2 sesi beruntun memakai produk berbeda (pantau 14 hari); log memuat `pool/occupied/blackout/fallback`; knob 0–90 tersimpan.
- [ ] Featured: 4 checklist S14 tercentang.
- [ ] S15 gate final hijau; commit submodule→parent→push; hash dilaporkan.
- [ ] Rahasia: tidak ada `sb_secret_*/sb_publishable_*/CRON_SECRET/.env*` di diff, log, atau file plan.
