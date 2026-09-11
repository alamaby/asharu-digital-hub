import { describe, expect, it } from 'vitest';
import { appendCameraAngle } from './camera-angles';

describe('appendCameraAngle', () => {
  it('menggabung prompt + angle dengan koma', () => {
    expect(appendCameraAngle('a cozy bedroom', 'Eye-level three-quarter view')).toBe(
      'a cozy bedroom, Eye-level three-quarter view'
    );
  });

  it('prompt kosong → angle saja', () => {
    expect(appendCameraAngle('', 'Low-angle full-body shot')).toBe('Low-angle full-body shot');
  });

  it('angle kosong → prompt saja', () => {
    expect(appendCameraAngle('a cozy bedroom', '')).toBe('a cozy bedroom');
  });

  it('overflow → prompt dipotong, angle utuh di akhir', () => {
    const p = appendCameraAngle('x'.repeat(490), 'Eye-level view, natural', 500);
    expect(p.length).toBeLessThanOrEqual(500);
    expect(p.endsWith('Eye-level view, natural')).toBe(true);
  });

  it('angle sudah ada di prompt → tidak digandakan', () => {
    const p = appendCameraAngle('a cozy bedroom, Eye-level view', 'eye-level VIEW');
    expect(p).toBe('a cozy bedroom, Eye-level view');
  });

  it('tanpa maxLen = join murni tanpa potong (untuk worker)', () => {
    const p = appendCameraAngle('x'.repeat(900), 'Eye-level view, natural');
    expect(p).toBe(`${'x'.repeat(900)}, Eye-level view, natural`);
  });

  it('maxLen lebih kecil dari angle → angle dipotong', () => {
    expect(appendCameraAngle('prompt', 'a'.repeat(100), 10)).toBe('a'.repeat(10));
  });
});
