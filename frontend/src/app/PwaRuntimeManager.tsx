'use client';

import { useEffect } from 'react';
import { usePwaUpdate } from '@/features/pwa/usePwaUpdate';
import { initPwaInstallCapture } from '@/features/pwa/usePwaInstall';

/** Register/migrate the service worker and capture PWA install events before any route renders. */
export function PwaRuntimeManager() {
  usePwaUpdate({ checkIntervalMs: 5 * 60 * 1000 });

  useEffect(() => {
    initPwaInstallCapture();
  }, []);

  return null;
}
