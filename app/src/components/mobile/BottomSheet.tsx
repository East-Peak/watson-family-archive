'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

export default function BottomSheet({
  open,
  eyebrow = 'More',
  title,
  onClose,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const portalElement = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('div');
    element.dataset.bottomSheetPortal = 'true';
    return element;
  }, []);

  useEffect(() => {
    if (!portalElement) return;

    document.body.appendChild(portalElement);
    setPortalNode(portalElement);

    return () => {
      portalElement.remove();
      setPortalNode(null);
    };
  }, [portalElement]);

  useEffect(() => {
    if (!open || !portalNode) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const bodyChildren = Array.from(document.body.children);
    const hiddenSiblings: Array<{
      element: HTMLElement;
      previousAriaHidden: string | null;
      previousInert: boolean;
    }> = [];

    bodyChildren.forEach((child) => {
      if (!(child instanceof HTMLElement) || child === portalNode) return;
      hiddenSiblings.push({
        element: child,
        previousAriaHidden: child.getAttribute('aria-hidden'),
        previousInert:
          'inert' in child
            ? Boolean((child as HTMLElement & { inert?: boolean }).inert)
            : false,
      });
      child.setAttribute('aria-hidden', 'true');
      if ('inert' in child) {
        (child as HTMLElement & { inert?: boolean }).inert = true;
      }
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      hiddenSiblings.forEach(
        ({ element, previousAriaHidden, previousInert }) => {
          if (previousAriaHidden === null) {
            element.removeAttribute('aria-hidden');
          } else {
            element.setAttribute('aria-hidden', previousAriaHidden);
          }

          if ('inert' in element) {
            (element as HTMLElement & { inert?: boolean }).inert =
              previousInert;
          }
        },
      );

      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose, portalNode]);

  if (!open || !portalNode) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden" data-comment-chrome="">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-2xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-shield/45">
              {eyebrow}
            </p>
            <h2 id={titleId} className="text-lg font-semibold text-shield">
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    portalNode,
  );
}
