import type { KnowledgeBaseConfig, KnowledgeBaseFaqItem } from '../types/agent.ts';

export const FAQ_CATEGORIES = [
  'Pricing',
  'Booking',
  'Services',
  'Subjects',
  'Deadlines',
  'Payments',
  'Policies',
  'General',
] as const;

export const DEFAULT_FAQ_ITEMS: KnowledgeBaseFaqItem[] = [
  {
    id: 'faq-pricing',
    category: 'Pricing',
    question: 'How much do you charge for tutoring or coursework guidance?',
    keywords: 'price, pricing, fee, fees, cost, charges, rate, hourly, kitni fee, charges kya hain',
    answer:
      'Our tutoring rates depend on your *subject*, *academic level* (High School, Undergraduate, Master\'s, or PhD), and *session duration or deadline*. Share those three details with me and our academic coordinator will provide an exact tailored quote right away.',
    enabled: true,
  },
  {
    id: 'faq-booking',
    category: 'Booking',
    question: 'How do I book a 1-on-1 session or get matched with a tutor?',
    keywords: 'book, booking, schedule, register, start, trial, how to join, session kaise book karein',
    answer:
      'You can share your *subject*, *level*, and *preferred time/deadline* right here on WhatsApp so I can match you with a specialist, or book directly through our onboarding link: https://university-tutors.com/book',
    enabled: true,
  },
  {
    id: 'faq-subjects',
    category: 'Subjects',
    question: 'Which subjects and academic levels do you cover?',
    keywords: 'subjects, courses, masters, phd, undergraduate, data science, biology, math, computer science, engineering',
    answer:
      'We support High School, Undergraduate, Master\'s, and PhD students across *Biology, Biotechnology, Chemistry, Mathematics, Computer Science, Data Science, Business, Engineering, and Humanities*. Let me know your exact topic so I can confirm specialist availability.',
    enabled: true,
  },
  {
    id: 'faq-urgent',
    category: 'Deadlines',
    question: 'Can you help with urgent deadlines or review my syllabus/assignment brief?',
    keywords: 'urgent, tomorrow, deadline, syllabus, pdf, brief, review, jaldi, file bhejni hai',
    answer:
      'Yes! You can send your *syllabus, rubric, or topic notes* right here as a PDF, Word doc, or clear photo along with your target date, and we will prioritize matching you with an available 1-on-1 tutor for focused guidance and exam/coursework preparation.',
    enabled: true,
  },
];

export const DEFAULT_KB_CONFIG: KnowledgeBaseConfig = {
  agentName: 'Sara',
  businessName: 'University-Tutors',
  website: 'https://university-tutors.com',
  coreServices:
    '1-on-1 online academic tutoring, subject guidance, coursework & exam preparation, thesis/research mentoring',
  subjectsCovered:
    'Biology, Biotechnology, Chemistry, Mathematics, Computer Science, Business, Engineering, Humanities',
  operatingHours:
    '24/7 AI support; live academic coordinators available 9:00 AM – 11:00 PM PKT / EST',
  pricingPolicy:
    "Rates depend on subject level, urgency, and session duration. Collect the client's subject, academic level, and deadline first before quoting or routing for an exact quote.",
  bookingLink: 'https://university-tutors.com/book',
  paymentMethods: 'International card/payment link, bank transfer',
  additionalNotes: '',
  includeHandoffTag: true,
  faqItems: DEFAULT_FAQ_ITEMS,
};

export function findBestMatchingFaq(
  userText: string,
  faqItems?: KnowledgeBaseFaqItem[]
): KnowledgeBaseFaqItem | null {
  if (!userText.trim() || !Array.isArray(faqItems) || faqItems.length === 0) {
    return null;
  }

  const normalizedInput = userText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedInput) return null;

  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did',
    'i', 'you', 'we', 'they', 'my', 'your', 'our', 'me', 'to', 'of', 'in',
    'on', 'at', 'for', 'with', 'about', 'and', 'or', 'can', 'could', 'would',
    'please', 'hi', 'hello', 'hey', 'salam', 'assalam', 'alaikum', 'hai', 'hain',
    'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'kya', 'ap', 'aap', 'mujhe',
  ]);

  const inputWords = new Set(
    normalizedInput
      .split(' ')
      .filter((w) => w.length >= 3 && !stopWords.has(w))
  );

  let bestItem: KnowledgeBaseFaqItem | null = null;
  let bestScore = 0;

  for (const item of faqItems) {
    if (!item.enabled || !item.question.trim() || !item.answer.trim()) continue;

    let score = 0;

    // 1. Check explicit trigger keywords / phrases (strong signal)
    const rawKeywords = (item.keywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length >= 2);

    for (const kw of rawKeywords) {
      if (kw.includes(' ')) {
        if (normalizedInput.includes(kw)) score += 5;
      } else if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalizedInput)) {
        score += 3.5;
      }
    }

    // 2. Check meaningful token overlap with the saved question
    const questionTokens = item.question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    let overlapCount = 0;
    for (const token of new Set(questionTokens)) {
      if (inputWords.has(token)) {
        overlapCount += 1;
      }
    }
    if (questionTokens.length > 0 && overlapCount > 0) {
      score += overlapCount * 1.5 + (overlapCount / new Set(questionTokens).size) * 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 3.5 ? bestItem : null;
}

