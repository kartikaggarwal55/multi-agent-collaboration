# Marketing & Brand Foundation Guide

> **Document purpose:** Single source of truth for all marketing campaigns, ad creatives, and brand communications. Every campaign — paid, organic, partnership, or event — should reference this document for consistency.

---

## 1. Product Identity

### Product Name
**Multi-Agent Collaboration** (working name)

> If the product is renamed, update every section of this document accordingly.

### One-Liner
> Each person gets their own AI assistant that knows them, speaks for them, and coordinates with everyone else's.

### Elevator Pitch (30 seconds)
> Planning something with a group is exhausting — endless back-and-forth, forgotten preferences, scheduling nightmares. Multi-Agent Collaboration gives every participant their own personal AI assistant. Your assistant learns your preferences, checks your calendar, searches your email, and negotiates on your behalf — all while respecting everyone's privacy. Groups align faster because every AI is working in parallel, not waiting on humans to reply.

### Boilerplate (for press, directories, footer copy)
> Multi-Agent Collaboration is a group planning platform where every participant has a dedicated AI assistant. Assistants learn individual preferences, access personal calendars and email, and coordinate with each other to help groups make decisions faster — without anyone having to repeat themselves.

---

## 2. Brand Architecture

### Brand Personality
| Trait | What it means in practice |
|---|---|
| **Intelligent** | We lead with capability, not hype. Show what it does, not what it could theoretically do. |
| **Respectful** | Privacy is a first-class feature, not a footnote. We never oversell access to personal data. |
| **Warm** | Technology that feels human. Ember tones, conversational copy, no corporate stiffness. |
| **Collaborative** | The product is literally about working together. Copy should feel inclusive, never hierarchical. |
| **Effortless** | The whole point is that the hard parts disappear. Messaging should feel light, not labored. |

### Brand Values
1. **Your AI, Your Rules** — Assistants represent their owner and no one else.
2. **Privacy by Default** — Personal data is filtered before it reaches the group.
3. **Faster Together** — Parallel AI coordination beats serial human back-and-forth.
4. **Zero Repetition** — Tell your assistant once. It remembers forever.
5. **Decisions, Not Discussions** — Structured plans replace endless chat threads.

---

## 3. Visual Identity

### 3.1 Color Palette

#### Primary Colors

| Role | OKLCH | Approx Hex | Usage |
|---|---|---|---|
| **Ember Orange** (Primary) | `oklch(0.75 0.14 55)` | `#E8A44A` | CTAs, buttons, badges, key accents |
| **Deep Ink** (Background) | `oklch(0.13 0.01 250)` | `#1A1C24` | Dark mode background, hero sections |
| **Warm Cream** (Light BG) | `oklch(0.98 0.005 85)` | `#FAF8F5` | Light mode background, editorial layouts |
| **Cool Slate** (Secondary) | `oklch(0.22 0.015 250)` | `#2E3140` | Secondary surfaces, cards in dark mode |

#### Supporting Colors

| Role | OKLCH | Approx Hex | Usage |
|---|---|---|---|
| **Foreground (dark)** | `oklch(0.92 0.01 250)` | `#E8E9ED` | Body text on dark backgrounds |
| **Foreground (light)** | `oklch(0.15 0.02 250)` | `#1E2130` | Body text on light backgrounds |
| **Card (dark)** | `oklch(0.16 0.012 250)` | `#222433` | Elevated surfaces in dark mode |
| **Destructive** | `oklch(0.60 0.20 25)` | `#D94F3D` | Errors, destructive actions only |
| **Accent Blue** | `oklch(0.24 0.02 250)` | `#333750` | Subtle accent in dark mode |

#### Chart / Data Visualization Palette

| Name | OKLCH | Approx Hex |
|---|---|---|
| Orange | `oklch(0.75 0.14 55)` | `#E8A44A` |
| Teal | `oklch(0.65 0.12 180)` | `#3DAFA0` |
| Purple | `oklch(0.60 0.10 280)` | `#7E6FB8` |
| Green | `oklch(0.70 0.15 140)` | `#5CB86B` |
| Magenta | `oklch(0.65 0.18 330)` | `#C85A8A` |

