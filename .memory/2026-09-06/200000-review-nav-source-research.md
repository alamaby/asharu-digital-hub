# Review: AdminTopBar + link riset sumber

- Task: halaman review butuh navigasi admin standar + navigasi ke riset penghasil konten.
- Temuan: daftar review SUDAH ada AdminTopBar; detail belum; keduanya tanpa link riset.
- Key files: `konten/review/[draftId]/page.tsx` (AdminTopBar + lookup session via research_topic_id + link "Lihat riset sumber", draf legacy tanpa topik → sembunyi), `konten/review/page.tsx` (map topik→sesi 1 query) + `ReviewListClient.tsx` (footer "Riset →" per kartu di luar card-link agar valid HTML), `messages/id+en.json` (`viewSourceResearch/researchLink`).
- Decisions: link di list + detail; nested link dihindari (footer terpisah); tanpa migrasi/denormalisasi.
- Verification: `typecheck` ✓, `lint` ✓, `267/267` tests ✓.
- Commit proposal: `feat(review): admin nav plus source research links`
