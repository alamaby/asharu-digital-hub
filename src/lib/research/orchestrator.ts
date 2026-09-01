import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canTransition, isTerminal, nextStage, type ResearchStatus } from './state-machine';
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
 * Advance a research session one stage. Idempotent: if the session is in
 * the target stage already (and not the next), the call is a no-op.
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
        // Start with discovery
        await transitionTo(supabase, sessionId, 'discovering');
        return await advanceStage(supabase, sessionId);
      }
      case 'discovering': {
        await runDiscovery(supabase, sessionId, buildDiscoveryInput(session));
        await transitionTo(supabase, sessionId, 'verifying');
        return { status: 'verifying', advanced: true };
      }
      case 'verifying': {
        await runVerification(supabase, sessionId);
        await transitionTo(supabase, sessionId, 'scoring');
        return { status: 'scoring', advanced: true };
      }
      case 'scoring': {
        await runScoring(supabase, sessionId);
        await transitionTo(supabase, sessionId, 'awaiting_selection');
        return { status: 'awaiting_selection', advanced: true };
      }
      case 'awaiting_selection': {
        // Wait for admin to shortlist + click "Lanjut ke Development"
        return { status: 'awaiting_selection', advanced: false };
      }
      case 'developing': {
        await runDevelopment(supabase, sessionId);
        await transitionTo(supabase, sessionId, 'completed');
        return { status: 'completed', advanced: true };
      }
      default:
        return { status: session.status, advanced: false };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: message })
      .eq('id', sessionId);
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: session.status,
      level: 'error',
      message
    });
    return { status: 'failed', advanced: false };
  }
}

async function transitionTo(
  supabase: SupabaseClient,
  sessionId: string,
  to: ResearchStatus
): Promise<void> {
  // RPC advance_research_stage returns the current (pre-update) status and
  // stamps current_stage_started_at atomically.
  await supabase.rpc('advance_research_stage', { p_session_id: sessionId });
  // Then we set the new status (RPC doesn't accept a target status — it
  // just stamps the timestamp; the state transition itself is owned by the
  // orchestrator). The status update is a separate write; the timestamp stamp
  // is sufficient for the cron job's "started > 60s ago" guard.
  const { data: row } = await supabase
    .from('content_research_sessions')
    .select('status')
    .eq('id', sessionId)
    .single();
  const current = (row as { status: ResearchStatus } | null)?.status;
  if (!current) return;
  if (current === to) return;
  if (!canTransition(current, to)) {
    throw new Error(`invalid transition: ${current} -> ${to}`);
  }
  await supabase
    .from('content_research_sessions')
    .update({
      status: to,
      current_stage_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);
  // Silence unused-import warning for `nextStage` — kept for future use.
  void nextStage;
}

/**
 * Bulk advance: pick up to N sessions in active stages and advance one
 * stage each. Returns the number advanced.
 */
export async function advancePendingSessions(
  supabase: SupabaseClient,
  limit: number
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('content_research_sessions')
    .select('id, status, current_stage_started_at')
    .in('status', ['pending', 'discovering', 'verifying', 'scoring', 'developing'])
    .lt('current_stage_started_at', new Date(Date.now() - 60_000).toISOString())
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
