import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { revalidateAffiliateCatalog } from '@/lib/affiliate/revalidate';

/**
 * Purge cache ISR katalog afiliasi (beranda + `/produk`) on demand.
 *
 * Dipakai oleh workflow scrape (GitHub Actions) setelah sync DB sukses: baris
 * `affiliate_products` ditulis langsung ke Postgres via service key, jadi tidak
 * ada Server Action yang memicu `revalidatePath`. Tanpa endpoint ini, produk
 * baru / pergantian `is_featured` baru tampil setelah ISR 3600 detik habis.
 *
 * Auth: Bearer-only `CRON_SECRET` (fail-closed di produksi — lihat cron-auth).
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const revalidated = revalidateAffiliateCatalog();
    return NextResponse.json({ revalidated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
