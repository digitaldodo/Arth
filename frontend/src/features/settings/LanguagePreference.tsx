'use client';

import { useSpendSenseLocale } from '@/lib/i18n/locale';
import { getMessage, type SpendSenseLocale } from '@/lib/i18n/messages';

export function LanguagePreference({ userId }: { userId?: string }) {
  const { locale, updateLocale } = useSpendSenseLocale(userId);
  return <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5" aria-labelledby="language-preference-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 id="language-preference-title" className="text-sm font-semibold text-[var(--text-primary)]">{getMessage('settings.language.title', locale)}</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{getMessage('settings.language.description', locale)}</p>
      </div>
      <label className="sr-only" htmlFor="spendsense-language">{getMessage('settings.language.title', locale)}</label>
      <select
        id="spendsense-language"
        value={locale}
        onChange={(event) => updateLocale(event.target.value as SpendSenseLocale)}
        className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action-primary-bg)]"
      >
        <option value="en-IN">{getMessage('settings.language.english', locale)}</option>
        <option value="hi-IN">{getMessage('settings.language.hinglish', locale)}</option>
      </select>
    </div>
  </section>;
}
