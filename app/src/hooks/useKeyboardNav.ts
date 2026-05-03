'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseKeyboardNavOptions {
  itemCount: number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
  isOpen?: boolean;
  loop?: boolean;
}

export interface UseKeyboardNavReturn {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  resetActiveIndex: () => void;
}

export function useKeyboardNav({
  itemCount,
  onSelect,
  onEscape,
  isOpen,
  loop = true,
}: UseKeyboardNavOptions): UseKeyboardNavReturn {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef(-1);

  // Keep ref in sync with state so Enter handler reads a stable value
  // (safe in React concurrent mode — no side effects inside a state updater).
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Wrapped setter keeps ref and state in sync on every direct write.
  const setActiveIndexWrapped = useCallback((value: number) => {
    activeIndexRef.current = value;
    setActiveIndex(value);
  }, []);

  const resetActiveIndex = useCallback(() => {
    setActiveIndexWrapped(-1);
  }, [setActiveIndexWrapped]);

  // Reset when itemCount changes or isOpen becomes false.
  useEffect(() => {
    setActiveIndexWrapped(-1);
  }, [itemCount, setActiveIndexWrapped]);

  useEffect(() => {
    if (isOpen === false) {
      setActiveIndexWrapped(-1);
    }
  }, [isOpen, setActiveIndexWrapped]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore all key handling when explicitly closed or no items.
      if (isOpen === false || itemCount === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setActiveIndex((prev) => {
            const next = prev === -1 ? 0 : prev >= itemCount - 1 ? (loop ? 0 : prev) : prev + 1;
            activeIndexRef.current = next;
            return next;
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((prev) => {
            let next: number;
            if (prev <= 0) {
              next = prev === -1 ? -1 : loop ? itemCount - 1 : 0;
            } else {
              next = prev - 1;
            }
            activeIndexRef.current = next;
            return next;
          });
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const idx = activeIndexRef.current;
          if (idx >= 0) onSelect(idx);
          break;
        }
        case 'Escape': {
          onEscape?.();
          break;
        }
        case 'Tab': {
          onEscape?.();
          break;
        }
      }
    },
    [itemCount, isOpen, loop, onSelect, onEscape]
  );

  return {
    activeIndex,
    setActiveIndex: setActiveIndexWrapped,
    handleKeyDown,
    resetActiveIndex,
  };
}
