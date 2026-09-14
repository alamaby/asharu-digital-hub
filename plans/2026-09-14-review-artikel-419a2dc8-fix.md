# Fix review artikel 419a2dc8 — length, visual, upload, affiliate image, emoji

Created: 2026-09-14 12:30:00

## Objective

Perbaiki 5 temuan pada review artikel `419a2dc8-ce6a-4e00-a60a-79fd4043d432` (platform `artikel`, 488 kata, thin-content):
1. Panjang di bawah gate 600 kata (prompt minta 800–1500).
2. Belum ada generate image per paragraf/section di review artikel.
3. Belum ada upload image manual sebagai alternatif.
4. Section afiliasi tidak menampilkan gambar produk.
5. Minim emoji.

Keputusan user: gate tetap 600 kata + prompt 800–1500; scope gambar = cover + afiliasi dulu; reuse `affiliate_products.image`; emoji 1 per section.

## Scope

- `src/lib/llm/prompt.ts` (prompt artikel + emoji + thin-repair helper)
- `src/lib/research/development.ts` (thin-repair loop artikel)
- `src/components/content/ContentDraftCard.tsx` + `ArticleDraftCard.tsx` (cover + afiliasi di review)
- `src/lib/articles/actions.ts` (publish wiring `cover_image_url` + `expandArticleDraft`)
- `src/lib/image/actions.ts` + `storage.ts` (upload cover manual)
- `src/app/[locale]/(public)/artikel/[slug]/page.tsx` (render cover + thumbnail afiliasi)
- Tanpa migrasi DB (reuse kolom yang ada).

## Milestones

1. Length + emoji (prompt + repair loop + test)
2. Cover di review + publish wiring
3. Upload manual + afiliasi visual
4. Repair action + gate hijau + commit/push

## Tasks

- [x] Investigasi read-only + keputusan scope user
- [x] Prompt hardening (budget per-section eksplisit) + rule emoji 1/section
- [x] Thin-repair loop 1x di `generateArticleAndInsertDraft` + maxTokens repair 6000
- [x] Teruskan cover ke cabang artikel + render `DraftImageCard` cover
- [x] Publish set `cover_image_url` dari `selected_image_id`
- [x] Render cover + thumbnail afiliasi di halaman publik
- [x] Action `uploadDraftCoverImage` + UI upload
- [x] Kartu produk + penanda section afiliasi di review artikel
- [x] Action `expandArticleDraft` untuk repair `419a2dc8`
- [x] Gate + commit + push + memory

## Risks

- Model Cloudflare gemma-sea-lion tetap under-generate → repair loop + evaluasi maxTokens/model default.
- Worker image timeout intermiten (bukti: Gateway Timeout) → retry + upload manual.
- Emoji berlebih merusak SEO → dibatasi 1/section.
- Fetch og:image live ditolak (Shopee blokir) → reuse `affiliate_products.image`.

## Progress Log

- 2026-09-14 12:30:00 — Plan dibuat dari investigasi read-only (488 kata/thin, cover failed tak tampil, publish tak wiring cover, tanpa upload final, afiliasi tanpa gambar, prompt tanpa emoji). Scope dikonfirmasi user.
- 2026-09-14 12:35:00 — Masuk build mode, mulai implementasi.
- 2026-09-14 14:50:00 — Selesai. Gate hijau: typecheck + lint (0 warning) + 569 tests + build. Tanpa migrasi DB.

## Notes

Fitur kecil — tanpa seremoni TOGAF penuh dan tanpa C2M/TM Forum (bukan billing/telecom). Trade-off utama: per-section image penuh ditunda (biaya 5x + butuh model data baru); cover+afiliasi menutup 80% keluhan.
