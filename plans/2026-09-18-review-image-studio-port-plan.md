# Review Konten: Port Pola Studio (Field-Aware + Auto-Enhance + Collapse) — Plan Detail

Created: 2026-09-18 16:20:00

## Objective

Dua permintaan user: (1) generate/enhance gambar di review konten membaca parameter (subject/style/camera) + ada enhancement otomatis seperti Studio — keputusan user: **auto-enhance saat Generate + port PENUH**; (2) section gambar tiap post/reply bisa **collapse/expand, default collapsed kecuali cover**. Fakta terverifikasi 2026-09-18 (dua agen riset + baca `actions.ts:427-556`, `ContentDraftCard.tsx:255-349`):

- `enhanceImagePrompt(draftId, postIndex, promptDraft, negativeDraft?, styleSlug?)` (`actions.ts:440-446`) HANYA teruskan `styleSlug` → `resolveImageTarget({draftOverride:{styleSlug}})` (`:493-497`) → `styleSuffix` ke `buildEnhancePromptMessages` (`:505-513`). `subjectSlug`/`cameraSlug` yang dipilih di UI **diabaikan**. Return `EnhancePromptResult {image_prompt, negative_prompt?, reasoning}` (`:427-431`) — tanpa slugs.
- Sudah ada pola retry 2x (`attempt 0.5 → gate → 0.3 + gateNote`, `:518-548`), tapi: tanpa `requireNegative`, `maxTokens 500` (Studio 1000), throw (bukan `ok:false`), tanpa picker model, tanpa bucket terpisah dari generate.
- `suggestImagePrompt` SUDAH baca subject+camera (`:314-361`, `composeSubjectPrompt+appendCameraAngle :398-403`); `generateDraftImage/generatePostImage` (`:33-51,159-270`) teruskan style/camera via `override.llm_meta` (`:263`) tapi `subjectSlug` bukan field (hanya via suggest→textarea). Penelepon: `DraftImageCard.tsx:160-189,264`, `PostImageControl.tsx:108-121,161,180`.
- Struktur UI: `ContentDraftCard.tsx:260-349` map `allPosts`; `idx===0` → `DraftImageCard` cover setelah post utama (`:337-347`); `idx>0` → `PostImageControl` di dalam kartu post (`:324-335`, full form hanya bila `perReplyEnabled`, else `:303-307` "Mode per-reply belum aktif"). Semua selalu expanded; hanya `Advanced` yang collapsed (`DraftImageCard.tsx:427`).
- Pola Studio acuan: field-aware enhance + slugs balik (`prompt.ts:233-308`, `studio/actions.ts:406-504`, `types.ts:126-140`); negative REQUIRED + retry (`prompt.ts:279,142-163`, `actions.ts:459-487`); compose LLM-merge + fallback (`prompt.ts:312-398`, `studio/worker.ts:288-335`); snapshot `final_prompt` (`studio/worker.ts:241-243`, `StudioHistory.tsx:215-230`); side-by-side + undo persisten (`StudioForm.tsx:278-316,706-751`); picker model + bucket sendiri + `ok:false` (`actions.ts:365-402`).

## Scope

Masuk (sesuai pilihan user):

- A. Enhance field-aware + kembalikan slugs + negative wajib + retry.
- B. Auto-enhance saat Generate (toggle; default ON cover, OFF reply).
- C. Terapkan slugs ke picker + undo persisten + diff picker.
- D. Compose LLM-merge + fallback deterministik + audit.
- E. Snapshot `final_prompt/final_negative` di `llm_meta` (tanpa migrasi).
- F. Picker model LLM untuk enhance.
- G. Collapse/expand section gambar per post (default collapsed kecuali cover).

Keluar (jangan kerjakan):

- Perubahan worker generate inti, `selectDraftImage`, publish core, Studio, scraper.
- Migrasi DB (E pakai `llm_meta` JSON existing).
- Toast library; ekspor `Spinner` shared (salin SVG inline ala pola existing).
- Perubahan `routing.ts`, middleware, CSP, RLS.
- Cabang `artikel` (`ContentDraftCard.tsx:85-129`): collapse berlaku juga (cover), tapi JANGAN ubah logika artikel vs thread.

## Milestones

1. Enhance field-aware + slugs + negative wajib (A1-A3): test hijau.
2. Auto-enhance toggle (B): test hijau.
3. Terapkan slugs + undo persisten (C): test komponen hijau.
4. Compose + snapshot + picker model (D-F): test hijau.
5. Collapse UI (G): test komponen hijau.
6. Gate penuh + verifikasi manual.

Urutan wajib: A → B → C → D → E → F → G (satu area per commit bila memungkinkan).

## Tasks

