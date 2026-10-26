'use client';

import React, { useState, useEffect } from 'react';
import { ArthSymbol } from './ArthLogo';

export interface SplashScreenProps {
  /** Optional custom message when loading takes longer or synchronization is ongoing */
  statusMessage?: string;
  /** Optional error message if initialization failed */
  errorMessage?: string | null;
  /** Optional callback when error retry button is clicked */
  onRetry?: () => void;
  /** If true, fades out with smooth opacity transition */
  isFadingOut?: boolean;
}

export function SplashScreen({
  statusMessage,
  errorMessage,
  onRetry,
  isFadingOut = false,
}: SplashScreenProps) {
  const [internalMessage, setInternalMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return !navigator.onLine;
    }
    return false;
  });

  // Listen for online / offline events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      // Auto-trigger retry when network reconnects if we had an error
      if (errorMessage && onRetry) {
        onRetry();
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [errorMessage, onRetry]);

  // Stage functional status messages if loading takes longer than expected
  useEffect(() => {
    if (errorMessage || isOffline) return;

    // After 2.5s: "Preparing your ledger…"
    const timer1 = setTimeout(() => {
      setInternalMessage('Preparing your ledger…');
    }, 2500);

    // After 8s: "Taking longer than usual. Please check your connection."
    const timer2 = setTimeout(() => {
      setInternalMessage('Taking longer than usual. Please check your connection.');
    }, 8000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [errorMessage, isOffline]);

  // Determine current effective message
  const activeMessage =
    statusMessage ??
    (isOffline
      ? 'You are currently offline. Check your connection to sync your ledger.'
      : internalMessage);

  return (
    <div
      role="status"
      aria-busy={!errorMessage && !isOffline}
      aria-live="polite"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0D0D0F] text-[#F5F5F4] select-none transition-opacity duration-300 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center px-6 text-center max-w-sm w-full">
        {/* Contrasting Surface Badge with Balanced Logo Symbol */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#161518] border border-white/10 shadow-2xl shadow-black/60 flex items-center justify-center transition-transform">
            <ArthSymbol
              theme="white"
              className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-sm"
              title="Arth"
            />
          </div>
        </div>

        {/* Brand Name */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F4] font-sans">
          Arth
        </h1>

        {/* Brand Tagline */}
        <p className="text-xs sm:text-sm text-[#A8A29E] tracking-wide mt-1.5 font-normal">
          Your money, clearly.
        </p>

        {/* Functional Indicator or Error / Offline State */}
        {!errorMessage && !isOffline ? (
          <div className="flex flex-col items-center mt-7">
            {/* Restrained Loading Animation: 3 small pulsing dots in emerald brand color */}
            <div className="flex items-center gap-2" aria-hidden="true">
              <span
                className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"
                style={{ animationDuration: '1.4s', animationDelay: '0ms' }}
              />
              <span
                className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"
                style={{ animationDuration: '1.4s', animationDelay: '250ms' }}
              />
              <span
                className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"
                style={{ animationDuration: '1.4s', animationDelay: '500ms' }}
              />
            </div>

            {/* Subtle Functional Status Message */}
            {activeMessage && (
              <p className="text-xs text-[#78716C] mt-4 font-mono tracking-wider transition-opacity duration-300">
                {activeMessage}
              </p>
            )}
          </div>
        ) : (
          /* Recoverable Error or Offline State with Retry Action */
          <div className="mt-6 flex flex-col items-center space-y-3.5">
            <p className="text-xs text-rose-400 font-medium max-w-xs leading-relaxed">
              {errorMessage || activeMessage}
            </p>
            <button
              type="button"
              onClick={onRetry || (() => (typeof window !== 'undefined' ? window.location.reload() : undefined))}
              className="px-4 py-2 text-xs font-semibold bg-[#221F1C] text-[#F5F5F4] hover:bg-[#2C2824] border border-[#3F3B37] rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Screen Reader Announcement */}
        <span className="sr-only">
          {errorMessage
            ? `Error: ${errorMessage}`
            : isOffline
              ? 'App is offline'
              : activeMessage || 'Loading Arth ledger'}
        </span>
      </div>
    </div>
  );
}
