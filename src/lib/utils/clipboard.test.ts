import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

const originalDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
);

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalDescriptor);
  } else {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
  // execCommand tak ada di jsdom 26 — hapus stub own-prop bila dipasang test.
  delete (document as unknown as Record<string, unknown>).execCommand;
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true
  });
}

describe('copyToClipboard', () => {
  it('memakai Clipboard API bila tersedia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    await copyToClipboard('https://asharu.id/id/artikel/x?utm_source=copy');

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      'https://asharu.id/id/artikel/x?utm_source=copy'
    );
  });

  it('fallback execCommand saat Clipboard API gagal + bersihkan textarea', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    // jsdom 26 tak lagi menyediakan document.execCommand — pasang stub own-prop.
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true
    });

    await copyToClipboard('teks-fallback');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('melempar bila Clipboard API gagal dan execCommand tak tersedia', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    // Pastikan tak ada execCommand (kondisi default jsdom 26).
    delete (document as unknown as Record<string, unknown>).execCommand;

    await expect(copyToClipboard('x')).rejects.toThrow('denied');
    expect(document.body.querySelector('textarea')).toBeNull();
  });
});
