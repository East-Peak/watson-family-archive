'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  deriveMobileShellChrome,
  deriveMobileShellMode,
  type MobileShellChrome,
  type MobileShellMode,
} from '@/components/mobile/MobileShellMode';
import type { PageContext, VisualizationCommand } from '@/types/visualization';
import type { SidebarMessage, SidebarConversation } from '@/types/chat';
export type { PageContext, VisualizationCommand } from '@/types/visualization';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_OPEN_KEY = 'watson-tree-sidebar-open';
const MESSAGES_KEY = 'watson-tree-sidebar-messages';
const MAX_MESSAGES = 50;
const CONVERSATION_VERSION = 1;

function isMobileViewport(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia('(max-width: 767px)').matches;
}

function mobileShellChromeEquals(
  a: MobileShellChrome,
  b: MobileShellChrome,
): boolean {
  return a.mode === b.mode && a.immersiveExitHref === b.immersiveExitHref;
}

// ─── Route context derivation ─────────────────────────────────────────────────

export type RouteContext =
  | { type: 'person'; personId: string }
  | { type: 'collection'; collectionType: string }
  | { type: 'tree' }
  | { type: 'globe' }
  | { type: 'timeline' }
  | { type: 'explorer' }
  | { type: 'home' };

export function deriveRouteContext(pathname: string): RouteContext {
  if (pathname.startsWith('/person/')) {
    const personId = pathname.replace('/person/', '').split('/')[0];
    return { type: 'person', personId };
  }
  if (pathname.startsWith('/collection/')) {
    const collectionType = pathname.replace('/collection/', '').split('/')[0];
    return { type: 'collection', collectionType };
  }
  if (pathname === '/tree') return { type: 'tree' };
  if (pathname === '/globe') return { type: 'globe' };
  if (pathname === '/timeline') return { type: 'timeline' };
  if (pathname === '/explorer') return { type: 'explorer' };
  return { type: 'home' };
}

// ─── Marker text helpers ──────────────────────────────────────────────────────

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildMarkerText(
  ctx: RouteContext,
  personName?: string,
): string {
  switch (ctx.type) {
    case 'person':
      return personName
        ? `[Context: Now viewing ${personName}'s profile.]`
        : `[Context: Now viewing a person's profile.]`;
    case 'tree':
      return `[Context: Now viewing the family tree.]`;
    case 'globe':
      return `[Context: Now viewing the globe.]`;
    case 'home':
      return `[Context: Now on the home page.]`;
    case 'timeline':
      return `[Context: Now viewing the timeline.]`;
    case 'explorer':
      return `[Context: Now viewing the explorer.]`;
    case 'collection':
      return `[Context: Now viewing the ${toTitleCase(ctx.collectionType)} collection.]`;
  }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadSidebarOpen(pathname: string): boolean {
  try {
    if (isMobileViewport() && deriveMobileShellMode(pathname) === 'standard') {
      return false;
    }

    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (stored !== null) return stored === 'true';
    // First visit: open on home, closed elsewhere
    return pathname === '/';
  } catch {
    return pathname === '/';
  }
}

function saveSidebarOpen(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(value));
  } catch {
    // ignore storage errors
  }
}

function loadMessages(): SidebarMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SidebarConversation;
    if (
      parsed.version !== CONVERSATION_VERSION ||
      !Array.isArray(parsed.messages)
    ) {
      console.warn(
        '[ChatProvider] Conversation version mismatch or corrupt data — resetting.',
      );
      return [];
    }
    const msgs = parsed.messages;
    if (msgs.length > MAX_MESSAGES) {
      return msgs.slice(msgs.length - MAX_MESSAGES);
    }
    return msgs;
  } catch {
    console.warn(
      '[ChatProvider] Corrupt localStorage conversation — resetting.',
    );
    return [];
  }
}

