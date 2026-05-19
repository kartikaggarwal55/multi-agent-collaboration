"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface WelcomeFlowProps {
  hasGroups: boolean;
  userFirstName?: string;
  onCreateGroup: () => void;
  onJoinWithLink: () => void;
  onDismiss: () => void;
  variant?: "inline" | "overlay";
}

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
  </svg>
);

const BoltIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
  </svg>
);

const VoiceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 18v3" />
  </svg>
);

/**
 * Animated SVG that teaches the unique mental model of the product:
 * humans talk privately to their own AI; the AIs coordinate with each other.
 */
function ConceptDiagram() {
  return (
    <div className="relative w-full max-w-2xl mx-auto select-none">
      <svg
        viewBox="0 0 640 280"
        className="w-full h-auto"
        aria-label="Diagram: two people each have a private AI; the two AIs coordinate"
      >
        <defs>
          <linearGradient id="emberFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.75 0.14 55)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.75 0.14 55)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.75 0.14 55)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.75 0.14 55)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="oklch(0.75 0.14 55)" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {/* Background hairlines (blueprint feel) */}
        <g stroke="currentColor" className="text-border" strokeWidth="0.5" opacity="0.35">
          <line x1="0" y1="70" x2="640" y2="70" strokeDasharray="2 6" />
          <line x1="0" y1="210" x2="640" y2="210" strokeDasharray="2 6" />
        </g>

        {/* You → Your AI (top row) */}
        <g>
          <text x="40" y="55" className="font-serif" fill="currentColor" fontSize="11" letterSpacing="0.18em" opacity="0.55">YOU</text>
          <circle cx="70" cy="80" r="26" fill="oklch(0.16 0.012 250)" stroke="oklch(0.75 0.14 55)" strokeWidth="1.5" />
          <text x="70" y="86" textAnchor="middle" className="font-serif italic" fill="currentColor" fontSize="22">y</text>

          {/* private line: human → assistant */}
          <line x1="100" y1="80" x2="280" y2="80" stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="1 5" />
          <text x="190" y="72" textAnchor="middle" fill="currentColor" className="text-muted-foreground" fontSize="9" letterSpacing="0.14em" opacity="0.7">PRIVATE</text>

          {/* Your AI */}
          <circle cx="310" cy="80" r="34" fill="url(#nodeGlow)" />
          <circle cx="310" cy="80" r="22" fill="oklch(0.22 0.015 250)" stroke="oklch(0.75 0.14 55)" strokeWidth="1.2" />
          <text x="310" y="84" textAnchor="middle" fill="oklch(0.75 0.14 55)" fontSize="10" fontWeight="600" letterSpacing="0.1em">AI</text>
          <text x="360" y="55" className="font-serif italic" fill="currentColor" fontSize="14" opacity="0.85">your assistant</text>
        </g>

        {/* Friend → Friend's AI (bottom row) */}
        <g>
          <text x="40" y="195" className="font-serif" fill="currentColor" fontSize="11" letterSpacing="0.18em" opacity="0.55">FRIEND</text>
          <circle cx="70" cy="220" r="26" fill="oklch(0.16 0.012 250)" stroke="oklch(0.65 0.12 200)" strokeWidth="1.5" />
          <text x="70" y="226" textAnchor="middle" className="font-serif italic" fill="currentColor" fontSize="22">f</text>

          <line x1="100" y1="220" x2="280" y2="220" stroke="currentColor" className="text-muted-foreground" strokeWidth="1" strokeDasharray="1 5" />
          <text x="190" y="212" textAnchor="middle" fill="currentColor" className="text-muted-foreground" fontSize="9" letterSpacing="0.14em" opacity="0.7">PRIVATE</text>

          <circle cx="310" cy="220" r="34" fill="url(#nodeGlow)" opacity="0.6" />
          <circle cx="310" cy="220" r="22" fill="oklch(0.22 0.015 250)" stroke="oklch(0.65 0.12 200)" strokeWidth="1.2" />
          <text x="310" y="224" textAnchor="middle" fill="oklch(0.65 0.12 200)" fontSize="10" fontWeight="600" letterSpacing="0.1em">AI</text>
          <text x="360" y="195" className="font-serif italic" fill="currentColor" fontSize="14" opacity="0.85">their assistant</text>
        </g>

        {/* Coordination channel (AI ↔ AI) */}
        <g>
          <path
            d="M 332 100 C 420 130, 420 170, 332 200"
            fill="none"
            stroke="url(#emberFade)"
            strokeWidth="1.5"
          />
          {/* Animated particles flowing along channel */}
          <circle r="2.5" fill="oklch(0.75 0.14 55)">
            <animateMotion dur="3.2s" repeatCount="indefinite" path="M 332 100 C 420 130, 420 170, 332 200" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="3.2s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="oklch(0.75 0.14 55)" opacity="0.7">
            <animateMotion dur="3.2s" begin="1.1s" repeatCount="indefinite" path="M 332 200 C 420 170, 420 130, 332 100" />
            <animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.15;0.85;1" dur="3.2s" begin="1.1s" repeatCount="indefinite" />
          </circle>
          <text
            x="475"
            y="148"
            className="font-serif italic"
            fill="oklch(0.75 0.14 55)"
            fontSize="14"
            opacity="0.95"
          >
            assistants
          </text>
          <text
            x="475"
            y="166"
            className="font-serif italic"
            fill="oklch(0.75 0.14 55)"
            fontSize="14"
            opacity="0.95"
          >
            coordinate
          </text>
          <text
            x="475"
            y="184"
            fill="currentColor"
            fontSize="10"
            letterSpacing="0.14em"
            opacity="0.55"
          >
            IN PARALLEL
          </text>
        </g>

        {/* small marginalia */}
        <text x="20" y="270" fill="currentColor" fontSize="9" letterSpacing="0.18em" opacity="0.35">
          FIG. 01 — HOW A GROUP WORKS
        </text>
      </svg>
    </div>
  );
}

