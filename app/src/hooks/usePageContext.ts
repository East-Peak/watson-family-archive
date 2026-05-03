'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useChat } from '@/components/ChatProvider';
import type { PageContext } from '@/types/visualization';

export function usePageContext(context: PageContext | undefined) {
  const { setPageContext } = useChat();
  const pathname = usePathname();

  useEffect(() => {
    if (context) {
      setPageContext({ ...context, sourcePathname: pathname });
    } else {
      setPageContext(undefined);
    }
    return () => setPageContext(undefined);
  }, [context, setPageContext, pathname]);
}
