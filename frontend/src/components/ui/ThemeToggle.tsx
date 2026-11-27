"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

function getSnapshot(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className = "", compact = false }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = (targetTheme: "light" | "dark") => {
    if (targetTheme === "dark") {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        // ignore storage errors
      }
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      try {
        localStorage.setItem("theme", "light");
      } catch {
        // ignore storage errors
      }
    }
  };

  return (
    <div
      role="group"
      aria-label="Appearance & Theme selection"
      className={`${
        compact ? "inline-grid shrink-0" : "grid w-full min-w-0"
      } grid-cols-2 items-stretch p-0.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] ${
        compact ? "text-[11px]" : "text-xs"
      } font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={`flex min-w-0 ${
          compact ? "min-h-7 px-2 py-1" : "min-h-9 px-2 py-1.5"
        } items-center justify-center gap-1.5 rounded-[3px] text-center transition-all cursor-pointer whitespace-nowrap ${
          theme === "light"
            ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span
          className="w-2 h-2 rounded-full bg-[var(--brand-copper)] shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">
          {compact ? "Paper" : "Light (Warm Paper)"}
        </span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`flex min-w-0 ${
          compact ? "min-h-7 px-2 py-1" : "min-h-9 px-2 py-1.5"
        } items-center justify-center gap-1.5 rounded-[3px] text-center transition-all cursor-pointer whitespace-nowrap ${
          theme === "dark"
            ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span
          className="w-2 h-2 rounded-full bg-[var(--brand-evergreen-fg)] shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">
          {compact ? "Obsidian" : "Dark (Obsidian)"}
        </span>
      </button>
    </div>
  );
}
