import { describe, expect, it, vi } from 'vitest';

/**
 * `thread.mjs` di-import untuk menguji bagian murni (parseArgs, runThread)
 * tanpa membuka browser. Modul `playwright` di-stub agar import tidak
 * menjalankan launch; main() hanya jalan saat file dieksekusi langsung.
 */
vi.mock('playwright', () => ({ chromium: { launch: vi.fn() } }));

/**
 * Fake page minimal yang meniru API Playwright yang dipakai thread.mjs.
 * `waitForURL` mensimulasikan navigasi pasca-submit: shift dari urlQueue,
 * dan ketika queue kosong set URL ke halaman error (bukan Threads) —
 * mensimulasikan publish yang gagal.
 */
function fakePage({ urls = [] } = {}) {
  const urlQueue = [...urls];
  const current = { value: 'https://www.threads.com/' };
  const locators = [];
  const goto = vi.fn(async (url) => {
    current.value = url;
  });
  const waitForURL = vi.fn(async () => {
    const next = urlQueue.shift();
    if (!next) throw new Error('Timeout 60000ms exceeded');
    current.value = next;
  });
  const locator = vi.fn((selector) => {
    const instance = {
      selector,
      click: vi.fn(async () => {}),
      fill: vi.fn(async () => {}),
      count: vi.fn(async () => 1),
      setInputFiles: vi.fn(async () => {}),
      waitFor: vi.fn(async () => ({})),
      first: vi.fn(() => instance)
    };
    locators.push(instance);
    return instance;
  });
  const getByRole = vi.fn(() => {
    const instance = {
      click: vi.fn(async () => {}),
      fill: vi.fn(async () => {}),
      count: vi.fn(async () => 1),
      first: vi.fn(() => instance)
    };
    locators.push(instance);
    return instance;
  });
  return {
    page: {
      goto,
      waitForURL,
      url: () => current.value,
      waitForLoadState: vi.fn(async () => {}),
      screenshot: vi.fn(async () => {}),
      locator,
      getByRole,
      setInputFiles: vi.fn(async () => {})
    },
    locators,
    urlQueue
  };
}

const SELECTORS = {
  homeUrl: 'https://www.threads.com/',
  postUrlPattern: '^https://www\\.threads\\.com/@[^/]+/post/[^/]+$',
  composeOpen: 'role:button[name=/new post/i]',
  composeText: 'role:textbox',
  imageInput: 'css:input[type=file]',
  locationField: null,
  topicField: null,
  submitButton: 'role:button[name=/^post$/i]',
  replyButton: 'role:button[name=/reply/i]'
};

function makeCtx({ dryRun = false, delays = { action: { minSec: 4, maxSec: 4 }, publish: { minSec: 300, maxSec: 300 } } } = {}) {
  const slept = [];
  return {
    slept,
    report: {
      actionDelaysSec: [],
      publishDelaysSec: [],
      skipped: [],
      mainUrl: null,
      replies: [],
      failedAt: null
    },
    effectiveDelays: delays,
    actionDelay: delays.action,
    dryRun,
    headless: true,
    selectors: SELECTORS,
    rng: () => 0,
    sleepImpl: async (ms) => {
      slept.push(ms);
    }
  };
}

describe('parseArgs (thread.mjs)', () => {
  it('defaults to headless and no dry-run', async () => {
    const { parseArgs } = await import('./thread.mjs');
    const args = parseArgs(['--job', 'a.json']);
    expect(args).toMatchObject({
      jobPath: 'a.json',
      headless: true,
      headed: false,
      dryRun: false,
      fast: false
    });
  });

  it('switches to headed and supports all documented flags', async () => {
    const { parseArgs } = await import('./thread.mjs');
    const args = parseArgs([
      '--job', 'a.json', '--headed', '--dry-run', '--fast', '--yes',
      '--action-delay', '1,2', '--publish-delay', '5,9'
    ]);
    expect(args).toMatchObject({
      headless: false,
      headed: true,
      dryRun: true,
      fast: true,
      yes: true,
      actionDelay: '1,2',
      publishDelay: '5,9'
    });
  });

  it('exits with code 2 on an unknown flag', async () => {
    const { parseArgs } = await import('./thread.mjs');
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseArgs(['--bogus'])).toThrow('__exit__');
    expect(exit).toHaveBeenCalledWith(2);
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('runThread (thread.mjs) — reply chain + delays', () => {
  it('builds a chained thread with production delays and records every URL', async () => {
    const { runThread } = await import('./thread.mjs');
    const { page } = fakePage({
      urls: [
        'https://www.threads.com/@asharu.id/post/MAIN',
        'https://www.threads.com/@asharu.id/post/R1',
        'https://www.threads.com/@asharu.id/post/R2'
      ]
    });
    const ctx = makeCtx();
    const job = { text: 'utama', replies: [{ text: 'r1' }, { text: 'r2' }] };

    await runThread(page, SELECTORS, job, ctx);

    expect(ctx.report.mainUrl).toBe('https://www.threads.com/@asharu.id/post/MAIN');
    expect(ctx.report.replies).toEqual([
      'https://www.threads.com/@asharu.id/post/R1',
      'https://www.threads.com/@asharu.id/post/R2'
    ]);
    // 2 publish delays (300s each, rng 0 → min) + aksi UI (4s each)
    expect(ctx.report.publishDelaysSec).toEqual([300, 300]);
    expect(Math.min(...ctx.slept)).toBe(4000);
    expect(Math.max(...ctx.slept)).toBe(300000);
    // reply 2 navigates ke URL reply 1 (chain)
    expect(page.goto).toHaveBeenNthCalledWith(
      3,
      'https://www.threads.com/@asharu.id/post/R1',
      { waitUntil: 'domcontentloaded' }
    );
  });

  it('records a partial chain and failedAt when a reply throws', async () => {
    const { runThread } = await import('./thread.mjs');
    const { page } = fakePage({
      urls: ['https://www.threads.com/@asharu.id/post/MAIN']
    });
    const ctx = makeCtx();

    const job = { text: 'utama', replies: [{ text: 'r1' }] };
    await expect(runThread(page, SELECTORS, job, ctx)).rejects.toThrow('timeout');
    expect(ctx.report.mainUrl).toBe('https://www.threads.com/@asharu.id/post/MAIN');
    expect(ctx.report.replies).toEqual([]);
    expect(ctx.report.failedAt).toMatchObject({ index: 0 });
  });

  it('stops without publishing when the main post yields no URL', async () => {
    const { runThread } = await import('./thread.mjs');
    const { page } = fakePage({ urls: [] });
    const ctx = makeCtx();
    const job = { text: 'utama', replies: [{ text: 'r1' }] };

    await expect(runThread(page, SELECTORS, job, ctx)).rejects.toThrow('post utama gagal');
    expect(ctx.report.mainUrl).toBeNull();
    expect(ctx.slept.every((ms) => ms === 4000)).toBe(true); // hanya aksi UI, tanpa delay publish
  });

  it('skips publish delays entirely in dry-run mode', async () => {
    const { runThread } = await import('./thread.mjs');
    const { page } = fakePage({ urls: [] });
    const ctx = makeCtx({ dryRun: true });

    await runThread(page, SELECTORS, { text: 'utama', replies: [{ text: 'r1' }] }, ctx);

    expect(ctx.slept.length).toBeGreaterThan(0);
    expect(Math.max(...ctx.slept)).toBe(4000); // hanya aksi UI
  });
});
