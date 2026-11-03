'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  backNavigationManager,
  type BackHandlerPriority,
  type BackHandlerResult,
} from './BackNavigationManager';

export interface BackNavigationContextValue {
  triggerBack: () => BackHandlerResult;
}

const BackNavigationContext = createContext<BackNavigationContextValue>({
  triggerBack: () => backNavigationManager.triggerBack(),
});

export function BackNavigationProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    backNavigationManager.init();
  }, []);

  return (
    <BackNavigationContext.Provider
      value={{
        triggerBack: () => backNavigationManager.triggerBack(),
      }}
    >
      {children}
    </BackNavigationContext.Provider>
  );
}

export function useBackNavigation(): BackNavigationContextValue {
  return useContext(BackNavigationContext);
}

export interface UseBackHandlerOptions {
  id: string;
  priority: BackHandlerPriority;
  enabled?: boolean;
  onBack: () => BackHandlerResult;
}

/**
 * Hook to register a back handler for a dialog, modal, drawer, subscreen, or tab.
 * Automatically synchronizes with Android system back and browser History API.
 */
export function useBackHandler({
  id,
  priority,
  enabled = true,
  onBack,
}: UseBackHandlerOptions): void {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return;

    const unregister = backNavigationManager.registerHandler(
      id,
      priority,
      () => onBackRef.current()
    );

    return () => {
      unregister();
    };
  }, [id, priority, enabled]);
}
