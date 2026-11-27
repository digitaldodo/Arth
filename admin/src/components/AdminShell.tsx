'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminIdentityDTO } from '@arth/contracts';
import { ArthLogo } from '@/components/brand/ArthLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RoleBadge } from '@/components/AdminBadges';
import { adminClient } from '@/lib/admin-api';

interface NavItem {
  href: string;
  label: string;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/users', label: 'User Diagnostics' },
  { href: '/capture', label: 'Transaction Capture' },
  { href: '/system', label: 'System & Sync' },
  { href: '/releases', label: 'Releases' },
  { href: '/audit', label: 'Audit Logs', ownerOnly: true },
  { href: '/access', label: 'Admin Access', ownerOnly: true },
  { href: '/account', label: 'Account Security' },
];

export function AdminShell({
  identity,
  title,
  subtitle,
  children,
}: {
  identity: AdminIdentityDTO;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || (identity.isOwner && identity.role === 'OWNER_ADMIN'),
  );

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await adminClient.logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-xs font-semibold md:hidden"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <ArthLogo variant="symbol" className="h-7 w-7" title="SpendSense Admin" />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold tracking-tight">SpendSense</span>
                  <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Admin
                  </span>
                </div>
                <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:block">
                  Operations & Governance
                </span>
              </div>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] px-2.5 py-1 sm:flex">
              <span className="text-xs font-medium text-[var(--text-primary)]">{identity.fullName}</span>
              <RoleBadge role={identity.role} isOwner={identity.isOwner} />
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile admin navigation"
            className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 md:hidden"
          >
            <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] px-3 py-2">
              <span className="text-xs font-medium">{identity.fullName}</span>
              <RoleBadge role={identity.role} isOwner={identity.isOwner} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {visibleNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content Layout */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav aria-label="Admin sidebar navigation" className="sticky top-20 flex flex-col gap-1">
            {visibleNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.ownerOnly && (
                    <span className="text-[10px] uppercase tracking-wider opacity-70">Owner</span>
                  )}
                </Link>
              );
            })}
            <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-secondary)]">Privacy Boundary Active</p>
              <p className="mt-1">
                Private ledgers, bank statements, and raw SMS content are structurally isolated and inaccessible from Admin routes.
              </p>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-6 border-b border-[var(--border-hairline)] pb-4">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
