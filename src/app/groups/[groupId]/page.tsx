"use client";

import { useState, useEffect, useRef, use } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CanonicalState, AssistantStatus, MessageBlock, DetailItem } from "@/lib/types";
import { ChatNav } from "@/components/chat-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Icons
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6V12L16 14" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const UserIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const BotIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const MailIconSmall = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// Status icons for turn indicator
const BrainIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ---- Block Renderer Components ----

interface MentionContext {
  currentUserName: string | null | undefined;
  participants: Participant[];
}

function getStatusColor(tag?: string, status?: string): string {
  const val = (tag || status || "").toLowerCase();
  if (val.includes("free") || val.includes("available") || val.includes("open") || val.includes("success") || val.includes("confirmed"))
    return "bg-emerald-500";
  if (val.includes("busy") || val.includes("conflict") || val.includes("error") || val.includes("closed"))
    return "bg-red-400";
  if (val.includes("partial") || val.includes("warning") || val.includes("tentative"))
    return "bg-amber-400";
  return "bg-muted-foreground/40";
}


function getTagStyle(tag: string): { dot: string; bg: string; text: string } {
  const val = tag.toLowerCase();
  // Highlight tags — primary accent
  if (val.includes("recommend") || val.includes("top") || val.includes("best") || val.includes("pick") || val.includes("favorite") || val.includes("popular"))
    return { dot: "bg-primary", bg: "bg-primary/15", text: "text-primary" };
  // Default — muted
  return { dot: "bg-muted-foreground/40", bg: "bg-muted/60", text: "text-muted-foreground" };
}

function TagBadge({ tag }: { tag: string }) {
  const style = getTagStyle(tag);
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {tag}
    </span>
  );
}

function TextBlockComponent({ block, mentions }: { block: { type: "text"; content: string; priority?: string }; mentions: MentionContext }) {
  const isHigh = block.priority === "high";
  return (
    <div className={isHigh ? "text-[15px] text-foreground" : "text-[14px] text-foreground/85"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}</strong>,
          em: ({ children }) => <em>{renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          ),
          h3: ({ children }) => (
            <h4 className="text-[15px] font-semibold mb-1.5 mt-2 first:mt-0 text-foreground">
              {renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}
            </h4>
          ),
          ul: ({ children }) => <ul className="list-none pl-0 space-y-1 my-1">{children}</ul>,
          li: ({ children }) => (
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-[7px] shrink-0" />
              <span>{renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}</span>
            </li>
          ),
        }}
      >
        {block.content}
      </ReactMarkdown>
    </div>
  );
}

