# Project-docs didokumentasikan (init + 9 backfill + dist)

Date: 2026-10-06 16:20 WIB

## Task
User `/project-docs buatkan dokumentasi` (scope: Init + riwayat terakhir dari git log main, bilingual ID/EN, assemble dist).

## Key files changed
- `project-docs/` (baru): `tools/Build-ProjectDocs.ps1` + templates dari skill, `data/project.json` (brand Asharu, stack Next.js 15/Supabase), `data/architecture/current.json` (9 komponen), `data/releases.json` (v0.1.0, 9 changes), `data/changes/*.json` 9 entri 21-key (2026-09-25 s.d. 2026-10-02), halaman HTML + `assets/` + `components/`.
- `dist/project-docs/` (baru): output statis build (link-check 0 broken).
- `eslint.config.mjs` — ignores tambah `project-docs/**`, `dist/**` (JS statis docs bukan kode aplikasi).

## Decisions
- Seed template `2026-01-01-initial-setup` dihapus (konten generik, tak terverifikasi untuk repo ini); rilis v0.1.0 hanya berisi 9 ID terverifikasi.
- `seq` per tanggal ikut urutan waktu commit (29 Sep: batch-route 1, preview 2, overflow 3; 28 Sep: lab-stats 1, email 2; 25 Sep: endpoint-try 1, reaper 2).
- Validation tak tercatat di history ditulis `not-verified:` (build 81a8792/4419c1d/3620097/c53f867/7e0cfc2; lint c53f867).
- Bilingual inline `ID / EN` satu field (tanpa ubah skema 21-key).
- Insiden scaffold: Init tak copy `assets/` (skillRoot==Root) + copy manual tersarang `assets/assets/` (terhapus lalu copy ulang benar); halaman rilis basi diregenerasi.

## Verification
- `Build-ProjectDocs.ps1`: 9 entries, `OK ... 0 broken link(s)`.
- Gate: typecheck 0 error, lint 0 error (16 warning pre-existing), test 1234/1234 hijau.

## Commit
`docs(project-docs): init static docs with 9 verified changes plus dist`

## Related
- `plans/2026-10-02-threads-playwright-poster-implementation-plan.md` (Progress Log S9 gate 1234)
- `.memory/2026-09-29/171500-batch-overflow-highlight.md`, `2026-09-28/111500-email-research-link.md`, `2026-09-28/104904-lab-stats-collapsible.md`
