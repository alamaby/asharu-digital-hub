import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#075985',
          borderRadius: 36,
          color: '#F8FAFC'
        }}
      >
        <div style={{ display: 'flex', fontSize: 120, fontWeight: 700 }}>A</div>
        <div style={{ display: 'flex', fontSize: 72, color: '#D97706', marginTop: 40 }}>.</div>
      </div>
    ),
    size
  );
}
