// CHANGED: Navigation component with updated design
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export function ChatNav() {
  const pathname = usePathname();
  const isPersonal = pathname === "/me/assistant";

  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50">
      <Link
        href="/"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
          !isPersonal
            ? "bg-card text-foreground shadow-sm border border-border/50"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <UsersIcon />
        <span>Group</span>
      </Link>
      <Link
        href="/me/assistant"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
          isPersonal
            ? "bg-card text-foreground shadow-sm border border-border/50"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <UserIcon />
        <span>Personal</span>
      </Link>
    </div>
  );
}
