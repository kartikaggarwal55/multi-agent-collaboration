# Multi-Agent Collaboration System

A multi-assistant group chat where each human participant has their own AI assistant. Unlike a single chatbot, each person gets a dedicated assistant that knows their preferences, has access to their calendar/email, and speaks on their behalf.

## Core Concept

```
┌─────────────────────────────────────────────────────────┐
│                     GROUP CHAT                          │
│                                                         │
│   Kartik ←→ Kartik's Assistant                         │
│   ilisha ←→ ilisha's Assistant                         │
│   (more participants...)                                │
│                                                         │
│   Assistants coordinate WITH EACH OTHER                 │
│   Each assistant ONLY speaks for their owner            │
└─────────────────────────────────────────────────────────┘
```

**Key insight**: Assistants don't talk directly to other humans. If Kartik's Assistant needs something from ilisha, it asks ilisha's Assistant to check with ilisha.

## Features

- **One Assistant Per Person**: Each participant has their own AI that represents only them
- **Calendar & Email Access**: Assistants can check their owner's Google Calendar and Gmail
- **Web Search**: Real-time web search for current information
- **Shared State**: All assistants see and update a common plan state
- **Decision Tracking**: Explicit confirmation required before decisions are finalized
- **Ownership Boundaries**: Strict rules about who can speak for whom

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key
- PostgreSQL database (Neon recommended for Vercel deployment)
- Google OAuth credentials (for calendar/email access)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```bash
cp .env.example .env.local
```

3. Configure environment variables (see Environment Variables section below)

4. Set up the database:
```bash
npx prisma db push
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth.js secret | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | Yes |
| `ASSISTANT_MODEL` | Claude model to use | No (default: `claude-opus-4-5`) |
| `GOOGLE_MAPS_API_KEY` | For places/directions | No |

## Architecture

### System Overview

```
┌──────────────┐     POST /api/groups/[id]/message
│   Browser    │ ──────────────────────────────────→ ┌─────────────────┐
│  (React UI)  │                                     │   API Route     │
│              │ ←─────── SSE Stream ──────────────  │                 │
└──────────────┘                                     └────────┬────────┘
                                                              │
                                                              ↓
                                                     ┌─────────────────┐
                                                     │   Orchestrator  │
                                                     │                 │
                                                     │  For each       │
                                                     │  assistant:     │
                                                     │  - Build prompt │
                                                     │  - Call Claude  │
                                                     │  - Execute tools│
                                                     │  - Save message │
                                                     └────────┬────────┘
                                                              │
                              ┌────────────────────────────────┼────────────────────────────────┐
                              ↓                                ↓                                ↓
                     ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
                     │  Claude API     │              │    Prisma DB    │              │  Google APIs    │
                     │  (Anthropic)    │              │  (PostgreSQL)   │              │ Calendar/Gmail  │
                     └─────────────────┘              └─────────────────┘              └─────────────────┘
```

### The Orchestrator

When a message is sent to the group:

1. **User sends message** → API receives it
2. **For EACH assistant** in the group:
   - Build personalized prompt (with owner's profile, calendar access, etc.)
   - Ask: "Should you respond?"
   - If yes: Generate response
   - If no: Skip turn silently
3. **Save responses** to database
4. **Stream to all participants** via SSE

### Turn-Taking Logic

**RESPOND when:**
- Your owner just spoke (primary responder)
- Another assistant @mentioned you
- You have relevant info that would change the plan

**SKIP when:**
- Not mentioned
- Another assistant already said what you would say
- A human was just asked a question

### The emit_turn Tool

Every assistant response goes through `emit_turn`:

```typescript
emit_turn({
  skip_turn: false,           // Respond or stay silent?
  public_message: "...",      // Message everyone sees
  next_action: "CONTINUE",    // What happens next?
  state_patch: { ... }        // Updates to shared state
})
```

**next_action options:**
| Value | Meaning |
|-------|---------|
| `CONTINUE` | Another assistant should respond (I @mentioned them) |
| `WAIT_FOR_USER` | Waiting for a human to answer |
| `DONE` | Planning is complete |

### Canonical State (Shared Memory)

```typescript
{
  leadingOption: "Jan 9-11 weekend at Tahoe",
  stage: "negotiating" | "searching" | "converged",
  constraints: [
    { owner: "Kartik", text: "prefers South Tahoe" },
    { owner: "ilisha", text: "budget ~$60/night" }
  ],
  pendingDecisions: [
    { topic: "Lodging", status: "awaiting_confirmation",
      confirmationsNeeded: ["Kartik", "ilisha"] }
  ],
  suggestedNextSteps: ["Choose hotel", "Book lift tickets"]
}
```

### Available Tools

**Per-User Tools** (require owner's OAuth):
- `calendar_list_events`, `calendar_create_event` - Google Calendar
- `gmail_search`, `gmail_get_thread` - Gmail search

**Shared Tools**:
- `web_search` - Real-time web search
- `maps_search_places`, `maps_get_directions` - Google Maps
- `date_get_day_of_week`, `date_get_upcoming_weekends` - Date calculations

### Ownership Boundaries

```
✓ Kartik's Assistant CAN:
  - Ask Kartik questions
  - Confirm Kartik's decisions
  - @mention ilisha's Assistant

✗ Kartik's Assistant CANNOT:
  - Ask ilisha questions directly
  - Confirm anything for ilisha
  - Say "booked for everyone" when only Kartik confirmed
```

### Decision Discipline

**Individual decisions** (only affects one person):
- Ask your owner, confirm, done

**Shared decisions** (affects everyone):
1. **GATHER** - Note your owner's preference
2. **COORDINATE** - Ask other assistants about their owner's preferences
3. **FIND OVERLAP** - Search for options that satisfy everyone
4. **PROPOSE** - Present coordinated options
5. **CONFIRM** - Get explicit confirmation from ALL parties

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/agents/group-orchestrator.ts` | Main orchestration, prompts, turn-taking |
| `src/app/api/groups/[groupId]/message/route.ts` | Group chat API endpoint |
| `src/app/api/me/chat/route.ts` | Private 1:1 assistant API |
| `src/lib/agents/calendar-tools.ts` | Google Calendar integration |
| `src/lib/agents/gmail-tools.ts` | Gmail search |
| `src/lib/agents/date-tools.ts` | Reliable date calculations |
| `src/lib/agents/maps-tools.ts` | Google Maps/Places |
| `src/app/groups/[groupId]/page.tsx` | Group chat UI |

## Demo Mode

A simplified demo mode with seeded participants (Alice & Bob) is available for testing without authentication:

1. Go to `/groups`
2. Click the "Demo" button
3. Select a speaker and send messages
4. Watch the assistants collaborate

Demo mode uses in-memory storage and resets on server restart.

## Private Assistant

The `/me/assistant` route provides a 1:1 personal assistant with:
- Calendar and email access
- User profile learning
- Web search
- No coordination needed (single user)

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + PostgreSQL
- Anthropic Claude API
- NextAuth.js
- Google OAuth

## Model

Currently using **Claude Opus 4.5** (`claude-opus-4-5`).

Configurable via `ASSISTANT_MODEL` environment variable.
