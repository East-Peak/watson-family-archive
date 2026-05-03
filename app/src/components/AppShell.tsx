'use client';

import { type ReactNode } from 'react';
import { ChatProvider, useChat } from '@/components/ChatProvider';
import SiteHeader from '@/components/SiteHeader';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import OnboardingModal from '@/components/OnboardingModal';
import AISidebar from '@/components/AISidebar';
import MobileTopBar from '@/components/mobile/MobileTopBar';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { ToastProvider } from '@/components/ui/Toast';

function AppShellInner({ children }: { children: ReactNode }) {
  const { isSidebarOpen, mobileShellChrome, mobileShellMode, routeContext } = useChat();
  const showMobileChrome = mobileShellMode !== 'fullscreen-modal';
  const showMobileBottomNav = mobileShellMode === 'standard';
  const useOverlaySidebar =
    routeContext.type === 'tree' ||
    routeContext.type === 'globe' ||
    mobileShellMode !== 'standard';
  const contentClass = [
    'flex-1 min-w-0 overflow-auto',
    showMobileBottomNav ? 'pb-[var(--mobile-bottom-nav-offset)] md:pb-0' : '',
    mobileShellMode === 'immersive' ? 'pt-[var(--mobile-top-bar-offset)] md:pt-0' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="flex h-screen flex-col">
      <div className="hidden md:block">
        <SiteHeader />
      </div>
      {showMobileChrome && <MobileTopBar chrome={mobileShellChrome} />}
      <div className="flex flex-1 min-h-0">
        <div data-testid="shell-content" className={contentClass}>
          <KeyboardShortcuts>
            {children}
          </KeyboardShortcuts>
        </div>
        {isSidebarOpen && !useOverlaySidebar && <AISidebar />}
        {isSidebarOpen && useOverlaySidebar && <AISidebar overlay />}
      </div>
      {showMobileBottomNav && <MobileBottomNav />}
      <OnboardingModal />
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ChatProvider>
        <AppShellInner>{children}</AppShellInner>
      </ChatProvider>
    </ToastProvider>
  );
}
