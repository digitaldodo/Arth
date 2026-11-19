import type { Metadata } from 'next';
import Link from 'next/link';
import { ArthLogo } from '@/components/brand/ArthLogo';

export const metadata: Metadata = {
  title: 'Privacy | Arth',
  description: 'How Arth handles account, financial, and on-device information.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-6 py-8 text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-5">
          <Link href="/" aria-label="Arth home"><ArthLogo variant="full" className="h-6 w-auto" /></Link>
          <Link href="/download" className="text-sm text-[var(--text-secondary)] underline underline-offset-4">Android download</Link>
        </header>

        <section className="space-y-3">
          <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)]">Arth · Privacy information</p>
          <h1 className="text-3xl font-semibold tracking-tight">Your financial information in Arth</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">This page describes the information used by the Arth web application, installable PWA, and direct Android application. The Android release page links here so you can review the product’s data handling before installing.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Account and financial records</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">When you sign in and use cloud sync, Arth processes account information and the financial records you choose to enter or import. The service stores synced account data in its Supabase database and applies authenticated access controls. The native Android app also keeps app-private local data for offline access and sync.</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Do not enter information you do not want associated with your account. Use the account and data controls in Arth to manage your records.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Direct Android package</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">The APK linked from this site does not declare READ_SMS or RECEIVE_SMS and cannot read the SMS inbox. Android may ask you to allow installation from your browser. Arth does not install updates silently; Android shows its system installer for each update.</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">The app uses network access for account and data sync, and biometric access only when you choose to use the app lock. Updates installed over the existing app with the same signing identity keep its app-private data. Uninstalling the app removes that local copy.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Web app and PWA</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">The website and installable PWA remain separate ways to use Arth. The web app may keep a local offline copy in your browser storage so that supported records remain available without a connection. Clearing browser data removes that local copy.</p>
        </section>

        <footer className="border-t border-[var(--border-hairline)] pt-5 text-xs leading-5 text-[var(--text-muted)]">
          This page summarizes the current application behavior. For questions about your account, sign in and use Arth’s account controls. <Link href="/download" className="underline underline-offset-4">Return to Android download</Link>.
        </footer>
      </div>
    </main>
  );
}
