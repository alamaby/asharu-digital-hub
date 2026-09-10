import { describe, expect, it } from 'vitest';
import { buildSceneMessages, composeSubjectPrompt, parseSceneJson } from './subjects';

const SUBJECT = 'A beautiful young woman with warm yellow langsat skin and long hair, wearing fitted, highly fashionable clothing';

describe('parseSceneJson', () => {
  it('parses clean and fenced JSON', () => {
    const raw = '{"activity": "wiping dust", "setting": "a bedroom", "objects": ["cloth", "wardrobe"]}';
    expect(parseSceneJson(raw)).toEqual({ activity: 'wiping dust', setting: 'a bedroom', objects: ['cloth', 'wardrobe'] });
    expect(parseSceneJson('```json\n' + raw + '\n```').activity).toBe('wiping dust');
  });

  it('extracts outer object and caps objects at 5', () => {
    const raw = 'Sure! {"activity": "a", "setting": "s", "objects": ["1","2","3","4","5","6"]} thanks';
    expect(parseSceneJson(raw).objects).toHaveLength(5);
  });

  it('throws on missing or empty scene', () => {
    expect(() => parseSceneJson('no json here')).toThrow(/no JSON object/);
    expect(() => parseSceneJson('{"activity": "", "setting": "", "objects": []}')).toThrow(/empty scene/);
  });
});

describe('composeSubjectPrompt', () => {
  it('joins subject + activity + setting + objects within limit', () => {
    const p = composeSubjectPrompt(SUBJECT, { activity: 'wiping dust off an open wardrobe', setting: 'a cozy sunlit bedroom', objects: ['microfiber cloth', 'sunlight'] });
    expect(p.startsWith(SUBJECT)).toBe(true);
    expect(p).toContain('wiping dust off an open wardrobe in a cozy sunlit bedroom');
    expect(p).toContain('featuring microfiber cloth, sunlight');
    expect(p.length).toBeLessThanOrEqual(500);
  });

  it('falls back when scene parts are empty', () => {
    const p = composeSubjectPrompt(SUBJECT, { activity: '', setting: '', objects: [] });
    expect(p).toContain('posing naturally');
    expect(p).toContain('clean neutral indoor setting');
  });
});

describe('buildSceneMessages', () => {
  it('caps post text and demands JSON only', () => {
    const { system, user } = buildSceneMessages('id'.repeat(1000), 'en'.repeat(1000));
    expect(system).toContain('JSON ONLY');
    expect(user.length).toBeLessThan(1400);
  });
});
