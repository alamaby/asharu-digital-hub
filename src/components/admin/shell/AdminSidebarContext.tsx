'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface AdminSidebarContextValue {
  isExpanded: boolean;
  isMobileOpen: boolean;
  isHovered: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  setIsHovered: (hovered: boolean) => void;
}

const AdminSidebarContext = createContext<AdminSidebarContextValue | undefined>(undefined);

/** State sidebar classic-collapsible (port TailAdmin SidebarContext). */
export function AdminSidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const setHovered = useCallback((hovered: boolean) => {
    setIsHovered(hovered);
  }, []);

  return (
    <AdminSidebarContext.Provider
      value={{
        isExpanded: isMobile ? false : isExpanded,
        isMobileOpen,
        isHovered,
        toggleSidebar,
        toggleMobileSidebar,
        closeMobileSidebar,
        setIsHovered: setHovered
      }}
    >
      {children}
    </AdminSidebarContext.Provider>
  );
}

export function useAdminSidebar(): AdminSidebarContextValue {
  const context = useContext(AdminSidebarContext);
  if (!context) {
    throw new Error('useAdminSidebar must be used within an AdminSidebarProvider');
  }
  return context;
}