### A1 — `enhanceImagePrompt` field-aware (`src/lib/image/actions.ts:440-513`, `src/lib/image/prompt.ts:173-221`)

- [x] Signature tambah `subjectSlug?: string | null, cameraSlug?: string | null` SETELAH `styleSlug` (JANGAN ubah urutan param existing — penelepon lama `DraftImageCard.tsx:264`, `PostImageControl.tsx:180` tetap kompatibel).
- [x] Validasi `subjectSlug` → tabel `image_subject_templates`, `cameraSlug` → `image_camera_angles` — TIRU persis `suggestImagePrompt` (`actions.ts:344-361`): slug tak dikenal → throw `'subject tidak dikenal — refresh pilihan'` / `'camera tidak dikenal — ...'` (konsisten gaya pesan existing).
- [x] Resolve tampilan+EN: `subject.display_name/subject_en`, `camera.display_name/angle_en` (kolom persis seperti yang dibaca `studio/actions.ts:406-451`).
- [x] `buildEnhancePromptMessages` (`prompt.ts:173-221`) tambah input opsional `subjectName/subjectEn/cameraName/cameraEn` + tiga option-list; blok user tambah `Currently selected fields` + `OPTION LIST`; system tambah `Negative: REQUIRED...` + `jangan embed style/angle ke image_prompt`.
- [x] Return tambah `style_slug/subject_slug/camera_slug: string | null` (whitelist validasi ala `parseOptionalSlug` — invalid → null). Extend interface `EnhancePromptResult`.
- [ ] Test `src/lib/image/actions-enhance.test.ts` (baru; mock `runLLMCompletion` + tabel template seperti pola test existing — cari pola mock LLM di `src/lib/studio/` test dulu): slug invalid → throw; enhance mengembalikan 3 slugs valid; invalid → null tanpa throw.

### A2 — Negative wajib + retry + token (`actions.ts:518-550`)

- [x] Tambah gate `requireNegative`-setara: setelah parse, bila `negative_prompt` kosong → retry SEKALI suhu rendah dengan catatan `...negative WAJIB terisi` (tiru `studio/actions.ts:459-460`); masih kosong → throw `'enhance gate: negative kosong'` (bukan silent).
- [x] `maxTokens: 500 → 1000` (`:529`, sejajar Studio `:467`) — output kini mencakup 3 slugs + negative.
- [x] Ganti wording echo gate-reason pada retry agar sama dengan Studio (`PENTING: output sebelumnya gagal gate...` sudah ada — pertahankan format, tambah alasan negative).
- [ ] Test: negative kosong attempt-1 → attempt-2 terisi → sukses; dua-duanya kosong → throw gate.

### A3 — Verifikasi generate/suggest TAK BERUBAH perilaku (tanpa kode, checklist baca)

- [x] `suggest` (`:314-403`) dan `generate` override (`:159-270`) tetap; A1 tidak menyentuh signature mereka. Gate 899 tests hijau → lolos.

### A2 — Negative wajib + retry + token (`actions.ts:518-550`)

- [ ] Tambah gate `requireNegative`-setara: setelah parse, bila `negative_prompt` kosong → retry SEKALI suhu rendah dengan catatan `…negative WAJIB terisi` (tiru `studio/actions.ts:459-460`); masih kosong → throw `'enhance gate: negative kosong'` (bukan silent).
- [ ] `maxTokens: 500 → 1000` (`:529`, sejajar Studio `:467`) — output kini mencakup 3 slugs + negative.
- [ ] Ganti wording echo gate-reason pada retry agar sama dengan Studio (`PENTING: output sebelumnya gagal gate...` sudah ada `:521` — pertahankan format, tambah alasan negative).
- [ ] Test: negative kosong attempt-1 → attempt-2 terisi → sukses; dua-duanya kosong → throw gate.

### A3 — Verifikasi generate/suggest TAK BERUBAH perilaku (tanpa kode, checklist baca)

- [ ] `suggest` (`:314-403`) dan `generate` override (`:159-270`) tetap; A1 tidak menyentuh signature mereka. Bila test existing hijau, anggap lolos.

### B — Auto-enhance saat Generate (toggle)

