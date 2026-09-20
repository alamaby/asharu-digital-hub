# Image Negative Prompt, Pakai-Ulang Riwayat, dan Label Gagal Fix Plan

Created: 2026-09-20 09:00:00

## Objective

Menjawab 3 keluhan terverifikasi di Studio (`/studio`) dan Review konten (`/konten/review/[draftId]`):
1. Pastikan `negative prompt` selalu ikut saat generate + enhance + pakai-ulang (Studio maupun Review).
2. `Pakai ulang` di Review saat ini hanya memakai riwayat terakhir (`latestOf`) — tidak bisa pilih slide lama seperti di Studio.
3. Baris `failed` masih tampil `auto · auto` padahal user mem-pin model — karena `provider_slug/model_slug` hanya ditulis saat sukses.

Output plan ini dipakai oleh model less-capable untuk implementasi langsung tanpa riset ulang.

## Scope

- In-scope:
  - `src/components/content/ImageHistoryCarousel.tsx` — tambah tombol per-slide `Pakai prompt` + `Salin`.
  - `src/components/content/DraftImageCard.tsx` (cover post 0) — terima `onReuse`, isi form dari slide pilihan (prompt + negative + style/camera/subject + advanced).
  - `src/components/content/PostImageControl.tsx` (per-reply) — sama + inisialisasi form dari histori terbaru saat mount.
  - `src/components/studio/StudioHistory.tsx` — label `failed` tampilkan pin request, bukan `auto · auto`.
  - `src/lib/image/requested-label.ts` — helper label bedakan `failed` vs `pending`.
  - `src/messages/id.json`, `src/messages/en.json` — key i18n baru (`reusePrompt`, `copiedPrompt`, `metaFailed`, `requestedFailed`).
  - Test: `ImageHistoryCarousel.test.tsx`, `DraftImageCard`/`PostImageControl` bila ada, `StudioHistory`/`StudioUi.test.tsx`, `requested-label.test.ts`.
- Out-of-scope:
  - Migrasi DB / perubahan skema (pakai kolom yang ada: `provider_id/model_id`, `llm_meta.override`, `negative_prompt`, advanced `guidance/steps/seed/req_width/req_height`).
  - Perubahan worker (`src/lib/studio/worker.ts`, `src/lib/image/worker.ts`) selain bila diputuskan menyimpan `llm_meta.attempted` — default JANGAN ubah worker dulu.
  - Ubah perilaku Flux/Lucid/Bynara `Avoid:` folding — sudah benar.

## Milestones

1. Milestone 1 — Reuse per-slide Review (nilai terbesar, UX).
2. Milestone 2 — Label gagal jujur Studio + Review.
3. Milestone 3 — Gap `Siapkan prompt awal` + polish negative + gate hijau.

## Tasks

- [x] Task 1 — Carousel Review: tambah `onReuse` + tombol Salin/Pakai prompt per slide
  - File: `src/components/content/ImageHistoryCarousel.tsx` (saat ini props `onSelect/onRetry/onUseAsReference`, fungsi `providerModelLabel` baris ~74-88).
  - Tambah prop opsional:
    ```tsx
    onReuse?: (img: DraftImageRow) => void;
    ```
  - Di block aksi tiap slide (sekitar baris 306-361, dekat tombol `Ulangi`/`Jadikan referensi`), tambah:
    - Tombol `Salin prompt` — copy `img.image_prompt` ke clipboard (tiru pola `copyPrompt` di `StudioHistory.tsx:198-213`, dengan fallback textarea + `execCommand('copy')`).
    - Tombol `Pakai prompt` — panggil `onReuse(img)` bila prop ada. Title: "Isi form dari riwayat ini (prompt + negative + style/kamera)".
  - Jangan ubah `inert`/embla logic, dots, keyboard handler.
  - Kriteria: tombol muncul di tiap slide (cover + reply), tidak merusak swipe; `count===0 return null` tetap.
