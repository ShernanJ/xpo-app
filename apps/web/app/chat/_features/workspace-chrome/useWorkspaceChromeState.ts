"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CreatorHandlesResponse {
  ok: boolean;
  data?: {
    handles?: string[];
  };
}

interface UseWorkspaceChromeStateOptions {
  accountName: string | null;
}

export function useWorkspaceChromeState(
  options: UseWorkspaceChromeStateOptions,
) {
  const { accountName } = options;
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [menuOpenThreadId, setMenuOpenThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [threadToDelete, setThreadToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [rateLimitsMenuOpen, setRateLimitsMenuOpen] = useState(false);
  const [availableHandles, setAvailableHandles] = useState<string[]>([]);

  const threadMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuVisibilityTimeoutRef = useRef<number | null>(null);

  const requestDeleteThread = useCallback((id: string, title: string) => {
    setThreadToDelete({ id, title });
    setMenuOpenThreadId(null);
  }, []);

  const clearThreadToDelete = useCallback(() => {
    setThreadToDelete(null);
  }, []);

  const openSidebar = useCallback(() => {
    setMenuOpenThreadId(null);
    setAccountMenuOpen(false);
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const closeAccountMenu = useCallback(() => {
    setAccountMenuOpen(false);
    setRateLimitsMenuOpen(false);

    if (accountMenuVisibilityTimeoutRef.current) {
      window.clearTimeout(accountMenuVisibilityTimeoutRef.current);
    }

    accountMenuVisibilityTimeoutRef.current = window.setTimeout(() => {
      setAccountMenuVisible(false);
      accountMenuVisibilityTimeoutRef.current = null;
    }, 220);
  }, []);

  const openAccountMenu = useCallback(() => {
    if (accountMenuVisibilityTimeoutRef.current) {
      window.clearTimeout(accountMenuVisibilityTimeoutRef.current);
      accountMenuVisibilityTimeoutRef.current = null;
    }

    setAccountMenuVisible(true);
    setAccountMenuOpen(true);
  }, []);

  const toggleAccountMenu = useCallback(() => {
    setMenuOpenThreadId(null);
    if (accountMenuOpen) {
      closeAccountMenu();
      return;
    }

    openAccountMenu();
  }, [accountMenuOpen, closeAccountMenu, openAccountMenu]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    let isMounted = true;
    fetch("/api/creator/profile/handles")
      .then((res) => res.json())
      .then((data: CreatorHandlesResponse) => {
        if (!isMounted || !data.ok || !data.data?.handles) {
          return;
        }

        setAvailableHandles(data.data.handles);
      })
      .catch((err) => console.error("Failed to load available handles:", err));

    return () => {
      isMounted = false;
    };
  }, [accountName]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (threadMenuRef.current && !threadMenuRef.current.contains(target)) {
        setMenuOpenThreadId(null);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        closeAccountMenu();
      }

      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setToolsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeAccountMenu]);

  useEffect(() => {
    return () => {
      if (accountMenuVisibilityTimeoutRef.current) {
        window.clearTimeout(accountMenuVisibilityTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktopMediaQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebarToViewport = (isDesktopViewport: boolean) => {
      setSidebarOpen(isDesktopViewport);
    };

    syncSidebarToViewport(desktopMediaQuery.matches);

    const handleViewportChange = (event: MediaQueryListEvent) => {
      syncSidebarToViewport(event.matches);
    };

    desktopMediaQuery.addEventListener("change", handleViewportChange);
    return () => {
      desktopMediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  return {
    hoveredThreadId,
    setHoveredThreadId,
    menuOpenThreadId,
    setMenuOpenThreadId,
    editingThreadId,
    setEditingThreadId,
    editingTitle,
    setEditingTitle,
    threadToDelete,
    requestDeleteThread,
    clearThreadToDelete,
    sidebarOpen,
    setSidebarOpen,
    sidebarSearchQuery,
    setSidebarSearchQuery,
    openSidebar,
    closeSidebar,
    accountMenuOpen,
    setAccountMenuOpen,
    closeAccountMenu,
    toggleAccountMenu,
    accountMenuVisible,
    toolsMenuOpen,
    setToolsMenuOpen,
    rateLimitsMenuOpen,
    setRateLimitsMenuOpen,
    setAvailableHandles,
    availableHandles: accountName ? availableHandles : [],
    threadMenuRef,
    accountMenuRef,
    toolsMenuRef,
  };
}