#### Color Rules
- **Always** use Ember Orange for primary actions and the most important element on any surface.
- **Never** use Destructive Red for decorative purposes — reserve it strictly for errors.
- Dark mode is the product's default and should be the default for marketing materials.
- Light mode (warm cream) is ideal for editorial content, blog posts, documentation, and print.
- Maintain sufficient contrast ratios (WCAG AA minimum, AAA preferred).

### 3.2 Typography

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| **Display / Hero** | Instrument Serif | Regular, Italic | 30px+ | Used for headlines, hero text. The serif adds editorial warmth. |
| **Body / UI** | Geist | 400–700 | 15px base | Clean geometric sans-serif. Primary text font everywhere. |
| **Monospace** | Geist Mono | 400 | 13–14px | Code snippets, technical specs. |

**Typographic Scale:** Major Third ratio (1.25x) — `12 → 15 → 19 → 24 → 30`

**Type Rules:**
- Headlines: Instrument Serif for warmth, Geist for sharpness. Choose based on context.
- Body: Always Geist. Letter-spacing: `-0.01em`. Line-height: `1.6`.
- Never use more than 2 fonts in a single creative.
- Fallback stack: `system-ui, -apple-system, sans-serif` for sans; `Georgia, serif` for serif.

### 3.3 Logo & Icon

**Primary Mark:** A dual-sparkle icon — two overlapping stars of different sizes, rendered in Ember Orange gradient (`oklch(0.65 0.15 55)` → `oklch(0.60 0.14 50)`). Represents the "multi" in multi-agent: multiple intelligences working together.

**Usage:**
- The sparkle icon is the primary brand mark. Use it as an app icon, favicon, and avatar.
- Pair with the product name in Geist Semi-Bold for a wordmark lockup.
- Minimum size: 24px. Below that, use the icon alone.
- Do not rotate, skew, or apply effects to the icon.
- On dark backgrounds, use the icon at full color. On light backgrounds, the slightly darker primary variant.

**No traditional logo exists yet.** When one is created, add it here and define clear-space rules.

### 3.4 Visual Effects & Texture

| Effect | Description | When to Use |
|---|---|---|
| **Glass panels** | Semi-transparent surfaces with `backdrop-filter: blur(20px)` | Product screenshots, feature callouts |
| **Gradient mesh** | Multi-point radial gradients in muted tones (pink, blue, ember) | Hero backgrounds, landing pages |
| **Noise texture** | Subtle fractal noise overlay at 2.5% opacity | Backgrounds to add depth, prevent flat feel |
| **Ember glow** | Soft orange box-shadow around primary elements | CTAs, focused inputs, hover states |
| **Smooth motion** | `cubic-bezier(0.4, 0, 0.2, 1)` easing, 200–350ms durations | All animations, transitions |

### 3.5 Imagery Guidelines

- **Product screenshots** are the primary visual asset. Always use real UI, never mockups with fake data.
- Show conversations with real-looking messages — not "Lorem ipsum".
- When showing the product, prefer dark mode unless the context is editorial/print.
- Lifestyle photography (if used) should show small groups (2–5 people) in casual planning contexts: around a table, on a couch, at a cafe. Diverse representation is required.
- Never use stock photos of people pointing at screens or shaking hands.
- Illustration style (if used): flat, geometric, warm-toned, minimal. Consistent with the Ember palette.

---

## 4. Brand Voice & Tone

### Voice Attributes

| Attribute | Do | Don't |
|---|---|---|
| **Conversational** | "Your assistant checks your calendar so you don't have to." | "Our proprietary AI agent framework leverages calendar API integration." |
| **Confident** | "Groups plan faster. That's the point." | "We believe our solution could potentially help improve planning efficiency." |
| **Clear** | "Each person gets their own AI." | "Our multi-agent architecture enables per-user intelligent orchestration." |
| **Honest** | "Right now, it works best for groups of 2–10." | "Scales to any size team!" |
| **Warm** | "Tell your assistant once. It remembers." | "Data persistence layer enables long-term preference storage." |

