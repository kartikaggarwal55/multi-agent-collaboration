# Multi-Agent Collaboration Assistant

A local demo app showcasing visible AI agent teamwork in a shared collaboration room. Two humans (Alice and Bob) work with their personal AI assistants to collaboratively plan and make decisions.

## Features

- **Shared Collaboration Room**: Single room where humans and their AI assistants communicate
- **A2A Collaboration**: After each human message, assistants automatically engage in a 2-round collaboration burst
- **Personal Preferences**: Each assistant advocates for their owner's preferences and constraints
- **State Panel**: Real-time summary of the current decision status, constraints, and next steps
- **Web Search**: Assistants can search the web for current information (if enabled)

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```bash
cp .env.local.example .env.local
```

3. Add your Anthropic API key to `.env.local`:
```
ANTHROPIC_API_KEY=your-api-key-here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Set a Goal**: Enter a collaborative goal like "Plan a low-stress dinner for Friday night"
2. **Send Messages**: Use the speaker dropdown to select Alice or Bob, then type and send a message
3. **Watch Collaboration**: The assistants will automatically respond and coordinate with each other
4. **Track State**: The right panel shows the current decision status and progress

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Required |
| `ASSISTANT_MODEL` | Model for assistant responses | `claude-sonnet-4-5` |
| `SUMMARY_MODEL` | Model for summary generation | `claude-haiku-4-5` |

## Architecture

```
src/
├── app/
│   ├── api/
│   │   └── room/
│   │       ├── route.ts         # GET room state
│   │       └── message/
│   │           └── route.ts     # POST new message
│   └── page.tsx                 # Main UI
├── lib/
│   ├── types.ts                 # Type definitions
│   ├── store.ts                 # In-memory data store
│   └── agents/
│       ├── prompts.ts           # Agent system prompts
│       └── orchestrator.ts      # A2A collaboration logic
└── components/
    └── ui/                      # shadcn/ui components
```

## Seeded Participants

**Humans:**
- **Alice**: Prefers calm/quiet, earlier nights, budget-conscious, vegetarian-friendly
- **Bob**: Social, flexible timing, adventurous food, okay with moderate cost

**Assistants:**
- Alice's Assistant: Advocates for Alice's preferences
- Bob's Assistant: Advocates for Bob's preferences

## Notes

- **Web Search**: The web search tool may require enablement on your Anthropic account. The app gracefully falls back to no web search if unavailable.
- **In-Memory Storage**: All data is stored in memory and resets when the server restarts.
- **Local Demo**: This is designed for local demonstration, not production use.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Anthropic SDK