export function buildSystemPrompt(config: KnowledgeBaseConfig): string {
  const extraSection = config.additionalNotes.trim()
    ? `\n- Notes: ${config.additionalNotes.trim()}`
    : '';

  const enabledFaqs = (config.faqItems || []).filter(
    (item) => item.enabled && item.question.trim() && item.answer.trim()
  );

  const faqSection =
    enabledFaqs.length > 0
      ? `\n\nAPPROVED Q&A BANK (use exact facts, keep reply 1-2 short plain-text lines, max 20 words):
${enabledFaqs
  .map((item, idx) => {
    const kw = item.keywords?.trim() ? ` (${item.keywords.trim()})` : '';
    return `${idx + 1}. Q: ${item.question.trim()}${kw} -> A: ${item.answer.trim()}`;
  })
  .join('\n')}`
      : '';

  const handoffTagLine = config.includeHandoffTag
    ? 'Append [HANDOFF_REQUIRED] at the end only when escalating.'
    : 'Never include bracketed system tags.';

  return `You are ${config.agentName}, a human coordinator at ${config.businessName} (${config.website}) chatting on WhatsApp. Act like a real person—never say or imply that you are an AI, bot, or assistant.

STRICT STYLE & ANTI-REPETITION RULES
- Keep every reply ultra-short: 1-2 brief lines, max 20 words total.
- Plain text only: NO markdown bold (*), italics (_), headings (#), tables, or bullet lists.
- Mirror the client's language naturally (English, Urdu, Roman Urdu, etc.).
- Never repeat the same greeting, hook, link, or phrasing across turns. Read chat history and move the chat forward naturally.
- Ask only ONE direct question or action per message.
- Never invent prices or solve/write full academic answers directly in chat.

HOW TO BUILD THE CHAT STEP BY STEP
1. First contact / hook: Ask what academic problem they need help with today and what subject or deadline they have, using a quick, natural hook.
2. Assignment Tutoring / Online assignments & Homework HELP / Online Quizzes & Assessments / Writing Services / Academic Writing Coach: Ask them to send their file, rubric, prompt, or questions here, and tell them to wait a moment while you check.
3. Coursework Tutoring / Online coursework / Online Classes / Online PhD Classes & Online Classes Management: Ask for the subject and their LMS credentials (plus syllabus/schedule if handy), and tell them to wait a moment while you check.
4. 1-on-1 Live Tutoring / Online exams, tests, midterms & finals / Protected exam: Ask for the subject, topic or exam format, and date/time, and tell them to wait a moment while you check availability.
5. IT Project Assistance: Ask them to share their project details, code/repo, or requirements here, and tell them to wait a moment while you check.
6. If they already sent a file/details, acknowledge briefly and ask only the single next missing detail or tell them to wait a moment while you check.

FALLBACK & ESCALATION
- If they ask for exact pricing, urgent rush timing, a human specialist, refund/billing help, or seem frustrated, set handoffRequired=true and reply:
  "Wait a moment, let me check with my team and get right back to you."
  (Use natural Roman Urdu if they are writing in Roman Urdu.)
- ${handoffTagLine}

VERIFIED FACTS (never invent beyond these)
- Website: ${config.website} | Booking: ${config.bookingLink}
- Services: ${config.coreServices}
- Subjects: ${config.subjectsCovered}
- Hours: ${config.operatingHours} | Payments: ${config.paymentMethods}
- Pricing: ${config.pricingPolicy}${extraSection}${faqSection}`;
}
