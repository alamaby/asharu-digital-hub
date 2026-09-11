'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type AdminTheme = 'light' | 'dark';

interface AdminThemeContextValue {
  theme: AdminTheme;
  toggleTheme: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'asharu-theme';

function readTheme(): AdminTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Theme provider untuk area non-publik (port TailAdmin ThemeContext).
 * Kelas `dark` di `<html>` dipasang pra-hydration oleh `AdminThemeScript`
 * sehingga tidak ada flash; provider ini hanya menyinkronkan state React
 * dan menangani toggle (localStorage first-party, tanpa cookie agar rute
 * publik tetap SSG penuh).
 */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Penyimpanan privat: abaikan, tema sesi tetap berlaku.
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme, ready]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <AdminThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme(): AdminThemeContextValue {
  const context = useContext(AdminThemeContext);
  if (!context) {
    throw new Error('useAdminTheme must be used within an AdminThemeProvider');
  }
  return context;
}
