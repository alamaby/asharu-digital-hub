# Admin Konten Mobile: Kartu Bisa Di-tap ke Review + Touch Target + Hapus Dead Code

Created: 2026-09-19 20:07:05

## Objective

1. Di layar `admin/konten` mobile, men-tap kartu **draf** langsung membuka halaman review draf (`/konten/review/[draftId]`). Baris **request** tetap tanpa link (keputusan user).
2. Perbaiki link desktop yang salah target di tabel `admin/konten` dan di `RecentDraftsList` dashboard (keduanya saat ini mengarah ke halaman list generik tanpa ID).
3. Naikkan target sentuh kontrol kecil (<44px) ke minimum 44px di alur list → review (P2).
4. Hapus file dead code `src/components/content/DraftListCard.tsx` yang tidak diimpor dari mana pun.

## Scope

File yang diubah (hanya ini, jangan melebar):

- `src/components/admin/KontenList.tsx` — blok mobile `md:hidden` (~L315-340), sel aksi desktop (~L297-301), kontrol kecil (sort `<th><button>`, tombol platform, `PaginationLink`, link Reset, `FilterSelect`).
- `src/components/admin/DashboardCards.tsx` — `RecentDraftsList` (~L236-238).
- `src/components/admin/ReviewListClient.tsx` — tombol `Pilih semua`/`Hapus`, `Terapkan`, `Reset`, `Prev`/`Next`.
- `src/components/content/ContentDraftCard.tsx` — tombol `Edit`, `Reject` (tombol `Save`/`Approve` memakai `.btn-primary` yang sudah 44px, tidak perlu diubah).
- `src/components/content/CopyButton.tsx` — satu tombol (~L33).
- Hapus: `src/components/content/DraftListCard.tsx`.

Out of scope (jangan dikerjakan di sini): pagination kecil di `ResearchListClient`/detail riset, tombol kecil `PublishedArticleEditor`, fallback `/admin/riset` di `ContentRequestForm.tsx:282`, link `draft_id` polos di `sosial`.

## Milestones

1. P1 navigasi selesai (mobile + desktop + dashboard) — bug utama hilang.
2. Dead code dihapus, gate hijau.
3. P2 touch target selesai, gate hijau, verifikasi manual mobile.
4. Commit + push sesuai aturan repo.

## Tasks

### Langkah 0 — Orientasi (wajib sebelum edit)

- [ ] Baca utuh `src/components/admin/KontenList.tsx`. Nomor baris di plan ini acuan awal; bila kode bergeser, cari dengan penanda komentar `{/* Mobile card list */}` dan `{/* Desktop table */}`.
- [ ] Baca `src/components/admin/DashboardCards.tsx` (fungsi `RecentDraftsList` di akhir file), `src/components/content/CopyButton.tsx` (hanya 40 baris).
- [ ] Konfirmasi pola link ber-ID yang sudah terbukti di repo: `src/app/[locale]/(admin)/admin/llm/logs/page.tsx:225` memakai `Link` dari `@/i18n/navigation` dengan `href={{ pathname: '/konten/review/[draftId]', params: { draftId: r.draft_id } }}`. Tiru pola ini persis.

### Langkah 1 — P1: kartu mobile bisa di-tap (file: `src/components/admin/KontenList.tsx`)

Kondisi saat ini (blok `ul.space-y-3 md:hidden`): setiap `<li>` hanya berisi `<p>` dan `StatusBadge`, tanpa `<Link>`/`<button>` — kartu mati total di mobile.

- [x] Ubah `items.map` mobile menjadi bentuk callback dengan body bersama, lalu bungkus kondisional berdasarkan `item.kind`:
  - `kind === 'draft'` → bungkus body dengan `Link` (sudah diimpor dari `@/i18n/navigation` di file ini) ke `{ pathname: '/konten/review/[draftId]', params: { draftId: item.id } }`.
  - `kind === 'request'` → bungkus body dengan `<div>` polos (tanpa link, sesuai keputusan).