interface StepCardProps {
  index: string;
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void; variant?: "default" | "secondary" | "ghost" }[];
  illustration?: React.ReactNode;
}

function StepCard({ index, title, body, cta, illustration }: StepCardProps) {
  return (
    <div className="group relative p-6 rounded-2xl bg-card/60 border border-border/60 hover:border-primary/30 transition-all duration-300 card-hover">
      <div className="flex items-start gap-6">
        <div className="font-serif text-5xl leading-none text-primary/80 tabular-nums shrink-0 select-none">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-2xl tracking-tight mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{body}</p>
          {illustration && <div className="mb-4">{illustration}</div>}
          {cta && cta.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {cta.map((c) => (
                <Button
                  key={c.label}
                  variant={c.variant ?? "secondary"}
                  size="sm"
                  onClick={c.onClick}
                  className="h-9"
                >
                  {c.label}
                  <ArrowRightIcon />
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sample dialogue showing what a user types vs. what their assistant says in-group.
 * Helps demystify "type as if you're talking to your assistant".
 */
function DialogueExample() {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] tracking-wider uppercase bg-muted/60 text-muted-foreground border border-border/60">
          You type
        </span>
        <p className="text-foreground/90">
          <span className="font-serif italic text-muted-foreground">"</span>
          I&apos;m free tuesday or thursday after 6pm. prefer somewhere quiet.
          <span className="font-serif italic text-muted-foreground">"</span>
        </p>
      </div>
      <div className="h-px bg-border/60" />
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] tracking-wider uppercase border border-primary/30 text-primary bg-primary/5">
          Your AI says
        </span>
        <p className="text-foreground/90">
          Kartik is available <span className="text-primary">Tue or Thu after 6pm</span>. He&apos;d prefer a quieter spot — want me to suggest a few?
        </p>
      </div>
    </div>
  );
}

export function WelcomeFlow({
  hasGroups,
  userFirstName,
  onCreateGroup,
  onJoinWithLink,
  onDismiss,
  variant = "inline",
}: WelcomeFlowProps) {
  const router = useRouter();
  const greeting = userFirstName ? `Hello, ${userFirstName}.` : "Welcome.";

  const content = (
    <div className="relative">
      {/* Editorial header */}
      <header className="text-center pb-10 pt-2">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
          <span className="h-px w-8 bg-border" />
          A short guide
          <span className="h-px w-8 bg-border" />
        </div>
        <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
          {greeting}
          <br />
          <span className="text-muted-foreground italic">Meet the room where</span>
          <br />
          <span className="text-primary italic">your AI does the talking.</span>
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-muted-foreground leading-relaxed">
          Every person in the group has their own assistant. You speak to yours, theirs speaks for them, and the two coordinate in the background — so plans get made faster, without anyone repeating themselves.
        </p>
      </header>

      {/* Concept diagram */}
      <section className="px-2 md:px-6 py-8 rounded-3xl bg-gradient-to-b from-card/40 via-background/0 to-background/0 border border-border/40 mb-10">
        <ConceptDiagram />
      </section>

      {/* Steps */}
      <section className="space-y-4 mb-12">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-serif text-2xl tracking-tight">How to get going</h2>
          <span className="section-label">3 STEPS · ~2 MIN</span>
        </div>

        <StepCard
          index="01"
          title="Teach your assistant"
          body="Open Personal and have a quick chat. Tell it your preferences, the way you'd brief a new EA. Anything you say sticks — your AI will remember next time."
          cta={[
            { label: "Open Personal", onClick: () => router.push("/me/assistant"), variant: "default" },
          ]}
        />

        <StepCard
          index="02"
          title="Start a room, or join one"
          body="Create a group to plan something. Share the link with friends — whoever joins gets their own assistant. No invites, no roles, just a link."
          cta={[
            { label: "Create a group", onClick: onCreateGroup, variant: "default" },
            { label: "I have a link", onClick: onJoinWithLink, variant: "ghost" },
          ]}
        />

        <StepCard
          index="03"
          title="Speak naturally"
          body="In the group, type as if you're texting your own assistant. It listens to you alone, then speaks on your behalf to the others."
          illustration={<DialogueExample />}
        />
      </section>

      {/* Principles */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
        {[
          { icon: <ShieldIcon />, title: "Privacy by default", body: "Personal context stays with your AI. Only what's relevant reaches the group." },
          { icon: <BoltIcon />, title: "Faster together", body: "Assistants coordinate in parallel. You don't wait for replies — they happen." },
          { icon: <VoiceIcon />, title: "Voice when you want", body: "Tap the mic in Personal. Talk to your AI like you'd dictate a note." },
        ].map((p) => (
          <div
            key={p.title}
            className="p-5 rounded-xl bg-card/40 border border-border/40 hover:bg-card/60 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2 text-primary">
              {p.icon}
              <span className="font-medium text-sm text-foreground">{p.title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
          </div>
        ))}
      </section>

      {/* Footer / dismiss */}
      <div className="flex items-center justify-between pt-6 border-t border-border/40">
        <p className="text-xs text-muted-foreground italic font-serif">
          You can revisit this guide anytime from the <span className="not-italic">?</span> button.
        </p>
        <Button
          onClick={onDismiss}
          variant="default"
          size="default"
          className="h-10 px-5 glow-ember"
        >
          {hasGroups ? "Back to my groups" : "Got it — let's go"}
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );

  // Close on Escape when the guide is shown as an overlay
  useEffect(() => {
    if (variant !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onDismiss]);

  if (variant === "overlay") {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md overflow-y-auto">
        {/* Fixed-to-viewport close button — always reachable while scrolling */}
        <button
          onClick={onDismiss}
          aria-label="Close guide (Esc)"
          title="Close guide (Esc)"
          className="fixed top-4 right-4 z-[60] w-12 h-12 flex items-center justify-center rounded-full bg-card/90 backdrop-blur-md border border-border hover:border-primary/40 hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-lg shadow-black/30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="min-h-screen px-6 py-12">
          <div className="max-w-3xl mx-auto">{content}</div>
        </div>
      </div>
    );
  }

  return <div className="max-w-3xl mx-auto">{content}</div>;
}

/**
 * Floating "How does this work?" button — persistent help affordance.
 * Sits bottom-right on /groups and group chat pages.
 */
interface HelpFabProps {
  onClick: () => void;
  label?: string;
}

export function HelpFab({ onClick, label = "How it works" }: HelpFabProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-40 group flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-card/90 backdrop-blur border border-border hover:border-primary/40 shadow-lg shadow-black/20 transition-all cursor-pointer"
      aria-label="Open guide on how this product works"
    >
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary font-serif italic text-sm leading-none pb-0.5">
        ?
      </span>
      <span className="text-xs font-medium tracking-wide text-foreground/85 group-hover:text-foreground transition-colors">
        {label}
      </span>
    </button>
  );
}