### Tone by Context

| Context | Tone | Example |
|---|---|---|
| **Hero / Landing** | Bold, aspirational, short | "Stop planning. Start deciding." |
| **Feature pages** | Clear, benefit-led | "Your assistant reads your calendar and finds times that work for everyone — without revealing what's on it." |
| **Onboarding / UX** | Friendly, reassuring | "Hi! I'm your assistant. Tell me what you like and I'll remember." |
| **Error states** | Calm, helpful | "Google access expired. Reconnect to keep calendar sync working." |
| **Social media** | Punchy, relatable | "POV: Your friend finally replies 'any day works' and your AI already found the one day that actually does." |
| **Email campaigns** | Personal, direct | "You told your assistant you hate early flights. It remembered." |
| **Technical / Dev** | Precise, respectful of expertise | "Built on Claude claude-opus-4-5 with SSE streaming and per-user tool scoping." |

### Copy Formulas

**Headline pattern:** `[Benefit]. [How].`
- "Faster group decisions. One AI per person."
- "No more scheduling ping-pong. Your assistant handles it."

**Subhead pattern:** `[Pain point] → [Resolution]`
- "Endless group chats → Structured plans with confirmed decisions."
- "Forgotten preferences → An AI that remembers everything you've told it."

**CTA pattern:** Action verb + outcome
- "Start planning together"
- "Create your first group"
- "Get your assistant"

### Words We Use vs. Words We Avoid

| Use | Avoid |
|---|---|
| Assistant | Bot, chatbot, agent (in user-facing copy) |
| Group, team | Users, stakeholders |
| Plan, decide | Optimize, leverage |
| Check, search | Query, fetch, invoke |
| Remember, learn | Store, persist, retain |
| Coordinate | Orchestrate (in user-facing copy) |
| Private, personal | Siloed, sandboxed |
| Fast, instant | Real-time, low-latency |

---

## 5. Key Differentiators

When positioning against competitors, these are the pillars to emphasize:

### 1. One AI Per Person (not one chatbot for everyone)
> Most AI tools give a group one shared bot. We give each person their own. Your assistant knows you — your schedule, your preferences, your constraints — and speaks only for you.

### 2. Privacy by Architecture
> Your assistant can check your calendar and email. Other people's assistants can't. When your AI shares something with the group, it decides what to reveal and what to keep private.

### 3. Parallel Intelligence
> All assistants work at the same time. While one checks flights, another checks calendars, and a third looks up restaurants. No waiting for humans to reply one by one.

### 4. Structured Outcomes
> Conversations turn into structured plans with goals, constraints, pending decisions, and next steps. Not just a chat log — a living document everyone can see.

### 5. Zero Configuration
> Sign in with Google. Create a group. Start planning. Your assistant learns your preferences naturally from conversation — no forms, no setup wizards.

---

## 6. Target Audience

### Primary Persona: "The Organizer"
- **Who:** The person in a friend group, family, or team who ends up planning everything.
- **Age:** 22–40
- **Pain:** Spending hours coordinating schedules, preferences, and logistics across multiple people. Feeling like a human switchboard.
- **Desire:** Something that does the coordination so they can focus on the fun part — deciding.
- **Channels:** Instagram, YouTube, WhatsApp groups, Google Workspace

### Secondary Persona: "The Participant"
- **Who:** Everyone else in the group. They want to contribute but don't want to do the legwork.
- **Pain:** Being asked the same questions repeatedly. Having to check calendars manually. Missing context because they joined the chat late.
- **Desire:** An assistant that already knows their preferences and can answer on their behalf.
- **Channels:** Follows the organizer's lead on tool adoption.

