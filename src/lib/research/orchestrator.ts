import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canTransition, isTerminal, type ResearchStatus } from './state-machine';
import { runDiscovery } from './discovery';
import { runVerification } from './verification';
import { runScoring } from './scoring';
import { runDevelopment } from './development';

interface ResearchSessionRow {
  id: string;
  status: ResearchStatus;
  target_location: string | null;
  secondary_location: string | null;
  audience_age: string | null;
  audience_interests: string[] | null;
  platform_slug: string | null;
  tone: string | null;
  account_goal: string | null;
  allowed_categories: string[] | null;
  excluded_categories: string[] | null;
  freshness_hours: number;
  minimum_candidates: number;
  minimum_score: number | null;
  required_winners: number;
  maximum_iterations: number;
}

function buildDiscoveryInput(row: ResearchSessionRow) {
  return {
    targetLocation: row.target_location ?? 'Indonesia',
    secondaryLocation: row.secondary_location,
    audienceAge: row.audience_age ?? 'umum',
    audienceInterests: row.audience_interests ?? [],
    platform: row.platform_slug ?? 'threads',
    tone: row.tone ?? 'casual',
    accountGoal: row.account_goal ?? 'membagikan informasi bermanfaat',
    allowedCategories: row.allowed_categories ?? [],
    excludedCategories: row.excluded_categories ?? [],
    currentDatetime: new Date().toISOString(),
    freshnessHours: row.freshness_hours,
    minimumCandidates: row.minimum_candidates
  };
}

/**
 * Atomically transition a session's status. Returns true if the row was
 * updated (caller owned the prior status), false otherwise. This is the
 * only place status changes happen — the RPC `advance_research_stage` is
 * no longer used; this UPDATE replaces both the timestamp stamp and the
 * status change in a single statement with row-level locking via WHERE.
 */
async function atomicTransition(
  supabase: SupabaseClient,
  sessionId: string,
  from: ResearchStatus,
  to: ResearchStatus
): Promise<boolean> {
  if (from === to) return true;
  if (!canTransition(from, to)) return false;
  const { data } = await supabase
    .from('content_research_sessions')
    .update({
      status: to,
      current_stage_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('status', from)
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

/**
 * Advance a research session one stage. Idempotent: if the row's status is
 * not in the expected from-state (e.g. another worker already advanced it),
 * the stage is skipped without error.
 */
export async function advanceStage(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ status: ResearchStatus; advanced: boolean }> {
  const { data: row, error } = await supabase
    .from('content_research_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !row) {
    return { status: 'failed', advanced: false };
  }
  const session = row as ResearchSessionRow;
  if (isTerminal(session.status)) {
    return { status: session.status, advanced: false };
  }

  try {
    switch (session.status) {
      case 'pending': {
        // Inline: don't recurse (would lose error context + risk stack overflow).
        const moved = await atomicTransition(supabase, sessionId, 'pending', 'discovering');
        if (!moved) return { status: 'discovering', advanced: false };
        return await runStage(supabase, sessionId, 'discovering', session);
      }
      case 'discovering': {
        const result = await runDiscovery(supabase, sessionId, buildDiscoveryInput(session));
        if (result.topics.length === 0) {
          throw new Error(
            'Discovery menghasilkan 0 topik. LLM mungkin return JSON kosong atau tidak mengikuti schema. Coba lagi setelah cek prompt/model.'
          );
        }
        await atomicTransition(supabase, sessionId, 'discovering', 'verifying');
        return { status: 'verifying', advanced: true };
      }
      case 'verifying': {
        await runVerification(supabase, sessionId);
        await atomicTransition(supabase, sessionId, 'verifying', 'scoring');
        return { status: 'scoring', advanced: true };
      }
      case 'scoring': {
        await runScoring(supabase, sessionId);
        await atomicTransition(supabase, sessionId, 'scoring', 'awaiting_selection');
        return { status: 'awaiting_selection', advanced: true };
      }
      case 'awaiting_selection': {
        // Wait for admin to shortlist + click "Lanjut ke Development".
        return { status: 'awaiting_selection', advanced: false };
      }
      case 'developing': {
        await runDevelopment(supabase, sessionId);
        // runDevelopment may have set status='failed' when no shortlisted topics;
        // in that case don't claim completed — re-read current status.
        const { data: afterDev } = await supabase
          .from('content_research_sessions')
          .select('status')
          .eq('id', sessionId)
          .single();
        const cur = (afterDev as { status: ResearchStatus } | null)?.status;
        if (cur === 'failed') return { status: 'failed', advanced: false };
        const moved = await atomicTransition(supabase, sessionId, 'developing', 'completed');
        if (!moved) {
          // If transition didn't apply, status already changed (e.g. to failed) — surface it.
          const { data: recheck } = await supabase
            .from('content_research_sessions')
            .select('status')
            .eq('id', sessionId)
            .single();
          return { status: (recheck as { status: ResearchStatus } | null)?.status ?? 'failed', advanced: false };
        }
        return { status: 'completed', advanced: true };
      }
      default:
        return { status: session.status, advanced: false };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Best-effort failure flag. The status predicate is also bounded so
    // we don't accidentally mark a non-active session as failed.
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: message })
      .eq('id', sessionId)
      .in('status', ['pending', 'discovering', 'verifying', 'scoring', 'developing']);
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: session.status,
      level: 'error',
      message
    });
    return { status: 'failed', advanced: false };
  }
}

/**
 * After atomicTransition to a new "in-flight" status, run the work for that
 * stage. On exception, the outer catch in advanceStage flips to 'failed'.
 */
async function runStage(
  supabase: SupabaseClient,
  sessionId: string,
  stage: ResearchStatus,
  session: ResearchSessionRow
): Promise<{ status: ResearchStatus; advanced: boolean }> {
  if (stage === 'discovering') {
    const result = await runDiscovery(supabase, sessionId, buildDiscoveryInput(session));
    if (result.topics.length === 0) {
      throw new Error(
        'Discovery menghasilkan 0 topik. LLM mungkin return JSON kosong atau tidak mengikuti schema. Cek prompt/model/tavily.'
      );
    }
    await atomicTransition(supabase, sessionId, 'discovering', 'verifying');
    return { status: 'verifying', advanced: true };
  }
  return { status: stage, advanced: false };
}

/**
 * Bulk advance: pick up to N sessions in active stages and advance one
 * stage each. The cron guard window (default 5 min) protects against
 * double-firing for long stages like discovery.
 */
export async function advancePendingSessions(
  supabase: SupabaseClient,
  limit: number,
  guardMs: number = 5 * 60 * 1000
): Promise<number> {
  const cutoff = new Date(Date.now() - guardMs).toISOString();
  const { data: rows, error } = await supabase
    .from('content_research_sessions')
    .select('id, status, current_stage_started_at')
    .in('status', ['pending', 'discovering', 'verifying', 'scoring', 'developing'])
    .lt('current_stage_started_at', cutoff)
    .order('current_stage_started_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`advancePendingSessions: ${error.message}`);
  }
  if (!rows || rows.length === 0) return 0;
  let advanced = 0;
  for (const r of rows as { id: string }[]) {
    const result = await advanceStage(supabase, r.id);
    if (result.advanced) advanced++;
  }
  return advanced;
}
