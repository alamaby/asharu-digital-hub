import { ImageResponse } from 'next/og';
import { routing, type Locale } from '@/i18n/routing';

export const alt = 'Asharu Digital Hub — Workspace Konten dan Portofolio untuk UMKM';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface ImageProps {
  params: Promise<{ locale: string }>;
}

export default async function OpengraphImage({ params }: ImageProps) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  const isId = locale === 'id';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          backgroundColor: '#0A192F',
          color: '#F8FAFC'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 52, fontWeight: 700, color: '#F8FAFC' }}>Asharu</span>
            <span style={{ fontSize: 52, fontWeight: 700, color: '#0284C7' }}>.</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              borderRadius: 9999,
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              fontSize: 22,
              fontWeight: 600,
              color: '#38BDF8'
            }}
          >
            {isId ? 'Prototipe · Daftar Tunggu Pilot' : 'Prototype · Pilot Waitlist'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.15, maxWidth: 1020, color: '#F8FAFC' }}>
            {isId
              ? 'Workspace Konten & Portofolio untuk UMKM'
              : 'Content Ops & Portfolio Workspace for Small Businesses'}
          </div>
          <div style={{ fontSize: 28, color: '#94A3B8', maxWidth: 940, lineHeight: 1.4 }}>
            {isId
              ? 'Riset → Susun → Tinjau → Publikasikan → Bangun Portofolio'
              : 'Research → Compose → Review → Publish → Build Portfolio'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #334155',
            paddingTop: 28,
            fontSize: 24,
            color: '#64748B'
          }}
        >
          <span>asharu.id/{locale}/digital-hub</span>
          <span style={{ color: '#38BDF8', fontWeight: 600 }}>Content-to-Portfolio</span>
        </div>
      </div>
    ),
    size
  );
}
