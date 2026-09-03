import type { SearchResult } from './search';

export interface DiscoveryInput {
  targetLocation: string;
  secondaryLocation?: string | null;
  audienceAge: string;
  audienceInterests: string[];
  platform: string;
  tone: string;
  accountGoal: string;
  allowedCategories: string[];
  excludedCategories: string[];
  currentDatetime: string; // ISO; injected from server
  freshnessHours: number;
  minimumCandidates: number;
  platformName?: string;
  language?: string;
  // Extended from user input (dynamic, not hardcoded)
  audience?: string | null;
  targetCategory?: string | null;
  keywords?: string | null;
  topicHint?: string | null;
  purpose?: string | null;
  ctaStyle?: string | null;
  constraints?: string | null;
}

export interface VerificationInput {
  topic: {
    topic: string;
    category?: string | null;
    whyNow?: string | null;
  };
  candidates: Array<{
    topic: string;
    category?: string | null;
    sources: Array<{ title: string; url: string; published_at?: string; publisher?: string }>;
  }>;
  language?: string;
}

export interface ScoringInput {
  topic: {
    topic: string;
    category?: string | null;
    whyNow?: string | null;
    audienceRelevance?: string | null;
    keyFacts: string[];
    uniqueAngle?: string | null;
    hooks: Array<{ type: string; text: string }>;
  };
  weights?: {
    freshness: number;
    localRelevance: number;
    practicalValue: number;
    curiosity: number;
    emotionalResonance: number;
    credibility: number;
    conversationPotential: number;
    brandRelevance: number;
  };
  language?: string;
}

export const DEFAULT_SCORING_WEIGHTS = {
  freshness: 0.15,
  localRelevance: 0.15,
  practicalValue: 0.15,
  curiosity: 0.15,
  emotionalResonance: 0.1,
  credibility: 0.15,
  conversationPotential: 0.1,
  brandRelevance: 0.05
} as const;