- [x] Task 2 — Cover (`DraftImageCard.tsx`) terima reuse dari slide mana pun
  - File: `src/components/content/DraftImageCard.tsx` (state form baris 49-90, `latestOf` baris 41-43, `refresh()` baris 106-128).
  - Tambah handler:
    ```tsx
    function reuseFromHistory(img: DraftImageRow) {
      setPromptDraft(img.image_prompt ?? '');
      setNegativeDraft(img.negative_prompt ?? '');
      if (img.style_slug && options.styles.some(s => s.slug === img.style_slug)) setStyleSlug(img.style_slug);
      if (img.camera_slug && (options.cameras ?? []).some(c => c.slug === img.camera_slug)) setCameraSlug(img.camera_slug);
      // subject tidak ada di baris cover → jangan tebak, biarkan pilihan user.
      // advanced: kosong = Auto (tiru StudioForm optNum)
      const advOf = (v: string | number | null | undefined): string => {
        if (v === null || v === undefined || v === '') return '';
        const n = Number(v);
        return Number.isFinite(n) ? String(n) : '';
      };
      setAdvGuidance(advOf(img.guidance));
      setAdvSteps(advOf(img.steps));
      setAdvSeed(advOf(img.seed));
      setAdvWidth(advOf(img.req_width));
      setAdvHeight(advOf(img.req_height));
      setProposed(null);
      setNotice(`Dipakai dari riwayat ${img.id.slice(0,8)} — cek lalu Regenerate.`);
    }
    ```
  - Teruskan ke carousel: `<ImageHistoryCarousel onReuse={reuseFromHistory} ... />` (sekitar baris 361-375).
  - Kriteria: klik `Pakai prompt` di slide ke-3 mengisi textarea prompt + negative + dropdown style/kamera + advanced dari slide itu (bukan selalu terbaru).
- [x] Task 3 — Per-reply (`PostImageControl.tsx`) sama + init dari terbaru
  - File: `src/components/content/PostImageControl.tsx` (form awal kosong baris 53-55, `refreshOne` baris 228-246, `fetchHistoryAndSync` 220-226).
  - Tambah `reuseFromHistory` identik Task 2 (untuk reply, `subjectSlug` juga jangan ditimpa — tidak tersimpan di baris; hanya `styleSlug/cameraSlug`).
  - Teruskan `onReuse` ke `ImageHistoryCarousel` (sekitar baris 321-335).
  - Tambah init saat mount agar konsisten dengan cover (cover init dari `latestOf(initialImages)` di `DraftImageCard.tsx:60-68`, reply saat ini kosong):
    ```tsx
    // di dekat useState promptDraft/negativeDraft/styleSlug/cameraSlug:
    // inisialisasi malas dari initialHistory[0] (query sudah desc terbaru-dulu)
    ```
    Paling aman: ubah `useState('')` menjadi lazy init dari `initialHistory[0]` untuk `promptDraft`, `negativeDraft`, `styleSlug`, `cameraSlug`, `advGuidance/Steps/Seed/Width/Height` — tiru pola `advOf` cover. Jangan ubah `modelUuid/referenceUrl` default.
  - Kriteria: buka reply berisi histori → textarea langsung terisi dari terbaru tanpa harus klik `Muat ulang`; klik slide lama → form ikut slide lama.
