'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  setUsernameAction,
  checkUsernameAvailabilityAction,
} from '@/app/login/actions';
import {
  isValidUsername,
  isReservedUsername,
} from '@/lib/username';
import { sanitizeUserFacingError } from '@/lib/error-utils';

interface UsernameClaimFormProps {
  currentUsername?: string;
  onUsernameSet?: (newUsername: string) => void;
}

export function UsernameClaimForm({
  currentUsername,
  onUsernameSet,
}: UsernameClaimFormProps) {
  const [username, setUsername] = useState(currentUsername || '');
  const [isEditing, setIsEditing] = useState(!currentUsername);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<
    'idle' | 'available' | 'taken' | 'invalid' | 'reserved'
  >('idle');
  const [isPending, startTransition] = useTransition();

  const clean = username.trim().toLowerCase();
  const isSameAsCurrent = Boolean(currentUsername && clean === currentUsername.toLowerCase());
  const isValidFormat = isValidUsername(clean);
  const isReserved = isReservedUsername(clean);

  // Debounced live availability check
  useEffect(() => {
    if (!isEditing) return;

    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!clean) {
        if (isMounted) {
          setAvailabilityStatus('idle');
          setSuggestions([]);
        }
        return;
      }

      if (!isValidFormat) {
        if (isMounted) {
          setAvailabilityStatus('invalid');
          setSuggestions([]);
        }
        return;
      }

      if (isReserved) {
        if (isMounted) {
          setAvailabilityStatus('reserved');
        }
        return;
      }

      if (isSameAsCurrent) {
        if (isMounted) {
          setAvailabilityStatus('available');
          setSuggestions([]);
        }
        return;
      }

      if (isMounted) setIsCheckingAvailability(true);
      try {
        const res = await checkUsernameAvailabilityAction(clean);
        if (!isMounted) return;

        if (res.available) {
          setAvailabilityStatus('available');
          setSuggestions([]);
        } else {
          setAvailabilityStatus('taken');
          if (res.suggestions && res.suggestions.length > 0) {
            setSuggestions(res.suggestions);
          }
        }
      } catch {
        if (isMounted) {
          setAvailabilityStatus('idle');
        }
      } finally {
        if (isMounted) {
          setIsCheckingAvailability(false);
        }
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [clean, isEditing, isValidFormat, isReserved, isSameAsCurrent]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isValidFormat) {
      setErrorMessage(
        'Username must be between 3 and 20 characters and contain only letters, numbers, and underscores.'
      );
      return;
    }

    if (isReserved) {
      setErrorMessage('This username is reserved. Please choose another username.');
      return;
    }

    if (isSameAsCurrent) {
      setIsEditing(false);
      return;
    }

    const formData = new FormData();
    formData.set('username', clean);

    startTransition(async () => {
      const res = await setUsernameAction(formData);
      if (res.error) {
        setErrorMessage(sanitizeUserFacingError(res.error, 'Failed to update username. Please try again.'));
        if (res.suggestions && res.suggestions.length > 0) {
          setSuggestions(res.suggestions);
        }
      } else {
        setSuccessMessage(`Username @${clean} successfully set!`);
        setIsEditing(false);
        setSuggestions([]);
        if (onUsernameSet) {
          onUsernameSet(clean);
        }
      }
    });
  };

  const handleApplySuggestion = (sug: string) => {
    setUsername(sug);
    setErrorMessage(null);
  };

  if (!isEditing && currentUsername) {
    return (
      <div className="flex items-center justify-between text-xs py-1">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">Username:</span>
          <span className="font-mono font-medium text-[var(--text-primary)]">
            @{currentUsername}
          </span>
          <span className="text-[10px] text-[var(--income-fg)] bg-[var(--income-bg)] border border-[var(--income-border)] px-1.5 py-0.2 rounded-xs">
            Active
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setSuccessMessage(null);
            setErrorMessage(null);
            setUsername(currentUsername);
          }}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between">
        <label
          htmlFor="claim-username-input"
          className="text-[12px] font-medium text-[var(--text-primary)]"
        >
          {currentUsername ? 'Update Username' : 'Choose a Username'}
        </label>
        {clean.length > 0 && (
          <span
            className={`text-[10px] font-mono ${
              isCheckingAvailability
                ? 'text-[var(--text-muted)]'
                : availabilityStatus === 'available'
                ? 'text-[var(--income-fg)]'
                : 'text-[var(--status-error-fg)]'
            }`}
          >
            {isCheckingAvailability
              ? 'Checking...'
              : availabilityStatus === 'available'
              ? '✓ Available'
              : availabilityStatus === 'reserved'
              ? 'Reserved'
              : availabilityStatus === 'taken'
              ? 'Already taken'
              : '3–20 chars, lowercase a-z, 0-9, _'}
          </span>
        )}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Choose a unique username to sign in to SpendSense with your username instead of email. Lowercase letters, numbers, and underscores only.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="p-2 rounded-xs bg-[var(--status-error-bg)] border border-[var(--expense-border)] text-[var(--status-error-fg)] text-[11px] flex items-center justify-between"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[var(--status-error-fg)] hover:opacity-100 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-2 rounded-xs bg-[var(--income-bg)] border border-[var(--income-border)] text-[var(--income-fg)] text-[11px] flex items-center justify-between"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[var(--income-fg)] hover:opacity-100 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Suggested Alternatives */}
      {suggestions.length > 0 && (
        <div className="p-2 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-1">
          <span className="text-[10px] font-medium text-[var(--text-secondary)] block">
            Suggested available handles:
          </span>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleApplySuggestion(sug)}
                className="text-[11px] font-mono px-2 py-0.5 rounded-xs bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                @{sug}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-1">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-xs font-mono text-[var(--text-muted)]">
            @
          </span>
          <input
            id="claim-username-input"
            name="username"
            type="text"
            required
            autoComplete="username"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full h-8 pl-7 pr-3 text-xs font-mono rounded-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] transition-all lowercase"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !isValidFormat || isReserved || (availabilityStatus === 'taken' && !isSameAsCurrent)}
          className="h-8 px-3 rounded-xs bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-xs font-medium hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>

        {currentUsername && (
          <button
            type="button"
            onClick={() => {
              setUsername(currentUsername);
              setIsEditing(false);
              setErrorMessage(null);
              setSuggestions([]);
            }}
            className="h-8 px-2.5 rounded-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
