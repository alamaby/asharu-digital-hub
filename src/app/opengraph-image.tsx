import { ImageResponse } from 'next/og';

export const alt = 'Asharu — Semua yang Anda cari, dalam satu tempat. (asharu.id)';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#075985',
          color: '#F8FAFC'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 110, fontWeight: 700 }}>Asharu</span>
          <span style={{ fontSize: 64, color: '#D97706' }}>.</span>
        </div>
        <div style={{ fontSize: 44, marginTop: 24, maxWidth: 900 }}>
          Semua yang Anda cari, dalam satu tempat.
        </div>
        <div style={{ fontSize: 30, marginTop: 32, color: '#BAE6FD' }}>asharu.id</div>
      </div>
    ),
    size
  );
}
