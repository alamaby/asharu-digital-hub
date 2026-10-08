import { z } from 'zod';

/**
 * Structured-output schemas for future Claude workflows.
 * All parsing is strict: unknown fields stripped, missing evidence
 * surfaced as missing — never invented.
 */

export const businessContextSchema = z.object({
  businessName: z.string().min(2).max(120),
  category: z.string().min(2).max(80),
  targetAudience: z.string().min(3).max(300),
  productsOrServices: z.array(z.string().min(2).max(120)).min(1).max(20),
  brandVoice: z.string().min(3).max(300),
  prohibitedClaims: z.array(z.string().max(200)).max(20).default([])
});

export const contentOpportunitySchema = z.object({
  topic: z.string().min(5).max(200),
  objective: z.string().min(5).max(300),
  audience: z.string().min(3).max(200),
  channel: z.enum(['instagram', 'tiktok', 'facebook', 'whatsapp', 'threads', 'artikel']),
  rationale: z.string().min(5).max(500),
  priority: z.enum(['low', 'medium', 'high'])
});

export const contentOpportunityListSchema = z.object({
  opportunities: z.array(contentOpportunitySchema).min(1).max(10)
});

export const contentBriefSchema = z.object({
  objective: z.string().min(5).max(300),
  keyMessage: z.string().min(5).max(500),
  supportingFacts: z.array(z.string().min(2).max(300)).max(10).default([]),
  requiredEvidence: z.array(z.string().min(2).max(300)).max(10).default([]),
  tone: z.string().min(2).max(120),
  callToAction: z.string().min(2).max(200),
  prohibitedClaims: z.array(z.string().max(200)).max(20).default([])
});

export const draftSchema = z.object({
  channel: z.string().min(2).max(40),
  content: z.string().min(20).max(5000),
  variant: z.string().max(40).optional()
});

const severitySchema = z.enum(['critical', 'major', 'minor']);

export const reviewFindingSchema = z.object({
  severity: severitySchema,
  message: z.string().min(5).max(500),
  evidence: z.string().max(500).optional()
});

export const contentReviewSchema = z.object({
  clarityFindings: z.array(z.string().max(500)).default([]),
  consistencyFindings: z.array(z.string().max(500)).default([]),
  unsupportedClaims: z.array(reviewFindingSchema).default([]),
  missingContext: z.array(z.string().max(500)).default([]),
  duplicationRisk: z.enum(['rendah', 'sedang', 'tinggi']).default('rendah'),
  channelFit: z.string().max(500).default(''),
  recommendations: z.array(z.string().max(500)).default([])
});

export const portfolioTransformSchema = z.object({
  title: z.string().min(5).max(200),
  summary: z.string().min(20).max(2000),
  challenge: z.string().max(1000).optional(),
  approach: z.string().min(10).max(2000),
  outcome: z.string().max(1000).optional(),
  evidence: z.array(z.string().min(2).max(300)).default([]),
  /** Fields the model could not verify — must be filled by humans. */
  missingFields: z.array(z.string().min(2).max(80)).default([])
});

export type BusinessContext = z.output<typeof businessContextSchema>;
export type ContentOpportunityAI = z.output<typeof contentOpportunitySchema>;
export type ContentBriefAI = z.output<typeof contentBriefSchema>;
export type DraftAI = z.output<typeof draftSchema>;
export type ContentReviewAI = z.output<typeof contentReviewSchema>;
export type PortfolioTransformAI = z.output<typeof portfolioTransformSchema>;

/** Fields the portfolio workflow must never invent. */
export const PORTFOLIO_FORBIDDEN_INVENTION = [
  'customer_identity',
  'order_quantity',
  'financial_outcome',
  'performance_improvement',
  'testimonial',
  'location_detail',
  'certification',
  'completion_date'
] as const;

export function parseJsonWithSchema<T>(
  schema: z.ZodType<T>,
  text: string
): { ok: true; data: T } | { ok: false; error: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let raw: unknown = null;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: 'Output bukan JSON valid.' };
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return { ok: false, error: 'Output bukan JSON valid.' };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Skema tidak cocok: ${first?.path.join('.') || 'root'} — ${first?.message}` };
  }
  return { ok: true, data: parsed.data };
}