function OptionsBlockComponent({ block }: { block: { type: "options"; label: string; columns?: string[]; items?: DetailItem[]; recommended?: number; layout?: string } }) {
  const [showAll, setShowAll] = useState(false);
  const items = block.items || [];
  const columns = block.columns || Object.keys(items[0]?.fields || {});
  const displayItems = showAll ? items : items.slice(0, 4);
  const hasMore = items.length > 4;

  return (
    <div className="mt-1">
      <div className="text-[13px] font-semibold text-foreground/70 uppercase tracking-wider mb-1.5">{block.label}</div>
      <div className="space-y-1.5">
        {displayItems.map((item, i) => {
          const isRecommended = block.recommended === i;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${
                isRecommended ? "border-primary/40 bg-primary/8" : "border-white/12 bg-muted/50 hover:bg-muted/70"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-medium text-foreground">{item.title}</span>
                  {item.tag && <TagBadge tag={item.tag} />}
                </div>
                {item.subtitle && (
                  <div className="text-[12px] text-muted-foreground mt-0.5">{item.subtitle}</div>
                )}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {columns.map((col) => {
                    const val = item.fields?.[col];
                    if (!val) return null;
                    return (
                      <span key={col} className="text-[13px] text-foreground/75">
                        <span className="text-muted-foreground capitalize">{col.replace(/_/g, ' ')}:</span> {val}
                      </span>
                    );
                  })}
                </div>
              </div>
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors"
                  title="Open link"
                >
                  <ExternalLinkIcon />
                </a>
              )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[12px] text-primary hover:text-primary/80 mt-1.5 flex items-center gap-1"
        >
          {showAll ? "Show less" : `Show ${items.length - 4} more`}
          <ChevronIcon expanded={showAll} />
        </button>
      )}
    </div>
  );
}

function ComparisonBlockComponent({ block }: { block: { type: "comparison"; label: string; columns?: string[]; items?: DetailItem[]; recommended?: number } }) {
  const items = block.items || [];
  const columns = block.columns || Object.keys(items[0]?.fields || {});

  return (
    <div className="mt-1">
      <div className="text-[13px] font-semibold text-foreground/70 uppercase tracking-wider mb-1.5">{block.label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              <th className="text-left px-2.5 py-1.5 font-semibold text-foreground/80 border-b border-border/50" />
              {columns.map((col) => (
                <th key={col} className="text-left px-2.5 py-1.5 font-semibold text-foreground/80 border-b border-border/50 capitalize">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const isRecommended = block.recommended === i;
              return (
                <tr key={i} className={isRecommended ? "bg-primary/5" : "hover:bg-muted/30"}>
                  <td className="px-2.5 py-2 font-medium text-foreground border-b border-white/12">
                    <div className="flex items-center gap-2">
                      {item.title}
                      {item.tag && <TagBadge tag={item.tag} />}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                          <ExternalLinkIcon />
                        </a>
                      )}
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-2.5 py-2 text-foreground/75 border-b border-white/12">
                      {item.fields?.[col] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineBlockComponent({ block }: { block: { type: "timeline"; label: string; items?: DetailItem[] } }) {
  const items = block.items || [];
  return (
    <div className="mt-1">
      <div className="text-[13px] font-semibold text-foreground/70 uppercase tracking-wider mb-1.5">{block.label}</div>
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 py-1.5">
            <div className="mt-[5px] shrink-0">
              <div className={`w-2 h-2 rounded-full ${getStatusColor(item.tag, item.fields?.status)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-foreground">{item.title}</span>
                {item.tag && <TagBadge tag={item.tag} />}
              </div>
              <div className="flex items-center gap-3 text-[12px] text-foreground/60 mt-0.5">
                {Object.entries(item.fields || {})
                  .filter(([k]) => k !== "status")
                  .map(([k, v]) => (
                    <span key={k}>{v}</span>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccordionBlockComponent({ block, mentions }: { block: { type: "accordion"; label: string; content: string; defaultOpen?: boolean }; mentions: MentionContext }) {
  const [open, setOpen] = useState(block.defaultOpen || false);
  return (
    <div className="mt-1 border border-white/12 rounded-lg overflow-hidden bg-muted/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium text-foreground/80 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {block.label}
        </span>
        <ChevronIcon expanded={open} />
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-white/12 text-[13px] text-foreground/75">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{renderMentionsInChildren(children, mentions.currentUserName, mentions.participants)}</p>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  {children}
                </a>
              ),
            }}
          >
            {block.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}


function BlockRenderer({ block, mentions }: { block: MessageBlock; mentions: MentionContext }) {
  switch (block.type) {
    case "text": return <TextBlockComponent block={block} mentions={mentions} />;
    case "options": return <OptionsBlockComponent block={block} />;
    case "comparison": return <ComparisonBlockComponent block={block} />;
    case "timeline": return <TimelineBlockComponent block={block} />;
    case "accordion": return <AccordionBlockComponent block={block} mentions={mentions} />;
    default: return null;
  }
}

// ---- End Block Renderer Components ----

interface Participant {
  id: string;
  kind: "human" | "assistant";
  displayName: string;
  image?: string;
  ownerHumanId?: string;
  hasCalendar?: boolean;
  hasGmail?: boolean;
}

// Parse and style @mentions in message content
function renderMentions(
  content: string,
  currentUserName: string | null | undefined,
  participants: Participant[]
): React.ReactNode[] {
  // Build list of all participant names including first names (sorted by length descending for longest-match-first)
  // This allows matching @FirstName when the system knows the full name
  const participantNames: { name: string; displayName: string }[] = [];
  for (const p of participants) {
    // Add full display name
    participantNames.push({ name: p.displayName, displayName: p.displayName });
    // Add first name if it's different from display name (for human participants)
    const firstName = p.displayName.split(' ')[0];
    if (firstName && firstName !== p.displayName && !p.displayName.includes("'")) {
      participantNames.push({ name: firstName, displayName: p.displayName });
    }
  }
  // Sort by name length descending for longest-match-first
  participantNames.sort((a, b) => b.name.length - a.name.length);

  const userFirstName = currentUserName?.split(' ')[0] || '';
  const userFullName = currentUserName || '';

  const parts: React.ReactNode[] = [];
  let remaining = content;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Find the next @ symbol
    const atIndex = remaining.indexOf('@');

    if (atIndex === -1) {
      // No more @, add remaining text
      parts.push(remaining);
      break;
    }

    // Add text before the @
    if (atIndex > 0) {
      parts.push(remaining.slice(0, atIndex));
    }

    // Check if text after @ matches any participant name (case-insensitive)
    const afterAt = remaining.slice(atIndex + 1);
    let matched = false;

    for (const participant of participantNames) {
      // Check if afterAt starts with this name (case-insensitive)
      if (afterAt.toLowerCase().startsWith(participant.name.toLowerCase())) {
        // Make sure it's a word boundary (not followed by alphanumeric)
        const nextChar = afterAt[participant.name.length];
        if (!nextChar || !/\w/.test(nextChar)) {
          const mentionText = '@' + afterAt.slice(0, participant.name.length);

          // Check if this is the current user (not their assistant)
          // Use displayName to check against current user's full name
          const isCurrentUser = (
            participant.displayName.toLowerCase() === userFullName.toLowerCase() ||
            participant.displayName.toLowerCase() === userFirstName.toLowerCase()
          ) && !participant.displayName.toLowerCase().includes("'");

          parts.push(
            <span
              key={keyIndex++}
              className={`font-semibold px-1 py-0.5 rounded ${
                isCurrentUser
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-foreground/10 text-foreground/80'
              }`}
            >
              {mentionText}
            </span>
          );

          remaining = afterAt.slice(participant.name.length);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // No participant match, just add the @ and continue
      parts.push('@');
      remaining = afterAt;
    }
  }

  return parts.length > 0 ? parts : [content];
}

// Helper to handle ReactMarkdown children (can be string, element, or array)
function renderMentionsInChildren(
  children: React.ReactNode,
  currentUserName: string | null | undefined,
  participants: Participant[]
): React.ReactNode {
  if (typeof children === 'string') {
    return renderMentions(children, currentUserName, participants);
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{renderMentions(child, currentUserName, participants)}</span>;
      }
      return child;
    });
  }

  return children;
}

interface Message {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  role: "user" | "assistant";
  content: string;
  details?: MessageBlock[];
  citations?: { url: string; title?: string }[];
  createdAt: string;
}

interface GroupData {
  id: string;
  title: string | null;
  participants: Participant[];
  messages: Message[];
  canonicalState: CanonicalState | null;
  createdBy?: { id: string; name: string | null };
}

// Generate consistent colors for participants - Orange, black, white scheme
const PARTICIPANT_COLORS = [
  { bg: "bg-[oklch(0.65_0.15_55)]", text: "text-white", border: "border-[oklch(0.65_0.15_55)]" }, // Orange
  { bg: "bg-[oklch(0.60_0.14_50)]", text: "text-white", border: "border-[oklch(0.60_0.14_50)]" }, // Darker orange
  { bg: "bg-[oklch(0.70_0.16_60)]", text: "text-white", border: "border-[oklch(0.70_0.16_60)]" }, // Lighter orange
  { bg: "bg-[oklch(0.55_0.13_45)]", text: "text-white", border: "border-[oklch(0.55_0.13_45)]" }, // Deep orange
  { bg: "bg-[oklch(0.68_0.15_58)]", text: "text-white", border: "border-[oklch(0.68_0.15_58)]" }, // Warm orange
];

const ASSISTANT_COLORS = [
  { bg: "bg-[oklch(0.25_0.02_55)]", text: "text-[oklch(0.70_0.12_55)]", border: "border-[oklch(0.35_0.03_55)]" },
  { bg: "bg-[oklch(0.25_0.02_50)]", text: "text-[oklch(0.70_0.12_50)]", border: "border-[oklch(0.35_0.03_50)]" },
  { bg: "bg-[oklch(0.25_0.02_60)]", text: "text-[oklch(0.70_0.12_60)]", border: "border-[oklch(0.35_0.03_60)]" },
  { bg: "bg-[oklch(0.25_0.02_45)]", text: "text-[oklch(0.70_0.12_45)]", border: "border-[oklch(0.35_0.03_45)]" },
  { bg: "bg-[oklch(0.25_0.02_58)]", text: "text-[oklch(0.70_0.12_58)]", border: "border-[oklch(0.35_0.03_58)]" },
];

export default function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [currentlyTyping, setCurrentlyTyping] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<AssistantStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const isInitialLoad = useRef(true);
  const [participantColorMap, setParticipantColorMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/join/${groupId}`);
    } else if (status === "authenticated") {
      fetchGroup();
    }
  }, [status, groupId, router]);

  // Smart scroll: only auto-scroll if user is near bottom or on initial load
  useEffect(() => {
    if (isInitialLoad.current || shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? "instant" : "smooth" });
      if (group?.messages && group.messages.length > 0) {
        isInitialLoad.current = false;
      }
    }
  }, [group?.messages]);

  // Track scroll position to determine if user is near bottom
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Consider "near bottom" if within 150px
    shouldAutoScroll.current = distanceFromBottom < 150;
  };

  // Poll for new messages when tab is visible and not actively loading
  useEffect(() => {
    if (status !== "authenticated" || isLoading || isFetching) return;

    const pollInterval = 5000; // 5 seconds
    let timeoutId: NodeJS.Timeout;

    const pollForMessages = async () => {
      // Only poll if document is visible
      if (document.hidden) {
        timeoutId = setTimeout(pollForMessages, pollInterval);
        return;
      }

      try {
        const response = await fetch(`/api/groups/${groupId}`);
        if (response.ok) {
          const data = await response.json();
          const newMessages = data.group?.messages || [];
          const newParticipants = data.group?.participants || [];
          const newActiveStatus = data.group?.activeStatus || null;

          // Update active status from polling (visible to ALL users)
          setActiveStatus(newActiveStatus);

          // Update if messages, participants, or canonical state changed
          setGroup((prev) => {
            if (!prev) return prev;
            const prevMessages = prev.messages || [];
            const prevParticipants = prev.participants || [];

            // Check message count
            if (prevMessages.length !== newMessages.length) {
              return { ...prev, ...data.group };
            }
            // Check last message ID
            if (prevMessages.length > 0 && newMessages.length > 0 &&
                prevMessages[prevMessages.length - 1].id !== newMessages[newMessages.length - 1].id) {
              return { ...prev, ...data.group };
            }
            // Check participant count (new member joined/left)
            if (prevParticipants.length !== newParticipants.length) {
              return { ...prev, ...data.group };
            }
            // Check if any participant's capabilities changed (calendar/gmail connected)
            const prevCaps = prevParticipants.map((p: { id: string; hasCalendar?: boolean; hasGmail?: boolean }) =>
              `${p.id}:${p.hasCalendar}:${p.hasGmail}`).join(',');
            const newCaps = newParticipants.map((p: { id: string; hasCalendar?: boolean; hasGmail?: boolean }) =>
              `${p.id}:${p.hasCalendar}:${p.hasGmail}`).join(',');
            if (prevCaps !== newCaps) {
              return { ...prev, ...data.group };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }

      timeoutId = setTimeout(pollForMessages, pollInterval);
    };

    timeoutId = setTimeout(pollForMessages, pollInterval);

    return () => clearTimeout(timeoutId);
  }, [status, isLoading, isFetching, groupId]);

  // Assign colors to participants
  useEffect(() => {
    if (group?.participants) {
      const humans = group.participants.filter((p) => p.kind === "human");
      const colorMap = new Map<string, number>();
      humans.forEach((h, i) => {
        colorMap.set(h.id, i % PARTICIPANT_COLORS.length);
      });
      setParticipantColorMap(colorMap);
    }
  }, [group?.participants]);

  const fetchGroup = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}`);
      if (!response.ok) {
        const data = await response.json();
        if (data.needsJoin) {
          router.push(`/join/${groupId}`);
          return;
        }
        throw new Error(data.error || "Failed to fetch group");
      }

      const data = await response.json();
      setGroup(data.group);
      // Also set activeStatus if present (for page refresh while assistant is working)
      if (data.group?.activeStatus) {
        setActiveStatus(data.group.activeStatus);
      }
    } catch (err) {
      console.error("Error fetching group:", err);
      setError("Failed to load group");
    } finally {
      setIsFetching(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    // Always scroll to bottom when user sends a message
    shouldAutoScroll.current = true;

    setIsLoading(true);
    setError(null);
    setMessage("");

    // Find the current user's assistant to show as initially typing
    const assistants = group?.participants.filter((p) => p.kind === "assistant") || [];
    const myAssistant = assistants.find((a) => a.ownerHumanId === session?.user?.id);
    if (myAssistant) {
      setCurrentlyTyping(myAssistant.displayName);
    } else if (assistants.length > 0) {
      setCurrentlyTyping(assistants[0].displayName);
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (eventType === "message") {
                  setGroup((prev) => {
                    if (!prev) return prev;
                    const exists = prev.messages.some((m) => m.id === data.id);
                    if (exists) return prev;
                    // Sort by createdAt to handle out-of-order SSE arrivals
                    // Use id as tiebreaker for same-millisecond messages
                    const newMessages = [...prev.messages, data].sort((a, b) => {
                      const timeA = new Date(a.createdAt).getTime() || 0;
                      const timeB = new Date(b.createdAt).getTime() || 0;
                      if (timeA !== timeB) return timeA - timeB;
                      return a.id.localeCompare(b.id); // Stable tiebreaker
                    });
                    return { ...prev, messages: newMessages };
                  });

                  // Update typing indicator
                  if (data.role === "assistant") {
                    const currentIndex = assistants.findIndex(
                      (a) => a.id === data.authorId
                    );
                    const nextAssistant = assistants[(currentIndex + 1) % assistants.length];
                    if (nextAssistant) {
                      setCurrentlyTyping(nextAssistant.displayName);
                    }
                  }
                } else if (eventType === "state") {
                  setGroup((prev) =>
                    prev ? { ...prev, canonicalState: data } : prev
                  );
                } else if (eventType === "status") {
                  setCurrentlyTyping(data.status);
                } else if (eventType === "assistant_status") {
                  setActiveStatus(data);
                } else if (eventType === "error") {
                  setError(data.error);
                } else if (eventType === "done") {
                  if (data.canonicalState) {
                    setGroup((prev) =>
                      prev ? { ...prev, canonicalState: data.canonicalState } : prev
                    );
                  }
                  setCurrentlyTyping(null);
                  setActiveStatus(null);
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to send message");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error(err);
    } finally {
      setIsLoading(false);
      setCurrentlyTyping(null);
      setActiveStatus(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${groupId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteGroup = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete group");
      }

      router.push("/groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isCreator = session?.user?.id && group?.createdBy?.id === session.user.id;

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getParticipantColor = (authorId: string, role: string) => {
    // For assistants, get the owner's color
    const ownerId = authorId.replace("-assistant", "");
    const colorIndex = participantColorMap.get(ownerId) || 0;

    if (role === "assistant" || authorId.includes("-assistant")) {
      return ASSISTANT_COLORS[colorIndex % ASSISTANT_COLORS.length];
    }
    return PARTICIPANT_COLORS[colorIndex % PARTICIPANT_COLORS.length];
  };

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (status === "loading" || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !group) return null;

  const isMyMessage = (authorId: string) => authorId === session.user?.id;

  return (
    <div className="flex h-screen w-full bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col relative overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                <SparklesIcon />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">
                  {group.title || "Collaboration Room"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {group.participants.filter((p) => p.kind === "human").length} participants
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChatNav />
              <Button
                variant="secondary"
                size="sm"
                onClick={copyInviteLink}
                className="gap-2"
              >
                <LinkIcon />
                {copied ? "Copied!" : "Invite"}
              </Button>
              <ThemeToggle />
              {isCreator && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                  title="Delete group"
                >
                  <TrashIcon />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                title="Sign out"
              >
                <LogOutIcon />
              </Button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0" viewportRef={scrollContainerRef} onScroll={handleScroll}>
          <div className="px-6 py-4 space-y-4">
            {group.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="relative">
                  <div className="absolute inset-0 empty-state-glow scale-150" />
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 border border-primary/20 shadow-lg">
                    <SparklesIcon />
                  </div>
                </div>
                <h3 className="text-foreground font-semibold text-lg mb-2">Ready to collaborate</h3>
                <p className="text-muted-foreground text-[15px] max-w-xs leading-relaxed">
                  Send your first message to begin planning together
                </p>
              </div>
            )}

            {group.messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const isMe = isMyMessage(msg.authorId.replace("-assistant", ""));
              // Only right-align if it's the current user's own message (not assistant)
              const alignRight = isUser && isMe;
              const colors = getParticipantColor(msg.authorId, msg.role);
              const participant = group.participants.find((p) => p.id === msg.authorId);

              return (
                <div
                  key={msg.id}
                  className={`animate-message-enter flex ${alignRight ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className={`flex gap-3 max-w-[85%] ${alignRight ? "flex-row-reverse" : ""}`}>
                    <Avatar className={`h-8 w-8 shrink-0 border-2 ${colors.border}`}>
                      {participant?.image ? (
                        <AvatarImage src={participant.image} />
                      ) : null}
                      <AvatarFallback className={`text-xs font-semibold ${colors.bg} ${colors.text}`}>
                        {getInitials(msg.authorName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className={`flex flex-col ${alignRight ? "items-end" : "items-start"}`}>
                      <div className={`flex items-center gap-2 mb-1.5 ${alignRight ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-medium text-foreground/90">{msg.authorName}</span>
                        {msg.role === "assistant" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/50">
                            AI
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>

                      <div
                        className={`rounded-xl px-4 py-3 ${
                          alignRight
                            ? `${colors.bg} ${colors.text} shadow-sm border ${colors.border}`
                            : msg.role === "assistant"
                              ? "bg-card/90 border border-border/50 shadow-sm backdrop-blur-sm message-ai"
                              : "bg-card/80 border border-border/50 shadow-sm backdrop-blur-sm"
                        }`}
                      >
                        {msg.role === "assistant" && Array.isArray(msg.details) && msg.details.length > 0 ? (
                          /* Rich block rendering for messages with structured details */
                          <div className="space-y-2">
                            {msg.details.map((block, i) => (
                              <BlockRenderer key={i} block={block} mentions={{ currentUserName: session.user?.name, participants: group.participants }} />
                            ))}
                          </div>
                        ) : msg.role === "assistant" ? (
                          /* Fallback: existing ReactMarkdown for old messages or text-only */
                          <div className="prose prose-sm prose-invert max-w-none prose-chat">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => (
                                  <p className="text-[15px] mb-2.5 last:mb-0 leading-[1.65] text-foreground/90">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </p>
                                ),
                                h1: ({ children }) => (
                                  <h3 className="text-[16px] font-semibold mb-2 mt-3 first:mt-0 text-foreground">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </h3>
                                ),
                                h2: ({ children }) => (
                                  <h3 className="text-[16px] font-semibold mb-2 mt-3 first:mt-0 text-foreground">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </h3>
                                ),
                                h3: ({ children }) => (
                                  <h4 className="text-[15px] font-semibold mb-2 mt-3 first:mt-0 text-foreground">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </h4>
                                ),
                                h4: ({ children }) => (
                                  <h5 className="text-[14px] font-semibold mb-1.5 mt-2 first:mt-0 text-foreground/90">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </h5>
                                ),
                                ul: ({ children }) => (
                                  <ul className="text-[15px] list-none pl-0 mb-2.5 space-y-2">{children}</ul>
                                ),
                                li: ({ children }) => (
                                  <li className="text-[15px] leading-[1.65] flex items-start gap-2.5 text-foreground/90">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-[9px] shrink-0" />
                                    <span>{renderMentionsInChildren(children, session.user?.name, group.participants)}</span>
                                  </li>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-foreground">
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </strong>
                                ),
                                em: ({ children }) => (
                                  <em>
                                    {renderMentionsInChildren(children, session.user?.name, group.participants)}
                                  </em>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-foreground/80">
                                    {children}
                                  </blockquote>
                                ),
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors font-medium"
                                  >
                                    {children}
                                  </a>
                                ),
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-3">
                                    <table className="min-w-full text-sm border-collapse">{children}</table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-muted/50">{children}</thead>
                                ),
                                th: ({ children }) => (
                                  <th className="px-3 py-2 text-left font-semibold text-foreground/90 border-b border-border">{children}</th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-3 py-2 text-foreground/80 border-b border-border/50">{children}</td>
                                ),
                                tr: ({ children }) => (
                                  <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-[15px] whitespace-pre-wrap leading-[1.65] text-foreground/95">
                            {renderMentions(msg.content, session.user?.name, group.participants)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Turn Indicator - shows when assistant is active */}
            {(activeStatus || (isLoading && currentlyTyping)) && (
              <TurnIndicator
                activeStatus={activeStatus}
                fallbackText={currentlyTyping}
              />
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Error */}
        {error && (
          <div className="px-6 py-2">
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              {error}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative input-glow rounded-lg">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="h-10 bg-card/50 border-border/50 rounded-lg text-sm"
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={isLoading || !message.trim()}
              className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90"
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - State */}
      <div className="w-[340px] shrink-0 border-l border-border/30 glass-panel relative overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-border/30">
            <h2 className="text-[16px] font-semibold tracking-tight text-foreground">Session State</h2>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4">
              <StatePanel
                canonicalState={group.canonicalState}
                participants={group.participants}
                getParticipantColor={getParticipantColor}
                getInitials={getInitials}
              />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-sm border border-border shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Delete Group</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this group? This action cannot be undone and all messages will be lost.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={deleteGroup}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeleting ? "Deleting..." : "Delete Group"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Section header component for consistency
const SectionHeader = ({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) => (
  <div className="flex items-center gap-3 mb-2">
    <span className={`text-[13px] font-semibold uppercase tracking-[0.08em] ${accent ? 'text-primary' : 'text-foreground/50'}`}>
      {children}
    </span>
    <div className={`flex-1 h-[1px] ${accent ? 'bg-primary/30' : 'bg-border/40'}`} />
  </div>
);

// Next Steps Section - dynamic height showing only open steps, scroll up for completed
function NextStepsSection({
  completedSteps,
  openSteps,
}: {
  completedSteps: string[];
  openSteps: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const openStepsRef = useRef<HTMLDivElement>(null);
  const [openStepsHeight, setOpenStepsHeight] = useState<number | null>(null);

  // Measure open steps height and scroll to bottom
  useEffect(() => {
    if (openStepsRef.current) {
      const height = openStepsRef.current.offsetHeight;
      // Cap at 200px to prevent very long lists
      setOpenStepsHeight(Math.min(height, 200));
    }

    // Scroll to bottom (show open steps)
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [completedSteps.length, openSteps.length, openSteps]);

  const totalCompleted = completedSteps.length;
  const hasCompleted = completedSteps.length > 0;

  return (
    <div>
      <SectionHeader accent>Next Steps</SectionHeader>
      <div
        ref={scrollRef}
        className="overflow-y-auto scrollbar-hide"
        style={{
          maxHeight: openStepsHeight ? `${openStepsHeight}px` : '200px',
          scrollBehavior: "smooth"
        }}
      >
        <div className="space-y-1.5">
          {/* Completed steps - hidden above, scroll up to reveal */}
          {completedSteps.map((step, i) => (
            <div
              key={`completed-${i}`}
              className="flex items-start gap-2 text-[14px] leading-[1.5]"
            >
              <span className="text-foreground/30 text-[13px] w-4 text-right shrink-0 tabular-nums">
                {i + 1}.
              </span>
              <span className="text-foreground/40 line-through">{step}</span>
            </div>
          ))}
          {/* Subtle divider if there are completed steps */}
          {hasCompleted && openSteps.length > 0 && (
            <div className="h-px bg-border/20 my-1" />
          )}
          {/* Open steps - always visible */}
          <div ref={openStepsRef}>
            {openSteps.map((step, i) => (
              <div
                key={`open-${i}`}
                className="flex items-start gap-2 text-[14px] leading-[1.5] py-0.5"
              >
                <span className="text-foreground/50 text-[13px] w-4 text-right shrink-0 tabular-nums">
                  {totalCompleted + i + 1}.
                </span>
                <span className="text-foreground/90">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Turn Indicator Component - shows assistant activity status
function TurnIndicator({
  activeStatus,
  fallbackText,
}: {
  activeStatus: AssistantStatus | null;
  fallbackText: string | null;
}) {
  // Map status type to icon and label
  const getStatusInfo = (type: string) => {
    switch (type) {
      case "thinking":
        return { icon: <BrainIcon />, label: "thinking" };
      case "searching_calendar":
        return { icon: <CalendarIcon />, label: "checking calendar" };
      case "searching_gmail":
        return { icon: <MailIcon />, label: "searching emails" };
      case "searching_web":
        return { icon: <GlobeIcon />, label: "searching web" };
      case "searching_maps":
        return { icon: <MapPinIcon />, label: "searching places" };
      case "writing_response":
        return { icon: <PencilIcon />, label: "writing response" };
      default:
        return { icon: <BrainIcon />, label: "processing" };
    }
  };

  const statusInfo = activeStatus
    ? getStatusInfo(activeStatus.type)
    : { icon: <BrainIcon />, label: "thinking" };

  const displayName = activeStatus?.assistantName || fallbackText || "Assistant";

  return (
    <div className="flex items-center gap-3 animate-message-enter">
      <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-subtle-pulse">
        {statusInfo.icon}
      </div>
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border/50 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "300ms" }} />
        </div>
        <span className="text-sm text-foreground/80">
          <span className="font-medium text-foreground/90">{displayName}</span>
          {" "}
          <span className="text-muted-foreground">{statusInfo.label}...</span>
        </span>
      </div>
    </div>
  );
}

function StatePanel({
  canonicalState,
  participants,
  getParticipantColor,
  getInitials,
}: {
  canonicalState: CanonicalState | null;
  participants: Participant[];
  getParticipantColor: (id: string, role: string) => { bg: string; text: string; border: string };
  getInitials: (name: string) => string;
}) {
  const [constraintsExpanded, setConstraintsExpanded] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(true);

  if (!canonicalState) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-8 h-[2px] bg-primary/40 mb-4" />
        <p className="text-[13px] text-foreground/40 tracking-wide">Awaiting conversation</p>
      </div>
    );
  }

  const sessionConstraints = canonicalState.constraints?.filter((c) => c.source === "session_statement") || [];

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      {canonicalState.leadingOption && (
        <div>
          <SectionHeader accent>Current Plan</SectionHeader>
          {(() => {
            const lines = canonicalState.leadingOption.split("\n").filter(l => l.trim());
            const isBullet = (l: string) => /^[-•]/.test(l.trim());
            const goalLines = [];
            let bulletStart = 0;
            for (let i = 0; i < lines.length; i++) {
              if (isBullet(lines[i])) { bulletStart = i; break; }
              goalLines.push(lines[i]);
              bulletStart = i + 1;
            }
            const bulletLines = lines.slice(bulletStart);
            return (
              <>
                {goalLines.length > 0 && (
                  <p className="text-[14px] leading-[1.6] text-foreground font-medium mb-1">
                    {goalLines.join(" ").replace(/\*\*(.+?)\*\*/g, "$1")}
                  </p>
                )}
                {bulletLines.length > 0 && (
                  <ul className="text-[14px] leading-[1.6] text-foreground space-y-1 list-disc pl-4">
                    {bulletLines.map((line, i) => {
                      const clean = line.replace(/^[-•]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
                      const colonIdx = clean.indexOf(":");
                      if (colonIdx > 0 && colonIdx < 30) {
                        return <li key={i}><span className="font-medium">{clean.slice(0, colonIdx + 1)}</span>{clean.slice(colonIdx + 1)}</li>;
                      }
                      return <li key={i}>{clean}</li>;
                    })}
                  </ul>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Next Steps */}
      {((canonicalState.suggestedNextSteps && canonicalState.suggestedNextSteps.length > 0) ||
        (canonicalState.completedNextSteps && canonicalState.completedNextSteps.length > 0)) && (
        <NextStepsSection
          completedSteps={canonicalState.completedNextSteps || []}
          openSteps={canonicalState.suggestedNextSteps || []}
        />
      )}

      {/* Constraints - Collapsible */}
      {sessionConstraints.length > 0 && (
        <div>
          <button
            onClick={() => setConstraintsExpanded(!constraintsExpanded)}
            className="w-full flex items-center gap-3 text-left group mb-2"
          >
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary group-hover:text-primary/80 transition-colors">
              Constraints
            </span>
            <div className="flex-1 h-[1px] bg-primary/30" />
            <span className="text-foreground/40 group-hover:text-foreground/60 transition-colors flex items-center">
              <ChevronIcon expanded={constraintsExpanded} />
            </span>
          </button>
          {constraintsExpanded && (
            <div className="space-y-3">
              {(() => {
                // Group constraints by participantId
                const grouped = sessionConstraints.reduce((acc, c) => {
                  const key = c.participantId || 'general';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(c);
                  return acc;
                }, {} as Record<string, typeof sessionConstraints>);

                // Convert to title case
                const toTitleCase = (str: string) =>
                  str.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ');

                // Get display name for a participant
                const getDisplayName = (id: string) => {
                  if (id === 'general') return 'General';
                  const participant = participants.find(p =>
                    p.id === id ||
                    p.displayName.toLowerCase() === id.toLowerCase() ||
                    p.displayName.split(' ')[0].toLowerCase() === id.toLowerCase()
                  );
                  const name = participant?.displayName || id;
                  return toTitleCase(name);
                };

                return Object.entries(grouped).map(([participantId, constraints], idx) => (
                  <div key={participantId}>
                    <div className="text-[14px] font-semibold text-foreground/80 mb-1">
                      {getDisplayName(participantId)}
                    </div>
                    <div className="space-y-0.5">
                      {constraints.map((c, i) => {
                        const constraintText = c.constraint.replace(/^[-–—•]\s*/, '').trim();
                        return (
                          <div key={i} className="text-[12px] text-foreground/60 leading-[1.6]">
                            {constraintText}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Participants - Collapsible */}
      <div>
        <button
          onClick={() => setParticipantsExpanded(!participantsExpanded)}
          className="w-full flex items-center gap-3 text-left group mb-2"
        >
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary group-hover:text-primary/80 transition-colors">
            Participants
          </span>
          <div className="flex-1 h-[1px] bg-primary/30" />
          <span className="text-foreground/40 group-hover:text-foreground/60 transition-colors flex items-center">
            <ChevronIcon expanded={participantsExpanded} />
          </span>
        </button>
        {participantsExpanded && (
          <div className="space-y-1">
            {participants.map((p) => {
              const isAI = p.kind === "assistant";
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
                >
                  <Avatar className={`h-6 w-6 border ${isAI ? 'border-primary/30' : 'border-border/50'}`}>
                    {p.image ? <AvatarImage src={p.image} /> : null}
                    <AvatarFallback className={`text-[10px] font-semibold ${isAI ? 'bg-primary/10 text-primary' : 'bg-foreground/10 text-foreground/70'}`}>
                      {getInitials(p.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[15px] text-foreground/90 truncate flex-1">{p.displayName}</span>
                  {isAI && p.hasCalendar && (
                    <span className="text-foreground/40"><CalendarIcon /></span>
                  )}
                  {isAI && p.hasGmail && (
                    <span className="text-foreground/40"><MailIconSmall /></span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
