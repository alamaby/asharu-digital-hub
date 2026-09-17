# Chat Lab Streaming Progresif (SSE)

Created: 2026-09-17 12:10:00

## Objective
Chat Lab (`/lab`, live di `7541c8d`) saat ini sinkron-blocking: user menunggu di form
sampai SEMUA target selesai (`await Promise.allSettled` di Server Action). Ubah menjadi
streaming progresif: tiap target tampil token-per-token secara live + tombol Batal,
sekaligus menghasilkan metrik akurat TTFT, tok/s real, dan latensi total.

## Scope
- In: tipe `chatStream` di interface provider; implementasi SSE 3 adapter
  (OpenAI-compatible, Gemini, Cloudflare); orkestrasi fan-out + event namespaced;
  Route Handler `POST /api/lab/stream`; UI append-per-kartu + Batal; i18n id/en;
  tests (parser SSE per provider, orkestrasi, UI); kolom `ttft_ms` yang sudah ada
  langsung terisi (tanpa migrasi skema baru).
- Out: riwayat ulang desain DB (reuse `chat_lab_batches/runs` apa adanya);
  estimasi token saat usage hilang (tetap tampil `-`, jujur); retry auto stream
  terputus (cukup tombol Jalankan ulang); hapus jalur sync lama (dipertahankan
  sebagai fallback bila SSE gagal).

## Milestones
1. Kontrak stream + implementasi 3 adapter + fixture tests
2. Orkestrasi lab (TTFT/latency/tok/s/abort) + tests murni
3. Route SSE + UI streaming + i18n + tests UI
4. Gate hijau + commit submodule→parent (bila ada migrasi; diperkirakan tanpa
   migrasi) + push + memori

## Tasks
- [ ] T1 Kontrak: `StreamDelta/StreamFinal` + `chatStream()` di `src/lib/llm/types.ts`
      (adapter tanpa stream boleh fallback: `chat()` lalu yield sekaligus)
- [ ] T2 Adapter OpenAI-compatible (`stream:true` + `stream_options.include_usage`)
      + fixture SSE test (`naraya/openrouter/ciora` reuse adapter ini)
- [ ] T3 Adapter Gemini (`streamGenerateContent?alt=sse`, `usageMetadata` akhir)
      + fixture SSE test
- [ ] T4 Adapter Cloudflare (`stream:true`); bila SSE tak stabil → fallback
      non-stream terdokumentasi + test
- [ ] T5 `src/lib/lab/stream.ts`: gabung N generator → event namespaced
      (`lab-delta/lab-done/lab-error`) + hitung TTFT/latency/tok/s + dukung abort
      + tests (TTFT benar, abort hentikan semua, 1 target gagal tak matikan lain)
- [ ] T6 `src/app/api/lab/stream/route.ts`: auth cookie (login-only) → validasi
      Zod + pin silang (reuse) → rate `chat_lab` 30/jam + kuota harian → insert
      batch + placeholder runs → `ReadableStream` SSE → UPDATE runs per target
      selesai (`maxDuration: 300`, pola worker lain)
- [ ] T7 UI: `LabForm` mode stream + kartu hasil live (kursor berkedip) + tombol
      Batal (`AbortController`) di `LabPageClient`; selesai semua → refresh
      stats + history (reuse `getLabStats`/`listLabBatches`)
- [ ] T8 i18n `lab.stream.*` id/en paritas + `lab` tetap di allow-list client
- [ ] T9 Tests UI `LabStream.test` (append delta, batal, done refresh)
- [ ] T10 Gate `typecheck/lint/test/build` + commit + push + memori

## Risks
- Vercel Hobby timeout ±60s memotong stream reasoning panjang → default maxTokens
  1000 dipertahankan + pesan "model lambat? kecilkan max tokens". Counter: user Pro
  tidak kena; sync lama pun kena batas yang sama sehingga bukan regresi.
- Usage hilang di stream (terutama Cloudflare) → tampil `-`, agregat abaikan NULL
  (konsisten perilaku sekarang). Counter: alternatif estimasi token dari karakter
  menyesatkan — ditolak demi kejujuran metrik.
- Klien disconnect mid-stream → server UPDATE apa yang terkumpul saat abort
  terdeteksi; sisa dibersihkan expiry yang sudah ada. Counter: orphan batch parsial
  mungkin tampil di history — diterima, ditandai apa adanya.
- 3 format SSE berbeda → fixture test per provider wajib hijau sebelum merge;
  Cloudflare boleh fallback non-stream di v1 tanpa blokir milestone lain.

## Progress Log
- 2026-09-17 12:10:00 — Plan detail dibuat (mode build, atas permintaan user).
  User memilih "Streaming progresif" atas opsi tetap-sync/async/hybrid. Belum eksekusi.

## Notes
- Secret tetap server-side: key Vault hanya dibaca Route Handler via service_role;
  klien terima teks token saja (RLS lab tetap owner).
- Event SSE namespaced per `runId` dalam SATU koneksi per batch (bukan 1 koneksi
  per target) agar hemat koneksi dan kuota insert batch tunggal.
- Jalur sync `runChatLabBatch` dipertahankan sebagai fallback (mis. browser tanpa
  `ReadableStream` atau SSE gagal total) — tanpa hapus kode.
- Skala fitur kecil-menengah: TOGAF/ODA tidak diberlakukan formal; prinsip repo
  yang dipakai: DB-as-Code non-destruktif, RLS ketat, Zod fail-fast, RSC +
  island client minimal, tanpa secret ke klien.
