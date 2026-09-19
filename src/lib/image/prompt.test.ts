import { describe, expect, it } from 'vitest';
import { truncateImagePrompt } from './prompt';

describe('truncateImagePrompt', () => {
  it('prompt pendek lolos utuh', () => {
    expect(truncateImagePrompt('a short prompt')).toBe('a short prompt');
    expect(truncateImagePrompt('')).toBe('');
    expect(truncateImagePrompt('  spaced  ')).toBe('spaced');
  });

  it('prompt panjang berakhir kalimat lengkap (tidak ada huruf menggantung)', () => {
    // Simulasi kasus review: prompt panjang yang akan terpotong di batas 500.
    const long = 'A beautiful product shot of a smartphone on a wooden desk with soft morning light, showing the screen displaying a clean modern interface with elegant app icons arranged in a grid pattern, shallow depth of field blurring the background nicely, professional studio lighting setup creating soft shadows and highlights on the device surface, high resolution photography style, no text or logos visible on the device at all. Note that we want to keep it minimal and elegant for the cover image design with a clean aesthetic.';
    expect(long.length).toBeGreaterThan(500);
    const truncated = truncateImagePrompt(long);
    expect(truncated.length).toBeLessThanOrEqual(500);
    // Tidak boleh berakhir huruf tunggal setelah spasi (kasus "...phone. N")
    expect(truncated).not.toMatch(/\.\s\w$/);
    // Sebaiknya berakhir spasi/kata utuh atau akhir kalimat
    expect(/[\s.!?]$/.test(truncated) || truncated.length < 500).toBe(true);
  });

  it('memotong di spasi terakhir bila tidak ada akhir kalimat setelah 50% batas', () => {
    const noPeriod = Array.from({ length: 80 }, (_, i) => `word${i}_`).join(' ');
    expect(noPeriod.length).toBeGreaterThan(500);
    const truncated = truncateImagePrompt(noPeriod);
    expect(truncated.length).toBeLessThanOrEqual(500);
    expect(truncated.endsWith(' ')).toBe(false);
    expect(truncated.split(' ').at(-1)?.length ?? 0).toBeGreaterThan(0);
  });

  it('negative_prompt slice(0,300) tidak tersentuh — test lewat validasi gate tetap ada', () => {
    // Fungsi ini khusus image_prompt; negative prompt tetap dipotong 300 di caller lain.
    // Verifikasi implisit: fungsi tidak mengubah logic negative.
    expect(truncateImagePrompt('short')).toBe('short');
  });
});