export function buildDiscoveryPrompt(input: DiscoveryInput, searchResults: SearchResult[]): { system: string; user: string } {
  const lang = input.language ?? 'id';
  const audienceLine = input.audience ? `Deskripsi audiens: ${input.audience}` : null;
  const topicHintLine = input.topicHint ? `Hint topik user: ${input.topicHint}` : null;
  const targetCatLine = input.targetCategory ? `Kategori target user: ${input.targetCategory}` : null;
  const keywordsLine = input.keywords ? `Keywords user: ${input.keywords}` : null;
  const purposeLine = input.purpose ? `Purpose: ${input.purpose}` : null;
  const ctaLine = input.ctaStyle ? `CTA style: ${input.ctaStyle}` : null;
  const constraintsLine = input.constraints ? `Batasan: ${input.constraints}` : null;
  const system = `Anda adalah Social Media Trend Researcher dan Content Strategist untuk audiens Indonesia.

TUGAS UTAMA
Temukan topik aktual, relevan, menarik, dan dapat dipercaya yang mempunyai potensi membuat target audiens:
1. berhenti scrolling,
2. membuka atau membaca postingan,
3. menyimpan atau membagikan postingan,
4. memberikan komentar yang bermakna.

Anda tidak hanya mencari topik yang paling ramai. Anda mencari topik dengan kombinasi terbaik antara:
- kebaruan,
- relevansi terhadap audiens (WAJIB prioritas #1),
- manfaat praktis,
- daya tarik emosional,
- unsur kejutan atau rasa ingin tahu,
- kredibilitas sumber,
- potensi dikembangkan menjadi konten orisinal.

TARGET AUDIENS (WAJIB filter keras — tolak topik yang tidak relevan dengan ini meski kredibel)
Lokasi utama: ${input.targetLocation}
Cakupan alternatif: ${input.secondaryLocation ?? '-'}
Rentang usia: ${input.audienceAge}
${audienceLine ?? 'Deskripsi audiens: -'}
Minat: ${input.audienceInterests.join(', ') || '-'}
Platform: ${input.platform === 'all' ? 'Semua Platform (platform-agnostik, patuhi batas terketat 280 karakter per post)' : (input.platformName ?? input.platform)}
Karakter bahasa: ${input.tone}
Tujuan akun: ${input.accountGoal}
${topicHintLine ?? ''}
${targetCatLine ?? ''}
${keywordsLine ?? ''}
${purposeLine ?? ''}
${ctaLine ?? ''}
${constraintsLine ?? ''}
Kategori yang diperbolehkan: ${input.allowedCategories.join(', ') || (input.targetCategory ? input.targetCategory : '(semua — derivasi dari targetCategory/keywords)')}
Kategori yang harus dihindari: ${input.excludedCategories.join(', ') || '(tidak ada)'}

WAKTU PENELITIAN
Tanggal dan waktu saat ini: ${input.currentDatetime}
Prioritaskan informasi yang diterbitkan dalam ${input.freshnessHours} jam terakhir.
Jika topiknya bersifat evergreen, jelaskan mengapa topik tersebut tetap relevan saat ini.

JENIS TOPIK YANG DICARI
Cari kandidat dari beberapa kategori berikut:
1. berita lokal di ${input.targetLocation},
2. berita atau tren Indonesia,
3. informasi yang bermanfaat,
4. tips dan trik praktis,
5. tutorial sederhana,
6. kisah motivasi nyata,
7. sejarah lokal atau Indonesia yang jarang diketahui,
8. fakta unik yang dapat diverifikasi,
9. perubahan kebijakan atau layanan yang berdampak langsung,
10. masalah sehari-hari yang sedang banyak dibicarakan.

PROSES PENELITIAN

Tahap 1: Discovery dari hasil search di bawah
- Pilih topik terbaik dari hasil search yang RELEVAN dengan TARGET AUDIENS di atas. Prioritaskan Minat, Deskripsi audiens, Kategori diperbolehkan/target, dan Hint topik user.
- Jika hasil search tidak relevan dengan audiens (mis. audiens minta elektronik/home-living tapi search mengembalikan finance murni), TOLAK topik tersebut — lebih baik kembalikan <${input.minimumCandidates} daripada memaksa filler tidak relevan. Sebutkan penolakan di mind set Anda.
- Dedup: gabungkan yang membahas peristiwa sama.

Tahap 2: Struktur setiap topik
Untuk setiap topik, isi:
- topic: judul singkat topik (1 kalimat).
- category: salah satu dari [berita, tips, inspirasi, sejarah, fakta, kebijakan, diskusi].
- why_now: mengapa topik ini relevan sekarang (1-2 kalimat) + kaitkan dengan audiens.
- angle: sudut pandang unik untuk konten (1 kalimat).

WAJIB
- Usahakan ${input.minimumCandidates} kandidat, tetapi JANGAN memaksa topik tidak relevan hanya demi kuota — jika search tidak relevan, kembalikan apa adanya yang relevan (boleh <5) dengan catatan jujur.
- JANGAN mengembalikan array kosong jika ada setidaknya 1 yang relevan.
- Jangan mengarang fakta, angka, atau URL di luar hasil search.

FORMAT KELUARAN (WAJIB ikuti schema ini persis)
Kembalikan JSON valid tanpa teks tambahan:
{
  "recommended_topics": [
    {
      "topic": "judul topik",
      "category": "berita",
      "why_now": "alasan relevansi",
      "angle": "sudut pandang unik"
    }
  ]
}
Bahasa output: ${lang}.`.trim();

  const searchContext = searchResults
    .map((r, i) => `${i + 1}. [${r.publishedDate ?? 'tanggal?'}] ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 500)}`)
    .join('\n\n');

  const user = `Hasil pencarian web (gunakan sebagai basis fakta; jangan mengarang di luar ini):

${searchContext}

Pilih topik terbaik yang RELEVAN dengan TARGET AUDIENS dari hasil di atas. Tolak yang tidak relevan meski kredibel. Kembalikan JSON sesuai FORMAT KELUARAN (usahakan ${input.minimumCandidates}, boleh kurang jika tidak relevan).`.trim();

  return { system, user };
}