- [x] Task 4 — Label gagal Studio: jangan `auto · auto` bila ada pin
  - File: `src/components/studio/StudioHistory.tsx` fungsi `metaLabel` (baris 287-308).
  - Perilaku kini: cabang `(antre)` hanya bila `status==='pending' && model_id`. `failed` jatuh ke `meta` → `auto · auto`.
  - Ubah menjadi:
    ```tsx
    function metaLabel(img: StudioGenerationRow): string {
      // pending ATAU failed dengan pin user → tampilkan yang diminta + suffix status
      if (!img.provider_slug && !img.model_slug && img.model_id && options && (img.status === 'pending' || img.status === 'failed')) {
        const model = options.models.find(m => m.id === img.model_id);
        if (model) {
          const provider = options.providers.find(p => p.id === model.provider_id);
          const key = img.status === 'failed' ? 'metaFailed' : 'metaQueued';
          return tHist(key, { provider: provider?.slug ?? model.provider_slug, model: model.model_id, style: img.style_slug || tHist('noStyle'), aspect: img.aspect_slug });
        }
      }
      // ... fallback lama, tapi untuk failed tanpa pin tetap auto·auto (jujur: Auto murni)
      // Opsional: bila provider_id saja ada (tanpa model_id), tampilkan provider + auto model.
    }
    ```
  - Tambah key i18n `metaFailed`: id `"{provider} · {model} · {style} · {aspect} (gagal)"`, en `"(failed)"`. Lihat key lama `meta`/`metaQueued` di `src/messages/id.json:1006-1007`, `en.json:1006-1007`.
  - Kriteria: baris failed pin-manual tampil `cloudflare · sdxl … (gagal)`; Auto murni tetap `auto · auto` (diterima, bukan bug).
- [x] Task 5 — Label gagal Review: bedakan `(antre)` vs `(gagal)`
  - File: `src/components/content/ImageHistoryCarousel.tsx` (`providerModelLabel` 74-88) + `src/lib/image/requested-label.ts` (`requestedImageModelUuid`, `requestedImageProviderLabel`).
  - Opsi minimal tanpa ubah worker: teruskan `status` ke helper, suffix ikut status:
    ```tsx
    // ImageHistoryCarousel: providerModelLabel(img, modelOptions) → tambahkan status
    // bila img.status === 'failed' dan ada uuid pin → `${who} (gagal)` bukan `(antre)`
    // bila Auto murni failed → `auto · auto (gagal)` agar konsisten, bukan auto polos.
    ```
  - Bila sentuh `requested-label.ts`, update juga `requested-label.test.ts` + `ImageHistoryCarousel.test.tsx`. Jangan ubah signature yang dipakai halaman lain (`admin/llm/logs`) tanpa update import-nya — cek `grep requestedImageModelUuid`.
  - Kriteria: slide failed pin-manual → `provider · model (gagal)`; pending pin-manual tetap `(antre)`; Auto murni failed → `auto · auto (gagal)` atau minimal ada kata gagal.
- [x] Task 6 — Audit negative prompt + tutup gap `Siapkan prompt awal`
  - Verifikasi (tidak perlu ubah bila sudah benar):
    - Studio enqueue `negativePrompt` (`StudioForm.tsx:211` → `actions.ts:298`), enhance (`StudioForm.tsx:268-269` → `actions.ts:390,439-451,499`), reuse (`StudioForm.tsx:71`), terima (`:297`).
    - Review enqueue (`DraftImageCard.tsx:183`, `PostImageControl.tsx:131`), autoEnhance overwrite (`lib/image/actions.ts:198-212`), enhance (`DraftImageCard.tsx:282`, `PostImageControl.tsx:198`), terima (`DraftImageCard.tsx:296`, `PostImageControl.tsx:212`), refresh sync (`DraftImageCard.tsx:117`, `PostImageControl.tsx:234`).
  - Satu-satunya gap: `suggestImagePrompt` (`lib/image/actions.ts:343-439`) tidak menghasilkan negative. Keputusan: JANGAN panggil LLM tambahan; cukup setelah `handleSuggest` sukses, biarkan negative apa adanya + notice sudah jelas (`Siapkan prompt awal` → `Sempurnakan`). Bila product mau, isi default statis `no text, watermark, logo` hanya bila textarea negative masih kosong — 3 baris, tanpa LLM.
  - Kriteria: generate + enhance + pakai-ulang (Studio & Review) terbukti membawa negative di test manual; tidak ada jalur yang me-nol-kan negative secara diam-diam.
