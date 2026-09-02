# Affiliate Mismatch Recommendation at Awaiting Selection

Created: 2026-09-02 15:20:00

## Objective
Saat tidak ada produk afiliasi yang match (score < threshold 6), berikan rekomendasi ke admin di stage `awaiting_selection` (sebelum shortlist) agar admin tahu topik mana yang akan jadi draft tanpa affiliate, dan bisa tambah produk relevan / pilih topik lain.

## Root Cause
- Affiliatе matching hanya terjadi di stage `developing` (post-shortlist). Admin tidak tahu preview match sebelum shortlist.
- Threshold 6 (commit f3a7be8) kini menolak match lemah → banyak topik (terutama kategori konten `berita`/`kebijakan` yang tidak punya kategori produk ekuivalen) akan jadi draft tanpa affiliate.
- Admin butuh visibilitas dini untuk keputusan: tambah produk vs pilih topik lain vs lanjut tanpa affiliate.

## Fix
- `affiliate.ts`: refactor `selectAffiliateProduct` → ekstrak `fetchActivePool` + pure `scoreBestProduct` + `computeTopScore`. Tambah `previewAffiliateMatches(supabase, topics)` batch (1 pool query, score per-topic in-memory).
- `page.tsx` awaiting_selection: call `previewAffiliateMatches`, pass `affiliatePreviews` map ke `ResearchSessionActions`.
- `ResearchSessionActions`: render badge per-topic (cocok/kurang/tidak/tanpa) + banner rekomendasi (jumlah unmatched + kategori topik + link kelola produk) saat ada unmatched.

## Tasks
- [x] `affiliate.ts`: refactor + `previewAffiliateMatches`
- [x] `page.tsx`: expand TopicRow (hooks/key_facts/unique_angle), call preview, pass ke component
- [x] `ResearchSessionActions`: banner rekomendasi + badge per-topic
- [x] messages id/en: affiliateMismatch keys
- [x] lint + typecheck + test
- [x] commit + push

## Risks
- Preview add 1 pool query per awaiting_selection render (cheap, 1 query 50 rows). Acceptable.
- Link "Kelola produk afiliasi" → `/admin` (no dedicated affiliate admin route yet). Placeholder link; admin scrape via `scripts/scrape-affiliate.mjs`. Di-flag untuk route terpisah.
- Badge "Tanpa produk" mungkin bikin admin avoid topik berkualitas tinggi tapi tanpa match. Counter: tetap informative — admin bisa pilih lanjut tanpa affiliate (draft valid).

## Progress Log
- 2026-09-02 15:20:00 — Implementasi lengkap. lint ✓ typecheck ✓ test ✓ (228).
