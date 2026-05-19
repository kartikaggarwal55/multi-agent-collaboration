"use client";

import { useEffect, useState } from "react";

interface ChatCoachmarkProps {
  /**
   * A stable key per chat type, e.g. "group-chat" or "personal-chat".
   * Used so the coachmark only appears once per category per browser.
   */
  storageKey: string;
  title: string;
  body: string;
}

const SparklesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * A subtle, dismissable hint that appears once on a user's first visit
 * to a chat context. Anchored near the composer so the explanation lines
 * up with the action it's describing.
 */
export function ChatCoachmark({ storageKey, title, body }: ChatCoachmarkProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(`coach:${storageKey}`);
    if (!dismissed) {
      // Tiny delay so the page settles before drawing attention
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`coach:${storageKey}`, "1");
    }
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full mb-3 flex justify-center px-4 z-30 animate-message-enter">
      <div className="pointer-events-auto relative max-w-md w-full rounded-xl bg-card/95 backdrop-blur border border-primary/30 shadow-lg shadow-black/30 px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
          <SparklesIcon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{body}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 -m-1"
          aria-label="Dismiss tip"
        >
          <XIcon />
        </button>
        {/* Pointer down */}
        <span
          aria-hidden
          className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 rotate-45 bg-card/95 border-r border-b border-primary/30"
        />
      </div>
    </div>
  );
}
