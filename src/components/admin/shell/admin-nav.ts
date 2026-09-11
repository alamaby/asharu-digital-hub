import {
  ClipboardCheck,
  Cpu,
  FileText,
  FlaskConical,
  Globe,
  Image,
  LayoutDashboard,
  LogIn,
  Plus,
  Share2,
  type LucideIcon
} from 'lucide-react';
import type { NavItem } from '@/config/navigation';

export interface AdminNavEntry {
  key: NavItem['key'];
  pathname: NavItem['pathname'];
  icon: LucideIcon;
  /** Hanya tampil bila pengguna adalah admin. */
  adminOnly: boolean;
  /** Cocok persis (dasbor) vs prefix (halaman induk + detail). */
  exact?: boolean;
}

export interface AdminNavGroup {
  id: 'manage' | 'create' | 'other';
  entries: AdminNavEntry[];
}

/**
 * Navigasi sidebar classic-collapsible. Label diterjemahkan via
 * namespace `nav` (kunci = `key`), judul grup via `nav.group*`.
 */
export const adminNavGroups: readonly AdminNavGroup[] = [
  { id: 'manage',
    entries: [
      { key: 'adminDashboard', pathname: '/admin', icon: LayoutDashboard, adminOnly: true, exact: true },
      { key: 'adminKonten', pathname: '/admin/konten', icon: FileText, adminOnly: true },
      { key: 'adminRiset', pathname: '/admin/riset', icon: FlaskConical, adminOnly: true },
      { key: 'adminLlm', pathname: '/admin/llm', icon: Cpu, adminOnly: true },
      { key: 'adminVisual', pathname: '/admin/visual', icon: Image, adminOnly: true },
      { key: 'adminSosial', pathname: '/admin/sosial', icon: Share2, adminOnly: true },
      { key: 'studio', pathname: '/studio', icon: Image, adminOnly: false },
    ]
  },
  {
    id: 'create',
    entries: [
      { key: 'adminBaru', pathname: '/konten/baru', icon: Plus, adminOnly: false, exact: true },
      { key: 'adminReview', pathname: '/konten/review', icon: ClipboardCheck, adminOnly: true }
    ]
  },
  {
    id: 'other',
    entries: [
      { key: 'backToSite', pathname: '/', icon: Globe, adminOnly: false, exact: true }
    ]
  }
];

export const adminSignInEntry: AdminNavEntry = {
  key: 'signIn',
  pathname: '/masuk',
  icon: LogIn,
  adminOnly: false,
  exact: true
};

export function isNavActive(pathname: string, entry: AdminNavEntry): boolean {
  if (entry.exact) return pathname === entry.pathname;
  return pathname === entry.pathname || pathname.startsWith(entry.pathname + '/');
}
