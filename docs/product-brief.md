# Product Brief — Asharu Digital Hub

Created: 2026-10-08 · Status: Prototype · Audience: Indonesian UMKM, pilot partners, Claude Startups reviewers.

## Ringkasan

Asharu Digital Hub adalah workspace operasi konten dan portofolio digital berbantuan AI untuk UMKM Indonesia. Membantu riset ide, menyusun draf per kanal, meninjau kualitas, menyiapkan publikasi, dan mengubah aktivitas usaha menjadi portofolio yang dapat dipakai ulang.

Bukan generator caption generik. Pembeda: pipa Content-to-Portfolio.

## Masalah

1. Waktu terbatas untuk konten rutin.
2. Tanpa tim pemasaran.
3. Sulit mencari ide relevan.
4. Komunikasi tidak konsisten.
5. Proyek sulit didokumentasikan.
6. Postingan hilang tanpa menjadi aset.
7. Risiko klaim tak berdasar.

Nada: hormat — pemilik UMKM mampu, hanya kekurangan waktu dan sistem.

## Pengguna awal

Usaha rumahan, kuliner, jasa lokal, usaha kreatif, profesional mandiri, agen properti, pedagang online kecil. Kriteria: jualan aktif via media sosial, tanpa tim konten.

## Alur

Riset → Susun → Tinjau → Publikasikan (siap terbit, bukan auto-post) → Portofolio. Setiap artefak dapat diedit. Publikasi butuh persetujuan eksplisit (`approvedBy` + `approvedAt`).

## Diferensiator

Aktivitas usaha → Bukti → Brief → Draft ditinjau → Siap terbit → Entri portofolio. Contoh ilustrasi: katering 300 tamu → postingan dokumentasi, behind-the-scenes, studi kasus, entri portofolio, ringkasan proposal.

## Status jujur

* Berfungsi (internal, butuh akses): riset multi-sumber + Tavily, draf multikanal bilingual, review admin, antrean Threads terjadwal, Studio visual, Chat Lab, log LLM.
* Prototipe (publik baru): halaman `/digital-hub`, formulir minat pilot (validasi + honeypot + rate-limit, tanpa simpan otomatis).
* Rencana: tabel waitlist Supabase + retensi, transformasi portofolio butuh bukti, repurposing lintas kanal, integrasi terbit langsung (tetap butuh approval).

## Metrik keberhasilan pilot (kualitatif)

Konten mingguan tanpa menambah jam kerja, draf lolos tinjauan tanpa klaim tak berdasar, 1 entri portofolio per aktivitas penting.

## Batasan

Tanpa testimoni/favorit palsu, tanpa klaim angka pengguna, tanpa janji terbit otomatis, tanpa sertifikasi. Contoh selalu dilabeli ilustrasi.