function saveMessages(messages: SidebarMessage[]): void {
  try {
    const data: SidebarConversation = { version: 1, messages };
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface ChatContextType {
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  routeContext: RouteContext;
  pageContext: PageContext | undefined;
  setPageContext: (context: PageContext | undefined) => void;
  effectiveContext: PageContext;
  messages: SidebarMessage[];
  addMessage: (msg: SidebarMessage) => void;
  replaceLastMessage: (msg: SidebarMessage) => void;
  clearConversation: () => void;
  visualizationCommand: VisualizationCommand | null;
  setVisualizationCommand: (cmd: VisualizationCommand | null) => void;
  clearVisualizationCommand: () => void;
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  mobileShellChrome: MobileShellChrome;
  mobileShellMode: MobileShellMode;
  setMobileShellChrome: (chrome: MobileShellChrome) => void;
  clearMobileShellChrome: () => void;
  setMobileShellMode: (mode: MobileShellMode) => void;
  clearMobileShellMode: () => void;
  insertGenericPersonMarkerIfPending: () => SidebarMessage | null;
  pendingPrompt: string | null;
  askAI: (prompt: string) => void;
  clearPendingPrompt: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const pathname = usePathname();
  const routeContext = deriveRouteContext(pathname);
  const defaultMobileShellChrome = deriveMobileShellChrome(pathname);
  const defaultMobileShellMode = defaultMobileShellChrome.mode;

  // Sidebar open state starts closed until the client can safely derive
  // viewport-aware defaults without causing a server/client mismatch.
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Conversation messages — lazy init from localStorage
  const [messages, setMessages] = useState<SidebarMessage[]>(() =>
    loadMessages(),
  );

  // Page context supplied by individual pages
  const [pageContext, setPageContextState] = useState<PageContext | undefined>(
    undefined,
  );

  // Visualization command passthrough
  const [visualizationCommand, setVisualizationCommandState] =
    useState<VisualizationCommand | null>(null);

  // Search panel
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Mobile shell chrome
  const [mobileShellModeOverride, setMobileShellModeOverride] = useState<{
    pathname: string;
    chrome: MobileShellChrome;
  } | null>(null);

  // Pending AI prompt handoff from search → sidebar
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Pending person marker — keyed to the pathname when we navigated to a person page
  // null means no pending marker
  const pendingPersonMarkerPathnameRef = useRef<string | null>(null);

  // ── Sidebar actions ──────────────────────────────────────────────────────────

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
    saveSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    saveSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      saveSidebarOpen(next);
      return next;
    });
  }, []);

  // ── Conversation actions ─────────────────────────────────────────────────────

  const addMessage = useCallback((msg: SidebarMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      const trimmed =
        next.length > MAX_MESSAGES
          ? next.slice(next.length - MAX_MESSAGES)
          : next;
      saveMessages(trimmed);
      return trimmed;
    });
  }, []);

  const replaceLastMessage = useCallback((msg: SidebarMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return [msg];
      const next = [...prev.slice(0, -1), msg];
      saveMessages(next);
      return next;
    });
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    saveMessages([]);
  }, []);

  // ── Page context ─────────────────────────────────────────────────────────────

  const setPageContext = useCallback((context: PageContext | undefined) => {
    setPageContextState(context);
  }, []);

  // Effective context: pageContext fields override routeContext only when
  // pageContext.sourcePathname matches current pathname
  const effectiveContext: PageContext = (() => {
    if (pageContext && pageContext.sourcePathname === pathname) {
      return pageContext;
    }
    // Fall back to routeContext — cast to PageContext shape
    return routeContext as PageContext;
  })();

  // ── Visualization command ────────────────────────────────────────────────────

  const setVisualizationCommand = useCallback(
    (cmd: VisualizationCommand | null) => {
      setVisualizationCommandState(cmd);
    },
    [],
  );

  const clearVisualizationCommand = useCallback(() => {
    setVisualizationCommandState(null);
  }, []);

  // ── Search ───────────────────────────────────────────────────────────────────

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  // ── AI prompt handoff ────────────────────────────────────────────────────────

  const askAI = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setPendingPrompt(trimmed);
    setIsSidebarOpen(true);
    saveSidebarOpen(true);
    setIsSearchOpen(false);
  }, []);

  const clearPendingPrompt = useCallback(() => setPendingPrompt(null), []);

  // ── Mobile shell mode ────────────────────────────────────────────────────────

  const mobileShellChrome =
    mobileShellModeOverride?.pathname === pathname
      ? {
          ...defaultMobileShellChrome,
          ...mobileShellModeOverride.chrome,
        }
      : defaultMobileShellChrome;

  const mobileShellMode = mobileShellChrome.mode;

  const setMobileShellChrome = useCallback(
    (chrome: MobileShellChrome) => {
      setMobileShellModeOverride((current) => {
        if (
          current?.pathname === pathname &&
          mobileShellChromeEquals(current.chrome, chrome)
        ) {
          return current;
        }

        return { pathname, chrome };
      });
    },
    [pathname],
  );

  const clearMobileShellChrome = useCallback(() => {
    setMobileShellModeOverride((current) =>
      current?.pathname === pathname ? null : current,
    );
  }, [pathname]);

  const setMobileShellMode = useCallback(
    (mode: MobileShellMode) => {
      setMobileShellChrome({ mode });
    },
    [setMobileShellChrome],
  );

  const clearMobileShellMode = useCallback(() => {
    clearMobileShellChrome();
  }, [clearMobileShellChrome]);

  // ── Context marker on pathname change ────────────────────────────────────────

  const prevPathnameRef = useRef<string | null>(null);
  const mobileSidebarRouteRef = useRef<string | null>(null);
  const hasInitializedSidebarRef = useRef(false);

  useLayoutEffect(() => {
    if (hasInitializedSidebarRef.current) {
      return;
    }

    hasInitializedSidebarRef.current = true;
    setIsSidebarOpen(loadSidebarOpen(pathname));
  }, [pathname]);

  useEffect(() => {
    if (!isMobileViewport() || defaultMobileShellMode !== 'standard') {
      mobileSidebarRouteRef.current = pathname;
      return;
    }

    if (mobileSidebarRouteRef.current === pathname) {
      return;
    }

    mobileSidebarRouteRef.current = pathname;

    setIsSidebarOpen(false);
    saveSidebarOpen(false);
  }, [defaultMobileShellMode, pathname]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleViewportChange = (
      event: MediaQueryListEvent | MediaQueryList,
    ) => {
      if (!event.matches || defaultMobileShellMode !== 'standard') {
        return;
      }

      mobileSidebarRouteRef.current = pathname;
      setIsSidebarOpen(false);
      saveSidebarOpen(false);
    };

    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener('change', handleViewportChange);

    return () => {
      mediaQuery.removeEventListener('change', handleViewportChange);
    };
  }, [defaultMobileShellMode, pathname]);

  useEffect(() => {
    // Skip on first render — no navigation has occurred yet
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return;
    }
    if (prevPathnameRef.current === pathname) return;

    prevPathnameRef.current = pathname;

    // Only insert markers when conversation is non-empty
    setMessages((current) => {
      if (current.length === 0) return current;

      const ctx = deriveRouteContext(pathname);

      if (ctx.type === 'person') {
        // Set pending marker — wait for personName from pageContext
        pendingPersonMarkerPathnameRef.current = pathname;
        return current;
      }

      // Non-person page: insert marker immediately
      pendingPersonMarkerPathnameRef.current = null;
      const marker: SidebarMessage = {
        type: 'context-marker',
        content: buildMarkerText(ctx),
        timestamp: Date.now(),
      };
      const next = [...current, marker];
      const trimmed =
        next.length > MAX_MESSAGES
          ? next.slice(next.length - MAX_MESSAGES)
          : next;
      saveMessages(trimmed);
      return trimmed;
    });
  }, [pathname]);

  // When pageContext arrives with a personName, resolve the pending marker
  useEffect(() => {
    if (
      pendingPersonMarkerPathnameRef.current === null ||
      !pageContext?.personName ||
      pageContext.sourcePathname !== pathname
    ) {
      return;
    }

    // Pathname still matches — insert named marker
    const pendingPathname = pendingPersonMarkerPathnameRef.current;
    if (pendingPathname !== pathname) {
      pendingPersonMarkerPathnameRef.current = null;
      return;
    }

    pendingPersonMarkerPathnameRef.current = null;

    setMessages((current) => {
      if (current.length === 0) return current;
      const marker: SidebarMessage = {
        type: 'context-marker',
        content: buildMarkerText(
          { type: 'person', personId: pageContext.personId ?? '' },
          pageContext.personName,
        ),
        timestamp: Date.now(),
      };
      const next = [...current, marker];
      const trimmed =
        next.length > MAX_MESSAGES
          ? next.slice(next.length - MAX_MESSAGES)
          : next;
      saveMessages(trimmed);
      return trimmed;
    });
  }, [pageContext, pathname]);

  // ── insertGenericPersonMarkerIfPending ───────────────────────────────────────

  const insertGenericPersonMarkerIfPending =
    useCallback((): SidebarMessage | null => {
      if (pendingPersonMarkerPathnameRef.current === null) return null;
      if (pendingPersonMarkerPathnameRef.current !== pathname) {
        pendingPersonMarkerPathnameRef.current = null;
        return null;
      }
      pendingPersonMarkerPathnameRef.current = null;

      const marker: SidebarMessage = {
        type: 'context-marker',
        content: `[Context: Now viewing a person's profile.]`,
        timestamp: Date.now(),
      };

      setMessages((current) => {
        if (current.length === 0) return current;
        const next = [...current, marker];
        const trimmed =
          next.length > MAX_MESSAGES
            ? next.slice(next.length - MAX_MESSAGES)
            : next;
        saveMessages(trimmed);
        return trimmed;
      });

      return marker;
    }, [pathname]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <ChatContext.Provider
      value={{
        isSidebarOpen,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        routeContext,
        pageContext,
        setPageContext,
        effectiveContext,
        messages,
        addMessage,
        replaceLastMessage,
        clearConversation,
        visualizationCommand,
        setVisualizationCommand,
        clearVisualizationCommand,
        isSearchOpen,
        openSearch,
        closeSearch,
        mobileShellChrome,
        mobileShellMode,
        setMobileShellChrome,
        clearMobileShellChrome,
        setMobileShellMode,
        clearMobileShellMode,
        insertGenericPersonMarkerIfPending,
        pendingPrompt,
        askAI,
        clearPendingPrompt,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
