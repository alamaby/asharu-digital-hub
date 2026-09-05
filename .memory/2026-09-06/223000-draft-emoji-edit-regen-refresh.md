# Draf bf11143d: emoji minim + edit per-post + refresh pasca-regen

- Analisa draf (facebook, pasca regen_affiliate gemini): 8 post, emoji hanya di reply afiliasi (📦🔥/🛒✨). Aturan EMOJI di prompt ada tapi tanpa enforcement/validasi → LLM abaikan.
- Fix:
  1. `thread.ts`: `hasEmoji` + `auditThreadEmoji` (per post per lang).
  2. `development.ts`: audit emoji + 1x repair retry; masih kosong → flag `llm_meta.emoji_missing/emoji_gaps` + log warn + `EMOJI-MISSING` di log.
  3. `actions.ts` regen: audit reply rewrite + 1x repair; flag `emoji_missing` di llm_meta regen.
  4. `ContentDraftCard`: tombol Sunting per post (0=main, 1..n=reply), simpan per post; sync state dari prop baru (render-time ref) agar hasil reselect/regen tampil tanpa refresh manual; banner `emojiMissingNote`.
  5. i18n: `save`, `emojiMissingNote` (id+en).
- Decisions: repair-sekali-lalu-tandai (konsisten over-limit); tanpa polling; referensi prop berubah = data baru (RSC hanya render ulang saat refresh).
- Verification: `typecheck` ✓, `lint` ✓, `270/270` tests ✓ (+3 emoji).
- Commit proposal: `feat(review): emoji audit plus per-post edit plus live regen refresh`
