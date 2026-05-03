'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { siteConfig } from '@/lib/siteConfig';

export interface MePerson {
  id: string | null; // null = "not in the tree" sentinel
  name: string;
  familyBranch?: string; // e.g. "watson", "gorney", "andes"
}

/**
 * Returns true if the viewer is mapped to a real person in the tree.
 * Use this guard before building any URL or API call that needs me.id.
 */
export function hasViewerPerson(me: MePerson | null): me is MePerson & { id: string } {
  return me !== null && typeof me.id === 'string' && me.id.length > 0;
}

export interface AuthIdentity {
  email: string;
  role: 'admin' | 'family';
}

interface MeContextType {
  me: MePerson | null;
  setMe: (person: MePerson | null) => void;
  isMe: (personId: string) => boolean;
  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
  authIdentity: AuthIdentity | null;
}

export const MeContext = createContext<MeContextType | undefined>(undefined);

const STORAGE_KEY = `${siteConfig.defaultTreeId}-me`;

export function useMe() {
  const context = useContext(MeContext);
  if (!context) {
    throw new Error('useMe must be used within a MeProvider');
  }
  return context;
}

interface MeProviderProps {
  children: ReactNode;
  authIdentity?: AuthIdentity | null;
}

export function MeProvider({ children, authIdentity = null }: MeProviderProps) {
  const [me, setMeState] = useState<MePerson | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Load from localStorage on mount — migrate from old key if needed
  useEffect(() => {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      const legacyKeys = ['watson-family-tree-me', 'family-tree-me'];
      if (!stored) {
        for (const legacyKey of legacyKeys) {
          const oldStored = localStorage.getItem(legacyKey);
          if (!oldStored) continue;
          stored = oldStored;
          localStorage.setItem(STORAGE_KEY, oldStored);
          if (legacyKey !== STORAGE_KEY) {
            localStorage.removeItem(legacyKey);
          }
          break;
        }
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.id && parsed.name) {
          setMeState(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load "me" from localStorage:', e);
    }
    setLoaded(true);
  }, []);

  // Save to localStorage when changed
  const setMe = useCallback((person: MePerson | null) => {
    setMeState(person);
    try {
      if (person) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(person));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save "me" to localStorage:', e);
    }
  }, []);

  const isMe = (personId: string) => me?.id === personId;

  // Don't render children until we've loaded from localStorage
  // to prevent hydration mismatch
  if (!loaded) {
    return null;
  }

  return (
    <MeContext.Provider value={{ me, setMe, isMe, onboardingOpen, setOnboardingOpen, authIdentity }}>
      {children}
    </MeContext.Provider>
  );
}
