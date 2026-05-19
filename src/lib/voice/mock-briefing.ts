/**
 * Mock briefing data for voice assistant daily briefings.
 * This will be replaced with real data from calendar/email/tasks APIs.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  endTime: string;
  duration: string;
  location?: string;
  attendees?: string[];
  importance: 'high' | 'medium' | 'low';
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  project?: string;
  completed: boolean;
}

export interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  summary: string;
  receivedAt: string;
  requiresResponse: boolean;
  urgent: boolean;
}

export interface WeatherInfo {
  temp: string;
  conditions: string;
  high: string;
  low: string;
}

export interface DailyBriefing {
  date: string;
  dayOfWeek: string;
  events: CalendarEvent[];
  tasks: Task[];
  emails: Email[];
  weather?: WeatherInfo;
  insights: string[];
}

/**
 * Generate mock briefing data for today
 */
export function getMockBriefing(): DailyBriefing {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    dayOfWeek: dayNames[now.getDay()],

    events: [
      {
        id: '1',
        title: 'Team Standup',
        time: '9:00 AM',
        endTime: '9:30 AM',
        duration: '30 min',
        location: 'Zoom',
        attendees: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
        importance: 'medium',
        description: 'Daily sync with the product team'
      },
      {
        id: '2',
        title: 'Product Strategy Review',
        time: '11:00 AM',
        endTime: '12:00 PM',
        duration: '1 hour',
        location: 'Conference Room A',
        attendees: ['David Kim', 'Lisa Park', 'CEO'],
        importance: 'high',
        description: 'Q2 roadmap presentation to leadership'
      },
      {
        id: '3',
        title: 'Lunch with Investor',
        time: '12:30 PM',
        endTime: '2:00 PM',
        duration: '1.5 hours',
        location: 'The Capital Grille',
        attendees: ['Jennifer Walsh - Sequoia'],
        importance: 'high',
        description: 'Series B discussion'
      },
      {
        id: '4',
        title: 'Engineering 1:1 with Alex',
        time: '3:00 PM',
        endTime: '3:30 PM',
        duration: '30 min',
        importance: 'medium'
      },
      {
        id: '5',
        title: 'Yoga Class',
        time: '6:00 PM',
        endTime: '7:00 PM',
        duration: '1 hour',
        location: 'CorePower Yoga',
        importance: 'low'
      }
    ],

    tasks: [
      {
        id: '1',
        title: 'Review and sign Series B term sheet',
        dueDate: 'Today',
        priority: 'urgent',
        project: 'Fundraising',
        completed: false
      },
      {
        id: '2',
        title: 'Prepare Q2 roadmap slides',
        dueDate: 'Today',
        priority: 'high',
        project: 'Product',
        completed: false
      },
      {
        id: '3',
        title: 'Send feedback on design mockups',
        dueDate: 'Today',
        priority: 'high',
        project: 'Product',
        completed: false
      },
      {
        id: '4',
        title: 'Schedule team offsite for next month',
        dueDate: 'This week',
        priority: 'medium',
        project: 'Team',
        completed: false
      },
      {
        id: '5',
        title: 'Review candidate resumes for senior engineer role',
        dueDate: 'This week',
        priority: 'medium',
        project: 'Hiring',
        completed: false
      },
      {
        id: '6',
        title: 'Book flights for conference',
        dueDate: 'Next week',
        priority: 'low',
        project: 'Travel',
        completed: false
      }
    ],

    emails: [
      {
        id: '1',
        from: 'jennifer.walsh@sequoia.com',
        fromName: 'Jennifer Walsh',
        subject: 'Re: Series B - Updated Terms',
        summary: 'Jennifer sent updated term sheet with revised valuation. Needs your review before lunch meeting.',
        receivedAt: '8:15 AM',
        requiresResponse: true,
        urgent: true
      },
      {
        id: '2',
        from: 'david.kim@company.com',
        fromName: 'David Kim',
        subject: 'Strategy Deck - Final Review',
        summary: 'David shared the final version of the strategy deck for the 11 AM meeting. Asking for any last-minute feedback.',
        receivedAt: '7:45 AM',
        requiresResponse: true,
        urgent: false
      },
      {
        id: '3',
        from: 'alex.rivera@company.com',
        fromName: 'Alex Rivera',
        subject: 'Technical Architecture Question',
        summary: 'Alex has questions about the database migration approach. Wants to discuss in your 1:1.',
        receivedAt: 'Yesterday',
        requiresResponse: false,
        urgent: false
      },
      {
        id: '4',
        from: 'notifications@linkedin.com',
        fromName: 'LinkedIn',
        subject: '5 people viewed your profile',
        summary: 'Weekly profile views summary.',
        receivedAt: 'Yesterday',
        requiresResponse: false,
        urgent: false
      },
      {
        id: '5',
        from: 'sarah.chen@company.com',
        fromName: 'Sarah Chen',
        subject: 'Customer feedback compilation',
        summary: 'Sarah compiled feedback from last 10 customer calls. Highlights both positive trends and feature requests.',
        receivedAt: 'Yesterday',
        requiresResponse: false,
        urgent: false
      }
    ],

    weather: {
      temp: '72°F',
      conditions: 'Partly Cloudy',
      high: '78°F',
      low: '62°F'
    },

    insights: [
      "You have 5 meetings today, including 2 high-priority ones.",
      "Your investor lunch with Jennifer Walsh is at 12:30 - remember to review the updated term sheet she sent this morning.",
      "3 tasks are due today, with the term sheet review being most urgent.",
      "You have a 2-hour gap between your last meeting and yoga - good time for deep work.",
      "Alex wants to discuss technical architecture in your 1:1 at 3 PM."
    ]
  };
}