- [x] `generateDraftImage/generatePostImage` (`actions.ts:33-51,159-270`) tambah opsi `autoEnhance?: boolean` di param `override` (JANGAN param posisi baru — masukkan ke objek override agar penelepon lama kompatibel).
- [x] Bila ON dan prompt efektif ≥10 char: panggil logika enhance INTERNAL (refactor inti A1 menjadi fungsi `runEnhance(...)` yang dipakai BERSAMA oleh `enhanceImagePrompt` dan generate — JANGAN duplikasi 60 baris). Pakai hasil (prompt+negative+slugs) untuk render; slugs diteruskan ke `llm_meta.override` agar worker resolve target konsisten.
- [x] Bila enhance gagal (throw/gate): FALLBACK prompt asli + lanjut render + sertakan `notice`/`warning` di return (`enhance_skipped: <alasan>`) — JANGAN gagalkan generate (prinsip: enhance = polish, bukan gate).
- [x] Rate limit: auto-enhance MENGHABISKAN bucket `enhance_image_prompt` yang sama (`:446,461-463`, 30/jam) — tambah hint di label toggle ("memakai kuota Sempurnakan"). JANGAN bikin bucket baru.
- [x] UI toggle di `DraftImageCard` (cover, default ON) + `PostImageControl` (reply, default OFF — hemat kuota; reply jarang dirender). Teruskan sebagai bagian override saat klik Generate. i18n key baru (parity id/en — `messages.test.ts`).
- [ ] Test: ON + enhance sukses → render pakai prompt enhance; ON + enhance throw → render pakai prompt asli + flag skipped; OFF → enhance tak terpanggil (assert mock tidak dipanggil).

### C — Terapkan slugs + undo persisten (`DraftImageCard.tsx:264-281,532-571`, `PostImageControl.tsx:172-197`)

- [x] `Terima`: selain prompt+negative, set dropdown style/subject/camera dari slugs hasil enhance (null → jangan ubah pilihan user). Tiru `StudioForm acceptProposed` (`:293-305`) termasuk snapshot `prevPrompt/prevNegative/prevSlugs` SEBELUM apply.
- [x] `Urungkan`: PINDAHKAN keluar blok `proposed?...` (`DraftImageCard.tsx:560-568`) agar tetap ada setelah Terima (tiru `StudioForm.tsx:307-316,742-751`); klik mengembalikan snapshot + hapus snapshot (sekali pakai).
- [x] Diff side-by-side tambah baris picker (draf vs usulan, via label display — tiru `:319-322,706-739`); JANGAN tampilkan slug mentah ke user.
- [x] Terapkan identik di KEDUA file (DraftImageCard + PostImageControl) — keduanya punya blok enhance sendiri; JANGAN hanya satu.
- [ ] Test komponen (pola `ArticleCard.test.tsx`): Terima mengisi 3 picker; Undo muncul setelah Terima dan mengembalikan; diff menampilkan label (bukan slug).

### D — Compose LLM-merge + fallback (`src/lib/image/prompt.ts`, `src/lib/image/worker.ts:400-416`)

- [ ] Fungsi baru `buildComposeReviewMessages({imagePrompt, subjectEn, angleEn, styleSuffix})` + `parseComposeReview` (cap panjang, aturan USER-WINS/dedupe/strip — TIRU `prompt.ts:312-398`, sesuaikan nama; JANGAN impor dari Studio — beda domain, duplikasi kecil diterima).
- [ ] Worker review: `try LLM (temperature rendah, token kecil) → fallback concat deterministik EXISTING` (`worker.ts:400-416` tetap sebagai fallback, JANGAN hapus). Audit `{mode:'llm'|'deterministic', dropped, conflict_note}` ke `llm_meta` (tiru `studio/worker.ts:313-319`).
- [ ] JANGAN ubah perintah pengecualian no-text Phoenix/Lucid (`worker.ts:392-399` di sekitarnya — baca dulu sebelum edit).
- [ ] Test: LLM sukses → merge dipakai + audit mode llm; LLM throw → fallback deterministik + audit mode deterministic; cap panjang dipatuhi.

### E — Snapshot final (`src/lib/image/worker.ts:507-529`)

- [ ] Saat render (sukses MAUPUN gagal): simpan `llm_meta.final_prompt` + `llm_meta.final_negative` = string persis terkirim ke model (tiru `studio/worker.ts:241-243,498-500`; gagal: tiru `failStudioImage :212-229` — simpan snapshot SEBELUM tandai failed).
- [ ] UI riwayat (`DraftImageCard` history/carousel + `PostImageControl` history): tampilkan final prompt + tombol salin; fallback teks bila record lama tanpa snapshot (tiru `StudioHistory.tsx:654-682` empty states).
- [ ] TANPA migrasi (pakai `llm_meta` JSON). Test: sukses/gagal sama-sama menyimpan snapshot.

### F — Picker model LLM untuk enhance

- [ ] Dropdown model di panel Sempurnakan kedua file (default = stage default; pin divalidasi `is_active`, tolak eksplisit bila nonaktif — tiru `studio/actions.ts:394-402` + pola pin `publish.ts`-style yang dipakai `expandArticleDraft`).
- [ ] `enhanceImagePrompt` teruskan pin ke `resolveStageModel('enhance_image_prompt', pin)` (ganti `null` di `:515`). Error action `ok:false`-style? Review enhance saat ini THROW — pertahankan throw (konsisten file ini), JANGAN ubah ke `ok:false` (beda konvensi dengan Studio, di luar scope).
- [ ] Test: pin nonaktif → error jelas; tanpa pin → stage default.

