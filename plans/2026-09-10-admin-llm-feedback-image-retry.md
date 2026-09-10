# Admin LLM Feedback + Image Retry

Created: 2026-09-10 12:45:00

## Objective
(1) Feedback UI jelas di `/admin/llm` untuk drag-drop, toggle, Kelola, loading, simpan atribut mode. (2) Atasi `image_prompt: no JSON object found` di draf `023e0a95` + tombol Ulangi generik. Keputusan user: tombol generik, skop penuh, inline role=status/alert.

## Scope
- `src/components/admin/llm/*` (ActionFeedback, LlmForms, 3 boards, SortableList), 3 halaman llm (Suspense), `src/lib/admin/llm-actions.ts` (return hasil)
- `src/lib/image/worker.ts` (retry parse), `src/lib/image/actions.ts` (`retryFailedImage`), `DraftImageCard.tsx` (tombol Ulangi)

## Milestones
1. Diagnosis 023e0a95 selesai (waterfall 503→503→200 17-token tanpa `{`)
2. Worker + Ulangi generik
3. Feedback penuh admin/llm

## Tasks
- [x] Diagnosis: cover 023e0a95 gagal 05:00 (3.8 503 → 3.7 503 → 3.6 200 fragmen markdown, thinking HIGH × 500 token, pre-fix); failed terminal (claim hanya pending); tanpa tombol ulang
- [x] Worker: gagal parse → 1x retry 0.3 penegasan JSON ONLY; gate retry pakai attemptParsed; `gate_retried` mencakup parse retry
- [x] `retryFailedImage` (admin, hanya status failed → pending/attempts 0) + tombol Ulangi di DraftImageCard + notice
- [x] ActionFeedback: notice working/success/error + PendingButton (useFormStatus) + BoardSkeleton + test (5)
- [x] llm-actions: semua return `{ok}|{ok,error}` (auth tetap throw); validasi parse dibungkus
- [x] SortableList: DragOverlay + revert-on-error + onSettled; label ID
- [x] 3 boards: busy per-kontrol + disable + notice sukses/gagal + rollback
- [x] LlmForms: ModelConfigForm/BaseUrl/AddModel/AddKey/ReplaceKey/StageDefault (reset hanya saat sukses)
- [x] 3 halaman: Suspense per-section + pesan error DB inline + empty state
- [x] Kelola: tetap Link (skeleton route global) — dinyatakan, tanpa kerja palsu
- [x] Gate: typecheck/lint/366 tests hijau

## Risks
- Notice hardcoded ID (konsisten dgn admin/llm yang memang hardcoded; tanpa key katalog baru).
- MAX_ATTEMPTS image tetap 3; Ulangi reset attempts → loop manual tak terbatas bila model selalu gagal (diterima: eksplisit per klik admin).
- Reorder + toggle konkuren bisa interleave revalidate (diterima utk admin UI; kontrol di-disable saat busy).

## Progress Log
- 2026-09-10 12:45:00 — SELESAI & gate hijau. Draf 023e0a95 bisa di-Ulangi dari review (worker retry otomatis ≤5 mnt).

## Notes
- C2M/TM Forum tidak relevan (admin tooling internal).
- Perilaku berubah: aksi gagal tak lagi lempar ke error.tsx — notice inline + rollback.