- [ ] Pindahkan class kartu (`rounded-xl border border-line bg-surface p-4 shadow-card`) dari `<li>` ke elemen pembungkus (`Link`/`div`), dan tambahkan pada `Link`: `block transition-colors hover:border-primary active:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20`.
- [ ] Tambahkan `aria-label` pada `Link`: `` `${t('viewDraft')}: ${item.topic ?? item.id}` `` (`t` = `useTranslations('admin.konten')`, sudah ada di komponen; `viewDraft` = "Lihat"/"View").
- [ ] Hasil akhir struktur (sketsa, sesuaikan dengan isi body yang sudah ada — JANGAN ubah teks/isi kartu):
```tsx
<ul className="space-y-3 md:hidden">
  {items.map((item) => {
    const body = (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink">{shortTopic(item.topic, 100)}</p>
          <StatusBadge status={item.status} />
        </div>
        {/* ... paragraf platform/tanggal, kategori, provider TETAP SAMA ... */}
      </>
    );
    return (
      <li key={`m-${item.kind}-${item.id}`}>
        {item.kind === 'draft' ? (
          <Link
            href={{ pathname: '/konten/review/[draftId]', params: { draftId: item.id } }}
            className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary active:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label={`${t('viewDraft')}: ${item.topic ?? item.id}`}
          >
            {body}
          </Link>
        ) : (
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            {body}
          </div>
        )}
      </li>
    );
  })}
</ul>
```
- [ ] LARANGAN: jangan menaruh `<button>` di dalam `<Link>` kartu (isi kartu saat ini teks-only, jadi aman — pertahankan begitu).

### Langkah 2 — P1: perbaiki sel aksi desktop (file yang sama)

Kondisi saat ini (~L297-301): semua baris memakai `<Link href={{ pathname: '/konten/review' }}>` tanpa ID — nyasar ke halaman list.

- [ ] Ganti isi `<td className="px-4 py-2">` kolom aksi menjadi:
```tsx
<td className="px-4 py-2">
  {item.kind === 'draft' ? (
    <Link
      href={{ pathname: '/konten/review/[draftId]', params: { draftId: item.id } }}
      className="inline-flex min-h-touch items-center text-xs text-primary underline"
    >
      {t('viewDraft')}
    </Link>
  ) : (
    <span className="text-xs text-ink-muted">—</span>
  )}
</td>
```

### Langkah 3 — P1: perbaiki `RecentDraftsList` (file: `src/components/admin/DashboardCards.tsx`)

Kondisi saat ini (~L236-238): `<Link href={{ pathname: '/konten/review' }}>` di dalam `drafts.map` tanpa ID. List ini hanya berisi draf (`RecentDraft[]`), jadi selalu linkable.

- [ ] Ganti `href` menjadi `{ pathname: '/konten/review/[draftId]', params: { draftId: d.id } }`. Jangan ubah class atau isi kartu.

### Langkah 4 — Hapus dead code `src/components/content/DraftListCard.tsx`

- [ ] Grep repo (di luar `node_modules`) untuk `DraftListCard`. Yang BOLEH tersisa: type `DraftListCardImport` di `src/app/[locale]/(admin)/konten/review/page.tsx` (~L103,113,162) — itu nama kebetulan sama dan TIDAK terkait; jangan sentuh file tersebut.
- [ ] Hapus file `src/components/content/DraftListCard.tsx` (tidak ada test yang merujuknya — sudah diverifikasi via glob).
- [ ] Jalankan `npm run typecheck` — harus hijau (membuktikan tidak ada import tersisa).

### Langkah 5 — P2: touch target ≥44px (tambah class `min-h-touch`, sudah tersedia sebagai utilitas di repo)

Aturan: tombol teks kecil → tambah `min-h-touch` (tambah `items-center` bila belum ada agar teks vertikal tengah). Tombol icon-only → `min-h-touch min-w-touch`. JANGAN ubah ukuran font. `.btn-primary`/`.btn-secondary` sudah mengandung `min-h-touch` (`src/app/globals.css:231-236`) — tombol yang memakainya TIDAK perlu diubah.

- [ ] `KontenList.tsx`: tombol sort di `<th>` (~L272-280) → tambah `min-h-touch inline-flex items-center`; tombol `Pilih semua`/`Hapus` platform (~L206-219) → tambah `min-h-touch` dan naikkan `px-2` → `px-3`; `PaginationLink` (~L405-410) → tambah `min-h-touch`; link `Reset` (~L256) → tambah `min-h-touch inline-flex items-center`; `<select>` di `FilterSelect` (~L380-384) → tambah `min-h-touch`. Tombol `Terapkan` memakai `.btn-primary` → lewati.
- [ ] `ReviewListClient.tsx`: tombol `Pilih semua`/`Hapus` di `MultiSelect` (~L69-82) → tambah `min-h-touch` (+ `px-3`); tombol `Terapkan` (~L196) → tambah `min-h-touch`; link `Reset` (~L197) → tambah `min-h-touch inline-flex items-center`; link `Prev`/`Next` (~L256-257) → tambah `min-h-touch inline-flex items-center`.
- [ ] `ContentDraftCard.tsx`: tombol `Edit` (~L290-299, `px-2 py-1 text-[11px]`) → tambah `min-h-touch`; tombol `Reject` (~L380-385, `px-3 py-1.5 text-xs`) → tambah `min-h-touch`. Tombol `Save` (~L281-288) dan `Approve` (~L361-366) memakai `.btn-primary` → lewati.
- [ ] `CopyButton.tsx` (~L33): tambah `min-h-touch` pada class tombol.