- [x] Task 7 — i18n + test + gate
  - Tambah key di `src/messages/id.json` + `en.json`: `content.review` → `reusePrompt` ("Pakai prompt"), `copyPrompt` ("Salin prompt"), `reusedFrom` ("Dipakai dari riwayat {id} — cek lalu Regenerate."), `studio.history` → `metaFailed`.
  - Test baru/update:
    - `ImageHistoryCarousel.test.tsx`: tombol Pakai prompt memanggil `onReuse` dengan row yang benar (klik di slide ke-2, bukan selalu index 0); label failed pin tampil `(gagal)`.
    - `requested-label.test.ts`: case failed vs pending.
    - `StudioUi.test.tsx` / `StudioHistory` bila ada: failed pin tampil `(gagal)`.
  - Gate wajib hijau sebelum commit (aturan repo `AGENTS.md`): `npm run typecheck`, `npm run lint`, `npm test`. Bila sentuh pola yang hanya ditangkap build (mis. konstanta di-assign ulang), tambah `npm run build`. Setiap edit setelah gate hijau membatalkan gate — re-run.

## Risks

- Embla carousel + `inert` slide non-aktif: tombol baru di slide non-aktif tidak bisa diklik — itu benar (fokus/aksi tidak bocor). Test harus klik slide aktif atau via dots dulu.
- `PostImageControl` lazy-init dari `initialHistory[0]` mengasumsikan query desc terbaru-dulu (`listDraftImages` order `created_at` desc di `lib/image/actions.ts:25`). Bila asumsi berubah, init salah — mitigasi: pakai `latestOf` sort eksplisit seperti cover, bukan `rows[0]` mentah.
- `subjectSlug` tidak tersimpan di baris image — jangan coba restore subject dari histori (halusinasi). Biarkan pilihan user.
- Label `(gagal)` untuk Auto murni tetap `auto` — jangan invent nama model waterfall yang belum tentu dicoba. Jujur lebih baik.
- Perubahan `requested-label.ts` dipakai 2 tempat (carousel + admin logs) — cek semua import sebelum ubah signature.

## Progress Log

- 2026-09-20 09:00:00 — Plan dibuat dari investigasi read-only 2026-09-20 (StudioForm/StudioHistory/StudioPageClient, DraftImageCard/PostImageControl/ImageHistoryCarousel/ReferencePicker, lib/studio/actions+worker+types, lib/image/actions+requested-label). Belum ada implementasi.
- 2026-09-20 17:30:00 — Implementasi selesai semua milestone: carousel onReuse+Salin/Pakai per slide, cover+reply reuseFromHistory + init terbaru, Studio metaFailed + Review (gagal) via requested-label status, suggest isi default negative statis bila kosong, i18n reusePrompt/copyPrompt/reusedFrom/metaFailed, test baru 8 case. Gate hijau: typecheck, lint 0 errors, test 976 passed.

## Notes

- Standar arsitektur: perubahan ini kecil (1 fitur UX + 1 fix label), jadi TOGAF/ODA tidak diberlakukan penuh secara proporsional — hanya pola yang sudah ada yang dipertahankan (Studio `onReuse` → Review `onReuse`, `copyPrompt` fallback clipboard, `(antre)` → `(gagal)`). Tidak ada deviasi domain billing/telecom (C2M tidak relevan).
- Bukti sudah-diverifikasi sebelum plan:
  - Negative ikut di Studio generate/enhance/reuse; Review cover/reply generate/enhance/refresh-sync; worker merge `row.negative_prompt + style.negative_prompt`; Flux/Lucid lipat `Avoid:` by design.
  - Review reuse hanya `latestOf`/`mine[0]` — itu akar "hanya riwayat terakhir".
  - Slug aktual hanya ditulis saat sukses (Studio worker update `provider_slug/model_slug` saat ready; konten sama) — itu akar `auto · auto` saat gagal.
- Untuk pelaksana: kerjakan Milestone 1 dulu, demo klik slide lama → form berubah, baru lanjut label. Jangan campur worker cron dalam PR yang sama.
