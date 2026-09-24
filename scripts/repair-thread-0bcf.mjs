/**
 * Sekali pakai (S7 plan threads-emoji-repair-overwrite-fix).
 *
 * Cetak statement SQL untuk memulihkan draf threads 0bcf2f6e... yang kolom
 * `id`-nya berisi placeholder "main"/"reply-N" (repair emoji 03:24:06
 * menimpa attempt-1 03:23:40 yang utuh).
 *
 * Skrip INI TIDAK menyentuh database. Ia hanya:
 *   1. validasi snapshot bentuk thread rusak (khasil dari SELECT manual),
 *   2. rekonstruksi thread dari raw attempt-1 (sumber: llm_call_logs),
 *   3. cetak 1 statement UPDATE + 1 SELECT verifikasi untuk review manusia.
 *
 * Run:  node scripts/repair-thread-0bcf.mjs
 * Lalu: salin statement ke SQL editor Supabase / psql, review, baru eksekusi.
 *
 * Catatan duplicate-key: raw attempt-1 punya `"id"` ganda per reply. V8
 * `JSON.parse` memakai key TERAKHIR → field `id` berisi teks Indonesia
 * (pilihan O1 di plan; bukan `"1"`, `"2"`, ...). Ini disengaja: `en` ikut
 * berasal dari generasi yang sama, sehingga 1 post (`replies[3]`) punya `id`
 * dan `en` identik karena LLMoriginally wrote the same text twice.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DRAFT_ID = '0bcf2f6e-cf39-4c21-83b4-0c1e6e4b0862';
const SESSION_ID = '68c0fd0b-dcc8-4ae1-9079-722292921f6a';
const ATTEMPT1_AT = '2026-09-24 03:23:40.552913+00';
const ATTEMPT1_LEN = 4128;
const PRODUCT_URL = 'https://s.shopee.co.id/5fommHcJr9';
const LABEL_RE = /^\s*(main|reply-\d+|\d+)\s*$/i;

// Raw attempt-1 disalin persis dari llm_call_logs (lihat header). Jangan diedit
// tangan di bawah — biarkan JSON.parse yang menyelesaikan duplicate-key.
const RAW_ATTEMPT1 = `{"main":{"id":"Pernah ngalamin bingung tiap mau kerja? Antara mau tampil rapi tapi bukan full formal, terus outfit yang ada juga bikin gerah seharian — akhirnya milih hoodie aja kali ya 🤦‍♀️\\n","en":"Ever had that morning struggle at work? Wanting to look put-together but not full-on formal, yet everything in your closet feels too hot for the office — so you end up grabbing that hoodie instead 😅"},"replies":[{"id":"1","en":"Rasanya kamu kurang percaya diri pas meeting, dikit-dikit nyium baju keringetan, atau malah cuma pengen balik ke rumah lebih cepat gara-gara nggak nyaman sama penampilan sendiri 💀","id":"Dampaknya nyata banget — percaya diri berkurang pas presentasi, merasa nggak nyaman sepanjang hari, dan kadang malah pengen cepet-cepet pulang cuma karena outfitmu nggak support. Nggak cuma soal rasa, tapi juga impression yang kamu build di kantor."},{"id":"2","en":"Kuncinya: pilih potongan yang nggak terlalu ketat tapi tetap structured. A-line atau wrap style cocok buat sebagian besar body type, dan warna netral bikin kamu bisa mix-match dengan blazer atau cardigan favorit.\\n","id":"Tips pertama: silhouette adalah segalanya. Hindari potongan yang terlalu ketat atau terlalu longgar — A-line dan wrap style adalah dua pilihan paling aman. Warna netral juga memudahkanmu memadupadankan dengan outerwear apa pun."},{"id":"3","en":"Nah, di sinilah midi dress masuk sebagai penyelamat. Panjangnya pas — nggak terlalu pendek, nggak terlalu panjang. Satu-piece langsung keliatan rapi tanpa perlu mikirin kombinasi atas-bawah yang ribet ✨\\n","id":"Solusi simpel yang sering banget dilewatkan: midi dress. Dengan panjang di bawah lutut, kamu dapat kesan elegan tanpa perlu repot-repot padu-padinkan. Satukan saja, pakai shoes yang match, dan kamu siap menghadapi meeting atau coworking session."},{"id":"4","en":"Eh iya, kalau lagi cari midi dress bahan ceruti yang adem dan elegan buat seharian kerja, aku baru nemu Annisa Dress dari RSM Fashion Bandung nih 👗 Bahan cerutinya emang populer banget buat cuaca Indonesia — jatuh, mengalir, dan nggak lengket di kulit. Cocok banget buat kamu yang pengen tampil proper tanpa ngikutin tren musiman.\\n{{PRODUCT_URL}}","id":"Eh iya, kalau lagi cari midi dress bahan ceruti yang adem dan elegan buat seharian kerja, aku baru nemu Annisa Dress dari RSM Fashion Bandung nih 👗 Bahan cerutinya emang populer banget buat cuaca Indonesia — jatuh, mengalir, dan nggak lengket di kulit. Cocok banget buat kamu yang pengen tampil proper tanpa ngikutin tren musiman. Cek di sini ya:\\n{{PRODUCT_URL}}"},{"id":"5","en":"Keunggulan utama bahan ceruti: tekstur permukaannya yang sedikit berkerut alami bikin dress ini nggak mudah kusut meski dipakai seharian. Ini poin penting banget buat kamu yang banyak mobilitas antar ruang meeting atau kantor cabang.\\n","id":"Salah satu keunggulan bahan ceruti yang jarang diketahui: teksturnya yang agak berkerut secara alami berarti dress ini jauh lebih tahan kusut dibanding bahan satin atau polyester biasa. Kalau kamu tipe yang sering geser-geser dari meeting ke meeting, ini keuntungan besar buat daily wear."},{"id":"6","en":"Tips tambahan: pairing midi dress ceruti dengan blazer Oversize atau cardigan panjang bisa menaikkan level penampilanmu jadi smart-casual tanpa kehilangan kesejukan. Tambahan aksesoris minimalis juga cukup buat melengkapi look.\\n","id":"Kalau mau naik level, pairing midi dress ceruti dengan blazer oversize atau cardigan panjang bisa mengubah tampilan dari casual ke smart-casual dalam hitungan detik. Aksesoris minimalis seperti anting hoop kecil atau clutch simple juga cukup untuk membuat outfit terlihat lebih elevated tanpa berlebihan."},{"id":"7","en":"Jadi, besok pagi jangan lupa coba pendekatan satu-piece ini. Dengan midi dress yang tepat, kamu hemat waktu berpakaian dan tetap keliatan profesional. Yuk mulai eksperimen outfit baru dan share hasilnya di kolom komentar 👇\\n","id":"Kesimpulannya, coba pendekatan satu-piece ini keesokan pagimu. Dengan midi dress yang pas, kamu hemat waktu berpakaian tanpa mengorbankan kesan profesional. Yuk mulai eksperimen outfit baru dan share hasilnya di kolom komentar 👇"}]}`;

const sqlLiteral = (s) => `'${s.replace(/'/g, "''")}'`;

// 1. Validasi raw attempt-1 (deterministik, tanpa DB).
if (RAW_ATTEMPT1.length === 0) throw new Error('RAW_ATTEMPT1 kosong');
const parsed = JSON.parse(RAW_ATTEMPT1);
if (!parsed?.main || !Array.isArray(parsed.replies)) {
  throw new Error('bentuk raw attempt-1 tidak sesuai: main/replies');
}
if (parsed.replies.length !== 7) {
  throw new Error(`harus 7 replies, dapat ${parsed.replies.length}`);
}

// 2. Normalisasi placeholder sesuai kebijakan repo (`normalizePlaceholder`):
//    kemunculan >1 → simpan YANG PERTAMA saja (urutan main.id, main.en,
//    lalu replies[id, en] per index), sisanya dihapus. Raw attempt-1 punya
//    2 kemunculan (replies[3] duplikat di `id` DAN `en`).
const rawFields = [parsed.main.id, parsed.main.en, ...parsed.replies.flatMap((r) => [r.id, r.en])];
const rawPhCount = (rawFields.join(' ').match(/\{\{PRODUCT_URL\}\}/g) ?? []).length;
if (rawPhCount < 1) {
  throw new Error('raw attempt-1 tidak punya placeholder — tidak bisa rekonstruksi');
}
let keptPlaceholder = false;
const normalize = (s) =>
  s.replace(/\{\{PRODUCT_URL\}\}/g, () => (keptPlaceholder ? '' : ((keptPlaceholder = true), '{{PRODUCT_URL}}')))
    .replace(/\s{2,}/g, ' ')
    .trim();

const main = {
  id: normalize(parsed.main.id),
  en: normalize(parsed.main.en)
};
const replies = parsed.replies.map((r) => ({
  id: normalize(r.id),
  en: normalize(r.en)
}));
if (!keptPlaceholder) {
  throw new Error('setelah normalisasi placeholder hilang — tidak mungkin untuk draft afiliasi');
}

// 3. Ganti placeholder tersisa dengan URL asli affiliate.
const inject = (s) => s.split('{{PRODUCT_URL}}').join(PRODUCT_URL);
main.id = inject(main.id);
main.en = inject(main.en);
for (const r of replies) {
  r.id = inject(r.id);
  r.en = inject(r.en);
}

// 4. Validasi hasil rekonstruksi: semua field non-label, cukup panjang.
const outFields = [main.id, main.en, ...replies.flatMap((r) => [r.id, r.en])];
for (const [i, f] of outFields.entries()) {
  if (f.trim().length < 20) throw new Error(`field #${i} terlalu pendek: "${f.slice(0, 40)}"`);
  if (LABEL_RE.test(f)) throw new Error(`field #${i} masih label: "${f}"`);
}
if ((outFields.join(' ').match(/https:\/\/s\.shopee\.co\.id\/5fommHcJr9/g) ?? []).length !== 1) {
  throw new Error('URL produk harus muncul tepat 1x setelah rekonstruksi');
}
const urlPostIndex = replies.findIndex((r) => `${r.id} ${r.en}`.includes(PRODUCT_URL));
if (urlPostIndex < 0) throw new Error('reply berisi URL produk tidak ditemukan');

const finalThread = { main, replies };
const json = JSON.stringify(finalThread);

console.log('#'.repeat(78));
console.log('# S7 — SQL PERBAIKAN DRAF 0bcf2f6e (review manusia WAJIB sebelum eksekusi)');
console.log('#'.repeat(78));
console.log(`# draft       : ${DRAFT_ID}`);
console.log(`# session     : ${SESSION_ID}`);
console.log(`# sumber      : llm_call_logs ${ATTEMPT1_AT} (len ${ATTEMPT1_LEN})`);
console.log(`# replies     : 1 main + ${replies.length} replies`);
console.log(`# placeholder : ${rawPhCount} kemunculan di raw → 1 (kebijakan normalizePlaceholder)`);
console.log(`# URL produk  : 1x di replies[${urlPostIndex}] (post_index ${urlPostIndex + 1})`);
console.log('#');
console.log('# PENTING: statement di bawah HANYA mengubah kolom generated_thread.');
console.log('# Status (needs_review), affiliate_injections, llm_meta, draf saudara: tak tersentuh.');
console.log('# Klausa AND main.id = "main" membuatnya no-op bila sudah diperbaiki.');
console.log('#'.repeat(78));
console.log('');
console.log('UPDATE public.content_drafts');
console.log(`SET generated_thread = ${sqlLiteral(json)}::jsonb,`);
console.log('    updated_at = now()');
console.log(`WHERE id = ${sqlLiteral(DRAFT_ID)}`);
console.log(`  AND generated_thread -> 'main' ->> 'id' = 'main';`);
console.log('');
console.log('-- verifikasi (harus 1 baris; main.id BUKAN "main", 7 replies, URL 1x)');
console.log('SELECT id, status,');
console.log("       generated_thread -> 'main' ->> 'id' AS main_id,");
console.log('       jsonb_array_length(generated_thread -> \'replies\') AS reply_count,');
console.log("       length(generated_thread -> 'replies' -> 3 ->> 'id') AS reply4_id_len,");
console.log("       (generated_thread::text LIKE '%5fommHcJr9%') AS has_product_url");
console.log('FROM public.content_drafts');
console.log(`WHERE id = ${sqlLiteral(DRAFT_ID)};`);
console.log('');
console.log('# OQ-1 (plan): replies[0].en masih beraksen Indonesia "Rasanya kamu …"');
console.log('# (artefak duplicate-key LLM). Pilihan O1 = terima, lalu edit manual di UI');
console.log('# /konten/review/0bcf2f6e… tab EN bila diinginkan.');
console.log('');
console.log('# Script tidak mengeksekusi apa pun ke database.');
void readFileSync;
void resolve;
