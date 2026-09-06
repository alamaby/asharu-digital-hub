# Fix 679b2494: twitter over-limit + link pisah dari nama produk

- Task: (1) twitter over semua padahal threads lolos; (2) Balasan 3 = nama tanpa link, Balasan 4 = cerita + link (screenshot).
- Akar:
  1. Prompt kontradiktif untuk cap kecil: LENGTH ≥90% (252/280) + 3-5 kalimat + URL budget vs HARD LIMIT. LLM pilih langgar batas. Retry-shorten memakai system sama → tarik-menarik → gagal → simpan+tandai.
  2. Bukan LLM salah: LLM tulis nama+URL benar di replies[2]; `repositionPlaceholder` (target floor(7/2)=3) pindah HANYA token URL ke replies[3], nama tertinggal; EN malah tanpa link (pindah satu surface). Prompt "tengah" ambigu (off-by-one vs hitungan LLM).
- Key files: `prompt.ts` (LENGTH tier ≤300 → 70% + kalimat pendek; placement BALASAN 4 eksak + nama&link tak terpisah), `development.ts` (retry override: HARD LIMIT menang, potong kalimat), `thread.ts` (toleransi ±1: index 2 vs 3 dibiarkan, destruksi hanya bila jauh), `ContentDraftCard.tsx` (anchor disembunyikan bila teks sudah berisi URL).
- Decisions: tier hanya ubah cap kecil; toleransi pertahankan perilaku lama untuk jauh; tanpa migrasi.
- Verification: `typecheck` ✓, `lint` ✓, `275/275` tests ✓ (+3: tier, placement, toleransi).
- Commit proposal: `fix(research): tiered length plus exact affiliate placement plus tolerance`
