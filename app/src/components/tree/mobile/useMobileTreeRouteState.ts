'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type MobileTreeView = 'navigator';
export type MobileTreeDefaultFocusSource = 'viewer' | 'home' | null;

interface UseMobileTreeRouteStateOptions {
  viewerId?: string | null;
  fallbackFocusId?: string | null;
}

export function useMobileTreeRouteState({
  viewerId = null,
  fallbackFocusId = null,
}: UseMobileTreeRouteStateOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [detailPersonId, setDetailPersonId] = useState<string | null>(null);

  const rawFocusPersonId = searchParams.get('focus');
  const requestedFocusPersonId = rawFocusPersonId?.trim()
    ? rawFocusPersonId.trim()
    : null;
  const defaultFocusPersonId = viewerId ?? fallbackFocusId ?? null;
  const defaultFocusSource: MobileTreeDefaultFocusSource = viewerId
    ? 'viewer'
    : defaultFocusPersonId
      ? 'home'
      : null;
  const focusPersonId = requestedFocusPersonId ?? defaultFocusPersonId;
  const view: MobileTreeView = 'navigator';

  const buildHref = useCallback(
    (nextFocusId: string) => {
      const nextParams = new URLSearchParams(searchParamsString);
      nextParams.set('focus', nextFocusId);
      nextParams.set('view', 'navigator');
      return `${pathname}?${nextParams.toString()}`;
    },
    [pathname, searchParamsString],
  );

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsString);
    let changed = false;

    if (
      !requestedFocusPersonId &&
      defaultFocusPersonId &&
      nextParams.get('focus') !== defaultFocusPersonId
    ) {
      nextParams.set('focus', defaultFocusPersonId);
      changed = true;
    }

    if (nextParams.get('view') !== 'navigator') {
      nextParams.set('view', 'navigator');
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${nextParams.toString()}`);
    }
  }, [
    defaultFocusPersonId,
    pathname,
    requestedFocusPersonId,
    router,
    searchParamsString,
  ]);

  useEffect(() => {
    setDetailPersonId(null);
  }, [focusPersonId]);

  const pushFocusPerson = useCallback(
    (personId: string) => {
      setDetailPersonId(null);
      router.push(buildHref(personId));
    },
    [buildHref, router],
  );

  const replaceFocusPerson = useCallback(
    (personId: string) => {
      setDetailPersonId(null);
      router.replace(buildHref(personId));
    },
    [buildHref, router],
  );

  const openDetails = useCallback((personId: string) => {
    setDetailPersonId(personId);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailPersonId(null);
  }, []);

  const inspectPerson = useCallback((personId: string) => {
    setDetailPersonId(personId);
  }, []);

  const viewHere = useCallback(
    (personId: string) => {
      setDetailPersonId(null);
      router.push(buildHref(personId));
    },
    [buildHref, router],
  );

  return useMemo(
    () => ({
      focusPersonId,
      requestedFocusPersonId,
      defaultFocusPersonId,
      defaultFocusSource,
      hasExplicitFocusParam: Boolean(requestedFocusPersonId),
      view,
      detailPersonId,
      pushFocusPerson,
      replaceFocusPerson,
      openDetails,
      closeDetails,
      inspectPerson,
      viewHere,
    }),
    [
      closeDetails,
      defaultFocusPersonId,
      defaultFocusSource,
      detailPersonId,
      focusPersonId,
      requestedFocusPersonId,
      replaceFocusPerson,
      inspectPerson,
      openDetails,
      pushFocusPerson,
      viewHere,
      view,
    ],
  );
}
