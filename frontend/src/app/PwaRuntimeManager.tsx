'use client';

import { usePwaUpdate } from '@/features/pwa/usePwaUpdate';

/** Register/migrate the service worker before any authenticated route is rendered. */
export function PwaRuntimeManager() {
  usePwaUpdate({ checkIntervalMs: 5 * 60 * 1000 });
  return null;
}
