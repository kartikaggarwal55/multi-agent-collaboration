"use client";

import { LockKeyhole, MessageCircle, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WelcomeFlowProps {
  userFirstName?: string;
  onCreateGroup: () => void;
  onJoinWithLink: () => void;
  onDismiss: () => void;
}

const welcomePoints = [
  {
    icon: LockKeyhole,
    title: "Personal stays private",
    body: "Messages in Personal are between you and your assistant.",
  },
  {
    icon: Users,
    title: "Group messages are shared",
    body: "Anything you type in a group is visible to everyone in that room.",
  },
  {
    icon: Sparkles,
    title: "Assistants help the room",
    body: "They organize the conversation, surface options, and keep the shared plan up to date.",
  },
];

export function WelcomeFlow({
  userFirstName,
  onCreateGroup,
  onJoinWithLink,
  onDismiss,
}: WelcomeFlowProps) {
  return (
    <section
      aria-labelledby="welcome-heading"
      className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm sm:p-8"
    >
      <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        <MessageCircle aria-hidden="true" className="size-5" />
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        Welcome
      </p>
      <h1 id="welcome-heading" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {userFirstName ? `Hi ${userFirstName}, here’s how conversations work.` : "Here’s how conversations work."}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Use Personal for private context and Groups for conversations everyone in the room can see.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {welcomePoints.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border/50 bg-background/45 p-4">
            <Icon aria-hidden="true" className="size-4 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border/50 pt-5">
        <Button onClick={onCreateGroup}>Create a group</Button>
        <Button variant="secondary" onClick={onJoinWithLink}>Join with a link</Button>
        <Button variant="ghost" onClick={onDismiss} className="sm:ml-auto">Not now</Button>
      </div>
    </section>
  );
}