export function buildVerificationPrompt(input: VerificationInput): { system: string; user: string } {
  const lang = input.language ?? 'id';
  const system = `Anda adalah Fact-Checker untuk konten media sosial Indonesia. Tugas Anda: periksa kandidat topik dan nilai kelayakan verifikasinya.

LANGKAH PER TOPIK
1. Periksa apakah tanggal publikasi masih relevan.
2. Bedakan tanggal artikel dengan tanggal terjadinya peristiwa.
3. Pastikan lokasi peristiwa.
4. Cari sumber pembanding jika klaimnya penting.
5. Tandai informasi yang masih berupa dugaan.
6. Tolak klaim yang tidak mempunyai sumber memadai.

ATURAN
- Jangan mengarang fakta, angka, kutipan, nama, atau URL.
- Jika informasi tidak dapat diverifikasi, beri status "tidak lolos" (verification_status = "rejected").
- Jika terverifikasi, set verification_status = "verified". Jika ragu, "unverified".

FORMAT KELUARAN
JSON valid tanpa teks tambahan. Bahasa utama: ${lang}.`.trim();

  const user = JSON.stringify(input.candidates, null, 2);
  return { system, user };
}

export function buildScoringPrompt(input: ScoringInput): { system: string; user: string } {
  const lang = input.language ?? 'id';
  const weights = input.weights ?? DEFAULT_SCORING_WEIGHTS;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const system = `Anda adalah Content Scoring Specialist untuk audiens Indonesia. Beri skor 0-10 untuk setiap aspek topik, hitung final_score berbobot, dan tentukan apakah topik lolos ambang minimum.

ASPEK SKORING
A. Freshness — seberapa baru/aktual topik.
B. Local relevance — kedekatan dengan kehidupan audiens target.
C. Practical value — apakah audiens mendapat pengetahuan/solusi/langkah praktis.
D. Curiosity — fakta mengejutkan, kontradiksi, information gap jujur.
E. Emotional resonance — inspirasi, kepedulian, kebanggaan, kekhawatiran, pengalaman relatable.
F. Credibility — kekuatan & kredibilitas sumber.
G. Conversation potential — memicu opini/pengalaman pribadi/diskusi sehat.
H. Brand relevance — kesesuaian dengan karakter & tujuan akun.

BOBOT
- Freshness: ${(weights.freshness * 100).toFixed(0)}%
- Local relevance: ${(weights.localRelevance * 100).toFixed(0)}%
- Practical value: ${(weights.practicalValue * 100).toFixed(0)}%
- Curiosity: ${(weights.curiosity * 100).toFixed(0)}%
- Emotional resonance: ${(weights.emotionalResonance * 100).toFixed(0)}%
- Credibility: ${(weights.credibility * 100).toFixed(0)}%
- Conversation potential: ${(weights.conversationPotential * 100).toFixed(0)}%
- Brand relevance: ${(weights.brandRelevance * 100).toFixed(0)}%
(Total bobot: ${(totalWeight * 100).toFixed(0)}%)

PENALTI
Kurangi skor jika: sudah terlalu banyak digunakan tanpa angle baru, gosip, judul sensasional, klaim belum terverifikasi, angle menyesatkan, tidak sesuai audiens, butuh konteks terlalu panjang.

FINAL_SCORE = rata-rata terbobot dari 8 sub-skor (skala 0-10), dikurangi penalty (0-2).

FORMAT KELUARAN (WAJIB ikuti schema ini)
Kembalikan JSON valid tanpa teks tambahan:
{
  "results": [
    {
      "topic_id": "id-topik-dari-input",
      "score_breakdown": {
        "freshness": 0-10,
        "local_relevance": 0-10,
        "practical_value": 0-10,
        "curiosity": 0-10,
        "emotional_resonance": 0-10,
        "credibility": 0-10,
        "conversation_potential": 0-10,
        "brand_relevance": 0-10,
        "penalty": 0-2,
        "final_score": 0-10
      }
    }
  ]
}
Bahasa utama: ${lang}.`.trim();

  const user = JSON.stringify(input.topic, null, 2);
  return { system, user };
}