### Langkah 6 — Gate + verifikasi manual

- [ ] Jalankan berurutan sampai semua hijau: `npm run typecheck`, `npm run lint`, `npm test`. ATURAN REPO (final): SETIAP edit setelah gate hijau — sekecil apa pun — MEMBATALKAN gate; wajib re-run `typecheck` + `lint` sebelum commit.
- [ ] Verifikasi manual (dev server, viewport ~360px): tap kartu draf di `admin/konten` → membuka `/konten/review/[id]`; baris request tidak merespons tap; link desktop "Lihat" membuka detail draf dan `—` untuk request; `RecentDrafts` di dashboard admin membuka detail; tidak ada layout rusak akibat `min-h-touch`.

### Langkah 7 — Commit + push (aturan repo `AGENTS.md`)

- [ ] Sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage HANYA file yang diubah; pastikan tidak ada secret (`.env*`, `sb_secret_*`, `sb_publishable_*`) di diff.
- [ ] Pesan Conventional Commits SATU baris, tanpa trailer `Co-authored-by:`. Usulan: `fix(admin): kartu konten mobile bisa di-tap ke review`.
- [ ] Submodule `supabase/` tidak disentuh di task ini — lewati aturan submodule.
- [ ] Jika push ditolak (remote lebih baru): `git fetch`, cek `git log main..origin/main`, gabung via `git pull --no-rebase`, pastikan gate tetap hijau, push lagi.
- [ ] Laporkan hash + pesan + file kunci setelah push.

## Risks

- Kenaikan `min-h` menggeser ritme vertikal sedikit — dimitigasi karena hanya tinggi minimum yang ditambah, bukan margin; font tidak diubah.
- Baris `request` kehilangan aksi "Lihat" — sudah disetujui user (belum ada rute detail request).
- Jika `Link` i18n mengeluh tipe `href` saat build, ikuti pola `as never` yang sudah dipakai di file yang sama (`router.push(... as never)`, `href={pathname as never}`) — tetapi utamakan bentuk typed normal dulu.
- Penghapusan file: bila `typecheck`/`test` merah setelah hapus, kembalikan file dan laporkan temuan import yang terlewat — jangan commit merah kecuali diminta.

## Progress Log

- 2026-09-19 20:07:05 — Plan dibuat dari audit 3 agen + verifikasi manual (`KontenList:298,316-334`, `DashboardCards:237`, token `min-h-touch` di `globals.css:24-25,231-236`). Keputusan user: request tanpa link, P2 ikut, `DraftListCard` dihapus. Status: menunggu implementasi.
- 2026-09-19 20:30 — Implementasi SELESAI (P1 + P2 + dead code). Mobile draft cards → `/konten/review/[draftId]`; desktop actions kolom → ber-ID draf / "—" untuk request; `RecentDraftsList` dashboard → ber-ID; touch target 44px pada semua tombol kecil; hapus `DraftListCard.tsx`. Gate `typecheck` ✓, lint 0 error ✓, 951 test ✓, build ✓. Commit `3e343ca` on `main`, belum ter-verifikasi live mobile tap.

## Notes

- Pola acuan yang benar sudah ada di repo: kartu-sebagai-link dengan ID di `ReviewListClient.tsx:218-220` dan link ber-ID di `admin/llm/logs/page.tsx:225`. Bug ini terjadi karena `KontenList` (satu-satunya list dengan dual-render `hidden md:block` + `md:hidden`) tidak meniru pola tersebut.
- Tidak ada implikasi standar domain (C2M/TM Forum) — ini murni fix UI navigasi + a11y touch target.
- Plan ini satu file satu rencana; bila muncul kebutuhan lanjutan (touch target di riset/detail, fallback `ContentRequestForm:282`), buat plan file terpisah.
