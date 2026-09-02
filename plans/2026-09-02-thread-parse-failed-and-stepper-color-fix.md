# Thread Parse Failed & Stepper Color Fix

Created: 2026-09-02 10:00:00

## Objective
Memperbaiki dua bug yang ditemukan pada riset `86b2d3b7-3861-47db-93da-25ce4c09f80b` (status `failed`, stage `developing`, platform `threads`):
1. Error `thread parse failed` yang sebenarnya disebabkan oleh bug di `normalizePlaceholder` (bukan JSON rusak).
2. Warna stepper hilang untuk step-step yang sudah dilewati ketika session berstatus `failed`.

## Scope
- `src/lib/research/development.ts` — perbaiki logika `normalizePlaceholder` agar strip placeholder lintas-string (global, bukan per-string).
- `src/lib/research/development.ts` — export `parseThread` & `normalizePlaceholder` untuk testability.
- `src/lib/research/development.test.ts` — unit test baru untuk `parseThread`/`normalizePlaceholder`.
- `src/components/admin/ResearchStepper.tsx` — perbaiki `isDone` & warna konektor agar tidak ter-reset saat `failed`.

## Milestones
1. Fix backend (`development.ts`) + testability export.
2. Tambah unit test & verifikasi.
3. Fix UI stepper.
4. Lint, typecheck, test.
5. Commit & push.

## Root Cause Analysis

### Bug 1: `thread parse failed`
Session `86b2d3b7` gagal di stage `developing`. Dari log error, LLM mengembalikan thread JSON **valid** yang berisi **2 placeholder** `{{PRODUCT_URL}}` terdistribusi di 2 string berbeda:
- `main.id`: `"...cek di sini ya {{PRODUCT_URL}}"`
- `main.en`: `"...tap here {{PRODUCT_URL}}"`

Prompt instruksi (`prompt.ts:31`) meminta "EXACTLY 1 occurrence in ONE post" (dilanggar LLM). Fungsi `normalizePlaceholder` (`development.ts:227`) seharusnya jaring pengaman ("keep first, strip the rest"), namun implementasi `strip` (baris 240) hanya men-strip duplikat **dalam satu string yang sama**:

```ts
const strip = (s: string): string => {
  let count = (s.match(/\{\{PRODUCT_URL\}\}/g) ?? []).length;
  if (count <= 1) return s;   // ← setiap string hanya 1 → lolos tanpa di-strip
  ...
};
```

Karena placeholder terdistribusi (masing-masing string 1), `strip` tidak mengubah apa pun → total tetap 2 → `countPlaceholdersInThread(normalized) !== 1` → `parseThread` return `null` → throw `thread parse failed`.

**Bukti dari DB (mode read-only):** log `developing/error` berisi LLM raw output dengan tepat 2 substring `{{PRODUCT_URL}}` di `main.id` dan `main.en`. Commit sebelumnya `cd65c25` ("development thread parse tolerant") sudah coba mengatasi ini tapi normalizer-nya cacat untuk kasus distribusi lintas-field.

### Bug 2: Stepper warna hilang saat failed
`ResearchStepper.tsx`:
- Baris 141: `const isDone = !isFailed && idx < activeIndex;` → saat `failed=true`, `isDone` **selalu false** untuk semua step sebelum titik gagal → kelas `bg-primary border-primary text-white` (baris 155) tidak pernah terpasang → jatuh ke default abu-abu (baris 150).
- Baris 166 & 175 (konektor): `idx <= activeIndex && !isFailed` / `idx < activeIndex && !isFailed` → saat failed, konektor juga jatuh ke `bg-line`.

Niat guard `!isFailed` agar step gagal tidak tampak "done", tapi guard-nya mereset **semua** step sebelum titik gagal juga — padahal step-step itu benar-benar sudah selesai.

## Tasks
- [x] Buat plan file ini
- [x] Fix `normalizePlaceholder` di `development.ts` — strip global lintas-string (jaga placeholder pertama, hapus sisanya)
- [x] Export `parseThread` & `normalizePlaceholder` dari `development.ts` untuk testability
- [x] Tambah `development.test.ts` — kasus: 0/1/2-distribusi-lintas-field/2-dalam-satu-string/3-acak
- [x] Fix `ResearchStepper.tsx` — ubah `isDone` & logika konektor agar step selesai tetap berwarna saat `failed`
- [x] Pipeline: `npm run lint && npm run typecheck && npm run test`
- [x] Commit (Conventional Commits) & push ke `origin/main`

