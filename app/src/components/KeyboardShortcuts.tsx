'use client';

import { useEffect, ReactNode } from 'react';
import SmartSearchInput from './SmartSearchInput';
import { useChat } from './ChatProvider';

interface KeyboardShortcutsProps {
  children: ReactNode;
}

export default function KeyboardShortcuts({
  children,
}: KeyboardShortcutsProps) {
  const { isSearchOpen, openSearch, closeSearch, toggleSidebar } = useChat();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (e.shiftKey) {
          toggleSidebar();
        } else {
          openSearch();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openSearch, toggleSidebar]);

  return (
    <>
      {children}
      <SmartSearchInput isOpen={isSearchOpen} onClose={closeSearch} />
    </>
  );
}