### Tertiary Persona: "The Tech-Forward Professional"
- **Who:** Product managers, startup founders, remote team leads who coordinate across people and time zones.
- **Pain:** Scheduling across time zones, aligning preferences for offsites/team events.
- **Desire:** AI coordination that respects individual context without centralizing all data.
- **Channels:** Twitter/X, LinkedIn, Product Hunt, Hacker News

---

## 7. Eastern Hemisphere & India Marketing Strategy

### 7.1 Market Context: India

India is a high-priority market due to:
- **WhatsApp-native culture**: 500M+ users already plan trips, events, and logistics in group chats. This product is the AI-powered evolution of that behavior.
- **Large group coordination**: Joint family events, friend group trips (Goa, Himachal, Rajasthan), and wedding planning involve 5–20 people with competing schedules.
- **Rising AI adoption**: India is one of the fastest-growing markets for AI tools, with strong English-speaking and multilingual user bases.
- **Price-sensitive but value-driven**: Users will pay for tools that save real time, especially for travel and event planning.

### 7.2 India: Messaging Angles

| Angle | Headline | Why it works |
|---|---|---|
| **Group trip planning** | "Planning a Goa trip in a group chat? Your AI already checked everyone's calendar." | Relatable, specific, immediate. |
| **Wedding coordination** | "50 family members. 10 opinions. 1 assistant per person. 0 arguments." | Weddings are India's highest-stakes coordination problem. |
| **The Organizer fatigue** | "You always plan the trip. Now your AI does it for you." | Every friend group has this person. |
| **WhatsApp upgrade** | "Your group chat, but everyone has an AI that actually helps." | Positions the product as the next evolution. |
| **No more 'let me check'** | "Your assistant already checked your calendar, your budget, and your preferences." | Eliminates the most common group-chat bottleneck. |

### 7.3 India: Channel Strategy

| Channel | Strategy | Budget Priority |
|---|---|---|
| **Instagram Reels / YouTube Shorts** | 15–30 second skits showing group trip planning chaos → resolution with the product. Relatable humor. Hindi + English mix. | High |
| **YouTube** | 3–5 minute product walkthroughs showing a real group planning a Manali trip. Collaboration with travel creators. | High |
| **Twitter/X** | Tech-forward positioning. Launch threads, product updates, "how it works" breakdowns. English. | Medium |
| **LinkedIn** | Targeting startup founders, PMs, remote team leads for professional use cases (offsites, team events). | Medium |
| **WhatsApp Status / Broadcast** | "Try planning your next trip with AI" — link to product. Leverage existing WhatsApp behavior. | Low-cost, High-impact |
| **Product Hunt** | Launch for tech-savvy early adopters. Time for IST-friendly voting window. | Medium (one-time) |
| **Reddit (r/india, r/IndianGaming, r/travel)** | Organic posts showing the product solving real coordination problems. | Low-cost |
| **College campus ambassadors** | Friend-group trip planning is massive among college students. Ambassador programs at IITs, NITs, top private colleges. | Medium |

### 7.4 India: Influencer & Creator Strategy

| Tier | Type | Approach |
|---|---|---|
| **Micro (10K–100K)** | Travel vloggers, "relatable" comedy creators | Sponsored content: "I planned our entire trip using AI" format |
| **Mid (100K–1M)** | Tech reviewers, lifestyle creators | Product deep-dives, honest reviews |
| **Macro (1M+)** | Use only for launch moments | Only if organic fit exists — avoid forced integrations |

**Content Format:** Skit-style content performs best in India. Format: Problem (group chat chaos) → Discovery (the product) → Resolution (plan comes together effortlessly). Punchline delivery in Hinglish.

### 7.5 India: Localization Notes

