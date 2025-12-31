"use client";

import { useState, useEffect } from "react";

// Sun icon - clean geometric design
const SunIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="transition-transform duration-300"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

// Moon icon - elegant crescent
const MoonIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="transition-transform duration-300"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  // Read theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    if (stored) {
      setTheme(stored);
      document.documentElement.classList.toggle("light", stored === "light");
    } else {
      // Check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.classList.toggle("light", initial === "light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("light", newTheme === "light");
  };

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground"
        aria-label="Toggle theme"
      >
        <div className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="group relative h-8 w-8 flex items-center justify-center rounded-md
                 text-muted-foreground hover:text-foreground
                 hover:bg-accent/50 active:scale-95
                 transition-all duration-200 ease-out"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {/* Icon container with rotation animation */}
      <div
        className={`transform transition-all duration-500 ease-out
                    ${theme === "dark" ? "rotate-0" : "rotate-[360deg]"}`}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </div>

      {/* Subtle glow on hover */}
      <div
        className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100
                   transition-opacity duration-300 pointer-events-none"
        style={{
          background:
            theme === "dark"
              ? "radial-gradient(circle at center, oklch(0.75 0.14 55 / 0.1), transparent 70%)"
              : "radial-gradient(circle at center, oklch(0.55 0.14 55 / 0.15), transparent 70%)",
        }}
      />
    </button>
  );
}
