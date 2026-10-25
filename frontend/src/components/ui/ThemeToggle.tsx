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
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
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
      className={`inline-flex items-center p-0.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-medium shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
          theme === "light"
            ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span
          className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
          aria-hidden="true"
        />
        <span>Light (Warm Paper)</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
          theme === "dark"
            ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span
          className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"
          aria-hidden="true"
        />
        <span>Dark (Obsidian)</span>
      </button>
    </div>
  );
}