/**
 * Format briefing into a concise summary for system instruction
 */
export function formatBriefingForSystemInstruction(briefing: DailyBriefing): string {
  const lines: string[] = [];

  lines.push(`## Today's Briefing - ${briefing.dayOfWeek}, ${briefing.date}`);

  if (briefing.weather) {
    lines.push(`Weather: ${briefing.weather.temp}, ${briefing.weather.conditions}`);
  }

  lines.push('');
  lines.push('### Schedule');
  for (const event of briefing.events) {
    const importance = event.importance === 'high' ? ' [IMPORTANT]' : '';
    const attendees = event.attendees?.length ? ` (with ${event.attendees.join(', ')})` : '';
    lines.push(`- ${event.time}: ${event.title}${importance}${attendees}`);
  }

  lines.push('');
  lines.push('### Priority Tasks');
  const priorityTasks = briefing.tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  for (const task of priorityTasks) {
    const urgency = task.priority === 'urgent' ? ' [URGENT]' : '';
    const due = task.dueDate ? ` (due: ${task.dueDate})` : '';
    lines.push(`- ${task.title}${urgency}${due}`);
  }

  lines.push('');
  lines.push('### Emails Needing Attention');
  const importantEmails = briefing.emails.filter(e => e.urgent || e.requiresResponse);
  for (const email of importantEmails) {
    const urgent = email.urgent ? ' [URGENT]' : '';
    lines.push(`- From ${email.fromName}: "${email.subject}"${urgent}`);
    lines.push(`  Summary: ${email.summary}`);
  }

  lines.push('');
  lines.push('### Key Insights');
  for (const insight of briefing.insights) {
    lines.push(`- ${insight}`);
  }

  return lines.join('\n');
}

/**
 * Get a single proactive insight to share when user is quiet
 */
export function getProactiveInsight(briefing: DailyBriefing, alreadyCovered: string[]): string | null {
  // Priority order: urgent emails, high-priority meetings coming up, urgent tasks

  // Check for urgent emails not yet covered
  const urgentEmail = briefing.emails.find(
    e => e.urgent && !alreadyCovered.includes(`email-${e.id}`)
  );
  if (urgentEmail) {
    return `You have an urgent email from ${urgentEmail.fromName} about "${urgentEmail.subject}". ${urgentEmail.summary}`;
  }

  // Check for upcoming high-priority meeting
  const now = new Date();
  const currentHour = now.getHours();
  const highPriorityMeeting = briefing.events.find(
    e => e.importance === 'high' && !alreadyCovered.includes(`event-${e.id}`)
  );
  if (highPriorityMeeting) {
    return `You have an important meeting coming up: ${highPriorityMeeting.title} at ${highPriorityMeeting.time}${highPriorityMeeting.attendees?.length ? ` with ${highPriorityMeeting.attendees.join(', ')}` : ''}.`;
  }

  // Check for urgent tasks
  const urgentTask = briefing.tasks.find(
    t => t.priority === 'urgent' && !t.completed && !alreadyCovered.includes(`task-${t.id}`)
  );
  if (urgentTask) {
    return `You have an urgent task: ${urgentTask.title}${urgentTask.dueDate ? ` - due ${urgentTask.dueDate}` : ''}.`;
  }

  // Fall back to insights not yet covered
  for (let i = 0; i < briefing.insights.length; i++) {
    if (!alreadyCovered.includes(`insight-${i}`)) {
      return briefing.insights[i];
    }
  }

  return null;
}
