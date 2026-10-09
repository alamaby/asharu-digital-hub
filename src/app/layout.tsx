import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl)
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
