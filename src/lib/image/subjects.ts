/** Template subjek visualisasi: scene dari postingan + subject configurable. */

export interface SubjectTemplate {
  slug: string;
  display_name: string;
  subject_en: string;
}

export interface SceneParts {
  activity: string;
  setting: string;
  objects: string[];
}

export const SCENE_MAX_TOKENS = 150;

/** Prompt micro-ekstraksi scene (EN, JSON ONLY) untuk suggestImagePrompt. */
export function buildSceneMessages(postId: string, postEn: string): { system: string; user: string } {
  const system = [
    'You extract a visual scene for an illustration from a social media post.',
    'Rules:',
    '- Output JSON ONLY: {"activity": "...", "setting": "...", "objects": ["...", "..."]}.',
    '- activity: what the subject woman is doing, in English, max 15 words (e.g. "wiping dust off an open wardrobe").',
    '- setting: where it happens, in English, max 15 words (e.g. "a cozy sunlit bedroom").',
    '- objects: up to 5 key visual nouns from the post, in English.',
    '- If the post has no clear activity, use "posing naturally". If no clear setting, use "a clean neutral indoor setting".',
    '- No other text, no markdown.'
  ].join('\n');
  const user = [`Post (ID): ${postId.slice(0, 600)}`, `Post (EN): ${postEn.slice(0, 600)}`].join('\n');
  return { system, user };
}

/** Parse toleran output JSON ekstraksi scene (strip fence, ambil objek terluar). */
export function parseSceneJson(text: string): SceneParts {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('subject_scene: no JSON object found');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    activity?: unknown;
    setting?: unknown;
    objects?: unknown;
  };
  const activity = typeof parsed.activity === 'string' ? parsed.activity.trim() : '';
  const setting = typeof parsed.setting === 'string' ? parsed.setting.trim() : '';
  const objects = Array.isArray(parsed.objects)
    ? parsed.objects.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 5)
    : [];
  if (!activity && !setting && objects.length === 0) {
    throw new Error('subject_scene: empty scene');
  }
  return { activity, setting, objects };
}

/**
 * Gabung subject template + scene jadi prompt awal (deterministik, ≤maxLen).
 * Kosong → fallback generik agar selalu ada prompt valid.
 */
export function composeSubjectPrompt(subjectEn: string, scene: SceneParts, maxLen = 500): string {
  const subject = subjectEn.trim();
  const activity = scene.activity || 'posing naturally';
  const setting = scene.setting || 'a clean neutral indoor setting';
  const objs = scene.objects.length > 0 ? `, featuring ${scene.objects.join(', ')}` : '';
  return `${subject}, ${activity} in ${setting}${objs}`.slice(0, maxLen);
}
