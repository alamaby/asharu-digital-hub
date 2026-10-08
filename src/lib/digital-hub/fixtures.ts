import type {
  BusinessActivity,
  BusinessProfile,
  ContentBrief,
  ContentDraft,
  ContentOpportunity,
  ContentReview,
  PortfolioEntry,
  PublicationItem
} from './types';

/**
 * Synthetic demo fixtures — clearly labeled, never presented as real
 * customer data. Used for UI illustration and unit tests only.
 */
export const DEMO_IS_SYNTHETIC = true;

export const demoBusinessProfile: BusinessProfile = {
  id: 'demo-profile-catering',
  businessName: 'Dapur Contoh (ilustrasi)',
  category: 'kuliner',
  description: 'Usaha katering rumahan — contoh ilustrasi, bukan pelanggan nyata.',
  targetAudience: 'Keluarga dan kantor di Bandung Timur',
  productsOrServices: ['Paket katering acara', 'Nasi kotak harian'],
  serviceArea: 'Bandung Timur',
  brandVoice: 'Ramah, jelas, tanpa klaim berlebihan',
  preferredLanguage: 'id',
  preferredChannels: ['instagram', 'whatsapp', 'tiktok'],
  prohibitedClaims: ['terbaik se-Indonesia', 'dijamin laris'],
  createdAt: '2026-10-01T00:00:00+07:00',
  updatedAt: '2026-10-01T00:00:00+07:00'
};

export const demoActivity: BusinessActivity = {
  id: 'demo-activity-300-tamu',
  businessProfileId: demoBusinessProfile.id,
  title: 'Pesanan katering 300 tamu (ilustrasi)',
  description: 'Dokumentasi serah-terima pesanan acara keluarga.',
  activityDate: '2026-09-20',
  type: 'penyelesaian_pesanan',
  evidenceNotes: 'Foto serah terima, daftar menu, catatan waktu antar',
  customerProblem: 'Butuh konsumsi tepat waktu untuk 300 tamu',
  workPerformed: 'Masak, kemas, antar, dan tata prasmanan',
  outcome: 'Serah terima sesuai jadwal (klaim menunggu bukti)',
  approvalStatus: 'approved',
  createdAt: '2026-09-20T10:00:00+07:00',
  updatedAt: '2026-09-21T10:00:00+07:00'
};

export const demoOpportunity: ContentOpportunity = {
  id: 'demo-opp-1',
  businessProfileId: demoBusinessProfile.id,
  sourceActivityId: demoActivity.id,
  topic: 'Dokumentasi pesanan 300 tamu',
  objective: 'Membangun kepercayaan calon pembeli',
  audience: 'Calon pelanggan acara keluarga/kantor',
  channel: 'instagram',
  rationale: 'Bukti pekerjaan nyata lebih meyakinkan daripada janji.',
  priority: 'high',
  status: 'proposed'
};

export const demoBrief: ContentBrief = {
  id: 'demo-brief-1',
  opportunityId: demoOpportunity.id,
  objective: 'Menunjukkan kemampuan menangani pesanan besar',
  keyMessage: 'Pesanan 300 tamu disiapkan dan diserahterimakan sesuai jadwal.',
  supportingFacts: ['Menu A/B/C', 'Waktu antar tercatat'],
  requiredEvidence: ['Foto serah terima', 'Daftar menu'],
  tone: 'ramah dan jelas',
  callToAction: 'Tanya ketersediaan tanggal via WhatsApp',
  prohibitedClaims: ['terbaik', 'termurah se-kota']
};

export const demoDraft: ContentDraft = {
  id: 'demo-draft-1',
  briefId: demoBrief.id,
  channel: 'instagram',
  content: 'Kemarin kami menyiapkan pesanan untuk 300 tamu. Menu, jadwal antar, dan penataan kami catat agar rapi. (Draf ilustrasi — perlu bukti foto sebelum terbit.)',
  reviewStatus: 'needs_revision',
  approvalStatus: 'pending_review',
  version: 1,
  createdAt: '2026-09-21T10:00:00+07:00',
  updatedAt: '2026-09-21T10:00:00+07:00'
};

export const demoReview: ContentReview = {
  id: 'demo-review-1',
  draftId: demoDraft.id,
  clarityFindings: ['Tambahkan tanggal dan lokasi umum (tanpa alamat detail).'],
  consistencyFindings: [],
  unsupportedClaims: [
    { severity: 'major', message: '“sesuai jadwal” butuh bukti waktu serah terima.' }
  ],
  missingContext: ['Jumlah menu dan waktu antar belum disebut.'],
  duplicationRisk: 'rendah',
  channelFit: 'Cocok untuk Instagram dengan foto + caption ringkas.',
  recommendations: ['Lampirkan foto serah terima sebelum menyetujui.'],
  reviewerType: 'ai',
  createdAt: '2026-09-21T11:00:00+07:00'
};

export const demoPublication: PublicationItem = {
  id: 'demo-pub-1',
  draftId: demoDraft.id,
  destination: 'instagram',
  status: 'ready',
  publicationMode: 'export',
  approvedBy: 'pemilik usaha (ilustrasi)',
  approvedAt: '2026-09-21T12:00:00+07:00'
};

export const demoPortfolio: PortfolioEntry = {
  id: 'demo-portfolio-1',
  businessProfileId: demoBusinessProfile.id,
  sourceActivityId: demoActivity.id,
  sourceDraftIds: [demoDraft.id],
  title: 'Katering acara 300 tamu (ilustrasi)',
  summary: 'Ringkasan pekerjaan + bukti + hasil yang sudah disetujui.',
  challenge: 'Konsumsi tepat waktu untuk 300 tamu.',
  approach: 'Persiapan terjadwal, pengemasan rapi, serah terima tercatat.',
  outcome: undefined,
  evidence: ['Foto serah terima (perlu dilampirkan)', 'Daftar menu'],
  missingFields: ['outcome_terukur', 'identitas_pelanggan'],
  visibility: 'public',
  status: 'ready'
};
