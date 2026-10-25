'use client';

import React, { useState, useTransition } from 'react';
import { setUsernameAction } from '@/app/login/actions';

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
  const [isPending, startTransition] = useTransition();

  const isValidFormat = /^[a-zA-Z0-9_-]{3,30}$/.test(username);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isValidFormat) {
      setErrorMessage(
        'Username must be between 3 and 30 characters and contain only letters, numbers, underscores, or hyphens.'
      );
      return;
    }

    const formData = new FormData();
    formData.set('username', username.trim().toLowerCase());

    startTransition(async () => {
      const res = await setUsernameAction(formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        const cleaned = username.trim().toLowerCase();
        setSuccessMessage(`Username @${cleaned} successfully set!`);
        setIsEditing(false);
        if (onUsernameSet) {
          onUsernameSet(cleaned);
        }
      }
    });
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
        {username.length > 0 && (
          <span
            className={`text-[10px] font-mono ${
              isValidFormat
                ? 'text-[var(--income-fg)]'
                : 'text-[var(--status-error-fg)]'
            }`}
          >
            {isValidFormat ? '✓ Format valid' : '3-30 chars, alphanumeric, _ -'}
          </span>
        )}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Choose a unique username to sign in to Arth with your username instead of email.
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
            className="w-full h-8 pl-7 pr-3 text-xs font-mono rounded-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !isValidFormat}
          className="h-8 px-3 rounded-xs bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] text-xs font-medium hover:bg-[var(--action-primary-hover)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isPending ? 'Saving...' : currentUsername ? 'Update' : 'Claim'}
        </button>

        {currentUsername && (
          <button
            type="button"
            onClick={() => {
              setUsername(currentUsername);
              setIsEditing(false);
              setErrorMessage(null);
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
