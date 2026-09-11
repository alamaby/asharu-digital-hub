import { isAdmin } from '@/lib/auth/is-admin';
import { AdminSidebar } from './AdminSidebar';

/**
 * Slot server untuk sidebar: membaca `profiles.is_admin` agar item admin
 * tidak flicker (dirender benar sejak HTML pertama). Membuat rute di bawah
 * grup `(admin)` menjadi dinamis — trade-off yang disengaja agar sidebar
 * selalu benar untuk admin maupun anonim.
 */
export async function AdminSidebarSlot() {
  const admin = await isAdmin();
  return <AdminSidebar isAdmin={admin} />;
}
