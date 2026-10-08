/**
 * Typed domain model for Asharu Digital Hub MVP.
 * Persistence is future work — see docs/architecture.md.
 * No DB table is required for the public page; fixtures in
 * `./fixtures.ts` are clearly labeled synthetic demo data.
 */

export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
export type ReviewStatus = 'unreviewed' | 'needs_revision' | 'passed';
export type PublicationMode = 'export' | 'schedule_prep';
export type PublicationStatus = 'ready' | 'exported' | 'scheduled_prep';
export type PortfolioVisibility = 'private' | 'public';
export type PortfolioStatus = 'draft' | 'ready' | 'published';

export interface BusinessProfile {
  id: string;
  businessName: string;
  category: string;
  description: string;
  targetAudience: string;
  productsOrServices: string[];
  serviceArea: string;
  brandVoice: string;
  preferredLanguage: 'id' | 'en' | 'both';
  preferredChannels: string[];
  prohibitedClaims: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BusinessActivity {
  id: string;
  businessProfileId: string;
  title: string;
  description: string;
  activityDate: string;
  type: string;
  evidenceNotes: string;
  customerProblem?: string;
  workPerformed: string;
  outcome?: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContentOpportunity {
  id: string;
  businessProfileId: string;
  sourceActivityId?: string;
  topic: string;
  objective: string;
  audience: string;
  channel: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high';
  status: 'proposed' | 'selected' | 'rejected';
}

export interface ContentBrief {
  id: string;
  opportunityId: string;
  objective: string;
  keyMessage: string;
  supportingFacts: string[];
  requiredEvidence: string[];
  tone: string;
  callToAction: string;
  prohibitedClaims: string[];
}

export interface ContentDraft {
  id: string;
  briefId: string;
  channel: string;
  content: string;
  reviewStatus: ReviewStatus;
  approvalStatus: ApprovalStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ReviewSeverity = 'critical' | 'major' | 'minor';

export interface ReviewFinding {
  severity: ReviewSeverity;
  message: string;
  evidence?: string;
}

export interface ContentReview {
  id: string;
  draftId: string;
  clarityFindings: string[];
  consistencyFindings: string[];
  unsupportedClaims: ReviewFinding[];
  missingContext: string[];
  duplicationRisk: string;
  channelFit: string;
  recommendations: string[];
  reviewerType: 'ai' | 'human';
  createdAt: string;
}

export interface PublicationItem {
  id: string;
  draftId: string;
  destination: string;
  scheduledAt?: string;
  status: PublicationStatus;
  /** Never 'direct' until a verified integration exists. */
  publicationMode: PublicationMode;
  externalReference?: string;
  approvedBy: string;
  approvedAt: string;
}

export interface PortfolioEntry {
  id: string;
  businessProfileId: string;
  sourceActivityId: string;
  sourceDraftIds: string[];
  title: string;
  summary: string;
  challenge?: string;
  approach: string;
  outcome?: string;
  evidence: string[];
  /** Fields the model must NOT invent — surfaced as missing instead. */
  missingFields: string[];
  visibility: PortfolioVisibility;
  status: PortfolioStatus;
}