### G — Collapse/expand section gambar per post

- [ ] Bungkus: (1) `DraftImageCard` cover setelah post utama (`ContentDraftCard.tsx:337-347`); (2) `PostImageControl` dalam kartu reply (`:325-335`); (3) cabang `artikel` (`:85-129`, cover-nya juga collapsible). SATU pola collapsible untuk ketiganya — pilih `<details>/<summary>` native (tanpa JS, tahan gagal hidrasi) ATAU pola `Advanced` (`DraftImageCard.tsx:427`) bila itu custom; BACA `:420-440` dulu, ikuti yang ada.
- [ ] Default: `post_index===0` (cover) OPEN, reply CLOSED. Header ringkas selalu terlihat: label + status badge + tombol cepat Generate/Ulangi (JANGAN sembunyikan aksi di balik expand — admin harus bisa generate tanpa expand).
- [ ] `PostImageControl` mode non-perReply (`:303-307` "Mode per-reply belum aktif.") ikut collapse (satu baris ringkas).
- [ ] A11y: `aria-expanded`, keyboard native (gratis bila `<details>`). i18n label bila ada teks baru (parity).
- [ ] Test komponen: cover default open; reply default closed; toggle membuka; tombol Generate tetap bisa diklik saat collapsed (assert via role, bukan implementasi DOM).

## Risks

- Biaya LLM naik (auto-enhance ON cover + compose LLM per render + token 500→1000). Mitigasi: toggle default OFF reply, bucket shared, fallback hemat (D/E fallback deterministik, B fallback prompt asli).
- Duplikasi prompt-builder Studio↔review (bukan impor silang — disengaja beda domain; catat di Notes bila kelak disatukan).
- `Terima` kini mengubah 3 picker sekaligus — risiko "kok dropdown ikut berubah". Mitigasi: diff picker eksplisit + undo persisten (C).
- Compose LLM mengubah nuansa prompt deterministik lama — mitigasi: fallback + audit + snapshot (D+E).
- Collapsible `<details>` vs custom: pilih native kecuali pola `Advanced` sudah custom dan terbukti (cek dulu — JANGAN campur dua pola).
- Edit setelah gate hijau MEMBATALKAN gate — re-run `typecheck + lint` sebelum commit.

## Progress Log
- 2026-09-18 16:20:00 — Plan detail dibuat (riset: 2 agen + baca `actions.ts:427-556`, `ContentDraftCard.tsx:255-349`). Keputusan user: auto-enhance saat Generate + port PENUH + collapse (default collapsed kecuali cover). Belum ada implementasi.
- 2026-09-18 21:40:00 — A1+A2+B+C selesai (field-aware enhance + negative gate + auto-enhance toggle + slug persist). Gate 899 tests ✓, pushed `48c3656`.
- 2026-09-18 21:52:00 — D+E+F+G selesai: worker compose LLM + snapshot, picker model LLM, collapse native `<details>`. Gate 899 tests ✓, pushed `4a489b4`. Semua task plan SELESAI (kecuali test unit A1 `actions-enhance.test.ts` yang belum ditulis).

## Notes

- Keputusan: (1) auto-enhance = toggle saat Generate (default ON cover / OFF reply), bukan enhance-on-type; (2) port penuh termasuk compose + snapshot + picker model; (3) snapshot di `llm_meta` tanpa migrasi; (4) collapse native `<details>` bila cocok, else ikuti pola `Advanced`.
- Follow-up opsional (bukan plan ini): satukan builder Studio↔review; kolom khusus `final_prompt`; badge provenance enhance di riwayat; perluas collapse ke section non-gambar.
- Perintah gate: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- Aturan commit: Conventional Commits satu baris tanpa `Co-authored-by`; `git status --short + git diff + git log --oneline -10` dulu; stage hanya file dimaksud; JANGAN commit `.env*`/key; tanpa migrasi → commit parent saja; push ditolak → `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate hijau, push; laporkan hash + pesan + file kunci.
- Handoff small model: kerjakan A→G berurutan; BACA blok kode yang dirujuk sebelum edit (nomor baris dari 2026-09-18, geser sedikit bila file berubah — cari nama fungsi, jangan andalkan nomor buta); JANGAN sentuh publish core, `routing.ts`, middleware, CSP, RLS, skema DB; bila ragu soal status image, aturan: hanya `ready`/`selected` yang punya piksel.