- **Language:** Launch in English first (India's tech-savvy audience is English-comfortable). Plan Hindi, Tamil, Telugu, Bengali interfaces for scale.
- **Currency:** Show pricing in INR. Consider India-specific pricing tiers.
- **Calendar:** Support Indian holidays and regional festivals in calendar intelligence.
- **Use cases to emphasize:** Diwali planning, Holi trips, weekend getaways (Lonavala, Pondicherry, Coorg), wedding coordination, family reunion planning.
- **Trust signals:** "Your data stays private" messaging is critical. Indian users are increasingly privacy-aware but skeptical of AI data usage. Be explicit.

### 7.6 Southeast Asia & Middle East

| Region | Key Angle | Channel |
|---|---|---|
| **Southeast Asia (SG, MY, ID, PH)** | Group travel planning (Bali, Bangkok, KL). Large friend-group culture. | Instagram, TikTok, Grab/Gojek ecosystem partnerships |
| **Middle East (UAE, SA)** | Family event coordination, luxury travel planning, Ramadan gathering logistics. | Instagram, Snapchat, WhatsApp. Arabic localization critical. |
| **Japan / Korea** | Small-group trip planning, team coordination. Emphasis on UX polish and reliability. | LINE (Japan), KakaoTalk (Korea), Twitter (Japan). Localization essential — English alone won't work. |
| **Australia / NZ** | Friend-group holidays (Bali, Fiji). Casual tone, adventure-oriented. | Instagram, TikTok, Facebook Groups |

### 7.7 India: Paid Advertising Strategy

#### Google Ads
| Campaign Type | Keywords | Landing Experience |
|---|---|---|
| **Search** | "plan group trip online", "AI trip planner", "group travel coordinator", "plan Goa trip with friends" | Feature page → CTA: "Create a group" |
| **Display** | Target travel, lifestyle, tech interest segments | Product screenshot creative with Ember orange CTA |
| **YouTube Pre-roll** | 6-second bumper: "Your group chat. Everyone gets an AI." | Skip to landing page |

#### Meta Ads (Instagram / Facebook)
| Format | Creative | Targeting |
|---|---|---|
| **Reels ads** | 15-sec skit: group chat chaos → AI resolution | 18–35, interests: travel, AI, productivity |
| **Carousel** | Feature walkthrough: Calendar → Preferences → Plan output | Retargeting: site visitors |
| **Stories** | Quick demo GIF with "Swipe up to try" | Lookalike audiences from sign-ups |

#### Budget Allocation (India Launch)
| Channel | % of Budget | Rationale |
|---|---|---|
| Instagram / YouTube | 40% | Highest engagement for demo-able products in India |
| Google Search | 25% | Capture high-intent "plan trip" queries |
| Influencer seeding | 20% | Authentic reach in travel/tech communities |
| Twitter / LinkedIn | 10% | Tech-forward audience, organic amplification |
| Campus programs | 5% | Long-term brand building with core demographic |

---

## 8. Campaign Templates

### 8.1 Product Launch Campaign

**Theme:** "One AI Per Person"

**Hero headline:** "Stop planning. Start deciding."
**Subhead:** "Every person in your group gets their own AI assistant. It knows your preferences, checks your calendar, and speaks for you."
**CTA:** "Create your first group — free"

**Ad variants:**
1. *Problem-led:* "Tired of being the one who plans everything? Your AI does it now."
2. *Curiosity-led:* "What if everyone in your group chat had their own AI?"
3. *Social proof-led:* "X groups planned their trips this week without a single 'let me check my calendar.'"
4. *Feature-led:* "Your assistant checks your calendar, searches flights, and remembers you hate early mornings."

### 8.2 Seasonal Campaign: Summer Travel (India)

**Theme:** "Monsoon Getaway, Zero Planning Headaches"

**Headlines:**
- "Planning a monsoon trip with 8 friends? Your AI already found dates that work for everyone."
- "Coorg or Munnar? Let your assistants figure it out."
- "You said no early flights. Your assistant remembered."

**Visual:** Dark-mode product screenshot showing a group conversation with comparison cards for destinations. Ember orange CTA.

### 8.3 Evergreen Content Themes

| Theme | Content Pieces |
|---|---|
| **"The Organizer"** | Blog: "Why the person who plans everything deserves an AI." Social: Relatable memes about group planning frustration. |
| **"Privacy Matters"** | Blog: "How we keep your calendar private in group planning." Social: Short explainer on the privacy architecture. |
| **"AI That Knows You"** | Blog: "Your assistant gets better every time you talk to it." Social: Before/after showing preference learning. |
| **"Faster Together"** | Blog: "How parallel AI coordination cuts planning time." Social: Side-by-side: old way (20 messages) vs. new way (3 messages). |

---

## 9. Competitive Positioning

### What We Are
- A group coordination platform with per-person AI assistants
- A planning tool that respects individual privacy
- An AI system that gets smarter about each person over time

### What We Are NOT
- A generic chatbot added to a group chat
- A scheduling tool (we do more than find meeting times)
- A travel booking engine (we help decide; booking happens elsewhere)
- A project management tool (we handle planning, not task tracking)

### Competitive Landscape Framing

| Competitor Type | Their Approach | Our Difference |
|---|---|---|
| **ChatGPT / Gemini** | One AI, shared context, no personal data | One AI *per person*, with calendar + email access |
| **Doodle / When2Meet** | Scheduling only | Full coordination: schedules + preferences + research + decisions |
| **TripIt / Wanderlog** | Trip-specific, single-user | Group-first, any planning use case |
| **Notion AI / Slack AI** | AI bolted onto existing tools | AI-native from the ground up, designed for multi-party coordination |

---

## 10. Metrics & KPIs for Marketing

| Metric | What It Measures | Target |
|---|---|---|
| **Sign-ups** | Top-of-funnel acquisition | Track weekly growth rate |
| **Groups created** | Activation — user saw value in creating a group | 40%+ of sign-ups create a group within 7 days |
| **Group invites sent** | Viral coefficient | 2+ invites per group created |
| **Messages per group** | Engagement depth | 20+ messages in first session |
| **Return rate (D7, D30)** | Retention | Track cohort retention curves |
| **Cost per sign-up** | Paid efficiency | Benchmark by channel and region |
| **NPS / qualitative feedback** | Product-market fit signal | Survey after first completed plan |

---

## 11. Asset Checklist

Before launching any campaign, ensure the following assets exist:

- [ ] Product screenshots (dark mode + light mode) at 1x, 2x resolution
- [ ] App icon / favicon exports (16px, 32px, 180px, 512px)
- [ ] Open Graph image (1200x630) with product name + tagline
- [ ] Twitter Card image (1200x600)
- [ ] Short product demo video (30 seconds, no audio dependency — captions required)
- [ ] Long product demo video (2–3 minutes, with voiceover)
- [ ] Slide deck template (Ember palette, Geist + Instrument Serif fonts)
- [ ] Email template (HTML, responsive, dark + light variants)
- [ ] Social media templates (Instagram post, Story, Reel cover)
- [ ] Press kit (logo files, boilerplate, founder bio, screenshots)
- [ ] Ad creative variants (at least 3 per campaign per channel)
- [ ] Landing page with clear CTA and social proof section

---

## 12. Legal & Compliance Notes

- **Data privacy:** Always disclose that the product accesses Google Calendar (read-only) and Gmail (read-only). Users authenticate via Google OAuth and can revoke access at any time.
- **AI disclosure:** In markets where required (EU, potentially India under DPDPA), disclose that responses are AI-generated.
- **Testimonials:** Only use real user feedback. Do not fabricate quotes or statistics.
- **Ad compliance:** Follow platform-specific ad policies (Meta, Google, Twitter). Avoid superlative claims ("best AI", "only platform") unless substantiated.
- **Regional:** For India, comply with DPDPA (Digital Personal Data Protection Act) requirements around consent and data processing disclosure. For Middle East, respect cultural sensitivities in imagery and copy.

---

*This document should be reviewed and updated quarterly, or whenever significant product changes ship. All creative teams, agencies, and contractors should receive the latest version before beginning work.*
