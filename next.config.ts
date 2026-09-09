import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

// Content-Security-Policy compatible with Next.js runtime scripts and Google
// Analytics (gtag.js). Trade-off: script-src allows 'unsafe-inline' because
// Next.js and gtag.js rely on inline scripts and a nonce-based CSP would
// require middleware overhead for a static site. See README "Trade-offs".
const isProd = process.env.NODE_ENV === 'production';

// Hostname Storage penuh (bukan wildcard): hanya proyek Supabase sendiri yang
// boleh jadi sumber <img>. Diambil dari NEXT_PUBLIC_SUPABASE_URL agar otomatis
// ikut berubah bila project ref ganti; fallback ke ref production saat env kosong.
function supabaseImageHost(): string {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    if (/^[a-z0-9-]+\.supabase\.co$/.test(host)) return `https://${host}`;
  } catch {
    // env belum diisi (dev awal) — pakai ref production.
  }
  return 'https://hljjmmejmirqikmbaryl.supabase.co';
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // 'unsafe-eval' is required by Next.js dev-mode HMR/source-maps; production
  // ships without it. Supabase auth/realtime calls run from the browser, so
  // *.supabase.co must be allowed in connect-src in both modes.
  isProd
    ? "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  // Google Maps embed (<iframe>) on property detail pages. Narrowly scoped to
  // Google Maps hosts; frame-ancestors stays 'none' so others still cannot
  // embed asharu.id.
  "frame-src 'self' https://www.google.com https://maps.google.com",
  "img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com " +
    supabaseImageHost(),
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://www.google.com https://*.supabase.co wss://*.supabase.co",
  ...(isProd ? ['upgrade-insecure-requests'] : [])
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  }
];

/** @type {NextConfig} */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
