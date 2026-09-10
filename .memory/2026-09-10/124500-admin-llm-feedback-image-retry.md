# Admin LLM Feedback + Image Retry (Ulangi Generik)

Tanggal: 2026-09-10 12:45 (local). Plan: `plans/2026-09-10-admin-llm-feedback-image-retry.md`. Keputusan user: tombol Ulangi generik, skop feedback penuh, inline role=status/alert.

## Diagnosis 023e0a95 (MCP read-only)
- Cover `post_index=0` failed 05:00, `attempts=1`, `last_error='image_prompt: no JSON object found'`. Draf sendiri sehat (developing cloudflare 4476 char).
- Waterfall: 3.8-flash 503 → 3.7-flash 503 → 3.6-flash 200 **17 token** fragmen markdown tanpa `{` (thinking HIGH × maxTokens 500, kode pre-fix pagi).
- `parseImagePrompt` throw → `failImage` terminal; claim hanya `pending` → tak pernah retry; tanpa tombol ulang di review.
- Efek samping baik: fix pagi terbukti bekerja (baris 05:10/05:15 `finish_reason=STOP`).

## File diubah
- `src/components/admin/llm/ActionFeedback.tsx` (baru) + test (5): notice working/success/error, PendingButton useFormStatus, BoardSkeleton.
- `src/components/admin/llm/LlmForms.tsx` (baru): ModelConfigForm/BaseUrl/AddModel/AddKey/ReplaceKey/StageDefault + notice (reset field hanya saat sukses).
- Boards + SortableList: busy per-kontrol + disable + DragOverlay + revert-on-error + onSettled + notice.
- 3 halaman llm: section async + Suspense skeleton + error DB inline + empty state.
- `src/lib/admin/llm-actions.ts`: semua return `{ok}|{ok:false,error}` (throw hanya auth).
- `src/lib/image/worker.ts`: gagal parse → 1x retry 0.3 JSON-ONLY; gate retry via attemptParsed; gate_retried mencakup parse.
- `src/lib/image/actions.ts`: `retryFailedImage` (admin, guard status failed, reset pending/attempts 0).
- `DraftImageCard.tsx`: tombol Ulangi utk baris failed + notice antrean.

## Keputusan / trade-off
- Notice hardcode ID (admin/llm memang hardcode; tanpa katalog baru).
- Kelola tetap Link biasa — skeleton route global sudah mencakup; tanpa kerja palsu.
- Ulangi manual tak terbatas bila model selalu gagal (eksplisit per klik; diterima).

## Verifikasi
- `typecheck` ✓, `lint` ✓, `npm test` 366/366 (48 files) ✓.
- Belum: klik manual Ulangi di draf 023e0a95 + cek cover prompt_ready (butuh cron ≤5 mnt pasca-deploy).

## Commit
- `feat(admin): feedback llm penuh plus ulangi image failed`