## Fix Design

### Fix A — `normalizePlaceholder` (development.ts)
Ganti `strip` per-string dengan normalisasi global menggunakan closure `kept`:

```ts
let kept = false;
const strip = (s: string): string =>
  s.replace(/\{\{PRODUCT_URL\}\}/g, () => (kept ? '' : (kept = true, '{{PRODUCT_URL}}')));
```

Ini mempertahankan **hanya** placeholder pertama yang ditemukan saat iterasi `[main.id, main.en, ...replies]`, menghapus sisanya, terlepas distribusinya. Urutan iterasi: main.id → main.en → replies (sesuai urutan logis "main post dulu").

### Fix B — Stepper (ResearchStepper.tsx)
- Baris 141: `const isDone = idx < activeIndex;` (hapus `!isFailed`). Step sebelum titik gagal tetap "done".
- Baris 166 (konektor kiri): `idx <= activeIndex ? 'bg-primary'` (hapus `&& !isFailed`). Pertahankan agar step gagal (activeIndex saat failed) tidak ikut hijau konektor kirinya — sebenarnya step gagal adalah `idx === activeIndex`, jadi `idx <= activeIndex` akan mencakupnya. Karena node gagal sudah merah via `nodeCls`, konsistensi: konektor kiri ke step gagal boleh primary (menandakan langkah sebelumnya selesai). **Pilihan:** `idx <= activeIndex ? 'bg-primary' : isDone ? 'bg-primary' : 'bg-line'` disederhanakan jadi `idx <= activeIndex ? 'bg-primary' : 'bg-line'` (karena step ke-`activeIndex` saat failed = node merah, konektor kiri menghubungkan dari step sebelumnya yang done → primary wajar).
- Baris 175 (konektor kanan): `idx < activeIndex ? 'bg-primary' : 'bg-line'` (hapus `&& !isFailed`).

Step gagal tetap dibedakan via `isErrorNode=true` → `nodeCls` merah (baris 151), tidak terkena perubahan ini.

## Risks
- **Fix A mengubah lokasi placeholder:** jika placeholder "pertama" jatuh di reply (bukan main), URL afiliasi muncul di reply, bukan main post. Ini sesuai intent prompt ("main or any reply") dan lebih baik daripada hard-fail. Risiko regression kecil: draft yang sebelumnya lolos (sudah 1 placeholder) tidak berubah perilaku. Mitigasi: unit test kasus 1-placeholder (no-op) + jalankan `npm run test`.
- **Fix B:** pastikan step yang gagal tidak ikut terwarna "done". Sudah ditangani `isErrorNode` (baris 143) yang override `nodeCls` ke merah sebelum cabang `isDone`. Tidak ada risiko step gagal berwarna hijau.
- **Counter-point Fix B**: secara visual, menghubungkan konektor hijau sampai ke node merah mungkin terlihat aneh. Alternatif: konektor kanan step sebelum gagal tetap abu-abu. Pilihan diambil: konektor kiri node = primary (mengindikasikan progress sampai titik itu), lebih informatif daripada menghapus semua warna. Ini trade-off yang bisa di-tweak lagi kalau feedback visual kurang bagus.

## Progress Log
- 2026-09-02 10:00:00 — Plan dibuat setelah investigasi read-only (DB + codebase). Akar masalah kedua bug sudah dikonfirmasi.
- 2026-09-02 10:15:00 — Implementasi: refactor pure logic (`threadSchema`/`normalizePlaceholder`/`parseThread`/`replacePlaceholders`) ke modul baru `src/lib/research/thread.ts` (tanpa `server-only`) agar bisa di-unit-test tanpa konflik dengan guard `server-only` Next.js; `development.ts` jadi pengimpor. `normalizePlaceholder` di-fix dengan closure `kept` lintas-string. `ResearchStepper.tsx` `isDone` & konektor di-fix (hapus guard `!isFailed`).
- 2026-09-02 10:20:00 — Verifikasi: `npm run lint` ✓, `npm run typecheck` ✓, `npm run test` ✓ (34 file / 213 test, +14 test baru di `development.test.ts`). Siap commit & push.

## Notes
- Mode DB read-only dipertahankan: investigasi hanya pakai `SELECT`/`execute_sql` untuk baca log & session. Tidak ada perubahan data via MCP.
- Conventional Commit target: `fix(research): normalize placeholder cross-field & restore stepper done-color on failure`
- Tidak ada migration DB yang diperlukan — semua fix di layer aplikasi (lib + component).
